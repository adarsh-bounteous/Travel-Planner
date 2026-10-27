summary: |
  Add a Compare view and a ranked Shortlist view for the restaurants that already match a trip (story 025's
  `gather_restaurants`). The API gets one new read-only route, `GET /trips/{trip_id}/restaurant-shortlist`, that
  returns every matching restaurant ranked: budget-fitting first, then more of the traveller's other
  preferences met, then lower price. The web app gets one page with two tabs (Compare | Shortlist) built to the approved
  prototype: a side-by-side `.grid` of cards showing cuisine, dining style and typical price per person; a
  "Nothing to compare" `.empty-state` (and no grid) when fewer than 2 restaurants match; and a shortlist of
  entry cards with a budget `.badge`, a one-sentence reason, Remove (with a toast Undo) and Choose. Choose exists
  only on shortlist entries, so only shortlisted restaurants can be chosen. Persisting the pick and costing it is the next story and is out of scope.
scope:
  - description: |
      Pure ranking module for the shortlist. Signatures:

      ```python
      DINING_SHARE = Decimal("0.25")  # share of the trip budget set aside for restaurant meals

      class ShortlistEntry(BaseModel):
          rank: int
          restaurant: RestaurantOption
          fits_budget: bool
          preferences_met: list[str]   # labels, e.g. "Portuguese cuisine"
          preferences_total: int

      class RestaurantShortlist(BaseModel):
          place: str
          budget_per_person: Decimal | None   # None when the trip has no usable budget
          currency: str | None                # the trip currency the budget is in
          entries: list[ShortlistEntry]

      def budget_per_person(trip: Trip) -> Decimal | None: ...
      def preference_labels(filters: DiningFilters, tastes: list[str]) -> list[str]: ...
      def build_shortlist(options: RestaurantOptions, trip: Trip, filters: DiningFilters, tastes: list[str]) -> RestaurantShortlist: ...
      ```

      Rules: every option in `options` becomes an entry (no cut-off). Sort key is
      `(not fits_budget, -len(preferences_met), typical_price, name)`. A restaurant fits when its
      currency equals the trip currency and `typical_price <= budget_per_person`, or when there is no budget.
      A restaurant in a different currency than the trip counts as fitting (cannot be compared without rates).
    files:
      - services/api/app/dining/shortlist.py
    rationale: |
      Mirrors `app/stays/shortlist.py` (pure rank function, Pydantic result models, budget-fitting first)
      and reuses `RestaurantOption`/`DiningFilters` from `app/dining/options.py` untouched, so "matching" means exactly what
      story 025 shows (AC7).
  - description: |
      Add the route next to the existing options route and reuse its filter building so the shortlist is built from the same
      matches (owner's profile plus the trip's dining needs, even when an editor is viewing):

      ```python
      @router.get("/{trip_id}/restaurant-shortlist")
      def restaurant_shortlist(trip_id: str, user=Depends(get_current_user), trips=Depends(get_trips),
                               identity=Depends(get_identity), profiles=Depends(get_profiles),
                               providers=Depends(get_restaurant_providers)) -> RestaurantShortlist
      ```

      Extract the shared "load trip, owner profile, filters, gather" lines into a small private helper used by both routes.
    files:
      - services/api/app/routers/restaurant_options.py
    rationale: Read-only, so no store or schema change. Same access rules as `restaurant-options` (401 signed out, 404 for a stranger, editors may read).
  - description: |
      Client types and fetcher: `RestaurantShortlist`, `ShortlistEntry` types and
      `fetchRestaurantShortlist(tripId)` calling `/trips/{id}/restaurant-shortlist`. New pure helpers
      `shortlistReason(entry, budget, currency)` (the one-sentence reason: typical price, within or over the
      budget, and "Meets N of M preferences: ..." or nothing about preferences when M is 0) and
      `canCompare(entries)` (length >= 2), using `formatMoney` from `stayOptions.ts` so money always shows its currency.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/restaurantShortlist.ts
    rationale: Keeps wording and the compare rule unit-testable apart from the React tree, as `stayOptions.ts` does for stays.
  - description: |
      One page, route `/trips/:tripId/restaurant-options/:view` (`compare` or `shortlist`; an unknown view
      redirects to `shortlist`). Tabs are `Link`s styled `.tab` inside `.tabs[role=tablist]` ("Restaurant views")
      so switching only changes the param and the component stays mounted, which keeps the removed set and the
      chosen id across tabs. Built from the prototype:
      - Breadcrumb Trip / Restaurants / Compare|Shortlist; loading `.skeleton` cards; failed `.alert alert-danger` with Retry.
      - Compare (prototype "Compare restaurants"): `.grid` of `.card.compare-card`, each with name `h3`, and
        "Cuisine:", "Dining style:", "Typical price per person:" lines (price bold, with currency). It lists all matches, including ones removed from the shortlist.
      - Fewer than 2 matches (prototype "Compare restaurants (fewer than 2 matches)"): `.empty-state role=status` with the
        search icon, h2 "Nothing to compare", the text "This trip has fewer than 2 matching restaurants. Check the shortlist, or relax a filter to find more.", one `.btn-primary` "Back to restaurant options"; the grid is not rendered.
      - Shortlist (prototype "Shortlist"): intro "Ranked for your budget of X per person ..." (omit the budget wording when none), a `.stack` of
        `.card.entry` with name, `.badge-success` "Within budget" (check icon) or `.badge-warning` "Over budget" (alert icon), the reason,
        `.btn-ghost` Remove and `.btn-primary` Choose (`aria-pressed`, "Chosen" with check icon, `.is-chosen` border). Remove shows a toast with Undo. Choose toggles and shows a toast.
        Removing all shows the `.empty-state` "Your shortlist is empty" with `.btn-primary` "Restore shortlist"; a `role=status` count line "N restaurants on your shortlist".
      - Remove and Choose buttons carry `aria-label` with the restaurant name, as in the prototype. Removing the chosen entry clears the choice.
    files:
      - apps/web/src/trips/RestaurantShortlistPage.tsx
      - apps/web/src/trips/RestaurantCompare.tsx
      - apps/web/src/trips/RestaurantShortlistEntry.tsx
      - apps/web/src/App.tsx
    rationale: |
      Follows the existing page/test pairing (`StayShortlistPage`, `InsuranceComparePage`) and the `RequireAuth` wrapping rule in App.tsx.
      The route is nested under the existing `restaurant-options` path; the existing exact route stays first-match for the list page.
  - description: |
      On the options page add the prototype's action row under the heading: `.btn-secondary` "Compare matches" (links to `.../restaurant-options/compare`)
      and `.btn-primary` "View shortlist" (links to `.../restaurant-options/shortlist`), shown only when there are matches. Options cards stay free of a Choose button (prototype note).
      Add the few styles the prototype defines that are not in index.css yet (`.entry`, `.entry.is-chosen`, `.row-end`, `.fact-label`, `.badge .icon`), built only from tokens; reuse `.compare-grid`, `.shortlist-group` and `.tabs a.tab` where they already exist.
    files:
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/index.css
    rationale: The entry point from the prototype's "Restaurant options (entry point)" screen.
