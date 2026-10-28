import json
from datetime import UTC, datetime

import pytest

from app.local_data import LocalDataFile, LocalDataFileError
from app.trips.local_inbox_store import PersistentInviteSender

T0 = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)


def sender(path, **kwargs):
    return PersistentInviteSender(LocalDataFile(path), **kwargs)


def test_messages_survive_a_restart_with_every_field(tmp_path):
    path = tmp_path / "inbox.json"
    a = sender(path, clock=lambda: T0)
    a.send("ana@example.com", "Lisbon", "http://x/invite/1")
    a.send_confirmation("new@example.com", "http://x/confirm/2", kind="email_change")
    b = sender(path)
    assert b.sent == a.sent
    assert b.sent_at == [T0, T0]
    assert b.kinds == {"http://x/confirm/2": "email_change"}


def test_reset_empties_the_inbox_and_the_file(tmp_path):
    path = tmp_path / "inbox.json"
    a = sender(path)
    a.send("ana@example.com", "Lisbon", "http://x/invite/1")
    a.reset()
    assert a.sent == []
    assert sender(path).sent == []


def test_missing_or_empty_file_loads_as_empty_inbox(tmp_path):
    assert sender(tmp_path / "inbox.json").sent == []
    (tmp_path / "empty.json").write_text("")
    assert sender(tmp_path / "empty.json").sent == []


@pytest.mark.parametrize("content", ["not json", json.dumps({"version": 2, "messages": []}), json.dumps({"version": 1, "messages": [{}]})])
def test_unreadable_or_wrong_version_file_raises(tmp_path, content):
    path = tmp_path / "inbox.json"
    path.write_text(content)
    with pytest.raises(LocalDataFileError):
        sender(path)
