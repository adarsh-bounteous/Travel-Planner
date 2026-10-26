import logging

import pytest
from fastapi.testclient import TestClient

from app.auth.fake_identity import FakeIdentityProvider
from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD, LocalSeedTarget
from app.main import app
from app.routers import deps
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


def test_local_mode_without_local_stores_skips_seeding_and_says_so(monkeypatch, caplog):
    local(monkeypatch)
    with caplog.at_level(logging.WARNING):
        start()
    assert "demo data was not seeded" in caplog.text
