summary: |
  Let a traveller open "Stay options" from a Stay (place + dates) on the trip's Stays tab and see hotels, homestays and other accommodation gathered from several providers, matched to their property type, rooms and budget plus optional location, amenity and star-rating filters. The API gains a read-only endpoint `GET /trips/{trip_id}/stays/{stay_id}/options` backed by a new `StayProvider` port (same shape as the existing `PlaceSearch` port, ADR-0008 Flight and Hotel Search outbound), three seeded in-memory provider adapters (no real provider is chosen yet), a pure matching function and a merge step that shows one property once with each provider's offer side by side. The web app gains a Stay options page built to the approved prototype: filters column, property cards with nested offer cards, per-offer fetched time, the "Final price confirmed on provider's site" note, a skeleton while loading, and a no-match empty state with Relax filters and Widen search. Ranking and shortlist stay out (separate story).
scope:
  - description: |
      API domain module `app/stays/options.py`. Models and port:

      ```python
      PropertyType = Literal["hotel", "homestay", "other"]
      Amenity = Literal["wifi", "breakfast", "parking", "pool", "ac"]  # AC6: exactly these five

      class ProviderListing(BaseModel):
          property_name: str
          property_type: PropertyType
          rooms: int
          stars: int = 0            # 0 = unrated (homestays)
          area: str
          amenities: list[Amenity]
          nearby: bool = False      # a town around the place, only shown when the search is widened
          price_per_night: Decimal  # whole currency units, never minor units
          currency: str
          fetched_at: datetime
          url: str

      class StayProvider(Protocol):
          name: str
          def fetch(self, place: str, start: date, end: date) -> list[ProviderListing]: ...

      class StayCriteria(BaseModel):
          property_type: PropertyType
          rooms: int = Field(ge=1, le=10)
          max_price: Decimal | None = Field(default=None, ge=0)
          location: str = ""
          amenities: list[Amenity] = []
          stars: list[int] = []     # each 1..5
          widen: bool = False

      def match_listings(listings: list[ProviderListing], c: StayCriteria) -> list[ProviderListing]: ...
      def merge_properties(listings: list[tuple[str, ProviderListing]]) -> list[Property]: ...
      def search_stays(providers: list[StayProvider], stay: Stay, c: StayCriteria) -> StayOptions: ...
      ```

      Rules, taken from the prototype `match()`: property type and rooms always apply (equality); `max_price` empty means every price (AC3), otherwise a property is kept when its cheapest offer is at or under it; location is a case-insensitive substring of area + name; amenities must ALL be present; stars is any-of; an empty optional filter never narrows (AC5); `nearby` listings only when `widen`. Filtering happens per property AFTER merge so one provider's price cannot hide the others' offers. Merge key is `(casefold(property_name), casefold(area))`; offers are sorted by price. A provider that raises is logged with `logger.exception` and skipped, so the others still list.
    files:
      - services/api/app/stays/__init__.py
      - services/api/app/stays/options.py
    rationale: |
      Pure functions behind a Protocol keep matching and de-duplication unit-testable with no HTTP or AWS, mirroring `app/places/search.py` and `app/trips/rates.py`.
  - description: |
      Seeded provider adapters `InMemoryStayProvider(name, catalogue, clock)` in `app/stays/providers.py`, with a `SEED_PROVIDERS` set of three providers (Booknest, Staylink, Roomly) carrying Lisbon fixtures lifted from the prototype's FIXTURE (same properties, types, rooms, stars, amenities, nearby towns Sintra and Cascais, prices in EUR). The clock stamps each listing's `fetched_at` at fetch time (AC8). Wire in `deps.py` as `get_stay_providers()` (lru_cache, like `_places`) so tests override it.
    files:
      - services/api/app/stays/providers.py
      - services/api/app/routers/deps.py
    rationale: |
      No provider integration is chosen yet (ADR-0008 records the outbound surface only), so a seeded default follows the existing `SEED_CATALOGUE` / `SEED_RATES` convention. A real adapter later implements `StayProvider` with no change to matching.
  - description: |
      New router `app/routers/stay_options.py`, registered in `app/main.py`:

      ```python
      @router.get("/trips/{trip_id}/stays/{stay_id}/options")
      def stay_options(
          trip_id: str, stay_id: str,
          property_type: PropertyType = "hotel",
          rooms: int = Query(1, ge=1, le=10),
          max_price: Decimal | None = Query(None, ge=0),
          location: str = "",
          amenities: list[Amenity] = Query([]),
          stars: list[int] = Query([], ),
          widen: bool = False,
          user: str = Depends(get_current_user),
          trips: TripStore = Depends(get_trips),
          identity: IdentityProvider = Depends(get_identity),
          providers: list[StayProvider] = Depends(get_stay_providers),
      ) -> StayOptions
      ```

      Access uses `_load` from `app/routers/trips.py` (owner or accepted editor; anything else is the same 404 as a missing trip); an unknown `stay_id` is `NOT_FOUND`; a star outside 1..5 is 422. Response `StayOptions`: `place`, `start_date`, `end_date`, `nights`, `properties[]` (id, name, property_type, rooms, stars, area, amenities, nearby, offers[] with provider, price_per_night, total, currency, fetched_at, url), `price_min`, `price_max`. An empty `properties` list is the no-match answer (AC10), not an error. The endpoint writes nothing.
    files:
      - services/api/app/routers/stay_options.py
      - services/api/app/main.py
    rationale: |
      A separate router keeps the already-large `trips.py` from growing; it reuses the existing access helper so sharing rules stay in one place.
  - description: |
      Web API client in `apps/web/src/trips/api.ts`: types `StayOptions`, `StayProperty`, `StayOffer`, `StayCriteria` and

      ```ts
      export const fetchStayOptions = (tripId: string, stayId: string, c: StayCriteria) =>
        call<StayOptions>(`/trips/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(stayId)}/options?${stayQuery(c)}`)
      ```

      `stayQuery` omits empty optional filters so the server sees "not turned on". A pure helper file `stayOptions.ts` holds `AMENITIES` (the five, labels as in the prototype: Free Wi-Fi, Breakfast included, Parking, Pool, Air conditioning), `describeCriteria()` (the no-match detail line, e.g. "Hotel, 1 room, pool, 5 stars in Lisbon.") and the date/time/money formatting (`Intl`, always with currency, local format).
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/stayOptions.ts
    rationale: |
      `call()` already maps 404/422 and sets credentials; no client-side cache, consistent with the file's stated rule.
  - description: |
      Stay options page, route `/trips/:tripId/stays/:stayId/options` wrapped in `<RequireAuth>` in `App.tsx`. Built from the prototype screens "Stay options" and "Stay options, no match":
      - Breadcrumb `.crumbs` (Trip name / Stays) and `h1` "Stays in {place}, {start} to {end}" (" and nearby" once widened).
      - `.options-body`: one column on phones, `280px 1fr` grid from 48rem. Filters `form` with `.field` + `.select` for Property type (Hotel, Homestay, Other accommodation; default Hotel) and Rooms (1-4; default 1), a Budget per night (EUR) `.input` type number with `.field-hint` "Leave empty to see every price.", then the `.filter-optional` block (top border, text "Optional filters. Leave them off and nothing is narrowed."): Location `.input`, Amenities `fieldset` of five `.check`/`.checkbox`, Star rating `fieldset` of five `.chip` toggles with `aria-pressed`. One `.btn-primary` "Apply filters" (disabled and "Applying…" while loading).
      - Results `section` (`aria-busy`): `role="status"` count "Showing N stays" and "Prices from X to Y per night, as fetched." Each property is an `article.card.property`: `h3` name, `.badge-success` "Offered by N providers" (`.badge-neutral` for one), details line (type in area, stars, rooms, amenity names), `.offers` grid (1 column, 2 from 30rem) of nested `.card.offer` (surface fill) each with provider name, `.offer-price` per night, total for the nights, "Fetched {time}" (AC8), "View on {provider}" link with sr-only property name (`target="_blank" rel="noopener noreferrer"`), then `.note` with info icon "Final price confirmed on provider's site" (AC9).
      - Loading: three `.card.sk-card` with `.skeleton` lines. Fetch failure: `.alert-danger` "We couldn't load stays. Check your connection and try again." with a Retry `.btn-secondary`.
      - No match: `.empty-state` "No stays match", the `describeCriteria` detail line, `.btn-primary` "Relax filters" and `.btn-secondary` "Widen search" (AC10). Relax clears budget and optional filters, toasts "Optional filters and budget cleared." and re-queries; if still empty an `.alert-warning` "Still no match." shows above the empty state. Widen re-queries with `widen=true` and toasts "Searching {place} and nearby towns."
      - Reuse `Toast` from `trips/Toast.tsx`; icons from `auth/icons`, adding Search and Info icons if absent.
    files:
      - apps/web/src/trips/StayOptionsPage.tsx
      - apps/web/src/trips/StayFilters.tsx
      - apps/web/src/trips/PropertyCard.tsx
      - apps/web/src/App.tsx
      - apps/web/src/auth/icons.tsx
      - apps/web/src/index.css
    rationale: |
      Splitting filters and property card keeps each component small and independently testable. CSS adds only the prototype classes not already in `index.css` (`.options-body`, `.filters`, `.filter-optional`, `.offers`, `.offer`, `.property`, `.prop-head`, `.note`, `.actions-end`, `.sk-card`), built from existing tokens.
  - description: |
      Entry point from the trip: `StaysSection` gets a `tripId` prop and each stay card gets a "Find stays" link (search icon) to the options route, styled `.btn` as in the prototype's "Trip stays" screen; `TripDetailPage.tsx` passes `tripId`. The card, place and dates are unchanged (reused from STORY-045).
    files:
      - apps/web/src/trips/StaysSection.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: |
      The prototype adds Find stays to the existing stay card and changes nothing else on it.
