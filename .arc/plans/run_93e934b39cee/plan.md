summary: |
  Add SIM / eSIM options for a trip. The API gathers options from web-search and partner providers (a new `SimProvider` port, seeded in-memory adapters like the activity and stay providers), keeps only options whose coverage includes the trip destination's country and whose validity covers the trip start to end dates, ranks them (SIM-type preference first only when set on the profile, then coverage breadth, data allowance high first, price low first), and prices each option per traveller and for the group. A traveller can pick one option (stored on the Trip as a server-owned `sim` snapshot) and open its booking link. The pick adds to the trip total (`summarise_cost`) and to the Book trip links. If the trip dates later change so the pick no longer covers them, it stays marked Picked and the page shows a warning asking the traveller to pick again. The web app gets a SIM options page built to the approved prototype, an entry button on the trip page, a SIM line in the costs list, and a SIM entry in the Book trip drawer. The profile gets an optional `sim_preference` field (API model and web type only; the profile editing UI belongs to the Traveller profile epic).

scope:
  - description: |
      Domain module for SIM options. `app/sims/options.py` defines the provider port, the gathering and ranking, and the response models.

      ```python
      SimType = Literal["esim", "physical"]
      SourceKind = Literal["web_search", "partner"]

      class ProviderSim(BaseModel):
          name: str
          sim_type: SimType
          countries: list[str]          # coverage, country names as in destination_info
          valid_from: date
          valid_to: date
          data_gb: Decimal
          price: Decimal                # per traveller, whole currency units
          currency: str
          url: str

      class SimProvider(Protocol):
          name: str
          source: SourceKind
          def fetch(self, country: str) -> list[ProviderSim]: ...

      class SimOption(BaseModel):
          id: str; name: str; provider: str; source: SourceKind; sim_type: SimType
          countries: list[str]; coverage_count: int; valid_from: date; valid_to: date
          data_gb: Decimal; price: Decimal; currency: str
          traveller_prices: list[TravellerPrice]   # label + price, one per traveller
          group_total: Decimal; url: str

      def gather_sims(providers, trip, travellers: list[str], preference: SimType | None, rates) -> SimOptions
      def covers_trip(sim_from: date, sim_to: date, trip: Trip) -> bool
      ```

      Rules. The destination country comes from `country_for(trip.destination)`. An option is dropped when its countries lack that country or when `valid_from > trip.start_date` or `valid_to < trip.end_date`. A provider that raises is logged and skipped (same as stays and activities). The sort key is `(type_rank, -coverage_count, -data_gb, price_in_trip_currency, id)`, where `type_rank` is 0 for every option when the preference is None, else 0 for the preferred type and 1 for the other. A price in a currency the rate source cannot convert sorts last within its group. Traveller labels are built by the router: the owner's profile `display_name` or "You", then `trip.travellers` names, then "Traveller N" up to `trip.traveller_count`.
    files:
      - services/api/app/sims/__init__.py
      - services/api/app/sims/options.py
    rationale: |
      Mirrors `app/attractions/options.py` (port plus pure gather function), so ACs 1-6, 8-10, 13, 18 and 19 are testable without HTTP.

  - description: |
      Seeded in-memory providers: `InMemorySimProvider(name, source, catalogue)` plus `SEED_CATALOGUES` with at least one `web_search` and one `partner` provider carrying Portugal, Iberia, Europe-wide, eSIM and physical entries, and entries that fail coverage or dates (so the filters have something to remove). Add a public `country_for(destination)` to `app/trips/destination_info.py`, wrapping the existing private `_country`, so the same free-text destination handling is reused.
    files:
      - services/api/app/sims/providers.py
      - services/api/app/trips/destination_info.py
    rationale: |
      Same shape as `app/attractions/providers.py`. No real web-search or partner adapter is chosen yet (see assumptions), so the seeded one is the default in every mode, as `get_activity_providers` already does.

  - description: |
      Trip store. Add `ChosenSim` and `Trip.sim`.

      ```python
      class ChosenSim(BaseModel):
          option_id: str
          name: str
          provider: str
          sim_type: Literal["esim", "physical"]
          valid_from: date
          valid_to: date
          data_gb: Decimal
          price: Decimal            # per traveller
          currency: str
          url: HttpUrl

      class Trip(TripFields):
          ...
          sim: ChosenSim | None = None  # server-owned: changed only through the SIM routes
      ```
    files:
      - services/api/app/trips/store.py
    rationale: |
      A server-owned snapshot, like `ChosenStay`, so a later catalogue change cannot alter the trip total or lose the pick. A stored pick is never rewritten when trip dates change, which is what keeps it Picked (AC15).

  - description: |
      Profile preference. Add `sim_preference: Literal["esim", "physical"] | None = None` to `Profile`. In `save_profile`, keep the stored value when the client body omits the field (`"sim_preference" not in body.model_fields_set`), the same guard `transport_preferences` has, so older clients that PUT the whole profile do not wipe it.
    files:
      - services/api/app/trips/profile_store.py
      - services/api/app/routers/profile.py
    rationale: |
      The field is owned by the Traveller profile epic; this item only adds the model field and the API pass-through the shortlist needs (ACs 8-10).

  - description: |
      Router `app/routers/sim_options.py` (prefix /trips), registered in `main.py`, with a `get_sim_providers` dependency in `deps.py`.

      ```
      GET    /trips/{trip_id}/sim-options  -> SimOptions
      PUT    /trips/{trip_id}/sim          body {option_id}  -> TripView   (owner or accepted editor)
      DELETE /trips/{trip_id}/sim                            -> TripView
      ```

      `SimOptions` holds `place`, `start_date`, `end_date`, `travellers` (labels), `preference` (esim, physical or null), `options`, and `picked` (the stored `ChosenSim` plus `covers_dates: bool`, or null). GET reads the viewer's profile preference through `get_profiles` and works for editors and owners (uses `_load`). PUT rebuilds the shortlist and takes price, currency and URL from it, never from the request, and answers 422 `invalid_sim` (new `INVALID_SIM` ApiError) when `option_id` is not in the current shortlist. A trip with no destination or no dates returns an empty `options` list.
    files:
      - services/api/app/routers/sim_options.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
      - services/api/app/routers/trips.py
    rationale: |
      Mirrors `stay_options.py` (shortlist plus choose plus clear) and `transport_picks.py`. `trips.py` gets `INVALID_SIM` and a `_save_sim` helper next to `_save_stays` and `_save_transport`.

  - description: |
      Trip total. In `summarise_cost`, add the picked SIM at `sim.price * (trip.traveller_count or 1)`, converted with `rates.rate(currency, trip.currency)`, counting a missing rate in `unconvertible_count` and recording the rate in `rates` exactly like stays and transport. `fare_over_budget_by` is unchanged.
    files:
      - services/api/app/trips/cost.py
    rationale: |
      AC11. The total stays server-computed in Decimal and flows to `TripView.cost` with no extra router work.

  - description: |
      Web API client. In `apps/web/src/trips/api.ts` add the `SimOption`, `SimOptions`, `ChosenSim` types, `Trip.sim?: ChosenSim | null`, `Profile.sim_preference?: 'esim' | 'physical' | null`, and `fetchSimOptions(tripId)`, `pickSim(tripId, optionId)`, `clearSim(tripId)` using the existing `call` helper. Map 422 `invalid_sim` to `ValidationError` and 403 to `ForbiddenError` as the stay routes do.
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Keeps all HTTP in one module, as the other trip features do.

  - description: |
      SIM options page at `/trips/:tripId/sim-options` (new `RequireAuth` route in `App.tsx`), built to the approved prototype `TRAVEL-PLANNER-APP-STORY-034-design.html`.

      Layout, from the prototype. A breadcrumb "Trips > {trip name}" (`.crumbs`) and an `h1` "SIM options". A `.badge-neutral` preference badge ("Preference: eSIM", "Preference: Physical SIM" or "No SIM preference") with the note beside it ("eSIM options are ranked first.", "Physical SIM options are ranked first.", "Ordered by coverage, then data, then price."). A `.text-sm text-muted` filter note, "Showing options that cover {country} for {dates}. Prices are for {n} travellers." While loading, three `.card` with `.skeleton` lines replace the list (`aria-hidden`), no spinner. The list is a `.stack` with `aria-live="polite"`, one `<article class="card option">` per option, phone first, and from 48rem the `.option-body` grid is `1fr 16rem`.

      Card, in order. A `.cluster` of badges: source (`.badge-neutral` "Web search" or "Partner"), type (`.badge-success` "eSIM" or `.badge-neutral` "Physical SIM"), and "Picked" with a check icon (`.badge-success`) when picked. An `h3.text-lg` name. Facts: "Covers {area}", "Valid {from}-{to}", and "Data: {n} GB" in `.text-bold`. A `dl.option-price` with one row per traveller label and price, plus a `.total` row "Group total" (bold, top border). Actions: a `.btn-primary` "Pick" that becomes `.btn-secondary` "Remove pick" with `aria-pressed` when picked, and a `.btn-ghost` "Booking link" using the existing `BookingLink` component (new tab, http/https only). Exactly one `.btn-primary` per card section, as the guidelines require. A picked card gets `.is-picked` (2px `--color-primary` border, `--color-primary-subtle` background). Picking or removing shows a `Toast`: "Picked. Your trip total and Book trip links now include this SIM." or "Pick removed from your trip."

      Picked option no longer covers the dates. A `.alert.alert-warning` (`role="alert"`, alert icon) titled "Pick a new SIM" with "Your picked SIM no longer covers the trip dates. Pick again." The picked card is shown first with the Picked badge and a `.badge-warning` "Dates not covered", and its validity line reads "Valid {from}-{to} ({trip dates} for this trip)". Its Booking link stays.

      No match. A `.empty-state` with search icon, `h2` "No SIM options match this destination and trip dates.", the muted line "Try changing your trip dates and check again.", and one `.btn-primary` "Change trip dates" linking to the trip page. No list element is rendered. Failure state is a `.alert-danger`, "We couldn't load SIM options. Check your connection and try again." Money uses `formatMoney` (local format, currency always shown).

      Prototype vs AC. The prototype's reviewer-only "Preview preference" dropdown stands in for the profile field and is NOT built; the preference comes from the profile. The prototype's trip page shows a "Trip total" line "SIM: {name}" and a "Book trip links" list; the production trip page already has `TripTotalCard` and the Book trip drawer, so those are extended instead of adding new cards. The prototype `tokens.css` has broken `--duration-*` values ("[object Object]"); the app's own `index.css` tokens are used instead. New CSS (`.option`, `.option-body`, `.option-price`, `.is-picked`) is added to `index.css` using only existing tokens.
    files:
      - apps/web/src/trips/SimOptionsPage.tsx
      - apps/web/src/trips/SimOptionCard.tsx
      - apps/web/src/App.tsx
      - apps/web/src/index.css
    rationale: |
      ACs 1-10, 13-19 at the UI level. Follows `ActivityOptionsPage.tsx` for loading, failure and breadcrumb handling, and `StayShortlistCard` for the pick toggle.

  - description: |
      Trip page integration. Add a `.btn-secondary` "SIM options" (arrow icon, as in the prototype) linking to `/trips/:id/sim-options` in the title actions of `TripDetailPage.tsx`. It is secondary because "Book trip" is already the one primary. Extend `BookTripDrawer` with an optional `sim` prop that adds a card "SIM: {name}" with the same "Open booking page (opens in a new tab)" link, with the http/https check; the count text and the `Book trip` enable rule in `TripDetailPage` count the SIM. Add a "SIM: {name}" line to `costLines` in `CostsPage.tsx` at `price * traveller_count`. `TripTotalCard` needs no change, because the server total already includes the SIM.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/BookTripDrawer.tsx
      - apps/web/src/trips/CostsPage.tsx
    rationale: |
      ACs 11 and 12 in the UI, plus the entry point the prototype's Trip screen shows.

