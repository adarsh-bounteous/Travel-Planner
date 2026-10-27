summary: |
  Add an activity-options gatherer for a trip's destination. A new `app/attractions` package defines an `ActivityProvider` port (mirroring `StayProvider`), seeded in-memory providers for two source kinds (web search and partner platforms), and a pure `gather_activities(providers, trip, rates)` that keeps only tickets, tours, day trips and experiences (free sights and one-off events are dropped), keeps only options matching at least one trip interest, computes an indicative group estimate (adult price x traveller count), drops options whose estimate is over the trip budget (equal to budget is kept), and merges the same activity from several sources into one option carrying each price with its provider and date. A new `GET /trips/{trip_id}/activity-options` route exposes it, and a new React `ActivityOptionsPage` shows provider, group estimate labelled indicative, adult/child price (child only when known), offers, per-source prices, and an empty-state message suggesting a change of interests or budget. Ranking and shortlist presentation are out of scope.
scope:
  - description: |
      Domain module: models, provider port and gather logic. Signatures:

      ```python
      ActivityKind = Literal["ticket", "tour", "day_trip", "experience", "free_sight", "event"]
      SourceKind = Literal["web_search", "partner"]

      class ProviderActivity(BaseModel):
          title: str
          kind: ActivityKind
          interests: list[str]            # e.g. "museum", "food"
          provider: str                   # who sells / runs it
          adult_price: Decimal
          child_price: Decimal | None = None
          currency: str
          offer: str | None = None
          fetched_at: datetime
          url: str

      class ActivityProvider(Protocol):
          name: str
          source: SourceKind
          def fetch(self, place: str) -> list[ProviderActivity]: ...

      class PriceEntry(BaseModel):
          provider: str; source: SourceKind
          adult_price: Decimal; child_price: Decimal | None
          group_estimate: Decimal; currency: str; fetched_at: datetime; url: str; offer: str | None

      class ActivityOption(BaseModel):
          id: str; title: str; kind: ActivityKind; interests: list[str]
          provider: str                   # provider of the cheapest price entry
          adult_price: Decimal; child_price: Decimal | None
          group_estimate: Decimal; group_estimate_indicative: bool = True
          currency: str; offer: str | None
          prices: list[PriceEntry]        # one per source, cheapest first

      class ActivityOptions(BaseModel):
          place: str; travellers: int; options: list[ActivityOption]

      def gather_activities(providers: list[ActivityProvider], trip: Trip, rates: RateSource) -> ActivityOptions: ...
      ```

      A failing provider is logged and skipped (as `search_stays` does). Group estimate = adult_price x (trip.traveller_count or 1), converted to the trip currency through `RateSource` for the budget comparison only. Option shown when kind is one of ticket/tour/day_trip/experience, at least one interest matches (case-folded) when the trip has interests, and (no budget or estimate in trip currency <= budget). Merge by folded title.
    files:
      - services/api/app/attractions/__init__.py
      - services/api/app/attractions/options.py
    rationale: |
      Mirrors `app/stays/options.py` (port, merge-then-filter, per-provider failure isolation) so activities follow the established provider pattern and ADR-0007/0008 outbound integration shape.
  - description: |
      Seeded in-memory provider and catalogues for Lisbon-style destinations: at least one `web_search` and one `partner` provider, including one activity priced differently by two providers, a free sight, a one-off event, an activity with no child price, one with an offer, and interest tags. `InMemoryActivityProvider(name, source, catalogue, clock)` stamps `fetched_at` like `InMemoryStayProvider`.
    files:
      - services/api/app/attractions/providers.py
    rationale: Gives a default until real web-search/partner adapters exist, same as `SEED_CATALOGUES` for stays.
  - description: |
      Dependency and route. `get_activity_providers() -> list[ActivityProvider]` in deps (same seeds in local mode and normal mode). New router, registered in main.py:

      ```python
      @router.get("/{trip_id}/activity-options")
      def activity_options(trip_id: str, user=Depends(get_current_user), trips=Depends(get_trips),
                           identity=Depends(get_identity), rates=Depends(get_rates),
                           providers=Depends(get_activity_providers)) -> ActivityOptions
      ```

      Uses `_load` so access and 404 behave like stay options; a trip with no destination returns an empty options list.
    files:
      - services/api/app/routers/deps.py
      - services/api/app/routers/activity_options.py
      - services/api/app/main.py
    rationale: Same wiring as `routers/stay_options.py`; thin route, logic stays in the domain module.
  - description: |
      Web: types and `fetchActivityOptions(tripId)` in `trips/api.ts`; new `ActivityOptionsPage` rendering each option (title, provider, "Indicative group estimate" with amount, adult price, child price only when non-null, offer, and a per-source price list with provider and date) and the empty-state message "Nothing matches your interests and budget. Try changing your interests or budget."; route `/trips/:tripId/activity-options` in App.tsx behind the same auth wrapper as the stay options route. Reuse `formatMoney` from `trips/stayOptions.ts`.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/ActivityOptionsPage.tsx
      - apps/web/src/App.tsx
    rationale: ACs 3-9, 15 and 16 are about what is shown; follows `StayOptionsPage`.
  - description: |
      Tests (written first): pure domain tests, router tests and a vitest component test. See `tests`.
    files:
      - services/api/tests/unit/test_activity_options.py
      - services/api/tests/unit/test_activity_options_router.py
      - apps/web/src/trips/ActivityOptionsPage.test.tsx
    rationale: Test-first per AC.
