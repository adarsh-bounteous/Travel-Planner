summary: |
  Add the "money and inclusions" half of the itinerary document: a Bookings and confirmations table, an Included list, a Not included list (unchosen non-essential items with add links, unpriced chosen items marked "Unpriced", then a standard exclusions list) and a Cost summary (per-currency totals, a total in the trip currency, a conversion note with its rate date only when a foreign-currency price was converted, and an estimates note). The rules live server-side in `build_itinerary` (testable in Python, same as the core document), `GET /trips/{id}/itinerary` gains the new fields, and `ItineraryPage.tsx` renders them as the approved prototype shows: a table that becomes one card per row on phones, a warning alert plus an "Outside trip dates" badge on a stay outside the trip dates, and the cost summary with currency always attached. Essentials and the checklist stay out of scope.
scope:
  - description: |
      Backend model. In `services/api/app/trips/itinerary.py` add the pydantic models below and the fields `bookings`, `included`, `not_included`, `standard_exclusions`, `cost` to `Itinerary`. Update the class docstring ("Deliberately has no money ...") to say money lives only in these fields. Change the builder signature:

      ```python
      def build_itinerary(trip: Trip, rates: RateSource, today: date) -> Itinerary: ...

      class BookingRow(BaseModel):
          name: str
          kind: Literal["stay", "transport", "option", "sim", "insurance", "restaurant", "activity"]
          provider: str | None
          start_date: date | None
          end_date: date | None
          price: float | None          # None = unpriced
          currency: str | None
          status: Literal["chosen"]    # see open questions
          link_url: str | None         # http(s) only, via _http_link
          outside_trip: bool = False   # stays only

      class IncludedLine(BaseModel):
          name: str; price: float; currency: str

      class NotIncludedItem(BaseModel):
          name: str
          reason: Literal["unchosen", "unpriced"]
          add_url: str | None          # unchosen: where to add it

      class CurrencyTotal(BaseModel):
          currency: str; total: float

      class ConversionNote(BaseModel):
          from_currency: str; to_currency: str; rate: float; rate_date: date

      class CostBlock(BaseModel):
          currency: str                # trip currency
          total: float                 # converted items only
          subtotals: list[CurrencyTotal]
          conversions: list[ConversionNote]
          estimates_note: bool = True
      ```

      Rules: bookings has one row per chosen item (each chosen Stay is its own row; also trip.options, transport picks, sim, insurance, restaurant picks). `outside_trip` reuses `stay_outside_trip(stay, trip.start_date, trip.end_date)` from `store.py`. Included = bookings with a price. Not included = unchosen non-essential items (reason "unchosen", never an unchosen stay/transport/sim/insurance/visa essential) followed by chosen items with no price (reason "unpriced"); `standard_exclusions` is a constant list (flights, travel insurance, personal expenses, tips, visas and entry fees, as in the prototype). Cost: per-currency subtotals in Decimal; each foreign currency that `rates.rate()` can convert adds one `ConversionNote` with `rate_date=today`; no note when every priced item is in the trip currency; unconvertible currencies are listed in subtotals but not in the total. Reuse the conversion approach of `summarise_cost` in `app/trips/cost.py` rather than a second algorithm (extract a shared helper there if needed; `summarise_cost` behaviour must not change).
    files:
      - services/api/app/trips/itinerary.py
      - services/api/app/trips/cost.py
    rationale: |
      The document model is server-built (docs/agent-prompts/00b-itinerary-document.md "Server-built document model"), so inclusion and exclusion rules are unit-testable and the UI only renders.
  - description: |
      Router. `get_itinerary` in `services/api/app/routers/itinerary.py` gains `rates: RateSource = Depends(get_rates)` (from `app.routers.deps`, already used by `trips.py`) and calls `build_itinerary(trip, rates, date.today())`. Check `services/api/app/routers/shared.py` (read-only link) still builds from its own allow-list and does not leak the new money fields; add no money there.
    files:
      - services/api/app/routers/itinerary.py
      - services/api/app/routers/shared.py
    rationale: |
      Rates are a request-time dependency; `today` is a parameter so the rate date is deterministic in tests.
  - description: |
      Web types and API. In `apps/web/src/trips/api.ts` extend the `Itinerary` type (line ~508) with `bookings`, `included`, `not_included`, `standard_exclusions`, `cost` mirroring the Python models, and update its doc comment ("leaves out money").
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Keeps the client contract in step with the server model.
  - description: |
      UI, following the approved prototype (`TRAVEL-PLANNER-APP-STORY-113-design.html`): single column `.page`, four `<section class="section">` blocks (headings "Bookings and confirmations", "Included", "Not included", "Cost summary") separated by `hr.divider`, inserted into `Document` in `ItineraryPage.tsx` after "Day by day"/"Still to schedule"; add the four ids to `SECTIONS` so the "On this page" list and print stylesheet keep working.
      - Bookings: reuse `CompareTable` (`apps/web/src/components/CompareTable.tsx`), which already turns rows into cards under 48rem via `.compare-table` in `index.css` (~line 537). Extend it minimally with optional props `titleHeader?: string` (default "Option", the prototype header is "Item") and `rowClassName?: (row) => string | undefined`; columns Provider, Dates, Price, Status, Provider link ("Open provider", `aria-label="Open {provider} for {name}"`). Status is a `.badge`. A flagged row gets an "Outside trip dates" `.badge-warning` with `AlertIcon` (icon plus text, never colour alone) and a warm row background using `--color-warning-subtle`; one `.alert alert-warning` with `role="alert"` under the table titled "A booked stay falls outside the trip dates", listing each stay's dates and the trip dates. Price shows "No price" (muted italic) when null.
      - Included: `.line-list` (name left, amount right, `--font-weight-medium`, row min height `--size-control-lg`).
      - Not included: `.line-list`; unchosen rows have an "Add to plan" link to `add_url`; unpriced rows show a `.badge badge-neutral` "Unpriced" and an "Add price" link; then an `h3.text-sm.text-muted` "Usually not covered by a trip plan" and `ul.excl` of `standard_exclusions`.
      - Cost summary: `.card.total` with the total in `--font-size-xl` bold, always with currency (format with `Intl.NumberFormat(undefined, {style:'currency', currency})` and append the code when the locale output lacks it, as the prototype does; reuse an existing formatter if one is in `apps/web/src/trips/helperFormat.ts`); "Total per currency" `.line-list`; a conversion `.note` with `InfoIcon`-style icon, text like "EUR converted to USD at 1 EUR = 1.08 USD, rate from 28 Oct 2026." only when `cost.conversions` is non-empty; always the estimates note "Prices are estimates and may change before you pay."
      - Empty state (no chosen items): `.empty-state` "Nothing booked yet" with one `.btn.btn-primary` "Explore options" linking to `/explore`. Loading reuses the existing `.skeleton` block.
      - New small components in `apps/web/src/trips/` only where the catalogue has none: `BookingsTable.tsx` (wraps CompareTable), `ExclusionList.tsx`, `CostSummary.tsx`. Tokens used: `--space-1/2/3/4`, `--size-control-lg`, `--font-size-sm/lg/xl`, `--font-weight-medium/bold`, `--color-fg-muted`, `--color-border`, `--color-warning`, `--color-warning-subtle`, `--card-default-*`. Colour and spacing literals are not used. Tokens are already loaded by `@import "../../../design-system/tokens.css"` at `apps/web/src/index.css:2`; new CSS classes (`.line-list`, `.excl`, `.total`, `.note`, `.unpriced`) go in `index.css` next to the itinerary styles (~line 575) and are hidden/flattened inside the existing `@media print` block only where chrome would print (no changes to print hiding).
    files:
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/trips/BookingsTable.tsx
      - apps/web/src/trips/ExclusionList.tsx
      - apps/web/src/trips/CostSummary.tsx
      - apps/web/src/components/CompareTable.tsx
      - apps/web/src/index.css
    rationale: |
      Builds the approved prototype with the existing CompareTable reuse the guidelines require (tables become cards on phones).
