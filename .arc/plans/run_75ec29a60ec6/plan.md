summary: |
  Let a traveller save optional transport preferences (preferred modes, cabin or comfort class, departure-time window, maximum stops, preferred providers) once in their profile, and have transport search apply them silently on later trips. The API gets a `transport_preferences` block on the existing `Profile` (stored in the same DynamoDB `profile` map, so old rows stay valid), plus a small `app/transport` module (provider port, in-memory seeded providers, preference-aware search) and `GET /transport/options`. The web app gets a "Transport preferences" page under Account/Profile and a "Find transport" page, both built from the approved prototype. Maximum stops is flexible: the page offers 0, 1 and 2 as the quick choices (AC 10) and also lets the traveller enter any other whole number, and the API accepts any whole number from 0 to 10. Accessibility and luggage needs are out of scope.
scope:
  - description: |
      API: add the preferences model to the profile. New types in `profile_store.py`:

      ```python
      Mode = Literal["flight", "train", "bus", "taxi"]
      Cabin = Literal["economy", "premium_economy", "business"]
      DepartureWindow = Literal["morning", "afternoon", "evening", "night"]

      class TransportPreferences(BaseModel):
          modes: list[Mode] = Field(default_factory=list, max_length=4)
          cabin: Cabin | None = None
          departure_window: DepartureWindow | None = None
          max_stops: int | None = Field(default=None, ge=0, le=10)  # any whole number, not just 0/1/2
          providers: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]] = Field(default_factory=list, max_length=20)
      ```

      `Profile` gains `transport_preferences: TransportPreferences = Field(default_factory=TransportPreferences)`. A validator rejects case-insensitive duplicate providers. Because `PUT /profile` replaces the whole profile, `save_profile` in `routers/profile.py` keeps the stored preferences when the body omits `transport_preferences` (check `"transport_preferences" not in body.model_fields_set`), so the existing profile page and trip set-up, which send no such field, cannot wipe them.
    files:
      - services/api/app/trips/profile_store.py
      - services/api/app/routers/profile.py
    rationale: |
      Reuses the existing profile storage (`USER#<id>` item, `profile` map) instead of a new table. Defaults make every existing stored profile load with "nothing set" (AC 1, AC 3). Departure windows are a fixed Literal (AC 11). Maximum stops is a bounded integer rather than a Literal, per reviewer feedback, so the traveller can pick any number they want. The upper bound of 10 only guards against junk input.
  - description: |
      API: conveyance search module `app/transport/options.py` and `app/transport/providers.py`, mirroring `app/stays/options.py` and `app/stays/providers.py`. There is no transport code in the repo today, so AC 3 and AC 9 need this minimal slice. It holds a `TransportProvider` Protocol (`name`, `fetch(origin, destination, on: date) -> list[TransportOption]`), an `InMemoryTransportProvider` with seeded data matching the prototype (Example Air flight, a 1-stop train, Other Air, Costa Coach bus, RideNow taxi estimate), and:

      ```python
      def search_transport(providers: list[TransportProvider], origin: str, destination: str, on: date,
                           prefs: TransportPreferences) -> TransportOptions: ...
      def apply_preferences(options: list[TransportOption], prefs: TransportPreferences) -> list[TransportOption]: ...
      ```

      Semantics: each preference that is unset never excludes anything (AC 3). When set, `modes` keeps only those modes, `max_stops` drops options with more stops than the saved number (any value, so 3 keeps options with 0 to 3 stops), `departure_window` keeps options departing in that window, and `cabin` keeps options in that class (modes with no cabin concept, such as taxi, are not excluded by cabin). Preferred providers never exclude. They keep their options in the shortlist and flag them `preferred_provider=True` (AC 9), and sort first. One failing provider is logged and skipped, as stays do.
    files:
      - services/api/app/transport/__init__.py
      - services/api/app/transport/options.py
      - services/api/app/transport/providers.py
    rationale: |
      Same port-and-seeded-adapter shape as stays, so a real Flight and Hotel Search adapter (ADR-0008) can replace the seed later. Preferences are applied server-side from the stored profile, so the client never sends them (AC 1, AC 2).
  - description: |
      API: route and wiring. `GET /transport/options?origin=&destination=&date=` in a new `routers/transport.py` reads the signed-in traveller's profile via `get_profiles` and calls `search_transport`. It takes no preference query params. Add `get_transport_providers` to `deps.py` (cached seeded list, like `_stay_providers`) and include the router in `main.py` next to the other routers.
    files:
      - services/api/app/routers/transport.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      The traveller id comes only from the session cookie, per `get_current_user`. Search works with no profile or no preferences saved (AC 1).
  - description: |
      Web: types and API client. Extend `Profile` in `trips/api.ts` with `transport_preferences: TransportPreferences` (`max_stops: number | null`) and add `fetchTransportOptions(origin, destination, date)`. `withAnswer` in `profile/profileAnswers.ts` must spread the whole profile so the new block survives other profile edits. Provide a default empty block when the API omits it.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/profile/profileAnswers.ts
    rationale: |
      Without this, saving any other profile answer would PUT a profile that drops the preferences.
  - description: |
      Web: `TransportPreferencesPage` at `/profile/transport`, built from the prototype screen "Profile - transport preferences". It has a breadcrumb (Profile / Transport preferences), an h1, the intro "Optional. Used to match transport options on later trips.", and a status `.alert` (info "Nothing set yet", warning "You have unsaved changes", success "Your preferences are saved"). A single `.card.stack.stack-lg` form holds five rows. Each is a `fieldset` with a `legend` and a `.badge` that reads "Saved: <value>" in `badge-success`, "Not set" in `badge-neutral`, or "Unsaved change" in `badge-warning`. The rows are:
      - Preferred modes: `.chip` buttons with `aria-pressed` (Flight, Train, Bus, Taxi) and a field hint.
      - Cabin or comfort class: radios (Economy, Premium economy, Business) plus a "Clear class" `.btn-ghost`.
      - Departure-time window: radios Morning, Afternoon, Evening, Night plus "Clear window".
      - Maximum stops: radios "0 stops", "1 stop", "2 stops" (the prototype's choices, AC 10), plus an addition to the prototype for flexibility: an "Or enter another number" `.field` with a `type=number` `.input` (min 0, max 10, `.field-hint` "Any whole number from 0 to 10"), kept in sync with the radios, and "Clear stops". A saved value of 3 shows "Saved: 3 stops" with no radio checked and 3 in the number input. An out-of-range or non-whole value shows a `.field-error` with `.is-invalid` after Save, "Enter a whole number from 0 to 10."
      - Preferred providers: removable `.chip.is-selected` chips, an "Add a provider" `.input` with an "Add provider" `.btn-secondary`, and a `.field-error` (role=alert, `.is-invalid`) for duplicates: "<name> is already in your list. Add a different provider."

      Below the form sit "Back to search" (`.btn-ghost`, arrow-left icon) and one `.btn-primary` "Save", which shows `.spinner` and "Saving" while pending and then a `.toast` "Transport preferences saved." (or "Transport preferences cleared."). Skeleton while loading, `.alert-danger` on load failure. Layout uses `.page` max width `--size-content-max`, `--space-3` and `--space-4` gaps, and a single column. Drop the prototype's "Preview as" demo switch, which is a prototype fixture and not a product feature. Add a "Transport preferences" `.btn-secondary` link beside the "Traveller profile" link on `AccountPage.tsx`, and the route in `App.tsx` wrapped in `RequireAuth`.
    files:
      - apps/web/src/profile/TransportPreferencesPage.tsx
      - apps/web/src/account/AccountPage.tsx
      - apps/web/src/App.tsx
    rationale: |
      Reuses the existing Toast, crumbs and profile fetch and save patterns from `ProfilePage.tsx`. The prototype shows the Account nav item as current for this screen. Existing styling uses the project's shared CSS classes in `index.css`. Add only the few prototype-specific classes (`pref-row`, `pref-head`, `pref-options`, `add-row`) there, built from tokens. The number input for stops is the one deliberate departure from the prototype, requested in review. The three radios stay as the offered choices so AC 10 still holds.
  - description: |
      Web: `TransportSearchPage` at `/transport`, built from the prototype screen "Trip search and shortlist". It has an h1 "Find transport" and a `.grid` search form (From, To, Dates, `.btn-primary` Search with search icon) that asks for no preferences. A `.status-strip` with `aria-live=polite` says either "Matched to your saved transport preferences" with an "Edit transport preferences" link, or "No transport preferences saved. Showing every option." with a "Set transport preferences (optional)" link. The "Shortlist" section shows `.skeleton` cards while loading and then a `role=list` of `.card.option` articles. Each shows title, an optional `badge-success` "Preferred provider" with star icon, an "Estimate" `.badge` for taxi, detail, price formatted with currency, a "Why:" line, and a "View booking" link. Single column on phones, content max width `--size-content-max`. Add the route in `App.tsx` under `RequireAuth`. Because the prototype places search under Trips, add a "Find transport" link on the Trips home only if the shell nav test allows it. Otherwise it is reachable from the preferences page's "Back to search" link.
    files:
      - apps/web/src/transport/TransportSearchPage.tsx
      - apps/web/src/transport/api.ts
      - apps/web/src/index.css
    rationale: |
      Covers AC 1, AC 2, AC 3 and AC 9 in the UI. The page never renders a preference input.
tests:
  - |
    AC 1 (API) in services/api/tests/unit/test_transport_router.py. A new traveller with no saved preferences gets a 200 from search with no preference params.
    ```python
    r = client.get("/transport/options", params={"origin": "Lisbon", "destination": "Madrid", "date": "2026-11-14"})
    assert r.status_code == 200
    assert len(r.json()["options"]) == 5
    ```
  - |
    AC 1 (web) in apps/web/src/transport/TransportSearchPage.test.tsx. The page shows no preference prompt when nothing is saved.
    ```tsx
    expect(screen.queryByLabelText(/cabin|stops|provider|mode/i)).toBeNull()
    expect(await screen.findByText('No transport preferences saved. Showing every option.')).toBeInTheDocument()
    ```
  - |
    AC 2 in test_transport_router.py. Preferences saved earlier are applied on a later search without being sent.
    ```python
    client.put("/profile", json={"transport_preferences": {"max_stops": 1}})
    r = client.get("/transport/options", params=SEARCH)  # no preference params
    assert all(o["stops"] <= 1 for o in r.json()["options"])
    ```
    Also test that a plain `PUT /profile` with no `transport_preferences` key leaves them intact: `assert client.get("/profile").json()["transport_preferences"]["max_stops"] == 1`.
  - |
    AC 3 in services/api/tests/unit/test_transport_options.py. With no preferred mode, every mode is kept.
    ```python
    result = apply_preferences(SEED_OPTIONS, TransportPreferences(max_stops=2))
    assert {o.mode for o in result} == {"flight", "train", "bus", "taxi"}
    assert len(apply_preferences(SEED_OPTIONS, TransportPreferences())) == len(SEED_OPTIONS)
    ```
  - |
    AC 4 in apps/web/src/profile/TransportPreferencesPage.test.tsx. A saved mode of train is shown as saved.
    ```tsx
    expect(await screen.findByRole('button', { name: 'Train', pressed: true })).toBeInTheDocument()
    expect(screen.getByText('Saved: Train')).toBeInTheDocument()
    ```
    API round trip in test_profile_router.py: `assert client.get("/profile").json()["transport_preferences"]["modes"] == ["train"]`.
  - |
    AC 5 in TransportPreferencesPage.test.tsx. A saved cabin class is shown as saved.
    ```tsx
    expect(await screen.findByRole('radio', { name: 'Economy' })).toBeChecked()
    expect(screen.getByText('Saved: Economy')).toBeInTheDocument()
    ```
  - |
    AC 6 in TransportPreferencesPage.test.tsx. A saved departure window is shown as saved.
    ```tsx
    expect(await screen.findByRole('radio', { name: 'Morning' })).toBeChecked()
    expect(screen.getByText('Saved: Morning')).toBeInTheDocument()
    ```
  - |
    AC 7 in TransportPreferencesPage.test.tsx. A saved maximum number of stops is shown as saved, both for a quick choice and for a custom number.
    ```tsx
    expect(await screen.findByRole('radio', { name: '1 stop' })).toBeChecked()
    expect(screen.getByText('Saved: 1 stop')).toBeInTheDocument()
    // with max_stops 3 saved
    expect(screen.getByText('Saved: 3 stops')).toBeInTheDocument()
    expect(screen.getByLabelText('Or enter another number')).toHaveValue(3)
    ```
  - |
    AC 8 in TransportPreferencesPage.test.tsx. A saved preferred provider is shown as saved. A duplicate add shows the inline error.
    ```tsx
    expect(await screen.findByText('Example Air')).toBeInTheDocument()
    expect(screen.getByText('Saved: Example Air')).toBeInTheDocument()
    // add "example air" again
    expect(screen.getByRole('alert')).toHaveTextContent('already in your list')
    ```
  - |
    AC 9 in test_transport_options.py and test_transport_router.py. Options from the preferred provider stay in the shortlist and are flagged, even when other preferences would drop other providers.
    ```python
    result = apply_preferences(SEED_OPTIONS, TransportPreferences(providers=["Example Air"], max_stops=0))
    flagged = [o for o in result if o.provider == "Example Air" and o.mode == "flight"]
    assert flagged and all(o.preferred_provider for o in flagged)
    ```
    Web test asserts the "Preferred provider" badge appears on the Example Air card.
  - |
    AC 10 in TransportPreferencesPage.test.tsx. The radio choices offered for stops are exactly 0, 1 and 2. The number input is an extra way in, not a fourth choice.
    ```tsx
    const stops = screen.getAllByRole('radio').filter((r) => r.getAttribute('name') === 'stops')
    expect(stops.map((r) => r.getAttribute('value'))).toEqual(['0', '1', '2'])
    ```
  - |
    Flexible stops in test_profile_router.py and TransportPreferencesPage.test.tsx. Any whole number from 0 to 10 is accepted and applied, and junk is rejected.
    ```python
    assert client.put("/profile", json={"transport_preferences": {"max_stops": 3}}).status_code == 200
    assert client.put("/profile", json={"transport_preferences": {"max_stops": 11}}).status_code == 422
    assert client.put("/profile", json={"transport_preferences": {"max_stops": -1}}).status_code == 422
    ```
    ```python
    # test_transport_options.py
    assert all(o.stops <= 3 for o in apply_preferences(SEED_OPTIONS, TransportPreferences(max_stops=3)))
    ```
    Web test types 4 into "Or enter another number", clicks Save, and expects the PUT body to hold `max_stops: 4`. It also expects that typing 2.5 and saving shows "Enter a whole number from 0 to 10."
  - |
    AC 11 in TransportPreferencesPage.test.tsx and the API. The window choices are exactly morning, afternoon, evening and night.
    ```tsx
    const windows = screen.getAllByRole('radio').filter((r) => r.getAttribute('name') === 'window')
    expect(windows.map((r) => r.getAttribute('value'))).toEqual(['morning', 'afternoon', 'evening', 'night'])
    ```
    ```python
    assert client.put("/profile", json={"transport_preferences": {"departure_window": "dawn"}}).status_code == 422
    ```
  - |
    Existing data (the data-migration test) in test_profile_router.py and test_profile_store.py. A profile stored before this change still loads with nothing set.
    ```python
    legacy = {"display_name": "Ana", "home_city": "Lisbon"}  # no transport_preferences key
    p = Profile.model_validate(legacy)
    assert p.transport_preferences == TransportPreferences()
    ```
  - |
    Playwright E2E in apps/web/e2e/transport-preferences.spec.ts. Save preferences, reload, search a later trip, and check there is no preference prompt and that the Preferred provider badge shows.
assumptions_or_open_questions:
  - |
    Reviewer feedback says maximum stops should not be limited to 0, 1 and 2. AC 10 says the choices offered are 0, 1 and 2. I reconciled them by keeping 0, 1 and 2 as the offered radio choices and adding an "Or enter another number" input, with the API accepting any whole number from 0 to 10. This adds a control the prototype does not show. Please confirm that is what you meant, or say if the radios should go and be replaced by a single number field. That would conflict with AC 10 as written.
  - |
    The upper bound of 10 stops is my choice. Say if it should be higher or removed.
  - |
    No conveyance provider, fare or shortlist code exists on this branch (only stays). I assumed this item must add the smallest search-with-preferences slice so AC 3 and AC 9 can be checked, using seeded in-memory data like stays. If sibling conveyance stories land first, the plan should be rebased onto their provider port and `TransportOption` model instead.
  - |
    The prototype's search screen is a standalone "Find transport" page keyed by From, To and Dates, while the app's stay search is per trip stay. I follow the prototype (`/transport`). Please confirm whether it should instead hang off a trip.
  - |
    AC 4 says "train is shown as a saved preferred mode". The prototype shows it as a pressed chip plus a "Saved: Train" badge. I treat both as satisfying it.
  - |
    Cabin class is applied only to modes that have one (flight, train). Bus and taxi are never excluded by it. Departure windows are fixed clock ranges (morning 05-12, afternoon 12-17, evening 17-21, night 21-05). Please confirm.
  - |
    The prototype's "Preview as" demo chips are fixtures and are not built. The prototype's Search button uses a spinner-free skeleton list, which I follow.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: no migration. `transport_preferences` is a new key inside the existing `profile` map on the `USER#<id>` account item in the DynamoDB accounts table. Items without it validate to an empty `TransportPreferences` via the model default, so existing profiles stay readable and usable. Nothing is narrowed or made required.
  - **Backfill / seed**: none needed. The seeded transport catalogue is in code (`app/transport/providers.py`), like the stay seed.
  - **Settings**: none added.
  - **Provisioning**: nothing new. It uses the existing accounts table.
  - **Order and rollback**: deploy the API first, then the web app. Old web clients send a Profile without the block, and the server keeps the stored one, so they do not erase it. Rollback is safe: older API code ignores the extra `profile.transport_preferences` key when validating (pydantic ignores unknown fields by default; confirm `model_config` is not `extra=forbid`), though a profile PUT by the old code would drop it.

  ```mermaid
  flowchart TD
    AccountPage[AccountPage.tsx: link to prefs] --> TPP[TransportPreferencesPage.tsx]
    TPP --> WebApi[trips/api.ts: Profile type]
    TSP[TransportSearchPage.tsx] --> TApi[transport/api.ts]
    WebApi --> ProfileRouter[routers/profile.py: keep prefs on PUT]
    TApi --> TransportRouter[routers/transport.py]
    ProfileRouter --> ProfileStore[trips/profile_store.py: TransportPreferences]
    TransportRouter --> ProfileStore
    TransportRouter --> Options[transport/options.py: apply_preferences]
    Options --> Providers[transport/providers.py: seeded providers]
    TransportRouter --> Deps[routers/deps.py: get_transport_providers]
    classDef touched fill:#f96,color:#000
    class AccountPage,TPP,WebApi,TSP,TApi,ProfileRouter,TransportRouter,ProfileStore,Options,Providers,Deps touched
  ```

  The design is the approved prototype `TRAVEL-PLANNER-APP-STORY-040-design.html`. Its fixtures and "Preview as" switch are prototype-only. Any prototype-vs-UI-guidelines difference is resolved toward the guidelines. The guidelines say `.drawer` for editing in context, but the prototype uses a full page form, which I follow because the preferences are the page's whole purpose.

  The work item text contained no instructions beyond the change itself, so nothing was excluded from this plan.
review_focus: |
  IN scope are the preferences on the profile, the minimal seeded transport search that applies them, and the two prototype screens. Out of scope are accessibility and luggage needs, real provider integration, booking and fares, and the prototype demo switch. The riskiest area is `PUT /profile` replace semantics. The plan keeps stored preferences when the body omits the block, and the web `Profile` type must carry it, so other profile edits cannot wipe it. Maximum stops is deliberately a bounded integer (0 to 10) with 0, 1 and 2 as the offered radios plus a number input, per reviewer feedback and AC 10. The conveyance slice (`app/transport`) is deliberate because none exists yet, and it mirrors the stays module. Unset preferences must never exclude options, and the preferred provider only flags and ranks and never excludes.
