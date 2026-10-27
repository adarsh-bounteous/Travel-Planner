summary: |
  Make local storage keep its data across API restarts. The switch already exists: `LOCAL_MODE` (with `APP_ENV=local`) is the one setting every local stand-in follows, and `stand_ins_for(...).storage` already tracks it, so cloud DynamoDB stays the default when it is absent. What is missing is persistence: today local mode serves Trips from `InMemoryTripStore`, so every restart loses them. This plan adds a JSON data file (`store.json` under `LOCAL_DATA_DIR`, the path the approved design shows as `.local-data/store.json`) and a `PersistentTripStore` that loads it at startup and rewrites it after every change. A missing or empty file means a fresh start, and an unreadable or corrupted file stops startup with a clear error. Clearing the file (delete or empty it, or the existing `POST /local/reset`) returns local data to a fresh state. Profiles, saved places and the other stores are separate stories and stay as they are.

scope:
  - description: |
      New module holding the data file. `LocalDataFile(path)` with `read() -> dict` (missing, empty or whitespace-only file returns `{}`; invalid UTF-8, invalid JSON, a non-object, or an `OSError` raises `LocalDataFileError`) and `write(data: dict) -> None` (writes a temp file in the same directory, then `os.replace`, under a `threading.Lock`, creating the directory first). `LocalDataFileError(RuntimeError)` carries the path, and its message reads like the design's error copy: "The local data file <path> is unreadable or corrupted. Delete it, or empty it, and start the API again."
      ```python
      LOCAL_DATA_FILE_NAME = "store.json"

      class LocalDataFileError(RuntimeError): ...

      class LocalDataFile:
          def __init__(self, path: Path) -> None: ...
          def read(self) -> dict[str, Any]: ...
          def write(self, data: dict[str, Any]) -> None: ...
      ```
    files:
      - services/api/app/local_data.py
    rationale: |
      One small unit owns file IO and the fail-loud rule, so the store stays about Trips and later local stores (profiles, saved places) can reuse it. Atomic replace means a crash mid-write cannot leave a half-written file that would block the next start.

  - description: |
      New `PersistentTripStore(InMemoryTripStore)` that takes a `LocalDataFile`. `__init__` loads the file into the parent's four dicts. A `_flush()` after every mutating method (`save_trip`, `delete_trip`, `save_invite`, `delete_invite`, `save_share_link`, `delete_share_link`, `link_editor`, `unlink_editor`, `reset`) writes the whole state. The file shape is versioned: `{"version": 1, "trips": [{"owner_id", "trip"}], "invites": [...], "share_links": [...], "editors": [{"email", "trip_id", "owner_id"}]}`. Trips go through `Trip.model_dump(mode="json")` and `Trip.model_validate`, which round-trips dates, Decimals and URLs. An unknown `version`, or any record that fails validation, raises `LocalDataFileError` (never a silent skip).
      ```python
      class PersistentTripStore(InMemoryTripStore):
          def __init__(self, data_file: LocalDataFile) -> None: ...
          def _flush(self) -> None: ...
      ```
    files:
      - services/api/app/trips/local_store.py
    rationale: |
      Subclassing keeps the in-memory semantics every router test already relies on, and covers invites, share links and editor links, which live in the same `TripStore` protocol and the same Trip Database in the cloud. The data file is a rewrite-on-change snapshot, which is fine for a single-developer local file.

  - description: |
      Wire it in. `_local_trips()` returns `PersistentTripStore(LocalDataFile(get_settings().local_data_dir / LOCAL_DATA_FILE_NAME))` instead of `InMemoryTripStore()`; its return type and docstring change. `get_trips()` is unchanged, so with `LOCAL_MODE` off it still returns `DynamoTripStore` and never touches the file. In `main.py` the lifespan builds the store eagerly when local mode is on (`deps._local_trips()` before seeding), so a bad file fails at startup and not on the first request. `LocalDataFileError` is not caught, so uvicorn exits with the message visible.
    files:
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      `lru_cache` makes the store lazy, so without the eager build AC7 would only surface on the first request. The first-start seed already runs from the lifespan, so the seeded demo Trips are written to the file on first start and found again on restart (the seed only runs when the store is empty).

  - description: |
      Docs for the setting and the file. In `services/api/README.md`, change the `LOCAL_DATA_DIR` row and the "Demo account and sample trips" paragraph to say Trips now survive a restart in `store.json`. In `docs/local-setup.md`, rewrite "Reset" (stop the API and delete or empty `services/api/.local-data/store.json`, or use Reset local data), update the "What is faked" Trip Database row, and add a line saying that a corrupted file stops startup until it is cleared.
    files:
      - services/api/README.md
      - docs/local-setup.md
    rationale: |
      The old text says Trips stay in memory and that restarting clears them, which this change makes false.

  - description: |
      Tests, written first (see `tests`). New unit files for the data file and the persistent store, plus a startup test file. `test_fresh_start_clears_local_data_and_reseeds_the_demo_account` in `test_local_seed_startup.py` assumed a restart empties Trips, so it is rewritten: a restart keeps the deleted trip deleted, and clearing `store.json` brings back the two sample trips.
    files:
      - services/api/tests/unit/test_local_data_file.py
      - services/api/tests/unit/test_persistent_trip_store.py
      - services/api/tests/unit/test_local_storage_startup.py
      - services/api/tests/unit/test_local_seed_startup.py
    rationale: |
      `tests/conftest.py` already points `LOCAL_DATA_DIR` at a per-test tmp dir, so the new tests never touch a real `.local-data`.

