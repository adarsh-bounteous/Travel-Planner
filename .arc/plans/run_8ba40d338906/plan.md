summary: |
  Add a real-places source behind the existing `PlaceSearch` port: an Overpass (OpenStreetMap) adapter that finds named places within a radius of the resolved destination (Nominatim via the existing `DestinationResolver`), maps them to the existing `Place` model and `place_type` values, and is wrapped in a fallback that serves the seed catalogue (stamped `source="seed"` and `as_of`) whenever OSM is off, errors, takes longer than 10 s or returns nothing. The same adapter feeds the Recommendations tab through a `RecommendationSource` wrapper. The web app shows OSM attribution on any page listing an OSM place, the "Live data unavailable, showing saved data" notice (prompt 01) when the list holds no OSM place, a category filter (sights, food, museums, viewpoints, nightlife), and a place-details drawer (address, coordinates, provider id, OSM URL, opening hours only when tagged, never rating, price or photo). Cards keep the local `PlaceCover` placeholder, so no external image is ever requested. OSM is opted in the same way map tiles already are (`not local_mode or "places" in live_providers`).

scope:
  - description: |
      Extend `Place` additively so an OSM place can carry its provenance, and add a `category` filter vocabulary.
      Before → after of the model (every new field optional, so stored saved places and seed data still validate):
      ```python
      Category = Literal["sights", "food", "museums", "viewpoints", "nightlife"]
      Source = Literal["seed", "osm"]

      class Place(BaseModel):
          id: str
          name: str
          image_url: str
          place_type: PlaceType
          price: Price | None = None      # was required; OSM has no price
          lat: float
          lng: float
          category: Category | None = None
          address: str | None = None
          opening_hours: str | None = None
          source: Source = "seed"
          as_of: date | None = None       # set on seed places served as a fallback
          provider_id: str | None = None  # "node/123"
          url: str | None = None          # https://www.openstreetmap.org/node/123
      ```
      Also add `CATEGORY_FOR_TYPE = {"landmark": "sights", "museum": "museums", "food": "food", "park": "viewpoints"}` so seed places can be filtered by category in the fallback (shopping has none).
    files:
      - services/api/app/places/search.py
    rationale: |
      The item says "mapped to the existing Place model": address, hours, provider id, URL and source/as_of have no field today (I read search.py, the web `Place` type and `DynamoSavedPlaceStore`, which stores `model_dump_json` and re-validates, so optional fields are safe). `price` becomes optional because OSM has none (AC8); the web never renders it on cards.
  - description: |
      New Overpass adapter. `OverpassClient` posts one query per city (all five categories at once, `around:5000` the resolved lat/lng, named elements only, `out center tags 200`, `[timeout:10]`, httpx timeout 10 s, `User-Agent` from `settings.osm_user_agent`). `OsmPlaceSearch` implements `PlaceSearch`:
      ```python
      class OsmPlaceSearch:
          def __init__(self, resolver: DestinationResolver, client: OverpassClient,
                       clock: Callable[[], float] = time.monotonic,
                       ttl: float = 3600, failure_ttl: float = 60, max_entries: int = 200) -> None: ...
          def search(self, destination: str) -> list[Place]:
              """Raises OsmUnavailableError on resolver miss, HTTP/timeout/parse error; [] when nothing is found."""
      def element_to_place(element: dict) -> Place | None: ...   # tag mapping, None when unnamed or unmappable
      ```
      Tag mapping (first match wins): `tourism=viewpoint` → viewpoints / park; `tourism=museum|gallery` → museums / museum; `amenity=restaurant|cafe|fast_food` → food / food; `amenity=bar|pub|nightclub` → nightlife / food; `tourism=attraction` or any `historic` → sights / landmark. id `osm-{type}-{id}`, `provider_id` `{type}/{id}`, `url` `https://www.openstreetmap.org/{type}/{id}`, address from `addr:*` tags joined, `opening_hours` copied only when the tag exists, `image_url=PLACEHOLDER_IMAGE` (the existing data URI from `local_search.py`, which `_safe_image_url` already accepts), `price=None`, `source="osm"`. Way/relation elements use `center`.
      Throttling and caching (answers the deferred usage-limit question): results are cached per rounded centre (1 h TTL, bounded LRU), one in-flight request per key (lock), failures cached for 60 s so a dead Overpass is not retried by every page view, and calls go through the existing `RateLimiter` from `app/locations/resolver.py` with a 2 s minimum interval. Category and `q` filtering happen on the cached list, so changing a filter never makes a new Overpass call.
    files:
      - services/api/app/places/overpass.py
    rationale: |
      One query per city keeps within Overpass fair-use limits and makes filtering instant. Reuses `DestinationResolver` (story 132, 30-day cached Nominatim) for "around the resolved destination" rather than a second geocoder. The adapter raises on failure so the fallback layer decides what to show.
  - description: |
      New fallback wrapper, the "prompt 01" `with_fallback` idea (that helper does not exist in the repo yet, I searched `services/api/app` for `with_fallback`, `as_of` and `app/integrations`, so this adds only the minimum for places):
      ```python
      class FallbackPlaceSearch:
          def __init__(self, primary: PlaceSearch | None, fallback: PlaceSearch, today: Callable[[], date]) -> None: ...
          def search(self, destination: str) -> list[Place]:
              # primary result if non-empty; on any Exception, or an empty list, or primary None
              # → fallback places copied with source="seed", as_of=today(), category from CATEGORY_FOR_TYPE
      ```
      A primary exception is logged with `logger.warning` (type only, no query values).
    files:
      - services/api/app/places/fallback.py
    rationale: |
      Gives AC10 (seed with source and as_of) in one place for OSM off, error, timeout and empty results; the web derives the AC11 notice from "no OSM place in the list", so `GET /places` keeps returning a plain list and existing clients and tests do not break.
  - description: |
      Config and wiring. `Settings` gains `overpass_base_url: str = "https://overpass-api.de/api/interpreter"` (env `OVERPASS_BASE_URL`) and a property `osm_places_enabled` with the same rule as tiles; `map_tiles_enabled` delegates to it so the two cannot drift:
      ```python
      @property
      def osm_places_enabled(self) -> bool:
          return (not self.local_mode) or "places" in self.live_providers
      ```
      In `deps.py`, `get_places()` becomes `FallbackPlaceSearch(_osm_places() if settings.osm_places_enabled else None, seed, today)` where `seed` is `_local_places()` in local mode and `_places()` otherwise. `_osm_places()` is `lru_cache`d and builds its own `CachedResolver(NominatimResolver(...), InMemoryLocationCache(), RateLimiter(...))` when `settings.local_mode` (so local opt-in never touches DynamoDB) and reuses `_resolver()` otherwise. Add `get_recommendations()` the same way (see next item). New settings rows go in `services/api/README.md`.
      `GET /places` gains `category: Category | None = None` and filters `p.category == category`; the existing `q`, `place_type`, `price` filters are unchanged (`price` filter naturally excludes OSM places, which have none).
    files:
      - services/api/app/config.py
      - services/api/app/routers/deps.py
      - services/api/app/routers/places.py
      - services/api/README.md
    rationale: |
      Mirrors how story 134 opted tiles in (`config.py` `map_tiles_enabled`, `LOCAL_LIVE_PROVIDERS=places`), so one opt-in controls both. Off means exactly today's behaviour plus the seed stamp.
  - description: |
      Recommendations tab backend. `OsmRecommendations(places: PlaceSearch)` implements `RecommendationSource.for_destination(destination)` by turning each OSM place into `Recommendation(id=place.id, name=place.name, detail=<category label>[, address], interest=<mapped>, place=place)` with the interest mapping sights/museums → "Culture", food → "Food", viewpoints → "Outdoors", nightlife → "Nightlife". `FallbackRecommendations(primary, fallback, today)` mirrors `FallbackPlaceSearch` and stamps `source="seed"`, `as_of` on `rec.place`. `get_recommendations()` in `deps.py` composes them with the existing seed/local sources. In `trip_recommendations` (routers/trips.py) change the country check so a place with results does not trigger a per-starter-place scan, which would otherwise fire one Overpass query per starter place:
      ```python
      country_has_data=bool(chosen) and (bool(recommendations) or country_has_any_place(chosen.country, lambda p: bool(source.for_destination(p)))),
      ```
    files:
      - services/api/app/trips/osm_recommendations.py
      - services/api/app/routers/deps.py
      - services/api/app/routers/trips.py
    rationale: |
      The Recommendations tab reads `RecommendationSource`, not `PlaceSearch`, so it needs its own thin adapter over the same OSM search (and shares its cache). `day_recommendations` benefits automatically. The negative cache in `OsmPlaceSearch` keeps the remaining scan cheap when Overpass is down.
  - description: |
      Web types and filter. In `places/api.ts`: `Place` gains `price: Price | null` and optional `category`, `address`, `opening_hours`, `source`, `as_of`, `provider_id`, `url`; add `Category`, `PLACE_CATEGORY_LABELS` (Sights, Food, Museums, Viewpoints, Nightlife), `PlaceFilters.category`, and `&category=` in `searchPlaces`. `PlaceFilters.tsx` renders a third `ChipGroup<Category>` labelled "Category" using the existing component. `ExplorePage.tsx` and `DestinationResultsPage.tsx` read a `category` URL param the same way they read `type` and `price` and pass it through `changeFilters`.
    files:
      - apps/web/src/places/api.ts
      - apps/web/src/places/PlaceFilters.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
    rationale: |
      AC2 names five filters, only some of which exist as `PlaceType` values (no viewpoint or nightlife), and AC9 requires the place category stay an existing `PlaceType`. A separate `category` filter satisfies both. Existing tests query chips by exact name (`Museum`, `Park`), which do not collide with `Museums`; the implementer must scope any `Food` lookup to the "Category" group.
  - description: |
      Attribution, notice and details UI, reusing existing classes only (`.alert`, `.alert-warning`, `.text-sm`, `.text-muted`, `.cluster`, `.stack`, `.btn`) and the existing `Overlay` drawer (`apps/web/src/trips/Overlay.tsx`, as `TripChoiceDrawer` does). Neither `CompareTable` nor `OptionCard` fits, so these are small new components, no new CSS and no colour or pixel literals (tokens load via `apps/web/src/index.css:2`, `@import "../../../design-system/tokens.css"`; the existing classes already use them).
      - `PlacesSourceNote({ places })`: renders nothing while `places` is null; if any place has `source === 'osm'` renders the attribution link `© OpenStreetMap contributors` to `https://www.openstreetmap.org/copyright` (same text as `PlacesMap.tsx:190`); otherwise renders `<p className="alert alert-warning cluster">` with "Live data unavailable, showing saved data" plus the `as_of` date when present. Seed-only pages show no attribution (AC13).
      - `PlaceDetails({ place, onClose })`: drawer with address, `lat, lng`, provider id, the OSM URL as a link (only `https://` hrefs), and opening hours only when `place.opening_hours` is set. It never renders price, rating or an image.
      - `PlaceCard` gets an optional `onDetails` prop and a "Details" button; `PlaceCard` keeps using `PlaceCover`, so cards never load an external image (AC4).
      - Wire `PlacesSourceNote` and the details drawer into `ExplorePage`, `DestinationResultsPage` (it lists the same endpoint, so OSM data would otherwise appear there unattributed) and `TripRecommendationsTab` (which also gets a "Details" button on cards with `r.place`; `PlaceCover` stays).
    files:
      - apps/web/src/places/PlacesSourceNote.tsx
      - apps/web/src/places/PlaceDetails.tsx
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
    rationale: |
      No place-details view exists today, yet AC5 to AC8 are about "details viewed". The notice and attribution are derived from `place.source` so the API contract stays a list.