tests:
  - |
    AC1 (API unit, services/api/tests/unit/test_sim_options.py). Write first, expect failure on the missing module.
    ```python
    def test_shortlist_has_esim_and_physical_for_destination():
        out = gather_sims(providers, trip(dest="Lisbon, Portugal"), LABELS, None, RATES)
        assert {o.sim_type for o in out.options} == {"esim", "physical"}
    ```
  - |
    AC2 both sources included.
    ```python
    def test_web_search_and_partner_options_both_present():
        out = gather_sims([stub("w", "web_search", [sim("A")]), stub("p", "partner", [sim("B")])], trip(), LABELS, None, RATES)
        assert {o.source for o in out.options} == {"web_search", "partner"}
    ```
  - |
    AC3 coverage filter, and a failing provider is skipped.
    ```python
    def test_option_not_covering_destination_is_not_listed():
        out = gather_sims([stub("w", "web_search", [sim("Spain only", countries=["Spain"])])], trip(dest="Lisbon, Portugal"), LABELS, None, RATES)
        assert out.options == []
    ```
  - |
    AC4 validity filter, with boundaries (valid exactly on the trip dates is kept, one day short at either end is dropped).
    ```python
    def test_validity_must_cover_all_trip_dates():
        ok = sim("ok", valid_from=date(2027, 3, 12), valid_to=date(2027, 3, 20))
        short_end = sim("short", valid_from=date(2027, 3, 1), valid_to=date(2027, 3, 19))
        out = gather_sims([stub("w", "web_search", [ok, short_end])], trip(start=date(2027, 3, 12), end=date(2027, 3, 20)), LABELS, None, RATES)
        assert [o.name for o in out.options] == ["ok"]
    ```
  - |
    AC5 and AC6 data allowance and price are on every option in the response, and the web card shows them.
    ```python
    assert out.options[0].data_gb == Decimal(10) and out.options[0].price == Decimal("14.50")
    ```
    ```ts
    // SimOptionsPage.test.tsx
    expect(await screen.findByText('Data: 10 GB')).toBeInTheDocument()
    expect(screen.getAllByText('€14.50').length).toBeGreaterThan(0)
    ```
  - |
    AC7 (web). Picking an option then selecting its Booking link opens that option's URL in a new tab.
    ```ts
    await user.click(screen.getByRole('button', { name: 'Pick' }))
    const link = screen.getByRole('link', { name: /Booking link/ })
    expect(link).toHaveAttribute('href', 'https://roamly.example/europe-10')
    expect(link).toHaveAttribute('target', '_blank')
    ```
    Plus API: `PUT /trips/{id}/sim` stores the URL from the shortlist, and a request body carrying a forged `url` or `price` is ignored (`assert resp.json()["sim"]["url"] == SEED_URL`).
  - |
    AC8 eSIM preference ranks eSIM above physical, even when a physical option has more coverage, data and a lower price.
    ```python
    out = gather_sims(providers, trip(), LABELS, "esim", RATES)
    types = [o.sim_type for o in out.options]
    assert types == sorted(types, key=lambda t: t != "esim")
    ```
  - |
    AC9 physical preference.
    ```python
    out = gather_sims(providers, trip(), LABELS, "physical", RATES)
    types = [o.sim_type for o in out.options]
    assert types == sorted(types, key=lambda t: t != "physical")
    ```
  - |
    AC10 no preference means no ordering by SIM type, and a profile with `sim_preference` missing or null behaves the same (profile stored before this change).
    ```python
    out = gather_sims(providers, trip(), LABELS, None, RATES)
    assert [o.id for o in out.options] == ["nomad-europe-20", "atlas-europe-20", "roamly-europe-10", "lisboa-prepaid-15"]  # eSIM and physical interleaved
    ```
    API: `GET /profile` for a stored profile without the key returns `sim_preference` null; `PUT /profile` without the key keeps a stored `esim`.
  - |
    AC11 the picked option's price is in the trip total.
    ```python
    before = summarise_cost(trip_without_sim, RATES).total
    after = summarise_cost(trip_with_sim(price="14.50", currency="EUR", traveller_count=2), RATES).total
    assert after - before == pytest.approx(29.00)
    ```
    Also a foreign-currency pick is converted and listed in `rates`, an unconvertible one raises `unconvertible_count`, and web `CostsPage.test.tsx` shows a "SIM: Roamly Europe 10 GB" line.
  - |
    AC12 Book trip links include the picked option's link.
    ```ts
    // BookTripDrawer.test.tsx
    render(<BookTripDrawer options={[]} sim={chosenSim} onClose={vi.fn()} />)
    expect(screen.getByText('SIM: Roamly Europe 10 GB')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open booking page/ })).toHaveAttribute('href', chosenSim.url)
    ```
    A non-http(s) stored URL renders "No booking link is available" and no anchor.
  - |
    AC13 no preference gives coverage, then data, then price, each tie-breaking the next.
    ```python
    a = sim("a", countries=C33, data_gb=10, price=14)
    b = sim("b", countries=C33, data_gb=20, price=26)
    c = sim("c", countries=C33, data_gb=20, price=24)
    d = sim("d", countries=["Portugal"], data_gb=50, price=1)
    out = gather_sims([stub("w", "web_search", [a, b, c, d])], trip(), LABELS, None, RATES)
    assert [o.name for o in out.options] == ["c", "b", "a", "d"]
    ```
  - |
    AC14 and AC15 date change after picking (API plus web).
    ```python
    def test_pick_stays_but_flags_when_dates_change():
        pick(client, trip_id, "roamly-europe-10")                      # valid 1-31 Mar, trip 12-20 Mar
        client.put(f"/trips/{trip_id}", json={**body, "start_date": "2027-04-02", "end_date": "2027-04-09"})
        out = client.get(f"/trips/{trip_id}/sim-options").json()
        assert out["picked"]["option_id"] == "roamly-europe-10"
        assert out["picked"]["covers_dates"] is False
        assert client.get(f"/trips/{trip_id}").json()["sim"]["option_id"] == "roamly-europe-10"
    ```
    ```ts
    expect(await screen.findByRole('alert')).toHaveTextContent('Your picked SIM no longer covers the trip dates. Pick again.')
    expect(screen.getByText('Picked')).toBeInTheDocument()
    ```
  - |
    AC16 and AC17 no match gives the message and no list.
    ```ts
    expect(await screen.findByText('No SIM options match this destination and trip dates.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    ```
    API: `out["options"] == []` and `out["picked"] is None`.
  - |
    AC18 and AC19 each traveller's price and the group total.
    ```python
    out = gather_sims(providers, trip(traveller_count=2, travellers=["Marco"]), ["Ana", "Marco"], None, RATES)
    o = out.options[0]
    assert [(t.label, t.price) for t in o.traveller_prices] == [("Ana", o.price), ("Marco", o.price)]
    assert o.group_total == o.price * 2
    ```
    ```ts
    expect(screen.getAllByText('Ana').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Group total').length).toBeGreaterThan(0)
    ```
  - |
    Access and robustness (API). A stranger's trip gives 404 on all three routes, a read-only editor gets 403 on PUT and DELETE, `PUT` with an `option_id` outside the shortlist gives 422 `{"code": "invalid_sim"}`, `DELETE` clears the pick and lowers the total, and a trip created before this change (stored without `sim`) loads with `sim` null and an unchanged total.
  - |
    Playwright smoke (apps/web/e2e/sim-options.spec.ts). Open a seeded trip, choose SIM options, pick an option, see the SIM line in the trip total and the SIM link in Book trip.