tests:
  - |
    AC7 every match is on the shortlist. services/api/tests/unit/test_restaurant_shortlist.py (write first, fails on import):
    ```python
    def test_every_matching_restaurant_is_an_entry():
        options = RestaurantOptions(place="Lisbon", options=[_r("A", 10), _r("B", 90), _r("C", 20)])
        out = build_shortlist(options, _trip(budget=700), DiningFilters(), [])
        assert sorted(e.restaurant.name for e in out.entries) == ["A", "B", "C"]
    ```
  - |
    AC2 budget-fitting before non-fitting (budget 700, 2 travellers, 7 days gives 12.5 per person).
    ```python
    def test_fitting_restaurants_come_first():
        out = build_shortlist(options_of(("Pricey", 68), ("Cheap", 10)), _trip(budget=700, travellers=2, days=7), DiningFilters(), [])
        assert [e.restaurant.name for e in out.entries] == ["Cheap", "Pricey"]
        assert [e.fits_budget for e in out.entries] == [True, False]
        assert [e.rank for e in out.entries] == [1, 2]
    ```
  - |
    AC6 within the same budget group, more preferences met first; then lower price.
    ```python
    def test_more_preferences_met_first_within_a_group():
        f = DiningFilters(home_cuisine="Portuguese")
        out = build_shortlist(options_of(("Zaytoon", 10, "Lebanese"), ("Casa", 12, "Portuguese")), _trip(budget=None), f, [])
        assert [e.restaurant.name for e in out.entries] == ["Casa", "Zaytoon"]
        assert out.entries[0].preferences_met == ["Portuguese cuisine"]
    ```
    plus a test that when both fit and met counts tie, the cheaper restaurant is first, and a mirrored case where both do not fit.
  - |
    Budget derivation and missing budget: `budget_per_person(_trip(budget=700, travellers=2, days=7))` equals `Decimal("12.50")`; with `budget=None` it is `None` and every entry has `fits_budget is True`.
    A restaurant priced in another currency than the trip counts as fitting.
  - |
    AC1/AC5 router returns what the compare grid needs. services/api/tests/unit/test_restaurant_shortlist_router.py:
    ```python
    body = a.get(f"/trips/{tid}/restaurant-shortlist").json()
    assert len(body["entries"]) >= 2
    r = body["entries"][0]["restaurant"]
    assert {"cuisine", "dining_style", "typical_price", "currency"} <= r.keys()
    ```
    and the shortlist names equal the `restaurant-options` names for the same trip (AC7 end to end).
  - |
    Router access rules, same as the options route: signed out is 401, another user's trip is 404, an editor gets 200, and the profile and dining-needs filters change the entries
    (`assert all("gluten-free" in e["restaurant"]["suits"] for e in body["entries"])` after `PUT dining-needs`). A trip with no matches returns `entries == []`.
  - |
    AC1 and AC5 UI. apps/web/src/trips/RestaurantShortlistPage.test.tsx, mocking `fetch` as `RestaurantOptionsPage.test.tsx` does:
    ```tsx
    renderAt('/trips/t1/restaurant-options/compare')
    expect(await screen.findAllByRole('article')).toHaveLength(5)
    const casa = screen.getByRole('article', { name: 'Casa Lima' })
    expect(within(casa).getByText('Cuisine:')).toBeInTheDocument()
    expect(within(casa).getByText(/Dining style:/)).toBeInTheDocument()
    expect(within(casa).getByText(/Typical price per person:/)).toBeInTheDocument()
    ```
  - |
    AC9 and AC10 UI, with 1 entry (and again with 0):
    ```tsx
    expect(await screen.findByRole('heading', { name: 'Nothing to compare' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('fewer than 2 matching restaurants')
    expect(screen.queryByTestId('comparison')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('article')).toHaveLength(0)
    ```
  - |
    AC2 and AC3 UI: entries render in the API's order with the right badge, and each one shows a reason.
    ```tsx
    const entries = await screen.findAllByRole('article')
    expect(within(entries[0]).getByText('Within budget')).toBeInTheDocument()
    expect(within(entries.at(-1)!).getByText('Over budget')).toBeInTheDocument()
    entries.forEach((e) => expect(within(e).getByText(/per person, (within|over) your/)).toBeInTheDocument())
    ```
    Plus unit tests in `restaurantShortlist.test.ts` for `shortlistReason` (with preferences, with none, with no budget) and `canCompare`.
  - |
    AC8 UI: Remove drops the entry, shows a toast with Undo, Undo restores it, and removing all shows "Your shortlist is empty" with Restore shortlist.
    ```tsx
    await user.click(screen.getByRole('button', { name: 'Remove Casa Lima from shortlist' }))
    expect(screen.queryByRole('article', { name: 'Casa Lima' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('article', { name: 'Casa Lima' })).toBeInTheDocument()
    ```
  - |
    AC4 UI: Choose is offered only on shortlist entries, and a removed restaurant cannot be chosen.
    ```tsx
    expect(screen.getAllByRole('button', { name: /^Choose / })).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Remove Peixe Grill from shortlist' }))
    expect(screen.queryByRole('button', { name: 'Choose Peixe Grill' })).not.toBeInTheDocument()
    ```
    and on the Compare tab and on the options page `expect(screen.queryByRole('button', { name: /^Choose / })).not.toBeInTheDocument()`.
  - |
    Options page entry point (extend RestaurantOptionsPage.test.tsx): with matches, "Compare matches" and "View shortlist" links point to `/trips/t1/restaurant-options/compare` and `/shortlist`; with an empty result neither shows.
  - |
    Playwright: one e2e under the web app's existing e2e folder (matching how other trip pages are covered) that opens a Lisbon trip's options, goes to Compare, then Shortlist, removes one entry and checks it is gone. Run the unit suites with `cd services/api && pytest tests/unit/test_restaurant_shortlist.py tests/unit/test_restaurant_shortlist_router.py` and `cd apps/web && pnpm vitest run src/trips`.
