from fastapi.testclient import TestClient

from app.main import app

from app.trips.profile_store import InMemoryProfileStore, Profile, TransportPreferences

NO_PREFERENCES = {
    "modes": [],
    "cabin": None,
    "departure_window": None,
    "max_stops": None,
    "providers": [],
}

BLANK = {
    "display_name": "",
    "home_city": "",
    "dietary_notes": "",
    "citizenship": "",
    "residence": "",
    "health_status": "",
    "religion": "",
    "diet": "",
    "tastes": [],
    "travel_style": "",
    "transport_preferences": NO_PREFERENCES,
}


def test_every_setup_answer_round_trips_and_is_per_owner(sign_in_as):
    a = sign_in_as("a@example.com")
    b = sign_in_as("b@example.com")
    saved = {
        **BLANK,
        "citizenship": "Ireland",
        "residence": "Portugal",
        "health_status": "Allergies",
        "religion": "Hindu",
        "diet": "Vegan",
        "tastes": ["Food", "Museums"],
        "travel_style": "Relaxed",
    }
    assert a.put("/profile", json=saved).status_code == 200
    assert a.get("/profile").json() == saved
    assert b.get("/profile").json() == BLANK


def test_profile_stored_before_the_setup_answers_still_reads():
    store = InMemoryProfileStore()
    store._profiles["u"] = Profile.model_validate({"display_name": "Maya"})
    assert store.get_profile("u").citizenship == ""
    assert store.get_profile("u").tastes == []


def test_blank_profile_when_none_saved(sign_in_as):
    a = sign_in_as("a@example.com")
    assert a.get("/profile").json() == BLANK


def test_saved_profile_is_shown_next_time_and_only_to_its_owner(sign_in_as):
    a = sign_in_as("a@example.com")
    b = sign_in_as("b@example.com")
    saved = {**BLANK, "display_name": "Maya", "home_city": "Leeds"}
    assert a.put("/profile", json=saved).status_code == 200
    assert a.get("/profile").json() == saved
    assert b.get("/profile").json() == BLANK


def test_profile_fields_are_capped(sign_in_as):
    a = sign_in_as("a@example.com")
    response = a.put("/profile", json={**BLANK, "dietary_notes": "x" * 5000})
    assert response.status_code == 422


def test_signed_out_calls_are_rejected(sign_in_as):
    sign_in_as("a@example.com")
    client = TestClient(app)
    assert client.get("/profile").status_code == 401
    assert client.put("/profile", json=BLANK).status_code == 401


def test_profile_stored_before_transport_preferences_loads_with_nothing_set():
    p = Profile.model_validate({"display_name": "Ana", "home_city": "Lisbon"})
    assert p.transport_preferences == TransportPreferences()


def test_transport_preferences_round_trip(sign_in_as):
    a = sign_in_as("a@example.com")
    prefs = {
        "modes": ["train"],
        "cabin": "economy",
        "departure_window": "morning",
        "max_stops": 1,
        "providers": ["Example Air"],
    }
    assert a.put("/profile", json={"transport_preferences": prefs}).status_code == 200
    assert a.get("/profile").json()["transport_preferences"] == prefs


def test_plain_profile_put_keeps_saved_transport_preferences(sign_in_as):
    a = sign_in_as("a@example.com")
    a.put("/profile", json={"transport_preferences": {"max_stops": 1}})
    a.put("/profile", json={"display_name": "Maya"})
    assert a.get("/profile").json()["transport_preferences"]["max_stops"] == 1
    assert a.get("/profile").json()["display_name"] == "Maya"


def test_any_whole_number_of_stops_from_0_to_10_is_accepted(sign_in_as):
    a = sign_in_as("a@example.com")
    for n in (0, 3, 10):
        assert a.put("/profile", json={"transport_preferences": {"max_stops": n}}).status_code == 200
    for n in (11, -1, 2.5):
        assert a.put("/profile", json={"transport_preferences": {"max_stops": n}}).status_code == 422


def test_departure_window_must_be_one_of_the_four(sign_in_as):
    a = sign_in_as("a@example.com")
    assert a.put("/profile", json={"transport_preferences": {"departure_window": "dawn"}}).status_code == 422
    for w in ("morning", "afternoon", "evening", "night"):
        assert a.put("/profile", json={"transport_preferences": {"departure_window": w}}).status_code == 200


def test_duplicate_providers_are_rejected_ignoring_case(sign_in_as):
    a = sign_in_as("a@example.com")
    body = {"transport_preferences": {"providers": ["Example Air", "example air"]}}
    assert a.put("/profile", json=body).status_code == 422