tests:
  - |
    AC1, API (`services/api/tests/unit/test_stay_options_router.py`, written first, fails with 404 until the router exists). Two or more providers appear for the stay's place and dates:
    ```python
    r = a.get(f"/trips/{tid}/stays/{sid}/options")
    assert r.status_code == 200
    providers = {o["provider"] for p in r.json()["properties"] for o in p["offers"]}
    assert len(providers) >= 2
    assert r.json()["place"] == "Lisbon" and r.json()["nights"] == 4
    ```
    Plus: unknown stay id is 404, another traveller's trip is 404, an unauthenticated call is 401.
  - |
    AC2, `tests/unit/test_stay_options.py` over `match_listings` with mixed types and room counts:
    ```python
    got = match_listings(MIXED, StayCriteria(property_type="hotel", rooms=1))
    assert {(g.property_type, g.rooms) for g in got} == {("hotel", 1)}
    ```
    and the router test with `?property_type=homestay&rooms=2` asserting every returned property has those values.
  - |
    AC3, a wide price range comes back whole when no budget is given, and `max_price` narrows only when given:
    ```python
    all_ = search_stays(PROVIDERS, stay, StayCriteria(property_type="hotel", rooms=1))
    assert min(p.price_min for p in all_.properties) < 70 and max(p.price_max for p in all_.properties) > 200
    capped = search_stays(PROVIDERS, stay, StayCriteria(property_type="hotel", rooms=1, max_price=Decimal(100)))
    assert all(min(o.price_per_night for o in p.offers) <= 100 for p in capped.properties)
    ```
  - |
    AC4, each optional filter on its own narrows (one test per filter, parametrised):
    ```python
    assert all("pool" in p.amenities for p in by(amenities=["pool"]))
    assert all(p.stars in (4, 5) for p in by(stars=[4, 5]))
    assert all("baixa" in (p.area + p.name).lower() for p in by(location="Baixa"))
    ```
    Multiple amenities require all of them. Router: `?stars=6` is 422.
  - |
    AC5, no optional filter does not narrow: the result with no optional filters equals the result with empty `location`, `amenities=[]` and `stars=[]`, and includes a property that has no amenities and no star rating. Web: `stayQuery` of default criteria contains only `property_type` and `rooms`:
    ```ts
    expect(stayQuery({ property_type: 'hotel', rooms: 1, max_price: null, location: '', amenities: [], stars: [], widen: false })).toBe('property_type=hotel&rooms=1')
    ```
  - |
    AC6, web (`StayOptionsPage.test.tsx`): the amenity fieldset offers exactly the five and nothing else; the API rejects any other value with 422.
    ```tsx
    const group = screen.getByRole('group', { name: 'Amenities' })
    expect(within(group).getAllByRole('checkbox').map((c) => c.parentElement?.textContent)).toEqual(
      ['Free Wi-Fi', 'Breakfast included', 'Parking', 'Pool', 'Air conditioning'])
    ```
  - |
    AC7, same property from two providers is listed once with both offers:
    ```python
    names = [p.name for p in result.properties]
    assert names.count("Hotel Alfama Terrace") == 1
    alfama = next(p for p in result.properties if p.name == "Hotel Alfama Terrace")
    assert [o.provider for o in alfama.offers] == ["Booknest", "Staylink"]  # sorted by price
    ```
    Differing case or spacing in the name still merges. Web: the card shows "Offered by 2 providers" and two nested offer cards, each with its own price.
  - |
    AC8, API: every offer carries the fetch time the adapter stamped (`assert offer["fetched_at"] == "2026-01-01T10:42:00Z"` with a fixed clock). Web: each offer shows its time, `expect(screen.getAllByText(/^Fetched /)).toHaveLength(2)`.
  - |
    AC9, web: each property shows the note once, `expect(screen.getAllByText("Final price confirmed on provider's site")).toHaveLength(properties.length)`.
  - |
    AC10, API: criteria nothing satisfies give `200` with `properties == []`. Web: the empty state and both actions:
    ```tsx
    expect(await screen.findByRole('heading', { name: 'No stays match' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Relax filters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Widen search' })).toBeInTheDocument()
    ```
    Relax filters re-queries without budget or optional filters (assert the second fetch URL); Widen search re-queries with `widen=true` and nearby towns can then appear; a still-empty relax shows "Still no match."
  - |
    Robustness: one provider that raises does not remove the others (`assert len(result.properties) > 0` with a failing provider in the list). Loading shows the skeleton with `aria-busy="true"`. Entry point: `Stays.test.tsx` gains an assertion that each stay card has a "Find stays" link to `/trips/t1/stays/s1/options`.
  - |
    Verification commands: `cd services/api && uv run pytest tests/unit` and `cd apps/web && pnpm test --run` (vitest), plus the project's type check/lint scripts.
