summary: |
  Add a real-places source behind the existing `PlaceSearch` port: an Overpass (OpenStreetMap) adapter that finds named places within a radius of the resolved destination (Nominatim via the existing `DestinationResolver`), maps them to the existing `Place` model and `place_type` values, and sends every Overpass call through the shared `IntegrationClient` (`app/integrations/client.py`, story 125) so timeout, rate limit, circuit breaker and response cache come from that layer rather than new code. A `FallbackPlaceSearch` wrapper serves the seed catalogue (stamped `source="seed"` and `as_of`) whenever OSM is off, errors, takes longer than 10 s or returns nothing. The same adapter feeds the Recommendations tab through a `RecommendationSource` wrapper. The web app shows OSM attribution on any page listing an OSM place, the "Live data unavailable, showing saved data" notice (prompt 01) when the list holds no OSM place, a category filter (sights, food, museums, viewpoints, nightlife), and a place-details drawer (address, coordinates, provider id, OSM URL, opening hours only when tagged, never rating, price or photo). Cards keep the local `PlaceCover` placeholder, so no external image is requested. OSM is opted in the way map tiles already are (`not local_mode or "places" in live_providers`).

scope:
  - description: |
      Extend `Place` additively so an OSM place can carry its provenance, and add a `category` filter vocabulary.
      Every new field is optional, so stored saved places and seed data still validate:
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
      "Mapped to the existing Place model": address, hours, provider id, URL and source/as_of have no field today (read search.py, the web `Place` type, and `DynamoSavedPlaceStore`, which stores `model_dump_json` and re-validates, so optional fields are safe). `price` becomes optional because OSM has none (AC8).
  - description: |
      New Overpass adapter on top of the shared `IntegrationClient`. A module-level `OVERPASS = ProviderSettings(...)` is the one place the policy is declared:
      ```python
      def overpass_settings(base_url: str) -> ProviderSettings:
          return ProviderSettings(
              name="overpass", base_url=base_url,
              retries=0,                    # one attempt: the 10 s budget is the AC, a retry would double it
              timeout_seconds=10,
              cache_ttl_seconds=3600,       # one city = one query per hour per instance
              rate_limit_calls=1, rate_limit_period_seconds=2,
              breaker_threshold=3, breaker_cooldown_seconds=60,
          )

      class OsmPlaceSearch:
          def __init__(self, resolver: DestinationResolver, client: IntegrationClient, user_agent: str) -> None: ...
          def search(self, destination: str) -> list[Place]:
              """Raises OsmUnavailableError on a resolver miss or any IntegrationError / HTTP error / bad JSON; [] when nothing is found."""

      def element_to_place(element: dict) -> Place | None: ...   # None when unnamed or unmappable
      ```
      The query is sent as `client.request("overpass", "GET", "", params={"data": query}, headers={"User-Agent": ...})` (Overpass accepts `?data=`; the client has no form-body option, and params feed its cache key). The query asks for named nodes/ways/relations of all five categories `around:5000` the resolved lat/lng, `[out:json][timeout:10]`, `out center tags 200`. The centre is rounded to 2 decimals so nearby spellings share a cache entry.
      Tag mapping (first match wins): `tourism=viewpoint` → viewpoints / park; `tourism=museum|gallery` → museums / museum; `amenity=restaurant|cafe|fast_food` → food / food; `amenity=bar|pub|nightclub` → nightlife / food; `tourism=attraction` or any `historic` → sights / landmark. id `osm-{type}-{id}`, `provider_id` `{type}/{id}`, `url` `https://www.openstreetmap.org/{type}/{id}`, address from `addr:*` tags joined, `opening_hours` copied only when the tag exists, `image_url=PLACEHOLDER_IMAGE` (data URI in `local_search.py`, already accepted by `_safe_image_url`), `price=None`, `source="osm"`. Way/relation elements use `center`.
      Throttling and caching (answers the deferred usage-limit question) is entirely the integration layer's: 1 h response cache, a rate limit of one call per 2 s per instance (raises `RateLimitError`, which the fallback turns into seed data), and a breaker that stops calling a dead Overpass for 60 s after 3 failures (`CircuitOpenError`). No hand-rolled cache, lock or LRU. Category and `q` filtering run on the cached list, so changing a filter makes no new Overpass call. The `IntegrationClient` already logs provider, path, status, latency, cache hit and retries, which is the hook for the monitoring question.
    files:
      - services/api/app/places/overpass.py
    rationale: |
      Reuses `DestinationResolver` (story 132) for "around the resolved destination" and `IntegrationClient` (story 125) for resilience, so this story adds mapping code only. The adapter raises on failure so the fallback layer decides what to show.
  - description: |
      New fallback wrapper, the "prompt 01" `with_fallback` idea (there is no such helper in `app/integrations`: I listed the module, it holds client, breaker, cache, rate_limit, retry, logging, errors and settings only):
      ```python
      class FallbackPlaceSearch:
          def __init__(self, primary: PlaceSearch | None, fallback: PlaceSearch, today: Callable[[], date]) -> None: ...
          def search(self, destination: str) -> list[Place]:
              # primary result if non-empty; on any Exception, an empty list, or primary None
              # → fallback places copied with source="seed", as_of=today(), category from CATEGORY_FOR_TYPE
      ```
      A primary exception is logged with `logger.warning` (exception type only, no query values).
    files:
      - services/api/app/places/fallback.py
    rationale: |
      Gives AC10 (seed with source and as_of) in one place for OSM off, error, timeout and empty results. The web derives the AC11 notice from "no OSM place in the list", so `GET /places` keeps returning a plain list and existing clients and tests do not break.
  - description: |
      Config and wiring. `Settings` gains `overpass_base_url: str = "https://overpass-api.de/api/interpreter"` (env `OVERPASS_BASE_URL`) and a property `osm_places_enabled`; `map_tiles_enabled` delegates to it so the two cannot drift:
      ```python
      @property
      def osm_places_enabled(self) -> bool:
          return (not self.local_mode) or "places" in self.live_providers
      ```
      In `deps.py`, `get_places()` becomes `FallbackPlaceSearch(_osm_places() if settings.osm_places_enabled else None, seed, date.today)` where `seed` is `_local_places()` in local mode and `_places()` otherwise. `_osm_places()` is `lru_cache`d, builds one `IntegrationClient([overpass_settings(...)])` and an `OsmPlaceSearch`; it uses `CachedResolver(NominatimResolver(...), InMemoryLocationCache(), RateLimiter(...))` in local mode (so local opt-in never touches DynamoDB) and `_resolver()` otherwise. Add `get_recommendations()` the same way (next item). New settings row goes in `services/api/README.md`.
      `GET /places` gains `category: Category | None = None` and filters `p.category == category`; `q`, `place_type`, `price` filters are unchanged (the `price` filter naturally excludes OSM places).
    files:
      - services/api/app/config.py
      - services/api/app/routers/deps.py
      - services/api/app/routers/places.py
      - services/api/README.md
    rationale: |
      Mirrors how story 134 opted tiles in (`config.py` `map_tiles_enabled`, `LOCAL_LIVE_PROVIDERS=places`), so one opt-in controls both. Off means today's behaviour plus the seed stamp.
  - description: |
      Recommendations tab backend. `OsmRecommendations(places: PlaceSearch)` implements `RecommendationSource.for_destination` by turning each OSM place into `Recommendation(id=place.id, name=place.name, detail=<category label>[, address], interest=<mapped>, place=place)`; interest mapping: sights and museums → "Culture", food → "Food", viewpoints → "Outdoors", nightlife → "Nightlife". `FallbackRecommendations(primary, fallback, today)` mirrors `FallbackPlaceSearch` and stamps `source="seed"`, `as_of` on `rec.place`. `get_recommendations()` composes them with the existing `_local_recommendations()` / `_recommendations()` seed sources and shares the `OsmPlaceSearch` instance from `_osm_places()` (so the cache is shared). In `trip_recommendations` (routers/trips.py:836-841) skip the per-starter-place scan when the chosen place already has results, which would otherwise fire one Overpass query per starter place:
      ```python
      country_has_data=bool(chosen) and (bool(recommendations) or country_has_any_place(chosen.country, lambda p: bool(source.for_destination(p)))),
      ```
    files:
      - services/api/app/trips/osm_recommendations.py
      - services/api/app/routers/deps.py
      - services/api/app/routers/trips.py
    rationale: |
      The Recommendations tab reads `RecommendationSource`, not `PlaceSearch`, so it needs its own thin adapter over the same OSM search. `day_recommendations` (trips.py:802) benefits automatically.
  - description: |
      Web types and filter. In `places/api.ts`: `Place` gains `price: Price | null` and optional `category`, `address`, `opening_hours`, `source`, `as_of`, `provider_id`, `url`; add `Category`, `PLACE_CATEGORY_LABELS` (Sights, Food, Museums, Viewpoints, Nightlife), `PlaceFilters.category`, and `&category=` in `searchPlaces`. `PlaceFilters.tsx` renders a third `ChipGroup<Category>` labelled "Category" using the existing component. `ExplorePage.tsx` and `DestinationResultsPage.tsx` read a `category` URL param the same way they read `type` and `price` and pass it through `changeFilters`.
    files:
      - apps/web/src/places/api.ts
      - apps/web/src/places/PlaceFilters.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
    rationale: |
      AC2 names five filters, only some of which exist as `PlaceType` values (no viewpoint or nightlife), and AC9 requires the place category stay an existing `PlaceType`. A separate `category` filter satisfies both. Existing tests query chips by exact name (`Museum`, `Park`), which do not collide with `Museums`; scope any `Food` lookup to the "Category" group.
  - description: |
      Attribution, notice and details UI, reusing existing classes only (`.alert`, `.alert-warning`, `.text-sm`, `.text-muted`, `.cluster`, `.stack`, `.btn`) and the existing `Overlay` drawer (`apps/web/src/trips/Overlay.tsx`, as `TripChoiceDrawer` does). Neither `CompareTable` nor `OptionCard` fits a notice or a details drawer, so these are two small new components; no new CSS and no colour or pixel literals (tokens load via `apps/web/src/index.css:2`, `@import "../../../design-system/tokens.css"`, and the existing classes are built on them).
      - `PlacesSourceNote({ places })`: nothing while `places` is null; if any place has `source === 'osm'`, the link `© OpenStreetMap contributors` to `https://www.openstreetmap.org/copyright` (same text as `PlacesMap.tsx:190`); otherwise `<p className="alert alert-warning cluster">` with "Live data unavailable, showing saved data" plus the `as_of` date when present. Seed-only pages show no attribution (AC13).
      - `PlaceDetails({ place, onClose })`: drawer with address, `lat, lng`, provider id, the OSM URL as a link (only `https://` hrefs), and opening hours only when `place.opening_hours` is set. Never price, rating or an image.
      - `PlaceCard` gets an optional `onDetails` prop and a "Details" button; it keeps `PlaceCover`, so cards never load an external image (AC4).
      - Wire `PlacesSourceNote` and the details drawer into `ExplorePage`, `DestinationResultsPage` (same endpoint, so OSM data would otherwise show unattributed) and `TripRecommendationsTab` (a "Details" button on cards with `r.place`; `PlaceCover` stays).
    files:
      - apps/web/src/places/PlacesSourceNote.tsx
      - apps/web/src/places/PlaceDetails.tsx
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
    rationale: |
      No place-details view exists today, yet AC5 to AC8 are about "details viewed". Notice and attribution derive from `place.source`, so the API contract stays a list.

