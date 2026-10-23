summary: |
  Let a traveller search a destination from Home and browse place cards on a new Destination results page. The web app gets a destination search box on Home (the sketch's `destination-search`), a `/destinations?q=...` route, and a `DestinationResultsPage` that shows a skeleton while loading, a `.grid` of `.card` place cards (image + name), or an `.empty-state` with the "no places match" and "change your search" messages. Back returns to Home. The Trip Planner API gets an authenticated `GET /places?destination=...` endpoint backed by a `PlaceSearch` port (ADR-0007, Maps and Places Data outbound), so the web app never talks to a places provider directly. Filters, map, add and save are out of scope.
scope:
  - description: |
      API: a places search port plus a default implementation, and the response model.

      ```python
      class Place(BaseModel):
          id: str
          name: str
          image_url: str

      class PlaceSearch(Protocol):
          def search(self, destination: str) -> list[Place]: ...
      ```
      `InMemoryPlaceSearch(catalogue: dict[str, list[Place]])` matches the destination case-insensitively after trimming, and returns `[]` for an unknown one. It backs unit tests and is the default until a real provider adapter is chosen (see open questions). A real outbound adapter then implements the same port.
    files:
      - services/api/app/places/__init__.py
      - services/api/app/places/search.py
    rationale: |
      Mirrors the `TripStore`/`InMemoryTripStore` port-plus-fake pattern in app/trips/store.py, so the provider is swappable and tests need no network.
  - description: |
      API: `GET /places?destination=` router. Requires the session via `get_current_user`, so signed-out calls get 401. A blank destination returns 422 (`Query(min_length=1)` after trimming). Returns `list[Place]`, and `[]` when nothing matches. Add `get_places()` (lru_cache'd) to deps.py. Register the router in main.py.
    files:
      - services/api/app/routers/places.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      Follows routers/profile.py and deps.py. Every page and endpoint except auth is behind the session.
  - description: |
      Web: typed client call in a new `places` folder.

      ```ts
      export type Place = { id: string; name: string; image_url: string }
      export const searchPlaces = (destination: string) =>
        call<Place[]>(`/places?destination=${encodeURIComponent(destination)}`)
      ```
      `call` in trips/api.ts is module-private; export it, or move it to a shared `http.ts`. Prefer the smaller change of exporting it.
    files:
      - apps/web/src/places/api.ts
      - apps/web/src/trips/api.ts
    rationale: |
      Reuses the existing fetch wrapper (same-origin credentials, no client cache).
  - description: |
      Web: Home destination search (sketch screen `home`, element `destination-search`, flow `home-to-results`). Add a `DestinationSearch` form to HomePage above the trips: a `<form role="search">` with an `.input` labelled "Search a city or place" (placeholder as in the sketch) and a `.btn-primary` "Search" button. The hero heading reads "Where to next?" (h1). On submit with a non-blank value it navigates to `/destinations?q=<trimmed>`. A blank submit stays on Home and shows a `.field-error` (`.is-invalid`) saying "Enter a city or place to search." after submit, not while typing.

      Sketch/AC note: the sketch's Home also has a "New trip" `.btn-primary`. The existing MyTripsPage already has one, and the guidelines allow one `.btn-primary` per screen section. So the search sits in its own hero section with its own primary button, and the MyTripsPage section is untouched. The rest of the Home sketch (trip cards, nav) is the existing trips and shell stories and is not rebuilt here.
    files:
      - apps/web/src/places/DestinationSearch.tsx
      - apps/web/src/auth/HomePage.tsx
    rationale: |
      AC1. Tokens come from index.css only (`--space-3`, `--space-4`, `--color-primary` for the action). Single column on phones, with the input and button wrapping.
  - description: |
      Web: Destination results page at `/destinations`, wrapped in `<RequireAuth>` in App.tsx. It reads `q` with `useSearchParams` and calls `searchPlaces(q)`. States (sketch `state_of`):
      - loading: a `.grid` of `.skeleton` card placeholders (`role="status"`, `aria-label="Loading places"`).
      - success: `<h1>` "Places in {q}" and a `.grid` of `.card` place cards inside a `<ul>`. Each card has `<img src={image_url} alt={name}>` and the name as text, with the image at a fixed 4:3 aspect ratio and `loading="lazy"`.
      - empty: `.empty-state` with `<h2>` "No places match your search" and the prompt "Try a different city or place." plus a `.btn-secondary` "Change search" link to `/`.
      - error: `role="alert"` `.alert` "We couldn't load places. Try searching again." with a link to Home. The sketch's error state is covered here although no AC names it.
      - Back: a `.btn-ghost` "Back" control at the top of the page that navigates to `/` (Home). The Back control is a link, so it works with the browser history.
      A missing or blank `q` redirects to `/` with `<Navigate replace>`.
    files:
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/App.tsx
    rationale: |
      AC2 to AC6. Cards are `.card` in `.grid` per the guidelines ("things you open"), with no fixed column counts. Only `.btn-secondary` or `.btn-ghost` appear on this page, since the page has no primary action in this story.
tests:
  - |
    API unit, services/api/tests/unit/test_places_router.py, written first (AC1, AC2, AC4). The test overrides `deps.get_places` in the `sign_in_as` fixture setup, so add that override with an `InMemoryPlaceSearch` seed in conftest.py.
    ```python
    def test_search_returns_places_with_image_and_name(sign_in_as):
        a = sign_in_as("a@example.com")
        body = a.get("/places", params={"destination": "Lisbon"}).json()
        assert body[0]["name"] and body[0]["image_url"]
        assert set(body[0]) >= {"id", "name", "image_url"}
    ```
  - |
    API unit (AC5, AC6 data side): an unknown destination gives an empty list, a blank one is refused, and signed-out calls are rejected.
    ```python
    assert a.get("/places", params={"destination": "Nowhereville"}).json() == []
    assert a.get("/places", params={"destination": "  "}).status_code == 422
    assert TestClient(app).get("/places", params={"destination": "Lisbon"}).status_code == 401
    ```
  - |
    API unit for the matcher, test_place_search.py: `InMemoryPlaceSearch(...).search(" lisbon ")` equals the result for "Lisbon" (case and whitespace insensitive).
  - |
    Web, DestinationSearch.test.tsx and HomePage (AC1): typing a destination and submitting shows Destination results for it.
    ```tsx
    stubApi({ 'GET /places?destination=Lisbon': { status: 200, body: [{ id: 'p1', name: 'Alfama', image_url: '/a.jpg' }] } })
    renderAt('/')
    fireEvent.change(await screen.findByLabelText('Search a city or place'), { target: { value: 'Lisbon' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByRole('heading', { name: 'Places in Lisbon' })).toBeInTheDocument()
    ```
    Also: a blank submit stays on Home, shows "Enter a city or place to search.", and makes no `/places` call.
  - |
    Web, DestinationResultsPage.test.tsx (AC2): results load as a list of place cards.
    ```tsx
    renderAt('/destinations?q=Lisbon')
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    ```
  - |
    Web (AC3): Back returns to Home.
    ```tsx
    fireEvent.click(await screen.findByRole('link', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Your trips' })).toBeInTheDocument()
    ```
  - |
    Web (AC4): each card shows the place image and name.
    ```tsx
    expect(await screen.findByRole('img', { name: 'Alfama' })).toHaveAttribute('src', '/a.jpg')
    expect(screen.getByText('Alfama')).toBeInTheDocument()
    ```
  - |
    Web (AC5): an empty result shows the no-match message.
    ```tsx
    stubApi({ 'GET /places?destination=Zzz': { status: 200, body: [] } })
    renderAt('/destinations?q=Zzz')
    expect(await screen.findByText('No places match your search')).toBeInTheDocument()
    ```
  - |
    Web (AC6): the same empty state prompts the traveller to change the search.
    ```tsx
    expect(screen.getByText('Try a different city or place.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change search' })).toHaveAttribute('href', '/')
    ```
  - |
    Web, extra states from the sketch: while the request is pending the skeleton `status` is shown, a failed request (500) shows the `alert`, and `/destinations` with no `q` redirects to Home.
assumptions_or_open_questions:
  - |
    No places provider is configured anywhere in the codebase (ADR-0007 only records "Maps and Places Data (outbound)"). This plan puts the provider behind a `PlaceSearch` port and ships `InMemoryPlaceSearch` with a small seeded catalogue as the default. Question for the reviewer: which provider should the real adapter use, and should it be its own story? A real adapter would need an API key setting and a package, and neither is added here.
  - |
    The wireframe has no results screen of its own (only `home`; `results` is named as the exit target of `home-to-results`). The Destination results layout, copy and states are therefore derived from the ACs and the UI guidelines, not from the sketch. Please confirm the copy "Places in {q}", "No places match your search" and "Try a different city or place.".
  - |
    The results URL is `/destinations?q=...` so the page survives a reload and the browser Back button works. Back is also an explicit link to `/`, per AC3.
  - |
    Place image_url may fail to load. The card keeps its fixed aspect-ratio box and the alt text shows the name. No fallback image is planned.
  - |
    The sketch nav (Plan, My trips, Sign in) differs from the existing AppHeader (Profile, Account). Shell navigation belongs to the App shell story, so it is not changed here.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  None — read-only search endpoint over a built-in catalogue. No migration, stored data, setting or env var is added. Rollback is removing the route and page.

  Stack: React + Vite + Tailwind + vitest on comp_web_app, FastAPI + pytest on comp_trip_planner_api. No new packages.

  ```mermaid
  flowchart TD
    App[App.tsx routes]:::touched --> Home[auth/HomePage.tsx]:::touched
    Home --> DS[places/DestinationSearch.tsx]:::touched
    DS -->|navigate /destinations?q=| App
    App --> DRP[places/DestinationResultsPage.tsx]:::touched
    DRP --> PC[places/PlaceCard.tsx]:::touched
    DRP --> PApi[places/api.ts]:::touched
    PApi --> TApi[trips/api.ts call wrapper]:::touched
    TApi -->|GET /places| Router[routers/places.py]:::touched
    Router --> Deps[routers/deps.py get_current_user, get_places]:::touched
    Deps --> PS[places/search.py PlaceSearch]:::touched
    Main[main.py]:::touched --> Router
    Home --> MyTrips[trips/MyTripsPage.tsx]
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN: Home destination search, the `/destinations` results page with its loading, success, empty and error states, Back to Home, and a read-only `GET /places` behind a `PlaceSearch` port. OUT: filters, map, add and save, the real places provider and the app-shell navigation. The riskiest part is the data source: it is a deliberately seeded in-memory default pending a provider decision, and the results screen has no wireframe of its own, so its layout and copy come from the ACs and the UI guidelines.
