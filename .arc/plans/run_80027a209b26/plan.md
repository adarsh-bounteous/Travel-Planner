summary: |
  Add one explicit local mode switch to the Trip Planner API: a `LOCAL_MODE` setting that is off when unset, an `APP_ENV` environment name, and a deployment guard that refuses to start when local mode is on and the environment name is not `local`. A small `LocalStandIns` value (storage, sign-in, cloud services) is derived from the switch so every future stand-in reads the same single source: all off when local mode is off, all on when it is on. A read-only `GET /startup-status` reports the result. The stand-ins themselves, storage, sign-in, seeding, web wiring and docs belong to sibling stories and are not built here.
scope:
  - description: |
      New module `app/local_mode.py` holding the pure rules, no I/O beyond reading a mapping:

      ```python
      class LocalModeRefusedError(RuntimeError): ...

      @dataclass(frozen=True)
      class LocalStandIns:
          storage: bool
          sign_in: bool
          cloud_services: bool

      def resolve_local_mode(env: Mapping[str, str]) -> tuple[str, bool]:
          """Return (environment, local_mode). Raises LocalModeRefusedError."""

      def stand_ins_for(local_mode: bool) -> LocalStandIns: ...
      ```

      Rules: `LOCAL_MODE` unset/empty/`false`/`off`/`0` is off; `true`/`on`/`1`/`yes` (case-insensitive) is on; any other value raises (fail closed, a typo must not silently pick a side). `APP_ENV` unset or empty is `production`. Local mode on with an environment other than exactly `local` raises with a message that says what happened and what to do ("Local mode is on, but this environment is not local. Set LOCAL_MODE to off, or run in the local environment.").
    files:
      - services/api/app/local_mode.py
    rationale: |
      One place owns the switch and the guard so sibling stories (storage, sign-in, cloud services) read the same flag instead of each parsing env vars.
  - description: |
      Extend `Settings` in `app/config.py` with defaulted fields so existing `replace(get_settings(), ...)` callers in tests keep working, and fill them in `get_settings()`:

      ```python
      environment: str = "production"
      local_mode: bool = False
      ```

      `get_settings()` calls `resolve_local_mode(os.environ)`, so a refused combination raises everywhere settings are read.
    files:
      - services/api/app/config.py
    rationale: |
      Settings is the existing single reader of env vars; the switch belongs next to the others.
  - description: |
      In `app/main.py` the `lifespan` keeps `session_secret()` and adds `get_settings()` before `yield`, so startup is refused (the exception propagates out of lifespan) when the guard trips. Add router `app/routers/startup_status.py` with `GET /startup-status` returning `{"environment": ..., "local_mode": bool, "stand_ins": {"storage": bool, "sign_in": bool, "cloud_services": bool}}` built from `get_settings()`, and include it in `main.py`.
    files:
      - services/api/app/main.py
      - services/api/app/routers/startup_status.py
    rationale: |
      Gives AC1, AC2, AC3 and AC5 an observable "reported as" surface and wires the guard into startup (AC4). `/health` is left untouched so its existing unit and e2e equality assertions still hold.
  - description: |
      Document `LOCAL_MODE` (default off) and `APP_ENV` (default `production`) with the guard rule in a short `services/api/README.md` section "Local mode".
    files:
      - services/api/README.md
    rationale: |
      Settings must be documented where they are defined; the fuller developer docs belong to a sibling story.