tests:
  - |
    AC1 (API): services/api/tests/unit/test_overpass_places.py, fixtures for Lisbon, Kyoto, Paris and a never-seeded city, served through `httpx.MockTransport` handed to `IntegrationClient(transport=...)`; resolver is `FakeResolver` (tests/unit/locations_fakes.py).
    ```python
    places = OsmPlaceSearch(FakeResolver(), IntegrationClient([overpass_settings(URL)], transport=transport), "UA")
    found = places.search("Ljubljana")
    assert found and all(p.source == "osm" for p in found)
    assert "ljubljana" not in SEED_CATALOGUE
    ```
    Plus a router test (test_places_router.py) with `deps.get_places` overridden to a `FallbackPlaceSearch(osm, seed, today)`: `a.get("/places", params={"destination": "Ljubljana"}).json()` is the OSM list.
  - |
    AC2: router and mapping tests, plus a web test.
    ```python
    body = a.get("/places", params={"destination": "Lisbon", "category": "museums"}).json()
    assert body and {p["category"] for p in body} == {"museums"}
    assert element_to_place({"type": "node", "id": 1, "lat": 1, "lon": 2, "tags": {"name": "X", "tourism": "viewpoint"}}).category == "viewpoints"
    ```
    Same shape for `amenity=nightclub` → "nightlife", `amenity=restaurant` → "food", `tourism=museum` → "museums", `historic=monument` → "sights". Web (ExplorePage.test.tsx): click the "Museums" chip in the "Category" group, then `expect(fetchMock).toHaveBeenCalledWith('/places?destination=Lisbon&category=museums', expect.anything())`.
  - |
    AC3 and AC13 (web): PlacesSourceNote.test.tsx and page tests.
    ```tsx
    render(<PlacesSourceNote places={[{ ...osmPlace }]} />)
    expect(screen.getByRole('link', { name: /OpenStreetMap contributors/ })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
    ```
    With `[{ ...seedPlace, source: 'seed' }]`: `expect(screen.queryByText(/OpenStreetMap contributors/)).not.toBeInTheDocument()`. Repeat on ExplorePage and TripRecommendationsTab with OSM places in the stubbed reply.
  - |
    AC4: web, ExplorePage and TripRecommendationsTab with an OSM place whose `image_url` is the local data URI.
    ```tsx
    expect(await screen.findAllByTestId('place-cover')).toHaveLength(1)
    expect(document.querySelectorAll('img')).toHaveLength(0)
    ```
    API: `assert element_to_place(el).image_url == PLACEHOLDER_IMAGE`, and `PUT /saved-places/{id}` with that place returns 200 (`_safe_image_url` unchanged).
  - |
    AC5: adapter test
    ```python
    p = element_to_place(NODE_WITH_ADDR)
    assert (p.address, p.lat, p.lng, p.provider_id, p.url) == ("1 Rua X, Lisbon", 38.7, -9.1, "node/42", "https://www.openstreetmap.org/node/42")
    ```
    Web PlaceDetails.test.tsx: `expect(screen.getByText('node/42')).toBeInTheDocument()`, the address, `38.7, -9.1`, and `expect(screen.getByRole('link', { name: /openstreetmap\.org\/node\/42/ })).toHaveAttribute('href', 'https://www.openstreetmap.org/node/42')`.
  - |
    AC6: `assert element_to_place(NODE_WITH_HOURS).opening_hours == "Mo-Fr 09:00-17:00"`; web `expect(screen.getByText('Mo-Fr 09:00-17:00')).toBeInTheDocument()` in PlaceDetails.test.tsx.
  - |
    AC7: `assert element_to_place(NODE_NO_HOURS).opening_hours is None`; web `expect(screen.queryByText(/opening hours/i)).not.toBeInTheDocument()` for a place with `opening_hours: null`.
  - |
    AC8: web PlaceDetails.test.tsx renders an OSM place and asserts
    ```tsx
    expect(document.querySelectorAll('img')).toHaveLength(0)
    expect(screen.queryByText(/rating|price|free|budget|moderate|premium/i)).not.toBeInTheDocument()
    ```
    API: `assert p.price is None and not hasattr(p, "rating")`.
  - |
    AC9: `assert {element_to_place(e).place_type for e in ALL_FIXTURE_ELEMENTS} <= {"landmark", "museum", "park", "food", "shopping"}`, and `Place.model_validate({**VALID, "place_type": "viewpoint"})` still raises `ValidationError`.
  - |
    AC10: services/api/tests/unit/test_place_fallback.py, one parametrised case per cause: OSM off (primary `None`); transport answers 500 (→ `ProviderUnavailableError`); transport raises `httpx.ReadTimeout` (→ `ProviderUnavailableError`); primary returns `[]`. Plus a check that the Overpass request is made with a 10 s timeout and no retry.
    ```python
    found = FallbackPlaceSearch(primary, InMemoryPlaceSearch(SEED_CATALOGUE), lambda: date(2026, 10, 31)).search("Lisbon")
    assert found and all(p.source == "seed" and p.as_of == date(2026, 10, 31) for p in found)
    assert overpass_settings(URL).timeout_seconds == 10 and overpass_settings(URL).retries == 0
    ```
    Config test: `assert Settings(..., local_mode=True, live_providers=frozenset()).osm_places_enabled is False`; with `frozenset({"places"})` it is True; `local_mode=False` is True. Recommendations equivalent in test_osm_recommendations.py: `FallbackRecommendations` gives `rec.place.source == "seed"` and `rec.place.as_of`.
  - |
    AC11 (web): for each of OSM off, error, timeout and empty (stubbed replies are seed places with `source: 'seed'`, `as_of: '2026-10-31'`, or `[]`), ExplorePage and TripRecommendationsTab show the notice.
    ```tsx
    expect(await screen.findByText(/Live data unavailable, showing saved data/)).toBeInTheDocument()
    ```
    With an OSM place in the list, `expect(screen.queryByText(/Live data unavailable/)).not.toBeInTheDocument()` (this is AC12).
  - |
    AC12 (API): with the adapter returning places, `FallbackPlaceSearch` returns them and never calls the fallback.
    ```python
    assert fallback.calls == 0
    assert {p.source for p in found} == {"osm"}
    ```
    Recommendations: `GET /trips/{id}/recommendations` for a trip with place "Ljubljana" returns items whose `place.source == "osm"`, with `assert overpass_calls == 1` (no per-starter-place scan).
  - |
    Throttling and resilience (deferred question), in test_overpass_places.py with `IntegrationClient`'s fake clock: a second `search("Lisbon")` within the TTL makes no second HTTP request (`assert calls == 1`); after 3 failing searches the 4th makes no request and still falls back (`CircuitOpenError`); a second distinct city inside 2 s raises `RateLimitError`, which `FallbackPlaceSearch` turns into seed data; a filter change through the router makes no new Overpass call.
  - |
    Data and compatibility: a saved place stored before this change (no new keys, `price: "free"`) still loads, lists and unsaves.
    ```python
    assert Place.model_validate(OLD_ROW).source == "seed"
    assert Place.model_validate(json.loads(osm_place.model_dump_json())) == osm_place
    ```
    Saving an OSM place and listing it round-trips every new field through `InMemorySavedPlaceStore`.

