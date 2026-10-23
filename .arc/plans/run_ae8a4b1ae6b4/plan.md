summary: |
  Turn the single-trip page into a day-by-day itinerary. The Trip Planner API gains a budget, a server-derived list of days (one per date from start to end, names kept when dates change), read-only chosen options placed on days by date, a per-day rename endpoint, a trip delete endpoint, and an is_owner flag. The web app replaces the edit-form at /trips/:tripId with a trip page that has Overview and Itinerary tabs, one stack card per day in a .grid, and owner-only controls from the approved prototype (Edit trip drawer with name, dates and budget; Rename day modal; Delete trip behind a .modal confirmation; .toast on save and delete). Adding activities, cost display and sharing are out of scope.
scope:
  - description: |
      Trip model and store (API). Extend the Trip model and TripStore protocol.

      ```python
      class Day(BaseModel):
          date: date
          name: str

      class ChosenOption(BaseModel):
          id: str
          title: str
          category: str
          date: date

      class TripFields(BaseModel):  # writable by the traveller
          name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
          destination: str | None = None
          start_date: date | None = None
          end_date: date | None = None
          budget: float | None = Field(default=None, ge=0, le=1_000_000_000)

      class Trip(TripFields):
          id: str
          updated_at: datetime | None = None
          currency: str = "EUR"
          days: list[Day] = []
          options: list[ChosenOption] = []   # server-owned, never in a request body

      def reconcile_days(start: date | None, end: date | None, existing: list[Day]) -> list[Day]: ...

      class TripStore(Protocol):
          def delete_trip(self, owner_id: str, trip_id: str) -> None: ...
      ```

      reconcile_days builds one Day per date from start to end inclusive, reusing the existing Day (name) for a date that is still in range and naming new ones "Day N" by position. Both dates are required together; a range over 60 days or end before start is a 422. DynamoTripStore converts budget float to Decimal(str(x)) on save and back to float on read, because boto3 rejects floats. Add delete_trip to InMemoryTripStore and DynamoTripStore (delete_item on the owner partition key).
    files:
      - services/api/app/trips/store.py
    rationale: |
      Days, budget and options are stored on the trip item, so the owner-keyed lookup in every store method still guards them. Whitespace-only names are refused for trip and day names (AC13, AC14). Negative budget is refused with ge=0 (AC15) and a non-numeric budget fails pydantic float parsing (AC16).
  - description: |
      Trips router (API). Responses become TripView (Trip plus is_owner: bool, true for the owner; no non-owner can reach a trip until sharing exists).
      - GET /trips/{id}: if days is empty and dates are set (trips saved before this change), derive days with reconcile_days in the response. Nothing is written.
      - POST /trips and PUT /trips/{id}: recompute days with reconcile_days(existing days) and preserve options and day names. PUT must NOT wipe days, options or currency, which the body cannot carry.
      - PUT /trips/{id}/days/{day_date} with body {name}: rename one day. 404 for an unknown date, 422 for blank.
      - DELETE /trips/{id}: 204, 404 same as other travellers' trips.

      ```python
      @router.put("/{trip_id}/days/{day_date}")
      def rename_day(trip_id: str, day_date: date, body: DayName, owner=Depends(get_current_user), trips=Depends(get_trips)) -> TripView: ...

      @router.delete("/{trip_id}", status_code=204)
      def delete_trip(trip_id: str, owner=Depends(get_current_user), trips=Depends(get_trips)) -> None: ...
      ```
    files:
      - services/api/app/routers/trips.py
    rationale: |
      Keeps ownership in one place (store lookup by owner id) and gives the web app the day, budget and delete operations the acceptance criteria need.
  - description: |
      Web API client. Extend the Trip type with budget, currency, days, options and is_owner, and add renameDay and deleteTrip. call() must accept 204 (no JSON body) and surface a 422 as a ValidationError so the UI can show the message. The existing 404 maps to NotFoundError.

      ```ts
      export type Day = { date: string; name: string }
      export type ChosenOption = { id: string; title: string; category: string; date: string }
      export const renameDay = (id: string, date: string, name: string) => call<Trip>(`/trips/${encodeURIComponent(id)}/days/${date}`, 'PUT', { name })
      export const deleteTrip = (id: string) => call<void>(`/trips/${encodeURIComponent(id)}`, 'DELETE')
      ```
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Single place for fetch calls, matching the current no-cache convention.
  - description: |
      Trip page with Itinerary tab. New TripDetailPage loads the trip and renders (from the prototype screens Itinerary traveller and Itinerary owner) the breadcrumb, h1 trip name, a text-muted line "Budget 1,500.00 EUR" formatted with Intl.NumberFormat and the trip currency, a .tabs bar with Overview and Itinerary (Overview shows the prototype's placeholder text), and the Itinerary panel as a .grid of day cards. Each day card is a section.card.stack.stack-sm with an h3.text-lg date heading ("3 March" plus a short weekday), a .day-name paragraph, and either a ul.options of .option rows (title plus category, left rail border) or an .empty-state ("Nothing chosen for this day yet") showing the date. Dates are formatted with timeZone UTC so 3 March stays 3 March. Owner-only controls render only when trip.is_owner is true: Edit trip (.btn-secondary with edit icon) and a Rename .btn-ghost.btn-sm per day with aria-label "Rename day N, name". A loading skeleton and the existing Trip not found and load-failed states are kept.
      TripSettingsDrawer: right .drawer with .backdrop, role dialog, fields Trip name, Start date, End date, Budget (currency) with .field-hint, .field-error and .is-invalid shown only after submit, focus on the first invalid field, Save .btn-primary (Saving… while pending), Close .btn-ghost, a divider, and Delete trip .btn-ghost with danger colour. Client checks mirror the API: blank name, end before start, negative or non-numeric budget, with prototype copy adjusted (see assumptions). A 422 from the API also shows the message. Saving calls updateTrip, re-renders and shows a .toast "Trip saved".
      RenameDayModal: .modal with field Day name prefilled, error "Day name can't be blank. Enter a name or cancel to keep the old one.", Cancel and Save, then toast "Day renamed to X".
      DeleteTripModal: role alertdialog, "Delete this trip?" with the trip name and day count, Cancel .btn-ghost and Delete trip .btn-danger. Nothing is deleted until confirm; confirm calls deleteTrip, navigates to / with a "Trip deleted" toast; cancel returns to the drawer with the trip intact.
      A small shared Toast and Overlay (focus trap, Escape closes, focus returns to trigger) are added if no equivalent exists in index.css or the codebase. Dates and money use the traveller's local format with the currency always shown.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/trips/TripSettingsDrawer.tsx
      - apps/web/src/trips/RenameDayModal.tsx
      - apps/web/src/trips/DeleteTripModal.tsx
      - apps/web/src/trips/Toast.tsx
      - apps/web/src/trips/TripPage.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/index.css
    rationale: |
      Builds the approved prototype with the project's existing class vocabulary. TripPage routes /trips/new to TripForm (create only) and /trips/:tripId to TripDetailPage. MyTripsPage reads the toast message from router state so "Trip deleted" shows on Trips. index.css only gets drawer/modal/toast/tabs rules if they are missing.
  - description: |
      Remove the edit mode from TripForm (create only) since editing now happens in the settings drawer, and move the old edit tests (prefill, save change, trip not found) to the new page. Update the ownership e2e spec, which opened /trips/abc and looked for the Trip name field, to assert the trip heading instead.
    files:
      - apps/web/src/trips/TripForm.tsx
      - apps/web/src/trips/TripForm.test.tsx
      - apps/web/e2e/ownership.spec.ts
    rationale: |
      Avoids two competing edit surfaces and keeps the existing tests honest.
tests:
  - |
    AC1 (vitest, TripDetailPage.test.tsx). Opening the Itinerary tab shows days.
    ```ts
    stubApi({ 'GET /trips/t1': { status: 200, body: trip({ is_owner: false }) } })
    renderAt('/trips/t1')
    expect(await screen.findByRole('tab', { name: 'Itinerary', selected: true })).toBeInTheDocument()
    expect(screen.getAllByRole('region')).not.toHaveLength(0)
    ```
  - |
    AC2 (pytest, test_trips_router.py, and vitest). API derives exactly three days in order.
    ```python
    r = a.post("/trips", json={"name": "Lisbon", "start_date": "2027-03-03", "end_date": "2027-03-05"})
    days = a.get(f"/trips/{r.json()['id']}").json()["days"]
    assert [d["date"] for d in days] == ["2027-03-03", "2027-03-04", "2027-03-05"]
    ```
    UI: `expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([...])` for 3, 4, 5 March.
  - |
    AC3 (vitest). Each day stack contains only its own options.
    ```ts
    const day1 = within(screen.getByRole('region', { name: /3 March/ }))
    expect(day1.getByText('Tram pass')).toBeInTheDocument()
    expect(day1.queryByText('Belém Tower tickets')).not.toBeInTheDocument()
    ```
  - |
    AC4 (vitest). An option dated 4 March appears in the 4 March stack.
    ```ts
    expect(within(screen.getByRole('region', { name: /4 March/ })).getByText('Belém Tower tickets')).toBeInTheDocument()
    ```
  - |
    AC5 (pytest and vitest). Owner renames the trip.
    ```python
    a.put(f"/trips/{tid}", json={"name": "Lisbon Spring", "start_date": "2027-03-03", "end_date": "2027-03-05"})
    assert a.get(f"/trips/{tid}").json()["name"] == "Lisbon Spring"
    ```
    UI: open Edit trip, change Trip name, click Save, `expect(await screen.findByRole('heading', { level: 1, name: 'Lisbon Spring' })).toBeInTheDocument()`.
  - |
    AC6 (pytest and vitest). Renaming day 1.
    ```python
    r = a.put(f"/trips/{tid}/days/2027-03-03", json={"name": "Arrival"})
    assert r.json()["days"][0]["name"] == "Arrival"
    ```
    UI: click "Rename day 1, Day 1", type Arrival, Save, `expect(await screen.findByText('Arrival')).toBeInTheDocument()`.
  - |
    AC7 (pytest and vitest). Budget changes to 1500.
    ```python
    a.put(f"/trips/{tid}", json={"name": "Lisbon", "budget": 1500})
    assert a.get(f"/trips/{tid}").json()["budget"] == 1500
    ```
    UI: `expect(await screen.findByText(/1,500\.00/)).toBeInTheDocument()` with the currency shown.
  - |
    AC8 (vitest). Non-owner sees no controls. The API cannot yet serve a non-owner (no sharing), so this uses is_owner false in a stubbed response.
    ```ts
    expect(screen.queryByRole('button', { name: 'Edit trip' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rename day/ })).not.toBeInTheDocument()
    ```
  - |
    AC9 (vitest). Delete trip opens a confirmation and does not delete.
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Delete trip' }))
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    ```
  - |
    AC10 (pytest and vitest). Confirm deletes.
    ```python
    assert a.delete(f"/trips/{tid}").status_code == 204
    assert a.get(f"/trips/{tid}").status_code == 404
    ```
    UI: click the .btn-danger "Delete trip" inside the alertdialog, then `expect(DELETE call).toBeTruthy()` and the Trips page shows "Trip deleted".
  - |
    AC11 (vitest). Cancel keeps the trip.
    ```ts
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    ```
  - |
    AC12 (vitest). Non-owner sees no Delete trip control: `expect(screen.queryByRole('button', { name: 'Delete trip' })).not.toBeInTheDocument()`. Also a pytest that another traveller gets 404 on DELETE and the trip survives.
  - |
    AC13 (pytest and vitest). Blank or whitespace trip name refused.
    ```python
    assert a.put(f"/trips/{tid}", json={"name": "   "}).status_code == 422
    assert a.get(f"/trips/{tid}").json()["name"] == "Lisbon"
    ```
    UI: save with "   ", `expect(await screen.findByRole('alert')).toHaveTextContent("Trip name can't be blank")`, no PUT sent, heading still "Lisbon".
  - |
    AC14 (pytest and vitest). Blank day name refused.
    ```python
    assert a.put(f"/trips/{tid}/days/2027-03-03", json={"name": " "}).status_code == 422
    assert a.get(f"/trips/{tid}").json()["days"][0]["name"] == "Day 1"
    ```
  - |
    AC15 (pytest and vitest). Negative budget refused.
    ```python
    assert a.put(f"/trips/{tid}", json={"name": "Lisbon", "budget": -5}).status_code == 422
    ```
    UI: type -5, Save, error text shown, budget line still 1,500.00.
  - |
    AC16 (pytest and vitest). Non-numeric budget refused.
    ```python
    assert a.put(f"/trips/{tid}", json={"name": "Lisbon", "budget": "abc"}).status_code == 422
    ```
    UI: type abc, Save, error shown, no PUT sent.
  - |
    AC17 (pytest). Days kept across a date change.
    ```python
    a.put(f"/trips/{tid}/days/2027-03-04", json={"name": "Beach day"})
    after = a.put(f"/trips/{tid}", json={"name": "Lisbon", "start_date": "2027-03-04", "end_date": "2027-03-06"}).json()
    assert {d["date"]: d["name"] for d in after["days"]}["2027-03-04"] == "Beach day"
    ```
    Also a unit test of reconcile_days for 5 March.
  - |
    AC18 (pytest). A new 6 March day is added: `assert "2027-03-06" in [d["date"] for d in after["days"]]`.
  - |
    AC19 (pytest). 3 March is removed: `assert "2027-03-03" not in [d["date"] for d in after["days"]]`.
  - |
    AC20 (vitest). Empty day stack still shows its date.
    ```ts
    const day3 = within(screen.getByRole('region', { name: /5 March/ }))
    expect(day3.getByText('Nothing chosen for this day yet')).toBeInTheDocument()
    ```
  - |
    Store and rollout tests (pytest, test_trip_store.py, parametrised over memory and Dynamo fakes). FakeTable gains delete_item. Legacy items still load.
    ```python
    def test_legacy_trip_item_without_days_or_budget_loads(store):
        store._table.items[("USER#o", "TRIP#t1")] = {"pk": "USER#o", "sk": "TRIP#t1", "id": "t1", "name": "Old"}
        t = store.get_trip("o", "t1")
        assert t.days == [] and t.budget is None
    def test_dynamo_budget_saved_as_decimal():
        store.save_trip("o", Trip(id="t1", name="x", budget=1500.5))
        assert isinstance(store._table.items[("USER#o", "TRIP#t1")]["budget"], Decimal)
    ```
    Also a router test that GET on a legacy trip with dates and no stored days returns derived days.
  - |
    Playwright (ownership.spec.ts and a new itinerary.spec.ts, API stubbed at the network edge). At 375px width: open /trips/abc, Itinerary tab shows stacks in one column; owner opens Edit trip, sets "Lisbon Spring", saves and sees the toast.
assumptions_or_open_questions:
  - |
    Conflict between design and AC on budget: the prototype refuses 0 ("Budget must be a positive number") while AC15 only refuses negative values. The plan follows the AC (0 accepted, negative refused) and rewrites the error copy to "Budget can't be negative or text. Enter an amount like 1500." Please confirm, or say if 0 should also be refused.
  - |
    The prototype date-range errors (end before start, more than 60 days) and the "No trips yet" empty state are marked in the design as added beyond the wireframe. They are included, because days are derived from dates and an unbounded range would create unbounded items.
  - |
    No non-owner can open a trip today, because every lookup is keyed by owner and returns 404 for anyone else. ACs 8 and 12 are therefore verified at the component level with is_owner false, and the API returns is_owner true. Sharing (out of scope) will flip it.
  - |
    Chosen options do not exist yet (the category epics are not built). The plan adds a read-only options list on the trip, placed by date, that the request body cannot set. Tests seed it through the store. The category epics will own how options are written. Options outside the trip's days are not shown.
  - |
    Currency is not in the ACs. The prototype shows EUR, and the guidelines require the currency on every amount, so Trip gets currency defaulting to "EUR", not editable in this item. The drawer label reads "Budget (EUR)".
  - |
    A trip with no dates has no days, so the itinerary shows an empty state pointing to Edit trip, which sets dates. This is an assumption; the design only shows dated trips.
  - |
    The Overview tab is only the prototype's placeholder text; the other tabs from the guidelines (Bookings, Budget, Travelers) are not added.
  - |
    The prototype's Delete confirm button uses .btn-danger, which matches the guidelines, and delete lives inside the settings drawer as drawn.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: no migration. DynamoDB is schemaless; Trip items already stored have no budget, currency, days or options. The model defaults (budget None, currency "EUR", days [], options []) keep them readable, and GET derives days from the stored dates when the list is empty, without writing.
  - **Backfill / seed**: none needed. A legacy trip's days are persisted the first time the owner saves it, and reconcile_days is idempotent, so re-saving is safe.
  - **Settings**: none.
  - **Provisioning**: none. The table and the owner partition key (USER#id, TRIP#id) are unchanged, and the API role already used for put_item and get_item needs dynamodb:DeleteItem for the new delete. Check the IaC policy for that action before deploy.
  - **Order and rollback**: deploy the API first, then the web app. The old web app still works against the new API because new fields are additive and PUT keeps days, options and currency. Roll back by redeploying the previous version; extra attributes on items are ignored by the old model, and a deleted trip is not recoverable.

  The Dynamo budget conversion is the risky bit: boto3 refuses Python floats, so a plain model_dump would pass unit tests against the fake table and fail in production. The test above asserts Decimal.

  ```mermaid
  flowchart TD
    App[App.tsx routes] --> TripPage
    TripPage -->|create only| TripForm
    TripPage --> TripDetailPage
    TripDetailPage --> ItineraryTab
    TripDetailPage --> TripSettingsDrawer
    TripDetailPage --> RenameDayModal
    TripDetailPage --> DeleteTripModal
    TripDetailPage --> api[trips/api.ts]
    MyTripsPage --> api
    api -->|HTTP| Router[routers/trips.py]
    Router --> Store[trips/store.py]
    Store --> Dynamo[(Trip Database)]
    classDef touched fill:#f96,color:#000
    class TripPage,TripForm,TripDetailPage,ItineraryTab,TripSettingsDrawer,RenameDayModal,DeleteTripModal,api,MyTripsPage,Router,Store touched
  ```

  Touched nodes are new or changed: the router and store carry days, budget and delete; api.ts adds renameDay and deleteTrip; TripPage switches between create and detail; MyTripsPage shows the delete toast.

  Prototype elements used: crumbs, title-row, tabs, grid of section.card day cards, .options rail rows, .empty-state, settings .drawer, rename and delete .modal, .toast. The design file is a standalone prototype: its script and the "reviewer bar" are not reproduced.
review_focus: |
  IN: Itinerary tab, owner-only trip name, day name, budget and dates edits, delete with confirmation, and server-derived days. OUT: adding activities, cost totals, sharing, and the other trip tabs. Riskiest: the PUT that recomputes days (it must keep day names and options) and the Dynamo float-to-Decimal conversion for budget. Deliberate: non-owner behaviour is only testable via is_owner false because sharing does not exist yet, and budget 0 is accepted per the AC even though the prototype refuses it.
