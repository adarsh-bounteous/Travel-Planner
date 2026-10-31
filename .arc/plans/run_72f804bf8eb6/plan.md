summary: |
  Add the money half of the Itinerary page: a Bookings and confirmations table (one row per chosen item, each stay its own row, with an "Outside trip dates" warning), an Included list (priced chosen items), a Not included list (unchosen non-essential items with "Add to plan" links, unpriced chosen items marked Unpriced, then a standard exclusions list) and a Cost summary (total in the trip currency, a total per currency, a conversion note with its rate date only when a foreign-currency price was converted, and an estimates note). The API builds a new `money` block on the existing `GET /trips/{id}/itinerary` payload from the trip's chosen picks, reusing `summarise_cost` and `stay_outside_trip`; the web page renders it with the existing CompareTable, following the approved prototype. Essentials and the checklist are untouched.
scope:
  - description: |
      New module `app/trips/inclusions.py` that builds the money block from a `Trip`. Pure functions, no I/O.

      ```python
      class BookingRow(BaseModel):
          id: str
          kind: Literal["stay", "transport", "option", "sim", "insurance", "restaurant"]
          name: str
          provider: str | None
          start_date: date | None
          end_date: date | None
          price: float | None          # whole currency units; None = unpriced
          currency: str | None         # the item's own currency (trip currency when the pick has none)
          status: Literal["confirmed"]  # see open questions
          link_url: str | None         # http(s) only, via _http_link
          outside_trip: bool           # stays only

      class NotIncludedItem(BaseModel):
          name: str
          reason: Literal["unchosen", "unpriced"]
          add_path: str | None         # app route, e.g. /trips/t1/stays/s1/shortlist

      class CurrencyTotal(BaseModel):
          currency: str
          total: float

      class Conversion(BaseModel):
          currency: str
          rate: float                  # 1 <currency> = <rate> <trip currency>
          rate_date: date

      class CostBlock(BaseModel):
          currency: str                # the trip currency = the summary currency
          total: float                 # summarise_cost(...).total
          by_currency: list[CurrencyTotal]
          conversions: list[Conversion]  # empty when nothing foreign was converted
          estimates_note: str

      class Money(BaseModel):
          bookings: list[BookingRow]
          included: list[BookingRow]   # chosen AND priced
          not_included: list[NotIncludedItem]
          standard_exclusions: list[str]
          cost: CostBlock

      def build_money(trip: Trip, rates: RateSource, today: date) -> Money: ...
      ```

      Rules: chosen items = chosen stays, transport picks, `trip.options`, SIM, insurance and restaurant picks (not free-text activities or saved places, which are not picked from an offer). One private `_lines(trip)` yields (row, amount, currency) for every chosen item so Included, the per-currency totals and the bookings table cannot drift; amounts follow `trip/cost.py` (SIM price x travellers, restaurant typical price x travellers, stay `chosen.total`, transport `fare`). Unchosen items = stays with `chosen is None` (add path `/trips/{id}/stays/{stayId}/shortlist`) plus `needed_categories` with no chosen option (add path `/trips/{id}/shortlists`), skipping the essential categories (`ESSENTIAL_CATEGORIES = {"sim", "insurance", "visa"}`, compared with `casefold`) and skipping an unchosen SIM or insurance, which have no entry at all. Unpriced chosen rows go to `not_included` with reason "unpriced". `outside_trip` is computed with `stay_outside_trip(stay, trip.start_date, trip.end_date)` from `store.py` (not the stored flag, so it is right even for trips saved before the flag). `conversions` comes from `summarise_cost(trip, rates).rates`, with `rate_date=today`. `STANDARD_EXCLUSIONS` is a constant: Flights to and from the destination, Travel insurance, Personal expenses, Tips and gratuities, Visas and entry fees (the prototype's list). `ESTIMATES_NOTE = "Prices are estimates and may change before you pay."`
    files:
      - services/api/app/trips/inclusions.py
      - services/api/tests/unit/test_inclusions.py
    rationale: |
      Keeps money logic out of `itinerary.py` and out of the web. Reuses `summarise_cost` for the total and rates so the page can never disagree with the Costs page, and `stay_outside_trip` for the date rule.
  - description: |
      Add `money: Money` to `Itinerary` and thread rates through the builder and router.

      ```python
      # itinerary.py  before -> after
      def build_itinerary(trip, owner_profile, visa_rules, today) -> Itinerary
      def build_itinerary(trip, owner_profile, visa_rules, today, rates: RateSource) -> Itinerary

      # routers/itinerary.py: add  rates: RateSource = Depends(get_rates)  and pass it through
      ```

      Update the `Itinerary` docstring (it says "Deliberately has no money"): it now carries a read-only money block, still no editor or sharing field. Existing callers of `build_itinerary` (tests) pass `InMemoryRates(SEED_RATES)`.
    files:
      - services/api/app/trips/itinerary.py
      - services/api/app/routers/itinerary.py
      - services/api/tests/unit/test_itinerary.py
      - services/api/tests/unit/test_itinerary_router.py
    rationale: |
      Same endpoint, same access rule (owner or accepted editor, else the missing-trip 404). Editors see money for items that are already part of the shared plan; the owner's private profile data is not involved.
  - description: |
      Web types and money formatter. Add `Money`, `BookingRow`, `NotIncludedItem` and friends to the `Itinerary` type as `money?: Money` (optional, so an older API build still renders, like `essentials`). New `formatMoney(amount, currency)` that always shows the currency code:

      ```ts
      export const formatMoney = (amount: number, currency: string) =>
        new Intl.NumberFormat('en-GB', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount)
      ```

      Update the comment on `Itinerary` ("the server leaves out money"). Other pages keep their own formatters; this plan does not touch them.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/money.ts
      - apps/web/src/trips/money.test.ts
    rationale: |
      Guidelines require money in a local format with the currency always shown. A tiny shared helper beats a sixth inline `Intl.NumberFormat`.
  - description: |
      Render four sections in `ItineraryPage.tsx`, after Still to schedule and before Travel essentials, in the prototype's order, and add them to `SECTIONS` ("Bookings and confirmations", "Included", "Not included", "Cost summary"; ids `bookings`, `included`, `not-included`, `cost-summary`).

      - Bookings: `CompareTable` with caption "Bookings and confirmations", columns Provider, Dates, Price, Status, Provider link. `title` is the item name, `badges` renders the warning badge (`badge badge-warning`, AlertIcon, text "Outside trip dates") for flagged stays. Status is a `badge badge-success` "Confirmed". Provider link is `<a href target="_blank" rel="noopener" aria-label="Open {provider} for {name}">Open provider</a>`, or "No link" when `link_url` is null. Price is `formatMoney` or italic "No price". Under the table, one `alert alert-warning` (role alert, AlertIcon) titled "A booked stay falls outside the trip dates", listing each flagged stay with its dates and the trip dates; it renders only when a row is flagged. Dates use the existing `formatRange`/`formatDate` helpers. Empty state when `bookings` is empty: `empty-state` "Nothing booked yet" with one `btn btn-primary` "Explore options" linking to `/explore`.
      - Included: `ul.line-list`, name and `formatMoney` amount per row.
      - Not included: `ul.line-list` where unchosen rows show name plus a react-router `Link` "Add to plan" to `add_path`, and unpriced rows show name plus `badge badge-neutral` "Unpriced" (no link, see open questions); then the h3 "Usually not covered by a trip plan" and `ul.excl` of `standard_exclusions`, always after the list.
      - Cost summary: `card total` with "Total in trip currency" and `.total-value` in `formatMoney(total, currency)`; h3 "Total per currency" and `line-list` of `by_currency`; `p.note` with InfoIcon for each conversion ("EUR converted to USD at 1 EUR = 1.08 USD, rate from 28 Oct 2026."), rendered only when `conversions` is non-empty; `p.note.text-muted` with the estimates note.
      - Loading and error states are the page's existing skeleton and alert; no new ones.
      - Extend `CompareTable` with an optional `rowClassName?: (row: T) => string | undefined` so a flagged row can use `is-flagged`; existing callers are unaffected.

      Reuse: CompareTable (bookings), `.badge`, `.alert`, `.empty-state`, `.card`, `.divider`, existing icons from `auth/icons`. No new component beyond small private render functions in the page file (a CostSummary/NotIncluded split into a new file is allowed only if the page file gets unwieldy).
    files:
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/components/CompareTable.tsx
      - apps/web/src/components/CompareTable.test.tsx
      - apps/web/src/trips/ItineraryPage.test.tsx
    rationale: |
      Mirrors the approved prototype: one column, content max width, sections separated by dividers, bookings table turning into cards below 48rem (CompareTable already does this at its mobile breakpoint).
  - description: |
      Styles in `apps/web/src/index.css`, next to the itinerary rules (around line 605-663). Tokens are already loaded by `@import "../../../design-system/tokens.css"` at `index.css:2`. New rules, tokens only:

      - `.line-list` (list reset; li flex, space-between, gap `--space-3`, min-height `--size-control-lg`, padding `--space-1` 0, bottom border `--border-width` solid `--color-border`, last none); `.line-list .amt` (nowrap, `--font-weight-medium`); `.line-list .name` (min-width 0, overflow-wrap anywhere).
      - `.excl` (padding-left `--space-4`, colour `--color-fg-muted`; li padding `--space-1` 0).
      - `.total` (flex column, gap `--space-1`); `.total-value` (`--font-size-xl`, `--font-weight-bold`).
      - `.note` (flex, gap `--space-2`, align start); `.note .icon` (flex none, margin-top `--space-1`).
      - `.compare-table tr.is-flagged td` background `--color-warning-subtle`; on phones the flagged card uses border `--color-warning` and background `--color-warning-subtle`.
      - `.unpriced` (colour `--color-fg-muted`, italic).
      - Print: add the four sections to `break-inside: avoid` rows (`.line-list li`, `.total`); `.document a[href]::after` already prints link URLs. Add `tr.is-flagged` no extra rule.

      Spacing is `--space-3`/`--space-4` per the guidelines; no colour literal or raw px.
    files:
      - apps/web/src/index.css
    rationale: |
      Prototype classes (`line-list`, `excl`, `total`, `note`, `bk-flag`) are translated onto the app's own stylesheet instead of copying the prototype's `bk-table` CSS, because CompareTable already provides the table/card behaviour.
tests:
  - |
    AC1 (API) in test_inclusions.py: every chosen item is a booking row.
    ```python
    money = build_money(_trip(stays=[_stay(_chosen())], transport=[_transport()]), RATES, TODAY)
    assert {r.kind for r in money.bookings} == {"stay", "transport"}
    ```
  - |
    AC2 (API) row carries provider, dates, price with currency, status and provider link.
    ```python
    row = money.bookings[0]
    assert (row.provider, row.start_date, row.end_date) == ("Web", START, END)
    assert (row.price, row.currency, row.status) == (300.0, "EUR", "confirmed")
    assert row.link_url == "https://stays.example.com/x"
    ```
    Plus a case where `link_url` is `local://booking/abc` and `assert row.link_url is None`.
  - |
    AC2 (web) in ItineraryPage.test.tsx: the row shows the same cells.
    ```tsx
    const row = within(await screen.findByRole('table', { name: 'Bookings and confirmations' })).getByRole('row', { name: /Alfama Loft/ })
    expect(within(row).getByText('EUR 300.00')).toBeInTheDocument()
    expect(within(row).getByText('Confirmed')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Open Web for Alfama Loft' })).toHaveAttribute('href', 'https://stays.example.com/x')
    ```
  - |
    AC3 and AC4 (API) Included lists chosen priced items and never an unchosen one.
    ```python
    assert [r.name for r in money.included] == ["Alfama Loft"]
    assert "Sintra tour" not in [r.name for r in money.included]
    ```
    Web: `within(screen.getByRole('region', { name: 'Included' })).getByText('Alfama Loft')` is present and `queryByText('Sintra palaces day tour')` is null.
  - |
    AC5 and AC6 (API + web) an unchosen stay is in Not included with its add path; web renders a link.
    ```python
    item = next(i for i in money.not_included if i.reason == "unchosen")
    assert item.add_path == "/trips/t1/stays/s1/shortlist"
    ```
    ```tsx
    expect(within(notIncluded).getByRole('link', { name: 'Add to plan' })).toHaveAttribute('href', '/trips/t1/stays/s1/shortlist')
    ```
  - |
    AC7 (API + web) cost summary shows each total with its currency.
    ```python
    assert money.cost.currency == "EUR"
    assert {(t.currency, t.total) for t in money.cost.by_currency} == {("EUR", 330.0), ("USD", 120.0)}
    ```
    ```tsx
    expect(screen.getByText('USD 120.00')).toBeInTheDocument()
    ```
    Also a consistency test: `money.cost.total == summarise_cost(trip, RATES).total`.
  - |
    AC8 (API + web) all items in the summary currency, so no conversion.
    ```python
    assert build_money(single_currency_trip, RATES, TODAY).cost.conversions == []
    ```
    ```tsx
    expect(screen.queryByText(/converted to/)).toBeNull()
    ```
  - |
    AC9 and AC10 (API + web) a USD item on an EUR trip with a rate shows a note carrying the rate date.
    ```python
    conv = money.cost.conversions[0]
    assert (conv.currency, conv.rate, conv.rate_date) == ("USD", 0.92, TODAY)
    ```
    ```tsx
    expect(screen.getByText(/USD converted to EUR at 1 USD = 0\.92 EUR, rate from 31 Oct 2026/)).toBeInTheDocument()
    ```
    Plus a case with no rate for the currency: `conversions == []` and no note.
  - |
    AC11 (API + web) a chosen item with no price is in Not included, marked unpriced, and not in Included.
    ```python
    assert [(i.name, i.reason) for i in money.not_included if i.reason == "unpriced"] == [("Day trip", "unpriced")]
    assert "Day trip" not in [r.name for r in money.included]
    ```
    ```tsx
    expect(within(notIncluded).getByText('Unpriced')).toBeInTheDocument()
    ```
  - |
    AC12 (API + web) the standard exclusions are present and come after the unchosen items.
    ```python
    assert money.standard_exclusions == list(STANDARD_EXCLUSIONS)
    ```
    ```tsx
    const unchosen = within(notIncluded).getByText('Sintra palaces day tour')
    const exclusions = within(notIncluded).getByText('Travel insurance')
    expect(unchosen.compareDocumentPosition(exclusions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    ```
  - |
    AC13 (API) an unchosen essential is never listed.
    ```python
    money = build_money(_trip(needed_categories=["SIM", "insurance", "tours"]), RATES, TODAY)
    assert [i.name for i in money.not_included] == ["tours"]
    ```
  - |
    AC14 (API + web) the estimates note is shown when items are priced.
    ```tsx
    expect(screen.getByText('Prices are estimates and may change before you pay.')).toBeInTheDocument()
    ```
  - |
    AC15 and AC16 (API + web) a stay outside the trip dates shows with its dates and a warning.
    ```python
    stay = _stay(_chosen(), start=date(2026, 11, 15), end=date(2026, 11, 20))  # trip ends 16 Nov
    assert build_money(_trip(stays=[stay]), RATES, TODAY).bookings[0].outside_trip is True
    ```
    ```tsx
    expect(within(row).getByText('Outside trip dates')).toBeInTheDocument()
    expect(screen.getByRole('alert', { name: '' })).toHaveTextContent('A booked stay falls outside the trip dates')
    ```
    Row also shows the stay's dates via `formatRange`.
  - |
    AC17 (API + web) a stay within the trip dates raises no warning.
    ```python
    assert build_money(_trip(stays=[_stay(_chosen())]), RATES, TODAY).bookings[0].outside_trip is False
    ```
    ```tsx
    expect(screen.queryByText(/falls outside the trip dates/)).toBeNull()
    expect(screen.queryByText('Outside trip dates')).toBeNull()
    ```
  - |
    AC18 (API + web) two chosen stays give two rows.
    ```python
    assert [r.kind for r in build_money(_trip(stays=[stay_a, stay_b]), RATES, TODAY).bookings] == ["stay", "stay"]
    ```
  - |
    Existing tests that must be rewritten first (they encode the old no-money rule): `test_the_model_carries_no_money_or_sharing_field` expects `"money"` in `Itinerary.model_fields` and still has no editor or sharing field; the router test `set(r.json()) == {..., "money"}`; `test_money_editors_and_sharing_never_appear` keeps `("fare", "budget", "editors", "share", "invite")` and drops `"total"`; the web "offers no money, sharing or edit actions (AC12)" test narrows its link check to `/share|edit|budget/i` so "Add to plan" is allowed, and a new assertion checks the page still renders when `money` is missing (older API).
  - |
    Layout and print (web) in the existing `itinerary print stylesheet` block: `expect(rule('.total-value')).toMatch(/font-size:\s*var\(--font-size-xl\)/)`; `expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i)` scoped to the new rules. Router: the editor and owner both get `money`, a stranger still gets the identical 404.
assumptions_or_open_questions:
  - |
    Status. The stored trip data has no booking status (a pick is either chosen or not), but the prototype shows Confirmed, Pending and Draft badges. This plan marks every chosen item "Confirmed" (success badge). If pending or draft should exist, a status field has to be stored first, which is a separate change. Please confirm.
  - |
    Rate date. No rate source reports the date of its rate (`RateSource.rate` returns a Decimal only), so the plan shows today's date, as the existing currency helper does for a live rate. If the real provider will expose a rate date, `Conversion.rate_date` is where it plugs in.
  - |
    Prototype conflict, "Add price". The prototype shows an "Add price" link next to each unpriced item, but no route or screen to enter a price exists, and AC11 only asks for the item to be marked unpriced. The plan renders the "Unpriced" badge without that link rather than a dead link.
  - |
    Prototype conflict, flagged-row styling. The prototype has its own `bk-table`; the plan builds on CompareTable (as the prototype's design notes say) and adds only a row class for the warning tint.
  - |
    Which unchosen items count. The data model has no "catalogue of available items". The plan treats unchosen stays and `needed_categories` with no pick as unchosen items, and treats SIM, insurance and visa as essentials (excluded, AC13). Free-text activities and saved places are not "chosen from an offer" and are left out of bookings. Confirm this matches what "item" means in the story.
  - |
    Add link for a needed category goes to the existing Shortlists page (`/trips/:id/shortlists`) because no per-category add route exists.
  - |
    Currency of options. A `ChosenOption` with `currency: None` is in the trip currency (as in `summarise_cost`).
  - |
    Deferred project question (sizing for itinerary builds and emails, and failure monitoring) is not answered here. This change adds a pure in-memory computation to an existing request, with no email and no new build step, so it has no sizing impact; the question stays open for a human.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — read-only computation over fields already stored on the trip; no migration, new setting, seed or provisioning. The response gains one additive key (`money`); the web treats it as optional so web and API can deploy in either order. Rollback is a plain revert.

  ### Design source

  Read in full: `TRAVEL-PLANNER-APP-STORY-113-design.html`. Elements used: single `.page` column; sections `bookings-section`, `included-section`, `not-included-section`, `cost-summary-section` separated by `.divider`; table columns Item, Provider, Dates, Price, Status, Provider link (cards on phones); `.alert-warning` "A booked stay falls outside the trip dates" plus an "Outside trip dates" `.badge-warning` on the row (icon and text, never colour alone); `.line-list` for Included and Not included; `h3` "Usually not covered by a trip plan" and the five standard exclusions; `.card.total` with `.total-value` (`--font-size-xl`); per-currency `.line-list`; `.note` with info icon for the conversion text ("EUR converted to USD at 1 EUR = 1.08 USD, rate from 28 Oct 2026.") and the estimates note. The reviewer-only scenario chips and `arcProto` helpers are prototype scaffolding and are not built. Tokens come from `design-system/tokens.css`, loaded at `apps/web/src/index.css:2`. The prototype's "Total in trip currency" wording is kept. The prototype's phone card uses `.bk-table`; CompareTable's existing mobile rules replace it.

  Note: `tokens.css` exports two duration tokens as `[object Object]`; `index.css:4` already overrides them, so no action is needed.

  ### Shape

  ```mermaid
  flowchart TD
    R[routers/itinerary.py<br/>pass RateSource]:::touched --> B[trips/itinerary.py<br/>build_itinerary adds money]:::touched
    B --> I[trips/inclusions.py<br/>build_money NEW]:::touched
    I --> C[trips/cost.py<br/>summarise_cost]
    I --> S[trips/store.py<br/>stay_outside_trip, Trip]
    R --> D[routers/deps.py<br/>get_rates]
    B --> E[trips/essentials.py]
    API[trips/api.ts<br/>Money types]:::touched --> P[trips/ItineraryPage.tsx<br/>four sections]:::touched
    P --> T[components/CompareTable.tsx<br/>rowClassName]:::touched
    P --> M[trips/money.ts<br/>formatMoney NEW]:::touched
    P --> CSS[index.css<br/>line-list, total, note]:::touched
    classDef touched fill:#f96,color:#000
  ```

  `inclusions.py` reuses `summarise_cost` so the total and conversion rates match the Costs page; per-currency subtotals come from the same `_lines` that feed Included, so they cannot drift.

  Test command (narrow forms): `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_inclusions.py tests/unit/test_itinerary.py tests/unit/test_itinerary_router.py)` and `(cd apps/web && pnpm run test -- src/trips/ItineraryPage.test.tsx src/trips/money.test.ts src/components/CompareTable.test.tsx)`.
review_focus: |
  IN: the four money sections on the Itinerary page and the additive `money` key on the itinerary API; OUT: essentials, checklist, any editing of price or status, and other pages' formatters. Riskiest part is `build_money` drifting from `summarise_cost` (total and conversion rates must match) and the rewritten old tests that asserted "no money" in the itinerary. Deliberate: every chosen item is "Confirmed" (no stored status), rate date is today's date, "Add price" is omitted (no target screen), and the bookings table reuses CompareTable rather than the prototype's own table CSS.
