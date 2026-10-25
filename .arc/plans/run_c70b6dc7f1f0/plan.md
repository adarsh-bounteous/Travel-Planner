summary: |
  Let a traveller keep several stays on one trip, each with its own place and date range. The Trip Planner API gains a `Stay` record
  (id, place, start_date, end_date) stored on the Trip item as `stays`, plus add, change and remove routes that refuse a missing place,
  a missing date, or an end date before the start date. The web app gains a Stays section on the trip page that follows the approved
  prototype: stays as a date-ordered stack of cards, an add/edit drawer, an overlap warning modal and a gap warning modal that never block
  ("Save anyway" / "Change dates"), a remove confirmation, and a saved toast. Overlaps and gaps are WARN, not block (the open question in
  the story is answered by the design). The trips list shows each trip's stay count. Finding options, the shortlist and picking stay
  with the neighbouring stories.
scope:
  - description: |
      API model. Add `StayFields` (place: trimmed 1..120 chars, start_date: date, end_date: date, with a model validator that raises
      when end_date < start_date) and `Stay(StayFields)` with `id: str`. Add `stays: list[Stay] = []` to `Trip`, marked server-owned
      (changed only through the stay routes), so `TripFields` and PUT /trips/{id} can never overwrite it.
      Signature: `class Stay(StayFields): id: str`. A stored Trip item without `stays` still loads (default empty list).
    files:
      - services/api/app/trips/store.py
    rationale: |
      Same pattern as Activity / Reminder / TripPlace: server-owned list on the Trip, so the DynamoDB item and the in-memory store both carry it
      with no schema change. `_view` already uses `trip.model_dump()`, so stays reach the web through TripView automatically.
  - description: |
      API routes, all using `_editable_trip` (owner or accepted editor, like activities and reminders) and `_view`:
      `POST /trips/{trip_id}/stays` (201, body StayFields), `PUT /trips/{trip_id}/stays/{stay_id}` (body StayFields, 404 for an unknown id),
      `DELETE /trips/{trip_id}/stays/{stay_id}` (404 for an unknown id). Add `INVALID_STAY = ApiError(422, "invalid_stay")`
      and `MAX_STAYS = 50` (keeps the Trip item under DynamoDB's 400 KB limit; the 51st add is refused with INVALID_STAY). A shared
      `_save_stays(trips, rates, user, owner, trip, stays, now)` mirrors `_save_activities`. Stays are stored in the order given;
      the web sorts by start date. Overlap and gap are NOT checked server-side: they are warnings the traveller can accept, so the server
      saves them.
    files:
      - services/api/app/routers/trips.py
    rationale: |
      Removing a stay rewrites only that trip's `stays` list, which is what makes AC5 hold (the other trip is a different Trip item,
      keyed by owner and trip id). Missing place/start/end are refused by pydantic (422) and a reversed range by the model validator (422).
  - description: |
      Web API client. Add types `Stay = { id: string; place: string; start_date: string; end_date: string }` and
      `StayInput = { place: string; start_date: string; end_date: string }`; add `stays?: Stay[]` to `Trip`; add
      `addStay(tripId, input)`, `updateStay(tripId, id, input)`, `removeStay(tripId, id)`, each returning `Trip`
      through the existing `call`.
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Same shape as addActivity / removeActivity; a 422 already becomes `ValidationError`.
  - description: |
      Pure stay rules, no React. `validateStay(input: StayInput): { place?: string; dates?: string; startBad: boolean; endBad: boolean }`
      with the exact messages from the prototype: "Place is missing. Enter a place for this stay.", "Start date and end date are missing.
      Choose when the stay starts and ends.", "Start date is missing. Choose when the stay starts.", "End date is missing. Choose when
      the stay ends.", "The dates are invalid. The end date is before the start date."
      `warningFor(stay, others): StayWarning | null` where `StayWarning` is `{ kind: 'overlap'; other: Stay } | { kind: 'gap'; before: Stay; after: Stay; from: string; to: string }`.
      Overlap when `stay.start <= other.end && stay.end >= other.start` (same rule as the prototype `warningFor`, so a shared day counts);
      otherwise a gap when the nearest earlier stay ends, or the nearest later stay starts, more than one day away. Plus `sortStays`,
      `nights(stay)` and `formatRange(start, end)` ("1 to 5 January", "30 January to 2 February", UTC, en-GB like `formatDay` in ItineraryTab).
    files:
      - apps/web/src/trips/stays.ts
    rationale: |
      Keeps the AC6-AC13 logic unit-testable without rendering. Mirrors the existing `tripBasics.ts` / `profileAnswers.ts` split of
      pure helpers from components. ISO date strings compare correctly as strings, as the prototype relies on.
  - description: |
      `StaysSection` component for the trip page, following the prototype screens "Trip with no stays" and "Trip with stays":
      `<section className="stack" aria-labelledby>` with a `.title-row` holding `<h2>Stays</h2>` and one `.btn-primary` "Add stay" (PlusIcon);
      no stays renders `.empty-state` with a house icon and "No stays yet. Add a place and dates for this trip."; stays render as a `.stack`
      of `.card`s in start-date order, each with the place (`--font-size-lg`, bold), the dates plus "(4 nights)" in `.text-muted`, a
      `.btn-secondary` "Edit stay" and a `.btn-ghost` "Remove" in a `.cluster`, and a `.badge.badge-warning` ("Overlaps Porto" or
      "Gap next to this stay") under the dates when `warningFor` finds one (as the prototype does, so a saved warning is not lost). Edit and
      Remove only for `canEdit`; others see the list only. On phones the card actions wrap under the details (`.row-between` behaviour).
    files:
      - apps/web/src/trips/StaysSection.tsx
    rationale: |
      Order matters more than comparison, so a stack of cards, not a table (UI guidelines; prototype note on date order).
  - description: |
      `StayDrawer` (add and edit) built on `Overlay kind="drawer"`, heading "Add stay" or "Edit stay", fields `Place` (text, placeholder
      "City or area", hint "Where you will be staying, like Lisbon or the Algarve."), `Start date` and `End date` (`type="date"`) in `.field`s,
      actions "Cancel" (`.btn-ghost`) and "Save stay" (`.btn-primary`, "Saving…" and disabled while pending). Errors appear only after Save,
      as `.field-error` with `role="alert"` and an alert icon beside the field, with `.is-invalid` and `aria-invalid`/`aria-describedby`
      on the controls, keep what was typed, then re-validate on input and disable Save until fixed (prototype "Add stay with errors").
      On a valid Save: compute `warningFor(draft, otherStays)`. No warning, or the traveller already chose "Save anyway": call
      `addStay`/`updateStay` and report `onSaved(trip, verb)`. Otherwise show `StayWarningModal`.
      A failed request shows "We couldn't save that stay. Try again." as `.field-error` with `role="alert"`.
    files:
      - apps/web/src/trips/StayDrawer.tsx
    rationale: |
      A drawer keeps the trip visible while editing in context (guidelines). The warning check runs after the field validation so a refused
      save never reaches the warning step (AC10-AC13 before AC6-AC9).
  - description: |
      `StayWarningModal` (`Overlay kind="modal" role="alertdialog"`, `.modal-title` with an alert icon in `--color-warning`) used for both
      warnings. Overlap heading "These dates overlap another stay", text "1 to 5 January in Lisbon overlaps 4 to 8 January in Porto."
      Gap heading "There is a gap between stays", text "No stay covers 6 to 9 January between Lisbon and Porto." Actions
      "Change dates" (`.btn-secondary`, returns to the drawer with values kept) and "Save anyway" (`.btn-primary`, saves).
      `RemoveStayModal` (`Overlay kind="modal" role="alertdialog"`): heading "Remove this stay?", text "Lisbon, 1 to 5 January will be removed
      from this trip.", actions "Cancel" (`.btn-ghost`) and "Remove" (`.btn-primary`; "Removing…" while pending); a failure shows
      "We couldn't remove that stay. Try again." Modelled on `RemoveActivityModal`.
    files:
      - apps/web/src/trips/StayWarningModal.tsx
      - apps/web/src/trips/RemoveStayModal.tsx
    rationale: |
      Warning modals name the exact days and keep Save anyway next to Change dates so a warning never blocks (prototype notes).
  - description: |
      Wire into the trip page. Extend `Panel` with `{ id: 'add-stay' } | { id: 'edit-stay'; stay: Stay } | { id: 'remove-stay'; stay: Stay }`;
      add a "Stays" entry to `TABS` and `Tab` and render `<StaysSection>` for it, with `saved(updated, message)` giving the toast
      "Stay saved. 2 stays in this trip." / "Stay updated. 2 stays in this trip." / "Removed Lisbon, 1 to 5 January." (prototype toast texts).
      Edit and Remove panels are guarded by `canEdit`, like activities. Add `HomeIcon` for the empty state.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/auth/icons.tsx
    rationale: |
      Reuses the page's existing panel/toast state and `saved` helper. The prototype's trip page shows Stays with no tab bar, but the
      real page already has Overview / Itinerary / Travelers tabs and the UI guidelines say a trip uses `.tabs`, so Stays becomes a tab; see the
      open questions.
  - description: |
      Trips list stay count (prototype "Trips" screen, AC5 note): in `TripRow` show `.text-sm.text-muted` "2 stays", "1 stay" or "No stays yet"
      from `trip.stays?.length ?? 0`.
    files:
      - apps/web/src/trips/MyTripsPage.tsx
    rationale: |
      Lets AC5 be seen from the list: removing a stay from one trip leaves the other trip's count alone.
  - description: |
      Styles: add only what the prototype defines that index.css lacks, built from tokens: `.row-between`, `.stay-place`, `.stay-flags`,
      `.modal-title`, `.actions-end` if not already covered by `.overlay-actions.end` (prefer reuse of `.title-row` and `.overlay-actions.end`).
    files:
      - apps/web/src/index.css
    rationale: |
      Match the prototype spacing (`--space-2`/`--space-3`) and keep single column on phones; no fixed column counts.