assumptions_or_open_questions:
  - |
    OPEN QUESTION (most important). The data model has no per-person restaurant budget: `Trip.budget` is one total for the whole trip, and the profile `price_level` already works as a hard filter in story 025, so every match fits it. To give "budget-fitting vs not" (AC2) a meaning I derive
    `budget_per_person = trip.budget * 0.25 / (traveller_count or 1) / trip_days` (one restaurant meal per person per day, a quarter of the trip budget for dining). The 0.25 share and the one-meal-a-day rule are my assumption and live in one constant. Please confirm or give the real rule.
  - |
    Preferences for "the traveller's other preferences" (AC6). Dining style and price level are already hard filters, so they cannot rank anything. I count as preferences: the home-country cuisine from the profile's residence (label "Portuguese cuisine") and each of the profile's `tastes` that equals the restaurant's cuisine or dining style (case-insensitive). If a traveller has none, every restaurant meets 0 and ranking falls to price. Confirm, or name other signals.
  - |
    The prototype's example preferences (casual dining, gluten-free options) are filters in the real data, so they are not counted. This differs from the prototype's ranking wording only in which preferences are listed, not in the ranking rule.
  - |
    Remove and Choose are page state only (kept while the traveller moves between tabs, lost on reload), as in the prototype. Storing the pick and its cost is the next story, and AC8 only requires that a removed restaurant no longer appears. If removals should persist across visits, that needs a stored field and is a follow-up.
  - |
    The Compare tab shows all matching restaurants even if some were removed from the shortlist (the prototype's compare grid uses all matches). AC1 and AC7 read this way.
  - |
    The prototype's top bar, footer and reviewer bar are the existing app shell or arc tooling and are not rebuilt. The prototype has no loading or failed state, so those use the existing skeleton and alert patterns from the stay shortlist page.
  - |
    No conflict found between the prototype and the acceptance criteria. The prototype's page title is a breadcrumb, with no h1 on these screens; the plan keeps an h1 ("Restaurant shortlist" or "Compare restaurants") for accessibility, as other pages do.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — the shortlist is computed on every read from the existing restaurant matches, trip and profile. No schema, stored data, seed, setting or env var changes, nothing to provision, and rollback is deleting the new route and page.

  The work item's text was treated as the change to plan. It contained no embedded instructions to act on.

  Why this shape: `app/stays/shortlist.py` and `StayShortlistPage` are the closest precedent (budget-fitting first, reason per entry, compare when 2 or more). Unlike stays, the restaurant shortlist is not cut to the top N, because AC7 says every match is on it.
  Remove and Choose are client-side, since choosing is persisted in the next story.

  ```mermaid
  flowchart TD
    options[dining/options.py gather_restaurants] --> router[routers/restaurant_options.py]
    shortlist[dining/shortlist.py] --> router
    router --> api[trips/api.ts fetchRestaurantShortlist]
    api --> page[RestaurantShortlistPage.tsx]
    page --> compare[RestaurantCompare.tsx]
    page --> entry[RestaurantShortlistEntry.tsx]
    optionspage[RestaurantOptionsPage.tsx] -->|links to| page
    app[App.tsx route] --> page
    classDef touched fill:#f96,color:#000
    class shortlist,router,api,page,compare,entry,optionspage,app touched
  ```

  `dining/shortlist.py` is new: it ranks the output of `gather_restaurants` without changing it. `restaurant_options.py` gains the route and a shared helper. `RestaurantOptionsPage.tsx` gains the entry-point links. `index.css` gains the few missing prototype styles.
review_focus: |
  IN: the new `restaurant-shortlist` read route, the pure ranking module, the Compare and Shortlist tabs with Remove and Choose as page state, and the entry links on the options page. OUT: persisting a pick, costing, reservation links beyond what story 025 shows, and any change to how matches are found.
  Riskiest part: the budget-fit rule. Trip data has only a whole-trip budget, so the per-person figure is derived from an assumed 25% dining share, and the soft-preference definition is also an assumption. Both are flagged as open questions and are deliberate, not oversights.
  Choose appearing only on shortlist entries is how AC4 is met, and the Compare tab intentionally lists every match even after a removal.
