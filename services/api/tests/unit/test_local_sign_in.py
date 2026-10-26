import pytest
from fastapi.testclient import TestClient

from app.local_mode import LocalModeRefusedError
from app.main import app
from app.routers import auth
from tests.unit.test_local_seed_startup import real_local, sign_in_demo  # noqa: F401


def test_off_uses_cloud_identity_and_issues_no_local_session(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    auth._local_identity.cache_clear()

    class Cloud:
        def sign_in_email(self, email, password):
            raise auth.WrongPassword

    monkeypatch.setattr(auth, "_cognito", lambda: Cloud())
    response = TestClient(app).post("/auth/sign-in", json={"email": "a@b.co", "password": "x"})
    assert response.status_code == 401
    assert "session" not in response.cookies
    assert auth._local_identity.cache_info().currsize == 0


def test_local_on_starts_without_cloud_settings(monkeypatch):
    for name in (
        "IDENTITY_USER_POOL_ID",
        "IDENTITY_CLIENT_ID",
        "IDENTITY_DOMAIN",
        "ACCOUNTS_TABLE_NAME",
        "TRIPS_TABLE_NAME",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200


@pytest.mark.parametrize("app_env", ["production", "staging", ""])
def test_local_on_outside_local_refuses_to_start(monkeypatch, app_env):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", app_env)
    with pytest.raises(LocalModeRefusedError):
        with TestClient(app):
            pass


def test_local_session_token_is_accepted_by_trips(real_local):  # noqa: F811
    with TestClient(app) as client:
        signed_in = sign_in_demo(client)
        assert signed_in.status_code == 200
        token = signed_in.cookies["session"]
        assert TestClient(app).get("/trips", cookies={"session": token}).status_code == 200