tests:
  - |
    AC1 (API, adapter): services/api/tests/unit/test_overpass_places.py, recorded-style fixtures for Lisbon, Kyoto, Paris and a never-seeded city ("Ljubljana"), through `httpx.MockTransport`; resolver is `FakeResolver`.
    ```python
    places = OsmPlaceSearch(FakeResolver(), OverpassClient(base_url, "UA", client=client_returning(LJUBLJANA)))
    found = places.search("Ljubljana")
    assert found and all(p.source == "osm" for p in found)
    assert "Ljubljana" not in SEED_CATALOGUE
    ```
    Also a router test (test_places_router.py) with `deps.get_places` overridden to a `FallbackPlaceSearch(osm, seed, today)`: `a.get("/places", params={"destination": "Ljubljana"}).json()` is the OSM list.
  - |
    AC2: router and adapter tests for the category filter, plus a web test.
    ```python
    body = a.get("/places", params={"destination": "Lisbon", "category": "museums"}).json()
    assert body and {p["category"] for p in body} == {"museums"}
    ```
    Mapping unit tests: `element_to_place({"type":"node","id":1,"lat":1,"lon":2,"tags":{"name":"X","tourism":"viewpoint"}}).category == "viewpoints"`, and the same for `amenity=nightclub` → "nightlife", `amenity=restaurant` → "food", `tourism=museum` → "museums", `historic=monument` → "sights". Web (ExplorePage.test.tsx): click the "Museums" chip in the "Category" group and `expect(fetchMock).toHaveBeenCalledWith('/places?destination=Lisbon&category=museums', expect.anything())`.
  - |
    AC3 and AC13 (web): `PlacesSourceNote.test.tsx` and page tests.
    ```tsx
    render(<PlacesSourceNote places={[{ ...osmPlace }]} />)
    expect(screen.getByRole('link', { name: /OpenStreetMap contributors/ })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
    ```
    and with `[{ ...seedPlace, source: 'seed' }]`: `expect(screen.queryByText(/OpenStreetMap contributors/)).not.toBeInTheDocument()`. Repeat on ExplorePage and TripRecommendationsTab with OSM places in the stubbed reply.
  - |
    AC4 (web): ExplorePage and TripRecommendationsTab with an OSM place whose `image_url` is the local data URI:
    ```tsx
    expect(await screen.findAllByTestId('place-cover')).toHaveLength(1)
    expect(document.querySelectorAll('img')).toHaveLength(0)
    ```
    API: `assert element_to_place(el).image_url == PLACEHOLDER_IMAGE` and saving that place through `PUT /saved-places/{id}` returns 200 (`_safe_image_url` unchanged).
  - |
    AC5 (API and web): adapter test
    ```python
    p = element_to_place(NODE_WITH_ADDR)
    assert (p.address, p.lat, p.lng, p.provider_id, p.url) == ("1 Rua X, Lisbon", 38.7, -9.1, "node/42", "https://www.openstreetmap.org/node/42")
    ```
    Web `PlaceDetails.test.tsx`: `expect(screen.getByText('node/42')).toBeInTheDocument()`, address, `38.7, -9.1`, and `expect(screen.getByRole('link', { name: /openstreetmap\.org\/node\/42/ })).toHaveAttribute('href', 'https://www.openstreetmap.org/node/42')`.
  - |
    AC6: `assert element_to_place(NODE_WITH_HOURS).opening_hours == "Mo-Fr 09:00-17:00"` and web `expect(screen.getByText('Mo-Fr 09:00-17:00')).toBeInTheDocument()` in `PlaceDetails.test.tsx`.
  - |
    AC7: `assert element_to_place(NODE_NO_HOURS).opening_hours is None` and web `expect(screen.queryByText(/opening hours/i)).not.toBeInTheDocument()` for a place with `opening_hours: null`.
  - |
    AC8: web `PlaceDetails.test.tsx` renders an OSM place and asserts
    ```tsx
    expect(document.querySelectorAll('img')).toHaveLength(0)
    expect(screen.queryByText(/rating|price|free|budget|moderate|premium/i)).not.toBeInTheDocument()
    ```
    API: `assert p.price is None and not hasattr(p, "rating")`.
  - |
    AC9: `assert {element_to_place(e).place_type for e in ALL_FIXTURE_ELEMENTS} <= {"landmark", "museum", "park", "food", "shopping"}` and `Place.model_validate(...)` still rejects `place_type="viewpoint"`.
  - |
    AC10: services/api/tests/unit/test_place_fallback.py, one parametrised case per cause (OSM off = primary `None`; client raises `httpx.HTTPStatusError`; client raises `httpx.ReadTimeout`; primary returns `[]`), plus a check that the Overpass request uses a 10 s timeout.
    ```python
    found = FallbackPlaceSearch(primary, InMemoryPlaceSearch(SEED_CATALOGUE), lambda: date(2026, 10, 31)).search("Lisbon")
    assert found and all(p.source == "seed" and p.as_of == date(2026, 10, 31) for p in found)
    assert client_timeout == 10
    ```
    Config test: `Settings(local_mode=True, live_providers=frozenset()).osm_places_enabled is False`; with `{"places"}` it is True; `local_mode=False` is True. Recommendations equivalent in test_osm_recommendations.py (`FallbackRecommendations` stamps `rec.place.source == "seed"` and `as_of`).
  - |
    AC11 (web): for each of OSM off, error, timeout and empty (stubbed replies are seed places with `source: 'seed'`, `as_of: '2026-10-31'`, or `[]`), ExplorePage and TripRecommendationsTab show the notice.
    ```tsx
    expect(await screen.findByText(/Live data unavailable, showing saved data/)).toBeInTheDocument()
    ```
    and with an OSM place in the list `expect(screen.queryByText(/Live data unavailable/)).not.toBeInTheDocument()` (that case is AC12).
  - |
    AC12 (API): with the adapter returning places, `FallbackPlaceSearch` returns them, the fallback is never called, and `{p.source for p in found} == {"osm"}`:
    ```python
    assert fallback.calls == 0
    assert [p.name for p in found] == ["Mercado da Ribeira"]
    ```
    Recommendations: `GET /trips/{id}/recommendations` for a trip with place "Ljubljana" returns items whose `place.source == "osm"`, and `status == "ready"` without any call per starter place (`assert overpass_calls == 1`).
  - |
    Throttling and failure paths (deferred question): second `search("Lisbon")` within the TTL makes no second HTTP request; a failed call is not retried within 60 s (`assert calls == 1` after two failing searches); a fake clock past the TTL refetches; a filter change in the router makes no new Overpass call.
  - |
    Data and compatibility: a saved place stored before this change (no `category`, `source`, `address`, `provider_id`, `url`, `as_of` keys, with `price: "free"`) still loads, lists and unsaves: `Place.model_validate(OLD_ROW).source == "seed"`; saving an OSM place and listing it round-trips every new field (`InMemorySavedPlaceStore` and the Dynamo JSON path via `Place.model_validate(json.loads(p.model_dump_json()))`).

