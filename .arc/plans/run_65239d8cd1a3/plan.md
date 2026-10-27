summary: |
  Add travel-insurance comparison to a Trip. The API gains an `app/insurance` package (a provider port with seeded web-search and partner providers, a matcher and a ranker) and three routes: `GET /trips/{id}/insurance-options` (ranked shortlist with each traveller's price, a group total and a one-line reason), `PUT /trips/{id}/insurance` (pick a plan) and `DELETE /trips/{id}/insurance` (remove the pick). The shortlist is ordered only by fit to destination, trip length, each traveller's age and the risky-activities yes/no. Price, offers and provider commission never affect the order. The picked plan is stored on the Trip as a server-owned snapshot taken from the rebuilt shortlist, never from the request. It is added to the trip total in `summarise_cost`. It is cleared when destination, dates or travellers change. The web app gets an Insurance options page, a Compare plans page, and an insurance need row on the trip, plus a total line and a Book trip entry that appear only when a plan is picked, and a "pick cleared" dialog. Booking happens on the provider's site, with no purchase step, and a disclaimer is always shown.

scope:
  - description: |
      Trip data model. Add `InsurancePick` (plan_id, name, provider, url: HttpUrl, total: Decimal, currency) and a server-owned `Trip.insurance: InsurancePick | None = None`.
      The ranking inputs do not exist in the codebase today (a Trip holds only `traveller_count`; a `Traveller` holds a name and companion details). Add minimal optional fields so the feature can read them:
      `TripFields.risky_activities: bool | None = None`, `TripFields.owner_age: int | None` (0-120) and `TravellerFields.age: int | None` (0-120).
      `update_trip` keeps stored values when the body omits these fields, the same way it already keeps `interests`.
      `Traveller.age` is also set by `add_traveller`, and `update_traveller_details` stays unchanged.
      The screens that ask for these answers belong to the Traveller profile epic and are out of scope here.
    files:
      - services/api/app/trips/store.py
    rationale: |
      Every field has a default of None, so documents already in DynamoDB or in the local data file load unchanged (see Data & rollout).

  - description: |
      New package `app/insurance`.
      `options.py` holds the port and the pure logic:
      ```python
      class InsuranceProvider(Protocol):
          name: str
          source: SourceKind  # "web_search" | "partner"
          def fetch(self, destination: str) -> list[ProviderPlan]: ...

      class ProviderPlan(BaseModel):
          plan_id: str; name: str; provider: str
          regions: list[str]            # ["japan"] or ["worldwide"]
          max_days: int; min_age: int; max_age: int
          adventure: Literal["none", "limited", "full"]
          daily_rates: list[AgeRate]    # AgeRate(min_age, max_age, per_day: Decimal)
          currency: str; offer: str | None; commission: Decimal  # commission is stored but never read by ranking
          url: str; fetched_at: datetime

      def gather_insurance(providers, trip, rates) -> InsuranceOptions: ...
      def insurance_travellers(trip) -> list[InsuranceTraveller]: ...  # owner as "You", then each named traveller
      ```
      `InsuranceOptions` carries `place`, `days`, `risky_activities`, `travellers` (label and age), `missing` (what the trip still lacks: risky answer, or an age) and `plans: list[InsurancePlan]`.
      Each `InsurancePlan` has `rank`, `plan_id`, `name`, `provider`, `source`, `fit`, `reason`, `offer`, `traveller_prices: list[{label, age, price}]`, `group_total`, `currency` and `url`.
      Matching drops a plan that does not cover the destination (or "worldwide"), whose `max_days` is below the trip length, or whose age range excludes any traveller. Trip length is inclusive days: `(end - start).days + 1`.
      Fit is the sum of four 0-1 scores (destination, trip length, age, risky activities). The destination score is 1.0 for a named region and 0.5 for worldwide. The length score is `1 - (days - 1) / max_days`, clamped to 0-1. The age score is the mean over travellers of 1.0 when age <= max_age - 10 and 0.5 otherwise. The risky score applies only when risky_activities is yes: full 1.0, limited 0.5, none 0.0. When the answer is no, every plan scores 1.0.
      The sort key is `(-fit, provider, name)` and is the only ordering. `reason` is one plain line built from the plan's cover facts, for example "Covers Japan, trips up to 30 days, ages up to 70, with adventure sports." When fit equals the previous plan's, it adds "Equal fit to X; listed after it by provider name."
      Price per traveller is `per_day` of the rate band holding their age multiplied by the days. The group total is the sum.
      A provider that raises is logged and skipped, as in `app/attractions/options.py`.
      `providers.py` has `InMemoryInsuranceProvider` and `SEED_CATALOGUES` (a web-search source and a partner source, with Japan and Lisbon plans), mirroring `app/attractions/providers.py`.
    files:
      - services/api/app/insurance/__init__.py
      - services/api/app/insurance/options.py
      - services/api/app/insurance/providers.py
    rationale: |
      It follows the existing provider-port pattern, so real web-search and partner adapters can replace the seeds later. Commission lives on the plan model so a test can prove it is ignored.

  - description: |
      Routes in a new router `app/routers/insurance.py`, included in `main.py`.
      `GET /trips/{trip_id}/insurance-options` uses `_load` (owner or accepted editor) and returns `InsuranceOptions`.
      `PUT /trips/{trip_id}/insurance` takes `ChooseInsurance(plan_id: str)` and uses `_editable_trip`. It rebuilds the shortlist, takes the plan's price and URL from it, answers `INVALID_INSURANCE` (422 `invalid_insurance`) for an unknown plan_id, and returns `TripView`.
      `DELETE /trips/{trip_id}/insurance` clears the pick.
      `deps.get_insurance_providers()` returns the seeded providers, in local mode too (no outside call), like `get_activity_providers`.
      A `_save_insurance(trips, rates, user, owner, trip, pick, now)` helper is added next to `_save_stays` in `routers/trips.py`.
    files:
      - services/api/app/routers/insurance.py
      - services/api/app/routers/deps.py
      - services/api/app/routers/trips.py
      - services/api/app/main.py
    rationale: |
      It copies the stays chosen-route shape (rebuild, take price and URL from the rebuild, `_save_*`), so a client cannot set a price or URL.

  - description: |
      Clear the pick when the trip changes. In `routers/trips.py`, `update_trip` sets `insurance = None` when destination, start_date or end_date differs from the stored value. `add_traveller`, `remove_traveller` and a changed `Traveller.age` or `owner_age` set it too. Changes that do not affect cover (a trip name, interests or a companion's citizenship) leave it.
      `revised` in `change_stay` is the existing precedent for clearing a choice when the priced inputs move.
    files:
      - services/api/app/routers/trips.py
    rationale: |
      A price quoted for other dates or travellers must not stay in the total.

  - description: |
      Trip total. In `summarise_cost`, add `trip.insurance.total` (converted with `rates.rate(currency, trip.currency)`) to the total only when `trip.insurance` is set. Handle an unconvertible currency like stays (`unconvertible_count += 1`).
    files:
      - services/api/app/trips/cost.py
    rationale: |
      One place computes the total, so the trip page, the budget and `fare_over_budget_by` all include the pick.

  - description: |
      Web client types and calls in `trips/api.ts`: `InsurancePick`, `InsurancePlan`, `InsuranceOptions`, `Trip.insurance?`, `fetchInsuranceOptions(tripId)`, `chooseInsurance(tripId, planId)` and `clearInsurance(tripId)`.
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      It follows `fetchActivityOptions` and `chooseStay`.

  - description: |
      New `InsuranceOptionsPage` at `/trips/:tripId/insurance-options`, built from the design's "Insurance options" screen.
      - Back to trip link (`text-sm`) and an `h1` "Insurance options".
      - `.alert alert-info` with `role="note"`, an info icon and the text "This app only compares plans. It does not sell or advise on cover." It is always visible.
      - A `text-sm text-muted` line: "Best fit first for {place}, {n} nights, travellers aged …, with/without risky activities. Price, offers and provider commission never change the order. Prices are for N travellers."
      - While loading, three `.card` with `.skeleton` inside a `.stack`. The existing pages show a plain "Loading…" status, but the guidelines and the design use `.skeleton`.
      - A `.stack` with `aria-live="polite"` of plan cards. Each is an `article.card` with an `is-picked` variant (a 2px `--color-primary` border and `--color-primary-subtle` fill). The card has a `badge badge-neutral` reading "Best fit" for rank 1 and "Place n" otherwise, a `badge badge-success` "Picked" with a check icon when picked, an optional `badge badge-neutral` "Offer: …", and an `h3.text-lg` plan name.
      - Below 48rem the card is one column. At 48rem it is a two-column grid, `1fr 18rem`: facts and reason on the left, `price-table` (a row per traveller, `sr-only` thead) plus a `group-total` row ("Group total", bold, top border) on the right.
      - Actions: `btn btn-primary` "Pick plan" (when picked it becomes `btn btn-secondary` "Remove pick", with `aria-pressed`) and `btn btn-secondary` "Go to provider site". There is exactly one `btn-primary` per card section and no purchase or payment control.
      - "Compare plans" is a `btn btn-secondary` shown only when 2 or more plans are listed, and it links to `/trips/:tripId/insurance-options/compare`.
      - Pick and remove show a toast ("Picked. Your trip total and Book trip links now include this plan." / "Pick removed. Your trip total no longer includes insurance.").
      - Provider site: a pure `openProviderSite(url)` helper accepts http(s) only and calls `window.open(url, '_blank')`. When that is blocked, returns null or the URL is not http(s), it shows a `.alert alert-danger` with `role="alert"`, the title "Provider site unavailable" and the text "The provider's site could not be opened. Your plan is still picked." (for an unpicked plan: "The provider's site could not be opened. Try again."). It never calls `clearInsurance`.
      - No plans: `.empty-state` with a search icon, an `h2.text-lg` "No plans suit this trip." and the muted text from the design, followed by the line "Insurance: not yet picked".
      - Missing details (`missing` is non-empty): an `.alert alert-warning` asking the traveller to add the listed ages and the risky-activities answer. This state is not in the design (see open questions).
      - Load failure: an `.alert alert-danger` as in `ActivityOptionsPage`.
    files:
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/trips/InsurancePlanCard.tsx
      - apps/web/src/trips/providerSite.ts
      - apps/web/src/App.tsx
      - apps/web/src/index.css
    rationale: |
      It maps the design's Insurance options, no-plans and provider-failed screens onto the existing page conventions (`ActivityOptionsPage`, `FlightShortlistCard`).

  - description: |
      New `InsuranceComparePage` at `/trips/:tripId/insurance-options/compare`, built from the design's "Compare plans" screen. It shows a Back to shortlist link, an `h1` "Compare plans" and the disclaimer alert repeated.
      It has one `table.cmp` with columns Plan (name and Picked badge), Reason, Traveller prices (a list of `label: money`), Group total (bold) and Provider site (a link that uses the same `openProviderSite`). Plans appear in shortlist order, with no purchase step.
      Below 48rem each row becomes a `.card` (the design's `.cmp td::before { content: attr(data-label) }` pattern), because tables overflow at 375px, as the guidelines require.
      The page refetches the options (no client cache, as in `api.ts`) and is reachable only when 2 or more plans exist. With fewer it redirects to the shortlist.
    files:
      - apps/web/src/trips/InsuranceComparePage.tsx
      - apps/web/src/index.css
    rationale: |
      A table is allowed for price comparison on desktop only, per the guidelines.

  - description: |
      Trip page. `TripDetailPage.tsx` gets an insurance row under the title block: `role="status" aria-live="polite"` text "Insurance: not yet picked" or "Insurance: {name} picked", and a `btn btn-secondary` "Insurance options" link to the options page (owner or editor).
      `TripTotalCard.tsx` takes an optional `insurance` prop and shows an "Insurance: {name}" line with its amount only when picked.
      The "Book trip" button is enabled when there are chosen options or an insurance pick. `BookTripDrawer.tsx` takes `insurance?: InsurancePick` and adds a card "Insurance provider site: {name}" with an "Open booking page" link only when picked. It reuses `bookingHref` for the http(s) check, and the "You book and pay on the provider's site" note stays.
      A new `InsurancePickClearedModal` is an `.modal` alert dialog: title "Insurance pick cleared", text "Trip details changed. Your insurance pick was cleared. Choose an insurance plan again.", and one `btn btn-primary` "OK". It opens from the `saved` handler (the trip settings drawer) and the Travelers tab `onChanged` handler when the previous trip had `insurance` and the updated one has none. The refresh timer does not open it. After OK the need row reads "not yet picked".
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/TripTotalCard.tsx
      - apps/web/src/trips/BookTripDrawer.tsx
      - apps/web/src/trips/InsurancePickClearedModal.tsx
    rationale: |
      It places the design's Trip screen pieces (insurance-row, trip-total, book-trip-links, pick-cleared-modal) into the existing trip page.

tests:
  - |
    AC1 (listing). Failing test first in `services/api/tests/unit/test_insurance_options.py`:
    ```python
    def test_lists_plans_suited_to_the_trip():
        out = gather_insurance([Fake(PLANS)], _trip(dest="Japan", start="2027-03-12", end="2027-03-21", owner_age=34, travellers=[("Marco", 61)], risky=True), RATES)
        assert [p.plan_id for p in out.plans] == ["globetrek", "asia-pacific", "meridian", "pilot"]
        assert out.days == 10 and out.missing == []
    ```
    The matching tests also drop a plan that does not cover Japan, one whose `max_days` is below the trip length, and one whose age range excludes Marco (61).
  - |
    AC2 (fit order). Same file. The plans are returned in descending fit across destination, length, age and risky answer:
    ```python
    def test_orders_by_fit_to_destination_length_age_and_risky_answer():
        yes = gather_insurance([Fake(PLANS)], _trip(risky=True), RATES)
        no = gather_insurance([Fake(PLANS)], _trip(risky=False), RATES)
        assert [p.plan_id for p in yes.plans][0] == "globetrek"      # full adventure cover wins when risky is yes
        assert yes.plans[0].fit > yes.plans[1].fit
        assert [p.plan_id for p in no.plans] != [p.plan_id for p in yes.plans]  # the answer changes the order
    ```
  - |
    AC3 (compare shows all). `apps/web/src/trips/InsuranceComparePage.test.tsx` with 3 plans stubbed:
    ```tsx
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(1 + 3)  // header + every shortlisted plan, in shortlist order
    ```
    Also `InsuranceOptionsPage.test.tsx`: `expect(screen.getByRole('link', { name: 'Compare plans' })).toBeInTheDocument()` with 2 plans, and `queryByRole(... 'Compare plans')` is null with 1 plan.
  - |
    AC4 (pick and follow link). `InsuranceOptionsPage.test.tsx` stubs `window.open` and asserts the provider link:
    ```tsx
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    await user.click(within(card('Globetrek Adventure Plus')).getByRole('button', { name: 'Go to provider site' }))
    expect(open).toHaveBeenCalledWith('https://globetrek.example/adventure-plus', '_blank')
    ```
    Another test checks that Pick plan calls `PUT /trips/t1/insurance` with `{ plan_id: 'globetrek' }` and the card then shows the Picked badge. A router test in `test_insurance_router.py` asserts `r.json()["insurance"]["url"] == "https://globetrek.example/adventure-plus"` and that a client-sent `url` or `total` is ignored.
  - |
    AC5 (no purchase step). `InsuranceOptionsPage.test.tsx` and the compare page test:
    ```tsx
    expect(screen.queryByRole('button', { name: /buy|purchase|pay|checkout|book now/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /buy|purchase|pay|checkout/i })).toBeNull()
    ```
  - |
    AC6 (disclaimer). Both page tests:
    ```tsx
    expect(screen.getByRole('note')).toHaveTextContent('This app only compares plans. It does not sell or advise on cover.')
    ```
  - |
    AC7 (total includes the pick). `services/api/tests/unit/test_insurance_router.py` and the cost tests:
    ```python
    before = a.get(f"/trips/{tid}").json()["cost"]["total"]
    r = a.put(f"/trips/{tid}/insurance", json={"plan_id": "globetrek"})
    assert r.json()["cost"]["total"] == pytest.approx(before + 109.6)  # 38.4 + 71.2 over the stay length, converted
    ```
    A foreign-currency pick is converted with the trip's rates. An unconvertible pick adds 1 to `unconvertible_count` and nothing to the total. Web: `TripTotalCard.test.tsx` expects the "Insurance: Globetrek Adventure Plus" line when `insurance` is passed.
  - |
    AC8 (no pick, no amount). `test_insurance_router.py`:
    ```python
    assert a.get(f"/trips/{tid}").json()["cost"]["total"] == before
    assert a.get(f"/trips/{tid}").json()["insurance"] is None
    ```
    After `DELETE /trips/{tid}/insurance` the total returns to `before`. Web: `expect(screen.queryByText(/^Insurance:/)).toBeNull()` inside the total card when there is no pick.
  - |
    AC9 (Book trip links). `BookTripDrawer.test.tsx`:
    ```tsx
    render(<BookTripDrawer options={[]} insurance={pick} onClose={() => {}} />)
    const link = within(screen.getByText(/Insurance provider site: Globetrek/).closest('li')!).getByRole('link', { name: /Open booking page/ })
    expect(link).toHaveAttribute('href', pick.url)
    ```
    Without `insurance` there is no such entry. In the trip page test the Book trip button is enabled with only an insurance pick.
  - |
    AC10 (failure message). `InsuranceOptionsPage.test.tsx`:
    ```tsx
    vi.spyOn(window, 'open').mockReturnValue(null)
    await user.click(providerButton)
    expect(await screen.findByRole('alert')).toHaveTextContent("The provider's site could not be opened.")
    ```
    The helper test in `providerSite.test.ts` covers a non-http(s) URL (`javascript:alert(1)`), which is refused and never opened.
  - |
    AC11 (pick remains after failure). The same test continues:
    ```tsx
    expect(stub.calls).not.toContain('DELETE /trips/t1/insurance')
    expect(within(card('Globetrek Adventure Plus')).getByText('Picked')).toBeVisible()
    ```
  - |
    AC12 (change clears the pick). `test_insurance_router.py`, parametrised over the four changes:
    ```python
    @pytest.mark.parametrize("change", [change_destination, change_dates, add_traveller, remove_traveller])
    def test_changing_the_trip_clears_the_pick(sign_in_as, change):
        ...
        assert change(a, tid).json()["insurance"] is None
    ```
    A name-only edit keeps the pick. The total drops the insurance amount after the clear.
  - |
    AC13 (asked to choose again). `InsuranceTripFlow.test.tsx` (trip page). Saving a changed destination on a trip that had a pick:
    ```tsx
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Trip details changed. Your insurance pick was cleared. Choose an insurance plan again.')
    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Insurance: not yet picked')
    ```
    A save that does not clear a pick (no pick before) opens no dialog.
  - |
    AC14 (each traveller's price). `test_insurance_options.py`:
    ```python
    assert [(t.label, t.price) for t in plan.traveller_prices] == [("You", Decimal("384.0")), ("Marco", Decimal("712.0"))]
    ```
    Web: each card's price table has a row per traveller, `within(card).getByRole('row', { name: /Marco/ })`.
  - |
    AC15 (group total). `assert plan.group_total == sum(t.price for t in plan.traveller_prices)` in the API test. Web: `within(card).getByText(/Group total/)` next to the summed amount.
  - |
    AC16 (price and offers do not reorder). `test_insurance_options.py`:
    ```python
    def test_equal_fit_is_not_reordered_by_price_or_offer():
        cheap = _plan("b-plan", provider="B", per_day=1, offer="50% off")
        dear = _plan("a-plan", provider="A", per_day=900, offer=None)
        assert [p.plan_id for p in gather_insurance([Fake([cheap, dear])], TRIP, RATES).plans] == ["a-plan", "b-plan"]  # provider-name tie-break
        # changing only price/offer leaves the order unchanged
        assert _order(per_day=(900, 1), offers=(None, "50% off")) == _order(per_day=(1, 900), offers=("50% off", None))
    ```
  - |
    AC17 (no plans). `test_insurance_options.py` asserts `gather_insurance(...).plans == []` when no plan matches, and the router test asserts a 200 with `plans == []` and `missing == []`. Web:
    ```tsx
    expect(await screen.findByText('No plans suit this trip.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).toBeNull()
    ```
  - |
    AC18 (need shown as not yet picked). `InsuranceOptionsPage.test.tsx` expects "Insurance: not yet picked" under the no-plans empty state. `InsuranceTripFlow.test.tsx` expects the trip page need row to read "Insurance: not yet picked" with no pick and "Insurance: Globetrek Adventure Plus picked" after one.
  - |
    AC19 (one-line reason). `test_insurance_options.py`:
    ```python
    assert all(p.reason and "\n" not in p.reason for p in out.plans)
    assert out.plans[0].reason == "Covers Japan, trips up to 30 days, ages up to 70, with adventure sports."
    ```
    Web: each card shows its `plan-reason` text and its place badge ("Best fit", "Place 2").
  - |
    AC20 (commission does not reorder). `test_insurance_options.py`:
    ```python
    def test_commission_never_changes_the_order():
        lo = _plan("x", provider="A", commission=Decimal("0")); hi = _plan("y", provider="B", commission=Decimal("99"))
        assert _ids([lo, hi]) == _ids([lo.model_copy(update={"commission": Decimal("99")}), hi.model_copy(update={"commission": Decimal("0")})])
    ```
    The response model is also asserted to carry no `commission` field.
  - |
    Missing details (not an AC, guards a crash). `gather_insurance` on a trip with no owner age, no risky answer or fewer described travellers than `traveller_count` returns `plans == []` and `missing` naming each gap. It does not raise.
  - |
    Existing data. `Trip.model_validate` of a stored document that has none of the new keys, and `DynamoTripStore._to_trip` on such an item (with the fake table already used in the store contract tests), both give `insurance is None`, `risky_activities is None` and `owner_age is None`, and the trip is still readable and editable.
  - |
    Verification commands: `cd services/api && uv run pytest tests/unit -q` and `cd apps/web && pnpm vitest run && pnpm tsc --noEmit`.

assumptions_or_open_questions:
  - |
    Ranking inputs do not exist yet. Today a Trip stores only `traveller_count`, named travellers have no age, the owner has no age and nothing stores a risky-activities answer. The item says the yes/no question is a new New trip set-up question owned by the Traveller profile epic. This plan adds only optional storage fields (`owner_age`, `Traveller.age`, `risky_activities`) and API acceptance for them, and does NOT build the set-up or traveller-form UI to ask for them. Until that epic lands the options page shows the "add ages and the risky answer" warning. Should the plan also add minimal inputs to New trip set-up and the Travelers tab? If so, estimated_points should go up.
  - |
    The scoring formulas (destination 1.0 / 0.5 worldwide, length `1 - (days - 1)/max_days`, age 1.0 / 0.5 within 10 years of the limit, risky full / limited / none) are my own and are not in the item or the design. The design's four plans are consistent with fit-then-provider-name ordering but do not fix the numbers. Please confirm or replace them. The tests pin whatever is agreed.
  - |
    Trip length is inclusive days (12-21 Mar is 10 days), and plans are priced per day. The design says "9 nights" and shows prices without a day count. Plans are priced for the full inclusive span.
  - |
    Prototype vs existing app. (1) The design's Trip screen shows "Book trip" as a card of links, but the app uses `BookTripDrawer` from a button, so the insurance entry goes into the drawer. (2) The design's trip total lists breakdown lines (flights, accommodation, activities); the app's `TripTotalCard` shows one total, so only the insurance line is added, and only when picked. (3) The design formats money with `Intl` currency symbols; the app's `formatMoney` writes "amount CODE", which also meets the guideline that money always carries its currency. I follow the app. (4) The design's Provider-failed screen is a separate screen; here the alert shows inline on the options page, with the plan still marked Picked.
  - |
    "Provider's booking link fails to open" is detected in the browser: `window.open` returning null, or a non-http(s) URL. A site that opens but returns an error cannot be detected from the app.
  - |
    Insurance pick is allowed for owner and accepted editors (like stays and transport). Clearing on change happens for any actor that makes a clearing change; `add_traveller`, `remove_traveller` and `update_trip` are owner-only today.
  - |
    Seeded providers stand in for the real web search and partner APIs, as the stays, flights and activities features do. No real outside call or new setting is added.
  - |
    No new design is authored; the existing approved prototype is built as-is. No instruction in the work item asked for anything outside the change itself.

estimated_points: 8

package_dependencies: []

notes: |
  ### Data & rollout

  - **Existing data**: `Trip` gains four optional fields (`insurance`, `risky_activities`, `owner_age`, and `age` on each `Traveller`), all defaulting to `None`. There is no migration. Trip documents already in DynamoDB or in the local data file lack the keys and load through pydantic defaults. `DynamoTripStore.save_trip` already drops `None` values, so rows are written without the keys until set. A `Decimal` total is stored via `model_dump(mode="json")`, which writes it as a string and reads back to `Decimal`, the same way `ChosenStay.total` works.
  - **Backfill / seed**: none. Old trips show "Insurance: not yet picked" and, until ages and the risky answer exist, the missing-details warning. The seeded insurance catalogue is in code and needs no data seed.
  - **Settings**: none. No env var or config file changes.
  - **Provisioning**: nothing to create. No table, queue or bucket.
  - **Order and rollback**: deploy API and web together or API first. The new fields are optional, so an older web build simply ignores them. Rolling back the API leaves the extra keys in stored trips; the old `Trip` model ignores unknown keys (pydantic default), so it is safe to leave in place.

  ### Shape of the change

  ```mermaid
  flowchart TD
    Web[web: InsuranceOptionsPage and InsuranceComparePage] -->|GET options, PUT/DELETE pick| R[routers/insurance.py]
    TripPage[web: TripDetailPage, TripTotalCard, BookTripDrawer] -->|GET trip, shows pick| RT[routers/trips.py]
    R --> Opt[insurance/options.py]
    Opt --> Prov[insurance/providers.py]
    R --> Deps[routers/deps.py]
    R --> RT
    RT --> Cost[trips/cost.py]
    RT --> Store[trips/store.py]
    R --> Store
    Main[main.py] --> R
    classDef touched fill:#f96,color:#000
    class Web,TripPage,R,Opt,Prov,Deps,RT,Cost,Store,Main touched
  ```

  Everything in the diagram exists today except `routers/insurance.py`, `insurance/options.py`, `insurance/providers.py`, the two new pages and the modal; all of those are touched, since the untouched context (identity, rates, the other providers) is only called, not changed. `routers/trips.py` is touched twice: `_save_insurance`, and clearing the pick in `update_trip`, `add_traveller` and `remove_traveller`.

  ### Why it follows the stays and activities code

  `choose_stay` rebuilds the shortlist and takes the price and URL from it, so the client never supplies money. The insurance PUT does the same. Plans come through a provider port with seeded in-memory providers, as `app/attractions` does. Ranking is a pure function so each ranking rule (AC2, 16, 19, 20) is a plain unit test with fake providers.

  ### TDD order

  1. API unit tests for `gather_insurance` (AC1, 2, 14-17, 19, 20, missing details). Then `app/insurance`.
  2. API router tests (AC4, 7, 8, 12, existing data). Then store fields, routes, `summarise_cost`, clear-on-change, deps and `main.py`.
  3. Web tests for `api.ts` types, the options page (AC3-6, 10, 11, 17-19), the compare page, the trip page, total card, drawer and modal (AC7-9, 13). Then the components, in the same order.

review_focus: |
  IN scope: the insurance port, matching and ranking, three routes, the pick stored on the Trip, the trip total, Book trip entry, clear-on-change, and the web options, compare and trip-page pieces built from the approved prototype. OUT of scope: the New trip set-up question and the Traveller profile screens that collect ages and the risky-activities answer (only optional storage fields are added), real web-search or partner adapters, and any purchase or payment step. Riskiest areas are the ranking (no path may let price, offers or commission affect order), the pick-clear rules in `routers/trips.py` (clear only on destination, dates or travellers, not on name or interest edits), and the total in `summarise_cost`. The scoring formulas and inclusive day count are deliberate placeholders awaiting confirmation (see open questions), and the prototype-vs-app differences are listed there too.
