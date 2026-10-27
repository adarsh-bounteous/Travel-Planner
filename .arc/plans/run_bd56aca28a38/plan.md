summary: |
  Add restaurant options for a trip's destination. A new API route `GET /trips/{trip_id}/restaurant-options` gathers restaurants from a provider port (seeded in-memory catalogue, same shape as activity options), then filters them by the owner's profile (diet, religion, dining style, budget price level) plus per-trip extra dining needs the owner adds (halal, kosher, gluten-free and so on). Only restaurants with verified suitability for every required need are shown. Restaurants serving the owner's home-country cuisine are listed first and the others still follow. An empty result carries enough for the web page to show a no-match message that suggests relaxing filters. A new web page `/trips/:tripId/restaurant-options` and an "Edit trip needs" drawer build the approved prototype. Trip needs are stored on the Trip, so Trip A and Trip B stay independent.
scope:
  - description: |
      Restaurant domain module, modelled on app/attractions/options.py. Defines `ProviderRestaurant`, a `RestaurantProvider` Protocol with `fetch(place)`, `RestaurantOption`, `RestaurantOptions`, `DiningFilters`, and the pure `gather_restaurants`.

      ```python
      class ProviderRestaurant(BaseModel):
          name: str
          city: str
          cuisine: str
          dining_style: str            # "Casual", "Fine dining", ...
          price_level: int             # 1..4
          typical_price: Decimal
          currency: str
          suits: list[str]             # VERIFIED suitability tags only: "vegetarian", "halal", "gluten-free"...
          url: str | None = None

      class DiningFilters(BaseModel):
          diet: str = ""
          religion: str = ""
          dining_style: str = ""
          price_level: int | None = None
          home_cuisine: str = ""
          extra_needs: list[str] = []

      def gather_restaurants(providers: list[RestaurantProvider], trip: Trip, filters: DiningFilters) -> RestaurantOptions: ...
      ```

      Rules: keep only restaurants whose folded `city` equals the folded trip destination; keep `dining_style` equal when set; keep `price_level <= filters.price_level` (equal is kept); required needs = diet tag + religion tag + extra_needs, mapped to suitability tags; a restaurant is kept only if EVERY required tag is in `suits` (a missing tag means unknown or unverified, so it is excluded); stable sort puts `cuisine == home_cuisine` first; a failing provider is logged and skipped like gather_activities. "No restriction" diet or empty religion adds no requirement.
    files:
      - services/api/app/dining/__init__.py
      - services/api/app/dining/options.py
    rationale: |
      Pure function over a provider port keeps ACs 1-12 unit-testable with no HTTP, and mirrors the existing attractions/stays/flights modules.
  - description: |
      Seeded in-memory provider and catalogue (`InMemoryRestaurantProvider`, `SEED_CATALOGUES`), with a Lisbon and a Porto set matching the prototype fixture (Portuguese, Lebanese, Indian, Cafe; Casual and Fine dining; price levels 1-3; suits tags with some restaurants having an empty `suits`).
    files:
      - services/api/app/dining/providers.py
    rationale: |
      Same pattern as app/attractions/providers.py. The real Maps and Places adapter (ADR-0007) is out of scope, so the Protocol is the seam.
  - description: |
      Extend Trip with per-trip dining needs, and the Profile with the two dining answers the story needs that the profile lacks today.

      ```python
      # services/api/app/trips/store.py, class Trip
      dining_needs: list[str] = []   # server-owned: extra dining needs for this trip only, changed only through the dining-needs route

      # services/api/app/trips/profile_store.py, class Profile
      dining_style: str = Field(default="", max_length=80)
      price_level: int | None = Field(default=None, ge=1, le=4)  # None = not set
      ```

      Profile PUT replaces the whole profile, so `save_profile` in routers/profile.py must preserve stored `dining_style` and `price_level` when the body omits them (same guard as transport_preferences). Home-country cuisine is derived, not stored: a `COUNTRY_CUISINE` map (Portugal -> Portuguese, France -> French, ...) over the existing `Country` options, applied to the profile's `residence` (see open questions).
    files:
      - services/api/app/trips/store.py
      - services/api/app/trips/profile_store.py
      - services/api/app/routers/profile.py
    rationale: |
      AC 8 and 9 need needs stored per trip. AC 4 and 5 need a dining style and a price level, and Profile has neither. Defaults keep old rows valid.
  - description: |
      Router: `GET /trips/{trip_id}/restaurant-options` (owner or accepted editor can view, as for activity options; the OWNER's profile and the trip's `dining_needs` drive filters) and `PUT /trips/{trip_id}/dining-needs` (owner only, via `_owned_trip`; body `{needs: list[str]}` validated against the allowed set halal, kosher, gluten-free, dairy-free, nut-free; sets `trip.updated_at`, saves, returns the needs). Add `get_restaurant_providers` to deps.py (cached, seeded, local mode too since it makes no outside call), include the router in main.py. Response includes `filters_applied` (profile vs trip chips) so the page can render the "From your profile" and "Added for this trip only" chip groups.
    files:
      - services/api/app/routers/restaurant_options.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      Follows routers/activity_options.py exactly (Depends(get_current_user), `_load`, provider dependency override in tests). The editor's view still uses the owner's profile by loading `profiles.get_profile(owner_id)` with the owner id returned by `_load`.
  - description: |
      Web API client and types: `RestaurantOptions`, `RestaurantOption`, `fetchRestaurantOptions(tripId)`, `saveDiningNeeds(tripId, needs)`; add optional `dining_needs?: string[]` to `Trip` and optional `dining_style?`, `price_level?` to the `Profile` type (optional so existing fixtures still type-check).
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Single place the web calls the API, as for fetchActivityOptions.
  - description: |
      `RestaurantOptionsPage` built to the approved prototype, screen "Restaurant options": breadcrumbs (Trips / trip name / Dining) using the existing `.crumbs`; `h1` "Restaurants in {place}"; `.cluster` of read-only `.chip.is-selected` filter chips with a user icon for profile filters and a plus icon plus dashed border (new `.chip-trip`) for trip needs; a legend line ("From your profile", "Added for this trip only"); `.btn-secondary` "Edit trip needs" with an edit icon; a muted "Portuguese restaurants are listed first." note shown only when a home-cuisine restaurant is in the list; results in `.grid` of `.card` (4:3 photo placeholder, `h3` name, muted details line "{cuisine} cuisine, {style} dining. Typically {money} per person.", cuisine `.badge` with `badge-success` for the home cuisine, "View listing" link only when a url exists); a polite `role="status"` count line. Loading state is three `.skeleton` cards. A fetch failure shows `.alert-danger`.

      No-matches state (prototype screen "Restaurant options, no matches"): chips stay visible, then `.empty-state` with search icon, `h2` "No restaurants match your filters.", hint "Try relaxing a filter, such as budget or a trip need, to see more options.", a `.btn-ghost` "Relax filters" and the one `.btn-primary` "Edit trip needs", both opening the drawer.

      Trip switcher: the prototype has a `.dropdown` "Choose trip" in the trip bar. Since the page route already carries a tripId, the dropdown is limited to the owner's trips from the existing trips list API and navigates to that trip's route (reload shows the skeleton). Keep it if the list API is already used by MyTripsPage, otherwise drop it and note it.
    files:
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/App.tsx
      - apps/web/src/index.css
    rationale: |
      Route `/trips/:tripId/restaurant-options` wrapped in RequireAuth next to the activity-options route. index.css gets only `.chip-trip`, `.chip-static`, `.restaurant-photo` and `.legend` using existing tokens; all other classes already exist.
  - description: |
      `DiningNeedsDrawer` for the prototype screen "Edit trip needs": right `.drawer` via the existing `Overlay kind="drawer"` (focus trap, Esc, scrim), title "Dining needs for this trip", "From your profile" heading with read-only chips, "Added for this trip" `fieldset` with legend "Extra needs for this trip" and `.check`/`.checkbox` rows (Halal, Kosher, Gluten-free, Dairy-free, Nut-free), hint "These needs apply to this trip only.", `.btn-ghost` Cancel (discards) and the one `.btn-primary` Apply (disabled and labelled "Applying" while saving). On success it closes, re-fetches options and shows the existing `Toast` "Needs applied to your {trip} trip". On failure it keeps the drawer open with a `.field-error`. The drawer is shown only to the owner; an editor sees the chips without the button.
    files:
      - apps/web/src/trips/DiningNeedsDrawer.tsx
    rationale: |
      Drawers are for editing in context per the UI guidelines. Reuses Overlay and Toast, no new dependency.
