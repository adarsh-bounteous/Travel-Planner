summary: |
  Add a file-backed profile store for local mode, `PersistentProfileStore`, mirroring `PersistentTripStore`, and make `deps.get_profiles()` return it when `settings.local_mode` is on. Traveller profiles (including transport preferences) are written to `profiles.json` in `LOCAL_DATA_DIR` on every save and re-read at startup, so edits survive an API restart. The existing `/profile` router and the existing web Traveller profile screens are not touched, so the fields and controls stay identical to cloud mode and no screen is added. `POST /local/reset` also clears profiles. Refused saves (invalid values) already return 422 from the `Profile` model and the existing drawer shows its error; this plan pins that behaviour with local-mode tests rather than changing it.

scope:
  - description: |
      New `PersistentProfileStore(InMemoryProfileStore)` in its own module with its own data file `profiles.json` (NOT `store.json`: `PersistentTripStore` rewrites that file wholesale on each flush, so two stores sharing it would overwrite each other). `InMemoryProfileStore` gains a `reset()` that clears its dict, for the subclass to extend.

      ```python
      # app/trips/local_profile_store.py
      PROFILES_FILE_NAME = "profiles.json"
      PROFILES_FORMAT_VERSION = 1

      class PersistentProfileStore(InMemoryProfileStore):
          def __init__(self, data_file: LocalDataFile) -> None: ...  # super().__init__(); self._load()
          def save_profile(self, owner_id: str, profile: Profile) -> None: ...  # super() then _flush()
          def reset(self) -> None: ...  # super().reset() then _flush()

      # app/trips/profile_store.py
      class InMemoryProfileStore:
          def reset(self) -> None:
              self._profiles.clear()
      ```

      File shape: `{"version": 1, "profiles": [{"owner_id": "...", "profile": {...model_dump(mode="json")}}]}`. `_load` validates each record with `Profile.model_validate` and raises `LocalDataFileError(path)` on a wrong version or a malformed record (catch `KeyError, TypeError, AttributeError, ValidationError`), exactly like `PersistentTripStore._load`, so a corrupt file stops startup instead of being overwritten.
    files:
      - services/api/app/trips/local_profile_store.py
      - services/api/app/trips/profile_store.py
    rationale: |
      Reuses the proven `LocalDataFile` (atomic write via `os.replace`, lock, corruption error). A separate file keeps trips and profiles independent, with no read-modify-write coupling.

  - description: |
      Wire it by mode. In `app/routers/deps.py` add a cached `_local_profiles()` beside `_local_trips()` and change `get_profiles()`:

      ```python
      @lru_cache
      def _local_profiles() -> PersistentProfileStore:
          return PersistentProfileStore(LocalDataFile(get_settings().local_data_dir / PROFILES_FILE_NAME))

      def get_profiles() -> ProfileStore:
          return _local_profiles() if get_settings().local_mode else _profiles()
      ```

      In `app/main.py` lifespan, call `deps._local_profiles()` next to `deps._local_trips()` so an unreadable profiles file stops startup. In `app/routers/local_reset.py` add `deps._local_profiles().reset()` with the other resets (before the re-seed).
    files:
      - services/api/app/routers/deps.py
      - services/api/app/main.py
      - services/api/app/routers/local_reset.py
    rationale: |
      Dependency selection is the only seam; `routers/profile.py` already depends on `ProfileStore` and needs no change. Reset must clear profiles, or "Reset local data" would leave stale preferences for recreated accounts.

  - description: |
      Document `profiles.json` in the local-mode sections: what is kept, that it lives in `LOCAL_DATA_DIR` beside `store.json`, and how to delete or empty it to start fresh (a corrupt file stops startup, as for `store.json`). Update the "What is faked" table row for the Trip Database in `docs/local-setup.md` to also name `PersistentProfileStore`. `scripts/local-setup-docs.test.mjs` requires every backticked class name in that table's third column to exist as a `class` in the API source, so only name classes that exist, and run `node --test scripts/local-setup-docs.test.mjs` after editing.
    files:
      - docs/local-setup.md
      - services/api/README.md
    rationale: |
      The existing docs list what local mode fakes and where data lives; they would be wrong once profiles persist.

  - description: |
      New tests, written first (see `tests`): `services/api/tests/unit/test_local_profiles.py` (HTTP behaviour in local mode) and `services/api/tests/unit/test_persistent_profile_store.py` (store level); extend `services/api/tests/unit/test_local_reset_router.py` and `services/api/tests/unit/test_local_storage_startup.py`. Add `deps._local_profiles` to the cache-clearing lists of local fixtures that clear `deps._local_trips`.
    files:
      - services/api/tests/unit/test_local_profiles.py
      - services/api/tests/unit/test_persistent_profile_store.py
      - services/api/tests/unit/test_local_reset_router.py
      - services/api/tests/unit/test_local_storage_startup.py
    rationale: |
      TDD. `tests/conftest.py` already points `LOCAL_DATA_DIR` at a per-test tmp dir, so no test touches a real `.local-data`. The local fixtures do not use `sign_in_as`, so the conftest `get_profiles` override is not active in them.

  - description: |
      No web changes. Explicitly out of scope: any edit under `apps/web`. The web app already calls GET and PUT `/profile`; local mode is invisible to it.
    files: []
    rationale: |
      AC4 and AC5 require the existing screens, fields and controls unchanged and no new screen.

