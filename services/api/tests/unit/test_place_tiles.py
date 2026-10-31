import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.places.tiles import TileSource
from app.routers import deps


def _settings(local_mode: bool, live: frozenset[str]) -> Settings:
    return Settings(
        session_secret="test-secret",
        identity_user_pool_id="",
        identity_client_id="",
        identity_domain="",
        google_redirect_uri="",
        web_origin="https://app.example.test",
        accounts_table_name="a",
        trips_table_name="t",
        cookie_secure=False,
        local_mode=local_mode,
        live_providers=live,
        osm_user_agent="TripPlanner/1.0 (test)",
    )


@pytest.fixture
def setup(monkeypatch):
    calls: list[httpx.Request] = []
    status = {"code": 200}

    def handler(request):
        calls.append(request)
        return httpx.Response(status["code"], content=b"png", headers={"content-type": "image/png"})

    def build(settings):
        monkeypatch.setattr("app.routers.place_tiles.get_settings", lambda: settings)
        source = TileSource(settings, httpx.Client(transport=httpx.MockTransport(handler)))
        app.dependency_overrides[deps.get_tile_source] = lambda: source
        return TestClient(app)

    yield build, calls, status
    app.dependency_overrides.clear()


def test_not_opted_in_makes_no_call(setup):
    build, calls, _ = setup
    client = build(_settings(True, frozenset()))
    assert client.get("/places/tiles/3/4/2.png").status_code == 404
    assert calls == []


def test_sends_identifying_headers_and_caches(setup):
    build, calls, _ = setup
    settings = _settings(True, frozenset({"places"}))
    client = build(settings)
    response = client.get("/places/tiles/3/4/2.png")
    assert response.status_code == 200
    assert response.content == b"png"
    assert response.headers["cache-control"] == "public, max-age=86400"
    assert calls[0].headers["user-agent"].startswith("TripPlanner/")
    assert calls[0].headers["referer"] == settings.web_origin
    assert str(calls[0].url) == "https://tile.openstreetmap.org/3/4/2.png"
    client.get("/places/tiles/3/4/2.png")
    assert len(calls) == 1


@pytest.mark.parametrize("path", ["/places/tiles/25/0/0.png", "/places/tiles/3/8/0.png", "/places/tiles/3/0/8.png"])
def test_invalid_tile_is_400(setup, path):
    build, calls, _ = setup
    client = build(_settings(False, frozenset()))
    assert client.get(path).status_code == 400
    assert calls == []


def test_upstream_failure_is_502(setup):
    build, calls, status = setup
    status["code"] = 500
    client = build(_settings(False, frozenset()))
    assert client.get("/places/tiles/3/4/2.png").status_code == 502
