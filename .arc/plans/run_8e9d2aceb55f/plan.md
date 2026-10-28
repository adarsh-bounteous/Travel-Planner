summary: |
  Local mode's inbox is `InMemoryInviteSender`, cached with `lru_cache` in `deps._local_invite_sender`, so every API restart empties it. Add a `PersistentInviteSender` that subclasses it and loads from / rewrites its own JSON data file under `LOCAL_DATA_DIR` (`inbox.json`), exactly the pattern `PersistentSavedPlaceStore` already uses. Wire it into `_local_invite_sender`. Reset already calls `_local_invite_sender().reset()`, so the persistent `reset()` also flushes an empty file. Outside local mode the sender is `NoInviteSender` or `SesInviteSender`, which keep nothing, so nothing is persisted there and the inbox route stays a 404.
scope:
  - description: |
      Add `PersistentInviteSender(InMemoryInviteSender)` in a new module. Constructor takes a `LocalDataFile` and an optional clock, and loads in `__init__`.
      Signature: `def __init__(self, data_file: LocalDataFile, clock: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None`.
      Format: `{"version": 1, "messages": [{"to", "trip_name", "link", "sent_at" (ISO string), "kind" (or null)}]}`.
      Overrides `_record`/`send_confirmation` so the file is flushed after the `kinds[link]` entry is set (so `send_confirmation` flushes once, after both), `send`, and `reset`. Unreadable or wrong-version file raises `LocalDataFileError`, as the other stores do. Constant `INBOX_FILE_NAME = "inbox.json"`.
      To avoid a flush before `kinds` is set, split `InMemoryInviteSender._record` so the persistent class flushes at the end of `send` and `send_confirmation` only.
    files:
      - services/api/app/trips/local_inbox_store.py
      - services/api/app/trips/invites.py
    rationale: |
      Mirrors `app/trips/local_saved_store.py`. A separate file because other stores rewrite their whole file with only their own keys.
  - description: |
      Change `_local_invite_sender()` to return `PersistentInviteSender(LocalDataFile(get_settings().local_data_dir / INBOX_FILE_NAME))` and update its return annotation and docstring. Build it eagerly in the local-mode startup block of `main.py` (next to `deps._local_trips()`), so an unreadable inbox file stops startup rather than failing the first request.
    files:
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: Makes the cached local sender the persistent one; `get_local_inbox`, `get_invite_sender`, `auth.py` and `local_reset.py` all resolve it through this function, so they need no change.
  - description: |
      Document `inbox.json` in the `LOCAL_DATA_DIR` row and the local-mode paragraph of the API README.
    files:
      - services/api/README.md
    rationale: The README lists every file kept under `LOCAL_DATA_DIR`.
tests:
  - |
    AC1 and AC2 (restart and reload). New `services/api/tests/unit/test_local_inbox_store.py`, written first. A sender writes an invite and a confirmation, a second sender is built on the same file, and both messages are present with identical fields.
    ```python
    def test_messages_survive_a_restart_with_every_field(tmp_path):
        path = tmp_path / "inbox.json"
        a = PersistentInviteSender(LocalDataFile(path), clock=lambda: T0)
        a.send("ana@example.com", "Lisbon", "http://x/invite/1")
        a.send_confirmation("new@example.com", "http://x/confirm/2", kind="email_change")
        b = PersistentInviteSender(LocalDataFile(path))
        assert b.sent == a.sent
        assert b.sent_at == [T0, T0]
        assert b.kinds == {"http://x/confirm/2": "email_change"}
    ```
  - |
    AC1 and AC2 through the API. In `test_local_inbox.py`, using the `restart()` approach from `test_local_profiles.py` (clear `deps._local_invite_sender` and the other local caches, with `LOCAL_DATA_DIR` set by the conftest fixture). Invite via `/trips/{id}/editors`, sign up for a confirmation, restart, sign in again.
    ```python
    before = local_client.get("/local/inbox").json()
    restart()
    assert local_client.get("/local/inbox").json() == before
    assert len(before) == 2
    ```
  - |
    AC3 (outside local mode). In `test_local_inbox.py`, with `LOCAL_MODE` unset, clear `deps._invite_sender`, send through `deps.get_invite_sender()`, clear caches again, and assert nothing was stored and the inbox does not list it.
    ```python
    assert client.get("/local/inbox").status_code == 404
    assert not (tmp_path / "local-data" / "inbox.json").exists()
    ```
    Also a restart-in-local-mode check that messages from a non-local run never appear, since `inbox.json` is only written by the local sender.
  - |
    AC4 (reset). In `test_local_reset_router.py`, add a case, and a store-level one in `test_local_inbox_store.py`: after a reset the inbox is empty, and stays empty after a restart (the file was rewritten).
    ```python
    assert client.post("/local/reset", headers={"X-Local-Reset": "1"}).status_code == 204
    assert client.get("/local/inbox").json() == []
    restart()
    assert client.get("/local/inbox").json() == []
    ```
  - |
    Robustness. A corrupt or wrong-version `inbox.json` raises `LocalDataFileError`, as in `test_local_saved_store.py`. A missing or empty file loads as an empty inbox. The existing `test_local_inbox.py` tests still pass unchanged.