tests:
  - |
    AC1, written first, fails because `get_profiles()` still returns the Dynamo store. New `services/api/tests/unit/test_local_profiles.py` uses the `local` fixture pattern from `test_local_trips_invites_share.py` (LOCAL_MODE=true, `with TestClient(app)`, caches cleared including `deps._local_profiles`) and its `demo(local)` sign-in.

    ```python
    PREFS = {"modes": ["train"], "cabin": "economy", "departure_window": "morning", "max_stops": 1, "providers": []}
    BODY = {"display_name": "Maya", "home_city": "Manchester", "diet": "Vegetarian", "tastes": ["Food"], "transport_preferences": PREFS}

    client = demo(local)
    assert client.put("/profile", json=BODY).status_code == 200
    got = client.get("/profile").json()
    assert got["display_name"] == "Maya" and got["tastes"] == ["Food"]
    assert got["transport_preferences"]["modes"] == ["train"]
    assert deps.get_profiles() is deps._local_profiles()
    ```

    Cloud mode is covered by the existing conftest overrides of `get_profiles`.
  - |
    AC2, same file. Edit one detail and one preference, save, read back; also a PUT that omits `transport_preferences` keeps the stored block (the router rule still holds on the local store).

    ```python
    client.put("/profile", json={**BODY, "home_city": "Leeds"})
    client.put("/profile", json={**BODY, "home_city": "Leeds", "tastes": ["Food", "Museums"]})
    got = client.get("/profile").json()
    assert got["home_city"] == "Leeds" and got["tastes"] == ["Food", "Museums"]

    no_prefs = {k: v for k, v in BODY.items() if k != "transport_preferences"}
    client.put("/profile", json=no_prefs)
    assert client.get("/profile").json()["transport_preferences"]["modes"] == ["train"]
    ```
  - |
    AC3, same file, restart. A restart helper clears the caches a new process would rebuild (`auth._local_identity`, `auth._local_accounts`, `deps._local_trips`, `deps._local_profiles`) so the store is rebuilt from `profiles.json`; the client signs in again afterwards (accounts persist in the accounts file, so the user id is stable).

    ```python
    client.put("/profile", json={**BODY, "travel_style": "Relaxed", "transport_preferences": {**PREFS, "cabin": "business"}})
    restart()
    client = demo(local)
    got = client.get("/profile").json()
    assert got["travel_style"] == "Relaxed"
    assert got["transport_preferences"]["cabin"] == "business"
    ```
  - |
    Store level, new `test_persistent_profile_store.py`: round trip, corruption, isolation and reset.

    ```python
    path = tmp_path / "profiles.json"
    store = PersistentProfileStore(LocalDataFile(path))
    store.save_profile("u1", profile)
    assert PersistentProfileStore(LocalDataFile(path)).get_profile("u1") == profile
    assert PersistentProfileStore(LocalDataFile(path)).get_profile("u2") is None

    path.write_text('{"version": 99, "profiles": []}')
    with pytest.raises(LocalDataFileError):
        PersistentProfileStore(LocalDataFile(path))
    path.write_text('{"version": 1, "profiles": [{"profile": {}}]}')  # no owner_id
    with pytest.raises(LocalDataFileError):
        PersistentProfileStore(LocalDataFile(path))
    path.write_text('{"version": 1, "profiles": [{"owner_id": "u1", "profile": {"cabin": 1, "display_name": "' + "x" * 81 + '"}}]}')
    with pytest.raises(LocalDataFileError):  # invalid stored profile
        PersistentProfileStore(LocalDataFile(path))
    ```

    Also: a missing file and a 0-byte file start empty and merely constructing the store does not create the file; `reset()` empties memory and rewrites the file with `"profiles": []`; a corrupt file is left untouched on disk after the failed load.
  - |
    AC6, same file as AC1. A new account (sign-up through the local inbox, confirm, sign-in; reuse the `invitee`-style helper from `test_local_trips_invites_share.py`) gets a traveller profile shown on the profile screen: the API answers an empty `Profile()` for an owner with nothing stored, and it is editable and persists.

    ```python
    ana = invitee(demo(local))  # or a local helper doing the same sign-up flow
    r = ana.get("/profile")
    assert r.status_code == 200
    assert r.json()["display_name"] == "" and r.json()["tastes"] == []
    assert r.json()["transport_preferences"]["modes"] == []
    assert ana.put("/profile", json={**BODY}).status_code == 200
    ```
  - |
    AC7 and AC8, same file. An invalid detail or preference is refused with 422 (the existing `Profile` validation, which the drawer surfaces as its visible error), and the previously saved valid value is still shown, including after a restart and with the file on disk unchanged.

    ```python
    client.put("/profile", json=BODY)
    before = (tmp_path / "local-data" / "profiles.json").read_text()
    for bad in (
        {**BODY, "display_name": "x" * 81},
        {**BODY, "tastes": ["t"] * 21},
        {**BODY, "transport_preferences": {**PREFS, "cabin": "first"}},
        {**BODY, "transport_preferences": {**PREFS, "max_stops": 11}},
    ):
        assert client.put("/profile", json=bad).status_code == 422
    assert client.get("/profile").json()["display_name"] == "Maya"
    assert client.get("/profile").json()["transport_preferences"]["cabin"] == "economy"
    assert (tmp_path / "local-data" / "profiles.json").read_text() == before
    restart()
    assert demo(local).get("/profile").json()["display_name"] == "Maya"
    ```
  - |
    AC4 and AC5, guard. No route or web surface is added. API: the profile paths in OpenAPI are unchanged in local mode and no `/local/profile*` route exists.

    ```python
    paths = {p for p in app.openapi()["paths"] if "profile" in p}
    assert paths == {"/profile"}
    ```

    Web: `git diff --stat main -- apps/web` is empty, and the existing profile and transport preferences web tests run unchanged and pass (`cd apps/web && pnpm vitest run`, scoped to the profile and trips folders at their actual locations).
  - |
    Reset, extends `test_local_reset_router.py` (uses the `real_local` fixture from `test_local_seed_startup.py`). A profile saved before a reset is gone after it, and the file is empty.

    ```python
    with TestClient(app) as client:
        user_id = auth._local_identity().user_id_for("demo@example.com")
        deps._local_profiles().save_profile(user_id, Profile(display_name="Maya"))
        assert client.post("/local/reset", headers=RESET).status_code == 204
        assert deps._local_profiles().get_profile(user_id) is None
    ```
  - |
    Startup, extends `test_local_storage_startup.py`: an unreadable `profiles.json` stops startup with `LocalDataFileError` rather than being overwritten.

    ```python
    (tmp_path / "local-data").mkdir(parents=True)
    (tmp_path / "local-data" / "profiles.json").write_text("{not json")
    with pytest.raises(LocalDataFileError):
        with TestClient(app):
            pass
    ```
  - |
    Regression: cloud-mode and docs tests pass unchanged.

    ```
    cd services/api && uv run pytest
    node --test scripts/local-setup-docs.test.mjs
    ```

