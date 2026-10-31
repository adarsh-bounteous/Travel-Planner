summary: |
  Add four money sections to the itinerary page (`/trips/:tripId/itinerary`): Bookings and confirmations, Included, Not included (with add links and a standard exclusions list) and Cost summary (per-currency totals, a total in the trip currency, a conversion note with its rate date, and an estimates note). The server builds all of it in `build_itinerary`, so the inclusion rules are testable in Python, and the page only renders it, following the approved prototype. A booked stay outside the trip dates gets a warning alert plus a row badge. Essentials (SIM, insurance, visa, and the stay and transport essentials when unchosen) and the checklist stay out of scope.
scope:
  - description: |
      New module `app/trips/money.py` with pure builders over a `Trip`, a `RateSource` and a date:

      ```python
      def build_money(trip: Trip, rates: RateSource, today: date) -> Money: ...
      ```

      `Money` holds `bookings: list[Booking]`, `included: list[PricedLine]`, `not_included: list[NotIncludedLine]`, `standard_exclusions: list[str]` and `cost: CostBreakdown`.
      - `Booking`: `name, kind, provider, start_date, end_date, price: Decimal | None, currency: str | None, status, link_url, outside_trip_dates: bool`. Chosen items are chosen stays (one row per stay), transport picks, `trip.options`, and restaurant picks. Provider link goes through `_http_link`.
      - `outside_trip_dates` reuses `stay_outside_trip` from `app/trips/store.py` and is only ever true for stays.
      - `included`: chosen items with a price. `not_included`: first the unchosen items (reason "unchosen", with `add_url`), then chosen items without a price (reason "unpriced"). `standard_exclusions` is a fixed list of five lines taken from the prototype.
      - Unchosen items are saved `trip.places` and `trip.needed_categories` with no chosen option, minus essentials. Essentials are an explicit constant `ESSENTIAL_CATEGORIES` (stay, transport, sim, insurance, visa, flight), compared case-insensitively. Unchosen `Stay` rows are essentials and are never listed.
      - `CostBreakdown`: `currency` (the trip currency), `subtotals: list[{currency, amount}]` in first-seen order, `total` in the trip currency (summed in Decimal, rounded half-up to 2 dp as in `cost.py`), `conversions: list[{currency, rate, rate_date}]` only for foreign-currency priced items that have a rate, `unconvertible_count`, and `estimates_note: str`. `rate_date` is `today`, which is how `currency_helper` in `app/routers/trip_helpers.py` dates a live rate, because `RateSource` has no dates.
      - Reuses `CENT` and the rounding approach from `app/trips/cost.py`, and does not call `summarise_cost`, because that total also contains the SIM and insurance essentials.
    files:
      - services/api/app/trips/money.py
      - services/api/tests/unit/test_money.py
    rationale: |
      Keeps the rules (AC 1-18) in one testable pure module, matching how `cost.py` and `itinerary.py` are split. Money is Decimal throughout.
  - description: |
      Wire it into the document model. `Itinerary` gains `money: Money` and the builder signature changes:

      ```python
      # before
      def build_itinerary(trip: Trip) -> Itinerary
      # after
      def build_itinerary(trip: Trip, rates: RateSource, today: date) -> Itinerary
      ```

      The router adds `rates: RateSource = Depends(get_rates)` and `today: date = Depends(get_today)` (both from `app/routers/deps.py`) and passes them in. Update the `Itinerary` docstring, which currently says it has no money field. The only non-test caller is `app/routers/itinerary.py`; existing tests in `test_itinerary.py` call `build_itinerary(trip)` and get `InMemoryRates({})` plus a fixed date.
    files:
      - services/api/app/trips/itinerary.py
      - services/api/app/routers/itinerary.py
      - services/api/tests/unit/test_itinerary.py
      - services/api/tests/unit/test_itinerary_router.py
    rationale: |
      The itinerary stays the single server-built document. `test_itinerary_router.py` asserts the response keys are exactly four and that words like `price`, `total` and `currency` never appear; both assertions encode the old "no money" rule and must change deliberately, keeping the editors, sharing, insurance, sim, essential and visa words absent.
  - description: |
      Web types in `apps/web/src/trips/api.ts`: add `Booking`, `PricedLine`, `NotIncludedLine`, `CostBreakdown`, `ItineraryMoney`, and `money: ItineraryMoney` on `Itinerary`. Update the doc comment that says the server leaves out money. Amounts arrive as strings (Decimal) and are formatted only at render, with `Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'code' })` so the currency is always shown and the traveller's locale is respected.
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Keeps the client contract in the same file as `fetchItinerary`.
  - description: |
      Extend `CompareTable` instead of building a new table: add optional `titleHeader?: string` (default "Option", so existing callers are unchanged) and `rowClassName?: (row: T) => string | undefined`. `BookingsTable` in `ItineraryMoney.tsx` uses it with columns Provider, Dates, Price, Status, Provider link, which is the prototype's `.bk-table` that turns into a card per row below 48rem. Status uses `.badge` (success = confirmed or booked, warning = pending, neutral = draft, danger = cancelled). The stay warning shows as a `.badge badge-warning` "Outside trip dates" with the alert icon in the Item cell plus one `.alert alert-warning` under the table, as in the prototype (icon and text, never colour alone). The flagged row uses `.is-flagged`.
    files:
      - apps/web/src/components/CompareTable.tsx
      - apps/web/src/components/CompareTable.test.tsx
    rationale: |
      Design plan in the prototype says "BookingsTable built on CompareTable". The shared component already has the desktop table and phone card behaviour.
  - description: |
      New `apps/web/src/trips/ItineraryMoney.tsx` exporting `ItineraryMoney({ money, tripId, tripDates })`, rendered inside `Document` in `ItineraryPage.tsx` after "Still to schedule". It follows the prototype's `#st-main`: four `<section class="section">` blocks with headings "Bookings and confirmations", "Included", "Not included", "Cost summary", separated by `hr.divider`, `aria-labelledby` on each.
      - Included: `.line-list` with name and `.amt`.
      - Not included: `.line-list`; unchosen rows have an "Add to plan" link (`<Link>` to `add_url`); unpriced rows show `.badge badge-neutral` "Unpriced" plus an "Add price" link; then the `h3.text-sm.text-muted` "Usually not covered by a trip plan" and `ul.excl` of the standard exclusions.
      - Cost summary: a `.card.total` with "Total in trip currency" and `.total-value` showing the amount and currency code; "Total per currency" `.line-list`; a conversion note `p.note` with the info icon only when `conversions` is non-empty, reading "EUR converted to USD at 1 EUR = 1.08 USD, rate from 28 Oct 2026."; always the estimates note "Prices are estimates and may change before you pay."
      - Empty state: when there are no chosen items, show the prototype's `.empty-state` "Nothing booked yet" with one `.btn-primary` "Explore options" linking to `/explore`, and still show Not included and its standard exclusions. The page's existing loading skeleton already covers the loading state.
      - Add `bookings-section`, `included-section`, `not-included-section` and `cost-summary-section` to `SECTIONS` in `ItineraryPage.tsx` so the "On this page" list covers them.
      - Dates use the page's `formatRange` helper (move it to a shared export if needed), because the traveller's locale format is required.
    files:
      - apps/web/src/trips/ItineraryMoney.tsx
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/trips/ItineraryMoney.test.tsx
      - apps/web/src/trips/ItineraryPage.test.tsx
    rationale: |
      One component per page region keeps `ItineraryPage.tsx` readable. Provider links are plain `<a>` (external) and add links are router `<Link>` (internal).
  - description: |
      Add the prototype's layout classes to `apps/web/src/index.css`, built only from the design tokens already imported at line 2 (`@import "../../../design-system/tokens.css"`): `.section`, `.line-list`, `.excl`, `.total`, `.total-value`, `.note`, `.unpriced`, `.is-flagged` and the booking-row flag.
      Tokens used: `--space-1`..`--space-4`, `--color-border`, `--color-fg-muted`, `--color-warning-subtle`, `--color-warning`, `--font-size-xl`, `--font-size-sm`, `--font-weight-bold`, `--font-weight-medium`, `--size-control-lg`, `--border-width`, `--radius-lg`. Print stylesheet: reuse the existing `@media print` block (no new chrome), keep `.alert` and `.badge` visible, and rows must not split (`break-inside: avoid`).
    files:
      - apps/web/src/index.css
    rationale: |
      The page is already printable. The new sections must not break that and must use no hex or px literals that a token covers.
