summary: |
  In local mode the API still wires the saved-place routes to DynamoSavedPlaceStore, so saving a place needs the cloud accounts table. Add a PersistentSavedPlaceStore, which is the in-memory store loaded from and rewritten to a local data file, so saved places survive an API restart. Select it in deps.get_saved_places when local mode is on, and empty it on POST /local/reset. The routes and the web Saved page are unchanged, so the Saved page shows the same fields and controls as in cloud mode. Saving the same place twice is already idempotent (keyed by place id) and the PUT route already returns 200 with no error; tests pin that down.
scope:
  - description: |
      New file-backed saved-place store, mirroring PersistentTripStore. It subclasses InMemorySavedPlaceStore, loads in __init__ and flushes after each mutation.

      ```python
      SAVED_FORMAT_VERSION = 1
      SAVED_PLACES_FILE_NAME = "saved-places.json"

      class PersistentSavedPlaceStore(InMemorySavedPlaceStore):
          def __init__(self, data_file: LocalDataFile) -> None: ...
          def save(self, owner_id: str, place: Place) -> None: ...
          def unsave(self, owner_id: str, place_id: str) -> None: ...
          def reset(self) -> None: ...
      ```

      File shape is {"version": 1, "saved": [{"owner_id": ..., "place": <Place json>}]}. Insertion order is kept. A bad version or malformed record raises LocalDataFileError, the same as the trip store. Only flush when the state changed is not required; flushing on each call is fine. unsave of an absent id must not fail.
    files:
      - services/api/app/trips/local_saved_store.py
    rationale: |
      A separate file is used on purpose. PersistentTripStore._flush rewrites all of store.json with only its own keys, so sharing that file would make each store erase the other's data. Reusing LocalDataFile gives the atomic write and the corrupt-file refusal for free.
  - description: |
      Add `reset()` to InMemorySavedPlaceStore (clears the dict). In deps.py add `_local_saved_places()` (lru_cache, builds PersistentSavedPlaceStore over `get_settings().local_data_dir / SAVED_PLACES_FILE_NAME`) and change get_saved_places to `return _local_saved_places() if get_settings().local_mode else _saved_places()`. The local store never touches DynamoDB or boto3.
    files:
      - services/api/app/trips/saved_store.py
      - services/api/app/routers/deps.py
    rationale: Same switch pattern as get_trips and get_invite_sender. The cloud path is unchanged with local mode off.
  - description: |
      Make POST /local/reset also call `deps._local_saved_places().reset()`, so the "empty every local store" promise holds.
    files:
      - services/api/app/routers/local_reset.py
    rationale: Otherwise saved places would survive a reset while trips and accounts are cleared.