tests:
  - |
    AC1 (test_activity_options.py) - all four kinds gathered.
    ```python
    out = gather_activities(providers, trip(interests=[]), RATES)
    assert {"ticket", "tour", "day_trip", "experience"} <= {o.kind for o in out.options}
    ```
  - |
    AC2 - both source kinds present.
    ```python
    assert {p.source for o in out.options for p in o.prices} == {"web_search", "partner"}
    ```
  - |
    AC3 - provider on every option and price entry.
    ```python
    assert all(o.provider and all(p.provider for p in o.prices) for o in out.options)
    ```
    Web: `expect(screen.getByText('Lisbon Tours Co')).toBeInTheDocument()`.
  - |
    AC4 and AC5 - group estimate for the group, labelled indicative.
    ```python
    o = _one(gather_activities(providers, trip(traveller_count=3), RATES), "Tile Museum")
    assert o.group_estimate == o.adult_price * 3 and o.group_estimate_indicative is True
    ```
    Web: `expect(screen.getByText(/indicative group estimate/i)).toBeInTheDocument()`.
  - |
    AC6 - adult price shown. `assert o.adult_price == Decimal("18")`; web: `expect(screen.getByText(/adult/i)).toBeInTheDocument()` with the amount.
  - |
    AC7 - child price shown when known. `assert o.child_price == Decimal("9")`; web: `expect(screen.getByText(/child/i)).toBeInTheDocument()`.
  - |
    AC8 - no child price when unknown.
    ```python
    assert _one(out, "Sunset Sail").child_price is None
    ```
    Web: `expect(screen.queryByText(/child/i)).not.toBeInTheDocument()` for that card.
  - |
    AC9 - offer carried with the option. `assert _one(out, "Sintra Day Trip").offer == "10% off online"`; web: `expect(screen.getByText('10% off online')).toBeInTheDocument()`.
  - |
    AC10 - no interest match is dropped.
    ```python
    out = gather_activities(providers, trip(interests=["skiing"]), RATES)
    assert out.options == []
    ```
  - |
    AC11 - over budget dropped (single adult, budget 100, estimate 150).
    ```python
    out = gather_activities([stub(adult=150)], trip(budget=100, traveller_count=1), RATES)
    assert out.options == []
    ```
  - |
    AC12 - under budget shown (estimate 80).
    ```python
    assert len(gather_activities([stub(adult=80)], trip(budget=100, traveller_count=1), RATES).options) == 1
    ```
  - |
    AC13 - free sight excluded.
    ```python
    assert "Rossio Square" not in {o.title for o in out.options}
    ```
  - |
    AC14 - one-off event excluded.
    ```python
    assert "Midsummer Concert" not in {o.title for o in out.options}
    ```
  - |
    AC15 - differing prices for one activity are merged, each with provider and date.
    ```python
    o = _one(out, "Tile Museum")
    assert len(o.prices) == 2 and len({p.adult_price for p in o.prices}) == 2
    assert all(p.provider and p.fetched_at for p in o.prices)
    ```
    Web: `expect(screen.getAllByTestId('price-entry')).toHaveLength(2)` and each entry contains provider name and date.
  - |
    AC16 - empty state. Router: `assert r.json()["options"] == []`. Web:
    ```tsx
    expect(await screen.findByText(/nothing matches/i)).toBeInTheDocument()
    expect(screen.getByText(/change your interests or budget/i)).toBeInTheDocument()
    ```
  - |
    AC17 - estimate equal to budget is shown (boundary).
    ```python
    assert len(gather_activities([stub(adult=100)], trip(budget=100, traveller_count=1), RATES).options) == 1
    ```
  - |
    Router (test_activity_options_router.py) - 200 for owner with options from two source kinds, 404 for another user, 401 unauthenticated, empty list for a trip with no destination; a provider that raises is skipped.
    ```python
    assert a.get(f"/trips/{tid}/activity-options").status_code == 200
    assert sign_in_as("b@example.com").get(f"/trips/{tid}/activity-options").status_code == 404
    ```