tests:
  - |
    AC1/2/18 (services/api/tests/unit/test_itinerary.py), write first and watch fail on a missing `bookings` field:
    ```python
    def test_bookings_has_a_row_per_chosen_item_and_each_stay():
        trip = _trip(stays=[_stay(_chosen()), Stay(id="s2", place="Porto", start_date=END, end_date=END, chosen=_chosen())], transport=[_transport()])
        it = build_itinerary(trip, RATES, TODAY)
        assert [b.kind for b in it.bookings].count("stay") == 2
        row = next(b for b in it.bookings if b.kind == "transport")
        assert (row.provider, row.price, row.currency, row.status, row.link_url) == ("CP", 30.0, "EUR", "chosen", "https://cp.example.com/t")
        assert row.start_date == START
    ```
    with `RATES = InMemoryRates({("USD","EUR"): Decimal("0.92")})` and `TODAY = date(2026, 10, 31)` as module constants. Existing `build_itinerary(trip)` calls in this file are updated to the new signature.
  - |
    AC3/4/5/13 (test_itinerary.py):
    ```python
    def test_included_lists_priced_chosen_only_and_unchosen_go_to_not_included():
        trip = _trip(stays=[_stay(_chosen())], places=[TripPlace(id="p1", place_id="x", name="Sintra")])
        it = build_itinerary(trip, RATES, TODAY)
        assert [i.name for i in it.included] == ["Alfama Loft"]
        assert "Sintra" not in [i.name for i in it.included]
        assert ("Sintra", "unchosen") in [(n.name, n.reason) for n in it.not_included]

    def test_unchosen_essential_is_not_listed_in_not_included():
        it = build_itinerary(_trip(stays=[_stay(None)]), RATES, TODAY)
        assert all(n.name != "Alfama Loft" for n in it.not_included)
    ```
  - |
    AC6 (test_itinerary.py and ItineraryPage.test.tsx): server asserts `next(n for n in it.not_included if n.name == "Sintra").add_url == "/trips/t1/activity-options"`; UI asserts `expect(screen.getByRole('link', { name: /add to plan/i })).toHaveAttribute('href', '/trips/t1/activity-options')`.
  - |
    AC7/8/9/10/14 cost (test_itinerary.py):
    ```python
    def test_cost_has_per_currency_totals_and_no_note_for_one_currency():
        it = build_itinerary(_trip(currency="EUR", stays=[_stay(_chosen())], transport=[_transport()]), RATES, TODAY)
        assert [(s.currency, s.total) for s in it.cost.subtotals] == [("EUR", 330.0)]
        assert it.cost.conversions == []
        assert it.cost.estimates_note is True

    def test_foreign_currency_adds_a_conversion_note_with_rate_date():
        usd_stay = _stay(_chosen().model_copy(update={"currency": "USD"}))
        it = build_itinerary(_trip(currency="EUR", stays=[usd_stay]), RATES, TODAY)
        note = it.cost.conversions[0]
        assert (note.from_currency, note.to_currency, note.rate, note.rate_date) == ("USD", "EUR", 0.92, TODAY)
    ```
  - |
    AC11/12 (test_itinerary.py): a chosen item with `price=None` (an `Activity`, or a `RestaurantPick` with `typical_price=None`) appears as `("<name>", "unpriced")` in `it.not_included` and not in `it.included`; and `assert it.standard_exclusions[0] == "Flights to and from the destination"` plus `assert [n.reason for n in it.not_included][-1] in ("unchosen", "unpriced")` documents that the exclusions are a separate list rendered after the items.
  - |
    AC15/16/17 (test_itinerary.py): a stay with `end_date=END + timedelta(days=2)` gives `row.outside_trip is True` and `row.start_date`/`row.end_date` set; a stay inside the trip gives `assert not any(b.outside_trip for b in it.bookings)`.
  - |
    Router (services/api/tests/unit/test_itinerary_router.py): `GET /trips/{id}/itinerary` returns 200 with `bookings`, `included`, `not_included`, `standard_exclusions` and `cost` keys, and the shared read-only response (test_share_link_router.py) still does not contain `cost` or `bookings`: `assert "cost" not in body`.
  - |
    UI AC1/2 (apps/web/src/trips/ItineraryPage.test.tsx, extend the `planned` fixture): `expect(within(await screen.findByRole('table', { name: /bookings and confirmations/i })).getAllByRole('row')).toHaveLength(1 + n)`; the row has `getByText('Casa do Largo')`, a price like `€540.00` with `EUR`, a `.badge` status and `getByRole('link', { name: /open casa do largo/i })`.
  - |
    UI AC3/4/5/11/12/13: `within(screen.getByRole('region', { name: 'Included' }))` lists priced names and not the unchosen one; the "Not included" region lists the unchosen item, then an `Unpriced` badge item, and `expect(notIncluded.compareDocumentPosition(...)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)` shows the standard exclusions list after them.
  - |
    UI AC7/8/9/10/14: cost region shows `USD` with each total; with one currency `expect(screen.queryByText(/converted to/i)).not.toBeInTheDocument()`; with EUR and USD `expect(screen.getByText(/EUR converted to USD at 1 EUR = 1.08 USD, rate from 28 Oct 2026/)).toBeInTheDocument()`; always `expect(screen.getByText(/prices are estimates/i)).toBeInTheDocument()`.
  - |
    UI AC15/16/17/18: with a stay flagged `outside_trip: true` `expect(screen.getByRole('alert')).toHaveTextContent(/falls outside the trip dates/i)` and the row has the "Outside trip dates" badge; with `outside_trip: false` `expect(screen.queryByText(/outside the trip dates/i)).not.toBeInTheDocument()`; two stay rows render two rows with their own dates. Also an empty-state test (no bookings shows "Nothing booked yet" and an "Explore options" link) and a CompareTable test that `titleHeader` defaults to "Option".
