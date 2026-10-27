import pytest
from fastapi.testclient import TestClient

from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD
from app.main import app
from app.routers import deps
from tests.unit.test_local_seed_startup import real_local  # noqa: F401


@pytest.fixture
def local_client(real_local, tmp_path, monkeypatch):  # noqa: F811
    monkeypatch.setenv("LOCAL_DATA_DIR", str(tmp_path))
    deps._local_saved_places.cache_clear()
    with TestClient(app) as client:
        yield client
    deps._local_saved_places.cache_clear()


def search(client, destination):
    return client.get("/places", params={"destination": destination}).json()


def test_search_lists_places_for_the_destination(local_client):
    body = search(local_client, "Lisbon")
    assert len(body) >= 3 and all(p["name"] for p in body)


def test_second_destination_differs_from_first(local_client):
    first, second = search(local_client, "Lisbon"), search(local_client, "Kyoto")
    assert {p["id"] for p in first}.isdisjoint({p["id"] for p in second})
    assert [p["name"] for p in first] != [p["name"] for p in second]


def test_matching_ignores_case_accents_and_whitespace(local_client):
    assert search(local_client, "  PARIS ") == search(local_client, "Paris") != []


def test_unmatched_destination_is_empty(local_client):
    assert search(local_client, "Zzyzx") == []


def test_local_search_never_uses_the_real_service(local_client, monkeypatch):
    def refuse(*a, **k):
        raise AssertionError("outside request")

    monkeypatch.setattr(deps, "_places", refuse)
    monkeypatch.setattr("socket.socket.connect", refuse)
    body = search(local_client, "Paris")
    assert body and not any(p["image_url"].startswith("http") for p in body)


def test_generated_place_can_be_saved(local_client):
    local_client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    place = search(local_client, "Lisbon")[0]
    assert local_client.put(f"/saved-places/{place['id']}", json=place).status_code == 200
    assert [p["id"] for p in local_client.get("/saved-places").json()] == [place["id"]]


def test_switch_off_uses_the_real_places_service(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    assert deps.get_places() is deps._places()


def test_turning_on_in_live_deployment_is_refused(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    with TestClient(app) as client:
        r = client.put("/local/mode", json={"local_mode": True})
        assert (r.status_code, r.json()) == (403, {"code": "local_mode_not_allowed"})
        assert client.get("/startup-status").json()["local_mode"] is False


def test_turning_off_answers_the_effective_value(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    with TestClient(app) as client:
        r = client.put("/local/mode", json={"local_mode": False})
    assert (r.status_code, r.json()) == (200, {"local_mode": False})


def test_turning_on_in_local_keeps_the_effective_value(real_local):  # noqa: F811
    with TestClient(app) as client:
        r = client.put("/local/mode", json={"local_mode": True})
    assert (r.status_code, r.json()) == (200, {"local_mode": True})