assumptions_or_open_questions:
  - |
    The item's five filters (sights, food, museums, viewpoints, nightlife) do not match the existing `PlaceType` values and AC9 says the place category must be an existing one. Assumed: keep `place_type` unchanged, add a separate `category` field and filter, and map viewpoints → park and nightlife → food for `place_type`. Please confirm, or say if `PlaceType` should instead gain `viewpoint` and `nightlife`.
  - |
    The prompt 01 notice, `with_fallback`, `source`/`as_of` fields and the integration client do not exist in the repo (searched `services/api/app` and `apps/web/src`). This plan adds only the minimum for places: `FallbackPlaceSearch`, `source`/`as_of` on `Place`, and a `PlacesSourceNote` notice with the text "Live data unavailable, showing saved data" taken from `docs/agent-prompts/01-integration-groundwork.md`. If prompt 01 is meant to land first, rebase onto it and reuse its helper.
  - |
    In local mode with OSM off, the seed catalogue is taken to be the existing `LocalPlaceSearch` stand-in (stamped `source="seed"` with `as_of`), not `SEED_CATALOGUE`.
  - |
    "Has not responded after 10 seconds" is implemented as a 10 s httpx timeout plus `[timeout:10]` in the Overpass query. The Nominatim step has its own 10 s timeout, so a cold-cache request could wait longer in total. Confirm whether a single overall 10 s deadline is required.
  - |
    Destinations are resolved from the place name alone (`for_destination(place)` has no country), so ambiguous names (Paris, Texas) may resolve to the wrong city. Passing the trip's `country` would need a signature change on `RecommendationSource`; left out of scope unless you want it.
  - |
    Recommendations are filtered by the trip's interests, and OSM categories map to the interests Culture, Food, Outdoors and Nightlife. A trip whose interests are all others (for example "Adventure") would see an empty OSM list. Confirm the mapping.
  - |
    Overpass caching and throttling (deferred question): answered in this plan with a per-city 1 h in-memory cache, single-flight, a 60 s failure cache and a 2 s minimum interval. It is per Lambda instance, not shared; a DynamoDB-backed cache is not planned.
  - |
    Monitoring of OSM availability and rate-limit errors (project-wide open question) is not planned beyond `logger.warning` on failures; a status page belongs to prompt 01's provider registry.
  - |
    `OVERPASS_BASE_URL` defaults to the public overpass-api.de instance, whose usage policy asks for light use and an identifying User-Agent; production should set `OSM_USER_AGENT` with a contact, as already documented for tiles.
  - |
    `PlacesMap` already shows its own OpenStreetMap tile attribution when tiles are on; that is left as is, so a seed-only page with real tiles may still show tile attribution. AC13 is read as applying to place cards and lists, not the map tiles.

