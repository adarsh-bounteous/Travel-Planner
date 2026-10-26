summary: |
  Add a ranked flight shortlist for one trip leg (origin, destination, date). The API gets a new `app/flights` package: a `FlightProvider` port with three seeded in-memory sources (flight search API, web search, partner API), a gatherer that calls the sources in parallel with a 5 s per-source timeout and reports each source's status, and a ranker that blends fare (main weight), travel time, stops and preference fit. Each flight carries a reason and an over-budget flag. The over-budget flag reuses the trip-cost logic in `app/trips/cost.py` by adding the fare to the current trip total. A new `GET /trips/{trip_id}/flights/shortlist` route serves it. The web app gets a `FlightShortlistPage` built from the approved prototype: ranked stacked cards, a "Fares from" source strip, a partial-results alert with retry, an empty state and a skeleton loading state. Flights are never filtered out by budget; over-budget flights are listed after every fitting one.

scope:
  - description: |
      Flight domain model, provider port and gatherer in a new `app/flights` package.

      ```python
      # app/flights/options.py
      FLIGHT_SOURCE_TIMEOUT_SECONDS = 5.0
      SourceStatus = Literal["ok", "failed", "timed_out"]

      class FlightOption(BaseModel):
          id: str
          provider: str            # the airline shown on the card
          source: str              # "Flight search API" | "Web search" | "Partner API"
          fare: Decimal
          currency: str
          travel_minutes: int
          stops: int
          departs: time | None = None
          cabin: Cabin | None = None
          deal: str | None = None
          fetched_at: datetime     # drives "indicative as of ..."
          url: str

      class FlightProvider(Protocol):
          name: str
          def fetch(self, origin: str, destination: str, on: date) -> list[FlightOption]: ...

      class SourceResult(BaseModel):
          name: str
          status: SourceStatus

      def gather_flights(providers: list[FlightProvider], origin: str, destination: str, on: date,
                         timeout: float = FLIGHT_SOURCE_TIMEOUT_SECONDS
                         ) -> tuple[list[FlightOption], list[SourceResult]]: ...
      ```

      `gather_flights` submits every `provider.fetch` to a `ThreadPoolExecutor` and waits with `concurrent.futures.wait(..., timeout=timeout)`. A raised exception gives status `failed` (logged, like `search_transport`). A future still running at the deadline gives `timed_out`. The pool is shut down with `wait=False, cancel_futures=True` so a slow source never holds the response past the deadline.
    files:
      - services/api/app/flights/__init__.py
      - services/api/app/flights/options.py
    rationale: |
      Mirrors `app/transport/options.py` (Protocol port plus gatherer that logs and skips a failing provider) and `app/stays/options.py`. It adds the parallel 5 s timeout that AC13 needs and that the sequential transport gatherer does not have. Transport options are left untouched; a flight here has travel time, deal and fetched_at, which `TransportOption` lacks.

  - description: |
      Seeded in-memory sources, keyed by casefolded origin and destination so a leg only gets flights for its own route (AC3). One provider per source name; the seed route is Lisbon to Faro, matching the prototype, with a second seeded route (for example Faro to Porto) so a two-flight-leg trip can be tested. `InMemoryFlightProvider(name, catalogue, clock)` stamps `fetched_at` from the injected clock at fetch time, like `InMemoryStayProvider`. Seed values follow the prototype's FLIGHTS array: Algarve Air 54 EUR with the 12 EUR deal, Lusitania Jet 59, Atlantic Connect 68 with 1 stop, Costa Premium 96. Wire `get_flight_providers()` into `deps.py` with an `lru_cache`d builder like `_stay_providers`.
    files:
      - services/api/app/flights/providers.py
      - services/api/app/routers/deps.py
    rationale: |
      Same seeded-default pattern as `app/stays/providers.py` and `app/transport/providers.py`. Real adapters (ADR-0008, Flight and Hotel Search outbound) will implement `FlightProvider` later without touching the ranker or the route.

  - description: |
      Ranking and reasons in `app/flights/shortlist.py`.

      ```python
      WEIGHTS = {"fare": Decimal("0.6"), "time": Decimal("0.2"), "stops": Decimal("0.1"), "fit": Decimal("0.1")}

      class ShortlistFlight(BaseModel):
          rank: int
          flight: FlightOption
          fit: int                  # 0-100, share of the saved transport preferences met
          fits_budget: bool
          over_budget_by: Decimal   # in trip currency, 0 when it fits
          reason: str               # "Cheapest" | "Fastest" | "Fewest stops" | "Fits your saved preferences" | "Balanced fare and travel time"

      def preference_fit(f: FlightOption, prefs: TransportPreferences) -> int: ...
      def rank_flights(flights: list[FlightOption], prefs: TransportPreferences,
                       over_by: Callable[[FlightOption], Decimal]) -> list[ShortlistFlight]: ...
      ```

      Sort key is `(not fits_budget, -score, fare, travel_minutes, stops, -fit, provider)`. Score is the weighted min-max blend (lower fare, time and stops are better; equal min and max gives 1), so fare dominates but the other three break ties as the ACs need. `preference_fit` counts only the preferences that are set (`modes` contains "flight", `max_stops`, `departure_window`, `cabin`, preferred `providers`) and returns 100 when none are set. Nothing is dropped. The reason is "Cheapest" for the lowest fare, then "Fastest", "Fewest stops" (only when it differs from the others), "Fits your saved preferences" for the best fit, else "Balanced fare and travel time". Over-budget flights keep their rank reason and also carry `over_budget_by`, which the web shows as the "Over budget by ..." badge.
    files:
      - services/api/app/flights/shortlist.py
    rationale: |
      Follows `rank_properties` in `app/stays/shortlist.py` (budget-fitting first, weighted blend, reason per row), with fare as the main weight as the story asks. Reuses `_in_window` from `app/transport/options.py` for the departure-window preference; promote it to a non-underscore name or import it as is, whichever the existing style prefers.

  - description: |
      Budget check that reuses the existing over-budget logic. Add to `cost.py`:

      ```python
      def fare_over_budget_by(trip: Trip, rates: RateSource, fare: Decimal, currency: str) -> Decimal:
          """How far the trip total goes over budget with `fare` added; 0 when it fits, there is no budget, or the currency cannot be converted."""
      ```

      It calls `summarise_cost(trip, rates)` for the current total and budget, converts the fare with `rates.rate(currency.upper(), trip.currency)`, rounds to a cent with `ROUND_HALF_UP`, and uses the same rule as `summarise_cost`: over only when `total + fare > budget`, so equal is not over. `summarise_cost` itself is unchanged.
    files:
      - services/api/app/trips/cost.py
    rationale: |
      AC9 to AC12 and the story's "using the existing over-budget logic". Going through `summarise_cost` keeps the chosen options and chosen stays counted in the total, so there is one definition of "the trip total".

  - description: |
      New route `GET /trips/{trip_id}/flights/shortlist?origin=&destination=&date=` in a new router, registered in `main.py`. Response model:

      ```python
      class FlightShortlist(BaseModel):
          origin: str
          destination: str
          date: date
          budget: float | None
          currency: str            # trip currency
          sources: list[SourceResult]
          flights: list[ShortlistFlight]
      ```

      Uses `_load(trips, identity, user, trip_id)` (the trip must be visible to the caller, else 404 like the stay routes), the caller's saved `transport_preferences` from `ProfileStore`, `get_rates` and `get_flight_providers`. Empty `flights` with every source `ok` is the "no flights found" case; the web decides the message.
    files:
      - services/api/app/routers/flight_shortlist.py
      - services/api/app/main.py
    rationale: |
      Same shape as `stay_shortlist` in `routers/stay_options.py` plus the preference lookup copied from `routers/transport.py`. Origin, destination and date come from the request, so any leg the traveller chooses to fly (onward, interim) works without a legs model (see open questions).

  - description: |
      Web API client and helpers: add `FlightShortlist`, `ShortlistFlight`, `SourceResult` types and `fetchFlightShortlist(tripId, origin, destination, date)` to `apps/web/src/trips/api.ts` (uses the existing `call`). Add `apps/web/src/trips/flights.ts` with `formatMinutes` (55 min, 2 h 20 min), `formatStops` (Nonstop, 1 stop, 2 stops) and `formatRetrieved` (local format, shown after "indicative as of"). Money goes through the existing `formatMoney` in `stayOptions.ts`, so it always carries the currency.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/flights.ts
      - apps/web/src/trips/flights.test.ts
    rationale: |
      Mirrors `fetchStayShortlist` and `stayOptions.ts` helpers; the UI guideline requires local format with currency.

  - description: |
      Flight shortlist page and card, from the prototype's "Flight shortlist" screens (`#flight-shortlist`, `#flight-shortlist-partial`, `#flight-shortlist-empty`). Route `/trips/:tripId/flights?origin=&destination=&date=` inside `<RequireAuth>` in `App.tsx`.

      - Layout is one `.stack.stack-lg` column. Breadcrumb `Lisbon trip / Lisbon to Faro` (the `.crumbs` pattern already used by `StayShortlistPage`), `h1` "Flights, Lisbon to Faro, 18 Nov", then the budget line ("Your trip budget is EUR 600.00 and you have EUR 70.00 left").
      - `.strip` (surface background, `--radius-md`) holding "Fares from" and one `.badge.badge-success` with a check icon per source that answered. A `.btn.btn-ghost.btn-sm` "How we rank" toggles the explanation (`aria-expanded`). Copy is changed from the prototype's lexicographic wording to match the blended ranking.
      - Loading: three `.card` skeletons (`.skeleton` lines, 50/30/60 % widths) in a group with `aria-busy`, as in the prototype's `#sl-loading`.
      - `FlightShortlistCard` is an `<article class="card flight-option" role="listitem">` inside `role="list" aria-label="Flights ranked, best first"`. It holds, in order: provider (`--font-size-lg`, bold) with the reason in a `.badge.badge-neutral`; the fare (`--font-size-xl`, bold) with the muted "indicative as of <time>"; details (travel time, stops, "via <source>"); a `.badge.badge-warning` with a star icon for a deal; and a budget badge, either `.badge.badge-success` "Fits your trip budget" or `.badge.badge-danger` "Over budget by <amount>".
      - Fitting flights first, over-budget flights after (no filtering). Each group keeps API order.
      - Partial: when any `sources[].status` is not `ok`, a persistent `.alert.alert-warning` (`role="alert"`) names the source ("Partner API did not respond within 5 seconds.") with a `.btn.btn-secondary.btn-sm` "Retry partner API" that reloads the shortlist (button shows a `.spinner` while waiting). A `Toast` says "Some flight sources did not respond. Showing the rest." once.
      - Empty (no flights, no source failed): `.empty-state` with search icon, h2 "No flights were found for this route and date.", text "Try another date, or choose another way to travel between Lisbon and Faro.", `.btn-primary` "Change dates" and `.btn-secondary` "Choose another travel mode". One primary button per section.
      - Failed request: `.alert.alert-danger` with Retry, like `StayShortlistPage`.
      - "Back to trip" link to `/trips/:tripId`. The prototype's "Preview as" chips are reviewer scaffolding and are not built.
      - Phone first (375 px), cards reflow without fixed columns, content width capped by `--size-content-max`, light theme only. Tokens and classes come from the existing `index.css`; add `.flight-option`, `.option-top`, `.fare` and `.option-details` styles there only if the existing classes do not cover them, using the prototype's rules.
    files:
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/trips/FlightShortlistCard.tsx
      - apps/web/src/trips/FlightShortlistPage.test.tsx
      - apps/web/src/App.tsx
      - apps/web/src/index.css
    rationale: |
      Builds the approved design with the project's existing components (`Toast`, icons, `.crumbs`, `.alert`, `.empty-state`, `.skeleton`) and the same load-state structure as `StayShortlistPage.tsx`.

