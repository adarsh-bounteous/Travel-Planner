from dataclasses import replace
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.auth.accounts import InMemoryAccountStore
from app.auth.fake_identity import FakeIdentityProvider
from app.auth.identity import IdentityError
from app.config import get_settings
from app.main import app
from app.routers import auth

PASSWORD = "abcdefghij12"
T0 = datetime(2026, 1, 1, tzinfo=UTC)


class Clock:
    def __init__(self):
        self.now = T0


@pytest.fixture
def fake():
    return FakeIdentityProvider()


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def client(fake, clock):
    app.dependency_overrides[auth.get_identity] = lambda: fake
    accounts = InMemoryAccountStore()
    settings = replace(get_settings(), cookie_secure=False)
    app.dependency_overrides[auth.get_accounts] = lambda: accounts
    app.dependency_overrides[auth.get_now] = lambda: clock.now
    app.dependency_overrides[auth.get_settings] = lambda: settings
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


def _signed_in(client, fake, email="maya@example.com"):
    client.post("/auth/sign-up", json={"email": email, "password": PASSWORD})
    fake.confirm(email)
    return client.post("/auth/sign-in", json={"email": email, "password": PASSWORD})


def _state(client, mode):
    r = client.get("/auth/google/start", params={"mode": mode})
    assert r.status_code == 303
    return parse_qs(urlparse(r.headers["location"]).query)["state"][0]


def test_sign_up_confirm_then_sign_in(client, fake):  # AC1, AC3
    r = client.post("/auth/sign-up", json={"email": "maya@example.com", "password": PASSWORD})
    assert r.status_code == 202
    fake.confirm("maya@example.com")
    r = client.post("/auth/sign-in", json={"email": "maya@example.com", "password": PASSWORD})
    assert r.status_code == 200
    assert client.get("/auth/me").json() == {"email": "maya@example.com", "method": "email"}


def test_sign_up_does_not_sign_in(client):  # AC14
    r = client.post("/auth/sign-up", json={"email": "new@example.com", "password": PASSWORD})
    assert "set-cookie" not in r.headers
    assert client.get("/auth/me").status_code == 401


def test_unconfirmed_cannot_sign_in(client):  # AC13
    client.post("/auth/sign-up", json={"email": "pending@example.com", "password": PASSWORD})
    r = client.post("/auth/sign-in", json={"email": "pending@example.com", "password": PASSWORD})
    assert r.status_code == 403 and r.json()["code"] == "email_not_confirmed"
    assert "set-cookie" not in r.headers


def test_wrong_password(client, fake):  # AC10
    _signed_in(client, fake)
    client.post("/auth/sign-out")
    r = client.post("/auth/sign-in", json={"email": "maya@example.com", "password": "nope"})
    assert r.status_code == 401 and r.json()["code"] == "wrong_password"
    assert "set-cookie" not in r.headers


def test_no_account(client):  # AC11
    r = client.post("/auth/sign-in", json={"email": "nobody@example.com", "password": PASSWORD})
    assert r.status_code == 404 and r.json()["code"] == "no_account"


@pytest.mark.parametrize("password", ["abcdefghi12", "abcdefghijkl", "123456789012"])
def test_password_rule(client, fake, password):  # AC16-18
    r = client.post("/auth/sign-up", json={"email": "rule@example.com", "password": password})
    assert r.status_code == 422 and r.json()["code"] == "password_rule"
    assert fake.account_count("rule@example.com") == 0


def test_duplicate_email_is_generic(client, fake):  # AC21, AC22
    client.post("/auth/sign-up", json={"email": "taken@example.com", "password": PASSWORD})
    dup = client.post("/auth/sign-up", json={"email": "taken@example.com", "password": PASSWORD})
    assert dup.status_code == 400 and dup.json()["code"] == "could_not_create"
    assert "exists" not in dup.text.lower() and "already" not in dup.text.lower()
    assert fake.account_count("taken@example.com") == 1


def test_invalid_email_looks_like_duplicate(client):
    r = client.post("/auth/sign-up", json={"email": "not-an-email", "password": PASSWORD})
    assert r.status_code == 400 and r.json()["code"] == "could_not_create"


def test_sign_out_clears_session(client, fake):  # AC5, AC9
    _signed_in(client, fake)
    assert client.get("/auth/me").status_code == 200
    client.post("/auth/sign-out")
    assert client.get("/auth/me").status_code == 401


