summary: |
  Add a secrets reader (`get_secret`) that reads the environment in local mode and AWS Secrets Manager outside it, where a missing or failing lookup means "not configured" and never stops startup. Add a small provider registry (name, kind, the secret key it needs, health state) and list every registered provider in `GET /startup-status`, plus a local-mode-only `GET /providers/status` (404 outside local mode). Health state is one of configured, healthy, degraded, open circuit, not configured.
scope:
  - description: |
      New `app/secrets.py`. `get_secret(name, *, local_mode, env=os.environ, client=None) -> str | None`.
      Local mode returns `env.get(name) or None`. Outside local mode it calls Secrets Manager `get_secret_value(SecretId=name)` and returns `SecretString`; it never reads the environment there. Any exception (ClientError, missing secret, no credentials, botocore error) or empty value returns None. The boto3 client is created lazily inside the function, as the other adapters do, so local mode never imports or calls boto3.
    files:
      - services/api/app/secrets.py
    rationale: |
      AC 1, 2, 8, 9 and 4. A None result is the single "not configured" signal and nothing raises into startup.
  - description: |
      New `app/providers/registry.py` with `HealthState` (a str Enum with values `configured`, `healthy`, `degraded`, `open circuit`, `not configured`) and `ProviderEntry(name, kind, secret_key, breaker=None)`, which holds the optional `CircuitBreaker` already in `app/integrations/breaker.py`. `ProviderRegistry.register(entry)` and `.statuses(secret_reader) -> list[dict]` return `{"name", "kind", "health"}` for every entry. Health rules: secret missing means not configured; breaker open (`allow()` would refuse, read without consuming the trial slot, so add a read-only `is_open` property to `CircuitBreaker`) means open circuit; otherwise configured. `healthy` and `degraded` are in the enum and are set only through an explicit `health_override` hook the adapters can use later, because no adapter calls the integration client yet.
      A default registry lists the providers the ADRs name (maps and places, flight and hotel search, identity, email), each with its secret key name, for example `PLACES_API_KEY`. The exact names are an open question below.
    files:
      - services/api/app/providers/__init__.py
      - services/api/app/providers/registry.py
      - services/api/app/integrations/breaker.py
    rationale: |
      AC 3, 5, 6, 10. Reuses the existing breaker rather than a second one.
  - description: |
      Extend `startup_status()` with `"providers": registry.statuses(...)`, with the secret reader bound to `settings.local_mode`. Add a `providers_status` route `GET /providers/status` in a new router guarded by the existing `Depends(require_local_mode)` from `app/routers/deps.py`, which raises `ApiError(404, "not_found")`. Include the router in `app/main.py`. Add a `get_provider_registry()` dependency (lru_cached) in deps so tests can swap it.
    files:
      - services/api/app/routers/startup_status.py
      - services/api/app/routers/providers_status.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      AC 4, 5, 6, 7, 11. The lifespan is not changed: nothing in it reads a secret, so a missing key cannot block startup.
  - description: |
      Document that the keys are read from the environment locally and from Secrets Manager otherwise, the new endpoint, and the IAM permission `secretsmanager:GetSecretValue`.
    files:
      - services/api/README.md
    rationale: Settings and provisioning are documented where the other env vars are.