tests:
  - |
    AC1, services/api/tests/unit/test_restaurant_options.py (write first, fails on missing module). Seed has Lisbon and Porto restaurants.
    ```python
    def test_only_destination_restaurants():
        out = gather_restaurants([_prov()], _trip("Lisbon"), DiningFilters())
        assert out.options and all(o.city == "Lisbon" for o in out.options)
    ```
  - |
    AC2 vegetarian excludes restaurants without a vegetarian tag.
    ```python
    out = gather_restaurants([_prov()], _trip("Lisbon"), DiningFilters(diet="Vegetarian"))
    assert all("vegetarian" in o.suits for o in out.options)
    assert "Peixe e Sal" not in {o.name for o in out.options}
    ```
  - |
    AC3 religion food rules. A Muslim profile maps to halal, a Jewish one to kosher; a restaurant lacking the tag is hidden.
    ```python
    out = gather_restaurants([_prov()], _trip("Lisbon"), DiningFilters(religion="Muslim"))
    assert all("halal" in o.suits for o in out.options)
    ```
  - |
    AC4 dining style.
    ```python
    out = gather_restaurants([_prov()], _trip("Lisbon"), DiningFilters(dining_style="Casual"))
    assert {o.dining_style for o in out.options} == {"Casual"}
    ```
  - |
    AC5 and AC6 budget boundary: nothing above the level, and a restaurant at exactly the level is kept.
    ```python
    out = gather_restaurants([_prov()], _trip("Lisbon"), DiningFilters(price_level=2))
    assert max(o.price_level for o in out.options) <= 2
    assert "Casa Lima" in {o.name for o in out.options}   # priced at level 2
    ```
  - |
    AC7 combined requirement: vegetarian profile plus halal trip need.
    ```python
    out = gather_restaurants([_prov()], _trip("Lisbon"), DiningFilters(diet="Vegetarian", extra_needs=["halal"]))
    assert all({"vegetarian", "halal"} <= set(o.suits) for o in out.options)
    assert "Pastel Lab" not in {o.name for o in out.options}   # vegetarian but not halal
    ```
  - |
    AC8 and AC9, services/api/tests/unit/test_restaurant_options_router.py. Needs are per trip.
    ```python
    a = sign_in_as("a@example.com")
    trip_a, trip_b = _trip(a), _trip(a)
    assert a.put(f"/trips/{trip_a}/dining-needs", json={"needs": ["gluten-free"]}).status_code == 200
    a_opts = a.get(f"/trips/{trip_a}/restaurant-options").json()["options"]
    b_opts = a.get(f"/trips/{trip_b}/restaurant-options").json()["options"]
    assert all("gluten-free" in o["suits"] for o in a_opts)
    assert any("gluten-free" not in o["suits"] for o in b_opts)
    ```
    Also: an editor gets 403 on PUT, a stranger 404, anonymous 401, and an unknown need is 422.
  - |
    AC10 unknown or unverified suitability is hidden, not guessed (restaurant with `suits=[]`).
    ```python
    out = gather_restaurants([_prov()], _trip("Lisbon"), DiningFilters(diet="Vegetarian"))
    assert "Peixe e Sal" not in {o.name for o in out.options}
    ```
  - |
    AC11 and AC12 home cuisine ordering without dropping other matches.
    ```python
    names = [(o.name, o.cuisine) for o in gather_restaurants([_prov()], _trip("Lisbon"), DiningFilters(home_cuisine="Portuguese")).options]
    first_other = next(i for i, (_, c) in enumerate(names) if c != "Portuguese")
    assert all(c == "Portuguese" for _, c in names[:first_other])
    assert any(c != "Portuguese" for _, c in names)
    ```
    Router test: a profile with `residence="Portugal"` yields the Portuguese list first, and a profile with a missing `residence` keeps the catalogue order.
  - |
    AC13 and AC14, API: filters that exclude everything return `{"options": []}` with 200, and `filters_applied` is still present. Web, apps/web/src/trips/RestaurantOptionsPage.test.tsx (vitest and testing-library, fetch mocked like ActivityOptionsPage.test.tsx).
    ```tsx
    expect(await screen.findByText('No restaurants match your filters.')).toBeInTheDocument()
    expect(screen.getByText(/Try relaxing a filter/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit trip needs' })).toBeInTheDocument()
    ```
  - |
    Web UI behaviour from the prototype: (a) results render as cards with a "Portuguese restaurants are listed first." note; (b) profile chips and trip chips are in separate groups; (c) skeleton while loading; (d) the drawer lists the five needs with current ones checked, Apply calls `PUT /trips/t1/dining-needs`, re-fetches, and shows the toast "Needs applied to your Lisbon trip"; (e) Cancel does not call the API; (f) `.alert-danger` on a fetch failure.
    ```tsx
    fireEvent.click(screen.getByRole('button', { name: 'Edit trip needs' }))
    fireEvent.click(screen.getByLabelText('Kosher'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('Needs applied to your Lisbon trip')).toBeInTheDocument()
    ```
  - |
    Existing-data safety: a stored Trip item with no `dining_needs`, and a stored profile map with no `dining_style` or `price_level`, still load and fall back to `[]`, `""` and `None`.
    ```python
    assert Trip.model_validate({"id": "t", "name": "Old"}).dining_needs == []
    assert Profile.model_validate({"diet": "Vegan"}).price_level is None
    ```
    Plus a profile router test that a PUT without `dining_style` or `price_level` does not wipe stored values.
