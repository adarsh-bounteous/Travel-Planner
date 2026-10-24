summary: |
  Show one trip total for the chosen options against the traveller's budget, in the trip currency, on the trip page. The Trip Planner API computes a `cost` summary (total, over-budget amount, missing needed categories, unpriced count, FX rates used) and returns it on every trip view, so the arithmetic lives in one tested place. The web app renders it as the approved total card above the trip tabs (big total, FX note, budget line, over-budget badge, plan-incomplete badge, no-price note) and re-fetches the trip while it is open so a price change shows the new total and warning without a reload. Price, needed categories and exchange rates do not exist in the codebase yet, so the plan adds minimal storage for them (optional fields, safe defaults) and an injectable rate source; how set-up records needed categories and which real FX provider is used stay open, as the story says.

scope:
  - description: |
      API model and pure calculation. Add optional `price: Decimal | None` and `currency: str | None` to `ChosenOption`, and `needed_categories: list[str] = []` to `Trip` (server-owned, never read from a request body, like `options`). New `app/trips/cost.py` holds the pure function and the `CostSummary` / `FxRate` models:

      ```python
      class FxRate(BaseModel):
          currency: str          # the option's currency
          rate: float            # 1 <currency> = <rate> <trip currency>

      class CostSummary(BaseModel):
          currency: str
          total: float                       # sum of chosen, priced, convertible options, rounded to 2 dp
          budget: float | None
          over_budget_by: float              # 0 unless total > budget (equal is NOT over)
          missing_categories: list[str]      # needed categories with no chosen option, in needed order
          unpriced_count: int                # chosen options with no price
          unconvertible_count: int           # priced in a currency the rate source cannot convert
          rates: list[FxRate]                # one per foreign currency that was converted

      def summarise_cost(trip: Trip, rates: RateSource) -> CostSummary: ...
      ```
      `Trip.options` only ever holds chosen options (Book trip already relies on that), so an unchosen 300 EUR option is simply absent from it. Sum in `Decimal`, convert each foreign price with `Decimal(str(rate))`, round half-up once at the end. Category match is case-insensitive.
    files:
      - services/api/app/trips/store.py
      - services/api/app/trips/cost.py
    rationale: |
      One pure function keeps AC1-AC10 testable without HTTP and keeps money arithmetic out of the web app. Optional fields with defaults mean existing stored trips still validate.
  - description: |
      Exchange-rate source. New `app/trips/rates.py` with a `RateSource` Protocol (`def rate(self, from_currency: str, to_currency: str) -> Decimal | None`) and an `InMemoryRates` seeded with `USD->EUR = 0.92` (the rate in the approved prototype), mirroring `InMemoryRecommendations` / `SEED_RECOMMENDATIONS`. Same currency returns `Decimal(1)`; unknown pair returns `None`. Wire `_rates()` / `get_rates()` in `routers/deps.py` with `lru_cache`, like `get_recommendations`.
    files:
      - services/api/app/trips/rates.py
      - services/api/app/routers/deps.py
    rationale: |
      Conversion is explicitly left open, so the provider sits behind a Protocol and a real provider can replace the seed later without touching the calculation or the UI.
  - description: |
      Expose the summary. `TripView` gains `cost: CostSummary | None = None`; `_view(...)` fills it via `summarise_cost(trip, rates)`, so GET /trips/{id} and every trip-returning route carry it for owners and editors alike. `get_rates` is added as a dependency of the routes that call `_view` (or `_view` takes `rates` as a parameter). `list` view is left unchanged unless it already goes through `_view`.
    files:
      - services/api/app/routers/trips.py
    rationale: |
      Server-computed cost means the same answer on every device and after every edit.
  - description: |
      Test wiring: `sign_in_as` in `tests/conftest.py` overrides `deps.get_rates` with an `InMemoryRates` and exposes `make.trips` and `make.rates` so tests can save a trip with priced options directly (no route writes options yet).
    files:
      - services/api/tests/conftest.py
    rationale: |
      Options are owned by the category epics, so the only way to seed them in a test is the store.
  - description: |
      Web types and API. In `apps/web/src/trips/api.ts` add `price?: number | null` and `currency?: string | null` to `ChosenOption`, `needed_categories?: string[]` to `Trip`, and:

      ```ts
      export type CostSummary = {
        currency: string
        total: number
        budget: number | null
        over_budget_by: number
        missing_categories: string[]
        unpriced_count: number
        unconvertible_count: number
        rates: { currency: string; rate: number }[]
      }
      // Trip gains: cost?: CostSummary | null
      ```
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Mirrors the API shape; `cost` stays optional so existing fixtures still type-check.
  - description: |
      New `TripTotalCard` component, built from the approved prototype (screens "Trip total within budget", "over budget", "plan incomplete"): a `section.card.stack.stack-sm` with `aria-label="Trip total"`; a `.total-row` (flex, wrap, baseline, space-between) holding the total as an `<h1>` with `aria-live="polite"` on the left and the `.fx-rate` text on the right (`text-sm`, `--color-fg-muted`); a `.budget-line` paragraph; then, in this order, an over-budget `.badge.badge-danger` with `role="alert"` and the alert icon reading "Over budget by 50 EUR" (shown only when `over_budget_by > 0`), a plan-incomplete `.badge.badge-warning` with the info icon reading "Plan incomplete: conveyance and dining still need a pick", and a `.note-line` with the info icon reading "One chosen option has no price and is not in the total." (plural: "N chosen options have no price..."). Badges carry icon plus label, never colour alone. FX text: "USD converted at 1 USD = 0.92 EUR" per rate, else "All chosen options are priced in EUR, so no conversion was needed." Money is `<number> <CODE>` through one shared `formatMoney(amount, currency)` (en-GB grouping, 0 to 2 decimals, so 200 shows as "200 EUR"). With no budget set the line reads "No budget set" and nothing can be over budget. Layout is single column on phones; the card is not given fixed widths. Add the small CSS classes (`total-row`, `fx-rate`, `budget-line`, `note-line`) to `apps/web/src/index.css` next to the existing `title-row` rules, built only from design tokens.
    files:
      - apps/web/src/trips/TripTotalCard.tsx
      - apps/web/src/trips/TripTotalCard.test.tsx
      - apps/web/src/index.css
    rationale: |
      The prototype's headline decision is that the total is the biggest thing on the page and the warning sits directly under the budget it breaks, with the exact amount over.
  - description: |
      Mount the card in `TripDetailPage`, above the `.tabs`, replacing the current `<p className="text-muted">{formatBudget(trip)}</p>` (the budget line moves into the card). Keep the existing title row, Book trip and tabs as they are; the prototype's tab pair is the 062 pair already built. Keep the page live: the existing re-check effect (30 s interval, window focus, `TRIP_WRITE_REFUSED`) currently runs only for editors; run the interval and focus refresh for every viewer so the total and warning update without a reload (AC12). Update the one existing assertion `Budget 1,500.00 EUR` to the new card format. In `ItineraryTab`, show each chosen option's price on its row (`opt-price` style: price with currency, a `small` line "100 USD at 0.92" for converted options, "No price" when unpriced), matching the prototype's option rows.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/TripDetailPage.test.tsx
      - apps/web/src/trips/ItineraryTab.tsx
    rationale: |
      AC12 needs the open page to notice a changed price; polling is the mechanism the page already uses for access changes and needs no new transport.

