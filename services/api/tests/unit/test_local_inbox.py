import pytest
from fastapi.testclient import TestClient

from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD
from app.main import app
from app.routers import auth, deps


@pytest.fixture
def local_client(monkeypatch):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("WEB_ORIGIN", "http://localhost:5173")
    caches = (auth._local_identity, auth._local_accounts, deps._local_trips, deps._local_invite_sender)
    for cache in caches:
        cache.cache_clear()
    with TestClient(app) as client:
        yield client
    for cache in caches:
        cache.cache_clear()


def test_inbox_starts_empty(local_client):
    assert local_client.get("/local/inbox").json() == []


def test_invite_email_lands_in_the_local_inbox(local_client):
    local_client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    trip = local_client.get("/trips").json()[0]
    assert local_client.post(f"/trips/{trip['id']}/editors", json={"email": "ana@example.com"}).status_code == 201
    [message] = local_client.get("/local/inbox").json()
    assert message["to"] == "ana@example.com"
    assert message["trip_name"] == trip["name"]
    assert message["link"].startswith("http://localhost:5173/invite/")


def test_inbox_does_not_exist_with_local_mode_off(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    monkeypatch.delenv("INVITE_FROM_ADDRESS", raising=False)
    with TestClient(app) as client:
        assert client.get("/local/inbox").status_code == 404
