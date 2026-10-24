summary: |
  Replace the bare `/trips/new` form (`TripForm`) and the places-side `NewTripDrawer` with one guided New trip set-up that collects destination, dates, number of travellers, budget, trip currency and trip name, validates them inline on Finish, and only then creates the trip and opens a new Shortlists screen. Nothing is saved until Finish (leaving asks first and discards). The three launch points (My trips, Plan your first trip, add-a-place with no trips) all reach the same set-up. The API gains a strict create body that requires every basic and stores the chosen trip currency and traveller count. Profile questions and per-traveller details stay out of scope.
scope:
  - description: |
      API: a create-only body `TripCreate(TripFields)` in the store module, and a new optional `traveller_count` on `Trip`. POST /trips switches from `TripFields` to `TripCreate`; PUT /trips/{id} keeps `TripFields` so Trip settings still cannot change currency.
      ```python
      class TripCreate(TripFields):
          destination: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
          start_date: date
          end_date: date
          budget: float = Field(gt=0, le=1_000_000_000)
          currency: Literal["EUR", "GBP", "USD", "JPY", "AUD"]  # the five in the prototype's select
          traveller_count: int = Field(ge=1, le=20)
      ```
      `create_trip` builds `Trip(id=..., updated_at=now, **body.model_dump())`; `Trip` gets `traveller_count: int | None = None`. A missing or bad value is a 422 (FastAPI default); an end before the start or a range over 60 days still goes through `_days` / `reconcile_days`, so confirm it surfaces as 422 not 500.
    files:
      - services/api/app/trips/store.py
      - services/api/app/routers/trips.py
      - services/api/tests/unit/test_trips_router.py
      - services/api/tests/unit/test_trip_store.py
    rationale: |
      AC1/AC2/AC9/AC10 must hold server-side too, not only in the form. Trip already stores `currency` (default "EUR") but no request could set it; the PUT body deliberately cannot carry it.
  - description: |
      Web API client: extend the types and `createTrip` for the strict create body.
      ```ts
      export type TripCreateInput = {
        name: string; destination: string; start_date: string; end_date: string
        budget: number; currency: string; traveller_count: number
      }
      export const createTrip = (trip: TripCreateInput) => call<Trip>('/trips', 'POST', trip)
      ```
      Add `traveller_count?: number | null` to `Trip`. `TripInput` (used by `updateTrip`) is unchanged.
    files:
      - apps/web/src/trips/api.ts
    rationale: Keeps update typing unchanged while create requires every basic.
  - description: |
      New `NewTripSetupPage` at `/trips/new`, built from prototype screen "New trip set-up" (`#new-trip-setup`): `.page.narrow` (36rem max, single column), ghost Back button with arrow-left icon, `h1` "New trip", muted "Where to next? Five quick details, then your shortlists.", then a `form.stack.stack-lg` (`noValidate`) of `.field` blocks, each with `.field-label`, `.input`, `.field-hint` and `.field-error` (`role="alert"`, hidden until submit): Destination (placeholder "Where are you going?", hint "A city or country, like Lisbon or Portugal."); Start date and End date side by side in `.two` (one shared dates error below); Number of travellers (`type=number`, min 1, placeholder "1", hint "Include yourself. You can add details for others later."); Budget with a `.budget-prefix` (shows "—" until a currency is chosen, then the code) plus Trip currency `.select` whose first option is "Choose a currency" and selected by default (AC8), options "EUR – Euro", "GBP – Pound sterling", "USD – US dollar", "JPY – Japanese yen", "AUD – Australian dollar"; Trip name (maxLength 60, placeholder "Name your trip", hint "Something you'll recognise, like “Lisbon long weekend”."). One `.btn-primary` "Finish" in a top-bordered `.form-actions`.
      Currency restatement (AC2): once chosen, hide the hint and show `.cur-note` (`aria-live="polite"`, check icon): "Trip currency: EUR. Everything in this trip is shown in euros." Pick the long name from one shared `TRIP_CURRENCIES` table (code to name) used by both the select and the note.
      Validation on submit (after submit, re-validate on input; never while typing before the first submit), messages copied from the prototype's `validate()`: destination "Enter a destination, like Lisbon."; dates "Enter a start and end date." / "Start date is in the past. Choose today or later." / "End date is before the start date. Choose a date on or after <start>." (plus the 60-day cap the API enforces: "Trips can span up to 60 days. Shorten the dates."); travellers "Enter the number of travellers." / "Enter at least one traveller, as a whole number." / "Trips are limited to 20 travellers. Enter 20 or fewer."; budget "Enter a budget and choose a currency." / "Enter a budget." / "Enter a budget greater than 0." / "Choose a trip currency."; name "Enter a trip name." Invalid fields get `.is-invalid` and `aria-invalid`; the currency select is only marked invalid when it is empty. A `.alert.alert-danger` summary ("Finish isn't ready yet." with a list "Label: message") appears above the form and takes focus on a blocked submit.
      Finish with no errors: button disabled with `.spinner` and "Creating trip…", `createTrip(...)`, then `navigate('/trips/<id>/shortlists', { state: { toast: 'Trip created. Here are your shortlists.' } })`. On failure keep the values and show `.alert-danger` "We couldn't save this trip. Try again." Nothing is posted before Finish (AC6).
      Back (ghost) opens a `.modal` via the existing `Overlay kind="modal"` titled "Leave set-up?" with "Your trip is not saved until you finish set-up.", `.btn-secondary` "Keep editing" (values stay) and `.btn-primary` "Leave" (navigate to `/`, discards). If launched with `location.state.addPlace` (see the launch-points item) Finish also calls `addPlaceToTrip(trip.id, ...)` before navigating; a failure there still lands on Shortlists with the trip created and shows the existing "We couldn't add that place" message via router state.
      Pure validation lives in `validateTripBasics(values, today)` returning `Partial<Record<'destination'|'dates'|'travellers'|'budget'|'name', string>>`, so it is unit-testable with a fixed date.
    files:
      - apps/web/src/trips/NewTripSetupPage.tsx
      - apps/web/src/trips/tripBasics.ts
      - apps/web/src/trips/TripPage.tsx
      - apps/web/src/trips/NewTripSetupPage.test.tsx
      - apps/web/src/trips/tripBasics.test.ts
    rationale: |
      Covers AC1, 2, 6, 8, 9, 10. `TripPage` keeps `/trips/new` (so `GUIDED_SETUP_PATH` in `MyTripsPage.tsx` stays correct) and renders `NewTripSetupPage` instead of `TripForm`. Reuses `Overlay`, `AlertIcon`, `.field*`, `.narrow` (index.css has 32rem; the prototype uses 36rem, so add a modifier or token-based width only if the difference is visible).
  - description: |
      Shortlists screen at `/trips/:tripId/shortlists` (prototype `#shortlists`): `h1` "Shortlists", a muted line "<name> is ready: <destination>, <n> traveller(s), budget <money>. Trip currency: <CUR>." with the budget formatted by `Intl.NumberFormat(undefined, { style: 'currency', currency })`, `.tabs` Places / Stays / Activities (`role=tablist`, arrow-key behaviour as in the existing trip tabs) over a dashed `.shortlist-box` whose panels say "Places to consider" / "Stays to consider" / "Activities to consider" with "Shortlisted … for this trip will appear here." The shortlists themselves are other stories; this is the landing screen only. Loads the trip with `fetchTrip`, skeleton while loading, `.alert-danger` with Retry on failure, and shows the router-state toast through the existing `Toast`. Add the route in `App.tsx` inside `RequireAuth`, declared so it does not collide with `/trips/:tripId`.
    files:
      - apps/web/src/trips/ShortlistsPage.tsx
      - apps/web/src/trips/ShortlistsPage.test.tsx
      - apps/web/src/App.tsx
    rationale: AC7 needs a Shortlists destination; none exists in the codebase (grep for "shortlist" finds nothing).
  - description: |
      Launch points. My trips already links both buttons to `GUIDED_SETUP_PATH` (`MyTripsPage.tsx:90` and `:117`), so AC3/AC4 need tests only. Keep the empty state as is (`.empty-state` with one `.btn-primary` "Plan your first trip") and the "New trip" button only when trips exist (one primary per section).
      Add-a-place with no trips (AC5): the zero-trips branch of `useAddToTrip` stops opening `NewTripDrawer` and instead calls `navigate('/places/add', { state: { place } })` (see the first open question). The new `AddPlaceNoTripsPage` follows prototype screen "Add a place with no trips": `h1` "Add a place" and an `.empty-state` ("You have no trips yet", "Places live inside a trip. Set one up first and we'll add this place right after.") with one `.btn-primary` "New trip" linking to `/trips/new` with `state.addPlace`. Route added in `App.tsx` inside `RequireAuth`. Delete `NewTripDrawer.tsx`, `TripForm.tsx` and `TripFields.tsx`, which are all replaced (`TripSettingsDrawer` has its own fields and does not use them).
    files:
      - apps/web/src/places/AddToTrip.tsx
      - apps/web/src/places/AddPlaceNoTripsPage.tsx
      - apps/web/src/places/NewTripDrawer.tsx
      - apps/web/src/trips/TripForm.tsx
      - apps/web/src/trips/TripFields.tsx
      - apps/web/src/trips/TripForm.test.tsx
      - apps/web/src/places/AddToTrip.test.tsx
      - apps/web/src/trips/MyTripsPage.test.tsx
    rationale: |
      One set-up instead of three near-duplicates (page form, drawer, and now the guided flow). The zero-trips branch of `useAddToTrip` is the only caller of `NewTripDrawer`.
  - description: |
      Styling: add only the missing rules to `index.css`, using tokens: `.budget-wrap`/`.budget-prefix`, `.cur-note`, `.two` (1 column under 30rem, 2 columns above), `.summary-list`, `.form-actions`, `.shortlist-box`. Light theme, `--space-3/4` gaps, phone first at 375px (no horizontal overflow).
    files:
      - apps/web/src/index.css
    rationale: The prototype's page-level style block defines these; the app stylesheet does not yet.
