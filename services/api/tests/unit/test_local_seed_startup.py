import logging
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.auth.fake_identity import FakeIdentityProvider
from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD, LocalSeedTarget, run_first_start_seed
from app.main import app
from app.routers import auth, deps
from app.trips.store import InMemoryTripStore


@pytest.fixture
def target(monkeypatch):
    identity, trips = FakeIdentityProvider(), InMemoryTripStore()
    found = LocalSeedTarget(
        is_empty=lambda: identity.is_empty() and trips.is_empty(), identity=identity, trips=trips
    )
    monkeypatch.setattr(deps, "get_local_seed_target", lambda: found)
    return found


def start():
    with TestClient(app):
        pass


def demo_trip_names(target):
    user_id = target.identity.sign_in_email(DEMO_EMAIL, DEMO_PASSWORD)
    return sorted(t.name for t in target.trips.list_trips(user_id))


def local(monkeypatch):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")


def test_first_local_start_seeds_demo_user_and_trips(monkeypatch, target):
    local(monkeypatch)
    start()
    assert demo_trip_names(target) == ["Summer in Kyoto", "Weekend in Lisbon"]


def test_restart_adds_nothing_and_keeps_edits(monkeypatch, target):
    local(monkeypatch)
    start()
    user_id = target.identity.sign_in_email(DEMO_EMAIL, DEMO_PASSWORD)
    edited = target.trips.list_trips(user_id)[0].model_copy(update={"name": "Renamed"})
    target.trips.save_trip(user_id, edited)
    start()
    assert target.identity.account_count(DEMO_EMAIL) == 1
    assert len(target.trips.list_trips(user_id)) == 2
    assert "Renamed" in demo_trip_names(target)


def test_existing_data_means_no_seed(monkeypatch, target):
    local(monkeypatch)
    target.identity.sign_up_email("sam@example.com", "abcdefghij12")
    start()
    assert target.identity.account_exists(DEMO_EMAIL) is False


def test_local_mode_off_resolves_no_target(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    calls = []
    monkeypatch.setattr(deps, "get_local_seed_target", lambda: calls.append(1))
    start()
    assert calls == []


def test_missing_target_skips_seeding_and_says_so(caplog):
    with caplog.at_level(logging.WARNING):
        assert run_first_start_seed(None, date(2026, 1, 1)) is False
    assert "demo data was not seeded" in caplog.text


@pytest.fixture
def real_local(monkeypatch):
    """Local mode with the app's own wiring: no override of get_local_seed_target."""
    local(monkeypatch)
    monkeypatch.setenv("COOKIE_SECURE", "false")
    caches = (auth._local_identity, auth._local_accounts, deps._local_trips)
    for cache in caches:
        cache.cache_clear()
    yield
    for cache in caches:
        cache.cache_clear()


def sign_in_demo(client):
    return client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})


def test_real_first_start_lets_the_demo_user_sign_in_and_see_two_trips(real_local):
    with TestClient(app) as client:
        assert sign_in_demo(client).status_code == 200
        assert client.get("/auth/me").status_code == 200
        names = [t["name"] for t in client.get("/trips").json()]
        assert sorted(names) == ["Summer in Kyoto", "Weekend in Lisbon"]
        status = client.get("/startup-status").json()
        assert status["demo_account"] == {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}


def demo_trips_template():
    from app.local_seed import _sample_trips

    return _sample_trips(date(2026, 1, 1))[0]


def test_real_second_seed_adds_nothing_and_keeps_edits(real_local):
    with TestClient(app) as client:
        sign_in_demo(client)
        lisbon = next(t for t in client.get("/trips").json() if t["name"] == "Weekend in Lisbon")
        body = {k: lisbon[k] for k in ("destination", "start_date", "end_date", "budget")}
        client.put(f"/trips/{lisbon['id']}", json={**body, "name": "Lisbon, extended"})
        assert run_first_start_seed(deps.get_local_seed_target(), date(2026, 1, 1)) is False
        names = [t["name"] for t in client.get("/trips").json()]
    assert sorted(names) == ["Lisbon, extended", "Summer in Kyoto"]
    assert auth._local_identity().account_exists(DEMO_EMAIL)


def test_real_existing_trips_mean_no_seed(real_local):
    trip = demo_trips_template()
    deps._local_trips().save_trip("user-sam", trip)
    with TestClient(app) as client:
        assert sign_in_demo(client).status_code == 404
        assert client.get("/startup-status").json()["demo_account"] is None


def test_local_mode_off_keeps_the_cloud_stores(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    assert deps.get_local_seed_target() is None


def test_restart_keeps_local_data_and_clearing_the_file_reseeds(real_local, tmp_path):
    """What the documented reset (stop, clear store.json, start again) relies on."""
    with TestClient(app) as first:
        sign_in_demo(first)
        first.post("/auth/sign-up", json={"email": "sam@example.com", "password": "abcdefghij12"})
        trip = first.get("/trips").json()[0]
        first.delete(f"/trips/{trip['id']}")
    for cache in (auth._local_identity, auth._local_accounts, deps._local_trips):
        cache.cache_clear()
    with TestClient(app) as restarted:
        sign_in_demo(restarted)
        assert [t["name"] for t in restarted.get("/trips").json()] != []
        assert trip["id"] not in [t["id"] for t in restarted.get("/trips").json()]
    (tmp_path / "local-data" / "store.json").unlink()
    for cache in (auth._local_identity, auth._local_accounts, deps._local_trips):
        cache.cache_clear()
    with TestClient(app) as second:
        assert sign_in_demo(second).status_code == 200
        names = sorted(t["name"] for t in second.get("/trips").json())
        assert names == ["Summer in Kyoto", "Weekend in Lisbon"]
        # accounts are durable, so sam survives the restart (still unconfirmed)
        assert second.post("/auth/sign-in", json={"email": "sam@example.com", "password": "abcdefghij12"}).status_code == 403
