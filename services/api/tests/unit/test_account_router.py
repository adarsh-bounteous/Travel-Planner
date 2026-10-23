from dataclasses import replace
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.auth.accounts import InMemoryAccountStore
from app.auth.fake_identity import FakeIdentityProvider
from app.config import get_settings
from app.main import app
from app.routers import auth

PASSWORD = "abcdefghij12"
EMAIL = "maya@example.com"


@pytest.fixture
def fake():
    return FakeIdentityProvider()


@pytest.fixture
def accounts():
    return InMemoryAccountStore()


@pytest.fixture
def client(fake, accounts):
    settings = replace(get_settings(), cookie_secure=False)
    now = datetime(2026, 1, 1, tzinfo=UTC)
    app.dependency_overrides[auth.get_identity] = lambda: fake
    app.dependency_overrides[auth.get_accounts] = lambda: accounts
    app.dependency_overrides[auth.get_now] = lambda: now
    app.dependency_overrides[auth.get_settings] = lambda: settings
    yield TestClient(app, follow_redirects=False)
    app.dependency_overrides.clear()


@pytest.fixture
def signed_in(client, fake):
    client.post("/auth/sign-up", json={"email": EMAIL, "password": PASSWORD})
    fake.confirm(EMAIL)
    assert client.post("/auth/sign-in", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    return client


def _email(client, password=PASSWORD, new_email="new@example.com"):
    return client.post(
        "/auth/account/email", json={"current_password": password, "new_email": new_email}
    )


def _password(client, new_password, password=PASSWORD):
    return client.post(
        "/auth/account/password",
        json={"current_password": password, "new_password": new_password},
    )


def _can_sign_in(client, password):
    return client.post("/auth/sign-in", json={"email": EMAIL, "password": password}).status_code == 200


def test_email_change_shown_after_confirming_link(signed_in, fake):  # AC2
    assert _email(signed_in).status_code == 202
    fake.confirm_email_change("new@example.com")
    assert signed_in.get("/auth/me").json()["email"] == "new@example.com"


def test_new_password_lets_them_sign_in(signed_in):  # AC3
    assert _password(signed_in, "newpassword12").status_code == 204
    assert _can_sign_in(signed_in, "newpassword12")


def test_unconfirmed_email_change_keeps_previous_email(signed_in):  # AC10
    _email(signed_in)
    assert signed_in.get("/auth/me").json()["email"] == EMAIL


@pytest.mark.parametrize("new_password", ["abcdefghi12", "abcdefghijkl"])
def test_weak_password_rejected(signed_in, new_password):  # AC11, AC12
    r = _password(signed_in, new_password)
    assert r.status_code == 422 and r.json()["code"] == "password_rule"
    assert _can_sign_in(signed_in, PASSWORD)


def test_email_in_use_is_neutral_and_changes_nothing(signed_in, fake):  # AC13, AC14
    fake.sign_up_email("taken@example.com", PASSWORD)
    r = _email(signed_in, new_email="taken@example.com")
    assert r.status_code == 409
    assert r.json() == {"code": "email_unavailable"}
    assert signed_in.get("/auth/me").json()["email"] == EMAIL


def test_email_change_needs_current_password(signed_in, fake):  # AC15
    for password in ("", "not-the-password"):
        r = _email(signed_in, password=password)
        assert r.status_code == 403 and r.json()["code"] == "wrong_password"
    assert fake.pending_email == {}
    assert signed_in.get("/auth/me").json()["email"] == EMAIL


def test_password_change_needs_current_password(signed_in):  # AC16
    assert _password(signed_in, "newpassword12", password="").status_code == 403
    assert _can_sign_in(signed_in, PASSWORD)


def test_malformed_new_email_rejected(signed_in, fake):
    r = _email(signed_in, new_email="not-an-email")
    assert r.status_code == 422 and r.json() == {"code": "invalid_email"}
    assert fake.pending_email == {}


def test_google_account_has_no_change_option(client, accounts):  # AC7
    user_id = "google-abc"
    accounts.link_google(user_id)
    from app.auth.session import issue_session

    client.cookies.set("session", issue_session(user_id, datetime(2026, 1, 1, tzinfo=UTC)))
    assert client.get("/auth/me").json()["method"] == "google"
    r = _password(client, "newpassword12", password="x")
    assert r.status_code == 403 and r.json() == {"code": "not_available"}
    assert _email(client, password="x").json() == {"code": "not_available"}


def test_me_reports_email_method(signed_in):
    assert signed_in.get("/auth/me").json() == {"email": EMAIL, "method": "email"}


def test_signed_out_calls_refused(client):
    assert _email(client).status_code == 401
    assert _password(client, "newpassword12").status_code == 401
