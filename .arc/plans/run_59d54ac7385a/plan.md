summary: |
  Add a ranked Stay shortlist and a side-by-side comparison for one Stay on a Trip. The Trip Planner API gets a pure ranking module (`app/stays/shortlist.py`) that takes the matched properties the stay-options search already merges across providers, scores each on a 40% total price / 40% preference fit / 20% offers blend, lists every budget-fitting stay above every stay over budget, cuts to the top 5, and attaches a short reason per stay. A new `GET /trips/{trip_id}/stays/{stay_id}/shortlist` endpoint exposes it. The web app gets a `StayShortlistPage` that builds the approved prototype: a "Within budget" / "Over budget" grouped list of stay cards (rank badge, reason badge, over-budget badge, total, fit bar, offer chips), a Compare button that opens a grid comparison (skeleton, then one card per stay with lowest price / best fit / most offers badges), and the one-stay state with Compare disabled. Choosing a stay is out of scope (STORY-044), so there is no choose button.
scope:
  - description: |
      Ranking module (pure, no I/O). Signatures:

      ```python
      SHORTLIST_SIZE = 5
      WEIGHTS = {"price": 0.4, "fit": 0.4, "offers": 0.2}

      class ShortlistStay(BaseModel):
          rank: int
          property: Property
          total: Decimal          # lowest offer total for the stay's nights
          currency: str
          fits_budget: bool
          over_budget_by: Decimal # 0 when it fits
          fit: int                # 0-100
          reason: Literal["Best overall", "Best price", "Best match", "Best offers", "Closest to budget"]
          why: str

      class Shortlist(BaseModel):
          place: str
          start_date: date
          end_date: date
          nights: int
          budget: Decimal | None  # total for the whole stay
          currency: str | None
          stays: list[ShortlistStay]

      def rank_properties(properties: list[Property], c: StayCriteria, nights: int) -> list[ShortlistStay]: ...
      def build_shortlist(providers: list[StayProvider], stay: Stay, c: StayCriteria) -> Shortlist: ...
      ```

      Score = 0.4 * price + 0.4 * fit + 0.2 * offers, where price = (hi - total) / (hi - lo) over all matched properties (1.0 when hi == lo), fit = share of the traveller's stated preferences (amenities, stars, location) the property meets, and offers = number of amenities / 5 (the size of the Amenity literal). Sort key is (not fits_budget, -score, name) so budget-fitting stays are always first and ties are stable. Cut to SHORTLIST_SIZE after sorting. Reasons follow the prototype: rank 1 "Best overall", else cheapest "Best price", else highest fit "Best match", else most offers "Best offers", else "Closest to budget", each with a one-line `why` (prototype `rank()` copy).

      `build_shortlist` reuses `match_listings` and `merge_properties` from `app/stays/options.py` but does NOT use `_keeps`: budget, amenities, stars and location are soft preferences here, so a stay over budget is still ranked (below the fitting ones) instead of being filtered out as the options search does.
    files:
      - services/api/app/stays/shortlist.py
    rationale: |
      AC1 to AC3 live in the API so ordering and reasons are tested without a browser and the comparison reuses the same ranked data (AC4). A separate module keeps options.py's search/filter behaviour (STORY-042) unchanged.
  - description: |
      New endpoint beside the options route, same auth/trip-load path (`_load`, `NOT_FOUND`, `get_stay_providers`):

      ```python
      @router.get("/{trip_id}/stays/{stay_id}/shortlist")
      def stay_shortlist(trip_id: str, stay_id: str, property_type: PropertyType = "hotel",
          rooms: int = Query(1, ge=1, le=10), max_price: Decimal | None = Query(None, ge=0),
          location: str = "", amenities: list[Amenity] = Query([]),
          stars: list[Annotated[int, Field(ge=1, le=5)]] = Query([]), widen: bool = False,
          user=..., trips=..., identity=..., providers=...) -> Shortlist: ...
      ```

      The stay budget is `max_price * nights` when `max_price` is given (the options page's per-night budget), else None, in which case every stay fits.
    files:
      - services/api/app/routers/stay_options.py
    rationale: |
      Mirrors the existing stay_options handler so access rules (404 for unknown or not-shared trips, 401 signed out) are identical.
  - description: |
      API client types and fetcher: `ShortlistStay`, `Shortlist` types and `fetchStayShortlist(tripId, stayId, c: StayCriteria)` reusing the existing `stayQuery(c)` helper. Pure helpers in stayOptions.ts: `formatMoney` is reused (always shows currency); add `comparisonMarks(stays)` returning which stays hold the lowest total, highest fit and most offers (design `compared()` badges).
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/stayOptions.ts
    rationale: |
      Keeps view code free of derivation logic so it is unit-testable (AC4 marks).
  - description: |
      New `StayShortlistPage` at route `/trips/:tripId/stays/:stayId/shortlist` (wrapped in RequireAuth like the options route). Built from the prototype screens "Stay shortlist", "Shortlist comparison" and "Shortlist, one stay":

      - Crumbs `Trip / Stays`, `h1` "Shortlist", `role="status"` count line "Top 5 stays, budget fits first" (or "1 stay on your shortlist"), one `.btn-secondary` Compare button with the eye icon (the only action; no `.btn-primary`), muted intro line with place, dates, nights and budget, then `Within budget` and `Over budget` `<section>`s (each `h3`, `.stack` of cards) separated by `hr.divider`. Hide a group heading when it is empty.
      - Stay card: `article.card.stay-card` with `aria-label="{name}, rank {n}"`; row with `.badge-neutral` rank (with sr-only "Rank "), reason badge (`.badge-success` when within budget, else `.badge-neutral`) and a `.badge-warning` with alert icon "{amount} over budget"; `h3` name; `text-sm text-muted` why line; total in `.stay-total` (28px bold) plus "Total price for N nights, X per night"; fit bar (`.fit-label` + `.fit-bar` with `role="img"` and aria-label "Preference fit N percent"); offers as `.chip` list with `role="list"`.
      - Comparison view (page state, back link returns to shortlist): crumbs `Trip / Stays / Shortlist`, `h1` "Compare stays", "Back to shortlist" link with arrow icon, `role="status"` "Comparing N stays", `.compare-grid` (one column on phones, `repeat(auto-fit, minmax(var(--size-grid-min), 1fr))` from 48rem) of `.card.stay-card` per stay: "Rank n of N", name, budget badge, total with "Lowest price" badge, fit bar with "Best fit" badge, "Offers (n)" chips with "Most offers" badge. `aria-busy` and three `.card.sk-card` skeletons while loading. Footnote with the reused STORY-042 info note.
      - One stay: Compare `disabled` with `aria-describedby` pointing at `.alert.alert-info` "Only one stay matches. Comparing needs at least two stays. Relax your filters on the stay options to see more." and a "Back to stay options" link.
      - Empty (no matches): `.empty-state` with one `.btn-primary` link-styled "Back to stay options". Failed fetch: `.alert-danger` with Retry, same copy pattern as StayOptionsPage. Loading: `.skeleton` cards.
      - Footnote "Prices fetched at {time}, for the lowest provider offer. Final price confirmed on provider's site." using the existing `formatFetched`.
    files:
      - apps/web/src/trips/StayShortlistPage.tsx
      - apps/web/src/trips/StayShortlistCard.tsx
      - apps/web/src/trips/StayComparison.tsx
      - apps/web/src/App.tsx
      - apps/web/src/index.css
    rationale: |
      Matches the approved prototype. index.css only gains the classes the prototype defines that the app lacks: `.shortlist-group`, `.stay-card`, `.badges`, `.stay-total`, `.fit-bar`, `.fit-label`, `.metric`, `.compare-grid`, `.compare-head`, `.compare-key`, built from existing tokens. `.crumbs`, `.note`, `.row-between`, `.sk-card` already exist and are reused.
  - description: |
      Entry point: add a "View shortlist" link (`.btn-secondary`, passes the current applied criteria in the link state or query so the shortlist uses the same filters) on StayOptionsPage next to the results count, and keep the existing stays-section link to options unchanged.
    files:
      - apps/web/src/trips/StayOptionsPage.tsx
    rationale: |
      Without an entry point the shortlist is unreachable. Kept to one link; no other change to the options page.
tests:
  - |
    AC1 (write first, fails until shortlist.py exists) — services/api/tests/unit/test_stay_shortlist.py. Three properties, same nights; one cheapest with weak fit, one mid price best fit, one dear with most amenities:
    ```python
    out = rank_properties(props, StayCriteria(property_type="hotel", rooms=1, amenities=["pool", "wifi"]), nights=4)
    assert [s.property.name for s in out] == ["Mid Fit", "Cheap Weak", "Dear Offers"]
    assert [s.rank for s in out] == [1, 2, 3]
    # weights are 40/40/20 and are not swapped: with identical fit and offers the cheaper stay wins
    assert rank_properties([cheap, dear_same_fit], c, 4)[0].property.name == "Cheap"
    ```
  - |
    AC2 — same file. Budget 550 total (max_price=137.5 over 4 nights); an over-budget stay with a much higher score still ranks last:
    ```python
    out = rank_properties(props, StayCriteria(property_type="hotel", rooms=1, max_price=Decimal("137.5")), nights=4)
    flags = [s.fits_budget for s in out]
    assert flags == sorted(flags, reverse=True)          # every True before every False
    assert out[-1].over_budget_by == out[-1].total - Decimal("550")
    assert all(s.over_budget_by == 0 for s in out if s.fits_budget)
    ```
    Router test in test_stay_shortlist_router.py: with `max_price` set, over-budget properties are still returned (not filtered out as in `/options`) and the response lists fitting stays first.
  - |
    AC3 — same file. Every stay carries a non-empty reason and why; reason follows the prototype rules:
    ```python
    assert out[0].reason == "Best overall"
    assert all(s.reason and s.why for s in out)
    assert next(s for s in out[1:] if s.property.name == "Cheap Weak").reason == "Best price"
    ```
    Also: seven matched properties yield `len(out) == 5` after the cut and ranks 1 to 5; `rank_properties([], c, 4) == []`.
  - |
    AC4 data side — test_stay_shortlist_router.py: the response carries what the comparison shows for each stay, with the seeded providers and fixed clock (reuse `_use_fixed_clock` pattern from test_stay_options_router.py):
    ```python
    r = a.get(f"/trips/{tid}/stays/{sid}/shortlist")
    assert r.status_code == 200
    s = r.json()["stays"][0]
    assert {"rank", "total", "fit", "reason", "why", "fits_budget"} <= s.keys()
    assert s["property"]["amenities"] and Decimal(s["total"]) > 0
    ```
    Access: unknown stay 404, other user 404, signed out 401, `?stars=6` 422, as in the options router tests.
  - |
    AC1 to AC3 UI — apps/web/src/trips/StayShortlistPage.test.tsx (vitest + Testing Library, `fetchStayShortlist` mocked like StayOptionsPage.test.tsx). With 3 within and 2 over budget:
    ```tsx
    const fit = within(screen.getByRole('region', { name: 'Within budget' }))
    const over = within(screen.getByRole('region', { name: 'Over budget' }))
    expect(fit.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Hotel Alfama Terrace, rank 1', 'Casa do Miradouro, rank 2', 'Pensão Rossio, rank 3'])
    expect(over.getByText('€286 over budget')).toBeInTheDocument()
    expect(screen.getByText('Best overall')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compare' })).toBeEnabled()
    ```
  - |
    AC4 UI — same file. Compare opens the side-by-side grid with total, offers and fit per stay and the marks:
    ```tsx
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    expect(await screen.findByRole('heading', { name: 'Compare stays' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(screen.getByText('Comparing 5 stays')).toBeInTheDocument()
    expect(screen.getAllByText('Lowest price')).toHaveLength(1)
    expect(screen.getAllByText(/Preference fit/).length).toBeGreaterThanOrEqual(5)
    await user.click(screen.getByRole('link', { name: /Back to shortlist/ }))
    ```
    One-stay state: `expect(screen.getByRole('button', { name: 'Compare' })).toBeDisabled()` and the "Only one stay matches." alert is shown. Loading shows skeletons with `aria-busy="true"`; failed fetch shows the retry alert; empty list shows the empty-state.
  - |
    Pure helper — apps/web/src/trips/stayOptions.test.ts:
    ```ts
    expect(comparisonMarks(stays)).toEqual({ lowestPrice: ['pensao-rossio-baixa'], bestFit: ['hotel-alfama-terrace-alfama'], mostOffers: ['baixa-grand-hotel-baixa'] })
    ```
    Ties mark every tied stay.
assumptions_or_open_questions:
  - |
    Budget source. The prototype budgets "€550 for the stay" but the app has only the Trip budget (whole trip) and the options page's per-night `max_price`. This plan uses `max_price * nights` as the stay budget and treats every stay as fitting when no `max_price` is set. If the reviewer wants a different source (a share of Trip.budget, or a new per-Stay budget field) the endpoint's budget derivation changes and a data change would then be needed.
  - |
    Preference fit. Stays have no stored traveller preference profile beyond the options filters, so fit is the share of the stated amenities, star ratings and location the property meets (100 when none are stated). In the shortlist these are soft preferences, not hard filters as in `/options`; property type and rooms stay hard. The prototype's fixture fits (92, 84, ...) are illustrative.
  - |
    Offers are scored as the property's amenity count out of 5 (the prototype's offer chips are the amenity labels); provider price offers feed the total (lowest offer total) only.
  - |
    Shortlist size is fixed at 5 (the proposed value) in `SHORTLIST_SIZE`; the story says it is undecided, so it is one constant to change.
  - |
    Prototype vs AC. The prototype fakes a 300 ms wait before showing the comparison. The plan shows the skeleton only while data is genuinely loading; since the shortlist is already fetched, opening Compare shows the grid immediately. No AC conflict.
  - |
    Rounding and ties. Fit is rounded to an integer percent; equal scores break by property name so the order is deterministic.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — read-only ranking over provider listings fetched at request time; no stored data, schema, setting or env var changes. Safe to deploy API and web in either order (new endpoint, new route); roll back by reverting.

  ```mermaid
  flowchart TD
    Page[StayShortlistPage.tsx] -->|fetchStayShortlist| Api[api.ts]
    Api -->|GET /trips/id/stays/id/shortlist| Router[routers/stay_options.py]
    Router -->|load trip and stay| Load[routers/trips.py _load]
    Router -->|build_shortlist| Short[stays/shortlist.py]
    Short -->|match_listings, merge_properties| Opts[stays/options.py]
    Opts -->|fetch| Prov[stays/providers.py]
    Options[StayOptionsPage.tsx] -->|View shortlist link| Page
    App[App.tsx] -->|route| Page
    classDef touched fill:#f96,color:#000
    class Page,Api,Router,Short,Options,App touched
  ```

  Touched: shortlist.py (new, ranking and reasons), stay_options.py (new route), api.ts (types and fetcher), StayShortlistPage.tsx (new UI), StayOptionsPage.tsx (entry link), App.tsx (route). options.py and providers.py are reused unchanged.

  Conventions: Python 3.x FastAPI with pytest, web is React + Vite + Tailwind setup with vitest; styling uses the existing global classes and design tokens (no new library). UI follows the guidelines: one secondary action (Compare), `.alert` for problems, `.empty-state` for empty, `.skeleton` while loading, money always with currency via `formatMoney`, phone-first single column and `.grid`-style reflow from 48rem. Domain nouns follow the glossary use in code: Trip, Stay, property, offer.

  The work item text is plain scope and ACs; it contained no instructions outside the change itself.
review_focus: |
  IN: ranking and reasons API, new shortlist endpoint, shortlist and comparison UI, an entry link from the options page. OUT: choosing a stay (STORY-044), changes to `/options` filtering, stored data. Riskiest: the budget source and the fit definition, which are assumptions (see open questions), plus the invariant that every budget-fitting stay precedes every over-budget one even when the cut to 5 happens. The shortlist deliberately does not hard-filter on budget or amenities, unlike `/options`.