tests:
  - |
    AC1 (test_money.py): a trip with one chosen stay, one transport pick and one option lists one row each.
    ```python
    def test_bookings_lists_each_chosen_item():
        m = build_money(_trip(stays=[_stay(_chosen())], transport=[_transport()], options=[_option()]), RATES, TODAY)
        assert [b.kind for b in m.bookings] == ["stay", "transport", "option"]
    ```
  - |
    AC2: the row carries provider, dates, price with currency, status and provider link; the web test checks the cells.
    ```python
    b = m.bookings[0]
    assert (b.provider, b.start_date, b.end_date) == ("Web", START, END)
    assert (b.price, b.currency, b.link_url) == (Decimal("300"), "EUR", "https://stays.example.com/x")
    assert b.status
    ```
    ```tsx
    const row = within(screen.getByRole('table', { name: /bookings/i })).getByRole('row', { name: /Alfama Loft/ })
    expect(within(row).getByText(/EUR/)).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: /Open Web for Alfama Loft/ })).toHaveAttribute('href', 'https://stays.example.com/x')
    ```
  - |
    AC3 and AC4: a priced chosen item is in `included`, and an unchosen saved place is not.
    ```python
    assert [i.name for i in m.included] == ["Alfama Loft"]
    assert "Sintra" not in [i.name for i in m.included]
    ```
  - |
    AC5 and AC6: an unchosen place is in `not_included` with `reason == "unchosen"` and an add link to the activity options route.
    ```python
    n = next(n for n in m.not_included if n.name == "Sintra")
    assert n.reason == "unchosen" and n.add_url == "/trips/t1/activity-options"
    ```
    ```tsx
    expect(within(notIncluded).getByRole('link', { name: /Add to plan/ })).toHaveAttribute('href', '/trips/t1/activity-options')
    ```
  - |
    AC7: the cost summary shows each currency total and the trip-currency total, each with its code.
    ```python
    assert [(s.currency, s.amount) for s in m.cost.subtotals] == [("EUR", Decimal("300")), ("USD", Decimal("120"))]
    assert m.cost.total == Decimal("444.00")  # 300 * 1.08 + 120
    ```
    ```tsx
    expect(within(cost).getByText(/USD/)).toBeInTheDocument()
    expect(within(cost).getByText(/EUR/)).toBeInTheDocument()
    ```
  - |
    AC8: all priced items already in the trip currency means no conversion.
    ```python
    assert m.cost.conversions == []
    ```
    ```tsx
    expect(screen.queryByText(/converted to/)).not.toBeInTheDocument()
    ```
  - |
    AC9 and AC10: a foreign-currency priced item with a rate produces a conversion with the rate and `rate_date == TODAY`; the note shows the date.
    ```python
    assert [(c.currency, c.rate, c.rate_date) for c in m.cost.conversions] == [("EUR", Decimal("1.08"), TODAY)]
    ```
    ```tsx
    expect(screen.getByText(/EUR converted to USD at 1 EUR = 1.08 USD, rate from/)).toHaveTextContent('2026')
    ```
  - |
    AC11: a chosen option with `price=None` is in `not_included` as unpriced and not in `included`; the web test finds the "Unpriced" badge and the "Add price" link.
    ```python
    assert ("Walking tour", "unpriced") in [(n.name, n.reason) for n in m.not_included]
    assert "Walking tour" not in [i.name for i in m.included]
    ```
  - |
    AC12: the standard exclusions follow the unchosen items.
    ```python
    assert m.standard_exclusions[0] == "Flights to and from the destination"
    ```
    ```tsx
    const list = screen.getByRole('list', { name: /usually not covered/i })
    expect(unchosenLink.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    ```
  - |
    AC13: an unchosen essential category is not listed.
    ```python
    m = build_money(_trip(needed_categories=["Insurance", "Tours"]), RATES, TODAY)
    assert [n.name for n in m.not_included if n.reason == "unchosen"] == ["Tours"]
    ```
  - |
    AC14: priced items show the estimates note.
    ```tsx
    expect(screen.getByText('Prices are estimates and may change before you pay.')).toBeInTheDocument()
    ```
    ```python
    assert m.cost.estimates_note == "Prices are estimates and may change before you pay."
    ```
  - |
    AC15: a stay outside the trip dates is still shown with its dates.
    ```python
    stay = _stay(_chosen(), start=date(2026, 11, 15), end=date(2026, 11, 20))
    b = build_money(_trip(stays=[stay]), RATES, TODAY).bookings[0]
    assert (b.start_date, b.end_date) == (date(2026, 11, 15), date(2026, 11, 20))
    ```
  - |
    AC16: the same stay is flagged and the web page shows the alert and the row badge.
    ```python
    assert b.outside_trip_dates is True
    ```
    ```tsx
    expect(screen.getByRole('alert')).toHaveTextContent('A booked stay falls outside the trip dates')
    expect(screen.getByText('Outside trip dates')).toBeInTheDocument()
    ```
  - |
    AC17: a stay inside the trip dates has no flag and no alert.
    ```python
    assert build_money(_trip(stays=[_stay(_chosen())]), RATES, TODAY).bookings[0].outside_trip_dates is False
    ```
    ```tsx
    expect(screen.queryByText(/falls outside the trip dates/)).not.toBeInTheDocument()
    ```
  - |
    AC18: two chosen stays give two booking rows.
    ```python
    two = _trip(stays=[_stay(_chosen(), start=START, end=date(2026, 11, 15)), Stay(id="s2", place="Porto", start_date=date(2026, 11, 15), end_date=END, chosen=_chosen())])
    assert [b.kind for b in build_money(two, RATES, TODAY).bookings] == ["stay", "stay"]
    ```
  - |
    Router and regression tests. `test_itinerary_router.py`: `assert set(r.json()) == {"cover", "glance", "days", "still_to_schedule", "money"}`; the forbidden-words test keeps `editors`, `share`, `insurance`, `sim`, `essential`, `visa` and drops `price`, `total`, `fare`, `currency`, `budget`. An access test confirms a stranger's 404 still leaks no money. `CompareTable.test.tsx`: `titleHeader` renders its custom first header and the default stays "Option". `test_itinerary.py` and `ItineraryPage.test.tsx` fixtures get an empty `money` so every existing assertion still passes.
  - |
    Narrow commands: `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_money.py tests/unit/test_itinerary.py tests/unit/test_itinerary_router.py)` and `(cd apps/web && pnpm run test -- src/trips/ItineraryMoney.test.tsx src/trips/ItineraryPage.test.tsx src/components/CompareTable.test.tsx)`.
