import pytest
from fastapi.testclient import TestClient

from app.local_mode import LocalModeRefusedError
from app.main import app


def test_status_off_matches_production(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    with TestClient(app) as client:
        body = client.get("/startup-status").json()
        assert client.get("/health").json() == {"status": "ok"}
    assert "environment" not in body  # the environment name is not exposed to anonymous callers
    assert body["local_mode"] is False
    assert not any(body["stand_ins"].values())


def test_status_on_in_local(monkeypatch):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    with TestClient(app) as client:
        body = client.get("/startup-status").json()
    assert body["local_mode"] is True
    assert set(body["stand_ins"]) == {"storage", "sign_in", "cloud_services"}
    assert all(body["stand_ins"].values())


def test_startup_refused(monkeypatch):
    monkeypatch.setenv("LOCAL_MODE", "on")
    monkeypatch.setenv("APP_ENV", "staging")
    with pytest.raises(LocalModeRefusedError):
        with TestClient(app):
            pass


def _status_with_identity(monkeypatch, identity):
    from app.local_seed import LocalSeedTarget
    from app.routers import deps
    from app.trips.store import InMemoryTripStore

    # is_empty is False so startup does not seed: the test controls the demo user
    target = LocalSeedTarget(is_empty=lambda: False, identity=identity, trips=InMemoryTripStore())
    monkeypatch.setattr(deps, "get_local_seed_target", lambda: target)
    with TestClient(app) as client:
        return client.get("/startup-status").json()


def test_demo_account_is_null_with_local_mode_off(monkeypatch):
    from app.auth.fake_identity import FakeIdentityProvider
    from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD

    monkeypatch.delenv("LOCAL_MODE", raising=False)
    identity = FakeIdentityProvider()
    identity.create_confirmed_user(DEMO_EMAIL, DEMO_PASSWORD)
    assert _status_with_identity(monkeypatch, identity)["demo_account"] is None


def test_demo_account_follows_the_demo_user(monkeypatch):
    from app.auth.fake_identity import FakeIdentityProvider
    from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD

    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    identity = FakeIdentityProvider()
    assert _status_with_identity(monkeypatch, identity)["demo_account"] is None
    identity.create_confirmed_user(DEMO_EMAIL, DEMO_PASSWORD)
    assert _status_with_identity(monkeypatch, identity)["demo_account"] == {
        "email": DEMO_EMAIL,
        "password": DEMO_PASSWORD,
    }
