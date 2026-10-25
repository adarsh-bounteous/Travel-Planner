from fastapi.testclient import TestClient

from app.main import app

from app.trips.profile_store import InMemoryProfileStore, Profile

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
