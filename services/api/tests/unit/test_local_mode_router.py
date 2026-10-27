import pytest

from app.config import get_settings
from app.local_mode import clear_local_mode_override


@pytest.fixture(autouse=True)
def _clear_override():
    clear_local_mode_override()
    yield
    clear_local_mode_override()


def test_turning_on_in_local_works(monkeypatch, sign_in_as):
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    client = sign_in_as("a@example.com")
    assert client.get("/local/mode").json() == {"local_mode": False}
    assert client.put("/local/mode", json={"on": True}).json() == {"local_mode": True}
    assert get_settings().local_mode is True
    assert client.put("/local/mode", json={"on": False}).json() == {"local_mode": False}


def test_turning_on_in_live_is_refused_and_stays_off(monkeypatch, sign_in_as):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    r = sign_in_as("a@example.com").put("/local/mode", json={"on": True})
    assert r.status_code == 409
    assert r.json() == {"code": "local_mode_not_allowed"}
    assert get_settings().local_mode is False


def test_turning_off_in_live_is_fine(monkeypatch, sign_in_as):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    assert sign_in_as("a@example.com").put("/local/mode", json={"on": False}).status_code == 200


def test_switch_needs_sign_in(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    assert TestClient(app).put("/local/mode", json={"on": True}).status_code == 401