tests:
  - |
    AC1, in `services/api/tests/unit/test_secrets.py`, written first:
    ```python
    def test_local_mode_returns_env_value():
        assert get_secret("X", local_mode=True, env={"X": "abc"}) == "abc"
    ```
  - |
    AC2, with a fake Secrets Manager client injected, so no network and no boto3 call:
    ```python
    def test_outside_local_mode_reads_secrets_manager():
        client = FakeSecretsClient({"X": "stored"})
        assert get_secret("X", local_mode=False, env={}, client=client) == "stored"
    ```
  - |
    AC3, in `services/api/tests/unit/test_providers_status.py` using TestClient, LOCAL_MODE=true, APP_ENV=local, and the key deleted from the environment:
    ```python
    entry = next(p for p in body["providers"] if p["name"] == "places")
    assert entry["health"] == "not configured"
    ```
  - |
    AC4, with every provider key unset:
    ```python
    with TestClient(app) as client:
        assert client.get("/startup-status").status_code == 200
    ```
  - |
    AC5, with a test registry holding two entries swapped in through the `get_provider_registry` override:
    ```python
    assert {p["name"] for p in body["providers"]} == {"alpha", "beta"}
    ```
  - |
    AC6:
    ```python
    assert body["providers"][0].keys() == {"name", "kind", "health"}
    ```
  - |
    AC7, in local mode:
    ```python
    r = client.get("/providers/status")
    assert r.status_code == 200
    assert {p["name"] for p in r.json()["providers"]} == registered_names
    ```
  - |
    AC8, outside local mode with the key set only in the environment and a fake Secrets Manager client that holds no such secret:
    ```python
    assert entry["health"] == "not configured"
    ```
  - |
    AC9, outside local mode with a Secrets Manager client that raises `ClientError`:
    ```python
    assert get_secret("X", local_mode=False, client=RaisingClient()) is None
    assert entry["health"] == "not configured"
    ```
  - |
    AC10, parametrised over a not-configured provider, a configured provider, and a provider whose breaker is open:
    ```python
    assert entry["health"] in {"configured", "healthy", "degraded", "open circuit", "not configured"}
    assert open_entry["health"] == "open circuit"
    ```
  - |
    AC11, outside local mode (LOCAL_MODE unset):
    ```python
    r = client.get("/providers/status")
    assert (r.status_code, r.json()) == (404, {"code": "not_found"})
    ```
  - |
    Narrow run command, per task: `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_secrets.py tests/unit/test_providers_status.py tests/unit/test_startup_status_router.py)`. The existing startup-status tests must still pass.
assumptions_or_open_questions:
  - |
    No outbound adapter uses `IntegrationClient` yet (searched `app/` for `ProviderSettings(` and `IntegrationClient(`: no matches), so the registry cannot be filled from real adapters. I assume a static default registry of the providers named in ADR-0007 to ADR-0010, with placeholder key names (for example `PLACES_API_KEY`, `FLIGHT_SEARCH_API_KEY`, `HOTEL_SEARCH_API_KEY`, `EMAIL_API_KEY`). Please confirm the names and kinds.
  - |
    `healthy` and `degraded` have no producer until adapters report call outcomes. In this item a provider that has its key and a closed breaker reports `configured`. Say if you want health fed from the integration client's call results in this item.
  - |
    Outside local mode each `GET /startup-status` call would do a Secrets Manager lookup per provider. I assume a small in-process cache is not needed now and can be added later. Say if you want it, given the Lambda latency NFR.
  - |
    Secret values are never put in a response or a log line; only the health state is exposed.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: none, nothing stored changes. No migration.
  - **Backfill / seed**: not needed.
  - **Settings**: no new env var is read by the app itself. The provider key env names (placeholders above) are read in local mode only. Unset is safe: the provider shows not configured. Documented in `services/api/README.md`.
  - **Provisioning**: outside local mode, the Lambda role needs `secretsmanager:GetSecretValue` on each provider secret, and the secrets must exist under the same names as the keys. Until then providers show not configured and the app still runs.
  - **Order and rollback**: grant the permission and create the secrets before or after deploy, in either order. Roll back by reverting the code, as nothing is persisted.

  ```mermaid
  flowchart TD
    main[app/main.py] --> ss[routers/startup_status.py]
    main --> ps[routers/providers_status.py]
    ss --> reg[providers/registry.py]
    ps --> reg
    ps --> deps[routers/deps.py require_local_mode]
    reg --> sec[secrets.py]
    reg --> br[integrations/breaker.py]
    sec --> cfg[config.py get_settings local_mode]
    classDef touched fill:#f96,color:#000
    class main,ss,ps,reg,sec,br,deps touched
  ```

  `config.py` is only read, not changed. boto3 is already a dependency (`pyproject.toml`), so no package is added. Tests inject a fake client so none touches AWS.
review_focus: |
  IN: `get_secret`, the registry, the two endpoints, a read-only `is_open` on the breaker, and the README. OUT: wiring real adapters, feeding healthy or degraded from call results, and any caching of secrets. Riskiest part: outside local mode `get_secret` must never fall back to the environment (AC 8) and must swallow every lookup failure (AC 9), or startup-status could 500. The placeholder key names are deliberate and are in the open questions.