tests:
  - |
    AC1 (cloud stays the default). In `test_local_storage_startup.py`, with `LOCAL_MODE` unset and `boto3.resource` monkeypatched to a fake:
    ```python
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    deps._trips.cache_clear()
    assert isinstance(deps.get_trips(), DynamoTripStore)
    assert not (tmp_path / "local-data" / "store.json").exists()
    ```
    Fails first only if the wiring is wrong. It pins down that production never reads or writes the file. Also assert `LOCAL_MODE=off` gives the same result.
  - |
    AC2 (data survives a restart). In `test_persistent_trip_store.py`:
    ```python
    path = tmp_path / "store.json"
    first = PersistentTripStore(LocalDataFile(path))
    first.save_trip("u1", trip)
    second = PersistentTripStore(LocalDataFile(path))  # a restart
    assert second.get_trip("u1", trip.id) == trip
    ```
    Add the same for an invite, a share link and an editor link (`second.shared_trips("a@b.co") == [("u1", trip.id)]`). Then an end-to-end version in `test_local_storage_startup.py`: start `TestClient(app)` in local mode, create a trip with `POST /trips`, clear the `deps._local_trips` and `auth._local_identity` caches, start again, and assert `client.get("/trips")` still lists it.
  - |
    AC3 (clearing the file resets). Delete `store.json` between two starts and assert only the two sample trips come back. Repeat with the file truncated to 0 bytes. Also check that `POST /local/reset` leaves an empty-then-reseeded file:
    ```python
    assert [t["name"] for t in client.get("/trips").json()] == ["Weekend in Lisbon", "Summer in Kyoto"]  # order not guaranteed, compare sorted
    ```
  - |
    AC4 (no cloud needed). In local mode, replace `boto3.resource` with a function that raises `AssertionError("cloud used")`, then:
    ```python
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        sign_in_demo(client)
        assert client.get("/trips").status_code == 200
    ```
    It passes only if startup and the trip routes never reach a DynamoDB client.
  - |
    AC5 (a new record is written to the file). After `store.save_trip("u1", trip)`:
    ```python
    on_disk = json.loads(path.read_text())
    assert on_disk["version"] == 1
    assert [r["trip"]["id"] for r in on_disk["trips"]] == [trip.id]
    ```
    Add the same through the API: `POST /trips` in local mode, then read the file. Also assert that `delete_trip` removes the record from the file.
  - |
    AC6 (no file means no local data). `PersistentTripStore(LocalDataFile(tmp_path / "missing.json"))` then:
    ```python
    assert store.is_empty() is True
    assert store.list_trips("u1") == []
    ```
    Also that merely constructing the store does not create the file, and that a 0-byte file and a whitespace-only file read as empty. At app level, a first local start with no file succeeds and seeds the demo trips into a newly created `store.json`.
  - |
    AC7 (unreadable or corrupted file stops startup). Parametrise over: `b"{not json"`, `b"[]"`, `b"\xff\xfe"`, `b'{"version": 99}'`, a Trip record missing required fields, and a path that is a directory (`OSError`):
    ```python
    with pytest.raises(LocalDataFileError, match="unreadable or corrupted"):
        with TestClient(app):
            pass
    ```
    Assert the message contains the file path, and that the bad file is left untouched (not overwritten or silently reset).
  - |
    Existing behaviour that must still pass: `test_local_reset_router.py`, `test_startup_status_router.py`, `test_local_sign_in.py` and `test_local_seed_startup.py` (apart from the rewritten fresh-start test). The rewritten test asserts that after a restart the deleted trip stays deleted, and that after `store.json` is removed the names are `["Summer in Kyoto", "Weekend in Lisbon"]`.

