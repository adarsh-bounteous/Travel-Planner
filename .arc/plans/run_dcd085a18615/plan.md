summary: |
  Add a fixed local exchange-rate table (EUR, GBP, USD, JPY, AUD - the five currencies the app offers for a trip) that the API uses as its RateSource whenever the shared local mode switch is on, so no conversion ever depends on the outside rates service. Add a stateless convert endpoint that answers either a converted amount with its currency code or a "currency not supported" result, and a Costs / Budget page in the web app (the approved prototype) with a "Show in" currency select, each cost showing its original amount above the converted amount with the code, an unsupported-currency row message, and the budget converted the same way. Recommendations are out of scope.
scope:
  - description: |
      Local rate table. Add `LOCAL_RATES_PER_EUR` (Decimal, 1 EUR = x) for EUR, USD, GBP, JPY, AUD and `LocalRates(RateSource)` that returns `from/to` cross rates computed in Decimal (`table[to] / table[from]`), 1 for same currency, and None when either code is not in the table (case-insensitive). Also export `OFFERED_CURRENCIES` (the table keys, in a stable display order) so the error message and the UI list come from one place.

      ```python
      LOCAL_RATES_PER_EUR = {"EUR": Decimal(1), "USD": Decimal("1.08"), "GBP": Decimal("0.85"), "JPY": Decimal(160), "AUD": Decimal("1.65")}

      class LocalRates:
          def rate(self, from_currency: str, to_currency: str) -> Decimal | None: ...
      ```
    files:
      - services/api/app/trips/rates.py
    rationale: |
      Mirrors the prototype fixture (EUR 1, USD 1.08, GBP 0.85, JPY 160) so 100 EUR is 108.00 USD, and extends it with AUD because the API's trip currency Literal in store.py offers AUD (AC 6 says every offered currency converts). Implements the existing RateSource port so cost.py and every router using `get_rates` need no change.
  - description: |
      Wire local mode to the local table. In `get_rates()` return `_local_rates()` (a cached `LocalRates()`) when `get_settings().local_mode` is on, else the existing `_rates()` unchanged. Same pattern as `get_trips`, `get_invite_sender`. No new setting: it follows the one LOCAL_MODE switch (the `cloud_services` stand-in flag already flips with it).
    files:
      - services/api/app/routers/deps.py
    rationale: |
      One switch decides it. With local mode on the outside-service path is never constructed or called (AC 4, 5).
  - description: |
      Convert endpoint, any signed-in user. `GET /rates/convert?amount=100&from=EUR&to=USD` using `Depends(get_rates)` and `get_current_user`. Response is either 200 `{"supported": true, "amount": 108.0, "currency": "USD", "rate": 1.08}` or 200 `{"supported": false, "message": "EUR is supported, XYZ is not. Supported currencies: EUR, USD, GBP, JPY, AUD."}` with no `amount` key. Rounding with ROUND_HALF_UP to the currency's minor units (JPY 0, others 2). Register the router in main.py.
    files:
      - services/api/app/routers/rates.py
      - services/api/app/main.py
    rationale: |
      Keeps conversion on the server with the one RateSource so the web cannot drift from the local table. Unsupported is a normal answer, not an error status, so the page renders a per-row message (AC 7, 8).
  - description: |
      Web: `convertCost` api call plus Costs / Budget page at `/trips/:tripId/costs` (route added in App.tsx under RequireAuth like the other trip routes). Built from the prototype screens "Trip costs" and "Trip budget": `.inbox-col` single column max 40rem, `h1` title, `.tabs` with two `a.tab` links (Costs / Budget, `aria-selected`), local-mode `.alert.alert-info` ("Local mode is on. Amounts use the local rate table, not the outside rates service. 1 EUR = 1.08 USD."), `.field` with `.field-label` "Show in" and `.select` listing the offered currencies, cost rows as `.card.cost-row` with `.cost-name` left and `.cost-amount` right (muted `.cost-original` above bold `.cost-converted` with the code, `font-variant-numeric: tabular-nums`), the unsupported row `.is-unsupported` (danger border) with `role="alert"`, the alert icon and "Currency not supported." text and no converted amount, and on the Budget tab a `.card` with "Budget 100 EUR" and a `.budget-stat` "Budget in USD" / "108.00 USD". Switching currency shows three `.skeleton` lines in the `aria-live="polite"` list while converting. No primary button (nothing to submit). Money formatted with the existing `formatMoney` (amount + code); JPY with 0 decimals. Tailwind classes follow how the existing trips pages express these tokens. Link from the trip's total/budget area to the page.
    files:
      - apps/web/src/trips/CostsPage.tsx
      - apps/web/src/trips/BudgetPanel.tsx
      - apps/web/src/trips/convertApi.ts
      - apps/web/src/App.tsx
      - apps/web/src/trips/TripTotalCard.tsx
    rationale: |
      Delivers ACs 1, 2, 3, 6, 7, 8 as the approved prototype shows them. The "Prototype only: pretend the outside service says 1.12" checkbox is a reviewer aid per the prototype's own design notes and is NOT built.
  - description: |
      Docs: note in the API README that local mode uses the fixed local rate table (list the currencies and rates) and how to change a rate.
    files:
      - services/api/README.md
    rationale: |
      The table is a fixed stand-in; reviewers and developers need to know where it lives.
