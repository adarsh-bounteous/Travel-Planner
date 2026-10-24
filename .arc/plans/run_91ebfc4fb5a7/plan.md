summary: |
  Let a traveller fill a day of a trip's itinerary with activities. Each day card on the Itinerary tab gets an Add activity button that opens a right-hand drawer with three ways to add (From recommendations is selected first, then Search places and Custom activity). Activities on a day also get Move (to another day of the trip) and Remove (behind a confirmation modal). The API gains a server-owned `activities` list on the Trip (kept separate from `options` so activities never count as bookable chosen options or change Book trip), four routes (list recommendations, add, move, remove) and a small seeded recommendations port. The web app adds an AddActivityDrawer, a RemoveActivityModal, activity rows in ItineraryTab and the client calls in trips/api.ts. Work is test-first: pytest and vitest tests per acceptance criterion are written before code.

scope:
  - description: |
      API domain model. Add an `Activity` model and an `activities: list[Activity] = []` field on `Trip` (server-owned, never read from a request body, like `options`/`reminders`). Add the request model with the same trim/min/max rules as day names.

      ```python
      ActivityName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]

      class ActivityFields(BaseModel):
          name: ActivityName
          date: date
          detail: str | None = Field(default=None, max_length=120)  # "Museum, about 2 hours" shown under the name

      class ActivityMove(BaseModel):
          date: date

      class Activity(ActivityFields):
          id: str
      ```

      Add a `Recommendation` model and a `RecommendationSource` Protocol with a seeded `InMemoryRecommendations` (same shape as `InMemoryPlaceSearch`), keyed by destination, so a day can have none.
    files:
      - services/api/app/trips/store.py
      - services/api/app/trips/recommendations.py
    rationale: |
      `ChosenOption` feeds the Book trip button, the booking-link drawer and (later) the cost summary, and a custom activity such as "Cooking class" has no provider, cost or link. A separate `activities` list keeps those features unchanged. Pydantic defaults mean stored trips without the field still load (see Data & rollout).
  - description: |
      API routes in the existing trips router, all through `_editable_trip` (404 for another traveller's trip, 403 for a viewer) and `_view`. A blank or whitespace name is refused by `ActivityName` (422, existing handler), a date outside `trip.days` raises `INVALID_ACTIVITY` (422 `invalid_activity`), and a cap `MAX_ACTIVITIES = 200` keeps the Trip item under DynamoDB's 400 KB limit.

      ```python
      @router.get("/{trip_id}/days/{day_date}/recommendations")
      def day_recommendations(trip_id: str, day_date: date, ...) -> list[Recommendation]: ...

      @router.post("/{trip_id}/activities", status_code=201)
      def add_activity(trip_id: str, body: ActivityFields, ...) -> TripView: ...

      @router.put("/{trip_id}/activities/{activity_id}")
      def move_activity(trip_id: str, activity_id: str, body: ActivityMove, ...) -> TripView: ...

      @router.delete("/{trip_id}/activities/{activity_id}")
      def remove_activity(trip_id: str, activity_id: str, ...) -> TripView: ...
      ```

      Move changes only `date`, so the activity is on the new day only. Recommendations already on that day (same name) are left out of the list. Add a `get_recommendations` dependency in deps.py, wired like `get_places`.
    files:
      - services/api/app/routers/trips.py
      - services/api/app/routers/deps.py
    rationale: Mirrors the reminder routes (same guards, same TripView response) so the web client can replace its trip state from every response.
  - description: |
      Place search inside the drawer. The existing `GET /places?destination=` returns the places for a destination. Add an optional `q` query parameter that keeps places whose name contains `q` (case and accent insensitive), so Search places can return no matches. The drawer searches with the trip's destination plus `q`; when the trip has no destination, the typed text is used as the destination (see open questions).

      ```python
      def search_places(destination: ..., q: str | None = None, ...) -> list[Place]:
          found = places.search(destination)
          return [p for p in found if q is None or _fold(q) in _fold(p.name)]
      ```
    files:
      - services/api/app/routers/places.py
    rationale: Reuses the Maps and Places Data port (ADR-0007) rather than a second search path; the filter lives in the router so the provider port stays unchanged.
  - description: |
      Web API client and types. Add `Activity` and `Recommendation` types, `activities?: Activity[]` on `Trip`, and four calls using the existing `call` helper (no client cache, matching the file's rule).

      ```ts
      export type Activity = { id: string; name: string; date: string; detail?: string | null }
      export type Recommendation = { id: string; name: string; detail: string }
      export type ActivityInput = { name: string; date: string; detail?: string | null }

      export const fetchRecommendations = (tripId: string, date: string) =>
        call<Recommendation[]>(`/trips/${encodeURIComponent(tripId)}/days/${date}/recommendations`)
      export const addActivity = (tripId: string, input: ActivityInput) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/activities`, 'POST', input)
      export const moveActivity = (tripId: string, id: string, date: string) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/activities/${encodeURIComponent(id)}`, 'PUT', { date })
      export const removeActivity = (tripId: string, id: string) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/activities/${encodeURIComponent(id)}`, 'DELETE')
      ```

      `places/api.ts` `searchPlaces` gains an optional `q` argument.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/places/api.ts
    rationale: One place for the wire shapes; every response is a full Trip so the page just replaces its state.
  - description: |
      AddActivityDrawer, built from the approved prototype's "Add activity" screens. It uses the existing `Overlay kind="drawer"` (focus trap, Escape, backdrop) and takes `{ trip, day, onClose, onAdded }`.

      - Header: title row with `<h2>Add activity to {day name}</h2>` and a `btn btn-ghost` close button with `aria-label="Close add activity"` and the X icon.
      - Ways: a `.tabs` tablist labelled "Ways to add an activity" with tabs From recommendations, Search places, Custom activity, in that order, From recommendations selected on first open (AC 2, 3).
      - From recommendations: while loading show `.skeleton` lines; otherwise a `role="radiogroup"` of `.pick` rows (`.radio` input, name in `.option-title`, detail in `.note-for`), first row preselected, and one button whose label names the pick ("Add Tile Museum", `btn btn-secondary`). With none available show an `.empty-state role="status"` with "No recommendations are available for this day." and the hint "Search places or add a custom activity instead."; the other two tabs stay usable (AC 15, 16).
      - Search places: `.field-label` + `input type=search`, a Search button that shows "Searching…" and is disabled while waiting (button-sized wait), Enter also searches. Results are `.pick` rows with the same "Add {name}" button. No matches shows `<p class="text-muted" role="status">` "No places were found. Check the spelling or try a nearby area, then press Enter to search again." and no Add button (AC 11, 12).
      - Custom activity: `.field` with label "Activity name", `input.input`, `.field-error role="alert"` "Enter an activity name to save." shown with `.is-invalid` and `aria-invalid` only after Save is pressed on a blank or whitespace name, focus returns to the input, no request is sent (AC 9, 10). The Save button is `btn btn-primary` ("Save activity", "Saving…" while pending); it is the single primary button in the drawer.
      - Server failure on any add keeps the drawer open and shows a `.field-error`-style message "We couldn't add that activity. Try again."
      - On success the drawer closes and a toast reads "{name} added to {day name}." (via the page's `saved` helper).
      - Layout follows the prototype CSS: `.pick` min-height 44px, `--space-2` gaps, `.pick:has(input:checked)` uses `--color-primary` border and `--color-surface` fill, drawer width `--size-drawer-width` and full width at 375px. Only token values and existing classes are used; add the missing `.pick`, `.pick-list`, `.pick-body` rules to index.css next to the existing `.option` rules.
    files:
      - apps/web/src/trips/AddActivityDrawer.tsx
      - apps/web/src/index.css
    rationale: The drawer keeps the itinerary visible, as the UI guidelines ask for editing in context. The state split (recs, search, custom) mirrors the prototype's five drawer screens.
  - description: |
      RemoveActivityModal, from the prototype's "Remove activity confirmation" screen: `Overlay kind="modal"` with `<h2>Remove this activity?</h2>`, "<strong>{name}</strong> will be removed from this day.", and an `overlay-actions` row with Cancel (`btn btn-secondary`) and Remove (`btn btn-primary`, "Removing…" while pending). Nothing is sent until Remove is pressed, and Cancel or Escape leaves the activity on the day (AC 13, 14). Success shows the toast "{name} removed from {day name}." (AC 8).
    files:
      - apps/web/src/trips/RemoveActivityModal.tsx
    rationale: Confirmation is a `.modal`, as the UI guidelines require. See the open question about the Remove button colour.
  - description: |
      ItineraryTab and TripDetailPage wiring. In ItineraryTab each day card gets a `title-row` with the day heading and an Add activity button (`btn btn-secondary`, plus icon, `aria-label="Add activity to {day name}"`), shown only when `editable`. Activities for the day render as `.option` rows (name in `.option-title`, optional detail in `.text-sm text-muted`) with ghost Move and Remove buttons (`aria-label="Move {name}"`, `aria-label="Remove {name}"`, `aria-expanded` on Move). Move opens the prototype's inline "Move to" group (`.move-to`) listing the trip's other days as `btn btn-secondary` (for example "4 March") plus Cancel; picking one calls `moveActivity` and the toast reads "{name} moved to {day name}." (AC 7). The existing "Nothing chosen for this day yet" empty state shows only when the day has neither chosen options nor activities. TripDetailPage adds `{ id: 'add-activity'; day: Day }` and `{ id: 'remove-activity'; activity: Activity }` to `Panel`, renders the two components when `canEdit`, and handles move through the same `saved`/toast path.

      ```ts
      type ItineraryTabProps = {
        trip: Trip
        onRename: (day: Day, index: number) => void
        onAddReminder: (optionId?: string) => void
        onEditReminder: (reminder: Reminder) => void
        onAddActivity: (day: Day) => void
        onMoveActivity: (activity: Activity, date: string) => Promise<void>
        onRemoveActivity: (activity: Activity) => void
      }
      ```
    files:
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: Keeps the 058 day cards, reminders and Book trip untouched; activities are an additive list on the same cards. Viewers without edit rights see activities but no controls.
  - description: |
      Tests, written first (see `tests`): API unit tests for the four routes and the model default, plus a vitest suite for the drawer, move and remove flows in the existing `stubApi`/`renderAt` style.
    files:
      - services/api/tests/unit/test_activities_router.py
      - services/api/tests/unit/test_places_router.py
      - apps/web/src/trips/Activities.test.tsx
    rationale: One test file per feature area, matching `test_reminders_router.py` and `Reminders.test.tsx`.

tests:
  - |
    AC1 (web, Activities.test.tsx, written first, fails because there is no Add activity button): opening a day shows the drawer.
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Add activity to Day 2' }))
    expect(await screen.findByRole('dialog', { name: 'Add activity to Day 2' })).toBeInTheDocument()
    ```
  - |
    AC2 and AC3 (web): first open selects From recommendations and shows exactly the three ways in order.
    ```ts
    const tabs = within(screen.getByRole('tablist', { name: 'Ways to add an activity' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['From recommendations', 'Search places', 'Custom activity'])
    expect(screen.getByRole('tab', { name: 'From recommendations' })).toHaveAttribute('aria-selected', 'true')
    ```
  - |
    AC4 (web): Search places, pick a result, press the Add button; the place shows on that day and POST carries the date.
    ```ts
    fireEvent.click(screen.getByRole('tab', { name: 'Search places' }))
    fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'Belém' } })
    fireEvent.keyDown(screen.getByLabelText('Search places'), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('radio', { name: /Belém Tower/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Belém Tower' }))
    const day = within(await screen.findByRole('region', { name: /4 March/ }))
    expect(await day.findByText('Belém Tower')).toBeInTheDocument()
    expect(JSON.parse(sent(fetchMock, 'POST')[0][1]!.body as string)).toMatchObject({ name: 'Belém Tower', date: '2027-03-04' })
    ```
  - |
    AC5 (web and API): custom name is saved and shown. API side in test_activities_router.py.
    ```ts
    fireEvent.click(screen.getByRole('tab', { name: 'Custom activity' }))
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: 'Cooking class' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }))
    expect(await within(await screen.findByRole('region', { name: /4 March/ })).findByText('Cooking class')).toBeInTheDocument()
    ```
    ```python
    r = a.post(f"/trips/{tid}/activities", json={"name": "  Cooking class ", "date": "2027-03-04"})
    assert r.status_code == 201
    assert [(x["name"], x["date"]) for x in r.json()["activities"]] == [("Cooking class", "2027-03-04")]
    assert a.get(f"/trips/{tid}").json()["activities"][0]["name"] == "Cooking class"
    ```
  - |
    AC6 (web and API): the preselected recommendation is added with one click, and the Add button names it. API side lists recommendations for a day and drops ones already on it.
    ```ts
    expect(await screen.findByRole('button', { name: 'Add Tile Museum' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add Tile Museum' }))
    expect(await within(await screen.findByRole('region', { name: /3 March/ })).findByText('Tile Museum')).toBeInTheDocument()
    ```
    ```python
    names = [r["name"] for r in a.get(f"/trips/{tid}/days/2027-03-03/recommendations").json()]
    assert names[0] == "Tile Museum"
    ```
  - |
    AC7 (web and API): moving an activity from day 3 to day 4 shows it on day 4 only.
    ```python
    r = a.put(f"/trips/{tid}/activities/{aid}", json={"date": "2027-03-04"})
    assert [x["date"] for x in r.json()["activities"] if x["id"] == aid] == ["2027-03-04"]
    assert a.put(f"/trips/{tid}/activities/{aid}", json={"date": "2027-04-01"}).status_code == 422
    ```
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Move Belem Tower visit' }))
    fireEvent.click(screen.getByRole('button', { name: /4 March/ }))
    expect(within(await screen.findByRole('region', { name: /4 March/ })).getByText('Belem Tower visit')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /3 March/ })).queryByText('Belem Tower visit')).toBeNull()
    ```
  - |
    AC8 (web and API): confirming removal removes it.
    ```python
    r = a.delete(f"/trips/{tid}/activities/{aid}")
    assert r.status_code == 200 and r.json()["activities"] == []
    assert a.delete(f"/trips/{tid}/activities/{aid}").status_code == 404
    ```
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Remove Belem Tower visit' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.queryByText('Belem Tower visit')).toBeNull())
    ```
  - |
    AC9 and AC10 (web and API): a blank or whitespace-only custom name is refused with a message, nothing is sent, nothing is added.
    ```ts
    fireEvent.change(screen.getByLabelText('Activity name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an activity name to save.')
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
    ```
    ```python
    for name in ("", "   "):
        assert a.post(f"/trips/{tid}/activities", json={"name": name, "date": "2027-03-04"}).status_code == 422
    assert a.get(f"/trips/{tid}").json()["activities"] == []
    ```
  - |
    AC11 and AC12 (web and API): a search with no matches shows the message and adds nothing.
    ```ts
    fireEvent.change(screen.getByLabelText('Search places'), { target: { value: 'xyz' } })
    fireEvent.keyDown(screen.getByLabelText('Search places'), { key: 'Enter' })
    expect(await screen.findByText(/No places were found/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
    ```
    ```python
    assert a.get("/places", params={"destination": "Lisbon", "q": "xyz"}).json() == []
    assert [p["name"] for p in a.get("/places", params={"destination": "Lisbon", "q": "belem"}).json()] == ["Belém Tower"]
    ```
  - |
    AC13 (web): choosing Remove shows the confirmation and the activity is still on the day, with no DELETE sent.
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Remove Belem Tower visit' }))
    expect(screen.getByRole('heading', { name: 'Remove this activity?' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /3 March/ })).getByText('Belem Tower visit')).toBeInTheDocument()
    expect(sent(fetchMock, 'DELETE')).toHaveLength(0)
    ```
  - |
    AC14 (web): cancelling keeps the activity.
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Belem Tower visit')).toBeInTheDocument()
    ```
  - |
    AC15 and AC16 (web and API): no recommendations shows the message, and Search places and Custom activity are still offered.
    ```ts
    expect(await screen.findByText('No recommendations are available for this day.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Search places' })).toBeEnabled()
    expect(screen.getByRole('tab', { name: 'Custom activity' })).toBeEnabled()
    ```
    ```python
    assert a.get(f"/trips/{tid_unknown_destination}/days/2027-03-03/recommendations").json() == []
    ```
  - |
    Guards and regression (API): a viewer gets 403 on add, move and remove, another traveller gets 404, a stored trip without `activities` still loads, and activities never change `options` or Book trip.
    ```python
    assert Trip.model_validate({"id": "t1", "name": "Old"}).activities == []
    assert a.post(f"/trips/{tid}/activities", json={"name": "x", "date": "2027-03-04"}).json()["options"] == []
    assert b.post(f"/trips/{tid}/activities", json={"name": "x", "date": "2027-03-04"}).status_code == 404
    ```
  - |
    Web regression (ItineraryTab): a day without options or activities still shows "Nothing chosen for this day yet", a viewer sees no Add activity, Move or Remove buttons, and the existing TripDetailPage and Reminders suites pass unchanged.