tests:
  - |
    AC1 save then list. In services/api/tests/unit/test_local_saved_store.py (new), with a tmp_path data file:
    ```python
    store = PersistentSavedPlaceStore(LocalDataFile(tmp_path / "saved-places.json"))
    store.save("u1", PLACE)
    assert [p.id for p in store.list_saved("u1")] == ["p1"]
    ```
    Router level, in test_saved_places_router.py or a new test_local_saved_places_router.py with LOCAL_MODE on and no get_saved_places override: sign in locally, then PUT /saved-places/p1, then GET /saved-places contains p1. Also assert that with local mode on, deps.get_saved_places() is a PersistentSavedPlaceStore and no boto3 resource is created (monkeypatch boto3.resource to raise).
  - |
    AC2 remove.
    ```python
    store.save("u1", PLACE); store.unsave("u1", "p1")
    assert store.list_saved("u1") == []
    store.unsave("u1", "p1")  # removing an absent place does not raise
    ```
    Router: DELETE /saved-places/p1 returns 204, and the next GET lists none.
  - |
    AC3 restart. Build a second store over the same file, which simulates an API restart:
    ```python
    store.save("u1", PLACE)
    again = PersistentSavedPlaceStore(LocalDataFile(tmp_path / "saved-places.json"))
    assert [p.id for p in again.list_saved("u1")] == ["p1"]
    assert again.list_saved("u1")[0] == PLACE   # lat/lng and every field round-trip
    ```
    Also test that a removal persists across a restart, that a different owner's list stays separate, and that save order is kept. A corrupt file raises LocalDataFileError:
    ```python
    (tmp_path / "saved-places.json").write_text("{not json")
    with pytest.raises(LocalDataFileError): PersistentSavedPlaceStore(LocalDataFile(tmp_path / "saved-places.json"))
    ```
  - |
    AC4 same fields and controls. Router test: GET /saved-places in local mode returns objects with exactly the Place keys, the same as with the in-memory store used in the cloud-mode tests.
    ```python
    assert set(resp.json()[0]) == set(Place.model_fields)
    ```
    The web Saved page and its tests are not modified. Run the existing web vitest and Playwright Saved-page specs as a regression check.
  - |
    AC5 saving twice gives one entry.
    ```python
    store.save("u1", PLACE); store.save("u1", PLACE)
    assert len(store.list_saved("u1")) == 1
    ```
    Router: PUT twice, then `assert len(client.get("/saved-places").json()) == 1`. Also assert it is still one entry after a restart.
  - |
    AC6 no error on a repeat save. Router: the second PUT behaves like the first.
    ```python
    assert second.status_code == 200
    assert second.json() == first.json()
    ```
    Also pin that the MAX_SAVED check does not reject a re-save of an already-saved place when the list is full.
  - |
    Reset. POST /local/reset with X-Local-Reset: 1 empties saved places, and after a restart they are still empty. Added to test_local_reset_router.py.
  - |
    Cloud path unchanged. With local mode off, deps.get_saved_places() returns a DynamoSavedPlaceStore (existing test_saved_store.py cases still pass).
assumptions_or_open_questions:
  - |
    Saved places are kept in their own file, saved-places.json, in LOCAL_DATA_DIR, not in store.json. A shared file would be overwritten by PersistentTripStore._flush. If the reviewer would rather have one store.json, PersistentTripStore needs to own the saved places as well. That is a bigger change to a store this story does not otherwise touch.
  - |
    The ACs mention "no cloud saved-places table". In the cloud design, saved places live on the accounts table item, so the local store simply never reads the accounts table setting.
  - |
    Repeat saves already behave correctly in the route and in the in-memory store (dict keyed by place id; PUT returns 200). No route change is planned. If a test shows otherwise, fix it within this story.
  - |
    The demo seed (local_seed.py) is not extended with saved places, since no AC asks for it.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: no cloud data is read or changed. A new local file, saved-places.json, is created on first save. A missing or empty file means no saved places, so existing local installs (which have no such file) start with an empty Saved list and need no migration.
  - **Backfill / seed**: none needed. Nothing is seeded.
  - **Settings**: no new setting. The file lives under the existing LOCAL_DATA_DIR (default in config.py), which is only used when LOCAL_MODE is on and is already documented with the other local-mode settings.
  - **Provisioning**: none. The directory is created on first write by LocalDataFile.write.
  - **Order and rollback**: no ordering constraint. To roll back, revert the code. The leftover saved-places.json is ignored by older code and is safe to delete.

  Local mode is rejected outside local environments by resolve_local_mode, so the new store is not reachable in a deployment.

  ```mermaid
  flowchart TD
    R[routers/saved_places.py] --> D[routers/deps.py get_saved_places]
    D -->|local mode| P[trips/local_saved_store.py PersistentSavedPlaceStore]
    D -->|cloud| DY[trips/saved_store.py DynamoSavedPlaceStore]
    P --> M[trips/saved_store.py InMemorySavedPlaceStore]
    P --> F[local_data.py LocalDataFile]
    RS[routers/local_reset.py] -->|reset| P
    classDef touched fill:#f96,color:#000
    class D,P,M,RS touched
  ```
  deps.py selects the store, local_saved_store.py is new, saved_store.py gains reset(), and local_reset.py clears the new store.
review_focus: |
  IN: a file-backed saved-place store, its local-mode wiring in deps.get_saved_places, and clearing it on /local/reset. OUT: the saved-places routes, the web Saved page, the demo seed, and the trip store. The riskiest part is keeping saved places in a separate file, saved-places.json, which is deliberate because PersistentTripStore rewrites all of store.json and would erase them. Repeat saves are expected to need no code change, and the tests only confirm that.
