import pytest

from app.main import app
from app.routers import deps


@pytest.fixture
def client(sign_in_as):
    return sign_in_as("a@example.com")


def _matches(client, q):
    return client.get("/places/search", params={"q": q}).json()["matches"]


def test_search_includes_agra_when_live_is_on(client):
    body = client.get("/places/search", params={"q": "Agra"}).json()
    assert body["live"] is True
    agra = next(m for m in body["matches"] if m["name"] == "Agra")
    assert agra["kind"] == "live" and agra["fullGuide"] is False
    assert agra["id"].startswith("live:")


def test_starter_matches_come_before_live_ones(client):
    kinds = [m["kind"] for m in _matches(client, "ja")]
    assert "starter" in kinds and "live" in kinds
    assert kinds == sorted(kinds, key=lambda k: k != "starter")


def test_only_starters_are_marked_full_guide(client):
    matches = _matches(client, "ja")
    assert next(m for m in matches if m["name"] == "Jaipur")["fullGuide"] is True
    assert all(m["fullGuide"] is False for m in matches if m["kind"] == "live")


def test_a_live_place_that_is_also_a_starter_is_listed_once(client):
    jaipurs = [m for m in _matches(client, "Jaipur") if m["name"] == "Jaipur"]
    assert [m["kind"] for m in jaipurs] == ["starter"]


def test_live_off_offers_only_starters_and_makes_no_live_call(client, monkeypatch):
    from dataclasses import replace

    from app.config import get_settings

    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    app.dependency_overrides.pop(deps.get_destination_search)
    off = replace(get_settings(), local_mode=True, live_providers=frozenset())
    app.dependency_overrides[get_settings] = lambda: off
    body = client.get("/places/search", params={"q": "Agra"}).json()
    assert body["live"] is False
    assert {m["kind"] for m in body["matches"]} <= {"starter"}
    assert client.get("/places/search", params={"q": "Jai"}).json()["live"] is False


def test_live_down_still_serves_starters_and_says_so(sign_in_as):
    client = sign_in_as("a@example.com")
    sign_in_as.live_search.down = True
    body = client.get("/places/search", params={"q": "Jai"}).json()
    assert body["unavailable"] is True
    assert [m["name"] for m in body["matches"]] == ["Jaipur"]


def test_under_two_characters_returns_nothing(client, sign_in_as):
    assert _matches(client, "a") == []
    assert _matches(client, " ") == []
    assert sign_in_as.live_search.calls == 0