tests:
  - |
    AC1, API. File services/api/tests/unit/test_flight_shortlist_router.py. Written first, fails until the route exists.
    ```python
    r = a.get(f"/trips/{tid}/flights/shortlist", params={"origin": "Lisbon", "destination": "Faro", "date": "2027-11-18"})
    assert r.status_code == 200
    body = r.json()
    assert [f["rank"] for f in body["flights"]] == list(range(1, len(body["flights"]) + 1))
    assert len(body["flights"]) > 1
    ```
  - |
    AC1, web. In FlightShortlistPage.test.tsx, with the stubbed API returning ranked flights:
    ```tsx
    renderAt('/trips/t1/flights?origin=Lisbon&destination=Faro&date=2027-11-18')
    const list = await screen.findByRole('list', { name: 'Flights ranked, best first' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByRole('heading', { level: 1, name: 'Flights, Lisbon to Faro, 18 Nov' })).toBeInTheDocument()
    ```
  - |
    AC2. Any leg is addressed by its own origin, destination and date, so an onward or interim leg opens the same page. Test the page reads the three query params and calls the client with them:
    ```tsx
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/trips/t1/flights/shortlist?origin=Faro&destination=Porto&date=2027-11-22'), expect.anything())
    ```
  - |
    AC3. A recording provider returns flights only for its own route; two legs of one trip each get only their own.
    ```python
    first = a.get(url, params=leg("Lisbon", "Faro", "2027-11-18")).json()["flights"]
    second = a.get(url, params=leg("Faro", "Porto", "2027-11-22")).json()["flights"]
    assert {f["flight"]["id"] for f in first}.isdisjoint({f["flight"]["id"] for f in second})
    assert calls == [("Lisbon", "Faro", date(2027, 11, 18)), ("Faro", "Porto", date(2027, 11, 22))]
    ```
  - |
    AC4. test_flight_options.py, three fake providers named as the sources:
    ```python
    flights, sources = gather_flights([search, web, partner], "Lisbon", "Faro", date(2027, 11, 18))
    assert {f.source for f in flights} == {"Flight search API", "Web search", "Partner API"}
    assert [s.status for s in sources] == ["ok", "ok", "ok"]
    ```
  - |
    AC5. Router test for the fields, and web test for what is rendered:
    ```python
    assert {"provider", "fare", "currency", "travel_minutes", "stops"} <= body["flights"][0]["flight"].keys()
    ```
    ```tsx
    const card = (await screen.findAllByRole('listitem'))[0]
    expect(within(card).getByText('Algarve Air')).toBeInTheDocument()
    expect(within(card).getByText(/€54\.00|EUR\s?54\.00/)).toBeInTheDocument()
    expect(within(card).getByText('55 min')).toBeInTheDocument()
    expect(within(card).getByText('Nonstop')).toBeInTheDocument()
    ```
  - |
    AC6. A flight with a deal shows it, and one without shows none.
    ```tsx
    expect(within(cards[0]).getByText('Deal: EUR 12.00 off online fares until 31 Oct')).toBeInTheDocument()
    expect(within(cards[1]).queryByText(/^Deal:/)).not.toBeInTheDocument()
    ```
  - |
    AC7. Reasons from the ranker (test_flight_shortlist.py) and shown on the card.
    ```python
    by_id = {s.flight.id: s for s in ranked}
    assert by_id["cheap"].reason == "Cheapest"
    assert by_id["quick"].reason == "Fastest"
    ```
    ```tsx
    expect(within(cards[0]).getByText('Cheapest')).toBeInTheDocument()
    ```
  - |
    AC8. Same time, stops and fit, lower fare ranks higher, whatever the input order.
    ```python
    ranked = rank_flights([_f("dear", fare=70), _f("cheap", fare=60)], NO_PREFS, _fits)
    assert [s.flight.id for s in ranked] == ["cheap", "dear"]
    ```
  - |
    AC9. An over-budget flight is still listed.
    ```python
    # trip budget 100 EUR, chosen option 90 EUR, flight 54 EUR
    body = a.get(url, params=leg).json()
    assert any(not f["fits_budget"] for f in body["flights"])
    assert len(body["flights"]) == total_seeded
    ```
  - |
    AC10. A flight that keeps the total within budget shows no over-budget reason. Boundary case: equal to budget is not over, as in `summarise_cost`.
    ```python
    assert fare_over_budget_by(trip_total_90_budget_100, rates, Decimal(10), "EUR") == 0
    ```
    ```tsx
    expect(within(card).queryByText(/Over budget/)).not.toBeInTheDocument()
    expect(within(card).getByText('Fits your trip budget')).toBeInTheDocument()
    ```
  - |
    AC11. An over-budget flight shows an over-budget reason. A foreign-currency fare is converted with the existing rates.
    ```python
    assert fare_over_budget_by(trip_total_90_budget_100, rates, Decimal("20.50"), "EUR") == Decimal("10.50")
    ```
    ```tsx
    expect(within(card).getByText(/Over budget by/)).toBeInTheDocument()
    ```
  - |
    AC12. Every fitting flight comes before every over-budget one, even when an over-budget flight has the best blended score. Web test checks the DOM order too.
    ```python
    flags = [s.fits_budget for s in ranked]
    assert flags == sorted(flags, reverse=True)
    ```
    ```tsx
    const badges = cards.map((c) => within(c).queryByText(/Over budget by/) !== null)
    expect(badges).toEqual([...badges].sort((a, b) => Number(a) - Number(b)))
    ```
  - |
    AC13. One source raises, one sleeps past the (shortened) timeout; the remaining source's flights are still listed and the statuses are reported.
    ```python
    flights, sources = gather_flights([ok, boom, slow], "Lisbon", "Faro", day, timeout=0.05)
    assert [f.source for f in flights] == ["Flight search API"]
    assert {s.name: s.status for s in sources} == {"Flight search API": "ok", "Web search": "failed", "Partner API": "timed_out"}
    ```
    ```tsx
    expect(await screen.findByRole('alert')).toHaveTextContent('Partner API did not respond within 5 seconds.')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    ```
    Plus a test that the default timeout is `FLIGHT_SOURCE_TIMEOUT_SECONDS == 5.0`, and that `gather_flights` returns well before a 2 s sleeping provider when `timeout=0.05`.
  - |
    AC14. Each fare is labelled with that option's retrieval time, taken from the injected clock.
    ```python
    assert body["flights"][0]["flight"]["fetched_at"].startswith("2026-10-26T09:14")
    ```
    ```tsx
    expect(within(card).getByText(`indicative as of ${formatRetrieved('2026-10-26T09:14:00Z')}`)).toBeInTheDocument()
    ```
  - |
    AC15. No flights for the leg gives an empty list and the web empty state.
    ```python
    assert a.get(url, params=leg("Oslo", "Bergen", "2027-11-18")).json()["flights"] == []
    ```
    ```tsx
    expect(await screen.findByText('No flights were found for this route and date.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change dates' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose another travel mode' })).toBeInTheDocument()
    ```
  - |
    AC16. Same fare, stops and fit; shorter travel time ranks higher.
    ```python
    ranked = rank_flights([_f("slow", minutes=140), _f("quick", minutes=50)], NO_PREFS, _fits)
    assert [s.flight.id for s in ranked] == ["quick", "slow"]
    ```
  - |
    AC17. Same fare and travel time; fewer stops ranks higher.
    ```python
    ranked = rank_flights([_f("one", stops=1), _f("none", stops=0)], NO_PREFS, _fits)
    assert [s.flight.id for s in ranked] == ["none", "one"]
    ```
  - |
    AC18. Same fare, time and stops; the one that fits the saved preferences ranks higher. Fit comes from the real `TransportPreferences`.
    ```python
    prefs = TransportPreferences(departure_window="morning")
    ranked = rank_flights([_f("evening", departs=time(19, 0)), _f("morning", departs=time(8, 0))], prefs, _fits)
    assert [s.flight.id for s in ranked] == ["morning", "evening"]
    assert preference_fit(_f("x"), TransportPreferences()) == 100
    ```
    Router test saves a profile with `max_stops=0` through the profile route and checks the nonstop flight outranks an otherwise equal 1-stop one.
  - |
    Access. A caller who cannot see the trip gets the same 404 as the stay routes, and a signed-out caller gets 401.
    ```python
    assert b.get(f"/trips/{tid}/flights/shortlist", params=leg).status_code == 404
    ```

