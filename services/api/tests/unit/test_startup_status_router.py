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
    assert body["environment"] == "production"
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
