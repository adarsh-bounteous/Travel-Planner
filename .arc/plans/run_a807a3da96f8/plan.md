summary: |
  Add one shared, store-agnostic contract test set under services/api/tests/unit/store_contract/ that runs every user-visible rule for trips, invites, share links, accounts, profiles and saved places against both the local store (Persistent* stores and the SQLite identity from stories 068-072) and the cloud store (the Dynamo* stores). Each rule is written once as a plain function that takes a store; pytest parametrises it over "local" and "cloud". The cloud parameter is skipped with a clear reason when the DynamoDB tables cannot be described, and executes when they exist. A divergence self-test feeds a deliberately wrong local store through the same rule functions and asserts they fail, which proves the set catches a local/cloud difference. A traceability test requires every approved criterion of stories 068-072 to map to a shared test id. Test-only change: no production code, no new dependency.

scope:
  - description: |
      Cloud-availability probe and store factories. `cloud_tables_present()` calls `describe_table` on `get_settings().trips_table_name` and `accounts_table_name` and returns False on ResourceNotFoundException, ClientError, NoCredentialsError, NoRegionError or EndpointConnectionError. It takes the boto3 client factory as an argument so it can be unit-tested. `make_store(kind, tmp_path)` returns a bundle (trips, profiles, saved, accounts) of Persistent*/InMemoryAccountStore for "local" or Dynamo* for "cloud". Cloud runs use a fresh uuid owner id and email per test and delete what they wrote in teardown, so a shared real table is never polluted.

      ```python
      def cloud_tables_present(client_factory=lambda: boto3.client("dynamodb")) -> bool: ...
      def make_store(kind: Literal["local", "cloud"], tmp_path: Path) -> StoreBundle: ...
      ```
    files:
      - services/api/tests/unit/store_contract/__init__.py
      - services/api/tests/unit/store_contract/stores.py
    rationale: |
      One place decides what "cloud tables present" means (AC5, AC6) and builds both stores identically, so a rule function never knows which store it has.

  - description: |
      The pytest wiring. conftest.py defines a `store` fixture parametrised with `pytest.param("local")` and `pytest.param("cloud", marks=pytest.mark.cloud_store)`. The cloud param calls `pytest.skip("cloud tables absent")` when `cloud_tables_present()` is False, so the run is reported as skipped (not passed, not failed). Register the `cloud_store` marker in pytest.ini. Cloud teardown removes the uuid-keyed records.
    files:
      - services/api/tests/unit/store_contract/conftest.py
      - services/api/pytest.ini
    rationale: |
      AC1, AC5 and AC6: passes for each store when tables exist, cloud reported as skipped when absent, cloud executes when present. The directory sits under tests/unit so the default testpaths picks it up.

  - description: |
      Rule modules, one per area, each a set of `rule_*(store)` functions holding the assertions, plus thin `test_*` wrappers taking the `store` fixture. Rules come from the existing local-store tests (test_local_trips_invites_share.py, test_persistent_trip_store.py, test_local_profiles.py, test_local_saved_store.py, test_local_sign_up_confirm.py) and the Protocols in app/trips/store.py, profile_store.py, saved_store.py and app/auth/accounts.py. Examples:
      - trips: save/get/list/delete round-trip, a trip id alone resolves nothing for another owner (`store.trips.get_trip("other", tid) is None`), budget and dates round-trip.
      - invites: saved invite is found by token, deleted invite is `None`, `link_editor` / `shared_trips(email)` / `unlink_editor`.
      - share links: found by token until `delete_share_link`, then `None`.
      - accounts: `is_google_linked` False until `link_google`, then True and per user.
      - profiles: unsaved is `None`, saved round-trips including `transport_preferences`, second save replaces the first, owners are separate.
      - saved places: save then list keeps all fields, saving twice keeps one entry, unsave of an absent id does not raise, owners are separate.
      The account sign-up / confirm / sign-in rules are only runnable end to end on the local identity (the cloud identity is Cognito, not a table), so they are shared with the other `IdentityProvider` implementation FakeIdentityProvider and sit in a separate parametrisation (see assumptions).
    files:
      - services/api/tests/unit/store_contract/rules_trips.py
      - services/api/tests/unit/store_contract/rules_invites.py
      - services/api/tests/unit/store_contract/rules_share_links.py
      - services/api/tests/unit/store_contract/rules_accounts.py
      - services/api/tests/unit/store_contract/rules_profiles.py
      - services/api/tests/unit/store_contract/rules_saved_places.py
      - services/api/tests/unit/store_contract/test_trips_contract.py
      - services/api/tests/unit/store_contract/test_invites_contract.py
      - services/api/tests/unit/store_contract/test_share_links_contract.py
      - services/api/tests/unit/store_contract/test_accounts_contract.py
      - services/api/tests/unit/store_contract/test_profiles_contract.py
      - services/api/tests/unit/store_contract/test_saved_places_contract.py
    rationale: |
      AC3: all six areas are covered by the shared set. Keeping assertions in plain functions is what lets the divergence self-test (AC2) reuse them unchanged.

  - description: |
      Divergence self-test (AC2). Subclass the local stores with one deliberate bug each (for example a PersistentTripStore whose `delete_share_link` is a no-op, a saved-place store that keeps duplicates, a profile store that merges instead of replacing) and assert the matching rule function raises `AssertionError`. A parametrised table maps each rule to its mutant.

      ```python
      @pytest.mark.parametrize("rule, mutant", MUTANTS)
      def test_a_local_only_difference_fails_its_rule(rule, mutant, tmp_path):
          with pytest.raises(AssertionError):
              rule(mutant(tmp_path))
      ```
    files:
      - services/api/tests/unit/store_contract/mutants.py
      - services/api/tests/unit/store_contract/test_divergence_is_caught.py
    rationale: |
      Proves the shared set fails for the local store when a rule differs, without needing to break production code.

  - description: |
      Criteria traceability (AC4). `criteria.py` lists every approved criterion of stories 068-072 as `("068", n): "<rule test id>"`. `test_criteria_coverage.py` asserts every listed id exists as a collected shared test (resolved by importing the wrapper modules and checking the function name) and that each of stories 068 to 072 has at least one criterion. The criteria text is taken from the approved stories, not invented (see open questions).
    files:
      - services/api/tests/unit/store_contract/criteria.py
      - services/api/tests/unit/store_contract/test_criteria_coverage.py
    rationale: |
      AC4: a missing shared case for any approved criterion fails the build instead of being silently forgotten.

  - description: |
      Skip and run behaviour tests for the probe (AC5, AC6), driven by a stub client factory, plus a README note on how to run the set against real tables (existing AWS credentials, `ACCOUNTS_TABLE_NAME`, `TRIPS_TABLE_NAME`, no new setting).
    files:
      - services/api/tests/unit/store_contract/test_cloud_probe.py
      - services/api/README.md
    rationale: |
      Keeps the skip logic itself tested without AWS, and tells developers how to turn the cloud run on.