tests:
  - |
    AC1, API (services/api/tests/unit/test_stays_router.py). Written first, fails with 404 until the route exists:
    ```python
    def test_owner_adds_a_stay_to_a_trip_with_none(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = _trip(a)
        r = _add(a, tid, "Lisbon", "2027-01-01", "2027-01-05")
        assert r.status_code == 201
        assert [(s["place"], s["start_date"], s["end_date"]) for s in r.json()["stays"]] == [("Lisbon", "2027-01-01", "2027-01-05")]
        assert a.get(f"/trips/{tid}").json()["stays"][0]["place"] == "Lisbon"
    ```
  - |
    AC1, store (test_trip_store.py): a stored trip from before this story still loads and lists nothing, which is the existing-data check.
    ```python
    def test_stored_trip_without_stays_still_loads():
        assert Trip.model_validate({"id": "t1", "name": "Old"}).stays == []
    ```
  - |
    AC2, API: a second stay in a different place is a separate stay.
    ```python
    r = _add(a, tid, "Porto", "2027-01-10", "2027-01-12")
    assert [s["place"] for s in r.json()["stays"]] == ["Lisbon", "Porto"]
    assert len({s["id"] for s in r.json()["stays"]}) == 2
    ```
  - |
    AC3, API: changing a stay's place and dates keeps its id and the other stays.
    ```python
    r = a.put(f"/trips/{tid}/stays/{sid}", json={"place": "Faro", "start_date": "2027-01-02", "end_date": "2027-01-06"})
    assert [(s["place"], s["start_date"], s["end_date"]) for s in r.json()["stays"] if s["id"] == sid] == [("Faro", "2027-01-02", "2027-01-06")]
    assert a.put(f"/trips/{tid}/stays/nope", json=BODY).status_code == 404
    ```
  - |
    AC4, API: removing deletes it; a second delete is a 404.
    ```python
    r = a.delete(f"/trips/{tid}/stays/{sid}")
    assert r.status_code == 200 and r.json()["stays"] == []
    assert a.delete(f"/trips/{tid}/stays/{sid}").status_code == 404
    ```
  - |
    AC5, API: two trips with one stay each; removing from the first leaves the second untouched.
    ```python
    a.delete(f"/trips/{first}/stays/{first_stay}")
    assert [(s["place"], s["start_date"], s["end_date"]) for s in a.get(f"/trips/{second}").json()["stays"]] == [("Porto", "2027-01-10", "2027-01-12")]
    ```
    And in the web (TripDetailPage / MyTripsPage tests): after Remove, the list for the trip shows "No stays yet" while the trips list still shows "1 stay" for the other trip.
  - |
    AC6 and AC7, unit (apps/web/src/trips/stays.test.ts) and component (Stays.test.tsx). Unit:
    ```ts
    const lisbon: Stay = { id: 's1', place: 'Lisbon', start_date: '2027-01-01', end_date: '2027-01-05' }
    expect(warningFor({ id: 's2', place: 'Porto', start_date: '2027-01-04', end_date: '2027-01-08' }, [lisbon])).toMatchObject({ kind: 'overlap', other: lisbon })
    ```
    Component: fill Porto, 2027-01-04 to 2027-01-08 and click "Save stay", then
    ```ts
    expect(await screen.findByRole('alertdialog', { name: 'These dates overlap another stay' })).toBeInTheDocument()
    expect(screen.getByText('1 to 5 January in Lisbon overlaps 4 to 8 January in Porto.')).toBeInTheDocument()
    expect(sent(fetchMock, 'POST')).toHaveLength(0) // nothing saved until Save anyway
    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }))
    await waitFor(() => expect(sent(fetchMock, 'POST')).toHaveLength(1)) // AC7: the second stay is saved
    expect(await screen.findByText('Porto')).toBeInTheDocument()
    ```
    API (AC7, server does not block an overlap): `_add(a, tid, "Porto", "2027-01-04", "2027-01-08").status_code == 201` after a 1 to 5 January stay.
  - |
    AC8 and AC9, unit and component. Unit:
    ```ts
    expect(warningFor({ id: 's2', place: 'Porto', start_date: '2027-01-10', end_date: '2027-01-12' }, [lisbon])).toMatchObject({ kind: 'gap', from: '2027-01-06', to: '2027-01-09' })
    expect(warningFor({ id: 's3', place: 'Porto', start_date: '2027-01-06', end_date: '2027-01-08' }, [lisbon])).toBeNull() // back to back, no gap
    ```
    Component: after Save stay for 10 to 12 January, `findByRole('alertdialog', { name: 'There is a gap between stays' })` and
    `getByText('No stay covers 6 to 9 January between Lisbon and Porto.')`; click "Save anyway" and one POST is sent with
    `{ place: 'Porto', start_date: '2027-01-10', end_date: '2027-01-12' }` (AC9). API: the same range returns 201.
  - |
    AC10 and AC11, API refusal then web message. API, for each of place, start_date and end_date left out or blank:
    ```python
    for body in ({"start_date": S, "end_date": E}, {"place": "  ", "start_date": S, "end_date": E}, {"place": "Lisbon", "end_date": E}, {"place": "Lisbon", "start_date": S}):
        assert a.post(f"/trips/{tid}/stays", json=body).status_code == 422
    assert a.get(f"/trips/{tid}").json()["stays"] == []
    ```
    Web: for each missing field click "Save stay" and assert the refusal and the field name, with no request sent:
    ```ts
    expect(await screen.findByText('Place is missing. Enter a place for this stay.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Place' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Start date is missing. Choose when the stay starts.')).toBeInTheDocument()
    expect(screen.getByText('End date is missing. Choose when the stay ends.')).toBeInTheDocument()
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
    ```
    No error is shown before Save is pressed (errors only after submit, per the guidelines).
  - |
    AC12 and AC13, API then web. API:
    ```python
    r = _add(a, tid, "Lisbon", "2027-01-08", "2027-01-04")
    assert r.status_code == 422
    assert a.get(f"/trips/{tid}").json()["stays"] == []
    assert a.put(f"/trips/{tid}/stays/{sid}", json={"place": "Lisbon", "start_date": "2027-01-08", "end_date": "2027-01-04"}).status_code == 422
    ```
    Web: with start 2027-01-08 and end 2027-01-04 click "Save stay":
    ```ts
    expect(await screen.findByText('The dates are invalid. The end date is before the start date.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save stay' })).toBeDisabled()
    expect(sent(fetchMock, 'POST')).toHaveLength(0)
    ```
    Fixing the end date re-enables Save (live re-validation after the first submit).
  - |
    Access and limits (API): a stranger gets 404 and a read-only viewer cannot change stays; an accepted editor can add (same rule as activities); the 51st stay returns `{"code": "invalid_stay"}` with status 422.
    PUT /trips/{id} with `{"name": ..., "stays": [...]}` leaves stays untouched (server-owned).
  - |
    Web display (AC1, AC2, AC3, AC4): empty trip shows "No stays yet. Add a place and dates for this trip." with one "Add stay" button; two stays render as two cards in start-date order with "1 to 5 January" and "(4 nights)"; Edit stay opens the drawer prefilled under the heading "Edit stay" and the changed values replace the card; Remove opens "Remove this stay?" naming "Lisbon, 1 to 5 January", Cancel sends nothing, Remove sends one DELETE and the card is gone; the toast text is "Stay saved. 2 stays in this trip."
    A viewer without `can_edit` sees the cards without Add, Edit or Remove.
