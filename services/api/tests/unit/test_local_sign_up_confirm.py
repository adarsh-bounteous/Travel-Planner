from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth.local_identity import CONFIRMATION_LINK_LIFETIME
from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD
from app.main import app
from app.routers import auth, deps

CREDS = {"email": "ana@example.com", "password": "abcdefghij12"}
CACHES = (auth._local_identity, auth._local_accounts, deps._local_trips, deps._local_invite_sender)


@pytest.fixture
def local_client(monkeypatch):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("WEB_ORIGIN", "http://localhost:5173")
    for cache in CACHES:
        cache.cache_clear()
    with TestClient(app) as client:
        yield client
    for cache in CACHES:
        cache.cache_clear()


def sign_up(client):
    return client.post("/auth/sign-up", json=CREDS)


def token_from_inbox(client):
    [message] = client.get("/local/inbox").json()
    return message["link"].rsplit("/", 1)[1]


def confirm(client):
    return client.post("/auth/confirm", json={"token": token_from_inbox(client)})


def test_sign_up_is_accepted_and_the_inbox_lists_the_link(local_client):
    r = sign_up(local_client)
    assert r.status_code == 202
    assert r.json() == {"status": "confirmation_sent"}
    [message] = local_client.get("/local/inbox").json()
    assert message["to"] == "ana@example.com"
    assert message["kind"] == "confirmation"
    assert message["link"].startswith("http://localhost:5173/confirm-email/")


def test_invites_are_marked_as_invites_in_the_inbox(local_client):
    local_client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    trip = local_client.get("/trips").json()[0]
    local_client.post(f"/trips/{trip['id']}/editors", json={"email": "bo@example.com"})
    [message] = local_client.get("/local/inbox").json()
    assert message["kind"] == "invite"


def test_confirm_then_sign_in_then_sign_out(local_client):
    sign_up(local_client)
    assert confirm(local_client).status_code == 200
    signed_in = local_client.post("/auth/sign-in", json=CREDS)
    assert signed_in.status_code == 200 and "session" in signed_in.cookies
    assert local_client.get("/auth/me").status_code == 200
    assert local_client.post("/auth/sign-out").status_code == 204
    assert local_client.get("/auth/me").status_code == 401


def test_wrong_password_is_an_error(local_client):
    sign_up(local_client)
    confirm(local_client)
    r = local_client.post("/auth/sign-in", json={**CREDS, "password": "wrong-password-1"})
    assert r.status_code == 401 and r.json() == {"code": "wrong_password"}


def test_unconfirmed_account_cannot_sign_in(local_client):
    sign_up(local_client)
    r = local_client.post("/auth/sign-in", json=CREDS)
    assert r.status_code == 403 and r.json() == {"code": "email_not_confirmed"}


def test_used_link_is_an_error(local_client):
    sign_up(local_client)
    token = token_from_inbox(local_client)
    local_client.post("/auth/confirm", json={"token": token})
    again = local_client.post("/auth/confirm", json={"token": token})
    assert again.status_code == 409 and again.json() == {"code": "link_already_used"}


def test_expired_link_is_an_error(local_client):
    sign_up(local_client)
    later = datetime.now(UTC) + CONFIRMATION_LINK_LIFETIME + timedelta(minutes=1)
    auth._local_identity()._clock = lambda: later
    r = confirm(local_client)
    assert r.status_code == 410 and r.json() == {"code": "link_expired"}


def test_unknown_link_is_an_error(local_client):
    r = local_client.post("/auth/confirm", json={"token": "x"})
    assert r.status_code == 404 and r.json() == {"code": "link_invalid"}


def test_duplicate_sign_up_is_an_error_and_sends_no_second_email(local_client):
    sign_up(local_client)
    r = local_client.post("/auth/sign-up", json={**CREDS, "email": "Ana@Example.com"})
    assert r.status_code == 400 and r.json() == {"code": "could_not_create"}
    assert len(local_client.get("/local/inbox").json()) == 1


def test_accounts_survive_an_api_restart(local_client):
    sign_up(local_client)
    confirm(local_client)
    for cache in CACHES:
        cache.cache_clear()
    assert local_client.post("/auth/sign-in", json=CREDS).status_code == 200


def test_no_cloud_identity_is_used(local_client, monkeypatch):
    for name in ("IDENTITY_USER_POOL_ID", "IDENTITY_CLIENT_ID", "IDENTITY_DOMAIN", "ACCOUNTS_TABLE_NAME"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(auth, "_cognito", lambda: pytest.fail("cloud identity was used"))
    sign_up(local_client)
    assert confirm(local_client).status_code == 200
    assert local_client.post("/auth/sign-in", json=CREDS).status_code == 200


def test_demo_account_still_signs_in_after_a_restart_without_duplicate_trips(local_client):
    count = lambda: len(local_client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}) and local_client.get("/trips").json())
    first = count()
    assert first > 0
    for cache in CACHES:
        cache.cache_clear()
    with TestClient(app) as restarted:  # startup seeds again
        restarted.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert len(restarted.get("/trips").json()) == first


def test_reset_clears_accounts_and_restores_the_demo_user(local_client):
    sign_up(local_client)
    confirm(local_client)
    assert local_client.post("/local/reset", headers={"X-Local-Reset": "1"}).status_code == 204
    assert local_client.post("/auth/sign-in", json=CREDS).status_code == 404
    assert local_client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}).status_code == 200


def test_confirm_does_not_exist_with_local_mode_off(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    assert TestClient(app).post("/auth/confirm", json={"token": "x"}).status_code == 404
