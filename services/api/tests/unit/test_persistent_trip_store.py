import json
from datetime import date
from decimal import Decimal

import pytest

from app.local_data import LocalDataFile, LocalDataFileError
from app.trips.local_store import PersistentTripStore
from app.trips.store import ChosenOption, Invite, ShareLink, Trip


def make_trip():
    return Trip(
        id="t1", name="Lisbon", destination="Lisbon", start_date=date(2026, 5, 1),
        end_date=date(2026, 5, 3), budget=500.0,
    )


def open_store(path):
    return PersistentTripStore(LocalDataFile(path))


def test_no_file_means_no_data_and_no_file_is_created(tmp_path):
    path = tmp_path / "missing.json"
    store = open_store(path)
    assert store.is_empty() is True
    assert store.list_trips("u1") == []
    assert not path.exists()


def test_trip_survives_a_restart(tmp_path):
    path = tmp_path / "store.json"
    trip = make_trip()
    open_store(path).save_trip("u1", trip)
    assert open_store(path).get_trip("u1", "t1") == trip


def test_invite_share_link_and_editor_survive_a_restart(tmp_path):
    path = tmp_path / "store.json"
    first = open_store(path)
    first.save_invite(Invite(token="i", owner_id="u1", trip_id="t1", email="a@b.co"))
    first.save_share_link(ShareLink(token="s", owner_id="u1", trip_id="t1"))
    first.link_editor("a@b.co", "u1", "t1")
    second = open_store(path)
    assert second.get_invite("i").email == "a@b.co"
    assert second.get_share_link("s").trip_id == "t1"
    assert second.shared_trips("a@b.co") == [("u1", "t1")]


def test_save_writes_the_file_and_delete_removes_the_record(tmp_path):
    path = tmp_path / "store.json"
    store = open_store(path)
    store.save_trip("u1", make_trip())
    on_disk = json.loads(path.read_text())
    assert on_disk["version"] == 1
    assert [r["trip"]["id"] for r in on_disk["trips"]] == ["t1"]
    store.delete_trip("u1", "t1")
    assert json.loads(path.read_text())["trips"] == []
    assert open_store(path).is_empty()


def test_reset_clears_the_file(tmp_path):
    path = tmp_path / "store.json"
    store = open_store(path)
    store.save_trip("u1", make_trip())
    store.reset()
    assert open_store(path).is_empty()


def test_decimals_dates_and_urls_round_trip(tmp_path):
    path = tmp_path / "store.json"
    trip = make_trip().model_copy(update={"options": [ChosenOption(
        id="o", title="Tour", category="activity", date=date(2026, 5, 2),
        booking_url="https://example.com/x", price=Decimal("12.50"), currency="EUR",
    )]})
    open_store(path).save_trip("u1", trip)
    assert open_store(path).get_trip("u1", "t1") == trip


@pytest.mark.parametrize(
    "content",
    [b'{"version": 99}', b'{"version": 1, "trips": [{"owner_id": "u1", "trip": {"id": "t"}}]}'],
)
def test_unknown_version_or_invalid_record_raises(tmp_path, content):
    path = tmp_path / "store.json"
    path.write_bytes(content)
    with pytest.raises(LocalDataFileError, match="unreadable or corrupted"):
        open_store(path)
    assert path.read_bytes() == content