tests:
  - |
    AC1, services/api/tests/unit/test_local_mode.py (write first, fails until the module exists):

    ```python
    def test_unset_means_off(monkeypatch):
        monkeypatch.delenv("LOCAL_MODE", raising=False)
        monkeypatch.delenv("APP_ENV", raising=False)
        assert get_settings().local_mode is False
        assert get_settings().environment == "production"
    ```
    Also parametrised: `""`, `"false"`, `"off"`, `"0"` all give off.
  - |
    AC2, same file:

    ```python
    def test_explicit_on_in_local(monkeypatch):
        monkeypatch.setenv("LOCAL_MODE", "true")
        monkeypatch.setenv("APP_ENV", "local")
        assert get_settings().local_mode is True
    ```
    Parametrised over `true`, `on`, `1`, `YES`. An unrecognised value such as `"ture"` raises:
    `with pytest.raises(LocalModeRefusedError): resolve_local_mode({"LOCAL_MODE": "ture", "APP_ENV": "local"})`.
  - |
    AC3, same file plus route test in services/api/tests/unit/test_startup_status_router.py:

    ```python
    def test_off_means_no_stand_in():
        assert stand_ins_for(False) == LocalStandIns(storage=False, sign_in=False, cloud_services=False)

    def test_status_off_matches_production(monkeypatch):
        monkeypatch.delenv("LOCAL_MODE", raising=False)
        body = TestClient(app).get("/startup-status").json()
        assert body["local_mode"] is False
        assert not any(body["stand_ins"].values())
    ```
    Also assert `GET /health` still returns `{"status": "ok"}` so behaviour with the switch off is unchanged.
  - |
    AC4, unit and startup level:

    ```python
    @pytest.mark.parametrize("env", ["production", "staging", "", "LOCAL-ish"])
    def test_on_outside_local_is_refused(env):
        with pytest.raises(LocalModeRefusedError, match="not local"):
            resolve_local_mode({"LOCAL_MODE": "on", "APP_ENV": env})

    def test_startup_refused(monkeypatch):
        monkeypatch.setenv("LOCAL_MODE", "on")
        monkeypatch.setenv("APP_ENV", "staging")
        with pytest.raises(LocalModeRefusedError):
            with TestClient(app):
                pass
    ```
    Entering TestClient as a context manager runs lifespan, so this proves the app does not start. Also: unset `APP_ENV` with local mode on is refused.
  - |
    AC5, same files:

    ```python
    def test_on_enables_every_stand_in():
        assert stand_ins_for(True) == LocalStandIns(storage=True, sign_in=True, cloud_services=True)

    def test_status_on_in_local(monkeypatch):
        monkeypatch.setenv("LOCAL_MODE", "true")
        monkeypatch.setenv("APP_ENV", "local")
        with TestClient(app) as client:
            body = client.get("/startup-status").json()
        assert body["local_mode"] is True
        assert all(body["stand_ins"].values())
    ```
    A structural check asserts that `LocalStandIns` fields all flip together: `all(getattr(on, f.name) for f in fields(on))` and `not any(...)` for off, so a stand-in added later cannot be forgotten.
  - |
    Services/api/tests/e2e/test_startup_status_e2e.py: httpx ASGITransport call to `/startup-status` with no env set returns 200 and `local_mode` false, mirroring `test_health_e2e.py`.
assumptions_or_open_questions:
  - |
    The environment name has no existing setting, so this plan introduces `APP_ENV` (unset means `production`). A different variable name is a one-line change if the project already has a convention elsewhere (infra is not in this repo).
  - |
    The prototype shows a web "Startup status" page with an Off/On radio, a "Start app" button and a prototype-only simulated environment select. That conflicts with the acceptance criteria and scope: the switch is a startup setting read from the environment, not a runtime toggle, and a clickable toggle in a deployed UI would defeat the deployment guard. This plan therefore does NOT build a web page; the API exposes the same states read-only. The prototype's wording (refusal message "Local mode is On, but this environment is not local. The app will not start." and hint "Set local mode to Off, or run in the local environment.") is reused for the API error. If the reviewer wants the read-only web status page (badge, stand-in list, refusal screen) in this story, it is an added web task using `.card`, `.badge`, `.alert` as the prototype shows.
  - |
    The three stand-ins named (storage, sign-in, cloud services) come from the prototype list. Sibling stories may add more; they extend `LocalStandIns` and the structural test keeps them following the switch.
  - |
    Invalid `LOCAL_MODE` values are refused rather than treated as off. This is stricter than the ACs but follows "safe defaults".
  - |
    Mangum on Lambda runs lifespan on cold start, so a refusal there fails the function init. Not verified in this repo, since the handler wiring was not read.
estimated_points: 2
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: None. No schema, stored data or migration is touched.
  - **Backfill / seed**: None. Seeding the demo user and sample trips is a sibling story.
  - **Settings**: `LOCAL_MODE` (default off when unset) and `APP_ENV` (default `production` when unset). Both are safe when unset, because the app behaves like production. Documented in `services/api/README.md`.
  - **Provisioning**: Nothing is required in deployed environments. Developers who want local mode set `LOCAL_MODE=true` and `APP_ENV=local`.
  - **Order and rollback**: No ordering constraint. Rollback is reverting the code; the new variables are ignored by older code. A deployed environment that has `LOCAL_MODE` on by mistake will now fail to start, which is the intended guard.

  ```mermaid
  flowchart TD
    main[app/main.py lifespan]:::touched -->|refuse start on guard error| config[app/config.py get_settings]:::touched
    config -->|parse switch and guard| lm[app/local_mode.py]:::touched
    status[routers/startup_status.py]:::touched -->|report mode and stand-ins| config
    status --> lm
    main -->|include router| status
    main --> health[routers/health.py]
    deps[routers/deps.py] -->|existing reader| config
    classDef touched fill:#f96,color:#000
  ```

  The pre-existing `session_secret()` check in lifespan stays first, and `deps.py` and the auth router keep calling `get_settings()` unchanged because the new fields are defaulted.
review_focus: |
  IN: the single switch, the deployment guard, a derived stand-in flag set and a read-only status endpoint. OUT: any actual stand-in, local storage, sign-in, seeding, web page or developer docs beyond a short README section. Riskiest part is `get_settings()` now able to raise, so check that unset env and the existing `replace(get_settings(), ...)` test usage still pass. Not building the prototype's interactive web toggle is deliberate and explained in the open questions.
