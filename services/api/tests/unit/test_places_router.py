from fastapi.testclient import TestClient

from app.main import app


def test_search_returns_places_with_image_and_name(sign_in_as):
    a = sign_in_as("a@example.com")
    body = a.get("/places", params={"destination": "Lisbon"}).json()
    assert body[0]["name"] and body[0]["image_url"]
    assert set(body[0]) >= {"id", "name", "image_url"}


def test_unknown_destination_gives_an_empty_list(sign_in_as):
    a = sign_in_as("a@example.com")
    assert a.get("/places", params={"destination": "Nowhereville"}).json() == []


def test_blank_destination_is_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    assert a.get("/places", params={"destination": "  "}).status_code == 422


def test_signed_out_calls_are_rejected(sign_in_as):
    sign_in_as("a@example.com")
    assert TestClient(app).get("/places", params={"destination": "Lisbon"}).status_code == 401


def test_q_filters_by_name_ignoring_case_and_accents(sign_in_as):
    from app.places.search import SEED_CATALOGUE, InMemoryPlaceSearch
    from app.routers import deps

    a = sign_in_as("a@example.com")
    app.dependency_overrides[deps.get_places] = lambda: InMemoryPlaceSearch(SEED_CATALOGUE)
    assert a.get("/places", params={"destination": "Lisbon", "q": "xyz"}).json() == []
    found = a.get("/places", params={"destination": "Lisbon", "q": "belem"}).json()
    assert [p["name"] for p in found] == ["Belém Tower"]
