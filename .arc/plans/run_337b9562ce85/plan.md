summary: |
  With the shared local mode switch on (LOCAL_MODE=on in APP_ENV=local), `GET /places` is answered by a new
  `LocalPlaceSearch` that generates places from the searched destination (no outside call), so exploring and
  saving places work offline; with the switch off the existing `InMemoryPlaceSearch` (the current stand-in for the
  real Maps and Places adapter port) is used unchanged. An unmatched destination returns `[]`, which the existing
  results page already shows as an empty-results message. Save keeps using the existing Saved flow
  (`useSavedPlaces` -> `PUT /saved-places/{id}`). The switch itself gets a refusal path: a new
  `PUT /local/mode` refuses to turn local mode on in a live (non-local) deployment with a clear error and leaves the
  switch off, surfaced on a new Settings page (design screens "Settings" and "Settings with local mode refused").
scope:
  - description: |
      Add `places` to the shared switch so the places stand-in follows it like every other one.
      Before: `LocalStandIns(storage, sign_in, cloud_services)`; after: adds `places: bool`, and
      `stand_ins_for` sets it to `local_mode`.
      ```python
      @dataclass(frozen=True)
      class LocalStandIns:
          storage: bool
          sign_in: bool
          cloud_services: bool
          places: bool
      ```
    files:
      - services/api/app/local_mode.py
      - services/api/tests/unit/test_local_mode.py
      - services/api/tests/unit/test_startup_status_router.py
    rationale: |
      `/startup-status` exposes `stand_ins`; existing tests pin its exact key set, so they change with it.
  - description: |
      New `LocalPlaceSearch` implementing the existing `PlaceSearch` port. Pure and deterministic: folds the
      destination (case, accents, whitespace) and, for a destination in a small known set (Lisbon, Kyoto, Paris, as in
      the design), generates 3-4 `Place` records whose `id` is prefixed with the destination slug (so ids never
      collide across destinations and saved places stay distinct), names/areas/types from per-destination templates,
      lat/lng near the destination, `image_url` a local path or data-free placeholder (NOT picsum.photos, which is an
      outside request from the browser). Any other destination returns `[]`.
      ```python
      class LocalPlaceSearch:
          def search(self, destination: str) -> list[Place]: ...
      ```
    files:
      - services/api/app/places/local_search.py
    rationale: |
      Keeps generated data out of the seeded real-service catalogue in `search.py`, which stays untouched.
  - description: |
      Choose the search by the switch, like `get_trips`/`get_saved_places` do:
      ```python
      def get_places() -> PlaceSearch:
          return _local_places() if get_settings().local_mode else _places()
      ```
      with an `@lru_cache` `_local_places()` returning `LocalPlaceSearch()`. Add `PUT /local/mode` in a new router
      `local_mode.py` (prefix `/local`, registered in `main.py`): body `{"local_mode": bool}`. Turning it ON when
      `get_settings().environment != LOCAL_ENVIRONMENT` answers `ApiError(403, "local_mode_not_allowed")` (existing
      `{"code": ...}` shape) and changes nothing; the response to a successful or off request is
      `{"local_mode": <effective value>}`. The effective value is always `get_settings().local_mode` (the switch is
      read from the environment at startup, never mutated at runtime).
    files:
      - services/api/app/routers/deps.py
      - services/api/app/routers/local_mode.py
      - services/api/app/main.py
    rationale: |
      One injection point (`get_places`) means `routers/places.py` needs no change and the filtering by q/type/price
      keeps working over generated results.
  - description: |
      Web: surface the mode and the refusal using the approved design, reusing existing components.
      (1) `api.ts` in `apps/web/src/local/` (or `auth/api.ts` next to `fetchLocalMode`): `requestLocalMode(on: boolean)`
      throwing a typed error carrying the `code`. (2) New `SettingsPage` at route `/account/settings` (inside
      `RequireAuth`, linked from `AccountPage` with a `.btn-secondary` "Settings"): `.col stack` column, `<h1>Settings</h1>`,
      `fieldset` "Local mode" with two `.radio` inputs On/Off and `.field-hint` "Use generated places and other
      stand-ins instead of outside services." Choosing On calls the API; on refusal the radio returns to Off, a
      `.alert.alert-danger` (role=alert, `.alert-title` "Local mode is not allowed in live deployments", body "This
      is a live deployment, so the switch stays Off. Use a local or test deployment to turn it on.") stays on the page
      and the existing `.toast.is-open` pattern from `AccountPage` shows the same title. (3) `DestinationResultsPage`:
      when `fetchLocalMode()` is true show `.alert.alert-info` "Local mode is on. Places are generated here and no
      request goes to the outside places service." above the heading; when false show the design's
      `.alert-warning` "Local mode is off. Places come from the outside places service."; below a non-empty
      list a `.text-muted.text-sm` source note "N places generated locally for <query>." with the info icon.
    files:
      - apps/web/src/local/api.ts
      - apps/web/src/local/SettingsPage.tsx
      - apps/web/src/local/SettingsPage.test.tsx
      - apps/web/src/account/AccountPage.tsx
      - apps/web/src/App.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/places/DestinationResultsPage.test.tsx
    rationale: |
      AC 8/9 need a user-facing way to attempt the switch; AC 1-4 need the mode notice and the existing empty state
      (`No places match your search`) to be what the user sees. Tokens/classes only (`--color-*`, `.alert`, `.radio`,
      `.empty-state`, `.skeleton`) per UI guidelines; no new CSS beyond what the design adds (`.radio-group`).
  - description: |
      Document the new behaviour: places stand-in under local mode and `PUT /local/mode` refusal.
    files:
      - services/api/README.md
    rationale: |
      README already documents LOCAL_MODE and the other stand-ins.
tests:
  - |
    AC1 (services/api/tests/unit/test_local_places.py, written first, fails until LocalPlaceSearch + get_places exist):
    ```python
    def test_search_lists_places_for_the_destination(local_client):
        body = local_client.get("/places", params={"destination": "Lisbon"}).json()
        assert len(body) >= 3 and all(p["name"] for p in body)
    ```
  - |
    AC2 (same file): different destinations give different places, and ids never overlap.
    ```python
    def test_second_destination_differs_from_first(local_client):
        first = local_client.get("/places", params={"destination": "Lisbon"}).json()
        second = local_client.get("/places", params={"destination": "Kyoto"}).json()
        assert {p["id"] for p in first}.isdisjoint({p["id"] for p in second})
        assert [p["name"] for p in first] != [p["name"] for p in second]
    ```
    Web: DestinationResultsPage.test.tsx renders with `?q=Lisbon`, then `?q=Kyoto` (mocked `searchPlaces`) and asserts `screen.getByText('Bamboo Path Walk')` replaces the Lisbon names.
  - |
    AC3 (backend + web): unmatched query gives `[]`; page shows the empty-results message.
    ```python
    def test_unmatched_destination_is_empty(local_client):
        assert local_client.get("/places", params={"destination": "Zzyzx"}).json() == []
    ```
    ```tsx
    expect(await screen.findByText('No places match your search')).toBeInTheDocument()
    ```
  - |
    AC4 (web): with an empty result no place card or Save button is rendered.
    ```tsx
    expect(screen.queryAllByRole('button', { name: /^Save / })).toHaveLength(0)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    ```
  - |
    AC5 (backend): the real service and the network are never touched in local mode.
    ```python
    def test_local_search_never_uses_the_real_service(local_client, monkeypatch):
        def refuse(*a, **k):
            raise AssertionError("outside request")
        monkeypatch.setattr(deps, "_places", refuse)
        monkeypatch.setattr("socket.socket.connect", refuse)
        assert local_client.get("/places", params={"destination": "Paris"}).status_code == 200
    ```
    Also assert generated `image_url` values do not start with `http` (no browser request to an outside host).
  - |
    AC6 (backend + web): a generated place can be saved through the existing Saved flow.
    ```python
    def test_generated_place_can_be_saved(local_client):
        local_client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        place = local_client.get("/places", params={"destination": "Lisbon"}).json()[0]
        assert local_client.put(f"/saved-places/{place['id']}", json=place).status_code == 200
        assert [p["id"] for p in local_client.get("/saved-places").json()] == [place["id"]]
    ```
    Web: clicking Save on a card calls `savePlace` (existing `useSavedPlaces` path) and the card shows the saved state.
  - |
    AC7 (backend): with the switch off, `get_places` returns the real-service adapter.
    ```python
    def test_switch_off_uses_the_real_places_service(monkeypatch):
        monkeypatch.delenv("LOCAL_MODE", raising=False)
        assert deps.get_places() is deps._places()
    ```
    Existing `test_places_router.py` / `test_place_search.py` keep passing unchanged (Lisbon/Paris/Oslo seeded catalogue). Web: with `fetchLocalMode` false the `.alert-warning` "Local mode is off." notice shows.
  - |
    AC8 (backend + web): turning on in a live deployment is refused with a clear error.
    ```python
    def test_turning_on_in_live_deployment_is_refused(monkeypatch):
        monkeypatch.delenv("LOCAL_MODE", raising=False)
        monkeypatch.setenv("APP_ENV", "production")
        with TestClient(app) as client:
            r = client.put("/local/mode", json={"local_mode": True})
        assert (r.status_code, r.json()) == (403, {"code": "local_mode_not_allowed"})
    ```
    ```tsx
    await user.click(screen.getByRole('radio', { name: 'On' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Local mode is not allowed in live deployments')
    ```
  - |
    AC9 (backend + web): the switch stays off.
    ```python
    assert client.get("/startup-status").json()["local_mode"] is False
    ```
    ```tsx
    expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'On' })).not.toBeChecked()
    ```
  - |
    Contract tests: `test_local_mode.py` updated so `stand_ins_for(True) == LocalStandIns(storage=True, sign_in=True, cloud_services=True, places=True)` and `test_stand_ins_flip_together` still passes; `test_startup_status_router.py` key set becomes `{"storage", "sign_in", "cloud_services", "places"}`.
assumptions_or_open_questions:
  - |
    The "real places service" today is `InMemoryPlaceSearch(SEED_CATALOGUE)` behind the `PlaceSearch` port (no real
    Maps and Places adapter exists yet), so AC7 is satisfied by leaving that path unchanged when the switch is off.
  - |
    The switch is read from the environment at startup (`LOCAL_MODE` + `APP_ENV`) and there is no runtime toggle
    today. `PUT /local/mode` therefore only has a defined effect for the refusal (live deployment). In a local
    environment I plan to return the current effective value (200) without changing it; actually flipping it at
    runtime would need persisted state and is out of scope. Please confirm, or say if a local toggle is wanted.
  - |
    Design vs existing app (conflict, not silently resolved): the design shows a dedicated narrow `.inbox-col` Places
    page with a text search, a `.stack` of plain cards (name, type badge, area, Save button that becomes a disabled
    "Saved") and finer type labels (Food market, Café, Bakery, Viewpoint). The app already has Explore
    `DestinationSearch` -> `DestinationResultsPage` (`.grid` of `PlaceCard`, filters, map, heart-style toggle) and a
    fixed `PlaceType` enum (landmark, museum, park, food, shopping) shared with saved places. I plan to keep the
    existing pages and enum (AC6 says "existing Saved flow") and take only the design's mode notices, "generated
    locally" note, empty state wording intent, and the Settings / refused screens. Generated places therefore use the
    enum labels, not the design's finer labels. Say if you want the narrow list layout rebuilt instead.
  - |
    Design empty-state copy is "No places found for that destination." while the existing page says "No places match
    your search"; I keep the existing copy to avoid churning other tests. Easy to switch.
  - |
    Generated destinations are limited to Lisbon, Kyoto and Paris (the design's fixtures) so AC3 has unmatched queries;
    matching ignores case, accents and whitespace like the existing search.
  - |
    The Settings page sits at `/account/settings` under Account (the design marks `data-nav="account"`); it is reachable
    from a link on AccountPage. The design's Settings screen has no explicit pending state beyond a ~300ms wait; I show
    the radios disabled while the request is in flight.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None. No schema, stored data shape, seed or migration changes: generated places are computed per request and never
  stored. Saved places written from generated results use the existing saved-places local file store unchanged. No
  new env var or setting (reuses `LOCAL_MODE` / `APP_ENV`, already documented in `services/api/README.md`). Nothing to
  provision; deploy API and web in any order (the web calls only the new `PUT /local/mode`, which fails soft to the
  error alert); rollback is a plain revert.

  ### Shape

  ```mermaid
  flowchart TD
    Places[routers/places.py]:::ctx --> GetPlaces[routers/deps.py get_places]:::touched
    GetPlaces -->|switch off| Real[places/search.py InMemoryPlaceSearch]:::ctx
    GetPlaces -->|switch on| Local[places/local_search.py LocalPlaceSearch]:::touched
    Mode[local_mode.py stand_ins_for]:::touched --> Startup[routers/startup_status.py]:::ctx
    LM[routers/local_mode.py PUT /local/mode]:::touched --> Cfg[config.py get_settings]:::ctx
    Main[main.py]:::touched --> LM
    Web[DestinationResultsPage + SettingsPage]:::touched --> Places
    Web --> LM
    Web --> Saved[routers/saved_places.py]:::ctx
    classDef touched fill:#f96,color:#000
    classDef ctx fill:#e5e7eb,color:#000
  ```

  `local_mode.py` (new router) is a new file next to the existing `local_inbox.py` / `local_reset.py`; its name
  collides with `app/local_mode.py`, so import it as `from app.routers import local_mode as local_mode_router` in
  `main.py` (or name the file `local_mode_switch.py`).

  Implementation order (TDD): backend tests for AC1-9 first (red), then `LocalPlaceSearch`, `get_places`, router,
  stand-in flag; then web tests (red), then SettingsPage / notices.
review_focus: |
  IN: generated places behind the existing `PlaceSearch` port chosen in `deps.get_places`, the `places` stand-in flag,
  a refusal-only `PUT /local/mode`, and the Settings page plus mode notices. OUT: saved-places storage, other stand-ins,
  any runtime flipping of the switch, rebuilding the Explore/results pages to the design's narrow layout.
  Riskiest: AC5 (any `picsum.photos` image_url or a call to the seeded real catalogue would break "no outside request")
  and the `/startup-status` key-set change that other tests pin. The design-vs-app conflicts (layout, type labels, empty
  copy) are deliberate and listed under open questions.
