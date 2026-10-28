import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.trips.starter_destinations import STARTER_DESTINATIONS

ALL_PAIRS = [(c.name, p.name) for c in STARTER_DESTINATIONS for p in c.places]


def test_list_has_seven_countries_with_three_places_each(sign_in_as):
    a = sign_in_as("a@example.com")
    r = a.get("/starter-destinations")
    assert r.status_code == 200 and len(r.json()) == 7
    assert all(len(c["places"]) == 3 for c in r.json())


def test_place_content_is_served_case_insensitively(sign_in_as):
    a = sign_in_as("a@example.com")
    r = a.get("/starter-destinations/Japan/Tokyo")
    assert r.status_code == 200 and r.json()["medical_guidance"]
    assert a.get("/starter-destinations/japan/tokyo").status_code == 200


def test_unknown_country_or_place_is_404(sign_in_as):
    a = sign_in_as("a@example.com")
    assert a.get("/starter-destinations/Atlantis/Nowhere").status_code == 404
    assert a.get("/starter-destinations/Japan/Nowhere").status_code == 404


def test_signed_out_is_refused(sign_in_as):
    sign_in_as("a@example.com")
    assert TestClient(app).get("/starter-destinations").status_code == 401
    assert TestClient(app).get("/starter-destinations/Japan/Tokyo").status_code == 401


@pytest.mark.parametrize("country,place", ALL_PAIRS)
def test_every_offered_place_returns_content(sign_in_as, country, place):
    a = sign_in_as("a@example.com")
    offered = {c["name"]: c["places"] for c in a.get("/starter-destinations").json()}
    assert place in offered[country]
    assert a.get(f"/starter-destinations/{country}/{place}").status_code == 200
