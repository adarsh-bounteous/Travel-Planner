from fastapi.testclient import TestClient

from app.main import app

SEARCH = {"origin": "Lisbon", "destination": "Madrid", "date": "2026-11-14"}


def test_search_with_no_saved_preferences_asks_for_none(sign_in_as):
    client = sign_in_as("a@example.com")
    r = client.get("/transport/options", params=SEARCH)
    assert r.status_code == 200
    assert len(r.json()["options"]) == 5
    assert not any(o["preferred_provider"] for o in r.json()["options"])


def test_saved_preferences_apply_to_a_later_search_and_survive_other_edits(sign_in_as):
    client = sign_in_as("a@example.com")
    client.put("/profile", json={"transport_preferences": {"max_stops": 1}})
    r = client.get("/transport/options", params=SEARCH)
    assert r.json()["options"] and all(o["stops"] <= 1 for o in r.json()["options"])
    assert client.put("/profile", json={"home_city": "Leeds"}).status_code == 200
    assert client.get("/profile").json()["transport_preferences"]["max_stops"] == 1


def test_preferred_provider_options_stay_in_the_shortlist_flagged(sign_in_as):
    client = sign_in_as("a@example.com")
    client.put("/profile", json={"transport_preferences": {"providers": ["Example Air"], "max_stops": 0}})
    options = client.get("/transport/options", params=SEARCH).json()["options"]
    flagged = [o for o in options if o["provider"] == "Example Air"]
    assert flagged and all(o["preferred_provider"] for o in flagged)


def test_signed_out_search_is_rejected(sign_in_as):
    sign_in_as("a@example.com")
    assert TestClient(app).get("/transport/options", params=SEARCH).status_code == 401