assumptions_or_open_questions:
  - |
    There is no trip-leg or per-leg mode model in the codebase (`Trip` has options, stays, places but no legs), and the story puts "choosing a mode for each leg and building the multi-leg itinerary" out of scope. So this plan makes the shortlist addressable by origin, destination and date on `/trips/:tripId/flights?...`, which satisfies AC2 and AC3 for any leg the traveller chooses to fly. It does NOT build the prototype's "Trip legs" screen (leg cards with a Train or Flying badge and a "Flight shortlist" button), because that needs the leg and mode model from the separate story. Reviewer: confirm this boundary, or tell me to add a minimal leg list.
  - |
    Prototype versus ACs. The prototype's "How we rank" copy says ties go to travel time, then stops, then fit, and its script sorts lexicographically by fare. The story says a blend with fare as the main factor, so the plan uses a weighted blend (fare 0.6, time 0.2, stops 0.1, fit 0.1) with a deterministic tie-break on fare, then time, then stops, then fit. The "How we rank" text is reworded to match. The weights are my assumption, so please confirm.
  - |
    The three sources are seeded in-memory providers (as for stays and transport), not live APIs; real adapters come later under ADR-0008. Seed routes are Lisbon to Faro and one more, so unknown routes give the empty state.
  - |
    A fare in a currency the rate source cannot convert is treated as not over budget (its over-by is 0), and the card still shows the fare in its own currency. A trip with no budget never marks a flight over budget.
  - |
    "Retry partner API" reloads the whole shortlist rather than re-querying one source, which keeps the API to one route. The retry button names the first source that did not answer.
  - |
    The reason shown for an over-budget flight is its rank reason plus the separate "Over budget by <amount>" badge from the prototype, which is the "over budget" reason for AC11.
  - |
    Fares are shown in the provider's currency; over-budget amounts and the budget line are in the trip currency. The seeds are EUR, so they match for the demo trip.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout

  None — read-only search over seeded in-memory providers. No schema, stored data, seed record, setting or env var changes. The 5 s source timeout is a module constant (`FLIGHT_SOURCE_TIMEOUT_SECONDS`), not a setting. Deploy order does not matter; rollback is removing the route.

  ### Shape

  ```mermaid
  flowchart TD
    Web[FlightShortlistPage.tsx - new page from prototype] --> WApi[trips/api.ts - fetchFlightShortlist]
    WApi --> Route[routers/flight_shortlist.py - new route]
    Route --> Load[routers/trips.py _load - existing access check]
    Route --> Prefs[routers/transport.py pattern - saved TransportPreferences via ProfileStore]
    Route --> Gather[flights/options.py - new port and 5s parallel gatherer]
    Gather --> Prov[flights/providers.py - seeded sources]
    Route --> Rank[flights/shortlist.py - new blended ranker]
    Rank --> Cost[trips/cost.py - fare_over_budget_by over summarise_cost]
    Deps[routers/deps.py - get_flight_providers] --> Route
    Main[main.py - include_router] --> Route
    classDef touched fill:#f96,color:#000
    class Web,WApi,Route,Gather,Prov,Rank,Cost,Deps,Main touched
  ```

  Highlighted nodes are new or changed; `_load` and the preferences lookup are existing code the route reuses.

  ### Design reading

  Read in full: `TRAVEL-PLANNER-APP-STORY-038-design.html` (screens "Trip legs", "Flight shortlist", "...one source did not respond", "...no flights found"). The design reuses patterns from STORY-040 (crumbs, option card, skeleton). The plan follows the approved layout and does not add any design work.

  ### Process

  Write each test in the `tests` list first and watch it fail before the code. Order: `cost.py`, then `flights/options.py`, `flights/shortlist.py`, providers and route, then the web client, helpers, card and page. Run `cd services/api && pytest` and `cd apps/web && pnpm vitest run`.

review_focus: |
  IN: the flight-shortlist API (gather with a 5 s per-source timeout, blended ranking, budget flag) and the web page for one leg addressed by origin, destination and date. OUT: the Trip legs screen and per-leg mode choice (separate story), other modes, preference capture, real provider adapters. Riskiest areas are the timeout and partial-result handling in `gather_flights`, and keeping the over-budget check on the existing `summarise_cost` rules, where equal to budget is not over. Deliberate: the weighted blend replaces the prototype's lexicographic sort and wording, the weights are an assumption, and flights are never filtered by budget, only ordered after the ones that fit.