assumptions_or_open_questions:
  - |
    Activities are stored in a new `activities` list on the Trip, not as `ChosenOption`s. Reason: `options` drive Book trip (enabled once one option exists) and booking links, and a custom activity has no provider or link. If the epic wants activities to appear in the Book trip list, this needs rework.
  - |
    Recommendations have no real provider yet (provider shortlists belong to the category epics, excluded here). The plan uses a seeded `InMemoryRecommendations` keyed by trip destination, like the seeded place catalogue. Which destinations get seed data is a content decision; Lisbon is seeded to match the prototype and every other destination returns none, which is how AC 15 and 16 are reached.
  - |
    Search places: the existing places endpoint searches by destination, not by free text. The plan adds an optional `q` name filter and searches the trip's destination. When a trip has no destination the typed text is used as the destination. Confirm that this is the wanted behaviour.
  - |
    The prototype shows the Remove button in the confirmation modal as `btn-primary`, while the UI guidelines reserve `btn-danger` for irreversible actions (delete trip, cancel booking). Removing an activity can be redone by adding it again, so the plan follows the prototype (`btn-primary`). Say so if the reviewer wants `btn-danger`.
  - |
    The prototype's empty day text is "No activities yet", but the shipped 058 empty state reads "Nothing chosen for this day yet" and its tests assert it. The plan keeps the 058 copy, shown only when a day has neither options nor activities.
  - |
    The prototype's Move chooser lists the other day of its two-day fixture; the plan lists every other day of the trip. Activities keep their name when moved, and only editors and the owner see the controls (`can_edit`).
  - |
    The prototype also shows a Travelers tab, a Book trip tab and a "Reset prototype" control; those are prototype-only or owned by other items and are not built here. Undo on the toast is not required by any AC and is not planned.
  - |
    Reminders attach to `ChosenOption`s only, so reminders on activities are out of scope.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout

  - **Existing data**: no migration. `Trip.activities` defaults to `[]`, and `DynamoTripStore._to_trip` validates stored items through `Trip.model_validate`, so trips saved before this change load with no activities. Nothing is written until a traveller adds one.
  - **Backfill / seed**: none for stored data. The recommendations seed is code (`app/trips/recommendations.py`), not a database record.
  - **Settings**: no new setting or env var.
  - **Provisioning**: none; the DynamoDB item is the same Trip item with one more attribute.
  - **Order and rollback**: deploy API and web together; the web client treats a missing `activities` as `[]`. To roll back, redeploy the previous code: Pydantic ignores unknown fields by default, so older code still reads trips that have `activities`, but it drops them on that trip's next save. Activities added after deploy would then be lost on rollback, which is acceptable for a first release but should be known. A test that `Trip.model_validate` of a stored item without the field still loads covers readability of existing rows.

  ```mermaid
  flowchart TD
    TDP[TripDetailPage.tsx] --> IT[ItineraryTab.tsx]
    TDP --> AAD[AddActivityDrawer.tsx]
    TDP --> RAM[RemoveActivityModal.tsx]
    AAD --> OV[Overlay.tsx]
    RAM --> OV
    TDP --> TOAST[Toast.tsx]
    AAD --> WAPI[trips/api.ts]
    RAM --> WAPI
    TDP --> WAPI
    AAD --> PAPI[places/api.ts]
    WAPI -->|HTTP| TR[routers/trips.py]
    PAPI -->|HTTP| PR[routers/places.py]
    TR --> ST[trips/store.py]
    TR --> DEPS[routers/deps.py]
    DEPS --> REC[trips/recommendations.py]
    PR --> PS[places/search.py]
    ST --> DDB[(DynamoTripStore)]
    classDef touched fill:#f96,color:#000
    class TDP,IT,AAD,RAM,WAPI,PAPI,TR,PR,ST,DEPS,REC touched
  ```

  Touched nodes: TripDetailPage (panel state and toast), ItineraryTab (Add/Move/Remove controls), AddActivityDrawer and RemoveActivityModal (new), trips/api.ts and places/api.ts (client calls), routers/trips.py (four routes), routers/places.py (`q` filter), store.py (Activity model), deps.py and recommendations.py (new port). Overlay, Toast, places/search.py and DynamoTripStore are read-only context.

  Conventions followed: FastAPI router + Pydantic models in `app/trips/store.py` (ADR-0002), no database owned by the API, trip data in the Trip Database (ADR-0003); React + Vite with the shared component classes already in index.css, vitest for unit tests (ADR-0001). Names follow the glossary used in the code: Trip, Day, Chosen option, Reminder; the new noun is Activity.

  Prototype read: `TRAVEL-PLANNER-APP-STORY-059-design.html` screens Trip itinerary, Add activity (From recommendations, none available, Search places, no matches, Custom activity) and Remove activity confirmation. Design tokens come from the inlined tokens.css; no new tokens are introduced.

review_focus: |
  In scope: the Add activity drawer (three ways), move, and confirmed remove, plus the API routes and `activities` field they need; out of scope are provider shortlists, reminders on activities, undo, and any change to `options` or Book trip. The riskiest parts are keeping activities separate from chosen options (so Book trip and reminders are unaffected) and the guard rules on the new routes (editor-only, date must be a trip day, 200 item cap). Deliberate choices a reviewer might otherwise flag: `btn-primary` on the Remove confirmation (copied from the prototype), keeping the 058 empty-day copy, and the seeded recommendations that stand in for a real provider.
