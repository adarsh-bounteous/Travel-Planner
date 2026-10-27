summary: |
  Let the traveller pick several restaurants from the Restaurant shortlist (story 026) and keep them on the trip. A pick is stored server-side on the Trip as a snapshot of the restaurant (name, city, typical price per person, currency, link), added Unscheduled by default, with an optional day and meal chosen at pick time or later through a Move action. Each pick carries an estimated cost of typical price per person x group size (`traveller_count`), labelled as an estimate, or "Estimate unavailable" when the restaurant has no known typical price. The estimate is summed into the existing trip total (`summarise_cost`, converted into the trip currency like every other pick), and the existing over-budget warning in the trip total card fires when the total, restaurants included, goes over the trip budget. Built to the approved prototype: Restaurant shortlist with "Add to trip", the Add-to-trip modal, the trip itinerary with an Unscheduled card plus day cards and a total card, and the Move modal.
scope:
  - description: |
      API model. Add to `store.py`:

      ```python
      Meal = Literal["breakfast", "lunch", "dinner"]

      class RestaurantPickFields(BaseModel):
          """What an editor supplies to pick a restaurant: which one, and optionally where it goes."""
          name: TrimmedName
          city: TrimmedName
          date: date | None = None   # None = Unscheduled
          meal: Meal | None = None   # set exactly when date is set

          @model_validator(mode="after")
          def _day_and_meal_together(self) -> "RestaurantPickFields": ...

      class RestaurantPickMove(BaseModel):   # same date/meal pair and validator
          date: date | None = None
          meal: Meal | None = None

      class RestaurantPick(BaseModel):
          id: str
          name: str
          city: str
          cuisine: str
          typical_price: Decimal | None   # per person; None = unknown
          currency: str                   # may differ from the trip currency
          url: str | None = None
          date: date | None = None
          meal: Meal | None = None
      ```

      Add `restaurants: list[RestaurantPick] = []` to `Trip` (server-owned: changed only through the restaurant routes). The default empty list means trips already stored in DynamoDB still validate. The group estimate is derived, never stored, so a later change to `traveller_count` stays correct: `estimate = typical_price * (trip.traveller_count or 1)`.
    files:
      - services/api/app/trips/store.py
    rationale: |
      Mirrors ChosenSim / TransportPick: a server-held snapshot on the Trip, changed only through its own routes, never read from a request body. Day and meal must be set together (AC 3), which a model validator enforces so the route cannot store a day without a meal.
  - description: |
      Allow an unknown typical price. `ProviderRestaurant.typical_price: Decimal | None` (None = no known price). Update `build_shortlist`/`_fits` so a restaurant with no price is not marked over budget (same stance already taken for a foreign currency) and sorts after priced ones in the same tier:

      ```python
      def _fits(r, trip, budget) -> bool:
          return budget is None or r.typical_price is None or r.currency != trip.currency or r.typical_price <= budget
      # sort key: (not fits, -len(met), r.typical_price is None, r.typical_price or Decimal(0), r.name)
      ```

      Web: `RestaurantOption.typical_price: string | null`; `RestaurantCompare.tsx`, `RestaurantOptionsPage.tsx` and `restaurantShortlist.ts` show "Typical price not available" instead of calling `formatMoney` on null. The prototype's reason text for this case is "No typical price is known yet, so there is no budget check."
    files:
      - services/api/app/dining/options.py
      - services/api/app/dining/shortlist.py
      - apps/web/src/trips/RestaurantCompare.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/restaurantShortlist.ts
    rationale: |
      AC 9 and 10 need a restaurant with no known typical price. Today the field is a required Decimal, so no such restaurant can exist. This is the only change to 026 code besides the entry button.
  - description: |
      Cost. In `summarise_cost`, add the restaurant picks into the loop that already handles sim and insurance. Each priced pick adds `typical_price * (traveller_count or 1)` converted through `rates.rate(currency, trip.currency)`; an unconvertible currency bumps `unconvertible_count`; a pick with no price bumps `unpriced_count` and adds nothing (AC 10). Add two fields to `CostSummary`:

      ```python
      restaurant_total: float          # sum of the restaurant estimates in the trip currency, 2 dp
      restaurant_unpriced_count: int   # picks with no estimate and so left out
      ```

      `over_budget_by` already compares the total with the budget, so restaurants flow into the over-budget warning (AC 7, 8) with no further change. Equal to budget is not over, as today.
    files:
      - services/api/app/trips/cost.py
    rationale: |
      One place owns the trip total, so restaurants are added there and the web never re-sums. The two new fields feed the total card's "Restaurant estimates" line and its "no estimate, not counted" note in the prototype.
  - description: |
      Routes in a new router file, registered in `main.py` next to `restaurant_options`:

      ```python
      @router.post("/{trip_id}/restaurants", status_code=201)
      def pick_restaurant(trip_id, body: RestaurantPickFields, ...) -> TripView: ...

      @router.put("/{trip_id}/restaurants/{pick_id}")
      def move_restaurant(trip_id, pick_id, body: RestaurantPickMove, ...) -> TripView: ...
      ```

      `pick_restaurant` uses `_editable_trip`, rebuilds the shortlist with the same helper as `restaurant_shortlist` (`_matches` + `build_shortlist`), and finds the entry whose name and city match. The price, currency, cuisine and link come from that entry, never from the request. A restaurant not on the shortlist gives `INVALID_RESTAURANT` (422); one already on the trip gives `ALREADY_ON_TRIP` (409); more than `MAX_RESTAURANTS = 40` gives 422. A date that is not one of `trip.days` gives 422. `move_restaurant` changes only date and meal, 404 for an unknown pick id, same day check. Both save through a `_save_restaurants(...)` helper that matches `_save_sim` and returns `_view(...)`, so the response carries the new `cost`. If `_matches` and the helpers are private to `restaurant_options.py`, put the routes in that file instead of a new one.
    files:
      - services/api/app/routers/restaurant_picks.py
      - services/api/app/routers/trips.py
      - services/api/app/main.py
    rationale: |
      Same shape as `pick_sim` (server rebuilds the shortlist and snapshots the option) and `move_activity` (PUT with a new day). Editors can pick and move because `_editable_trip` allows the owner and accepted editors. `INVALID_RESTAURANT` is added beside `INVALID_SIM` in `trips.py`.
  - description: |
      Web API client and pure helpers. In `api.ts` add `RestaurantPick`, `Meal` and `Trip.restaurants?: RestaurantPick[]`, add `restaurant_total` and `restaurant_unpriced_count` to `CostSummary`, and add:

      ```ts
      export const pickRestaurant = (tripId: string, input: { name: string; city: string; date: string | null; meal: Meal | null }) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/restaurants`, 'POST', input)
      export const moveRestaurant = (tripId: string, id: string, input: { date: string | null; meal: Meal | null }) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/restaurants/${encodeURIComponent(id)}`, 'PUT', input)
      ```

      New `restaurantPicks.ts` with `pickEstimate(pick, travellers): number | null`, `estimateLabel(...)` ("Estimate 38.00 EUR" or "Estimate unavailable", always with the currency code via `formatMoney`), `picksForDay(picks, date)` ordered breakfast, lunch, dinner, and `unscheduled(picks)`.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/restaurantPicks.ts
    rationale: |
      Keeps formatting and grouping out of the components so they are unit-testable. The estimate is shown from the pick's own snapshot price times the trip's group size, the same arithmetic the server uses.
  - description: |
      Shortlist screen and the two dialogs, per the prototype screens "Restaurant shortlist", "Add restaurant to trip" and "Move restaurant".

      Shortlist: in `RestaurantShortlistEntry.tsx`, the `.btn-primary` is "Add to trip" with `aria-label="Add {name} to trip"`. A restaurant already on the trip shows a disabled `.btn-secondary` "Added to trip" with a check icon and `aria-pressed="true"`. Add the line "Add as many as you like. Estimates use your group of N travellers." under the heading. In `RestaurantShortlistPage.tsx` pass the trip's picks (from `fetchTrip`) into the entries and open the dialog from the button.

      New `RestaurantPickDialog.tsx`, one component with `mode: 'add' | 'move'`, built on `Overlay.tsx` as the existing modals are: a `.modal` form with `role="dialog"`, `aria-modal`, the restaurant name in bold, a `.field` with `.select` "Day" (Unscheduled first, then each trip day by its date and name), a `fieldset` "Meal" of `.radio` Breakfast / Lunch / Dinner that is disabled until a day is chosen (hint "Pick a day first to choose a meal."), and in add mode a `.badge.badge-neutral` estimate plus `.field-hint` ("Estimate: 19.00 EUR per person x 2 travellers. Included in your trip total." or "No typical price is known for X, so it won't count toward your trip total."). Choosing Unscheduled clears the meal. Submitting a day with no meal shows `.field-error` ("Choose a meal for Day 1, or switch the day to Unscheduled.") with `.is-invalid`, and focus goes to the first radio. Actions are `.btn-primary` "Add to trip" / "Move" and `.btn-ghost` "Cancel". The button shows "Adding…" / "Moving…" while the request runs. A failed request shows an `.alert-danger` in the dialog ("We couldn't add that restaurant. Try again."). Success shows a `.toast` ("Casa Lima added to Unscheduled", "Casa Lima added to Day 1, lunch", "Casa Lima moved to Day 2").
    files:
      - apps/web/src/trips/RestaurantShortlistEntry.tsx
      - apps/web/src/trips/RestaurantShortlistPage.tsx
      - apps/web/src/trips/RestaurantPickDialog.tsx
    rationale: |
      Prototype states covered: Unscheduled with Meal off (AC 2), day with meal (AC 3), day without meal error, estimate and unknown-price badge (AC 5, 9), several picks (AC 1). The prototype uses `.modal` for these dialogs. The UI guidelines say `.drawer` for editing in context and `.modal` only for confirmations; the prototype is the approved design, so the plan follows it and flags the difference below.
  - description: |
      Trip itinerary and total card, per the prototype screen "Trip itinerary".

      `ItineraryTab.tsx`: add an "Unscheduled" `.card` before the day cards that lists unscheduled restaurant picks, or the muted text "No unscheduled restaurants. Anything you add without a day lands here." Each day card lists its picks as rows (meal label, restaurant name, estimate badge, ghost "Move" button with `aria-label="Move {name}"`) ordered breakfast, lunch, dinner. A pick appears under exactly one day (AC 4). The day card's existing empty state shows only when the day has no options, activities or picks. Moving opens `RestaurantPickDialog` in move mode with the current day and meal preselected. Add an "Add restaurants" `.btn-secondary` linking to `/trips/:id/restaurant-options/shortlist`. Move is shown only when `can_edit`.

      `TripTotalCard.tsx`: add a "Restaurant estimates" line with `cost.restaurant_total`, a "N restaurant(s) has/have no estimate and isn't/aren't counted." note when `restaurant_unpriced_count > 0`, and a "{amount} left of your {budget} budget." line when the total is within budget. Render the over-budget message in an `.alert.alert-warning` with `role="alert"` and keep the text "Over budget by X", so the existing assertions still hold. The heading reads "Trip total (estimate)" in the prototype. Money is always shown with its currency code via `formatMoney`.

      `TripDetailPage.tsx`: pass the picks and a move handler to `ItineraryTab`, update the trip from the `Trip` the API returns so the total refreshes, and show the toast.
    files:
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/trips/TripTotalCard.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/index.css
    rationale: |
      The itinerary epic owns the Unscheduled section and the total display, so this adds only what restaurants need to them: a minimal Unscheduled card and total lines, with no redesign. CSS additions use only existing tokens (`--space-*`, `--color-*`) and the prototype's `.pick-row`, `.meal-label`, `.total-lines` rules, with single column on phones and `.grid` / two columns from 48rem.
