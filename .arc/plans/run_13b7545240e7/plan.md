summary: |
  Let a traveller add a place from Destination results to a trip. Each place card gets an "Add to trip" button (secondary). Choosing it adds the place straight away when the traveller has exactly one trip, opens a trip-choice drawer when they have several, and opens a guided New trip set-up drawer first when they have none (then adds the place to the new trip). The place is stored on the trip unscheduled (no day). A "Place added" toast auto-dismisses, the traveller stays on results, and the toast carries an "Open trip" action that navigates to the trip. Adding a place already on the trip changes nothing and shows an "already on this trip" message.
  Backend: a new `places` list on the Trip and `POST /trips/{trip_id}/places` returning the TripView (409 `already_on_trip` on a duplicate). Web: `addPlaceToTrip` API call, an add-to-trip flow on the results page, a trip-choice drawer, a New trip set-up drawer reusing the TripForm fields, and an optional action on Toast.

scope:
  - description: |
      Trip model: add a server-owned list of places on the trip, each with no day.
      ```python
      class TripPlaceFields(BaseModel):
          place_id: str = Field(min_length=1, max_length=120)
          name: TrimmedName
          image_url: str | None = Field(default=None, max_length=500)

      class TripPlace(TripPlaceFields):
          id: str   # uuid hex, like Activity.id

      class Trip(TripFields):
          ...
          places: list[TripPlace] = []  # server-owned: changed only through the place route; unscheduled (no date)
      ```
      Deliberately no `date` field: assigning a day belongs to the Trip itinerary epic.
    files:
      - services/api/app/trips/store.py
    rationale: |
      AC7. A default of [] keeps every stored Trip item readable (DynamoTripStore._to_trip validates with defaults). Kept apart from `activities` so Add activity and day logic are untouched.

  - description: |
      New route in the trips router, owner or accepted editor (`_editable_trip`), same shape as add_activity.
      ```python
      ALREADY_ON_TRIP = ApiError(409, "already_on_trip")
      INVALID_PLACE = ApiError(422, "invalid_place")
      MAX_PLACES = 200  # keeps the Trip item well under DynamoDB's 400 KB limit

      @router.post("/{trip_id}/places", status_code=201)
      def add_place(trip_id: str, body: TripPlaceFields, user=Depends(get_current_user), trips=Depends(get_trips),
                    rates=Depends(get_rates), identity=Depends(get_identity), now=Depends(get_now)) -> TripView:
      ```
      Behaviour: load via `_editable_trip`; if any `p.place_id == body.place_id` raise ALREADY_ON_TRIP without saving (AC12); if `len(trip.places) >= MAX_PLACES` raise INVALID_PLACE; else append `TripPlace(id=uuid.uuid4().hex, **body.model_dump())`, set `updated_at`, save, return `_view(...)`.
    files:
      - services/api/app/routers/trips.py
    rationale: |
      AC2, 4, 7, 12. One server-side duplicate check is the source of truth even if two tabs add at once from stale data. Duplicate is keyed on the catalogue `place_id`, not the name.

  - description: |
      Web API client and types. `Trip` gains `places?: TripPlace[]`. A new typed error for the duplicate so the UI can message it.
      ```ts
      export type TripPlace = { id: string; place_id: string; name: string; image_url?: string | null }
      export type TripPlaceInput = { place_id: string; name: string; image_url: string }
      /** The place is already on this trip (409). */
      export class AlreadyOnTripError extends Error {}
      export const addPlaceToTrip = (tripId: string, input: TripPlaceInput) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/places`, 'POST', input)
      ```
      `call` maps `response.status === 409` to `AlreadyOnTripError` only for paths ending in `/places`, so the existing editor 409 (`already_editor`) keeps its current behaviour.
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      AC2, 4, 6, 7, 12, 13.

  - description: |
      Toast gains an optional navigation action, next to the existing `undo`:
      ```ts
      type ToastProps = { message: string | null; undo?: () => void; action?: { label: string; onAction: () => void } }
      ```
      Rendered as `btn btn-ghost btn-sm` (wireframe's `open-trip-from-toast`); clicking hides the toast then calls `onAction`. Auto-dismiss (TOAST_MS 4000) is unchanged and is what AC9 relies on. Existing callers pass neither prop and are unaffected.
    files:
      - apps/web/src/trips/Toast.tsx
    rationale: |
      AC8, 9, 11. Reuses the existing `.toast` so confirmations look the same everywhere.

  - description: |
      PlaceCard: add the add action. Sketch element `add-place` (label "Add to trip", variant secondary) inside `place-card` (`.card stack`), below `place-name`.
      ```tsx
      export function PlaceCard({ place, onAdd, pending }: { place: Place; onAdd: (place: Place) => void; pending?: boolean })
      // <button type="button" className="btn btn-secondary" aria-label={`Add ${place.name} to trip`} disabled={pending} onClick={() => onAdd(place)}>Add to trip</button>
      ```
      Keep the existing image and name markup so the existing results tests still pass. The existing test that reads each listitem's textContent would now also see the button text, so update that assertion to read the place name only.
    files:
      - apps/web/src/places/PlaceCard.tsx
    rationale: |
      AC1. One `.btn-secondary` per card and no `.btn-primary`, so the results section has no competing primary (the existing Clear filters empty state keeps its primary).

  - description: |
      Add-to-trip flow in a controller component used by the results page: new `AddToTrip` in `apps/web/src/places/AddToTrip.tsx`, which exposes an `onAdd(place)` handler and renders the drawers, toast and alert.
      - On add: `fetchTrips()` (always asks the server, per the no-cache rule in trips/api.ts). Failure shows `.alert alert-danger` with role alert, "We couldn't add that place. Try again."
      - 1 trip: `addPlaceToTrip` immediately, no choice shown (AC2).
      - Several: open `TripChoiceDrawer` (below); picking a trip calls `addPlaceToTrip` for it (AC3, 4).
      - None: open `NewTripDrawer` (below); on creation call `addPlaceToTrip(newTrip.id, ...)` (AC5, 6). Nothing is added before set-up completes, and cancelling adds nothing.
      - Success: set toast state with the trip id and a fresh key, and render `<Toast key message="Place added" action={{ label: 'Open trip', onAction: () => navigate(`/trips/${tripId}`) }} />`. The page stays on `/destinations` (AC10) because the only navigation is from Open trip (AC11).
      - `AlreadyOnTripError`: no toast. Show `<p role="alert" className="alert alert-warning">` "That place is already on this trip." (AC13), which stays until the next add attempt. The place is not added again (AC12, enforced by the API).
      - Disable the pressed card button while pending to stop double submits.
    files:
      - apps/web/src/places/AddToTrip.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
    rationale: |
      AC2-6, 8-13. The results page passes `onAdd` to each PlaceCard and renders the toast and alert region. The page's existing loading, empty, failed, filter and map states are untouched. Sketch screens covered are `results` (cards with add-place) and `add-place-confirm` (the same results screen as a state, with the toast and Open trip). Flow `results-to-added` is the one-trip path and the post-choice and post-set-up paths.

  - description: |
      TripChoiceDrawer (`apps/web/src/places/TripChoiceDrawer.tsx`): a `.drawer` via the existing `Overlay` (focus trap, Escape closes, focus returns), because it is choosing in context and keeps results visible. Title "Choose a trip" (`aria-labelledby`), radio rows of trip names (reuse the `.pick-list`, `.pick` and `.radio` markup from AddActivityDrawer's Picker, first trip preselected), one `.btn-primary` "Add to {trip name}" and a `.btn-ghost` Cancel. Single column, phone first.
    files:
      - apps/web/src/places/TripChoiceDrawer.tsx
    rationale: |
      AC3, 4. Per the UI guidelines a drawer is for in-context actions, a modal only for confirmations, and each section has one primary button.

  - description: |
      NewTripDrawer for the guided New trip set-up when the traveller has no trips. Extract the field markup and validation from `TripForm` into a shared `TripFields` component (`apps/web/src/trips/TripFields.tsx`) used by both `TripForm` (behaviour unchanged, still navigates to `/` after Save trip) and the drawer. Drawer title "New trip", one `.field` per input with `.field-label`, `.field-error` plus `.is-invalid` shown after submit ("Enter a trip name to save this trip."), `.btn-primary` "Save trip and add place", `.btn-ghost` Cancel. Submit calls `createTrip` then reports the new trip to the controller. A create failure shows "We couldn't save this trip. Try again."
    files:
      - apps/web/src/places/NewTripDrawer.tsx
      - apps/web/src/trips/TripFields.tsx
      - apps/web/src/trips/TripForm.tsx
    rationale: |
      AC5, 6. Reuses the existing New trip form so there is one set-up, not a second copy that drifts. Existing TripForm tests guard the refactor.

tests:
  - |
    API unit, services/api/tests/unit/test_places_on_trip_router.py (new; copy the fixtures from test_activities_router.py). AC7, written first, fails with 404 until the route exists:
    ```python
    r = client.post(f"/trips/{trip_id}/places", json={"place_id": "alfama", "name": "Alfama", "image_url": "/a.jpg"})
    assert r.status_code == 201
    assert [p["place_id"] for p in r.json()["places"]] == ["alfama"]
    assert "date" not in r.json()["places"][0]          # no day assigned
    assert client.get(f"/trips/{trip_id}").json()["places"][0]["name"] == "Alfama"
    ```
  - |
    API unit, duplicate (AC12): the second POST of the same place_id returns 409 and the trip still holds one place.
    ```python
    assert second.status_code == 409 and second.json()["detail"] == "already_on_trip"   # match the ApiError body shape used in test_activities_router.py
    assert len(client.get(f"/trips/{trip_id}").json()["places"]) == 1
    ```
  - |
    API unit, access and limits: a stranger gets 404, a non-accepted editor gets 403, an accepted editor gets 201, an empty name gets 422, the 201st place gets 422 `invalid_place`. A Trip stored without `places` loads with `places == []` (existing rows still readable).
    ```python
    assert Trip.model_validate({"id": "t1", "name": "Old trip"}).places == []
    ```
  - |
    Web vitest, PlaceCard on results (AC1), in apps/web/src/places/DestinationResultsPage.test.tsx:
    ```tsx
    expect(await screen.findAllByRole('button', { name: /^Add .* to trip$/ })).toHaveLength(2)
    ```
  - |
    Web, one trip (AC2, 7, 8). Stub `GET /trips` with one trip and `POST /trips/t1/places`:
    ```tsx
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    expect(await screen.findByText('Place added')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()   // no trip choice
    expect(JSON.parse(String(postCall[1].body))).toEqual({ place_id: 'p1', name: 'Alfama', image_url: '/a.jpg' })  // no date key
    ```
  - |
    Web, several trips (AC3, 4): the choice drawer lists both trips and picking the second posts to it.
    ```tsx
    const dialog = await screen.findByRole('dialog', { name: 'Choose a trip' })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Rome' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to Rome' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/trips/t2/places', expect.anything()))
    ```
  - |
    Web, no trips (AC5, 6): the New trip drawer opens and nothing is posted to /places until Save trip and add place completes. Then POST /trips (create) precedes POST /trips/new-id/places.
    ```tsx
    expect(await screen.findByRole('dialog', { name: 'New trip' })).toBeInTheDocument()
    expect(placesPosts()).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Lisbon' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save trip and add place' }))
    await waitFor(() => expect(placesPosts()).toHaveLength(1))
    ```
  - |
    Web, auto-dismiss and staying on results (AC9, 10), with vi.useFakeTimers() and the advance wrapped in act:
    ```tsx
    act(() => { vi.advanceTimersByTime(4000) })
    expect(screen.queryByText('Place added')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Places in Lisbon' })).toBeInTheDocument()
    ```
  - |
    Web, Open trip (AC11): clicking it shows the trip. Stub `GET /trips/t1` and assert the trip page renders its name.
    ```tsx
    fireEvent.click(await screen.findByRole('button', { name: 'Open trip' }))
    expect(await screen.findByRole('heading', { name: 'Lisbon trip' })).toBeInTheDocument()
    ```
  - |
    Web, duplicate (AC12, 13): the stubbed POST answers 409. The message shows and there is no Place added toast.
    ```tsx
    expect(await screen.findByRole('alert')).toHaveTextContent('That place is already on this trip.')
    expect(screen.queryByText('Place added')).not.toBeInTheDocument()
    ```
  - |
    Regression: existing TripForm.test.tsx, the Toast users (MyTripsPage.test.tsx) and the results filter and map tests pass unchanged after the TripFields extraction and the Toast prop addition. Update only the results assertion that read the card text so it ignores the new button.
  - |
    Playwright e2e, only if the repo already has an e2e suite for results (otherwise skipped and noted): sign in with one trip, search Lisbon, Add to trip, see Place added, stay on /destinations, Open trip lands on the trip.

assumptions_or_open_questions:
  - |
    The wireframe's toast label reads "Added to trip" while the acceptance criteria and the screen name say "Place added". The plan uses "Place added" (the AC wording). Say if the sketch copy should win.
  - |
    The sketch has no screens for the trip choice, the New trip set-up or the already-on-trip message. The plan builds them from the design system (drawers for choice and set-up, `.alert` for the message) and the existing TripForm. The reviewer should confirm that drawers, not a dropdown or a full-page route, are wanted. A full-page route would lose the results page.
  - |
    The place is stored as a copy of id, name and image_url sent by the client, because the API has no look-up of a place by id (PlaceSearch is by destination). Fields are bounded by validation. If place data should be trusted from the server only, that needs a catalogue lookup port and is a follow-up.
  - |
    Duplicate check is by catalogue place id. Editors with accepted access may add places, matching add_activity (`_editable_trip`).
  - |
    A traveller's trip list includes trips shared with them as an editor (GET /trips returns both), so those count toward "exactly one" and "several".
  - |
    The Unscheduled section and assigning a day are out of scope (Trip itinerary epic), so no trip page UI shows the new `places` list here. "Open trip" shows the existing trip page.
  - |
    The already-on-trip message is an `.alert` under the results header rather than a toast, so it persists until the traveller acts, following the guideline that `.alert` is for problems that stay on the page and `.toast` for confirmed changes.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout
  - **Existing data**: the new `places` field defaults to `[]` in the `Trip` pydantic model, so Trip items already in DynamoDB (which have no `places` attribute) still load through `DynamoTripStore._to_trip`. No schema change (DynamoDB is schemaless) and no migration. A test pins that an old trip loads with `places == []`.
  - **Backfill / seed**: none needed.
  - **Settings**: none.
  - **Provisioning**: none.
  - **Order and rollback**: deploy the API first, then the web app. A web app calling the route before the API has it would fail, and the add shows the generic error. Rollback is safe in either order: older API code ignores the extra `places` attribute on stored items (pydantic ignores unknown keys by default; confirm `Trip` has no `extra=forbid`), though a save by older code would drop the list.

  ```mermaid
  flowchart TD
    Results[DestinationResultsPage.tsx] --> Card[PlaceCard.tsx]
    Results --> Flow[AddToTrip.tsx]
    Flow --> Choice[TripChoiceDrawer.tsx]
    Flow --> NewTrip[NewTripDrawer.tsx]
    NewTrip --> Fields[TripFields.tsx]
    TripFormPage[TripForm.tsx] --> Fields
    Flow --> Toast[Toast.tsx]
    Flow --> WebApi[trips/api.ts]
    Choice --> Overlay[Overlay.tsx]
    NewTrip --> Overlay
    WebApi --> Router[routers/trips.py add_place]
    Router --> Store[trips/store.py Trip.places]
    Store --> Dynamo[DynamoTripStore.save_trip]
    classDef touched fill:#f96,color:#000
    class Results,Card,Flow,Choice,NewTrip,Fields,TripFormPage,Toast,WebApi,Router,Store touched
  ```

  Touched nodes (orange): the API route and model are the only server changes. The web side is the card button, the flow controller, two drawers, a TripForm field extraction and a Toast action. Overlay and DynamoTripStore are read-only context.

  Conventions followed: the route mirrors `add_activity` (editable trip, bound on count, `_view` response). The web call goes through the shared `call` helper with no client cache. Styling uses the project's design-system classes (`.card`, `.btn-secondary`, `.btn-primary`, `.btn-ghost`, `.drawer`, `.toast`, `.alert`, `.field`, `.field-error`), matching the existing components. Copy: buttons start with a verb, errors say what to do next. API tests use pytest, web tests use vitest with `stubApi` and `renderAt` from `apps/web/src/test-api.tsx`.

  The work item text contained no embedded instructions beyond the change itself.

review_focus: |
  IN: `places` on the Trip, `POST /trips/{id}/places` with a 409 duplicate, the add button, the one/several/none flow, the Place added toast with Open trip, and the already-on-trip message. OUT: the Unscheduled section, assigning a day, and removing places (Trip itinerary epic). Riskiest area: the TripForm to TripFields extraction (must leave Save trip behaviour unchanged) and the 409 mapping in `call`, which must not change the existing already_editor handling. Deliberate: the trip choice and set-up are drawers, since the sketch has no screen for them, and the toast text is "Place added" per the ACs, not the sketch's "Added to trip".
