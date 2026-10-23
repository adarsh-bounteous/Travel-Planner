from fastapi.testclient import TestClient

from app.main import app

BLANK = {"display_name": "", "home_city": "", "dietary_notes": ""}


def test_blank_profile_when_none_saved(sign_in_as):
    a = sign_in_as("a@example.com")
    assert a.get("/profile").json() == BLANK


def test_saved_profile_is_shown_next_time_and_only_to_its_owner(sign_in_as):
    a = sign_in_as("a@example.com")
    b = sign_in_as("b@example.com")
    saved = {"display_name": "Maya", "home_city": "Leeds", "dietary_notes": ""}
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