assumptions_or_open_questions:
  - |
    The traveller's property type, rooms and budget are chosen on the options page (the prototype defaults to Hotel, 1 room, empty budget) and are not read from the saved Profile, which has no such fields. If a profile preference is meant, that is a separate change.
  - |
    No real provider is chosen, so the three providers are seeded in-memory adapters with Lisbon fixture data (Booknest, Staylink, Roomly). Other places return no stays and so show the no-match state. A real adapter implements `StayProvider` later.
  - |
    Prototype vs UI guidelines: the prototype makes "Find stays" a `.btn-primary` on every stay card, while the guidelines allow one `.btn-primary` per screen section and the Stays section already has "Add stay" as primary. The plan follows the approved prototype; say if you want Find stays to be `.btn-secondary` instead.
  - |
    The prototype's per-offer link only shows a toast ("Opens X in a new tab"). The plan renders a real external link to the provider's URL from the listing. The epic's separate booking-link work is not built here.
  - |
    Budget is a per-night maximum matched against a property's cheapest offer, as in the prototype. Prices are shown in the provider's currency (EUR in the seeds); no conversion to the trip currency.
  - |
    A property is the same across providers when its name and area match case-insensitively. A real provider would need a better key (coordinates or an address) when one is added.
  - |
    A provider that fails is skipped silently and the others still list; the page does not tell the traveller which provider was missing. Not in the ACs or the prototype.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — read-only endpoint over seeded in-memory provider data. No schema, stored data, migration, seed record, setting or env var changes, and nothing to provision. Deploy API and web together; rolling back is removing the route, with no data to undo.

  Context: ADR-0008 (Flight and Hotel Search, outbound) is the integration surface; ADR-0006/0002 mean the API runs as a Lambda behind Mangum, so provider fetches should stay fast and stateless. A real adapter would need a timeout and parallel fetching, which is out of scope for the seeded version. Glossary term "Stay" (place + dates) is used for the trip item; the matched accommodation is "stay options"/"properties".

  ```mermaid
  flowchart TD
    Main[app/main.py]:::touched -->|include_router| SO[routers/stay_options.py]:::touched
    SO -->|_load: owner or editor access| Trips[routers/trips.py]
    SO -->|Depends get_stay_providers| Deps[routers/deps.py]:::touched
    Deps --> Prov[stays/providers.py]:::touched
    SO --> Opt[stays/options.py]:::touched
    Prov -->|implements StayProvider| Opt
    Trips --> Store[trips/store.py Stay]
    App[web App.tsx]:::touched -->|new route| Page[StayOptionsPage.tsx]:::touched
    Page --> Filters[StayFilters.tsx]:::touched
    Page --> Card[PropertyCard.tsx]:::touched
    Page -->|fetchStayOptions| Api[trips/api.ts]:::touched
    Detail[TripDetailPage.tsx]:::touched --> Section[StaysSection.tsx]:::touched
    Section -->|Find stays link| Page
    Api -->|GET options| SO
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN scope: the options endpoint, the provider port with seeded adapters, matching, merge and the Stay options page with its no-match state. OUT: ranking, shortlist, comparison, booking links and any real provider integration. Riskiest area is the match and merge logic: filter after merging so a property keeps all its offers, optional filters must never narrow when off, and amenities are all-of while stars are any-of. Deliberate choices: the property type, rooms and budget come from the page, not the Profile; Find stays follows the prototype's `.btn-primary` despite the one-primary guideline; the router reuses `_load` from `trips.py` for access.