assumptions_or_open_questions:
  - |
    "Unchosen item" is not defined in the code or the item. Plan: unchosen = saved `trip.places` (unscheduled) plus `needed_categories` that have no chosen option, minus essentials. Unchosen stays are treated as essentials and are not listed. Please confirm, or name the set.
  - |
    The add link for an unchosen item goes to `/trips/{id}/activity-options`, the only existing route for adding non-essential items. Please confirm this is the right target, or name per-category routes.
  - |
    The data has no booking status (confirmed, pending, draft). The prototype's badges (Confirmed, Pending, Draft) cannot be derived, so chosen items show a single "Chosen" status, with `link-out` for items that have a provider link, until a booking-status story exists. Please confirm.
  - |
    ESSENTIAL_CATEGORIES (stay, transport, sim, insurance, visa, flight) is my reading of the 00b prompt ("essentials: stay, transport, SIM, insurance, visa"). Confirm that the SIM and insurance picks stay out of the bookings table and cost summary here, since the item says essentials are excluded.
  - |
    No rate has a date: `RateSource` returns only the rate. The note therefore uses today's date (`get_today`) as the rate date, the same way `currency_helper` dates a live rate. If the rate provider later reports its own date, `rate_date` should come from it.
  - |
    A restaurant pick's price is the estimate per person times `traveller_count` (default 1), the same rule as `cost.py`. Chosen options carry one date; restaurants may have none (shown as "Unscheduled").
  - |
    The deferred project-wide question about sizing and monitoring itinerary builds and emails does not change this plan. The itinerary is built per request from an already-loaded trip with no extra I/O, and it sends no email.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — the new `money` field on the itinerary response is computed per request from fields the trip already stores. No schema, stored shape, seed or setting changes, and nothing needs provisioning. Deploy the API and web together, since an old web build ignores `money` and a new one needs it. Rollback is safe because nothing is stored.

  ### Design and tokens

  Built from `TRAVEL-PLANNER-APP-STORY-113-design.html`: single column `.page`; sections in the order Bookings and confirmations, Included, Not included, Cost summary with `hr.divider` between; the bookings table becomes a card per row below 48rem; `.badge` for status; `.alert-warning` plus a "Outside trip dates" badge for a stay outside the trip dates; `.empty-state` "Nothing booked yet" with one `.btn-primary`; `.skeleton` while loading. Tokens are loaded at `apps/web/src/index.css:2` (`@import "../../../design-system/tokens.css"`). The prototype's reviewer-only scenario chips are not built. Its `<tr>`-level `.bk-table` CSS is replaced by the existing `.compare-table` mobile card rules (`index.css:543-551`).

  Conflict to flag: the prototype shows status as Confirmed, Pending or Draft, but no stored field backs that (see open questions). The prototype shows the "Add price" link as `#add-price`; here it links to the option's own page, since no price-edit route exists. Also, the prototype puts the sections on a page with no section list; the real page has the "On this page" list, which gets four new entries.

  ```mermaid
  flowchart TD
    R[routers/itinerary.py] -->|passes rates and today| B[trips/itinerary.py build_itinerary]
    B --> M[trips/money.py build_money]
    M --> S[trips/store.py Trip, stay_outside_trip]
    M --> RT[trips/rates.py RateSource]
    R --> D[routers/deps.py get_rates, get_today]
    P[trips/ItineraryPage.tsx] -->|fetchItinerary| A[trips/api.ts]
    P --> IM[trips/ItineraryMoney.tsx]
    IM --> CT[components/CompareTable.tsx]
    classDef touched fill:#f96,color:#000
    class R,B,M,P,A,IM,CT touched
  ```

  `ItineraryPage.tsx` also gets four new `SECTIONS` entries. `index.css` gets the layout classes.
review_focus: |
  IN: the four sections on the owner and editor itinerary page, built server-side in the new `money.py` and rendered by `ItineraryMoney.tsx`. OUT: essentials (SIM, insurance, visa), the checklist, the shared read-only page, any new booking-status data, and new routes. Riskiest part: the unchosen and essentials rules and the currency conversion math (Decimal, rounding, rate date). The old "itinerary never shows money" tests were changed on purpose and still guard editors, sharing and the essentials words. `CompareTable` gains optional props only, so its other callers must not change.