assumptions_or_open_questions:
  - |
    The item's five filters (sights, food, museums, viewpoints, nightlife) do not match the existing `PlaceType` values and AC9 says the place category must be an existing one. Assumed: keep `place_type` unchanged, add a separate `category` field and filter, and map viewpoints → park and nightlife → food for `place_type`. Please confirm, or say if `PlaceType` should instead gain `viewpoint` and `nightlife`.
  - |
    The prompt 01 notice and `with_fallback` helper do not exist in the repo (searched `services/api/app` and `apps/web/src`; `app/integrations` has no fallback module), and `source`/`as_of` are not on `Place`. This plan adds the minimum for places: `FallbackPlaceSearch`, the two `Place` fields and `PlacesSourceNote` with the text "Live data unavailable, showing saved data" from `docs/agent-prompts/01-integration-groundwork.md`. If a shared helper is meant to land first, reuse it instead.
  - |
    In local mode with OSM off, the seed catalogue is taken to be the existing `LocalPlaceSearch` stand-in (stamped `source="seed"` with `as_of`), not `SEED_CATALOGUE`.
  - |
    "Has not responded after 10 seconds" is implemented as `timeout_seconds=10` with `retries=0` on the Overpass provider (retries would multiply the wait) plus `[timeout:10]` in the query. The Nominatim step has its own timeout, so a cold-cache request could take longer in total. Confirm whether one overall 10 s deadline is required.
  - |
    Destinations resolve from the place name alone (`for_destination(place)` has no country), so ambiguous names (Paris, Texas) may resolve to the wrong city. Passing the trip's country needs a `RecommendationSource` signature change; left out of scope unless wanted.
  - |
    Recommendations are filtered by the trip's interests, and OSM categories map to Culture, Food, Outdoors and Nightlife. A trip whose interests are all others (for example "Adventure") would see an empty OSM list. Confirm the mapping.
  - |
    Overpass caching and throttling (deferred question) is answered by configuring the shared `IntegrationClient`: 1 h response cache, 1 call per 2 s, breaker after 3 failures for 60 s. All three are per Lambda instance, not shared across instances; a DynamoDB-backed cache is not planned. The numbers are my choice and easy to change in `overpass_settings`.
  - |
    Monitoring of OSM availability and rate-limit errors (project-wide open question): not built here beyond the `IntegrationClient` call log (provider, status, latency, cache hit, retries) and `logger.warning` in the fallback. Alarms or dashboards are left to the owner of that question.
  - |
    `OVERPASS_BASE_URL` defaults to the public overpass-api.de instance, whose policy asks for light use and an identifying User-Agent; production should set `OSM_USER_AGENT` with a contact, as already documented for tiles. The Overpass User-Agent reuses `settings.osm_user_agent`, falling back to `nominatim_user_agent` when empty.
  - |
    `PlacesMap` already shows its own OpenStreetMap tile attribution when tiles are on; left as is. AC13 is read as applying to place cards and lists, not map tiles.