assumptions_or_open_questions:
  - |
    DESIGN CONFLICT, needs a reviewer decision. The approved prototype shows one "Traveller profile" form: Name, Email, Phone, Home city, Budget and Pace radios, Interests checkboxes, a Dietary select, Cancel and Save, a "Local storage" success badge reused from story 068, and a prototype-only "Prototype helper" card with a Restart API button. The real app has no such form: `ProfilePage.tsx` lists answer rows (citizenship, residence, health, religion, diet, tastes, travel style) edited one at a time in `ProfileAnswerDrawer`, and the API `Profile` model has no email, phone, budget or pace fields. AC4, AC5 and the item scope ("existing screens working unchanged; no new screens") say to keep the existing screens, so this plan does NO web work and does not build the prototype form. If the reviewer wants the prototype form built, that is a new screen plus new Profile fields and belongs in a separate item.
  - |
    The "Local storage" badge and the Restart API helper from the prototype are not planned: the badge belongs to story 068 and AC4 says the same controls as cloud mode; Restart API is marked "not part of the product UI" in the prototype itself.
  - |
    Profiles go in a separate `profiles.json` in `local_data_dir` rather than inside `store.json`, to avoid two stores overwriting one file. The alternative (a shared file with a shared writer) is a larger refactor of `PersistentTripStore`.
  - |
    Profiles are keyed by account user id. Demo seeding (`local_seed.py`) does not create a profile, so a new or demo account shows an empty `Profile()` ("Not answered" rows) until edited. This satisfies AC6; seeding a demo profile would be speculative and is left out.
  - |
    AC7 and AC8 rely on the existing behaviour: invalid values fail `Profile` validation (422) before the store is called, and the web drawer already shows its error and keeps the previous value when the save rejects. A new or different local-mode error message would be a web change and is out of scope.