tests:
  - |
    AC1 (API, tests/unit/test_trip_cost.py): chosen 120 EUR and 80 EUR; the 300 EUR option is not in `trip.options`.
    ```python
    cost = summarise_cost(trip_with(options=[opt("o1", 120), opt("o2", 80)]), rates)
    assert cost.total == 200 and cost.currency == "EUR"
    ```
    Minimal code: `summarise_cost` sums priced options.
  - |
    AC2 (API): `trip(budget=150)` with total 200.
    ```python
    assert cost.over_budget_by == 50
    ```
    Web (TripTotalCard.test.tsx): `expect(screen.getByRole('alert')).toHaveTextContent('Over budget by 50 EUR')`.
  - |
    AC3 (API + web): budget 250, total 200.
    ```python
    assert cost.over_budget_by == 0
    ```
    ```ts
    expect(screen.queryByText(/Over budget/)).not.toBeInTheDocument()
    ```
  - |
    AC4 (API + web): budget 200, total 200, the equality edge, must not warn.
    ```python
    assert cost.over_budget_by == 0
    ```
  - |
    AC5 (API): needed ["Stays", "Conveyance", "Dining"], only a Stays option chosen.
    ```python
    assert cost.missing_categories == ["Conveyance", "Dining"]
    ```
    Web: `expect(screen.getByText('Plan incomplete: conveyance and dining still need a pick')).toBeInTheDocument()`.
  - |
    AC6 (API + web): all three needed categories have a chosen option (case-insensitive match).
    ```python
    assert cost.missing_categories == []
    ```
    ```ts
    expect(screen.queryByText(/Plan incomplete/)).not.toBeInTheDocument()
    ```
  - |
    AC7 (web, TripDetailPage.test.tsx): trip in EUR with cost total 200, opened through the real page.
    ```ts
    expect(await screen.findByRole('heading', { level: 1, name: '200 EUR' })).toBeInTheDocument()
    ```
    The page has two h1 now (trip name and total), so the test queries by name, and the card gets its own heading semantics reviewed (see assumptions).
  - |
    AC8 (API): one unpriced option and one 80 EUR option.
    ```python
    assert cost.total == 80 and cost.unpriced_count == 1
    ```
  - |
    AC9 (web): `cost.unpriced_count = 1`.
    ```ts
    expect(screen.getByText('One chosen option has no price and is not in the total.')).toBeInTheDocument()
    ```
    and with `unpriced_count = 0` the note is absent.
  - |
    AC10 (API): a 100 USD option and a 108 EUR option with `InMemoryRates({("USD","EUR"): Decimal("0.92")})`.
    ```python
    assert cost.total == 200 and cost.unconvertible_count == 0
    ```
    Also: an unknown pair (JPY) is excluded and counted.
    ```python
    assert cost.unconvertible_count == 1
    ```
  - |
    AC11 (API + web): the rate used is returned and displayed beside the total.
    ```python
    assert cost.rates == [FxRate(currency="USD", rate=0.92)]
    ```
    ```ts
    expect(screen.getByText('USD converted at 1 USD = 0.92 EUR')).toBeInTheDocument()
    ```
    The no-conversion case shows "All chosen options are priced in EUR, so no conversion was needed."
  - |
    AC12 (web, TripDetailPage.test.tsx, fake timers): first GET returns cost total 140 against budget 150 (no warning); the next GET returns total 170.
    ```ts
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await screen.findByRole('alert')).toHaveTextContent('Over budget by 20 EUR')
    expect(fetchMock.mock.calls.filter(([, init]) => !init?.method).length).toBeGreaterThan(1) // refetched, not reloaded
    ```
    Run as the owner as well as an editor, since the poll was editor-only before.
  - |
    Router (tests/unit/test_trip_cost_router.py): through `sign_in_as`, save a priced trip with `make.trips`, then
    ```python
    body = owner.get(f"/trips/{trip_id}").json()
    assert body["cost"]["total"] == 200
    ```
    An accepted editor sees the same `cost`; a stranger still gets 404.
  - |
    Data (tests/unit/test_trip_store.py): a trip saved before this change (no `needed_categories`, options without `price`) still loads.
    ```python
    trip = Trip.model_validate({"id": "t1", "name": "Old", "options": [{"id": "o", "title": "x", "category": "Stays", "date": "2027-03-03"}]})
    assert trip.needed_categories == [] and trip.options[0].price is None
    ```
    A priced option round-trips through `model_dump(mode="json")` then `model_validate` with its Decimal price intact (the DynamoDB path).
  - |
    Regression: existing `TripDetailPage.test.tsx`, `BookTripDrawer.test.tsx`, `Activities.test.tsx`, `Reminders.test.tsx` and the API router tests keep passing; only the budget-line assertion text changes.

