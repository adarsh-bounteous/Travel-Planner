import pytest
from fastapi.testclient import TestClient

from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD
from app.main import app
from app.routers import auth, deps

PREFS = {"modes": ["train"], "cabin": "economy", "departure_window": "morning", "max_stops": 1, "providers": []}
BODY = {
    "display_name": "Maya", "home_city": "Manchester", "diet": "Vegetarian", "tastes": ["Food"],
    "transport_preferences": PREFS,
}
ANA = {"email": "ana@example.com", "password": "abcdefghij12"}
CACHES = (auth._local_identity, auth._local_accounts, deps._local_trips, deps._local_profiles,
          deps._local_invite_sender)


@pytest.fixture
def local(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("WEB_ORIGIN", "http://localhost:5173")
    for cache in CACHES:
        cache.cache_clear()
    with TestClient(app):
        yield tmp_path / "local-data" / "profiles.json"
    for cache in CACHES:
        cache.cache_clear()


def restart():
    for cache in (auth._local_identity, auth._local_accounts, deps._local_trips, deps._local_profiles):
        cache.cache_clear()


def demo():
    client = TestClient(app)
    assert client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}).status_code == 200
    return client


def test_saved_profile_and_preferences_are_shown(local):
    client = demo()
    assert client.put("/profile", json=BODY).status_code == 200
    got = client.get("/profile").json()
    assert got["display_name"] == "Maya" and got["tastes"] == ["Food"]
    assert got["transport_preferences"]["modes"] == ["train"]
    assert deps.get_profiles() is deps._local_profiles()


def test_edits_are_shown_and_omitted_preferences_are_kept(local):
    client = demo()
    client.put("/profile", json=BODY)
    client.put("/profile", json={**BODY, "home_city": "Leeds", "tastes": ["Food", "Museums"]})
    got = client.get("/profile").json()
    assert got["home_city"] == "Leeds" and got["tastes"] == ["Food", "Museums"]
    no_prefs = {k: v for k, v in BODY.items() if k != "transport_preferences"}
    client.put("/profile", json=no_prefs)
    assert client.get("/profile").json()["transport_preferences"]["modes"] == ["train"]


def test_changed_preferences_survive_a_restart(local):
    client = demo()
    client.put("/profile", json={**BODY, "travel_style": "Relaxed", "transport_preferences": {**PREFS, "cabin": "business"}})
    restart()
    got = demo().get("/profile").json()
    assert got["travel_style"] == "Relaxed"
    assert got["transport_preferences"]["cabin"] == "business"


def test_new_account_has_an_empty_editable_profile(local):
    owner = demo()
    ana = TestClient(app)
    assert ana.post("/auth/sign-up", json=ANA).status_code == 202
    mail = next(m for m in owner.get("/local/inbox").json() if m["kind"] == "confirmation")
    assert ana.post("/auth/confirm", json={"token": mail["link"].rsplit("/", 1)[1]}).status_code == 200
    assert ana.post("/auth/sign-in", json=ANA).status_code == 200
    r = ana.get("/profile")
    assert r.status_code == 200
    assert r.json()["display_name"] == "" and r.json()["tastes"] == []
    assert r.json()["transport_preferences"]["modes"] == []
    assert ana.put("/profile", json=BODY).status_code == 200


def test_invalid_values_are_refused_and_the_previous_ones_stay(local):
    client = demo()
    client.put("/profile", json=BODY)
    before = local.read_text()
    for bad in (
        {**BODY, "display_name": "x" * 81},
        {**BODY, "tastes": ["t"] * 21},
        {**BODY, "transport_preferences": {**PREFS, "cabin": "first"}},
        {**BODY, "transport_preferences": {**PREFS, "max_stops": 11}},
    ):
        assert client.put("/profile", json=bad).status_code == 422
    got = client.get("/profile").json()
    assert got["display_name"] == "Maya" and got["transport_preferences"]["cabin"] == "economy"
    assert local.read_text() == before
    restart()
    assert demo().get("/profile").json()["display_name"] == "Maya"


def test_no_extra_profile_routes(local):
    assert {p for p in app.openapi()["paths"] if "profile" in p} == {"/profile"}