tests:
  - |
    AC1 (web, vitest, written first): fill all six fields and press Finish; the POST body carries them.
    ```ts
    const post = fetchMock.mock.calls.find(([p, init]) => p === '/trips' && init?.method === 'POST')
    expect(JSON.parse(post![1]!.body as string)).toEqual({
      name: 'Lisbon long weekend', destination: 'Lisbon', start_date: '2027-03-12',
      end_date: '2027-03-15', traveller_count: 2, budget: 1800, currency: 'EUR',
    })
    ```
  - |
    AC1 (api, pytest): POST /trips with every basic returns 201 and stores them.
    ```python
    res = client.post("/trips", json={"name": "Lisbon", "destination": "Lisbon", "start_date": "2027-03-12",
        "end_date": "2027-03-15", "budget": 1800, "currency": "EUR", "traveller_count": 2})
    assert res.status_code == 201
    assert res.json()["currency"] == "EUR" and res.json()["traveller_count"] == 2
    ```
  - |
    AC2: choosing GBP shows it as the trip's currency and prefixes the budget.
    ```ts
    fireEvent.change(screen.getByLabelText('Trip currency'), { target: { value: 'GBP' } })
    expect(screen.getByText(/Trip currency: GBP\. Everything in this trip is shown in pounds sterling\./)).toBeInTheDocument()
    ```
    API side: `assert client.post("/trips", json={**valid, "currency": "GBP"}).json()["currency"] == "GBP"`.
  - |
    AC3: from My trips with a trip, New trip opens the set-up.
    ```ts
    renderAt('/')
    fireEvent.click(await screen.findByRole('link', { name: 'New trip' }))
    expect(await screen.findByLabelText('Destination')).toBeInTheDocument()
    ```
  - |
    AC4: from My trips with no trips, Plan your first trip opens the set-up.
    ```ts
    fireEvent.click(await screen.findByRole('link', { name: 'Plan your first trip' }))
    expect(await screen.findByRole('heading', { name: 'New trip' })).toBeInTheDocument()
    ```
  - |
    AC5: on Destination results with `GET /trips` returning `[]`, Add a place leads to set-up and posts nothing yet (replaces the drawer tests in `AddToTrip.test.tsx`).
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    expect(await screen.findByRole('heading', { name: 'You have no trips yet' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'New trip' }))
    expect(await screen.findByLabelText('Trip name')).toBeInTheDocument()
    expect(placesPosts(fetchMock)).toHaveLength(0)
    ```
    After Finish the place POST to `/trips/new-id/places` follows the trip POST.
  - |
    AC6: enter details, press Back, confirm Leave; no POST was made and My trips does not list a trip.
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Leave set-up?' })).getByRole('button', { name: 'Leave' }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
    ```
    Also: Keep editing leaves the typed destination in the field.
  - |
    AC7: a valid Finish lands on Shortlists with the trip's details.
    ```ts
    expect(await screen.findByRole('heading', { name: 'Shortlists' })).toBeInTheDocument()
    expect(screen.getByText(/Lisbon long weekend is ready/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Places' })).toHaveAttribute('aria-selected', 'true')
    ```
  - |
    AC8: a freshly opened set-up has no currency selected.
    ```ts
    expect(screen.getByLabelText('Trip currency')).toHaveValue('')
    expect(screen.queryByText(/Everything in this trip is shown in/)).not.toBeInTheDocument()
    ```
    Also in the API: `assert client.post("/trips", json={**valid, "currency": None}).status_code == 422`.
  - |
    AC9 (web, one case per field, parametrised): with the field blank, Finish is blocked, the error sits next to that field, and no POST is made.
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText('Choose a trip currency.')).toBeInTheDocument()
    expect(screen.getByLabelText('Trip currency')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false)
    ```
    Cases: destination, dates, travellers, budget, trip name, trip currency. API: `@pytest.mark.parametrize("missing", ["destination","start_date","end_date","budget","currency","traveller_count","name"])` posts the valid body minus that key and asserts 422.
  - |
    AC10 (unit, `tripBasics.test.ts` with today fixed at 2026-10-24):
    ```ts
    expect(validateTripBasics({ ...ok, start: '2026-10-01' }, '2026-10-24').dates).toBe('Start date is in the past. Choose today or later.')
    expect(validateTripBasics({ ...ok, end: '2027-03-01', start: '2027-03-05' }, today).dates).toMatch(/^End date is before the start date/)
    expect(validateTripBasics({ ...ok, travellers: '0' }, today).travellers).toBe('Enter at least one traveller, as a whole number.')
    expect(validateTripBasics({ ...ok, travellers: '21' }, today).travellers).toBe('Trips are limited to 20 travellers. Enter 20 or fewer.')
    expect(validateTripBasics({ ...ok, budget: '-5' }, today).budget).toBe('Enter a budget greater than 0.')
    ```
    Component test: Finish with travellers "0" shows the error beside the field and posts nothing. API: parametrised invalid bodies (`traveller_count` 0 and 21, `budget` 0 and -1, `currency` "XXX", end before start, range over 60 days) each return 422.
  - |
    Regression: PUT /trips/{id} still ignores a `currency` in the body (`test_update_keeps_options_and_currency` stays green); existing trips without `traveller_count` still list and load (`assert client.get("/trips").json()[0]["traveller_count"] is None`). Update the existing POST /trips tests in `test_trips_router.py` to send the strict body.
assumptions_or_open_questions:
  - |
    Add-a-place with no trips: the prototype shows an interim "Add a place" screen with an empty state and a "New trip" button (data-go to set-up), while AC5 says the guided set-up opens when they start the add-a-place flow. I followed the prototype (one extra click, then set-up). If the reviewer wants set-up to open immediately, drop `AddPlaceNoTripsPage` and navigate straight to `/trips/new` with `state.addPlace`; the rest is unchanged.
  - |
    Number of travellers has no home on Trip today (`travellers` is a list of named people, owned by the per-traveller story). I add a separate optional `traveller_count` rather than pre-creating Traveller rows; per-traveller details stay out of scope.
  - |
    Currency list: the prototype offers EUR, GBP, USD, JPY and AUD, so the API restricts to those five. The existing rate table only knows USD to EUR, so costs in other currencies are reported through the existing `unconvertible_count`. Confirm that is acceptable.
  - |
    Budget must be greater than 0 on create (prototype), whereas Trip settings and `TripFields` allow 0 or empty. Existing trips with no budget are untouched.
  - |
    Dates: the prototype requires start not in the past; the API does not check "today" (client clock and timezone differ), only that end is not before start and the range is at most 60 days. Past-date blocking is client-side only.
  - |
    The prototype's pending state is a fixed 300ms wait; I use the real request duration instead.
  - |
    Shortlist content (places, stays, activities) is not built here; the screen is the landing shell from the prototype.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: `Trip` gains one optional attribute, `traveller_count` (default None). DynamoDB items are schemaless and `store.py` builds a `Trip` from the stored item, so old items without it load as None; no migration. `currency` already exists on every stored trip (default "EUR"). The stricter create body applies only to new POSTs. Implementer: confirm in `store.py` item (de)serialisation that the int round-trips (boto3 returns Decimal).
  - **Backfill / seed**: none needed; old trips simply show no traveller count.
  - **Settings**: none.
  - **Provisioning**: none.
  - **Order and rollback**: ship API and web together (an old web client posting the loose body would now get 422). Rollback is safe: an extra attribute on stored items is ignored by the older model.

  Design source: `TRAVEL-PLANNER-APP-STORY-046-design.html`, screens "My trips", "Plan your first trip", "Add a place with no trips", "New trip set-up", "New trip set-up with errors", "Leave set-up?" and "Shortlists". One departure to flag: in the "with errors" prototype state Finish stays disabled until every error is fixed, whereas AC9/10 say finish is blocked with errors shown. I keep Finish enabled and block in the submit handler, so the traveller can press it and get the summary (a disabled button is not announced to assistive tech); nothing is lost against the AC.

  ```mermaid
  flowchart TD
    MyTrips[MyTripsPage.tsx] -->|GUIDED_SETUP_PATH| TripPage
    Explore[DestinationResultsPage.tsx] --> AddToTrip[AddToTrip.tsx]
    AddToTrip -->|no trips| NoTrips[AddPlaceNoTripsPage.tsx]
    NoTrips -->|state.addPlace| TripPage[TripPage.tsx]
    TripPage --> Setup[NewTripSetupPage.tsx]
    Setup --> Basics[tripBasics.ts]
    Setup --> Api[trips/api.ts createTrip]
    Api --> Router[routers/trips.py create_trip]
    Router --> Store[trips/store.py TripCreate]
    Setup -->|navigate| Shortlists[ShortlistsPage.tsx]
    classDef touched fill:#f96,color:#000
    class AddToTrip,NoTrips,TripPage,Setup,Basics,Api,Router,Store,Shortlists touched
  ```
review_focus: |
  IN: the guided set-up form, strict create body (all basics plus currency and traveller count), the Shortlists landing screen, and the add-a-place zero-trips hand-off; OUT: profile questions, per-traveller details, real shortlist content, Trip settings changes. Riskiest part is replacing POST /trips' body (every existing caller and test must send the strict body) and the add-a-place path creating a trip then posting the place with sensible failure handling. Deliberate choices: Finish stays enabled and blocks on submit (differs from the prototype's disabled state), the interim "no trips" screen follows the prototype rather than opening set-up directly, and past-date checking is client-side only.