assumptions_or_open_questions:
  - |
    No real web-search or partner SIM provider is chosen yet (ADR-0007 and ADR-0008 cover maps/places and flight/hotel search only). The plan builds the `SimProvider` port with seeded in-memory adapters, exactly as stays, flights and activities were done, and leaves a real adapter for later. Needs a decision when a provider is picked.
  - |
    Destination to coverage matching uses the destination's country (`country_for`, built on the existing `_country` helper) against each option's country list. Only the seeded destinations resolve; an unknown destination yields no options (the no-match state).
  - |
    "Coverage" ranking is the number of countries an option covers, higher first, as in the prototype's `cover` field. Coverage filtering and ranking never use phone compatibility (explicitly out of scope).
  - |
    Per-traveller labels. The Trip holds `traveller_count` plus named extra travellers, not a name for every traveller (the prototype shows "Ana" and "Marco"). The API labels the owner by profile display name or "You", then named travellers, then "Traveller N". Every traveller pays the same price (no child pricing), as in activity options.
  - |
    The profile editing control for `sim_preference` is NOT part of this item (owned by the Traveller profile epic). Until that ships the field can only be set through `PUT /profile`. The prototype's "Preview preference" control is reviewer-only and is not built.
  - |
    A picked SIM whose dates no longer match is not in the filtered shortlist, so the API returns it separately as `picked` with `covers_dates=false`, and the page shows it first. If nothing else matches and a pick exists, the page shows the warning plus the picked card rather than the no-match empty state (the empty state is for no pick and no match). Reviewer to confirm.
  - |
    Prices stay in each option's currency on the cards (currency always shown). The trip total converts through the existing `RateSource`. Ranking by price compares in the trip currency.
  - |
    The "Change trip dates" button in the no-match state links to the trip page (where Edit trip opens the settings drawer) rather than opening that drawer directly, because the drawer lives in `TripDetailPage` state. Say if it should deep-link to the drawer.