tests:
  - |
    AC1 - the same rule functions pass for each store.
    ```python
    def test_save_then_get_trip_round_trips(store):
        rules_trips.rule_save_then_get_round_trips(store)   # runs for "local" and "cloud"
    ```
    With tables present, `pytest services/api/tests/unit/store_contract -q` reports both `[local]` and `[cloud]` cases passed.
  - |
    AC2 - a rule that differs locally fails that rule.
    ```python
    with pytest.raises(AssertionError):
        rules_share_links.rule_deleted_link_is_gone(NoopDeleteShareLinkStore(tmp_path))
    ```
    One mutant per area in mutants.py, each caught by its rule.
  - |
    AC3 - each of the six areas has at least one shared test.
    ```python
    AREAS = {"trips", "invites", "share_links", "accounts", "profiles", "saved_places"}
    assert AREAS <= {m.removeprefix("test_").removesuffix("_contract") for m in contract_test_modules()}
    ```
  - |
    AC4 - every approved criterion of 068-072 maps to an existing shared test.
    ```python
    @pytest.mark.parametrize("key, test_id", CRITERIA.items())
    def test_criterion_has_a_shared_case(key, test_id):
        assert test_id in collected_shared_test_names(), key

    def test_every_story_068_to_072_is_covered():
        assert {s for s, _ in CRITERIA} == {"068", "069", "070", "071", "072"}
    ```
  - |
    AC5 - tables absent means the cloud run is skipped.
    ```python
    def test_absent_tables_are_reported_absent():
        def missing():
            raise botocore.exceptions.ClientError({"Error": {"Code": "ResourceNotFoundException"}}, "DescribeTable")
        assert cloud_tables_present(missing) is False
    ```
    Plus a pytester-style run with the probe forced to False asserting `result.assert_outcomes(passed=N, skipped=N)` and the skip reason "cloud tables absent".
  - |
    AC6 - tables present means the cloud run executes.
    ```python
    def test_present_tables_are_reported_present():
        assert cloud_tables_present(lambda: FakeDynamoClient(tables={"trip-planner-trips", "trip-planner-accounts"})) is True
    ```
    Plus a pytester-style run with the probe forced to True and a stub cloud factory asserting `result.assert_outcomes(skipped=0)` and that the cloud factory was called.