estimated_points: 3

package_dependencies: []

notes: |
  ### Data & rollout
  - **Existing data**: None migrated. `profiles.json` is a new local-only file; absent or empty means a fresh start. `store.json` and the accounts SQLite file are not touched. Cloud mode (`DynamoProfileStore`, accounts table) is unchanged.
  - **Backfill / seed**: None. No demo profile is seeded.
  - **Settings**: No new env var. The file lives in the existing `LOCAL_DATA_DIR` (`settings.local_data_dir`) and is only used when `LOCAL_MODE` is true; `docs/local-setup.md` and `services/api/README.md` gain the `profiles.json` description.
  - **Provisioning**: Nothing. The directory is created on first write by `LocalDataFile.write`.
  - **Order and rollback**: Single deploy, local mode only. Rollback is reverting the code; a leftover `profiles.json` is harmless and can be deleted.

  ### Design
  I read the approved prototype `TRAVEL-PLANNER-APP-STORY-071-design.html`. No UI step is planned because it conflicts with AC4 and AC5 (see the first open question); the existing screens stay as they are.

  ### Flow
  ```mermaid
  flowchart TD
    Web[web ProfilePage] --> Router[routers/profile.py]
    Router --> Deps[routers/deps.py get_profiles]
    Deps -->|local_mode| Local[PersistentProfileStore]
    Deps -->|cloud| Dynamo[DynamoProfileStore]
    Local --> Mem[InMemoryProfileStore]
    Local --> DF[LocalDataFile profiles.json]
    Main[main.py lifespan] --> Deps
    Reset[routers/local_reset.py] --> Local
    classDef touched fill:#f96,color:#000
    class Deps,Local,Mem,Main,Reset touched
  ```
  Touched: `deps.py` (selects the store by mode), `local_profile_store.py` (new), `profile_store.py` (adds `reset`), `main.py` (fail-fast build at startup), `local_reset.py` (clear on reset). The router, the web app and `DynamoProfileStore` are untouched context.

review_focus: |
  IN: an API-only local profile store, its wiring by mode, startup fail-fast, reset, tests and docs. OUT: every `apps/web` change, new Profile fields and the prototype form (design conflict in the open questions; AC4 and AC5 win). Riskiest part is persistence correctness: flushing on every save, strict load validation that raises `LocalDataFileError` instead of overwriting, and not sharing `store.json` with the trip store; the separate `profiles.json` is deliberate, not an oversight.