assumptions_or_open_questions:
  - |
    The profile has `diet` and `religion` but no dining style or budget price level, and the profile UI is a separate epic. I add optional `dining_style` and `price_level` to the Profile API model only, with no profile-page UI in this item. Until those exist in the UI, the API values can only be set through `PUT /profile`. Confirm this is acceptable, or say if the trip's own `budget` should be mapped to a price level instead.
  - |
    Home-country cuisine is taken from the profile `residence` (the prototype fixture calls it `homeCuisine`). It could instead be `citizenship`. Confirm which one.
  - |
    Diet and religion are free text in the profile (diet options are No restrictions, Vegetarian, Vegan, Halal, Kosher, Gluten-free; religion options come from profileQuestions.ts). I map them to suitability tags with a small fixed table (for example Vegetarian -> vegetarian, Muslim -> halal, Jewish -> kosher), and treat Vegan as requiring vegan. An unmapped value adds no requirement. Confirm the mapping table.
  - |
    Restaurants come from a seeded in-memory catalogue (Lisbon and Porto) behind a provider Protocol. A real places or listings adapter (ADR-0007) is out of scope, matching how activity options were first delivered. "View listing" is shown only when a url exists; the reservation link is the epic's separate concern.
  - |
    The prototype's trip dropdown is kept only if the existing trips list client can supply the trips cheaply. The plan follows the guidelines' "dropdown for choosing one option" rule.
  - |
    Prices are shown with the currency (EUR) via the existing `formatMoney`. The prototype shows `$$` budget chips; the plan renders them as "Budget: $$" for level 2, as in the prototype. The other 'Budget' tone (travel_style) is unrelated.
  - |
    Editors may view the list, but filters always use the owner's profile, and only the owner can edit dining needs. Companion travellers (named people on the trip) carry no diet, so they add nothing beyond the owner's trip needs.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: no migration. DynamoDB is schemaless here. `Trip.dining_needs` defaults to `[]` and `Profile.dining_style`/`price_level` default to `""`/`None`, so every stored trip and profile loads unchanged (covered by the existing-data test). Nothing is narrowed or made required.
  - **Backfill / seed**: none needed. The restaurant catalogue is code (seeded in-memory provider), so there is nothing to re-run.
  - **Settings**: none new. Local mode uses the same seeded provider, since it makes no outside call.
  - **Provisioning**: none.
  - **Order and rollback**: deploy the API first, then the web app (the web only calls the new routes). Roll back by redeploying the previous version; the extra `dining_needs` attribute on trip items and the extra profile keys are ignored by older code (pydantic ignores unknown fields on `Trip` and `Profile`), so leaving them in place is safe.

  Design reading: I read the whole prototype (`TRAVEL-PLANNER-APP-STORY-025-design.html`). The plan takes its layout, chip row with profile/trip split, card contents, empty state and drawer from it. One difference to flag: the prototype hard-codes `Budget: $$` and a single home cuisine, and filters with `r.style === PROFILE.style` (equality) and `price <= budget`; the plan keeps these semantics (ACs 4, 5, 6). The prototype's "Relax filters" link and "Edit trip needs" button both open the drawer; the plan does the same. The prototype's trip dropdown swaps trips in place; the plan navigates between trip routes instead, because the route already carries the trip id.

  No instruction inside the work item asked for anything outside the change, so nothing was refused.

  ```mermaid
  flowchart TD
    Web[RestaurantOptionsPage.tsx] --> WApi[trips/api.ts]
    Drawer[DiningNeedsDrawer.tsx] --> WApi
    Web --> Drawer
    App[App.tsx route] --> Web
    WApi --> R[routers/restaurant_options.py]
    R --> Deps[routers/deps.py get_restaurant_providers]
    R --> Load[routers/trips.py _load / _owned_trip]
    R --> Gather[dining/options.py gather_restaurants]
    R --> PS[trips/profile_store.py Profile]
    R --> TS[trips/store.py Trip.dining_needs]
    Gather --> Prov[dining/providers.py]
    Main[main.py include_router] --> R
    ProfR[routers/profile.py PUT keeps dining fields] --> PS
    classDef touched fill:#f96,color:#000
    class Web,Drawer,WApi,App,R,Deps,Gather,PS,TS,Prov,Main,ProfR touched
  ```
review_focus: |
  IN: restaurant sourcing and filtering (ACs 1-14), per-trip dining needs, the two new Profile fields, and the web page and needs drawer built to the approved prototype. OUT: comparison, shortlist, picking, reservation links, a real places adapter, and a profile UI for dining style or price level. Riskiest area is the filter rule in `gather_restaurants`: every required tag must be a verified entry in `suits` (unknown means hidden), the budget comparison must be `<=`, and home cuisine only reorders. Also check that `PUT /profile` preserves the new fields and that filters always use the owner's profile, even when an editor views the page.
