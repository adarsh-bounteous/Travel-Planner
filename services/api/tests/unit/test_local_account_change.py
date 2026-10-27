from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth.local_identity import CONFIRMATION_LINK_LIFETIME
from app.local_seed import DEMO_EMAIL
from app.main import app
from app.routers import auth, deps

EMAIL = "ana@example.com"
PASSWORD = "abcdefghij12"
NEW = "newpassword123"
NEW_EMAIL = "new@example.com"
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
        auth._local_identity().create_confirmed_user(EMAIL, PASSWORD)
        assert client.post("/auth/sign-in", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
        yield client
    for cache in CACHES:
        cache.cache_clear()


def sign_in(client, email, password):
    return client.post("/auth/sign-in", json={"email": email, "password": password})


def inbox_to(client, to):
    return [m for m in client.get("/local/inbox").json() if m["to"] == to]


def request_change(client, new_email=NEW_EMAIL):
    return client.post(
        "/auth/account/email", json={"current_password": PASSWORD, "new_email": new_email}
    )


def token_for(client, to):
    return inbox_to(client, to)[0]["link"].rsplit("/", 1)[1]


def change_password(client, current=PASSWORD, new=NEW):
    return client.post("/auth/account/password", json={"current_password": current, "new_password": new})


def test_new_password_signs_in_and_previous_is_refused(local_client):
    assert change_password(local_client).status_code == 204
    assert sign_in(local_client, EMAIL, NEW).status_code == 200
    r = sign_in(local_client, EMAIL, PASSWORD)
    assert r.status_code == 401 and r.json() == {"code": "wrong_password"}


def test_signed_out_password_change_is_refused(local_client):
    anon = TestClient(app)
    assert change_password(anon).status_code == 401
    assert sign_in(local_client, EMAIL, PASSWORD).status_code == 200


def test_wrong_current_password_is_refused_and_previous_still_works(local_client):
    r = change_password(local_client, current="wrong-password-1")
    assert r.status_code == 403 and r.json() == {"code": "wrong_password"}
    assert sign_in(local_client, EMAIL, PASSWORD).status_code == 200


def test_weak_new_password_is_refused_and_unchanged(local_client):
    r = change_password(local_client, new="short1")
    assert r.status_code == 422 and r.json() == {"code": "password_rule"}
    assert sign_in(local_client, EMAIL, PASSWORD).status_code == 200


def test_email_change_lists_a_link_for_the_new_address(local_client):
    assert request_change(local_client).status_code == 202
    [message] = inbox_to(local_client, NEW_EMAIL)
    assert message["kind"] == "email_change"
    assert message["link"].startswith("http://localhost:5173/confirm-email/")


def test_signed_out_email_change_lists_nothing(local_client):
    before = len(local_client.get("/local/inbox").json())
    r = TestClient(app).post(
        "/auth/account/email", json={"current_password": PASSWORD, "new_email": NEW_EMAIL}
    )
    assert r.status_code == 401
    assert len(local_client.get("/local/inbox").json()) == before


def test_email_of_another_account_is_refused_and_unchanged(local_client):
    r = request_change(local_client, DEMO_EMAIL)
    assert r.status_code == 409 and r.json() == {"code": "email_unavailable"}
    assert local_client.get("/auth/me").json()["email"] == EMAIL
    assert not inbox_to(local_client, DEMO_EMAIL)


def test_before_the_link_the_new_email_fails_and_the_old_one_works(local_client):
    request_change(local_client)
    r = sign_in(local_client, NEW_EMAIL, PASSWORD)
    assert r.status_code == 404 and r.json() == {"code": "no_account"}
    assert sign_in(local_client, EMAIL, PASSWORD).status_code == 200


def test_after_the_link_the_new_email_signs_in_and_the_old_one_does_not(local_client):
    request_change(local_client)
    token = token_for(local_client, NEW_EMAIL)
    r = local_client.post("/auth/confirm", json={"token": token})
    assert r.json() == {"status": "confirmed", "kind": "email_change"}
    assert sign_in(local_client, NEW_EMAIL, PASSWORD).status_code == 200
    assert local_client.get("/auth/me").json()["email"] == NEW_EMAIL
    r = sign_in(local_client, EMAIL, PASSWORD)
    assert r.status_code == 404 and r.json() == {"code": "no_account"}


def test_a_used_link_is_refused_and_the_email_stays(local_client):
    request_change(local_client)
    token = token_for(local_client, NEW_EMAIL)
    assert local_client.post("/auth/confirm", json={"token": token}).status_code == 200
    again = local_client.post("/auth/confirm", json={"token": token})
    assert again.status_code == 409 and again.json() == {"code": "link_already_used"}
    assert sign_in(local_client, NEW_EMAIL, PASSWORD).status_code == 200


def test_an_expired_link_is_refused_and_the_old_email_still_works(local_client):
    request_change(local_client)
    token = token_for(local_client, NEW_EMAIL)
    later = auth._local_identity()._clock() + CONFIRMATION_LINK_LIFETIME + timedelta(minutes=1)
    auth._local_identity()._clock = lambda: later
    r = local_client.post("/auth/confirm", json={"token": token})
    assert r.status_code == 410 and r.json() == {"code": "link_expired"}
    assert sign_in(local_client, EMAIL, PASSWORD).status_code == 200


def test_only_the_newest_link_works(local_client):
    request_change(local_client, "first@example.com")
    request_change(local_client, "second@example.com")
    old = token_for(local_client, "first@example.com")
    r = local_client.post("/auth/confirm", json={"token": old})
    assert r.status_code == 409 and r.json() == {"code": "link_already_used"}
    new = token_for(local_client, "second@example.com")
    assert local_client.post("/auth/confirm", json={"token": new}).status_code == 200


def test_old_accounts_file_is_migrated(tmp_path):
    import sqlite3
    from datetime import UTC, datetime

    from app.auth.local_identity import LocalIdentityProvider

    db = tmp_path / "accounts.sqlite3"
    old = sqlite3.connect(db)
    old.executescript(
        "CREATE TABLE users (user_id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,"
        " password_hash TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0);"
        "CREATE TABLE confirmation_tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL,"
        " expires_at TEXT NOT NULL, used_at TEXT);"
    )
    old.commit()
    old.close()
    now = datetime(2026, 1, 1, tzinfo=UTC)
    sent = []
    make = lambda: LocalIdentityProvider(  # noqa: E731
        db, lambda: now, lambda e, link: sent.append((e, link)), lambda: "http://web.test"
    )
    provider = make()
    provider.sign_up_email(EMAIL, PASSWORD)
    provider = make()  # restart: migration is idempotent
    assert provider.confirm_email(sent[-1][1].rsplit("/", 1)[1]) == "sign_up"
    assert provider.sign_in_email(EMAIL, PASSWORD)