estimated_points: 8

package_dependencies: []

notes: |
  ### Data & rollout

  - **Existing data**: no migration. DynamoDB is schemaless and both additions have defaults. `Trip.sim` defaults to None, so every stored trip loads unchanged (`DynamoTripStore._to_trip` validates through the model), and `Profile.sim_preference` defaults to None, so stored `profile` maps without the key still validate. The local file stores (`PersistentTripStore`, `PersistentProfileStore`) read through the same models. A test covers an old trip and an old profile still loading.
  - **Backfill / seed**: none needed. The SIM catalogue is code-seeded (`app/sims/providers.py`), like the stay and activity catalogues, so there is no data to load.
  - **Settings**: none. No new env var or config file.
  - **Provisioning**: nothing to create. No bucket, queue, role or flag. A real provider later will need its own credentials and setting, which is out of scope here.
  - **Order and rollback**: deploy API and web together or API first; the web only calls the new routes from the new page. Rolling back is safe to leave in place: older code ignores an extra `sim` attribute on a trip item only if the model tolerates it (Pydantic default `extra="ignore"` does), so a stored pick is harmless after rollback.

  ### Design and conventions
  - Built to `TRAVEL-PLANNER-APP-STORY-034-design.html`: screens "SIM options", "SIM options (no match)", "SIM options (pick no longer covers dates)" and "Trip". Component choices follow the UI guidelines (`.card`, `.badge`, `.alert` for the stay-on-page warning, `.empty-state` with one `.btn-primary`, `.skeleton` for loading, `.toast` for the pick confirmation, light theme only, verbs first on buttons, 375px phone first and 48rem desktop).
  - The cards are `.card` in a `.stack`, not a table, matching the prototype: price comparison across many records is shown as cards because the per-traveller price block does not fit a table at 375px.
  - The API is FastAPI on Lambda via Mangum with no owned database (stack notes). The pick lives on the Trip item in the Trip Database, so no new table.
  - Glossary nouns used as the code already does: Trip, Traveller (profile), Chosen option, Book trip, shortlist.

  ```mermaid
  flowchart TD
    web_page[SimOptionsPage.tsx]:::touched -->|fetchSimOptions, pickSim, clearSim| web_api[trips/api.ts]:::touched
    trip_page[TripDetailPage.tsx]:::touched --> web_page
    trip_page --> book[BookTripDrawer.tsx]:::touched
    costs[CostsPage.tsx]:::touched --> web_api
    web_api -->|HTTP| router[routers/sim_options.py]:::touched
    router -->|gather_sims| sims[sims/options.py]:::touched
    sims --> prov[sims/providers.py]:::touched
    sims --> dest[trips/destination_info.py]:::touched
    router -->|_load, _editable_trip, _save_sim| trips_router[routers/trips.py]:::touched
    router -->|get_profiles, get_sim_providers| deps[routers/deps.py]:::touched
    trips_router -->|_view| cost[trips/cost.py]:::touched
    trips_router --> store[trips/store.py]:::touched
    deps --> profile_store[trips/profile_store.py]:::touched
    profile_router[routers/profile.py]:::touched --> profile_store
    main[main.py]:::touched --> router
    rates[trips/rates.py] --> cost
    rates --> sims
    classDef touched fill:#f96,color:#000
  ```

  Why each touched node: `store.py` holds the server-owned pick; `cost.py` makes the total include it (AC11); `sims/*` and `sim_options.py` do matching, ranking and picking (ACs 1-10, 13, 18, 19); `profile_store.py` and `profile.py` carry the preference; `BookTripDrawer.tsx` and `CostsPage.tsx` carry AC12 and AC11 into the UI.

review_focus: |
  Hold the work to SIM shortlist, pick and booking link, the trip total and Book trip integration, and the `sim_preference` model field. OUT: any profile editing UI for the preference, a real web-search or partner adapter, phone compatibility, and the prototype's reviewer-only preference dropdown. The riskiest parts are the validity and coverage filters with their boundaries, the sort key (preference only reorders when set), and keeping a stored pick Picked with `covers_dates=false` after a date change, not silently dropping it. Price, currency and URL on a pick must come from the server's rebuilt shortlist, never the request, and the booking URL is only ever opened if http or https.