assumptions_or_open_questions:
  - |
    DESIGN CONFLICT. The approved prototype is a browser status page with a "Restart API" button, a "Clear local data file" button, a data-file status badge ("Data restored" or "No local data", with a record count) and a "API did not start" modal. This item is API-only (the stack notes list styling as not applicable) and its scope is the setting, the data file and clearing it. A process that failed to start cannot serve a page, and a browser cannot restart it, so the error modal and Restart button cannot be built as drawn. This plan builds no web UI. The design's observable behaviour is covered at API level: the cloud-versus-local states by `GET /startup-status`, and the startup error by the raised `LocalDataFileError` message, which reuses the design's wording ("The local data file is unreadable or corrupted. Clear it to start with a fresh state.") and shows the file path. Exposing the data-file status and record count in `/startup-status`, and any web screen for it, are left out and need a follow-up story if wanted.
  - |
    The setting that selects local storage is the existing `LOCAL_MODE` (plus `APP_ENV=local`). It is deliberately not split into a storage-only flag, because `LocalStandIns` says every stand-in follows the one switch. Cloud stays the default when it is absent.
  - |
    Only Trips, invites, share links and editor links persist in `store.json`. Accounts already persist in `accounts.sqlite3` in the same directory and are left alone. Profiles, saved places and the local inbox are separate stories and the inbox stays in memory. Consequence: clearing `store.json` alone keeps the accounts, so the existing demo user is reused and the sample trips are re-seeded under it. A full clean slate still means deleting `LOCAL_DATA_DIR`, or `POST /local/reset`.
  - |
    Seeding runs when the store holds no trips, invites, share links or editor links. With persistence, a developer who deletes every trip and restarts gets the two sample trips back. That is the existing seed rule and it is not changed here.
  - |
    An empty (0-byte) file counts as "cleared", matching the design note that the file is "empty or missing". Any other content that does not parse into the expected shape is an error, with no automatic repair or backup.
  - |
    Single API process assumed. The whole file is rewritten on each change under an in-process lock and there is no cross-process locking, which is enough for the one-command local start.

estimated_points: 3

package_dependencies: []

notes: |
  ### Data & rollout
  - **Existing data**: None to migrate. Local Trips lived only in memory, so no file exists before this change. `accounts.sqlite3` is untouched.
  - **Backfill / seed**: No backfill. The existing first-start seed (`app/local_seed.py`) now writes into `store.json` and is idempotent: it only runs when the store is empty, so a restart never duplicates the sample trips.
  - **Settings**: No new env var. It reuses `LOCAL_MODE` (default off, so cloud storage) and `LOCAL_DATA_DIR` (default `services/api/.local-data`, already git-ignored via `.local-data/` in `.gitignore`). The new file name `store.json` is a constant. Documented in `services/api/README.md` and `docs/local-setup.md`.
  - **Provisioning**: Nothing. The directory is created on the first write.
  - **Order and rollback**: No ordering constraint. With `LOCAL_MODE` off the code path is unchanged and never reads the file. To roll back, revert the change and delete `.local-data/store.json`; nothing else reads it.

  ### Shape
  ```mermaid
  flowchart TD
    Main[app/main.py lifespan] -->|eager build, fail at startup| Deps[routers/deps.py _local_trips]
    Deps -->|local mode on| PTS[trips/local_store.py PersistentTripStore]
    Deps -.->|local mode off, unchanged| Dyn[trips/store.py DynamoTripStore]
    PTS -->|extends| Mem[trips/store.py InMemoryTripStore]
    PTS -->|load and flush| LDF[app/local_data.py LocalDataFile]
    LDF --> File[(LOCAL_DATA_DIR/store.json)]
    Seed[app/local_seed.py] -->|writes sample trips via| PTS
    Reset[routers/local_reset.py] -->|reset clears the file| PTS
    Routers[routers/trips.py and others] -->|get_trips| Deps
    classDef touched fill:#f96,color:#000
    class Main,Deps,PTS,LDF touched
  ```
  The orange nodes are changed or new: `main.py` for the eager build, `deps.py` for the swap, and the two new modules. `local_seed.py`, `local_reset.py` and the routers are untouched and already work through the `TripStore` interface and `reset()`.

  ### Notes
  - `InMemoryTripStore` keys are tuples, so the file stores them as lists of records rather than JSON object keys.
  - Writes are temp file plus `os.replace`, so an interrupted write leaves the old file intact.
  - Not logged: nothing sensitive is in `store.json` (Trips only, no passwords); the demo password stays in code as before.

review_focus: |
  IN scope: the persisted `store.json`, `PersistentTripStore`, the eager startup load and the docs. OUT of scope: any web UI (the prototype's status page, Restart and Clear buttons cannot exist for an API-only item, see the open question), the profile and saved-places stores, and any new setting, since `LOCAL_MODE` is deliberately the switch. The riskiest part is the load and validate path: a corrupt file must stop startup with a visible error and never be silently reset or overwritten, and `LOCAL_MODE` off must never touch the file. The rewritten fresh-start test in `test_local_seed_startup.py` is deliberate, because it asserted the old in-memory behaviour.