assumptions_or_open_questions:
  - |
    The data model has no booking confirmation state (docs/agent-prompts/00b-itinerary-document.md says "chosen, link-out, booked once prompt 10 exists"), but the prototype shows Confirmed/Pending/Draft/Cancelled badges. Plan: status is the single value "chosen", shown as a neutral `.badge`. This conflicts with the prototype's Confirmed/Pending badges, so a reviewer should confirm.
  - |
    "Unchosen item" is not defined by the code. Plan: unchosen = saved `trip.places` (unscheduled) plus `needed_categories` with no chosen option, excluding essentials (stay, transport, SIM, insurance, visa, flights). The add link for each goes to `/trips/{id}/activity-options`; please confirm that route is the right target, or name per-category targets.
  - |
    No rate date exists in `RateSource` (`app/trips/rates.py`); `LastKnownRates` stores dates but is built fresh per request. Plan: rate date = the request date (`today` parameter). If real provider rate timestamps are wanted, `RateSource` needs an `as_of` method (out of scope here).
  - |
    Chosen items with a price are taken as stays, transport picks, option picks, SIM, insurance and priced restaurants; activities and unpriced restaurants count as chosen but unpriced. Restaurant price is per person times `traveller_count`, as in `summarise_cost`.
  - |
    The deferred project-wide question (sizing for itinerary builds and emails, monitoring failures) is not answerable from this item; it does not change this plan. This story adds one rate lookup per foreign currency per itinerary request and no new storage.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — the change only adds computed fields to the `GET /trips/{id}/itinerary` response. No schema, stored document, seed, setting or env var changes, and old trips stay readable because everything is derived from fields `Trip` already has. Rollback is a plain revert. Deploy API and web together: the web page needs the new response fields.

  ### Design source

  Read: `TRAVEL-PLANNER-APP-STORY-113-design.html` (sections `bookings-section`, `included-section`, `not-included-section`, `cost-summary-section`, `stay-outside-dates-warning`, `conversion-note`, `estimates-note`, `standard-exclusions`, states loading/empty/loaded). The reviewer-only scenario chips (`.scenarios`) are prototype scaffolding and are not built. Prototype uses its own `.bk-table`; this plan maps it onto the existing `CompareTable`/`.compare-table` styles (cards under 48rem), which matches the UI guidelines. Prototype date format is en-GB; production uses the traveller's locale via `Intl`, per the guidelines.

  ```mermaid
  flowchart TD
    Page[ItineraryPage.tsx] --> BT[BookingsTable.tsx]
    Page --> EL[ExclusionList.tsx]
    Page --> CS[CostSummary.tsx]
    BT --> CT[CompareTable.tsx]
    Page --> Api[trips/api.ts fetchItinerary]
    Api --> R[routers/itinerary.py]
    R --> B[trips/itinerary.py build_itinerary]
    R --> Deps[routers/deps.py get_rates]
    B --> Cost[trips/cost.py conversion]
    B --> Store[trips/store.py stay_outside_trip]
    classDef touched fill:#f96,color:#000
    class Page,BT,EL,CS,CT,Api,R,B,Cost touched
  ```
review_focus: |
  IN: the five new itinerary fields, their rules (one row per chosen item, essentials excluded from Not included, conversion note only for converted foreign currencies with a rate date, stay-outside-dates warning) and their rendering; OUT: essentials, checklist, any new stored data or booking-status model. Riskiest: the cost maths and conversion note, which must agree with `summarise_cost` (Decimal, no float sums), and the shared read-only view, which must not gain money fields. Deliberate: status is a single "chosen" value and rate date is the request date, both recorded as open questions rather than invented.