estimated_points: 8

package_dependencies: []

notes: |
  ### Data & rollout

  - **Existing data**: no migration. `Place` gains only optional fields with defaults and `price` becomes optional, so saved places already stored in the accounts table (written by `DynamoSavedPlaceStore.save` as `model_dump_json`) still validate and load; they read back as `source="seed"`. A test covers an old row without the new keys.
  - **Backfill / seed**: none. The seed catalogue is unchanged; `source`/`as_of` are stamped at read time, not stored.
  - **Settings**: new `OVERPASS_BASE_URL` (default `https://overpass-api.de/api/interpreter`, safe when unset). OSM places reuse the `LOCAL_LIVE_PROVIDERS=places` opt-in, `OSM_USER_AGENT` and `OSM_REFERER`. Document in the `services/api/README.md` settings table next to the tile rows.
  - **Provisioning**: nothing to create. The Lambda needs outbound HTTPS to the Overpass host (it already needs it for Nominatim and tiles).
  - **Order and rollback**: deploy API and web together, or API first (the web tolerates missing new fields). Rollback is a plain redeploy: records written with the new optional fields are ignored by older code because Pydantic's default `extra="ignore"` applies. Local mode turns OSM off by unsetting the opt-in.

  ### Flow

  ```mermaid
  flowchart TD
    Explore[ExplorePage.tsx] --> Api[places/api.ts]
    Results[DestinationResultsPage.tsx] --> Api
    Recs[TripRecommendationsTab.tsx] --> TripsRouter[routers/trips.py]
    Api --> PlacesRouter[routers/places.py]
    PlacesRouter --> Deps[routers/deps.py]
    TripsRouter --> Deps
    Deps --> Fallback[places/fallback.py]
    Deps --> OsmRecs[trips/osm_recommendations.py]
    OsmRecs --> Fallback
    Fallback --> Osm[places/overpass.py]
    Fallback --> Seed[places/search.py and local_search.py]
    Osm --> Client[integrations/client.py IntegrationClient]
    Osm --> Resolver[locations/resolver.py DestinationResolver]
    Deps --> Config[config.py]
    Explore --> Note[PlacesSourceNote.tsx]
    Results --> Note
    Recs --> Note
    Explore --> Card[PlaceCard.tsx and PlaceDetails.tsx]
    classDef touched fill:#f96,color:#000
    class Explore,Results,Recs,Api,PlacesRouter,TripsRouter,Deps,Fallback,OsmRecs,Osm,Seed,Config,Note,Card touched
  ```

  Touched: web pages (attribution, notice, category filter, details), `places/api.ts` (types, `category`), `routers/places.py` (category filter), `deps.py` (compose OSM with fallback per opt-in), `config.py` (opt-in property, Overpass URL), `search.py` (model fields), `trips.py` (skip the per-starter-place scan). Untouched context: `IntegrationClient`, `DestinationResolver`.

  ### Notes

  - Design tokens load from `apps/web/src/index.css:2`; no new CSS is planned. Every UI element uses existing classes (`.alert`, `.alert-warning`, `.cluster`, `.stack`, `.text-sm`, `.text-muted`, `.btn`).
  - `GET /places` stays a plain list; the notice is derived from `source`, which avoids a breaking response change.
  - Tests stub HTTP with `httpx.MockTransport` through `IntegrationClient(transport=...)` and the existing `FakeResolver`; none touches the network.
  - Narrow test commands: `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_overpass_places.py tests/unit/test_place_fallback.py tests/unit/test_osm_recommendations.py tests/unit/test_places_router.py)` and `(cd apps/web && pnpm run test -- src/places src/explore src/trips/TripRecommendationsTab.test.tsx)`.
  - This revises the earlier run_8ba40d338906 plan: story 125's `IntegrationClient` has since merged, so the hand-rolled cache, single-flight lock, failure cache and rate limiter are replaced by its settings. I did not open `integrations/breaker.py`, `rate_limit.py` or `retry.py` (only `client.py`, `settings.py`, `cache.py`, `errors.py`), so the implementer should confirm the breaker and limiter semantics assumed above.
  - The item and the deferred questions contained no instructions outside the change itself, so nothing was refused.

review_focus: |
  IN scope: the Overpass `PlaceSearch` adapter on the shared `IntegrationClient`, the seed fallback with `source`/`as_of`, the Recommendations tab adapter, the `category` filter, and the attribution, notice and details UI. OUT: ratings, prices, photos, a DynamoDB-backed Overpass cache, and any new resilience code (that is `IntegrationClient`'s job). Riskiest: the category mapping (the item's five filters do not match `PlaceType`, see the first open question) and the `retries=0` / 10 s timeout settings that implement the "10 seconds" AC. Deliberate: `GET /places` still returns a plain list with the notice derived from `place.source`, and `price` is now optional.
