summary: |
  Let a traveller narrow Destination results by place type and price and flip between a List and a Map view of exactly the same filtered places. Today a Place only has id, name and image_url, so the API gains `place_type`, `price` and map coordinates (`lat`, `lng`) on Place plus optional `place_type` / `price` query params on `GET /places`. The web app keeps the chosen filters and view in the URL search params so list and map are fed from one filtered array and cannot disagree. The Map is a dependency-free SVG pin map (no new package). Filtered-empty shows a "no places match the filters" message with a prompt to change or clear the filters.
scope:
  - description: |
      API: extend the Place model and seed data, and add filtering.
      Place gains `place_type: Literal["landmark","museum","park","food","shopping"]`, `price: Literal["free","budget","moderate","premium"]`, `lat: float`, `lng: float`.
      `_place(slug, name)` becomes `_place(slug, name, place_type, price, lat, lng)`; every seed place in Lisbon, Paris and Oslo gets real values, and Lisbon must hold more than one place type and more than one price.
      `GET /places` gains `place_type: PlaceType | None = None` and `price: Price | None = None`; filters combine with AND and with the existing `q`. An unknown value gives 422.
    files:
      - services/api/app/places/search.py
      - services/api/app/routers/places.py
    rationale: |
      Filtering server-side keeps the real Maps and Places Data adapter (ADR-0007) the owner of what a place type or price means. The InMemoryPlaceSearch port is unchanged, so the filter lives in the router next to the existing `q` filter.
  - description: |
      API tests and fixtures: update the one-place fixture in conftest and the Place constructions in test_place_search to supply the new required fields. Add the filter tests listed under tests.
    files:
      - services/api/tests/conftest.py
      - services/api/tests/unit/test_place_search.py
      - services/api/tests/unit/test_places_router.py
    rationale: Required Place fields would otherwise break existing fixtures.
  - description: |
      Web data layer: extend the type and the call.
      ```ts
      export type PlaceType = 'landmark' | 'museum' | 'park' | 'food' | 'shopping'
      export type Price = 'free' | 'budget' | 'moderate' | 'premium'
      export type Place = { id: string; name: string; image_url: string; place_type: PlaceType; price: Price; lat: number; lng: number }
      export type PlaceFilters = { placeType?: PlaceType; price?: Price }
      export const searchPlaces = (destination: string, q?: string, filters?: PlaceFilters) => ...
      ```
      Filters are sent as `place_type` and `price` query params only when set. Also export the label maps (PLACE_TYPE_LABELS, PRICE_LABELS) used by chips and cards.
    files:
      - apps/web/src/places/api.ts
    rationale: One typed source for the filter vocabulary shared by chips, list and map.
  - description: |
      Filters, results state and view toggle on DestinationResultsPage (sketch screen `results`, states success, empty, loading, error).
      - `filters` chip-group (sketch `filters`): a `.cluster` of `.chip` buttons with `aria-pressed`, in a `role="group"` labelled "Filters". One group "Place type" (All plus each type) and one group "Price". Choosing a pressed chip again clears it. The sketch's Dates chip is not built (see assumptions) and its Budget/Type chips map to Price/Type.
      - Filters (`type`, `price`) and view (`view=map`) live in `useSearchParams`, alongside `q`. The effect refetches `searchPlaces(query, undefined, filters)` when they change; the same `places` array feeds both views, so AC3 and AC4 hold by construction. The results heading and chips stay mounted while a refetch shows the `.skeleton` grid, so a filter change does not lose the chips.
      - `map-toggle` (sketch `map-toggle`, kind tabs, items List and Map): `.tabs` with `role="tablist"` and two `.tab` `role="tab"` buttons with `aria-selected`, matching TripDetailPage. List renders the existing `.grid` of PlaceCards; Map renders PlacesMap in its place. Default is List.
      - Filtered-empty (AC7 and AC8): when places is empty AND a filter is set, render `.empty-state` with h2 "No places match these filters", text "Change or clear the filters to see more places.", and one `.btn-primary` "Clear filters". Chips and the toggle stay visible. Empty with no filter keeps the existing "No places match your search" state unchanged.
      - Error alert (`.alert .alert-danger`) and loading skeleton keep today's behaviour.
      - Styling uses tokens only: `--space-2/3`, `--color-primary` (selection and actions only), `--color-border`, `--radius-full`. Single column on phones; chips wrap with `flex-wrap`, and the tabs scroll within `.tabs`. Voice is warm second person; buttons start with a verb.
    files:
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/places/PlaceFilters.tsx
      - apps/web/src/places/ViewToggle.tsx
    rationale: |
      Splitting filters and toggle into small components keeps the page readable. URL state means a refresh or shared link keeps the filter and view, and Back keeps working.
  - description: |
      PlacesMap component (sketch `map-toggle` Map view). `PlacesMap({ places }: { places: Place[] })` renders an `<svg role="img" aria-label="Map of places">` inside a `.card`. Each place is a pin positioned by linearly scaling lat/lng into the places' own bounding box with padding, with an accessible `<title>` / aria-label of the place name. A visually hidden list is not added. No tile or map SDK is added (see assumptions). Pins use `--color-primary`, and the container uses `--color-surface` with a `--radius-md` corner. Saved markers are out of scope.
    files:
      - apps/web/src/places/PlacesMap.tsx
    rationale: Avoids a new dependency, key and CSP/network surface while still showing exactly the filtered places on a map.
  - description: |
      CSS: the web app's `index.css` lacks `.chip`. Add the `.chip`, `.chip:hover`, `.chip[aria-pressed="true"]`, `.chip:focus-visible` rules copied from design-system/prototype-utils.css so the app matches the design system (tokens only).
    files:
      - apps/web/src/index.css
    rationale: Chips are the design system's filter control; the rules exist only in the prototype stylesheet today.
  - description: |
      Web tests: extend the existing suite per the tests list, using `stubApi` and `renderAt` from `../test-api`. The stub keys on the full request path, so filtered calls are keyed like `GET /places?destination=Lisbon&place_type=museum`. Update the existing Lisbon fixture to the new Place shape.
    files:
      - apps/web/src/places/DestinationResultsPage.test.tsx
    rationale: Existing tests keep passing with the extended Place type.
