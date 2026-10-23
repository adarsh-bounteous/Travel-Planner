summary: |
  Add dated in-app reminders to the trip itinerary. A Reminder belongs to the whole trip or to one chosen option (the glossary's "activity" in the itinerary), carries a text and a calendar date inside the trip's days, and is stored embedded on the Trip item in the Trip Database. The API gets add, edit and delete routes that only someone who can edit the trip may call. The Trip response carries the reminders, with an activity's reminders left out once its option has moved to another day or left the trip. The itinerary shows each reminder as a dotted-rail note with a bell and date badge inside the day it is dated for. Editors get the Add reminder, Edit and Delete controls from the approved prototype, and read-only viewers get none of them. No email or push delivery is built.
scope:
  - description: |
      API model and rules in the trip store module. Add a `Reminder` model, `ReminderFields` (request body) and `Trip.reminders: list[Reminder] = []`.

      ```python
      ReminderText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=280)]

      class ReminderFields(BaseModel):
          text: ReminderText
          date: date
          option_id: str | None = None   # None = the whole trip

      class Reminder(ReminderFields):
          id: str
          option_date: date | None = None  # the option's day when attached; hides the note if the option later moves

      def visible_reminders(trip: Trip) -> list[Reminder]: ...   # drops notes whose option is gone or on another day than option_date
      def can_edit_trip(trip: Trip, user_id: str, owner_id: str) -> bool: ...  # the single rule: owner or editor
      ```

      `visible_reminders` keeps trip-level reminders and activity reminders where `option_id` matches an option in `trip.options` and `option.date == reminder.option_date`. Dates are validated against `trip.days`.
    files:
      - services/api/app/trips/store.py
    rationale: |
      Reminders are small and always read with the trip, so they are embedded on the existing Trip item. This avoids a new table, a migration and a second round trip, and `DynamoTripStore._to_trip` already validates missing keys to the default `[]`. Deriving visibility (instead of relying on a cascade) is what makes criterion 8 hold wherever options get moved or removed.
  - description: |
      API routes under `/trips/{trip_id}/reminders`: `POST` (201, returns TripView), `PUT /{reminder_id}`, `DELETE /{reminder_id}` (returns TripView, so the client re-renders from server truth). Every route loads the trip, answers 404 `not_found` for a trip the caller cannot reach, then 403 `forbidden` if `can_edit_trip` is false. A date outside the trip's days or an `option_id` that is not on the trip gives 422 `invalid_reminder`; blank text gives 422 through the model. `TripView` gains `can_edit: bool = True` and its `reminders` are replaced by `visible_reminders(trip)` in every route that returns a TripView, including `get_trip`. Writes also drop stale activity reminders before saving so a note cannot reappear if an option later returns to its old day.
    files:
      - services/api/app/routers/trips.py
    rationale: |
      Follows the existing router pattern (`get_current_user`, `get_trips`, `ApiError`, `get_now`). Only the owner can reach a trip today because sharing is a separate story, so `can_edit` is true for the owner. The one `can_edit_trip` rule is the single place where the editor role plugs in later, so owner and editor cannot diverge.
  - description: |
      Web API client and types: `Reminder` type, `Trip.reminders?: Reminder[]`, `Trip.can_edit?: boolean`, and

      ```ts
      export const addReminder = (tripId: string, input: ReminderInput) => call<Trip>(`/trips/${encodeURIComponent(tripId)}/reminders`, 'POST', input)
      export const updateReminder = (tripId: string, id: string, input: ReminderInput) => call<Trip>(`/trips/${encodeURIComponent(tripId)}/reminders/${encodeURIComponent(id)}`, 'PUT', input)
      export const deleteReminder = (tripId: string, id: string) => call<Trip>(`/trips/${encodeURIComponent(tripId)}/reminders/${encodeURIComponent(id)}`, 'DELETE')
      ```

      A 403 maps to a new `ForbiddenError`, next to the existing `NotFoundError` and `ValidationError`.
    files:
      - apps/web/src/trips/api.ts
    rationale: Same `call` helper and no client cache, so every device shows the same reminders.
  - description: |
      Itinerary rendering from the prototype's `dayHtml`/`noteHtml`. In each day `.card`, after the chosen options, render a `.note` per reminder dated that day: bell icon, `.badge` with a calendar icon and the date (`formatDay`, e.g. "4 March"), `.note-text`, and a ghost "Edit" button (`aria-label="Edit reminder: <text>"`) only when `trip.can_edit ?? trip.is_owner`. A reminder attached to an activity renders under that option's `.option` in `.notes` when it is on the option's day. Otherwise it renders in its own day with a muted "for <activity>" suffix (`.note-for`). Each editable `.option` gets a ghost "Add reminder" button with a plus icon (`aria-label="Add reminder to <title>"`). The day-card empty state "Nothing chosen for this day yet" is kept when a day has no options, per the existing component, even if it has notes.
    files:
      - apps/web/src/trips/ItineraryTab.tsx
    rationale: Extends the existing day stack; viewers get the same notes with no controls, matching the prototype's "Itinerary (read-only viewer)" screen.
  - description: |
      New `ReminderModal` (one component, add and edit modes) built on the existing `Overlay kind="modal"` like `RenameDayModal`. Fields follow the prototype's Add and Edit modals: "Attach to" `.select` (Whole trip, or each chosen option; preselected from where Add reminder was pressed; shown in add mode only, with the edit modal instead showing a muted "Attached to ..." line), "Reminder" `.input` (placeholder "What to remember"), and "Date" `<input type="date">` with `min` and `max` set to the trip's first and last day. The date hint reads "Pick a day from 3 to 5 March. The note shows in the itinerary on that day. In-app only: no email or push." Errors are shown after submit only: "Write what to remember, then save." and "That date isn't on this trip. Pick a day from 3 to 5 March." Save is `.btn-primary`, disables and reads "Saving…" while pending, and Cancel is `.btn-ghost`. In edit mode a ghost "Delete" button with a trash icon sits on the left (`.overlay-actions` space-between). Delete is immediate with an Undo toast, as the prototype shows (no confirmation modal), and Undo re-adds the reminder via `addReminder`.
    files:
      - apps/web/src/trips/ReminderModal.tsx
    rationale: |
      Reuses the project's modal and field patterns. DEVIATION to flag: the UI guidelines say `.btn-danger` only behind a `.modal` confirmation, and prefer a `.drawer` for editing in context. The approved prototype uses modals for add and edit, a ghost Delete and an Undo toast for a small, reversible note. The plan follows the prototype and does not use `.btn-danger`.
  - description: |
      Wire it into the trip page. Add Panel variants `{ id: 'reminder-add'; optionId?: string }` and `{ id: 'reminder-edit'; reminder: Reminder }`; show a secondary "Add reminder" button with a bell icon in the title row, only when `trip.can_edit ?? trip.is_owner`; add the muted line "Reminders show on their date and stay in the app. We don't send email or push messages." under the title (also in the viewer's variant of the line, without "View only" gating changes). Extend `Toast` with an optional undo action (`Undo` ghost button, `role="status"` kept) for the deleted-reminder toast. Toast messages: "Reminder saved for 4 March." and "Reminder deleted."
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/Toast.tsx
    rationale: Keeps one `.btn-primary` per section (Book trip stays primary). The in-app-only line makes criterion 7 visible to users.
  - description: |
      Styles for `.note`, `.note-text`, `.note-for` and `.notes` copied from the prototype, using only the existing tokens. The note has a 2px dotted left rail in `--color-border-strong`, which is visibly different from an option's solid rail. Add `CalendarIcon` and `PlusIcon` next to the existing `BellIcon` and `TrashIcon`.
    files:
      - apps/web/src/index.css
      - apps/web/src/auth/icons.tsx
    rationale: Matches the approved prototype and the tokens-only rule.
tests:
  - |
    AC1 (API, services/api/tests/unit/test_reminders_router.py, written first). The owner adds a trip reminder dated 4 March.
    ```python
    r = a.post(f"/trips/{tid}/reminders", json={"text": "Pack passports", "date": "2027-03-04"})
    assert r.status_code == 201
    note = r.json()["reminders"][0]
    assert (note["text"], note["date"], note["option_id"]) == ("Pack passports", "2027-03-04", None)
    assert a.get(f"/trips/{tid}").json()["reminders"][0]["date"] == "2027-03-04"
    ```
    The test also sends a date outside the trip, blank text, and an unknown `option_id`, and expects 422 for each.
  - |
    AC1 (web, TripDetailPage.test.tsx). With `can_edit` true, press "Add reminder", fill "Reminder" with "Pack passports" and Date with 2027-03-04, then Save. The mocked POST returns the trip with that reminder, and the 4 March region shows it.
    ```tsx
    const day4 = within(await screen.findByRole('region', { name: /4 March/ }))
    expect(day4.getByText('Pack passports')).toBeInTheDocument()
    expect(day4.getByText('4 March', { selector: '.badge' })).toBeInTheDocument()
    ```
    Blank text or a date outside the trip shows the `.field-error` after submit and keeps what was typed.
  - |
    AC2 (API). Seed a trip with option `o1` dated 2027-03-04, then add a reminder with `option_id` "o1" and date 2027-03-04.
    ```python
    note = a.post(f"/trips/{tid}/reminders", json={"text": "Book timed tickets", "date": "2027-03-04", "option_id": "o1"}).json()["reminders"][0]
    assert note["option_id"] == "o1" and note["option_date"] == "2027-03-04"
    ```
  - |
    AC2 (web). Pressing "Add reminder to Belém Tower tickets" opens the modal with "Attach to" preselected to that option. After saving, the note shows under that option in the 4 March region.
    ```tsx
    expect(screen.getByLabelText('Attach to')).toHaveValue('o2')
    ```
  - |
    AC3 (API). Editing a reminder from 4 to 5 March.
    ```python
    r = a.put(f"/trips/{tid}/reminders/{rid}", json={"text": "Pack passports", "date": "2027-03-05"})
    assert [n["date"] for n in r.json()["reminders"]] == ["2027-03-05"]
    ```
    The test also checks that an out-of-range date gives 422 and leaves the old date, and that an unknown reminder id gives 404.
  - |
    AC3 (web). Press "Edit reminder: Pack passports", change the date to 2027-03-05 and Save. The mocked PUT returns the moved note.
    ```tsx
    expect(within(screen.getByRole('region', { name: /5 March/ })).getByText('Pack passports')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /4 March/ })).queryByText('Pack passports')).not.toBeInTheDocument()
    ```
  - |
    AC4 (API). Deleting a reminder.
    ```python
    assert a.delete(f"/trips/{tid}/reminders/{rid}").json()["reminders"] == []
    ```
    A second delete of the same id gives 404.
  - |
    AC4 (web). In the Edit dialog, "Delete" removes the note from the day at once and shows the toast "Reminder deleted." with an Undo button. Undo calls the POST route again and the note returns.
    ```tsx
    expect(screen.queryByText('Pack passports')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    ```
  - |
    AC5 (web, plus API). For a trip with `can_edit: false` (and `is_owner: false`), no add control is shown.
    ```tsx
    expect(screen.queryByRole('button', { name: /Add reminder/ })).not.toBeInTheDocument()
    ```
    API side: `can_edit_trip` is unit-tested for owner true, editor true, other user false. Because the sharing story has not landed, the router test stubs the trip as owned by someone else and asserts that a non-editor gets 404 and an authenticated viewer given read access gets `403 forbidden` on POST, PUT and DELETE.
  - |
    AC6 (web). With a reminder dated 4 March on a `can_edit: false` trip, the note text and date show but there is no edit control.
    ```tsx
    expect(screen.getByText('Pack passports')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit reminder/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
    ```
  - |
    AC7 (API). Add a reminder dated for "today" with `get_now` overridden to that date, with `boto3.client`, `smtplib.SMTP` and `httpx.Client.send` monkeypatched to raise. The add succeeds and nothing was called, so the reminder routes make no outbound email or push call. A second test imports `app.routers.trips` and `app.trips.store` and asserts that neither references an email or push sender. The web page keeps the line "We don't send email or push messages." and a test asserts it is shown.
  - |
    AC8 (API). A trip with option `o1` on 4 March and a reminder on `o1`. Moving the option to 5 March and removing it must both hide the reminder.
    ```python
    trip.options[0].date = date(2027, 3, 5); store.save_trip(owner, trip)
    assert a.get(f"/trips/{tid}").json()["reminders"] == []
    trip.options = []; store.save_trip(owner, trip)
    assert a.get(f"/trips/{tid}").json()["reminders"] == []
    ```
    A trip-level reminder on the same trip is still returned after both changes. There are also unit tests for `visible_reminders` covering moved, removed and moved-back options.
  - |
    Existing data. A stored Trip item without a `reminders` key (saved before this story) still loads and returns `reminders == []`.
    ```python
    assert Trip.model_validate({"id": "t", "name": "Old"}).reminders == []
    ```
    A DynamoTripStore round trip with a reminder (moto or the existing store test double) keeps `date` and `option_date` as ISO strings.
  - |
    E2E (Playwright, apps/web/e2e/reminders.spec.ts, API stubbed at the network edge like itinerary.spec.ts, 375px viewport). The editor adds a reminder for 4 March and sees the note, edits it to 5 March, deletes it, and sees the Undo toast. A viewer sees notes and no controls.
assumptions_or_open_questions:
  - |
    Editors and read-only viewers do not exist in the code yet: only the owner can open a trip, and `TripView.is_owner` is the only role signal. The sharing story is what will add editor invites and the read-only link. This plan builds the one `can_edit_trip` rule and a `can_edit` flag on the trip response, true for the owner now. Viewer behaviour (AC5, AC6) is covered by component tests with `can_edit: false` and API tests with a stubbed non-editor. Please confirm that is acceptable, or say if the sharing work should land first.
  - |
    "Activity" in the story is treated as a ChosenOption on the trip (the only dated activity-like entity today). There are no routes to move or remove an option yet, so criterion 8 is met by deriving visibility (`visible_reminders` compares the option's current day with the day stored when the reminder was attached) and by pruning on reminder writes. When the option move and remove routes are built, they should also call the same prune helper.
  - |
    The prototype lets an activity reminder be dated on any day of the trip, not only the activity's day. If it is dated on another day it shows on that day with a "for <activity>" suffix. This matches the prototype's `other` handling in `dayHtml`.
  - |
    The prototype's modals and ghost Delete with Undo differ from the UI guidelines (drawer for in-context editing, `.btn-danger` behind a modal confirmation). The plan follows the approved prototype. A reminder is small and Undo is one tap.
  - |
    Reminder text is capped at 280 characters, and each trip is capped at 200 reminders (422 beyond it) to keep the Trip item well under DynamoDB's 400 KB limit. Neither limit is in the story, so please say if you want different numbers.
  - |
    The prototype shows the page title as "Itinerary" with a "Travelers" tab. The current app has Overview and Itinerary tabs only, so the plan keeps the current tabs and does not add a Travelers tab (it belongs to the multi-traveller story).
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: no migration. `reminders` is a new optional attribute on the existing Trip item (`pk=USER#<owner>`, `sk=TRIP#<id>`) with the model default `[]`, so every stored trip still loads and renders. Nothing narrows an existing field. A test pins that a stored item without `reminders` loads.
  - **Backfill / seed**: none needed. Old items gain the attribute only when a reminder is first written.
  - **Settings**: none. No new env var or config file.
  - **Provisioning**: none. It uses the existing trips table and no new infrastructure. Also nothing for email or push (excluded).
  - **Order and rollback**: deploy the API first, then the web app. The web app tolerates a missing `reminders` field, so either order is safe. To roll back, redeploy the previous API. Trip items that already hold `reminders` stay readable because `Trip` ignores unknown keys when validating from DynamoDB, which the plan must verify with a test of the old model shape. Reminders are simply not shown until the feature is redeployed.

  ### Shape of the change

  ```mermaid
  flowchart TD
    Page[TripDetailPage.tsx]:::touched --> Tab[ItineraryTab.tsx]:::touched
    Page --> Modal[ReminderModal.tsx new]:::touched
    Page --> Toast[Toast.tsx]:::touched
    Modal --> Overlay[Overlay.tsx]
    Page --> Client[trips/api.ts]:::touched
    Tab --> Icons[auth/icons.tsx]:::touched
    Client -->|HTTP| Router[routers/trips.py]:::touched
    Router --> Deps[routers/deps.py]
    Router --> Store[trips/store.py]:::touched
    Store --> Dynamo[(Trip Database item)]
    classDef touched fill:#f96,color:#000
  ```

  Page shows or hides the controls from `trip.can_edit`. Client calls the three reminder routes. Router checks `can_edit_trip`, validates the date against the trip's days, and returns `TripView` with `visible_reminders`. Store holds the models and rules.

  ### Design source
  Read in `TRAVEL-PLANNER-APP-STORY-057-design.html`: screens "Itinerary (owner or editor)", "Add reminder", "Edit reminder" and "Itinerary (read-only viewer)". The `.note` strip (dotted 2px left rail, bell, date badge, text, ghost Edit), modal fields and error copy, the toast with Undo, and the in-app-only line all come from there. The "Prototype only" buttons that move or remove Museum visit are not built; they only demonstrate AC8.

  ### Out of scope
  Email or push delivery, a scheduler, sharing and editor invites, routes to move or remove options, and the Travelers tab. The story text is the only instruction source used; nothing in the work item asked for anything outside the change.
review_focus: |
  Hold the change to dated in-app reminders on a trip or a chosen option: add, edit and delete for those who can edit, and no controls for viewers. There is no email, push, scheduler, sharing or option-move work. The riskiest parts are the visibility rule for criterion 8, which is derived at read time because no move or remove routes exist yet, and the single `can_edit_trip` rule, since the editor and viewer roles do not exist in code until the sharing story. Modal-based add and edit with a ghost Delete and an Undo toast is deliberate, because it follows the approved prototype over the generic UI guidelines.