estimated_points: 8

package_dependencies: []

notes: |
  ### Data & rollout

  - **Existing data**: no migration. `Place` gains only optional fields with defaults, and `price` becomes optional, so saved places already stored in the accounts table (written by `DynamoSavedPlaceStore.save` as `model_dump_json`) still validate and load; they read back as `source="seed"`. A test covers an old row without the new keys.
  - **Backfill / seed**: none. The seed catalogue is unchanged and is stamped at read time, not stored.
  - **Settings**: new `OVERPASS_BASE_URL` (default `https://overpass-api.de/api/interpreter`, safe when unset). OSM places reuse the existing `LOCAL_LIVE_PROVIDERS=places` opt-in, `OSM_USER_AGENT` and `OSM_REFERER`. Document in the `services/api/README.md` settings table (next to the rows at lines 25 to 28).
  - **Provisioning**: nothing to create. The Lambda needs outbound HTTPS to the Overpass host (it already needs it for Nominatim and tiles).
  - **Order and rollback**: deploy API and web together or API first (the web tolerates missing new fields). Rollback is a plain redeploy: records written with the new optional fields are ignored by older code only if it tolerates extra keys, so Pydantic's default `extra="ignore"` applies and nothing breaks. Switching OSM off is also instant by unsetting the opt-in (local) or reverting.

  ### Flow

  ```mermaid
  flowchart TD
    Explore[ExplorePage.tsx] --> Api[places/api.ts]
    Results[DestinationResultsPage.tsx] --> Api
    Recs[TripRecommendationsTab.tsx] --> TripsApi[trips/api.ts fetchTripRecommendations]
    Api --> PlacesRouter[routers/places.py]
    TripsApi --> TripsRouter[routers/trips.py]
    PlacesRouter --> Deps[routers/deps.py get_places]
    TripsRouter --> Deps2[routers/deps.py get_recommendations]
    Deps --> Fallback[places/fallback.py]
    Deps2 --> OsmRecs[trips/osm_recommendations.py]
    OsmRecs --> Fallback
    Fallback --> Osm[places/overpass.py]
    Fallback --> Seed[places/search.py InMemoryPlaceSearch / local_search.py]
    Osm --> Resolver[locations/resolver.py DestinationResolver]
    Osm --> Model[places/search.py Place]
    Deps --> Config[config.py osm_places_enabled]
    Explore --> Note[PlacesSourceNote.tsx]
    Results --> Note
    Recs --> Note
    Explore --> Card[PlaceCard.tsx + PlaceDetails.tsx]
    classDef touched fill:#f96,color:#000
    class Explore,Results,Recs,Api,PlacesRouter,TripsRouter,Deps,Deps2,Fallback,OsmRecs,Osm,Model,Config,Note,Card touched
  ```

  Touched nodes: web pages (attribution, notice, category filter, details), `places/api.ts` (types, `category` param), `routers/places.py` (category filter), `deps.py` (compose OSM with fallback, per opt-in), `config.py` (opt-in property, Overpass URL), `search.py` (model fields), `trips.py` (avoid a per-starter-place scan). Untouched context: `DestinationResolver`, `InMemoryPlaceSearch`, `LocalPlaceSearch`, `trips/api.ts`.

  ### Notes

  - Design tokens load from `apps/web/src/index.css:2`; no new CSS is planned. Every UI element uses existing classes (`.alert`, `.alert-warning`, `.cluster`, `.stack`, `.text-sm`, `.text-muted`, `.btn`), which are built on the tokens.
  - `GET /places` stays a plain list. The notice is derived from `source`, which avoids a breaking response change.
  - Tests stub HTTP with `httpx.MockTransport` and the existing `FakeResolver` (`tests/unit/locations_fakes.py`); no test touches the network.
  - Narrow test commands: `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_overpass_places.py tests/unit/test_place_fallback.py tests/unit/test_osm_recommendations.py tests/unit/test_places_router.py)` and `(cd apps/web && pnpm run test -- src/places src/explore src/trips/TripRecommendationsTab.test.tsx)`.
  - The item and the deferred questions contained no instructions outside the change itself, so nothing was refused.

review_focus: |
  IN scope: the Overpass `PlaceSearch` adapter, the seed fallback with `source`/`as_of`, the Recommendations tab adapter, the `category` filter, the attribution, notice and details UI. OUT: the full prompt 01 integration layer, ratings, prices, photos, and any DynamoDB-backed Overpass cache. The riskiest parts are the category mapping (the item's five filters do not match `PlaceType`, see the first open question) and the cache/throttle and single-flight code in `overpass.py`. Deliberate: `GET /places` still returns a plain list, with the notice derived from `place.source`, and `price` is now optional.
