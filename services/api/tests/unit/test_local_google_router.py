from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import auth, deps

PASSWORD = "pw-pw-pw-pw1"
CACHES = (auth._local_identity, auth._local_accounts, deps._local_trips, deps._local_invite_sender)


def _use_mode(monkeypatch, local: bool):
    monkeypatch.setenv("LOCAL_MODE", "true" if local else "false")
    monkeypatch.setenv("APP_ENV", "local" if local else "test")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("WEB_ORIGIN", "http://localhost:5173")
    for cache in CACHES:
        cache.cache_clear()


@pytest.fixture
def local_client(monkeypatch):
    _use_mode(monkeypatch, True)
    with TestClient(app, follow_redirects=False) as client:
        client.provider = auth._local_identity()
        yield client
    for cache in CACHES:
        cache.cache_clear()


@pytest.fixture
def client(monkeypatch):
    _use_mode(monkeypatch, False)
    with TestClient(app, follow_redirects=False) as client:
        yield client
    for cache in CACHES:
        cache.cache_clear()


def _state(client, mode):
    r = client.get("/auth/google/start", params={"mode": mode})
    assert r.status_code == 303
    assert urlparse(r.headers["location"]).path == "/local/google-consent"
    return parse_qs(urlparse(r.headers["location"]).query)["state"][0]


def test_lists_accounts_and_the_sample_without_account(local_client):  # AC8
    local_client.provider.create_confirmed_user("alex@example.com", PASSWORD)
    body = local_client.get("/local/google-identities").json()
    assert {"email": "alex@example.com", "has_account": True} in body["identities"]
    assert {"email": "new.user@example.com", "has_account": False} in body["identities"]


def test_404_with_local_mode_off(client):
    assert client.get("/local/google-identities").status_code == 404


def test_linked_email_signs_in_as_that_account(local_client):  # AC1, AC2
    local_client.provider.create_confirmed_user("alex@example.com", PASSWORD)
    r = local_client.get(
        "/auth/google/callback",
        params={"code": "alex@example.com", "state": _state(local_client, "in")},
    )
    assert r.status_code == 303 and r.headers["location"].endswith("/")
    assert "session" in r.cookies
    assert local_client.get("/auth/me").json()["email"] == "alex@example.com"


def test_email_without_account_gets_the_no_account_prompt(local_client):  # AC5, AC7
    r = local_client.get(
        "/auth/google/callback",
        params={"code": "new.user@example.com", "state": _state(local_client, "in")},
    )
    assert r.headers["location"].endswith("/sign-in?error=google_not_linked")
    assert "session" not in r.cookies


def test_cancel_returns_to_sign_in_signed_out(local_client):  # AC3, AC4
    r = local_client.get(
        "/auth/google/callback",
        params={"error": "access_denied", "state": _state(local_client, "in")},
    )
    assert r.headers["location"].endswith("/sign-in?error=google_cancelled")
    assert "session" not in r.cookies