assumptions_or_open_questions:
  - |
    Nothing in the codebase stores option prices, needed categories or exchange rates, and `Trip.options` has no writer route. I added optional fields with safe defaults; the category epics and the guided set-up will populate them. Until set-up records needed categories, `needed_categories` is empty and no plan-incomplete note is ever shown. Open: what shape set-up writes (this plan assumes category names matching `ChosenOption.category`, case-insensitive).
  - |
    Exchange rates are a seeded in-memory table (USD to EUR 0.92, as in the prototype). Open: which real provider, how fresh the rate must be, and whether a rate should be stored on the trip so the total does not drift. A pair with no rate is excluded from the total and counted in `unconvertible_count`. The AC list says nothing about this case. The plan does not add a UI note for it, so decide whether one is wanted.
  - |
    "Without reloading" is met by re-fetching the trip every 30 s and on window focus, so the update can lag up to 30 s. A push channel is out of scope. Say if a shorter interval is needed.
  - |
    Prototype vs existing UI: the prototype shows money as "200 EUR" and "Budget 250 EUR", while the current page shows "Budget 1,500.00 EUR". I follow the prototype for the total card and move the budget line into it, which changes one existing test assertion. The prototype's tabs are Itinerary and Travelers only, whereas the page also has an Overview tab and a Book trip button; I leave those as they are, since the prototype's own note says the shell has no place for them.
  - |
    The page would carry two h1 elements (trip name and total) because the prototype uses an h1 for the total. I keep the prototype's markup for fidelity and flag it for the reviewer, who can downgrade the total to an h2 styled at the same size if preferred.
  - |
    The prototype's "Prototype only" ghost buttons (budget and price toggles) are demo controls and are not built.
  - |
    Over budget means strictly total greater than budget (AC4). A trip with no budget shows "No budget set" and no warning. Totals are rounded half-up to 2 decimals after summing.
  - |
    No Playwright spec is added: the app has no route that writes prices, so an end-to-end flow cannot create the data. Component and API tests cover each AC.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout
  - **Existing data**: No migration. Stored trips have no `needed_categories` and options have no `price` or `currency`; the new fields default to `[]` and `None`, so old trips validate and show a 0 EUR total, no incomplete note and, for any existing options, a "no price" note. A regression test covers this.
  - **Backfill / seed**: None needed. The only seed is the in-code `USD->EUR` rate table, loaded at import time and safe to re-run.
  - **Settings**: None. The rate source is in-memory for now; a real provider would add a setting later, documented with the other settings in `services/api/app/config.py`.
  - **Provisioning**: Nothing to create. A real FX provider (open question) would be the first external dependency.
  - **Order and rollback**: Deploy the API first (older web ignores the extra `cost` field), then the web app. Rollback is a plain revert, because the stored items only gain optional attributes that older code ignores. A priced option is stored as a string by `model_dump(mode="json")`, which DynamoDB accepts, and reads back as `Decimal`.

  ### Shape

  ```mermaid
  flowchart TD
    Page[TripDetailPage.tsx] -->|renders cost| Card[TripTotalCard.tsx]
    Page -->|poll and focus refetch| Api[trips/api.ts fetchTrip]
    Page --> Itin[ItineraryTab.tsx]
    Api -->|GET /trips/id| Router[routers/trips.py _view]
    Router -->|summarise_cost| Cost[trips/cost.py]
    Cost -->|rate| Rates[trips/rates.py RateSource]
    Router --> Deps[routers/deps.py get_rates]
    Deps --> Rates
    Router --> Store[trips/store.py Trip and ChosenOption]
    Cost --> Store
    classDef touched fill:#f96,color:#000
    class Page,Card,Api,Itin,Router,Cost,Rates,Deps,Store touched
  ```
  All nodes are touched: the page mounts the card and polls, `_view` attaches the cost, `cost.py` and `rates.py` are new, and `store.py` gains the optional fields.

  The `docs` for the project name the Trip Database (DynamoDB) as the only store and the API as FastAPI on Lambda; this plan adds no component, package or table.

review_focus: |
  IN scope: the cost summary (total, over-budget, plan-incomplete, no-price note, FX rate shown), its API computation and the web card, plus the refetch that keeps it live. OUT: any route or UI that sets prices, chooses options or records needed categories, and a real FX provider; those belong to the category epics and set-up. The riskiest part is the money arithmetic (Decimal sums, the equal-to-budget edge, rounding once at the end) and widening the 30 s refetch from editors to all viewers. The deliberate choices to hold the plan to are the server-computed `cost`, the seeded rate source behind a Protocol, and moving the budget line into the card, which alters one existing test assertion.