tests:
  - |
    AC1 (API, `services/api/tests/unit/test_restaurant_picks_router.py`): picking two different shortlisted restaurants leaves both on the trip.
    ```python
    client.post(f"/trips/{tid}/restaurants", json={"name": "Casa Lima", "city": "Lisbon"})
    r = client.post(f"/trips/{tid}/restaurants", json={"name": "Zaytoon Alfama", "city": "Lisbon"})
    assert r.status_code == 201
    assert [p["name"] for p in r.json()["restaurants"]] == ["Casa Lima", "Zaytoon Alfama"]
    ```
    Also: a restaurant not on the shortlist gives 422 `invalid_restaurant`; the same one twice gives 409 `already_on_trip`; a stranger gets 404; a read-only share viewer cannot pick.
  - |
    AC1 (web, `RestaurantShortlistPage.test.tsx`): the entry button reads "Add to trip" and a picked restaurant shows "Added to trip" disabled.
    ```ts
    expect(screen.getByRole('button', { name: 'Add Casa Lima to trip' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Added to trip/ })).toBeDisabled()
    ```
  - |
    AC2 (API): a pick with no day or meal is stored unscheduled; the web shows it in the Unscheduled card.
    ```python
    p = r.json()["restaurants"][0]
    assert p["date"] is None and p["meal"] is None
    ```
    ```ts
    const unscheduled = within(screen.getByRole('region', { name: 'Unscheduled' }))
    expect(unscheduled.getByText('Casa Lima')).toBeInTheDocument()
    ```
  - |
    AC3 (API + web): a pick with a day and meal is stored on that day, and the dialog enforces day and meal together.
    ```python
    r = client.post(url, json={"name": "Casa Lima", "city": "Lisbon", "date": "2026-05-01", "meal": "lunch"})
    assert (r.json()["restaurants"][0]["date"], r.json()["restaurants"][0]["meal"]) == ("2026-05-01", "lunch")
    assert client.post(url, json={"name": "Mesa Real", "city": "Lisbon", "date": "2026-05-01"}).status_code == 422
    assert client.post(url, json={"name": "Mesa Real", "city": "Lisbon", "meal": "lunch"}).status_code == 422
    assert client.post(url, json={"name": "Mesa Real", "city": "Lisbon", "date": "2030-01-01", "meal": "lunch"}).status_code == 422
    ```
    ```ts
    // RestaurantPickDialog.test.tsx
    expect(screen.getByRole('group', { name: 'Meal' })).toBeDisabled()          // Unscheduled by default
    await user.selectOptions(screen.getByLabelText('Day'), '2026-05-01')
    expect(screen.getByRole('group', { name: 'Meal' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Add to trip' }))      // no meal chosen
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a meal for')
    expect(pickRestaurant).not.toHaveBeenCalled()
    ```
    ItineraryTab test: a Lunch pick on Day 1 renders in that day's card with the label "Lunch".
  - |
    AC4 (API + web): moving a pick changes its day and meal and nothing else.
    ```python
    r = client.put(f"/trips/{tid}/restaurants/{pid}", json={"date": "2026-05-02", "meal": "dinner"})
    assert r.json()["restaurants"][0]["date"] == "2026-05-02"
    assert len(r.json()["restaurants"]) == 1
    assert client.put(f"/trips/{tid}/restaurants/nope", json={"date": None, "meal": None}).status_code == 404
    ```
    ```ts
    // ItineraryTab / TripDetailPage test: after Move to Day 2 the pick leaves the Day 1 card
    expect(within(day1).queryByText('Casa Lima')).not.toBeInTheDocument()
    expect(within(day2).getByText('Casa Lima')).toBeInTheDocument()
    ```
    Moving to Unscheduled clears the meal.
  - |
    AC5 (unit + web): the estimate is price per person x group size, labelled as an estimate.
    ```python
    # trip.traveller_count = 3, typical_price = Decimal("19")
    assert summarise_cost(trip, rates).restaurant_total == 57.0
    ```
    ```ts
    expect(estimateLabel(pick({ typical_price: '19' }), 3, 'EUR')).toBe('Estimate 57 EUR')
    expect(screen.getByText('Estimate 38 EUR')).toBeInTheDocument()   // dialog and pick row
    ```
    A trip with `traveller_count = None` counts as one traveller.
  - |
    AC6 (cost unit, `services/api/tests/unit/test_cost_restaurants.py`): the total includes the sum of the estimates, and a foreign-currency price is converted.
    ```python
    assert summary.total == 100.0 + 38.0 + 44.0     # an existing 100 option + two restaurants at 19 and 22 for 2
    assert summary.restaurant_total == 82.0
    ```
    Web: `TripTotalCard.test.tsx` shows the "Restaurant estimates" line with the formatted `restaurant_total`.
  - |
    AC7 (cost unit + web): total above budget gives over-budget output.
    ```python
    assert summary.over_budget_by == 24.0           # budget 1300, total 1324
    ```
    ```ts
    expect(screen.getByRole('alert')).toHaveTextContent('Over budget by 24 EUR')
    ```
    The existing over-budget assertions in `TripTotalCard.test.tsx` still pass.
  - |
    AC8 (cost unit + web): within budget, and exactly equal to budget, gives no warning.
    ```python
    assert summary.over_budget_by == 0.0
    ```
    ```ts
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/left of your/)).toBeInTheDocument()
    ```
  - |
    AC9 (API + web): a restaurant with no typical price is picked and shows "Estimate unavailable".
    ```python
    # Provider fixture with typical_price=None; shortlist no longer 500s and does not mark it over budget
    assert entry["restaurant"]["typical_price"] is None and entry["fits_budget"] is True
    assert r.json()["restaurants"][0]["typical_price"] is None
    ```
    ```ts
    expect(screen.getByText('Estimate unavailable')).toBeInTheDocument()
    ```
    The compare and options pages show "Typical price not available" and do not throw.
  - |
    AC10 (cost unit + web): one unpriced pick among priced ones is left out of the total and noted.
    ```python
    assert summary.restaurant_total == 38.0
    assert summary.total == 1180.0 + 38.0
    assert summary.unpriced_count == 1 and summary.restaurant_unpriced_count == 1
    ```
    ```ts
    expect(screen.getByText('1 restaurant has no estimate and isn\'t counted.')).toBeInTheDocument()
    ```
  - |
    Data (API, `test_store.py` / `test_restaurant_picks_router.py`): a trip stored without a `restaurants` key still loads and reads back as `restaurants == []`; a pick round-trips through `InMemoryTripStore` and through `DynamoTripStore._to_trip` (Decimal price preserved).
    ```python
    trip = DynamoTripStore._to_trip({"pk": "USER#u", "sk": "TRIP#t", "id": "t", "name": "Old trip"})
    assert trip.restaurants == []
    ```
  - |
    E2E (`apps/web/e2e/restaurant-picks.spec.ts`, playwright, at 375px and desktop): from the shortlist add two restaurants, one Unscheduled and one on Day 1 lunch, see both on the trip with estimates, move the Day 1 pick to Day 2, and see the trip total change and the over-budget alert appear when the budget is small. Write these test files first and confirm each fails before writing the production code.
