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


def _seeded(sign_in_as):
    from app.places.search import SEED_CATALOGUE, InMemoryPlaceSearch
    from app.routers import deps

    a = sign_in_as("a@example.com")
    app.dependency_overrides[deps.get_places] = lambda: InMemoryPlaceSearch(SEED_CATALOGUE)
    return a


def test_place_type_filter_returns_only_that_type(sign_in_as):
    a = _seeded(sign_in_as)
    body = a.get("/places", params={"destination": "Lisbon", "place_type": "museum"}).json()
    assert body and {p["place_type"] for p in body} == {"museum"}


def test_price_filter_returns_only_that_price(sign_in_as):
    a = _seeded(sign_in_as)
    body = a.get("/places", params={"destination": "Lisbon", "price": "free"}).json()
    assert body and {p["price"] for p in body} == {"free"}


def test_filters_combine_validate_and_carry_coordinates(sign_in_as):
    a = _seeded(sign_in_as)
    params = {"destination": "Lisbon", "place_type": "museum", "price": "premium"}
    assert a.get("/places", params=params).json() == []
    assert a.get("/places", params={"destination": "Lisbon", "price": "cheap"}).status_code == 422
    body = a.get("/places", params={"destination": "Lisbon"}).json()
    assert set(body[0]) >= {"id", "name", "image_url", "place_type", "price", "lat", "lng"}
    assert len({p["place_type"] for p in body}) > 1 and len({p["price"] for p in body}) > 1
    with_q = {"destination": "Lisbon", "q": "belem"}
    museum = a.get("/places", params={**with_q, "place_type": "museum"}).json()
    assert [p["name"] for p in museum] == ["Belém Tower"]
    assert a.get("/places", params={**with_q, "place_type": "park"}).json() == []