tests:
  - |
    API, AC1. Written first, fails because the param is ignored.
    ```python
    def test_place_type_filter_returns_only_that_type(sign_in_as):
        a = sign_in_as("a@example.com")
        overrides_with_seed()  # InMemoryPlaceSearch(SEED_CATALOGUE), as in test_q_filters_by_name
        body = a.get("/places", params={"destination": "Lisbon", "place_type": "museum"}).json()
        assert body and {p["place_type"] for p in body} == {"museum"}
    ```
  - |
    API, AC2.
    ```python
    def test_price_filter_returns_only_that_price(sign_in_as):
        ...
        body = a.get("/places", params={"destination": "Lisbon", "price": "free"}).json()
        assert body and {p["price"] for p in body} == {"free"}
    ```
  - |
    API, combination, validation and shape. Filters AND together and with q; no match gives an empty list; an unknown value gives 422; every place carries lat and lng.
    ```python
    assert a.get("/places", params={"destination": "Lisbon", "place_type": "museum", "price": "premium"}).json() == []
    assert a.get("/places", params={"destination": "Lisbon", "price": "cheap"}).status_code == 422
    assert set(body[0]) >= {"id", "name", "image_url", "place_type", "price", "lat", "lng"}
    ```
  - |
    Web, AC1. Seeded response holds two types. Choosing the Museum chip makes the fetch carry the filter and lists only museums.
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Museum' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([p]) => String(p).includes('place_type=museum'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Museum' })).toHaveAttribute('aria-pressed', 'true')
    ```
  - |
    Web, AC2. Choosing a Price chip refetches with `price=free` and lists only matching places.
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Free' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(1)
    ```
  - |
    Web, AC3. With a filter applied, choosing the Map tab shows the map pins and they are exactly the list's places.
    ```ts
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
    const map = await screen.findByRole('img', { name: 'Map of places' })
    expect(within(map).getAllByRole('listitem').map((n) => n.getAttribute('aria-label'))).toEqual(['Belém Tower'])
    ```
  - |
    Web, AC4. In map view with a filter, choosing List shows the same filtered cards.
    ```ts
    fireEvent.click(screen.getByRole('tab', { name: 'List' }))
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Belém Tower'])
    ```
  - |
    Web, AC5. From list view, the Map tab replaces the list.
    ```ts
    fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
    expect(screen.getByRole('tab', { name: 'Map' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('img', { name: 'Map of places' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Alfama' })).not.toBeInTheDocument()
    ```
  - |
    Web, AC6. From map view, the List tab replaces the map with place cards.
    ```ts
    renderAt('/destinations?q=Lisbon&view=map')
    fireEvent.click(await screen.findByRole('tab', { name: 'List' }))
    expect(screen.queryByRole('img', { name: 'Map of places' })).not.toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Alfama' })).toBeInTheDocument()
    ```
  - |
    Web, AC7. A filtered empty response shows the no-match message and keeps the chips.
    ```ts
    stubApi({ 'GET /places?destination=Lisbon&place_type=park': { status: 200, body: [] } })
    renderAt('/destinations?q=Lisbon&type=park')
    expect(await screen.findByText('No places match these filters')).toBeInTheDocument()
    ```
  - |
    Web, AC8. The same state prompts the traveller to change or clear filters, and Clear filters restores the full list.
    ```ts
    expect(screen.getByText('Change or clear the filters to see more places.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    ```
  - |
    Regression. The existing unfiltered tests (AC1 to AC6 of story 013, the skeleton and the alert) still pass, and the no-filter empty state still reads "No places match your search".