assumptions_or_open_questions:
  - |
    Answer to the deferred question: local inbox messages go in a new `inbox.json` under `LOCAL_DATA_DIR` (default `services/api/.local-data`), written through the existing `LocalDataFile`. This follows the saved-places and profiles stores, and I chose it over a table in the accounts SQLite file or `store.json`.
  - |
    Reset empties the inbox but `run_first_start_seed` runs afterwards; I read `local_seed.py` as not sending any email, so the inbox stays empty after reset (AC4). The implementer should confirm this when writing the reset test.
  - |
    No cap on the stored message count, matching the in-memory sender today. Revisit only if the file grows large in practice.
  - |
    The starter-country decision from STORY-102 does not affect this item and is not used.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: a new file, `inbox.json`, is added next to the other local data files. Nothing existing is migrated. A first start after the change finds no file and starts with an empty inbox, which is what happens today.
  - **Backfill / seed**: none needed. Messages in the old in-memory inbox are lost at the upgrade restart, as before.
  - **Settings**: no new setting. It uses `LOCAL_DATA_DIR` (default `services/api/.local-data`, already documented in `services/api/README.md`, which gains the file name).
  - **Provisioning**: none. `LocalDataFile.write` creates the directory.
  - **Order and rollback**: no ordering. Rolling back leaves an unused `inbox.json`, which is harmless and git-ignored along with the rest of `.local-data`.

  Scope is local mode only. Non-local senders are untouched and nothing outside local mode writes the file. No web app changes, since the inbox page reads `GET /local/inbox`, whose response shape is unchanged.

  ```mermaid
  flowchart TD
    main[app/main.py startup] -->|build eagerly| deps[routers/deps.py _local_invite_sender]
    deps -->|returns| store[trips/local_inbox_store.py PersistentInviteSender]
    store -->|extends| invites[trips/invites.py InMemoryInviteSender]
    store -->|reads and writes| file[local_data.py LocalDataFile]
    auth[routers/auth.py] -->|send_confirmation| deps
    inbox[routers/local_inbox.py] -->|get_local_inbox| deps
    reset[routers/local_reset.py] -->|reset| deps
    classDef touched fill:#f96,color:#000
    class main,deps,store,invites touched
  ```
  `main.py`, `deps.py` and `invites.py` change as described in `scope`. `local_inbox_store.py` is new. The other nodes are unchanged callers or callees.
review_focus: |
  IN: persisting the local inbox to `inbox.json`, wiring it in `deps._local_invite_sender`, and the README line. OUT: non-local senders, the web app, and the inbox response shape. The riskiest part is the flush ordering in `send_confirmation`, which sets `kinds[link]` after recording, so the file must be written once, after both, or a restart could lose the message kind. Using a separate file rather than `store.json` is deliberate, because those stores rewrite their whole file with only their own keys.
