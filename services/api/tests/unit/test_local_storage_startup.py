import json

import pytest
from fastapi.testclient import TestClient

from app.local_data import LocalDataFileError
from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD
from app.main import app
from app.routers import auth, deps
from app.trips.store import DynamoTripStore

BODY = {
    "name": "Rome", "destination": "Rome", "start_date": "2026-06-01", "end_date": "2026-06-03",
    "budget": 300, "currency": "EUR", "traveller_count": 1,
}


@pytest.fixture
def local(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    clear()
    yield tmp_path / "local-data" / "store.json"
    clear()


def clear():
    for cache in (auth._local_identity, auth._local_accounts, deps._local_trips, deps._trips):
        cache.cache_clear()


def restart():
    for cache in (auth._local_identity, deps._local_trips):
        cache.cache_clear()


def sign_in(client):
    return client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})


def names(client):
    return sorted(t["name"] for t in client.get("/trips").json())


SAMPLES = ["Summer in Kyoto", "Weekend in Lisbon"]


@pytest.mark.parametrize("value", [None, "off"])
def test_cloud_is_the_default(monkeypatch, tmp_path, value):
    class Fake:
        def Table(self, _):
            return object()

    if value is None:
        monkeypatch.delenv("LOCAL_MODE", raising=False)
    else:
        monkeypatch.setenv("LOCAL_MODE", value)
    monkeypatch.setattr("boto3.resource", lambda *_a, **_k: Fake())
    clear()
    assert isinstance(deps.get_trips(), DynamoTripStore)
    assert not (tmp_path / "local-data" / "store.json").exists()
    clear()


def test_first_start_without_a_file_seeds_into_a_new_file(local):
    assert not local.exists()
    with TestClient(app) as client:
        sign_in(client)
        assert names(client) == SAMPLES
    assert len(json.loads(local.read_text())["trips"]) == 2


def test_created_trip_is_written_and_survives_a_restart(local):
    with TestClient(app) as client:
        sign_in(client)
        assert client.post("/trips", json=BODY).status_code == 201
        assert "Rome" in [r["trip"]["name"] for r in json.loads(local.read_text())["trips"]]
    restart()
    with TestClient(app) as client:
        sign_in(client)
        assert "Rome" in names(client)


def test_deleting_or_emptying_the_file_returns_a_fresh_state(local):
    for clear_file in (lambda: local.unlink(), lambda: local.write_bytes(b"")):
        with TestClient(app) as client:
            sign_in(client)
            client.post("/trips", json=BODY)
        clear_file()
        restart()
        with TestClient(app) as client:
            sign_in(client)
            assert names(client) == SAMPLES


def test_local_reset_leaves_a_reseeded_file(local):
    with TestClient(app) as client:
        sign_in(client)
        client.post("/trips", json=BODY)
        assert client.post("/local/reset", headers={"X-Local-Reset": "1"}).status_code < 300
    restart()
    with TestClient(app) as client:
        sign_in(client)
        assert names(client) == SAMPLES


def test_no_cloud_is_needed(local, monkeypatch):
    def boom(*_a, **_k):
        raise AssertionError("cloud used")

    monkeypatch.setattr("boto3.resource", boom)
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        sign_in(client)
        assert client.get("/trips").status_code == 200


@pytest.mark.parametrize(
    "content",
    [b"{not json", b"[]", b"\xff\xfe", b'{"version": 99}',
     b'{"version": 1, "trips": [{"owner_id": "u", "trip": {}}]}'],
)
def test_a_bad_file_stops_startup_and_is_left_alone(local, content):
    local.parent.mkdir(parents=True)
    local.write_bytes(content)
    with pytest.raises(LocalDataFileError, match="unreadable or corrupted") as error:
        with TestClient(app):
            pass
    assert str(local) in str(error.value)
    assert local.read_bytes() == content


def test_a_directory_in_place_of_the_file_stops_startup(local):
    local.mkdir(parents=True)
    with pytest.raises(LocalDataFileError, match="unreadable or corrupted"):
        with TestClient(app):
            pass
