import pytest
from fastapi.testclient import TestClient

from app.local_mode import LocalModeRefusedError, resolve_live_providers
from app.main import app


def test_unknown_provider_refused():
    with pytest.raises(LocalModeRefusedError):
        resolve_live_providers({"LOCAL_LIVE_PROVIDERS": "bogus"})


def test_places_parsed_and_empty_default():
    assert resolve_live_providers({"LOCAL_LIVE_PROVIDERS": " places "}) == {"places"}
    assert resolve_live_providers({}) == frozenset()


def _map_tiles(monkeypatch, providers):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("LOCAL_LIVE_PROVIDERS", providers)
    with TestClient(app) as client:
        return client.get("/startup-status").json()["map_tiles"]


def test_places_opt_in_turns_tiles_on(monkeypatch):
    assert _map_tiles(monkeypatch, "places") is True


def test_empty_keeps_tiles_off(monkeypatch):
    assert _map_tiles(monkeypatch, "") is False