def test_session_expires_after_seven_days_idle(client, fake, clock):  # AC7, AC8
    _signed_in(client, fake)
    clock.now = T0 + timedelta(days=6)
    assert client.get("/auth/me").status_code == 200
    clock.now = T0 + timedelta(days=13)
    assert client.get("/auth/me").status_code == 401


def test_cookie_slides_on_use(client, fake, clock):  # AC6
    _signed_in(client, fake)
    clock.now = T0 + timedelta(days=6)
    assert client.get("/auth/me").status_code == 200
    clock.now = T0 + timedelta(days=12)
    assert client.get("/auth/me").status_code == 200


def test_session_expires_at_seven_days(client, fake, clock):  # AC7
    _signed_in(client, fake)
    clock.now = T0 + timedelta(days=7)
    assert client.get("/auth/me").status_code == 401


def test_cookie_is_http_only(client, fake):
    r = _signed_in(client, fake)
    header = r.headers["set-cookie"].lower()
    assert "httponly" in header and "samesite=lax" in header


def test_local_cookie_has_no_secure_attribute(client, fake):  # AC3
    r = _signed_in(client, fake)
    header = r.headers["set-cookie"].lower()
    assert "secure" not in header and "httponly" in header and "samesite=lax" in header


def test_google_sign_up_then_sign_in(client):  # AC2, AC4
    r = client.get(
        "/auth/google/callback", params={"code": "ok-new", "state": _state(client, "up")}
    )
    assert r.status_code == 303
    client.post("/auth/sign-out")
    r = client.get(
        "/auth/google/callback", params={"code": "ok-new", "state": _state(client, "in")}
    )
    assert r.status_code == 303 and "session=" in r.headers["set-cookie"]
    assert client.get("/auth/me").status_code == 200


def test_google_not_linked(client):  # AC19, AC20
    r = client.get(
        "/auth/google/callback", params={"code": "ok-unlinked", "state": _state(client, "in")}
    )
    assert "session=" not in r.headers.get("set-cookie", "")
    assert r.headers["location"].endswith("/sign-in?error=google_not_linked")


def test_google_cancelled(client):  # AC12
    r = client.get(
        "/auth/google/callback",
        params={"error": "access_denied", "state": _state(client, "in")},
    )
    assert "session=" not in r.headers.get("set-cookie", "")
    assert r.headers["location"].endswith("/sign-in?error=google_cancelled")


def _assert_google_refused(r):
    assert "session=" not in r.headers.get("set-cookie", "")
    assert r.headers["location"].endswith("/sign-in")


def test_google_state_is_bound_to_the_initiating_browser(client):
    state = _state(client, "in")
    victim = TestClient(app, follow_redirects=False)  # no nonce cookie
    r = victim.get("/auth/google/callback", params={"code": "ok-new", "state": state})
    _assert_google_refused(r)


def test_google_state_is_single_use(client):
    state = _state(client, "up")
    first = client.get("/auth/google/callback", params={"code": "ok-new", "state": state})
    assert first.headers["location"] == "/"
    replay = client.get("/auth/google/callback", params={"code": "ok-new", "state": state})
    _assert_google_refused(replay)


def test_google_state_expires(client, clock):
    state = _state(client, "in")
    clock.now = T0 + timedelta(minutes=11)
    r = client.get("/auth/google/callback", params={"code": "ok-new", "state": state})
    _assert_google_refused(r)


def test_non_ascii_state_is_rejected_not_a_server_error(client):
    r = client.get("/auth/google/callback", params={"code": "ok-new", "state": "abc.é"})
    _assert_google_refused(r)


def test_google_exchange_failure_is_not_reported_as_cancelled(client, fake, monkeypatch):
    def boom(code):
        raise IdentityError

    monkeypatch.setattr(fake, "complete_google", boom)
    r = client.get(
        "/auth/google/callback", params={"code": "ok-new", "state": _state(client, "in")}
    )
    _assert_google_refused(r)


def test_google_callback_rejects_forged_state(client):
    r = client.get("/auth/google/callback", params={"code": "ok-new", "state": "forged.sig"})
    assert "session=" not in r.headers.get("set-cookie", "")
    assert r.headers["location"].endswith("/sign-in")


def test_resend_confirmation(client, fake):
    client.post("/auth/sign-up", json={"email": "pending@example.com", "password": PASSWORD})
    r = client.post("/auth/resend-confirmation", json={"email": "pending@example.com"})
    assert r.status_code == 202
    assert fake.resent == ["pending@example.com"]
