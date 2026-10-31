summary: |
  Add an OpenStreetMap (Overpass) `PlaceSearch` adapter so Explore and the trip Recommendations tab list real places for any city when OSM is opted in. The adapter searches around the destination's resolved coordinates, by category (sights, food, museums, viewpoints, nightlife), and maps results onto the existing `Place` model and the existing five place types. It adds address, coordinates, opening hours when tagged, provider id and OSM URL, and never a rating, price or photo; images stay the local placeholder. A new `GET /places/results` endpoint wraps the adapter in a fallback: when OSM is off, errors, takes over 10 seconds or returns nothing, it serves the seed catalogue stamped with `source` and `as_of`, and the web shows the "Live data unavailable, showing saved data" notice. OSM attribution shows on any page that shows an OSM place. The prompt 01 groundwork (opt-in, notice, source/as_of fallback) is NOT in the repo, so this plan builds the minimum of it that this story needs.
scope:
  - description: |
      Settings and opt-in. Add to `Settings` (all safe when unset):
      ```python
      live_providers: frozenset[str] = frozenset()   # env LIVE_PROVIDERS, comma-separated; only "osm" is known
      overpass_base_url: str = "https://overpass-api.de/api/interpreter"  # env OVERPASS_BASE_URL
      overpass_user_agent: str = "trip-planner-api"  # env OVERPASS_USER_AGENT
      ```
      `get_settings()` parses LIVE_PROVIDERS (strip, casefold, drop blanks) and raises `MissingSettingError`-style refusal for an unknown name, the way LOCAL_MODE refuses bad values. Works in and outside local mode.
    files:
      - services/api/app/config.py
      - docs/local-setup.md
    rationale: |
      AC1 and AC10 need an "OSM is opted in / off" switch, and `LOCAL_LIVE_PROVIDERS` from prompt 01 does not exist yet (searched the repo for it). One setting that works in both modes keeps "off = exactly as today".
  - description: |
      Extend the `Place` model and port (backwards compatible; all new fields have defaults).
      ```python
      Category = Literal["sights", "food", "museums", "viewpoints", "nightlife"]
      class Place(BaseModel):
          ...
          price: Price | None = None            # was required; OSM has none
          source: Literal["seed", "osm"] = "seed"
          as_of: date | None = None
          address: str | None = None
          opening_hours: str | None = None
          provider_id: str | None = None        # e.g. "node/123"
          provider_url: str | None = None       # https://www.openstreetmap.org/node/123
      class PlaceSearch(Protocol):
          def search(self, destination: str, category: Category | None = None,
                     location: ResolvedLocation | None = None) -> list[Place]: ...
      ```
      Add `SEED_AS_OF: date` and have `_place()` stamp `source="seed", as_of=SEED_AS_OF`. Add `CATEGORY_PLACE_TYPES: dict[Category, frozenset[PlaceType]]` (sights to landmark, museums to museum, food to food, viewpoints to park, nightlife to food). `InMemoryPlaceSearch` and `LocalPlaceSearch` accept the two new optional args; they filter by category through `CATEGORY_PLACE_TYPES` and ignore `location`.
    files:
      - services/api/app/places/search.py
      - services/api/app/places/local_search.py
    rationale: |
      AC9 requires existing categories only, so `place_type` stays the five existing values; the five story filters are a query-time `Category` that selects OSM tags and maps back onto them. Saved places store the `Place` snapshot (DynamoDB and local file), so new fields must default.
  - description: |
      New `OverpassPlaceSearch` adapter, mirroring `NominatimResolver` (injectable HTTP callable, never raises, logs a warning).
      ```python
      class OverpassPlaceSearch:
          def __init__(self, base_url: str, user_agent: str, resolver: DestinationResolver,
                       http_post: Callable[..., httpx.Response] = httpx.post,
                       limiter: RateLimiter | None = None, cache: TtlCache | None = None,
                       now: Callable[[], datetime] = ...) -> None: ...
          def search(self, destination, category=None, location=None) -> list[Place]:
              # raises OverpassUnavailable on error/timeout/bad JSON; [] when nothing found
      ```
      Behaviour: centre = `location` or `resolver.resolve(None, None, destination)`; none gives []. Query `[out:json][timeout:9]; (nwr["tourism"="museum"]["name"](around:5000,lat,lng); ...); out center 60;` built from a `CATEGORY_TAGS` table (sights: tourism=attraction, historic=monument|castle|memorial|ruins; museums: tourism=museum|gallery; food: amenity=restaurant|cafe|fast_food|food_court; viewpoints: tourism=viewpoint; nightlife: amenity=bar|pub|nightclub; no category = union). `httpx` timeout is 10 s. Elements map to `Place(id=f"osm-{type}-{id}", image_url=PLACEHOLDER_IMAGE, source="osm", as_of=today, provider_id=f"{type}/{id}", provider_url=f"https://www.openstreetmap.org/{type}/{id}", address=joined addr:* tags or None, opening_hours=tags.get("opening_hours"), price=None, lat/lng from the element or its `center`)`; nameless elements and ones with no coordinates are dropped; `place_type` comes from the tags.
      Throttling and caching (answers the deferred usage-limit question): a process-local TTL cache (24 h, max 256 entries, key = rounded centre to 2 dp + category) holding NON-empty results only, plus the existing `RateLimiter` (`app/locations/resolver.py`) with a 1 s minimum interval before each upstream call. Failures are never cached.
    files:
      - services/api/app/places/overpass.py
      - services/api/tests/fixtures/overpass/lisbon.json
      - services/api/tests/fixtures/overpass/unseeded_city.json
      - services/api/tests/fixtures/overpass/empty.json
    rationale: |
      AC1-9 and the 10 s limit. Reuses the resolver port, `RateLimiter` and `PLACEHOLDER_IMAGE` rather than re-implementing them. Fixtures are hand-built in the Overpass JSON shape (this plan makes no outside request); label them as such.
  - description: |
      Fallback wrapper and the results endpoint.
      ```python
      class PlacesResult(BaseModel):
          places: list[Place]
          source: Literal["osm", "seed"]
          as_of: date | None
          fallback: bool      # True whenever the list is not live OSM data: drives the notice
      def places_with_fallback(live: PlaceSearch | None, seed: PlaceSearch, destination: str,
                               category: Category | None, location: ResolvedLocation | None) -> PlacesResult
      ```
      `live is None` (OSM off), any exception, a timeout or `[]` all return the seed places with `fallback=True`, `source="seed"`, `as_of=SEED_AS_OF`. Otherwise `source="osm"`, `fallback=False`. New route `GET /places/results?destination=&q=&category=&place_type=&price=` in `routers/places.py` (reuses the existing `_fold` name filter and the other filters). The existing `GET /places` (used by the destinations page) is left untouched.
      In `deps.py`: add `get_live_places()` (an `OverpassPlaceSearch` when "osm" is in `settings.live_providers`, else None) and have `get_destination_resolver()` return the real cached Nominatim resolver, backed by `InMemoryLocationCache` rather than the Dynamo cache, when local mode is on and "osm" is opted in (today local mode always gets `NoResolver`, which would make every opted-in local search fall back).
    files:
      - services/api/app/places/live.py
      - services/api/app/routers/places.py
      - services/api/app/routers/deps.py
    rationale: |
      AC10-13. A new endpoint avoids changing the `GET /places` list shape that existing tests and the destinations page rely on.
  - description: |
      Recommendations tab. `GET /trips/{id}/recommendations` takes `category: Category | None = None` and returns `TripRecommendations` with new `source`, `as_of` and `fallback` fields. When OSM is opted in it calls `places_with_fallback(..., destination=chosen.place, location=trip.location)` and, for an OSM result, maps each place to `Recommendation(id=place.id, name=place.name, detail=<category label>, interest=None, place=place)`; the trip-interest filter applies only to the seed path. Otherwise (OSM off or fallback) it keeps today's `source.for_destination(...)` flow, filtered by `CATEGORY_PLACE_TYPES` when a category is given, with `fallback=True`, `source="seed"`, `as_of=SEED_AS_OF`. `destination_status` still uses place data from the chosen path.
    files:
      - services/api/app/routers/trips.py
      - services/api/app/trips/recommendations.py
    rationale: |
      AC1, 2, 10-12 on the Recommendations tab. It uses `trip.location` (set by story 132), so the city is the trip's resolved one.
  - description: |
      Saved-place validation for OSM snapshots. In `save_place`, bound `address` and `opening_hours` (300 chars) and `provider_id`, and require `provider_url` to start with `https://www.openstreetmap.org/`. `_safe_image_url` is unchanged.
    files:
      - services/api/app/routers/saved_places.py
    rationale: |
      The snapshot is client-supplied and rendered later; the new text fields need the same bounds as the existing ones, and the image rule must stay as it is.
  - description: |
      Web data layer. In `places/api.ts`: extend `Place` (`price?: Price | null`, `source`, `as_of`, `address`, `opening_hours`, `provider_id`, `provider_url`); add `Category`, `CATEGORY_LABELS` (Sights, Food, Museums, Viewpoints, Nightlife), `PlacesResult` and `searchPlaceResults(destination, q, {category, placeType, price})` calling `/places/results`. In `trips/api.ts` add `source`, `as_of`, `fallback` and the `category` param to `TripRecommendations` / `fetchTripRecommendations`.
    files:
      - apps/web/src/places/api.ts
      - apps/web/src/trips/api.ts
    rationale: |
      Types and calls for AC1-2, 10-12.
  - description: |
      Web components, styled only with existing design-system classes and tokens (`.alert alert-warning`, `.badge`, `.stack`, `.cluster`, `.text-sm`, `.text-muted`, `var(--space-2)`, `var(--color-fg-muted)`); no colour or pixel literals. Tokens are already loaded by `apps/web/src/index.css:2` (`@import "../../../design-system/tokens.css"`). New: `LiveDataNotice` ("Live data unavailable, showing saved data", `AlertIcon`), `OsmAttribution` ("© OpenStreetMap contributors" linking to https://www.openstreetmap.org/copyright), `PlaceDetails` (address, `lat, lng`, provider id, OSM link, opening hours only when present; no rating, price or photo; renders only for `source === "osm"`). Modified: `PlaceCard` gets a Details toggle that renders `PlaceDetails`; `PlaceFilters.tsx` exports its existing `ChipGroup` so the category chips reuse it (no new chip component); the Price chip group is hidden when the shown places are OSM.
    files:
      - apps/web/src/places/LiveDataNotice.tsx
      - apps/web/src/places/OsmAttribution.tsx
      - apps/web/src/places/PlaceDetails.tsx
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/places/PlaceFilters.tsx
    rationale: |
      AC3-8, 11, 13. The catalogue holds only `CompareTable` and `OptionCard`, and neither fits, so these small new pieces are needed. The existing `PlaceCard`, `PlaceCover` (local gradient, never `image_url`) and `ChipGroup` are reused.
  - description: |
      Wire the pages. `ExplorePage` calls `searchPlaceResults`, adds the category chip group (`?category=` URL param, validated against `CATEGORY_LABELS`), shows `LiveDataNotice` when `fallback`, shows `OsmAttribution` when any listed place has `source === "osm"`, and lists the seed `as_of` date when seed. `TripRecommendationsTab` does the same with its own details-capable card (it keeps its current interest chips for the seed path and adds the category chips). Attribution is never shown for a seed place.
    files:
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
    rationale: |
      AC1-3, 10-13 on the two named screens.
tests:
  - |
    AC1 (API adapter, services/api/tests/unit/test_overpass_search.py), written first. With a fake `http_post` returning `fixtures/overpass/unseeded_city.json` and a `FakeResolver` giving a centre for a city absent from `SEED_CATALOGUE`:
    ```python
    places = OverpassPlaceSearch("http://x", "ua", resolver, http_post=fake).search("Tromsø")
    assert places and all(p.source == "osm" for p in places)
    ```
    Also an endpoint test in test_places_results_router.py: `a.get("/places/results", params={"destination": "Tromsø"}).json()["source"] == "osm"` with the live dependency overridden.
  - |
    AC2. The adapter sends only the chosen category's tags, and the endpoint returns only that category:
    ```python
    OverpassPlaceSearch(...).search("Lisbon", category="museums")
    assert 'tourism"="museum' in fake.last_query and 'amenity"="bar' not in fake.last_query
    assert {p.place_type for p in places} == {"museum"}
    ```
    The fallback path is tested too: `category=food` on the seed list returns only `food` places.
  - |
    AC3 and AC13 (vitest, ExplorePage.test.tsx and TripRecommendationsTab.test.tsx). With an OSM result: `expect(screen.getByRole('link', { name: /openstreetmap/i })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')`. With a seed result: `expect(screen.queryByText(/openstreetmap/i)).not.toBeInTheDocument()`.
  - |
    AC4. `assert all(p.image_url == PLACEHOLDER_IMAGE for p in places)` in the adapter test, plus a vitest check that `PlaceCard` renders `data-testid="place-cover"` and no `<img>` for an OSM place. A saved-places test also checks that saving an OSM `Place` with the placeholder image returns 200 and one with `http://...` is still 422.
  - |
    AC5. Adapter mapping test: `assert (p.address, p.lat, p.lng, p.provider_id, p.provider_url) == ("Rua Augusta 1, 1100-053 Lisboa", 38.7, -9.1, "node/1", "https://www.openstreetmap.org/node/1")`. Vitest: after clicking `Details`, `PlaceDetails` shows the address, `38.7, -9.1`, `node/1` and a link whose href is the OSM URL.
  - |
    AC6 and AC7. Adapter: `assert by_id["osm-node-1"].opening_hours == "Mo-Fr 09:00-18:00"` and `assert by_id["osm-node-2"].opening_hours is None`. Vitest: `expect(screen.getByText('Mo-Fr 09:00-18:00')).toBeInTheDocument()` for the first; `expect(screen.queryByText(/opening hours/i)).not.toBeInTheDocument()` for the second.
  - |
    AC8. `assert p.price is None` for every OSM place, and `assert not hasattr(p, "rating")`. Vitest: `PlaceDetails` for an OSM place has no text matching /rating|price|photo/i and no `<img>`.
  - |
    AC9. `assert {p.place_type for p in all_places} <= {"landmark", "museum", "park", "food", "shopping"}` over the Lisbon fixture, which holds one element for each of the five categories.
  - |
    AC10 and AC11 (test_places_with_fallback.py, parametrised). The four cases are live=None, a live search that raises `OverpassUnavailable`, an `httpx.ReadTimeout` from `http_post`, and an `[]` result:
    ```python
    result = places_with_fallback(live, seed, "Lisbon", None, None)
    assert result.source == "seed" and result.fallback is True and result.as_of == SEED_AS_OF
    assert [p.name for p in result.places] == [p.name for p in SEED_CATALOGUE["lisbon"]]
    ```
    Adapter: `assert httpx.Client`-style call is made with `timeout == 10`. Vitest: whenever `fallback` is true, `expect(screen.getByText(/live data unavailable, showing saved data/i)).toBeInTheDocument()` on both Explore and the Recommendations tab, and the seed `as_of` date is shown. The recommendations endpoint gets the same four cases.
  - |
    AC12. `assert result.source == "osm" and result.fallback is False and [p.name for p in result.places] == ["Time Out Market", ...]` when the live search returns places, and the seed catalogue names are absent. Vitest: no `LiveDataNotice` when `fallback` is false.
  - |
    Throttling, caching and settings. A second identical search makes one upstream call (`assert len(fake.calls) == 1`); an empty result and a failure are not cached; the limiter's `sleep` is called when two different cities are searched back to back. `get_settings()` with `LIVE_PROVIDERS=osm` gives `frozenset({"osm"})`, unset gives empty, `LIVE_PROVIDERS=bogus` raises.
  - |
    Existing data. `Place.model_validate({"id": "a", "name": "A", "image_url": "/x", "place_type": "park", "price": "free", "lat": 1.0, "lng": 2.0})` still validates, with `source == "seed"` and the new fields `None`. A `PersistentSavedPlaceStore` file written before this change still lists. `GET /places` and its existing tests are unchanged and green.
assumptions_or_open_questions:
  - |
    Prompt 01's integration layer is not in the repo (searched for LOCAL_LIVE_PROVIDERS, with_fallback, integrations and a notice component, with no hits). This plan builds only what the story needs: the `LIVE_PROVIDERS` opt-in, `places_with_fallback` and `LiveDataNotice`. Is a different opt-in name or mechanism expected, for example `LOCAL_LIVE_PROVIDERS` for local mode only?
  - |
    The AC filters (sights, food, museums, viewpoints, nightlife) differ from the existing `PlaceType` values (landmark, museum, park, food, shopping), and AC9 says the category must be an existing one. Assumed mapping: sights to landmark, museums to museum, viewpoints to park, food and nightlife to food. Nightlife places are therefore typed "food", and the seed catalogue has no nightlife places, so that filter is empty on fallback. Should `PlaceType` gain "viewpoint" and "nightlife" instead?
  - |
    Price is made optional on `Place` because OSM has none. The Explore Price filter is hidden for OSM results. Assumed acceptable.
  - |
    Place "details" have no screen today. Assumed an inline Details toggle on the place card (Explore and Recommendations) is enough for AC5-8.
  - |
    On the Recommendations tab, OSM places replace the seed recommendations, and the trip-interest chips apply only to the seed path. The category chips filter the OSM path. The "Open" link goes to the seed-backed destinations page, which will not know an OSM place, so OSM cards offer Details and Save, not Open. Assumed fine.
  - |
    The Overpass cache is process-local (per Lambda container), 24 h, non-empty results only. A shared DynamoDB cache is out of scope. Overpass fair-use limits are respected by a 1 s limiter, a 60-element cap and a 10 s timeout. Confirm this is enough for the deferred usage-limit question.
  - |
    Monitoring of OSM availability and rate-limit errors (the open project-wide question) is out of scope. Only a logger warning is added on each failure, so it is available to a later monitoring story.
  - |
    Fixtures are hand-built in the Overpass JSON shape, not recorded from the live service. The 10 s limit is enforced by the httpx timeout and a server-side `[timeout:9]`.
  - |
    Not added: the `/account/local-mode` provider list, `/startup-status` provider entries and map attribution on `PlacesMap`. The attribution is on the page, which meets AC3.
estimated_points: 8
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: no migration. `Place` is stored as a snapshot in saved places (DynamoDB accounts item `saved_places`, and the local saved-places file). Every new field has a default and `price` becomes optional, so rows written before this change still validate and render. A test covers it. Trips are not changed.
  - **Backfill / seed**: none. `SEED_CATALOGUE` places gain `source="seed"` and `as_of` in code (`_place()`), nothing is stored.
  - **Settings**: `LIVE_PROVIDERS` (default empty = OSM off), `OVERPASS_BASE_URL` (default the public Overpass interpreter), `OVERPASS_USER_AGENT` (default `trip-planner-api`). Documented in `docs/local-setup.md`. An unknown provider name is refused at start-up.
  - **Provisioning**: nothing to create. The deployment needs outbound HTTPS to Overpass and Nominatim when opted in. Set `OVERPASS_USER_AGENT` to something identifying the app, per OSM usage policy.
  - **Order and rollback**: API and web can ship in either order, because the new endpoint and fields are additive and the web reads defaults. Roll back by unsetting `LIVE_PROVIDERS` (instant, falls back to seed) or by reverting the code; no data to undo.

  ### Shape

  ```mermaid
  flowchart TD
    ExplorePage[ExplorePage.tsx - category chips, notice, attribution]:::touched --> WebApi[places/api.ts - searchPlaceResults]:::touched
    RecsTab[TripRecommendationsTab.tsx - same]:::touched --> TripsApi[trips/api.ts - category, fallback]:::touched
    ExplorePage --> PlaceCard[PlaceCard.tsx - Details toggle]:::touched
    PlaceCard --> PlaceDetails[PlaceDetails.tsx - new]:::touched
    WebApi --> PlacesRouter[routers/places.py - GET /places/results]:::touched
    TripsApi --> TripsRouter[routers/trips.py - recommendations]:::touched
    PlacesRouter --> Live[places/live.py - places_with_fallback]:::touched
    TripsRouter --> Live
    Live --> Overpass[places/overpass.py - OverpassPlaceSearch]:::touched
    Live --> Seed[places/search.py - Place fields, Category]:::touched
    Overpass --> Resolver[locations/resolver.py - DestinationResolver, RateLimiter]
    Deps[routers/deps.py - get_live_places]:::touched --> Overpass
    Deps --> Config[config.py - LIVE_PROVIDERS]:::touched
    classDef touched fill:#f96,color:#000
  ```

  ### Findings
  - `GET /places` takes only a destination string, and `PlaceSearch.search(destination)` has no coordinates, so the adapter resolves the text through `DestinationResolver` (Nominatim, cached 30 days). The Recommendations tab passes `trip.location` straight through.
  - Local mode wires `NoResolver`, so an opted-in local run needs the real resolver with an in-memory cache (`InMemoryLocationCache` exists in `locations/cache.py`).
  - `PlaceCover` draws a local gradient and ignores `image_url`; `Place.image_url` for OSM places is the `PLACEHOLDER_IMAGE` data URI, which `_safe_image_url` already accepts.
  - Test command is the full command given; narrow forms, for example `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_overpass_search.py)` and `(cd apps/web && pnpm run test -- src/explore/ExplorePage.test.tsx)`.
  - The work item and deferred questions held no instructions that needed refusing.
review_focus: |
  IN: the Overpass adapter, `places_with_fallback`, the new `GET /places/results` and category/fallback fields on the recommendations endpoint, the opt-in setting, and the web notice, attribution, details and category chips on Explore and the Recommendations tab only. OUT: `GET /places` and the destinations page, ratings/prices/photos, a shared cache, monitoring, map attribution, the local-mode provider list. Riskiest: the category-to-`PlaceType` mapping (nightlife and viewpoints are approximations of the five existing types), and the local-mode resolver switch, which must not change behaviour when OSM is off. The fallback must be total (off, error, timeout, empty), and seed places must never show OSM attribution.