assumptions_or_open_questions:
  - |
    The prototype's Add to trip, Move and "Added to trip" states replace the 026 "Choose" button on a shortlist entry, and the plan removes the client-only "chosen" state and its toast. Story 026's tests for Choose need updating. Say so if Choose must stay next to Add to trip.
  - |
    The prototype uses `.modal` for the add and move dialogs, but the UI guidelines reserve `.modal` for confirmations and prefer `.drawer` for editing in context. The plan follows the approved prototype. If you prefer the guideline, only the container changes.
  - |
    The prototype shows the over-budget message as `.alert-warning` in the total card, while the current `TripTotalCard` uses a danger badge. The plan uses the alert from the prototype and keeps the "Over budget by X" text, so existing tests keep passing.
  - |
    Restaurants have no id, so a pick is matched to the shortlist by name and city, the same key the shortlist page already uses (`restaurantKey`). Two restaurants with the same name in the same city cannot both be picked.
  - |
    The prototype's "Day 1/2/3" are the trip's own Days (one per date from `reconcile_days`), so the API takes a date and the UI shows the day name and date. Picks cannot be put on a date outside the trip.
  - |
    The prototype's "Stays, transport and activities" line is not built. The total card shows the existing total and the restaurant line only, because the itinerary epic owns the total display.
  - |
    Removing a pick is not in the acceptance criteria and is not planned. The shortlist's existing client-side Remove is unrelated and unchanged.
  - |
    A restaurant priced in another currency is converted at the existing rate source. If there is no rate it is counted in `unconvertible_count` and left out, like other picks.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: `Trip` gains `restaurants: list[RestaurantPick] = []`. Trips already in the Trip Database have no such attribute, so `Trip.model_validate` fills the empty default and they stay readable. No table or key change, and DynamoDB needs no migration. `ProviderRestaurant.typical_price` becoming optional only widens what providers may return and is not stored data.
  - **Backfill / seed**: None needed. The local fixture providers (`app/dining/providers.py`, `local_seed.py`) should gain one restaurant with no typical price so the "Estimate unavailable" path can be tried locally; that is idempotent seed data.
  - **Settings**: None — no new setting or env var.
  - **Provisioning**: None — the existing trip table and fake providers are enough.
  - **Order and rollback**: Deploy the API first, then the web. The old web ignores the new `restaurants` and cost fields. To roll back, redeploy the previous build: picks already saved stay in the item and are ignored by the old code, and the old model drops them if the trip is re-saved. There is no down migration.

  ### Shape

  ```mermaid
  flowchart TD
    Web[RestaurantShortlistPage + RestaurantPickDialog]:::touched -->|POST/PUT restaurants| Router[routers/restaurant_picks.py]:::touched
    Router --> Load[trips._editable_trip / _view]:::touched
    Router --> Short[dining/shortlist.build_shortlist]:::touched
    Short --> Opt[dining/options.ProviderRestaurant]:::touched
    Load --> Store[trips/store.Trip + RestaurantPick]:::touched
    Load --> Cost[trips/cost.summarise_cost]:::touched
    Cost --> Card[TripTotalCard]:::touched
    Store --> Itin[ItineraryTab Unscheduled + day rows]:::touched
    classDef touched fill:#f96,color:#000
  ```

  Touched nodes: the router (new, picks and moves, rebuilds the shortlist so price is never trusted from the client); `store.py` (the Trip snapshot); `options.py` and `shortlist.py` (optional price); `cost.py` (the single place the total and the over-budget amount are worked out); the web dialog, itinerary and total card (the prototype screens).

  ### Why this shape

  The pick follows the SIM pick: the server rebuilds the shortlist and snapshots the option, so the client cannot set a price. The over-budget warning needs no new rule because `over_budget_by` already flags a total above budget. Only the estimate has to be added into the total.
review_focus: |
  IN: the picks on the Trip, the add and move routes, the estimate in `summarise_cost`, the optional typical price, and the prototype's dialogs, Unscheduled card, day rows and total-card lines. OUT: removing a pick, the itinerary epic's own redesign of the Unscheduled and total sections, and booking links. The riskiest part is the cost sum (currency conversion, group size, unpriced picks left out, equal-to-budget not over) and making `typical_price` optional without breaking the 026 sort and `fits_budget`. Deliberate: price comes from the rebuilt shortlist rather than the request, and the Add to trip button replaces Choose and the add and move dialogs are modals because the approved prototype says so (see the open questions).