assumptions_or_open_questions:
  - |
    The Place type, price and coordinates do not exist today. I assume place types landmark, museum, park, food and shopping, and price tiers free, budget, moderate and premium. Please confirm or replace these values. They are tiers rather than money amounts, so no currency is shown.
  - |
    The Map is a dependency-free SVG pin map, because no map library is in the project and ADR-0007 does not pick one. If you want real tiles (Leaflet or MapLibre plus a provider key), that is a new package and a provisioning decision, so say so and I will revise.
  - |
    Sketch versus AC: the sketch's filters chip-group lists Dates, Budget and Type. The ACs and scope cover only place type and price, so Dates is not built, Budget is treated as Price and Type as Place type. The sketch's place-card also shows an Add to trip button and a Place added toast, which belong to other stories and are not built here.
  - |
    Filters are single-select per group (one place type, one price), as the ACs say "one place type filter". Rating and distance filters are deferred per scope.
  - |
    Filter and view state is kept in URL params (`type`, `price`, `view`) so list and map share it, and refresh and Back keep the state.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  None — the Place catalogue is an in-memory seed and nothing is stored or migrated. There are no new settings, env vars or provisioning, and the change deploys API and web together. The new Place fields are required in the response, so deploy the API first; the old web build ignores the extra fields. Rollback is a plain revert.

  ```mermaid
  flowchart TD
    Page[DestinationResultsPage.tsx] --> Api[places/api.ts]
    Page --> Filters[PlaceFilters.tsx]
    Page --> Toggle[ViewToggle.tsx]
    Page --> Map[PlacesMap.tsx]
    Page --> Card[PlaceCard.tsx]
    Api -->|GET /places| Router[routers/places.py]
    Router --> Search[places/search.py]
    Router --> Deps[routers/deps.py get_places]
    Filters --> Css[index.css chip rules]
    classDef touched fill:#f96,color:#000
    class Page,Api,Filters,Toggle,Map,Router,Search,Css touched
  ```
  Touched nodes are orange. Page owns the filter and view state and feeds one array to both views. Router and search carry the new filter params and Place fields. PlaceCard and deps are unchanged context.

  No new packages. Mirrors the tab pattern in TripDetailPage.tsx and the stubApi test style already used in DestinationResultsPage.test.tsx.
review_focus: |
  IN: place type and price filters, List/Map toggle and the filtered-empty state on Destination results, with the API fields and params they need. OUT: rating and distance filters, Dates filter, saved markers, Add to trip and Place added. Riskiest part is keeping the list and map on one filtered array, and the URL-param state with refetch. The Map is deliberately a dependency-free SVG, and the new Place fields and their values are assumptions to confirm.