assumptions_or_open_questions:
  - |
    The trip stores only `traveller_count`, not an adult/child split, so every traveller is priced as an adult: group estimate = adult price x traveller count (1 when unset). Child price is displayed for information only. Confirm this is acceptable.
  - |
    Budget is compared with the group estimate converted to the trip currency via `RateSource`. If no rate exists for the option's currency, the option is excluded rather than compared unconverted. A trip with no budget applies no budget filter; a trip with no interests applies no interest filter (as the existing recommendations route does).
  - |
    Free sights and one-off events are identified by the provider's `kind` ("free_sight", "event") in the data, not inferred from price. Real web-search and partner adapters are out of scope; seeded in-memory providers stand in, as for stays.
  - |
    Ranking, shortlist, comparison and booking link are excluded per the story scope; the page lists options in cheapest-group-estimate order only for stable output, not as a ranking feature.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — read-only gather over seeded in-memory providers; no schema, stored data, settings or provisioning change. Safe to roll back by reverting the code.

  ```mermaid
  flowchart TD
    Web[ActivityOptionsPage.tsx]:::touched -->|GET activity-options| Router[routers/activity_options.py]:::touched
    Router --> Deps[routers/deps.py get_activity_providers]:::touched
    Router --> Load[routers/trips.py _load]
    Router --> Gather[attractions/options.py gather_activities]:::touched
    Gather --> Rates[trips/rates.py RateSource]
    Deps --> Seeds[attractions/providers.py]:::touched
    Main[main.py include_router]:::touched --> Router
    classDef touched fill:#f96,color:#000
  ```

  Mirrors `app/stays/options.py` and `routers/stay_options.py`: providers are fetched, failures isolated, then results merged before filtering so one source's price cannot hide another's.
review_focus: |
  IN: gathering, interest and budget filtering, exclusion of free sights and events, price merge, and display of the listed fields. OUT: ranking, shortlist, comparison, booking, real provider adapters. Riskiest areas are the budget boundary (estimate equal to budget must show) with currency conversion, and the merge by title so differing prices are kept per source. Treating all travellers as adults is a deliberate consequence of the trip model having only a traveller count.