assumptions_or_open_questions:
  - |
    I could not read the acceptance criteria of stories 068 to 072 (only their merged commits and code were available), so criteria.py cannot be filled in yet. Reviewer: please paste the approved criteria, or confirm the implementer may read them from the work item records. The existing local tests were used only as a guide to the rules.
  - |
    The cloud accounts rules that sign up, confirm and sign in are served by Cognito (CognitoIdentityProvider), which is not a DynamoDB table. I assume the cloud-store side of "accounts" is DynamoAccountStore (Google link records) and that sign-up and confirm rules are shared only between LocalIdentityProvider and FakeIdentityProvider. Tell me if you want a Cognito run too (needs a pool and credentials).
  - |
    "Cloud tables are present" means describe_table succeeds for both TRIPS_TABLE_NAME and ACCOUNTS_TABLE_NAME with the default AWS credentials and region. No new env var is added. Cloud runs write to those real tables under uuid-keyed ids and clean up; confirm that is acceptable, or say if a dedicated test table name is preferred.
  - |
    No moto or other mock is added, because AC5 and AC6 need the real presence of tables to decide skipped versus run. The probe and skip logic are tested with stubs instead.
  - |
    Local rules that exist only locally (data file version check, reset, demo seed, local inbox) are not user-visible cloud rules and stay in their existing tests.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout
  None — test-only change; no schema, stored data, seed or setting is added or changed. The cloud run reads and writes uuid-keyed records in the existing tables only when they exist, and removes them afterwards. Safe to remove by deleting the store_contract directory and the pytest marker.

  The existing per-store tests stay; the shared set is the single place that compares the two stores.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    stores[tests/unit/store_contract/stores.py]:::touched
    conf[store_contract/conftest.py]:::touched
    rules[store_contract/rules_*.py and test_*_contract.py]:::touched
    mut[store_contract/mutants.py]:::touched
    PT[trips/local_store.py PersistentTripStore]
    DT[trips/store.py DynamoTripStore]
    PP[trips/local_profile_store.py]
    DP[trips/profile_store.py DynamoProfileStore]
    PS[trips/local_saved_store.py]
    DS[trips/saved_store.py DynamoSavedPlaceStore]
    AC[auth/accounts.py AccountStore]
    conf -->|param local/cloud, skip when absent| stores
    rules -->|rule functions take a store| conf
    stores --> PT
    stores --> DT
    stores --> PP
    stores --> DP
    stores --> PS
    stores --> DS
    stores --> AC
    mut -->|broken subclass of local stores| PT
    mut -->|must fail the same rules| rules
  ```

review_focus: |
  In scope: test code only under services/api/tests/unit/store_contract plus the pytest marker and README note; no production change. Riskiest parts are the cloud-presence probe (it must report skipped, never silently pass, and must not leave records in real tables) and criteria.py, which depends on the 068-072 criteria text I could not read. The accounts area is deliberately split because the cloud identity is Cognito, not a table.