assumptions_or_open_questions:
  - |
    The prototype shows the Stays section on its own page with no tab bar, but the real trip page already has tabs (Overview, Itinerary, Travelers) and the UI guidelines say a trip uses `.tabs`. I plan Stays as a fourth tab ("Stays") rather than replacing the page. If the reviewer would rather have Stays shown above the tabs, only TripDetailPage.tsx changes.
  - |
    The prototype makes the remove confirmation button `.btn-primary`, while the guidelines reserve `.btn-danger` for irreversible actions such as deleting a trip. The prototype's own note keeps it primary for a stay; I follow the prototype.
  - |
    Overlaps and gaps WARN and never block, as the prototype answers the story's open question. The checks live in the web (as in the prototype); the API does not repeat them. If the reviewer wants the API to report them too, that is a follow-up.
  - |
    A stay with end date equal to start date is accepted (0 nights); only an end date before the start date is invalid, matching AC12 and the prototype. A shared day (one stay ends 5 January, the next starts 5 January) counts as an overlap, as in the prototype's rule.
  - |
    Gap rule from the prototype: a gap is reported when the nearest neighbouring stay is more than one day away from the saved stay, so stays that sit back to back (5 January then 6 January) raise no warning. A warning is shown for the one neighbour found, not for every gap on the trip.
  - |
    The place is a free-text field (prototype: "City or area"), not a pick from the places catalogue. Linking a stay to a catalogue place is left to the neighbouring "find options" story.
  - |
    Stays are not required to fall inside the trip's own start and end dates, since no AC says so. Not validated.
  - |
    Editors who can change the plan (`can_edit`) may add, change and remove stays, as for activities and reminders; the read-only share page does not show stays, since the Shared trip page is outside this story.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: no migration. `Trip.stays` defaults to an empty list, and `DynamoTripStore._to_trip` validates stored items through `Trip.model_validate`, so every trip saved before this story loads unchanged with no stays. DynamoDB is schemaless, so the new attribute simply appears on the next save of a trip.
  - **Backfill / seed**: none needed; nothing reads `stays` as required.
  - **Settings**: none. `MAX_STAYS = 50` is a constant in `services/api/app/routers/trips.py`, like MAX_ACTIVITIES.
  - **Provisioning**: none; same table, same item.
  - **Order and rollback**: deploy API and web together or API first (the web tolerates a missing `stays` with `trip.stays ?? []`). To roll back, redeploy the previous version: the extra `stays` attribute on stored items is ignored by the old model on read, but the old code's next save of that trip would drop it, so stays added after release would be lost on rollback. Safe to leave in place otherwise.
  - Existing-data test: `test_stored_trip_without_stays_still_loads` (listed in `tests`).

  ### Shape

  ```mermaid
  flowchart TD
    Router[routers/trips.py<br/>stay routes] --> Store[trips/store.py<br/>Stay + Trip.stays]
    Router --> Deps[routers/deps.py get_trips]
    Store --> Dynamo[DynamoTripStore.save_trip]
    Api[web trips/api.ts<br/>addStay updateStay removeStay] --> Router
    Detail[TripDetailPage.tsx<br/>Stays tab and panels] --> Api
    Detail --> Section[StaysSection.tsx]
    Detail --> Drawer[StayDrawer.tsx]
    Drawer --> Rules[stays.ts<br/>validateStay warningFor]
    Drawer --> Warn[StayWarningModal.tsx]
    Detail --> Remove[RemoveStayModal.tsx]
    Section --> Rules
    Trips[MyTripsPage.tsx<br/>stay count] --> Api
    Detail --> Overlay[Overlay.tsx]
    classDef touched fill:#f96,color:#000
    class Router,Store,Api,Detail,Section,Drawer,Rules,Warn,Remove,Trips touched
  ```

  Orange nodes are new or changed. Overlay.tsx, deps.py and DynamoTripStore are reused unchanged.

  ### Mirrors
  The API side mirrors the activity routes (`add_activity`, `move_activity`, `remove_activity`) and `_save_activities`; the web side mirrors `AddActivityDrawer` and `RemoveActivityModal` on the shared `Overlay`. Domain nouns follow the glossary use in the code: Trip, Stay, Place.

  ### Design reference
  Prototype screens read: Trips (stay count), Trip with no stays, Trip with stays, Add stay (drawer), Add stay with errors, Overlapping dates warning, Gap between stays warning, Remove stay. The prototype is only a UI mock with a fake in-page store; the real behaviour is API-backed. Dates and counts are shown as "1 to 5 January (4 nights)". The prototype shows no currency, which is correct: stays carry no money.

  ### Process
  Write each failing test first (API, then web), see it fail for the right reason, then add the minimum code. Run `cd services/api && uv run pytest` and `cd apps/web && pnpm vitest run`; also `pnpm tsc --noEmit` and the project's lint.
review_focus: |
  IN scope: add/change/remove a stay on a trip (API routes plus web Stays tab, drawer and modals), refusal of missing place/dates and reversed dates, warn-but-allow for overlaps and gaps, and the stay count on the trips list. OUT: finding options, shortlist, picking, linking a stay to a catalogue place, and any date-range checks against the trip's own dates.
  Riskiest part: the web save flow ordering (field validation first, then overlap/gap warning, then request) and keeping the warning rules identical to the prototype (shared day counts as overlap, gap only when more than one day apart). Deliberate choices: warnings are computed in the web only and never block on the API; Stays is a tab rather than the prototype's tab-less page; the remove confirmation button is primary, as in the prototype; no data migration because `stays` defaults to an empty list.
