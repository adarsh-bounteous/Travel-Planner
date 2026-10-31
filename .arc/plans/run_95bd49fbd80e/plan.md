summary: |
  Restaurant picks already exist (shortlist page, `RestaurantPickDialog`, `trip.restaurants`, `ItineraryTab` day/Unscheduled lists), but they are invisible on the trip Overview, default to Unscheduled when added, disappear from the itinerary on a trip without dates, and are missing from the shared read-only view because the API's `SharedTrip` allow-list drops `restaurants`. This plan (1) adds a Restaurants card to the Overview tab with an empty state, (2) makes the add-restaurant form default to the first day + Dinner on a dated trip and offer only Unscheduled on an undated one, (3) keeps the Unscheduled box visible on an undated trip, explains itself ("Holds picks with no day yet.") and gives each pick a Schedule button, and (4) exposes picks on the shared read-only trip, in the API allow-list and in a Restaurants section on `SharedTripPage`. Test-first throughout; no restaurant search or recommendation changes.

scope:
  - description: |
      API: add picks to the shared read-only body. Add a `SharedRestaurant` model (id, name, city, cuisine, typical_price, currency, date, meal; NO `url`) and a `restaurants: list[SharedRestaurant]` field on `SharedTrip`, built in `read_shared_trip` the same way `options` is (exclude from the `model_dump(include=...)` and map explicitly).

      ```python
      class SharedRestaurant(BaseModel):
          """A restaurant pick as a read-only viewer sees it: no link."""
          id: str
          name: str
          city: str
          cuisine: str
          typical_price: Decimal | None = None
          currency: str
          date: date | None = None
          meal: Meal | None = None
      ```
    files:
      - services/api/app/routers/shared.py
      - services/api/tests/unit/test_share_link_router.py
    rationale: |
      AC6. `SharedTrip` is an explicit allow-list ("a field added to Trip later stays private"), so `restaurants` is currently stripped and the shared page can never show them. Existing stored trips already carry `restaurants` (default `[]`), so no migration is needed.

  - description: |
      Web helper and types: add `dayMealLabel(pick, days)` to `restaurantPicks.ts` returning "Unscheduled" or "Day 2, Dinner" (day name from `trip.days`, meal via the existing `mealLabel`), and a `defaultDay(days)` returning the first day's date or '' . Reuse existing `estimateLabel` (formatMoney shows the currency) and `unscheduled`. Make the `RestaurantPick` fields the shared page needs optional-safe: the shared payload now has the same shape, so no type change is expected (`url` is simply absent; `url: string | null` becomes `url?: string | null`).
    files:
      - apps/web/src/trips/restaurantPicks.ts
      - apps/web/src/trips/restaurantPicks.test.ts
      - apps/web/src/trips/api.ts
    rationale: |
      One place for the "day, meal" wording used by the Overview card and the dialog toast, so Overview and itinerary can't disagree.

  - description: |
      Overview Restaurants card (AC1, AC9). New `RestaurantsCard` component rendered in `TripDetailPage`'s Overview branch (the `else` that currently renders only `TravelHelpersCard`), above it. Per the prototype's "Trip Overview" screen: a `.card.stack` with `<h2>Restaurants</h2>`, a list of picks (one row per pick: bold name; `.pick-meta` with a `.badge` showing the day + meal, `badge-success` with the calendar icon when scheduled, `badge-neutral` "Unscheduled" otherwise; muted `estimateLabel`), and a "View shortlist" link to `/trips/:id/restaurant-options/shortlist`. With no picks it shows the prototype's `.empty-state` ("No restaurants picked yet" / "Found somewhere you'd love to eat? Add it and we'll slot it into your days.") with one `.btn.btn-primary` link "Add a restaurant" to the same shortlist route (link shown when `canEdit`).

      ```tsx
      export function RestaurantsCard({ trip, canEdit }: { trip: Trip; canEdit: boolean }): JSX.Element
      ```
      Styling only with tokens already in `design-system/tokens.css`, loaded by `apps/web/src/index.css:2` (`@import "../../../design-system/tokens.css"`). New classes in `index.css` (the prototype's `.picks`, `.pick-main`, `.pick-meta`): `--space-1`, `--space-2`, `--space-3`, `--border-width`, `--color-border`. Reuse the existing global `.card`, `.stack`, `.badge`, `.badge-success`, `.badge-neutral`, `.empty-state`, `.btn-primary`, `.text-muted`, `.text-bold`. The existing `.pick` / `.pick-row` / `.pick-list` classes already exist in `index.css` (lines 177-194) with other meanings (`.pick` is a bordered selectable radio row), so the new list uses new names (`.restaurant-picks`, `.restaurant-pick`) rather than the prototype's `.picks`/`.pick`.
    files:
      - apps/web/src/trips/RestaurantsCard.tsx
      - apps/web/src/trips/RestaurantsCard.test.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/TripDetailPage.test.tsx
      - apps/web/src/index.css
    rationale: |
      No existing component fits (OptionCard and CompareTable are for comparison, as the prototype's design plan notes), so this is a small new component. It is a section for Overview only; the itinerary keeps its own `PickRow`.

  - description: |
      Add-restaurant form defaults and day options (AC2, AC3, AC4, AC5, AC7). In `RestaurantPickDialog.tsx` (add mode only; move mode keeps the pick's own day and meal):
      - initial state: `day = defaultDay(days)` and `meal = day ? 'dinner' : null`, so saving unchanged posts `{ date: days[0].date, meal: 'dinner' }`;
      - `changeDay`: choosing Unscheduled clears the meal (existing), choosing a day when meal is null sets `'dinner'`;
      - options: days first, then `Unscheduled` last, and only `Unscheduled` when `days` is empty (already true, now covered by a test); the hint reads "This trip has no dates yet, so picks go to Unscheduled." when there are no days;
      - render as `kind="drawer"` (UI guidelines: drawer for editing in context; the prototype's "Add restaurant" screen is a drawer) instead of `kind="modal"`; the `Overlay` already supports it. The move flow is unchanged and may keep the modal if that avoids churn, but both modes share the component, so use the drawer for both.
      - the success toast keeps "added to Day 1, dinner" / "added to Unscheduled".
    files:
      - apps/web/src/trips/RestaurantPickDialog.tsx
      - apps/web/src/trips/RestaurantPickDialog.test.tsx
    rationale: |
      Today the dialog opens on Unscheduled with no meal, which is why itineraries fill with Unscheduled picks. The server already validates date and meal together (`_check_day_and_meal`), so no API change is needed.

  - description: |
      Itinerary Unscheduled box (AC8, AC10, AC11) in `ItineraryTab.tsx`:
      - render the Unscheduled section also when `days.length === 0` (currently the early return shows only the "No days yet" empty state and hides the picks); the early-return empty state stays above it;
      - add the always-visible hint `<p className="text-muted">Holds picks with no day yet.</p>` under the heading;
      - in `PickRow`, an unscheduled pick (`date === null`) shows a `.btn.btn-secondary.btn-sm` button "Schedule" with `aria-label={`Schedule ${pick.name}`}`, calling `onMoveRestaurant`; dated picks keep "Move";
      - on an undated trip show `.alert.alert-info` "Add trip dates to give picks a day." (editors only);
      - restyle the Unscheduled section with the prototype's `.unscheduled` box (dashed `--color-border-strong` border, `--radius-lg`, `--space-3` padding, `--color-surface` background) in `index.css`.
      In `TripDetailPage.tsx` the `onMoveRestaurant` handler, when `trip.days` is empty, sets the toast "Add trip dates first, then you can give this pick a day." instead of opening the dialog (the prototype's Schedule behaviour for an undated trip). Day-card meal placement (AC3, AC4) already works via `picksForDay` and needs only regression tests.
    files:
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/trips/ItineraryRestaurants.test.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/index.css
    rationale: |
      The existing test "asks to move a pick" uses an unscheduled pick and a "Move Casa Lima" button; it is rewritten to "Schedule Casa Lima", with a new test that a dated pick still shows Move.

  - description: |
      Shared read-only view (AC6). `SharedTripPage` renders a `.card.stack` "Restaurants" section (prototype "Shared trip (read-only)" screen: heading plus a list of pick names, no actions) when `trip.restaurants` is non-empty, using the same `restaurant-picks` list classes. `ItineraryTab` is rendered with no `onMoveRestaurant`, so day/Unscheduled lists stay read-only.
    files:
      - apps/web/src/trips/SharedTripPage.tsx
      - apps/web/src/trips/SharedTripPage.test.tsx
    rationale: |
      Depends on the API change above; keeps the shared page free of any edit control.

tests:
  - |
    AC1 (vitest, `RestaurantsCard.test.tsx` and `TripDetailPage.test.tsx`): a trip with one pick `{name:'Time Out Market', date:'2026-05-02', meal:'dinner', typical_price:'45', currency:'EUR'}`, travellers 1. Open the Overview tab and assert:
    ```ts
    const card = within(screen.getByRole('region', { name: 'Restaurants' }))
    expect(card.getByText('Time Out Market')).toBeInTheDocument()
    expect(card.getByText(/Day 2, Dinner/)).toBeInTheDocument()
    expect(card.getByText(/Estimate 45 EUR/)).toBeInTheDocument()
    expect(card.getByRole('link', { name: 'View shortlist' })).toHaveAttribute('href', '/trips/t1/restaurant-options/shortlist')
    ```
    (the section gets `aria-labelledby` on its h2 so it is a region.)
  - |
    AC2 (`RestaurantPickDialog.test.tsx`): add mode with two days shows a Day select and a Meal group.
    ```ts
    expect(screen.getByLabelText('Day')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Meal' })).toBeInTheDocument()
    ```
  - |
    AC3 (`RestaurantPickDialog.test.tsx` + `ItineraryRestaurants.test.tsx`): opening add mode and pressing "Add to trip" without touching anything calls `pickRestaurant` with the first day and dinner, and a pick with that date/meal appears under the day card.
    ```ts
    expect(pickRestaurant).toHaveBeenCalledWith('t1', { name: 'Casa Lima', city: 'Lisbon', date: '2026-05-01', meal: 'dinner' })
    expect(screen.getByLabelText('Day')).toHaveValue('2026-05-01')
    expect(screen.getByRole('radio', { name: 'Dinner' })).toBeChecked()
    // itinerary
    expect(within(screen.getByRole('region', { name: /1 May/ })).getByText('Dinner')).toBeInTheDocument()
    ```
  - |
    AC4 (`ItineraryRestaurants.test.tsx`): a pick with `date: '2026-05-01', meal: 'dinner'` is not in the Unscheduled region.
    ```ts
    expect(within(screen.getByRole('region', { name: 'Unscheduled' })).queryByText('Casa Lima')).toBeNull()
    ```
  - |
    AC5 (`RestaurantPickDialog.test.tsx` + `ItineraryRestaurants.test.tsx`): choosing Unscheduled sends a null date and meal, and an unscheduled pick is listed in the Unscheduled box.
    ```ts
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to trip' }))
    await waitFor(() => expect(pickRestaurant).toHaveBeenCalledWith('t1', { name: 'Casa Lima', city: 'Lisbon', date: null, meal: null }))
    ```
  - |
    AC6 (API, `test_share_link_router.py`): the public body carries picks by name and still withholds the link.
    ```python
    body = TestClient(app).get(f"/shared/{token}").json()
    assert [r["name"] for r in body["restaurants"]] == ["Casa Lima"]
    assert "url" not in body["restaurants"][0]
    ```
    Also `test_public_body_is_an_allow_list` keeps passing. (Web, `SharedTripPage.test.tsx`):
    ```ts
    expect(within(await screen.findByRole('region', { name: 'Restaurants' })).getByText('Casa Lima')).toBeInTheDocument()
    ```
  - |
    AC7 (`RestaurantPickDialog.test.tsx`): add mode with `days: []`.
    ```ts
    const options = within(screen.getByLabelText('Day')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Unscheduled'])
    ```
  - |
    AC8 (`ItineraryRestaurants.test.tsx`): a trip with `days: []` and one unscheduled pick still renders the pick.
    ```ts
    const box = within(screen.getByRole('region', { name: 'Unscheduled' }))
    expect(box.getByText('Casa Lima')).toBeInTheDocument()
    ```
  - |
    AC9 (`RestaurantsCard.test.tsx`): no picks.
    ```ts
    expect(screen.getByText('No restaurants picked yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a restaurant' })).toHaveAttribute('href', '/trips/t1/restaurant-options/shortlist')
    ```
  - |
    AC10 (`ItineraryRestaurants.test.tsx`): with an unscheduled pick the box shows the hint.
    ```ts
    expect(within(screen.getByRole('region', { name: 'Unscheduled' })).getByText('Holds picks with no day yet.')).toBeInTheDocument()
    ```
  - |
    AC11 (`ItineraryRestaurants.test.tsx`): the unscheduled pick has a Schedule button that calls the handler; a dated pick still has Move.
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Casa Lima' }))
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
    ```
    In `TripDetailPage.test.tsx`, on a trip without days, clicking Schedule shows the toast "Add trip dates first, then you can give this pick a day." and does not open a dialog.
  - |
    Existing tests to update because behaviour changed (not new ACs): `RestaurantPickDialog.test.tsx` cases that assumed an Unscheduled/no-meal initial state, and the `Move Casa Lima` test on an unscheduled pick in `ItineraryRestaurants.test.tsx`. Run narrowly, for example `(cd apps/web && pnpm run test -- src/trips/RestaurantsCard.test.tsx)` and `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_share_link_router.py)`.

assumptions_or_open_questions:
  - |
    The prototype's Add restaurant drawer has a free-text name and an estimate/currency input. The real flow adds a restaurant from the shortlist (name, city and price come from the entry), and restaurant search/recommendations are out of scope, so the plan keeps the name read-only and shows the estimate as text rather than adding inputs. The prototype's name-required error and a "saving" label are therefore not built beyond the existing "Adding…" state. Reviewer: confirm.
  - |
    The prototype shows the estimate as a per-person amount (`EUR 45.00`). The app already shows a group estimate via `estimateLabel` ("Estimate 38 EUR", price x travellers), so Overview reuses it for consistency with the itinerary and the dialog. AC1 only requires an estimate with currency.
  - |
    The prototype's tab strip is Overview, Itinerary, Shortlist. The real tabs are Overview, Itinerary, Stays, Transport, Travelers and Recommendations, so the plan does not add a tab; the Restaurants card goes in the existing Overview tab, and the shortlist is reached by the "View shortlist" link.
  - |
    `TripDetailPage` currently opens on the Itinerary tab (`useState<Tab>('itinerary')`). The plan leaves the default alone; AC1 is met by opening Overview. Say if Overview should become the default.
  - |
    The shared payload includes pick id, city, cuisine, price and currency but not the restaurant link (`url`), matching how options drop `booking_url`. If the owner would rather share names only, drop price/cuisine from `SharedRestaurant` and show names without estimates there.
  - |
    The prototype's undated-trip Schedule behaviour (a toast saying to add dates first) is built as drawn; the alternative is hiding Schedule when there are no days, but AC11 wants the button visible on an Unscheduled pick.
  - |
    Prototype and AC are consistent on the points checked; no conflict found. The prototype's secondary "Add a restaurant" row link on Overview is not built, since the card already links to the shortlist and the empty state has the one primary button.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout
  None — no schema, migration, seed or setting changes. `SharedTrip` gains a response field read from the existing `Trip.restaurants` list (default `[]`), so trips stored before this change return an empty list and render the same as before. Deploy order: API and web can ship together; an old web build ignores the new field, and a new web build shows no Restaurants section against an old API (the field is optional on the client). Rollback: revert the commit.

  ### Context read
  - Stack: React + Vite + Tailwind v4 web app with vitest; FastAPI API with pytest. Tokens load via `apps/web/src/index.css:2` (`@import "../../../design-system/tokens.css"`); component styles live in `index.css` using `var(--token)` only. Tokens used by the new CSS: `--space-1/2/3`, `--border-width`, `--color-border`, `--color-border-strong`, `--color-surface`, `--radius-lg`.
  - The prototype (`TRAVEL-PLANNER-APP-STORY-110-design.html`) has five screens: Trip Overview (Restaurants `.card` with pick rows, `.empty-state` with a `.btn-primary`), Add restaurant (drawer; Day `select`, Meal radios, default first day + Dinner), Itinerary dated (`.grid-days` day cards, `.unscheduled` box with the hint "Holds picks with no day yet." and Schedule buttons), Itinerary undated (info alert plus Unscheduled box), Shared trip (View only badge, Restaurants card of names). Day cards already follow this shape in `ItineraryTab`.
  - Already built, so only tested: AC3/AC4 day-card placement (`picksForDay`), AC7's Unscheduled-only option when `days` is empty, and server validation that day and meal go together.

  ```mermaid
  flowchart TD
    TDP[TripDetailPage.tsx] -->|Overview branch renders| RC[RestaurantsCard.tsx - new]
    TDP -->|onMoveRestaurant, toast when no days| IT[ItineraryTab.tsx]
    TDP --> RPD[RestaurantPickDialog.tsx]
    RSP[RestaurantShortlistPage.tsx] --> RPD
    STP[SharedTripPage.tsx] --> IT
    STP -->|fetchSharedTrip| API[api.ts]
    API -->|GET /shared/token| SH[routers/shared.py]
    SH --> ST[trips/store.py Trip.restaurants]
    RC --> RP[restaurantPicks.ts]
    IT --> RP
    RPD --> RP
    classDef touched fill:#f96,color:#000
    class TDP,RC,IT,RPD,STP,SH,RP touched
  ```
  Touched: `RestaurantsCard` (new Overview section), `ItineraryTab` (Unscheduled box, Schedule), `RestaurantPickDialog` (defaults, drawer), `restaurantPicks` (labels/default day), `SharedTripPage` and `routers/shared.py` (picks on the shared view), `TripDetailPage` (wiring). `RestaurantShortlistPage` is untouched but picks up the new dialog defaults.

review_focus: |
  IN scope: the Overview Restaurants card, add-form defaults and day options, the itinerary Unscheduled box (hint, Schedule, visible on undated trips), and picks on the shared view including the API allow-list. OUT: restaurant search, recommendations, shortlist ranking, and any new inputs for name or price. The riskiest part is the shared endpoint, since it is an explicit allow-list and `SharedRestaurant` must not leak `url` or anything else private; also check that move mode of `RestaurantPickDialog` keeps the pick's own day and meal while only add mode defaults to the first day plus Dinner. Deliberate choices: the new list classes are named `restaurant-picks`/`restaurant-pick` because `.pick` and `.pick-list` already exist in `index.css` with other meanings, and Overview reuses `estimateLabel` (group estimate) rather than the prototype's per-person figure.