tests:
  - |
    AC1 - services/api/tests/unit/test_local_rates.py, written first, fails on missing LocalRates:
    ```python
    def test_100_eur_in_usd_uses_local_rate():
        assert LocalRates().rate("EUR", "USD") == Decimal("1.08")
        assert (Decimal(100) * LocalRates().rate("EUR", "USD")) == Decimal("108.00")
    ```
    Router test: `client.get("/rates/convert", params={"amount": 100, "from": "EUR", "to": "USD"}).json() == {"supported": True, "amount": 108.0, "currency": "USD", "rate": 1.08}`.
  - |
    AC2 - converted answer carries the code (API) and the UI shows it (apps/web/src/trips/CostsPage.test.tsx, vitest + Testing Library):
    ```ts
    expect(await screen.findByText('108.00 USD')).toBeInTheDocument()
    ```
    and the original stays visible: `expect(screen.getByText('100.00 EUR')).toBeInTheDocument()`.
  - |
    AC3 - budget (BudgetPanel / Budget tab) with trip budget 100 EUR and Show in USD:
    ```ts
    expect(await screen.findByText('Budget 100.00 EUR')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Budget in USD' })).toHaveTextContent('108.00 USD')
    ```
  - |
    AC4 - with LOCAL_MODE on and an outside RateSource double that raises if called, conversion succeeds:
    ```python
    class ExplodingRates:
        def rate(self, a, b): raise AssertionError("outside rates service used")
    # app.dependency_overrides is NOT set for get_rates; the outside _rates is monkeypatched to ExplodingRates
    monkeypatch.setattr(deps, "_rates", lambda: ExplodingRates())
    assert client.get("/rates/convert", params={"amount": 100, "from": "EUR", "to": "GBP"}).json()["supported"] is True
    ```
    Also `assert isinstance(deps.get_rates(), LocalRates)` with local mode on and `not isinstance(...)` with it off.
  - |
    AC5 - outside service double returns 1.12 for EUR-USD; local mode on still yields the table rate:
    ```python
    monkeypatch.setattr(deps, "_rates", lambda: InMemoryRates({("EUR", "USD"): Decimal("1.12")}))
    assert client.get("/rates/convert", params={"amount": 100, "from": "EUR", "to": "USD"}).json()["amount"] == 108.0
    ```
  - |
    AC6 - every ordered pair of offered currencies converts:
    ```python
    @pytest.mark.parametrize("a,b", [(a, b) for a in OFFERED_CURRENCIES for b in OFFERED_CURRENCIES])
    def test_every_pair_converts(a, b):
        assert LocalRates().rate(a, b) is not None
    ```
    Also a web test that the "Show in" select options equal the offered list including AUD.
  - |
    AC7 - unsupported currency gives a message:
    ```python
    body = client.get("/rates/convert", params={"amount": 50, "from": "XYZ", "to": "USD"}).json()
    assert body["supported"] is False and "not supported" in body["message"]
    ```
    Web: a cost priced in XYZ renders `expect(screen.getByRole('alert')).toHaveTextContent('Currency not supported')`.
  - |
    AC8 - no converted amount for the unsupported cost:
    ```python
    assert "amount" not in body
    ```
    Web: `expect(within(unsupportedRow).queryByText(/USD$/)).not.toBeInTheDocument()` - only the original `50 XYZ` is shown.
  - |
    Regression: existing cost tests (test_trip_cost.py, test_cost_transport.py, test_cost_chosen_stay.py) still pass with their own InMemoryRates, and with local mode off `get_rates()` still returns the seeded InMemoryRates.
assumptions_or_open_questions:
  - |
    Prototype conflict, AC 6 vs the design: the prototype's "Show in" select lists only USD, EUR, GBP, JPY and its unsupported message hardcodes "EUR, USD, GBP or JPY". The API's trip currency choice (store.py TripCreate.currency) also offers AUD, and AC 6 says every currency the app offers must convert. The plan includes AUD in the table, the select and the message, and builds the message from the offered list. Reviewer: confirm, or tell me to limit the table to the prototype's four.
  - |
    The AUD rate (1 EUR = 1.65 AUD) is my invented fixed value; the other four rates come from the prototype fixture. Confirm or supply a rate.
  - |
    Where the page gets its cost lines: I assume the Costs list is built from the trip's already-loaded priced items (chosen options, chosen stays, transport picks, each with price and currency string) and the budget from the trip's budget in the trip currency, with no new storage. If a separate "costs" concept is wanted, that is a different story.
  - |
    Outside the local switch nothing changes: the non-local `_rates()` seed stays as is (no real provider exists yet), so "without the outside rates service" is enforced by the local-mode branch only.
  - |
    The prototype's "pretend outside service" checkbox is a reviewer aid and is not built.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None - a fixed in-code rate table and a read-only endpoint; no schema, stored data, seed or new setting. It reuses the existing LOCAL_MODE switch (documented in services/api/README.md). Rollback: revert the commit.

  ```mermaid
  flowchart TD
    CR[routers/rates.py convert endpoint] --> GR[deps.get_rates]
    GR -->|local mode on| LR[trips/rates.py LocalRates]
    GR -->|local mode off| IM[trips/rates.py InMemoryRates seed]
    CS[trips/cost.py summarise_cost] --> GR
    TR[routers/trips.py] --> GR
    MAIN[main.py registers router] --> CR
    CP[web CostsPage.tsx] --> CR
    APP[web App.tsx route] --> CP
    TTC[web TripTotalCard.tsx link] --> APP
    classDef touched fill:#f96,color:#000
    class CR,GR,LR,MAIN,CP,APP,TTC touched
  ```

  deps.py is touched so local mode picks the local table; rates.py gains the table; the router and web page are new. cost.py and trips.py already take a RateSource, so they pick up the local table with no edit, which means trip totals also convert at local rates in local mode.
review_focus: |
  IN: the local rate table, the local-mode switch in `get_rates`, the convert endpoint, and the Costs/Budget page from the approved prototype. OUT: recommendations, a real outside provider, and the prototype's reviewer-only checkbox. Riskiest part is the local-mode wiring: check that with the switch on the outside path is never reached, and that AUD was added deliberately against the prototype's four-currency select to satisfy AC 6.
