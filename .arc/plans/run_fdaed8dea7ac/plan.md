summary: |
  Rebuild the existing My trips list (apps/web/src/trips/MyTripsPage.tsx, rendered by HomePage at "/") to match the approved wireframe and the 15 acceptance criteria. The list gets one combined, newest-first list of the traveller's own and shared trips; rows show name, destination, dates, a Shared badge for trips shared with them, and an Open link; New trip and the empty-state Plan your first trip button launch the existing guided set-up at /trips/new; loading shows a .skeleton list; a load failure shows an .alert with a Retry button (never the empty state); and a refresh silently drops a trip whose access was removed. The API needs two small changes to GET /trips: sort by updated_at descending and mark each trip with a shared flag so the web can show the badge.
scope:
  - description: |
      API: GET /trips returns a list-item model instead of the bare Trip.
      Add `class TripListItem(Trip): shared: bool = False` in routers/trips.py and change
      `def list_trips(...) -> list[TripListItem]`. Own trips get `shared=False`, shared trips get `shared=True` (the existing branch that already strips editors and share_token). Sort the combined list with
      `sorted(items, key=lambda t: t.updated_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)` (trips with no updated_at, saved before the field existed, sort last; sort must be stable and tolerate naive and aware datetimes, so normalise both).
      Stale index rows for revoked or removed trips are already skipped, which is what AC14 relies on; keep that.
    files:
      - services/api/app/routers/trips.py
      - services/api/tests/unit/test_trips_router.py
      - services/api/tests/unit/test_editor_access_router.py
    rationale: |
      AC7, AC8 and AC9 need the server to say which trips are shared and to order them; the web has no other way to know (Trip has no owner field and is_owner is only on TripView). Doing the sort server-side keeps one source of truth for "most recently created or updated" (created sets updated_at in create_trip).
  - description: |
      Web API types: add `shared?: boolean` to the Trip type in trips/api.ts (documented as "set by GET /trips: shared with this traveller by another traveller"). fetchTrips keeps its signature.
    files:
      - apps/web/src/trips/api.ts
    rationale: AC6 to AC8 need the flag typed.
  - description: |
      Rebuild MyTripsPage (wireframe screens `trips` and `trips-empty`, flow `trips-to-empty`). Structure:
      - `<h1>My trips</h1>` (wireframe trips-title; was "Your trips").
      - Loading (AC10): a `.stack` of three `<span className="skeleton card" />` placeholders with `role="status"` and `aria-label="Loading trips"`. No `.spinner`.
      - Error (AC11, AC12, AC13): `<div className="alert alert-danger" role="alert">` with the text "We couldn't load your trips. Check your connection and try again." and a `.btn btn-secondary` "Retry" button that sets state back to loading and calls fetchTrips again. The empty state and the New trip button are not rendered in this state.
      - Empty (AC3, AC4; wireframe `trips-empty`, `no-trips`, `plan-first-trip`): `<div className="empty-state">` with a heading "No trips yet", a line of warm copy ("Where to next? Plan your first trip and it will show up here."), and exactly one `.btn btn-primary` link "Plan your first trip" to GUIDED_SETUP_PATH. No separate New trip button here (one primary per section).
      - List (AC1, AC5, AC6; wireframe `trips-list`, `trip-row`, `trip-row-name`, `trip-row-open`): a `.grid` of `<li className="card">` rows, in server order. Each row shows the trip name (trip-row-name, an `<h2>`), destination, dates formatted with `Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })` as "start – end" (date-only strings are parsed as local dates, not via `new Date(iso)`, to avoid off-by-one in negative offsets; omit missing parts), a `<span className="badge">Shared</span>` only when `trip.shared` is true (AC7, AC8), and an Open `.btn btn-secondary` link (trip-row-open, accessible name "Open Lisbon" via aria-label) to `/trips/${id}` which shows the itinerary (AC2; TripDetailPage opens on the itinerary, see Assumptions). A single `.btn btn-primary` "New trip" link to GUIDED_SETUP_PATH sits above the list (AC5).
      - Refresh (AC14, AC15): re-run fetchTrips on `visibilitychange` (when document becomes visible) and window `focus`. A refresh that succeeds replaces the list; a refresh that fails after a successful first load keeps the current list and shows nothing (no message about removed trips, no error). Only the initial load and Retry can enter the error state. Ignore results that arrive after unmount.
      - Keep the Toast driven by location state (used by trip delete) as it is.
      Export `export const GUIDED_SETUP_PATH = '/trips/new'` from this file, the one place that names where the guided set-up lives.
      Layout: single column on phones, `.grid` reflows on desktop, no fixed column counts, spacing with `--space-3` and `--space-4` via existing `.stack`/`.grid`; no new CSS unless `.grid` needs a `.card` row tweak (use tokens only). `--color-primary` only on the two actions.
    files:
      - apps/web/src/trips/MyTripsPage.tsx
    rationale: |
      Builds the approved `trips` and `trips-empty` screens and every AC from 1 to 15 in one component. Skeleton, empty-state, alert, badge, card, grid and button classes are all already in index.css.
  - description: |
      Update the tests and e2e that look for the old "Your trips" heading to look for "My trips" (the heading is the wireframe's trips-title), and the old empty copy ("You haven't planned a trip yet") to the new empty state. HomePage keeps rendering MyTripsPage, so no route change.
    files:
      - apps/web/src/AppHeader.test.tsx
      - apps/web/src/auth/RequireAuth.test.tsx
      - apps/web/src/auth/SignInPage.test.tsx
      - apps/web/src/auth/AuthProvider.test.tsx
      - apps/web/src/places/DestinationResultsPage.test.tsx
      - apps/web/src/trips/TripDetailPage.test.tsx
      - apps/web/e2e/auth.spec.ts
      - apps/web/e2e/redirect.spec.ts
    rationale: The rename is a direct consequence of the wireframe heading; without this those tests fail for a copy reason only.
  - description: |
      Playwright e2e for the golden path in apps/web/e2e (new file my-trips.spec.ts), following the style of share-link.spec.ts: one traveller with an own trip and a trip shared by another traveller sees both, the Shared badge on only the shared one, Open reaches the itinerary; a new traveller sees the empty state and Plan your first trip reaches the set-up form.
    files:
      - apps/web/e2e/my-trips.spec.ts
    rationale: Proves AC1 to AC4 against the real API and store, which the stubbed-fetch unit tests cannot.
tests:
  - |
    API (pytest, test_trips_router.py), AC9 ordering. Written first, fails because the list is in insertion order:
    ```python
    def test_list_is_newest_updated_first(client_factory):
        a = client_factory("user-1")
        first = a.post("/trips", json={"name": "Lisbon"}).json()["id"]
        a.post("/trips", json={"name": "Oslo"})
        a.put(f"/trips/{first}", json={"name": "Lisbon 2"})  # updated last
        assert [t["name"] for t in a.get("/trips").json()] == ["Lisbon 2", "Oslo"]
    ```
    (Use the clock fixture the file already uses so each call gets a later `get_now`; match the helper names in the file.)
  - |
    API (test_editor_access_router.py), AC1 and AC7 and AC8. The shared flag:
    ```python
    listed = {t["name"]: t for t in editor.get("/trips").json()}
    assert listed["Mine"]["shared"] is False
    assert listed["Theirs"]["shared"] is True
    assert list(listed) == ["Theirs", "Mine"] or list(listed) == ["Mine", "Theirs"]  # replace with the exact order the clock produces
    ```
    Also assert the shared row still has `editors == []` and `share_token is None`.
  - |
    API, AC14. After the owner revokes the editor (or deletes the trip), the editor's list no longer contains it and the response is 200:
    ```python
    owner.delete(f"/trips/{tid}/editors/{editor_email}")
    response = editor.get("/trips")
    assert response.status_code == 200
    assert tid not in [t["id"] for t in response.json()]
    ```
  - |
    Web (MyTripsPage.test.tsx), AC1 plus AC7 plus AC8 plus AC6. Stub GET /trips with one own trip and one with `shared: true`:
    ```tsx
    expect(await screen.findByRole('heading', { name: 'Lisbon' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oslo' })).toBeInTheDocument()
    expect(screen.getAllByText('Shared')).toHaveLength(1)
    const oslo = screen.getByRole('heading', { name: 'Oslo' }).closest('li')!
    expect(within(oslo).getByText('Shared')).toBeInTheDocument()
    expect(within(oslo).getByText('Norway')).toBeInTheDocument()
    expect(within(oslo).getByText(/Mar 4, 2027/)).toBeInTheDocument()
    ```
  - |
    Web, AC2 Open. Fails first because the row link is a name link, not an Open link:
    ```tsx
    expect(await screen.findByRole('link', { name: 'Open Lisbon' })).toHaveAttribute('href', '/trips/t1')
    ```
    and clicking it renders the itinerary (stub GET /trips/t1 and assert the Itinerary tab content shows).
  - |
    Web, AC3. Empty list:
    ```tsx
    stubApi({ 'GET /trips': { status: 200, body: [] } })
    renderAt('/')
    expect(await screen.findByText('No trips yet')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Plan your first trip' })).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'New trip' })).not.toBeInTheDocument()
    ```
  - |
    Web, AC4. Pressing Plan your first trip launches the guided set-up:
    ```tsx
    fireEvent.click(await screen.findByRole('link', { name: 'Plan your first trip' }))
    expect(await screen.findByRole('heading', { name: 'New trip' })).toBeInTheDocument()
    ```
  - |
    Web, AC5. With one trip, New trip launches the set-up:
    ```tsx
    fireEvent.click(await screen.findByRole('link', { name: 'New trip' }))
    expect(await screen.findByLabelText('Trip name')).toBeInTheDocument()
    ```
  - |
    Web, AC8 and AC6 negative. A trip without `shared` shows no badge: `expect(screen.queryByText('Shared')).not.toBeInTheDocument()`.
  - |
    Web, AC9. The page keeps the server order (no client re-sort):
    ```tsx
    const names = (await screen.findAllByRole('heading', { level: 2 })).map((h) => h.textContent)
    expect(names).toEqual(['Oslo', 'Lisbon'])
    ```
  - |
    Web, AC10. A fetch that never resolves shows the skeleton and neither the empty state nor the error:
    ```tsx
    expect(await screen.findByRole('status', { name: 'Loading trips' })).toBeInTheDocument()
    expect(screen.queryByText('No trips yet')).not.toBeInTheDocument()
    ```
  - |
    Web, AC11 and AC12. GET /trips answers 500:
    ```tsx
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your trips")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('No trips yet')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Plan your first trip' })).not.toBeInTheDocument()
    ```
  - |
    Web, AC13. Fail once then succeed (a stub that returns 500 then 200):
    ```tsx
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Lisbon' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([p]) => p === '/trips')).toHaveLength(2)
    ```
  - |
    Web, AC14 and AC15. First GET /trips returns two trips, the next returns one; fire `window.dispatchEvent(new Event('focus'))`:
    ```tsx
    await screen.findByRole('heading', { name: 'Oslo' })
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Oslo' })).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/removed|no longer/i)).not.toBeInTheDocument()
    ```
    Plus a second case where the refresh itself answers 500: the list stays and no alert appears.
  - |
    Regression. The renamed heading is found by the existing suites: `expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()` in AppHeader, RequireAuth, SignInPage, AuthProvider and DestinationResultsPage tests; the full vitest run (`cd apps/web && pnpm test`) and pytest run (`cd services/api && uv run pytest`) stay green.
assumptions_or_open_questions:
  - |
    The guided set-up owned by Traveller profile and preference gathering is not a separate screen in the codebase yet. The repo's only guided New trip set-up is the /trips/new form (TripForm; also the NewTripDrawer used from Destination results). I point both buttons at one constant, GUIDED_SETUP_PATH = '/trips/new', so the owning story can repoint it in one place. Please confirm.
  - |
    Sketch versus ACs. (1) The wireframe's empty-state button reads "Plan a trip" and its flow exits to Destination results; AC3 and AC4 say "Plan your first trip" and launching the guided set-up. I follow the ACs. (2) The wireframe `trips` screen draws Upcoming and Past tabs; the scope says no tabs, so I build none. (3) The wireframe `trips` screen also shows an empty-state node next to the list; that is just the trips-to-empty flow, so the empty state replaces the list when there are no trips.
  - |
    My trips stays on the "/" route inside HomePage (above and below it are the destination search and sign-out). The wireframe header with Plan and My trips nav is owned by the App shell story, so I do not change AppHeader or add a /trips route.
  - |
    "Open shows the itinerary": I assume TripDetailPage at /trips/:tripId already opens on the itinerary and a shared trip (editor) can open it, as GET /trips/{id} already serves accepted editors. I read TripPage and the GET route but not TripDetailPage in full; the implementer should confirm the default tab and, if it is not the itinerary, fix that in this item.
  - |
    "Removed or revoked while My trips is open": there is no push channel, so the list refreshes on tab focus and visibility and on Retry. The server already skips stale shared rows. A refresh failure after a first successful load is silent by design (AC15).
  - |
    Date format uses the browser locale with Intl and a medium date style. Trips have a budget and currency but the row does not show money, so no currency display is needed here.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  None — adds a computed `shared` field to the GET /trips response and sorts it; no stored data, schema, setting or provisioning changes. Existing trips without `updated_at` still list (sorted last).

  Two layers change (API list response, React page), so the flow is:

  ```mermaid
  flowchart TD
    Home[HomePage] --> MyTrips[MyTripsPage]
    MyTrips --> FetchTrips[api.ts fetchTrips]
    FetchTrips -->|GET /trips| ListTrips[routers/trips.py list_trips]
    ListTrips --> Store[TripStore list_trips and shared_trips]
    MyTrips -->|Open| TripPage[TripPage]
    MyTrips -->|New trip, Plan your first trip| TripForm[TripForm at /trips/new]
    classDef touched fill:#f96,color:#000
    class MyTrips,FetchTrips,ListTrips touched
  ```

  MyTripsPage is rebuilt for the sketch states; api.ts gets the `shared` type; list_trips gets the flag and ordering. The store is untouched.
review_focus: |
  IN: the My trips list, its empty, loading and error states, the Shared badge, newest-first ordering, and the two launch buttons. OUT: tabs, delete, archive, drafts, the guided set-up itself, and the app header and nav. Riskiest part is the GET /trips change (response shape and sort with mixed naive, aware and missing updated_at) and the many existing tests that assert the old "Your trips" heading. Deliberate: the buttons point at the existing /trips/new through one constant, and a failed background refresh is silent to satisfy AC15.
