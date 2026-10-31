summary: |
  Add a test-only kit to the Trip Planner API so developers can test adapters against real-shaped data safely, and so every adapter of a port is held to the same rules. Two parts: (1) a recorder/replayer built on httpx transport interception (the one documented mock approach, the same seam `IntegrationClient(transport=...)` already exposes) that records a live response once, scrubs API keys and personal data before it is written, never overwrites an existing fixture, never sends a live request when a fixture exists, and replays offline; (2) a reusable contract-test helper that runs one list of rules against every adapter of a port and names the failing adapter, wired to the existing store contract rules without changing them. The API README gains a "How to add a new adapter" section and a single replay-approach description.
scope:
  - description: |
      Recording and replay transports (test kit, no production code). Signatures:

      ```python
      class RecordingTransport(httpx.BaseTransport):
          def __init__(self, fixtures_dir: Path, live: httpx.BaseTransport,
                       *, secrets: Iterable[str] = ()) -> None: ...
          def handle_request(self, request: httpx.Request) -> httpx.Response: ...

      class ReplayTransport(httpx.BaseTransport):
          def __init__(self, fixtures_dir: Path) -> None: ...
          def handle_request(self, request: httpx.Request) -> httpx.Response: ...  # raises FixtureMissing, never touches the network

      def fixture_key(request: httpx.Request, credential_params: Iterable[str] = ()) -> str: ...
      ```

      RecordingTransport: compute the key (method, URL without credential query params, sorted params, body hash); if `<key>.json` exists return it and do NOT call `live` (AC5, AC6); otherwise call `live`, scrub, write the fixture, return the scrubbed response (AC1). Fixtures store status, safe headers (no Set-Cookie/Authorization) and body only, never the request headers or query, so a key sent as a header or param cannot leak. Replay builds an httpx.Response from the fixture (AC7).
    files:
      - services/api/tests/unit/integrations_support/recorded.py
    rationale: |
      Mirrors how the existing tests already inject `httpx.MockTransport` into `IntegrationClient`, so one approach (HTTP client interception) serves recording and replay with no change to adapters.
  - description: |
      Scrubber used by the recorder:

      ```python
      def scrub_body(body: bytes, *, secrets: Iterable[str]) -> bytes: ...
      ```

      JSON bodies are walked recursively: values under personal-data field names (name, first_name, last_name, email, phone, address, postal_address, street, city, postcode/zip, dob, date_of_birth, birthdate, matched case-insensitively) become `"[scrubbed]"`; every remaining string has email addresses and phone numbers replaced by regex (AC4) wherever they appear; every exact secret value (the request's credential param/header values plus `secrets`) is replaced everywhere in the serialised text, including inside non-JSON bodies (AC2). Non-JSON bodies get only the regex and secret passes.
    files:
      - services/api/tests/unit/integrations_support/scrub.py
    rationale: |
      Kept separate from the transport so it is unit-testable on its own and cannot be skipped by the recorder.
  - description: |
      Contract-test helper, generalising the existing store contract pattern (rule_* functions taking a bundle, run by parametrised fixtures):

      ```python
      def collect_rules(*modules) -> list[Callable]: ...      # every rule_* function in the modules, sorted by name
      def contract_params(adapters: Mapping[str, Callable]) -> list: ...   # pytest.param(factory, id=adapter name)
      def run_contract(port: str, adapters: Mapping[str, Callable], rules: Sequence[Callable]) -> None: ...
      ```

      `run_contract` applies the identical rule list to every adapter and, if any rule raises AssertionError, raises one AssertionError whose message names the adapter and the rule, e.g. `adapter 'local' broke rule_saving_twice_keeps_one_entry` (AC8, AC9). The store port is wired by adding `STORE_RULES = collect_rules(rules_trips, rules_invites, rules_share_links, rules_accounts, rules_profiles, rules_saved_places)` and a `STORE_ADAPTERS` mapping (local plus cloud, cloud skipped when tables are absent) in store_contract; existing rules_*.py, test_*_contract.py, conftest.py and mutants.py are left unchanged (AC11).
    files:
      - services/api/tests/unit/contract_kit.py
      - services/api/tests/unit/store_contract/stores.py
    rationale: |
      Follows the existing store contract pattern. Adding the wiring in stores.py (an additive edit) lets the helper reuse the existing rules, so the checks are exactly the existing ones.
  - description: |
      README: add a `## How to add a new adapter` section (port in app/<area>/providers.py, adapter calls only `IntegrationClient`, declare a `ProviderSettings`, register in the contract suite via `contract_params`/`run_contract`, record a fixture with `RecordingTransport`) and a `### Replaying responses in tests` subsection that describes exactly one approach: HTTP client interception through an httpx transport passed to `IntegrationClient`. It mentions where fixtures live, that scrubbing is automatic, that an existing fixture is never overwritten or re-fetched, and does not describe any alternative replay tool.
    files:
      - services/api/README.md
    rationale: |
      AC10 and AC12.
  - description: |
      Fixture directory for recorded responses plus a small stub live transport used only by the kit's own tests.
    files:
      - services/api/tests/unit/fixtures/recorded/.gitkeep
    rationale: |
      Fixtures committed after scrubbing are the replay source; the directory must exist for the recorder to write to.
tests:
  - |
    AC1, new file services/api/tests/unit/test_recorded_responses.py. Written first, fails on missing module:
    ```python
    def test_recording_a_new_call_stores_a_replayable_fixture(tmp_path):
        live = httpx.MockTransport(lambda r: httpx.Response(200, json={"ok": 1}))
        client = httpx.Client(transport=RecordingTransport(tmp_path, live))
        client.get("https://api.example/x")
        assert len(list(tmp_path.glob("*.json"))) == 1
        replay = httpx.Client(transport=ReplayTransport(tmp_path))
        assert replay.get("https://api.example/x").json() == {"ok": 1}
    ```
  - |
    AC2, API key absent from the stored fixture (key sent as query param and echoed in the body):
    ```python
    def test_api_key_is_not_stored(tmp_path):
        live = httpx.MockTransport(lambda r: httpx.Response(200, json={"echo": "key=SECRET123"}))
        httpx.Client(transport=RecordingTransport(tmp_path, live, secrets=["SECRET123"])).get(
            "https://api.example/x", params={"key": "SECRET123"}, headers={"X-Api-Key": "SECRET123"})
        assert all("SECRET123" not in p.read_text() for p in tmp_path.glob("*.json"))
    ```
  - |
    AC3, parametrised over the five personal-data fields:
    ```python
    @pytest.mark.parametrize("field, value", [("name", "Ada Lovelace"), ("email", "ada@lovelace.org"),
        ("phone", "+44 20 7946 0958"), ("address", "12 St James Sq, London"), ("date_of_birth", "1815-12-10")])
    def test_personal_field_is_not_stored(tmp_path, field, value):
        ...  # record {"guest": {field: value}}
        assert value not in stored_text(tmp_path)
    ```
  - |
    AC4, email and phone in a field not named as personal data:
    ```python
    def test_email_and_phone_in_any_field_are_scrubbed(tmp_path):
        ...  # record {"notes": "write to bob@example.com or call +1 415 555 0100"}
        text = stored_text(tmp_path)
        assert "bob@example.com" not in text and "415 555 0100" not in text
    ```
  - |
    AC5, existing fixture content unchanged:
    ```python
    def test_existing_fixture_is_not_rewritten(tmp_path):
        record_once(tmp_path, body={"v": 1})
        path = next(tmp_path.glob("*.json")); before = path.read_bytes()
        record_once(tmp_path, body={"v": 2})
        assert path.read_bytes() == before
    ```
  - |
    AC6, no live request when a fixture exists:
    ```python
    def test_no_live_request_when_fixture_exists(tmp_path):
        record_once(tmp_path, body={"v": 1})
        calls = []
        live = httpx.MockTransport(lambda r: calls.append(r) or httpx.Response(200, json={}))
        httpx.Client(transport=RecordingTransport(tmp_path, live)).get("https://api.example/x")
        assert calls == []
    ```
  - |
    AC7, replay offline: the replay transport has no live transport at all, and a socket guard fails the test on any connection.
    ```python
    def test_replay_without_network(tmp_path, monkeypatch):
        record_once(tmp_path, body={"v": 1})
        monkeypatch.setattr(socket.socket, "connect", lambda *a, **k: pytest.fail("network used"))
        resp = IntegrationClient([SETTINGS], transport=ReplayTransport(tmp_path)).request("fake-echo", "GET", "/x")
        assert resp.json() == {"v": 1}
    ```
    Also `ReplayTransport` raises `FixtureMissing` for an unrecorded call.
  - |
    AC8, new file services/api/tests/unit/test_contract_kit.py. The helper runs identical rules on each adapter:
    ```python
    def test_every_adapter_gets_the_same_rules():
        seen = {}
        rules = [lambda a: seen.setdefault(a.name, []).append("r1"), lambda a: seen[a.name].append("r2")]
        run_contract("demo", {"a": lambda: Adapter("a"), "b": lambda: Adapter("b")}, rules)
        assert seen == {"a": ["r1", "r2"], "b": ["r1", "r2"]}
    ```
  - |
    AC9, a broken adapter fails the suite naming that adapter, using an existing mutant from store_contract/mutants.py:
    ```python
    def test_failure_names_the_adapter(tmp_path):
        with pytest.raises(AssertionError, match=r"adapter 'broken'.*rule_saving_twice_keeps_one_entry"):
            run_contract("store", {"broken": lambda: SAVED_MUTANT(tmp_path)}, [rules_saved_places.rule_saving_twice_keeps_one_entry])
    ```
  - |
    AC10, README heading (new file services/api/tests/unit/test_readme_adapter_docs.py):
    ```python
    README = (Path(__file__).parents[2] / "README.md").read_text()
    def test_how_to_add_a_new_adapter_section_present():
        assert re.search(r"^#+ How to add a new adapter\s*$", README, re.M)
    ```
  - |
    AC11, the helper's checks for the store port are exactly the existing rules:
    ```python
    def test_store_contract_checks_are_exactly_the_existing_rules():
        existing = {f for m in (rules_trips, rules_invites, rules_share_links, rules_accounts, rules_profiles, rules_saved_places)
                    for n, f in vars(m).items() if n.startswith("rule_")}
        assert set(STORE_RULES) == existing and len(STORE_RULES) == len(existing)
    ```
    plus a run of `run_contract("store", {"local": ...}, STORE_RULES)` passing against the local adapter.
  - |
    AC12, exactly one replay approach described:
    ```python
    def test_readme_describes_one_replay_approach():
        assert README.count("HTTP client interception") >= 1
        assert not re.search(r"vcr|respx|pytest-httpx|responses library|monkeypatch the adapter", README, re.I)
    ```
assumptions_or_open_questions:
  - |
    Test-only kit: the recorder and contract helper live under services/api/tests/unit (not app/) because nothing in production needs them. Say so if the story intends a developer CLI under app/ instead.
  - |
    "Contract-test helper for a port" is interpreted as a generic runner plus the store port wired to the existing rules. No other port (flights, stays, etc.) has an existing contract suite, so none is added. Existing store rules and tests stay unchanged to satisfy AC11.
  - |
    Personal-data scrubbing is by field name (case-insensitive list in the scope) plus regex for emails and phone numbers anywhere. Free-text names or postal addresses under a non-personal field name are not detected. A reviewer should confirm that is acceptable.
  - |
    Fixture identity is method plus URL without credential params plus sorted params plus body hash. Two calls differing only in credential value share one fixture.
  - |
    Recording a real call is manual (the developer wraps a real httpx transport in RecordingTransport); no test in the suite ever contacts the network, and no new dependency is added (httpx is already used).
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — test-only helpers and README text; no schema, stored data, setting or env var changes. Recorded fixtures are new test files, scrubbed before being written.

  Research: `IntegrationClient` (services/api/app/integrations/client.py) already accepts `transport: httpx.BaseTransport` and tests already use `httpx.MockTransport` (tests/unit/test_integration_fake_echo.py), so HTTP client interception needs no production change. The store contract (tests/unit/store_contract) uses `rule_*` functions run through a parametrised `store` fixture (local plus cloud), with `mutants.py` proving the rules catch divergence; the new helper generalises that. Suggested TDD order is AC5/6 and 1, then 2 to 4, then 7, then 8, 9 and 11, then README tests 10 and 12.

  ```mermaid
  flowchart TD
    rec[integrations_support/recorded.py]:::touched --> scrub[integrations_support/scrub.py]:::touched
    rec --> ic[app/integrations/client.py IntegrationClient transport param]
    kit[tests/unit/contract_kit.py]:::touched --> stores[store_contract/stores.py wiring]:::touched
    stores --> rules[store_contract/rules_*.py unchanged]
    kit --> mut[store_contract/mutants.py used by AC9 test]
    readme[services/api/README.md]:::touched
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN scope: test-only recorder/replayer on httpx transports, scrubber, generic contract helper wired to the existing store rules, and README sections. OUT: any production code change, new contract suites for other ports, new dependencies. Riskiest part is the scrubber (a missed secret or personal value defeats the point) and the guarantee that an existing fixture is never touched and never triggers a live call. Deliberate: existing store contract files stay unchanged (AC11), and the README must name only one replay approach (AC12).
