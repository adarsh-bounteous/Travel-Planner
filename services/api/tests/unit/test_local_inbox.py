from datetime import datetime

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


def test_inbox_lists_confirmation_and_invite_newest_first(local_client):
    local_client.post("/auth/sign-up", json={"email": "new@example.com", "password": "correct horse 42"})
    local_client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    trip = local_client.get("/trips").json()[0]
    local_client.post(f"/trips/{trip['id']}/editors", json={"email": "ana@example.com"})
    invite, confirmation = local_client.get("/local/inbox").json()
    assert (invite["kind"], invite["subject"]) == ("invite", "You are invited to a trip")
    assert (confirmation["kind"], confirmation["subject"]) == ("confirmation", "Confirm your sign-in")
    assert confirmation["to"] == "new@example.com"
    datetime.fromisoformat(invite["sent_at"])


def test_inbox_link_completes_the_confirmation(local_client):
    local_client.post("/auth/sign-up", json={"email": "new@example.com", "password": "correct horse 42"})
    [mail] = local_client.get("/local/inbox").json()
    token = mail["link"].rsplit("/", 1)[1]
    assert local_client.post("/auth/confirm", json={"token": token}).json() == {"status": "confirmed"}
    assert local_client.post("/auth/sign-in", json={"email": "new@example.com", "password": "correct horse 42"}).status_code == 200
    assert local_client.post("/auth/confirm", json={"token": token}).status_code == 409


def test_local_mode_never_calls_ses(local_client, monkeypatch):
    def refuse(*args, **kwargs):
        raise AssertionError("external call")

    monkeypatch.setattr("boto3.client", refuse)
    monkeypatch.setenv("INVITE_FROM_ADDRESS", "no-reply@example.com")
    local_client.post("/auth/sign-up", json={"email": "new@example.com", "password": "correct horse 42"})
    assert len(local_client.get("/local/inbox").json()) == 1


def restart():
    for cache in (auth._local_identity, auth._local_accounts, deps._local_trips, deps._local_invite_sender):
        cache.cache_clear()


def test_inbox_survives_an_api_restart_and_reload(local_client, tmp_path):
    local_client.post("/auth/sign-up", json={"email": "new@example.com", "password": "correct horse 42"})
    local_client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    trip = local_client.get("/trips").json()[0]
    local_client.post(f"/trips/{trip['id']}/editors", json={"email": "ana@example.com"})
    before = local_client.get("/local/inbox").json()
    assert len(before) == 2
    restart()
    assert local_client.get("/local/inbox").json() == before
    restart()
    assert local_client.get("/local/inbox").json() == before


def test_messages_sent_outside_local_mode_are_not_kept(monkeypatch, tmp_path):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    monkeypatch.delenv("INVITE_FROM_ADDRESS", raising=False)
    deps._invite_sender.cache_clear()
    deps.get_invite_sender().send("ana@example.com", "Lisbon", "http://x/invite/1")
    deps._invite_sender.cache_clear()
    with TestClient(app) as client:
        assert client.get("/local/inbox").status_code == 404
    assert not (tmp_path / "local-data" / "inbox.json").exists()
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    restart()
    assert deps.get_local_inbox().sent == []
    restart()


def test_inbox_lists_an_emailed_itinerary_with_its_html(local_client):
    local_client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    trip = local_client.get("/trips").json()[0]
    assert local_client.post(f"/trips/{trip['id']}/itinerary/email").status_code == 204
    [message] = local_client.get("/local/inbox").json()
    assert (message["kind"], message["subject"], message["to"]) == ("itinerary", "Your itinerary", DEMO_EMAIL)
    assert message["trip_name"] == trip["name"] and "Travel essentials" in message["html"]
