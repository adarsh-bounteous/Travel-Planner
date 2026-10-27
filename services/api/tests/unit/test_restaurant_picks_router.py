from decimal import Decimal

from fastapi.testclient import TestClient

from app.dining.options import ProviderRestaurant
from app.dining.providers import InMemoryRestaurantProvider
from app.main import app
from app.routers import deps
from app.trips.store import DynamoTripStore
from tests.trip_body import trip_body


def _trip(client, **changes):
    body = trip_body(name="Trip", start_date="2026-05-01", end_date="2026-05-03", destination="Lisbon", **changes)
    return client.post("/trips", json=body).json()["id"]


def _pick(client, tid, name="Casa Lima", **extra):
    return client.post(f"/trips/{tid}/restaurants", json={"name": name, "city": "Lisbon", **extra})


def test_two_picks_both_appear(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    _pick(a, tid)
    r = _pick(a, tid, "Zaytoon Alfama")
    assert r.status_code == 201
    assert [p["name"] for p in r.json()["restaurants"]] == ["Casa Lima", "Zaytoon Alfama"]


def test_pick_without_day_is_unscheduled_and_priced_from_the_shortlist(sign_in_as):
    a = sign_in_as("a@example.com")
    p = _pick(a, _trip(a)).json()["restaurants"][0]
    assert p["date"] is None and p["meal"] is None
    assert Decimal(p["typical_price"]) == 19 and p["currency"] == "EUR"


def test_pick_with_day_and_meal(sign_in_as):
    a = sign_in_as("a@example.com")
    r = _pick(a, _trip(a), date="2026-05-01", meal="lunch")
    p = r.json()["restaurants"][0]
    assert (p["date"], p["meal"]) == ("2026-05-01", "lunch")


def test_day_and_meal_must_go_together_and_be_on_the_trip(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    assert _pick(a, tid, "Mesa Real", date="2026-05-01").status_code == 422
    assert _pick(a, tid, "Mesa Real", meal="lunch").status_code == 422
    assert _pick(a, tid, "Mesa Real", date="2030-01-01", meal="lunch").status_code == 422


def test_not_on_shortlist_and_duplicates(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    r = _pick(a, tid, "Nowhere Cafe")
    assert (r.status_code, r.json()["code"]) == (422, "invalid_restaurant")
    _pick(a, tid)
    r = _pick(a, tid)
    assert (r.status_code, r.json()["code"]) == (409, "already_on_trip")


def test_cost_carries_the_estimate(sign_in_as):
    a = sign_in_as("a@example.com")
    body = _pick(a, _trip(a)).json()
    assert body["cost"]["restaurant_total"] == 38.0
    assert body["cost"]["total"] == 38.0


def test_move_changes_day_and_meal_only(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    pid = _pick(a, tid, date="2026-05-01", meal="lunch").json()["restaurants"][0]["id"]
    r = a.put(f"/trips/{tid}/restaurants/{pid}", json={"date": "2026-05-02", "meal": "dinner"})
    assert [(p["date"], p["meal"]) for p in r.json()["restaurants"]] == [("2026-05-02", "dinner")]
    r = a.put(f"/trips/{tid}/restaurants/{pid}", json={"date": None, "meal": None})
    assert [(p["date"], p["meal"]) for p in r.json()["restaurants"]] == [(None, None)]
    assert a.put(f"/trips/{tid}/restaurants/nope", json={"date": None, "meal": None}).status_code == 404
    assert a.put(f"/trips/{tid}/restaurants/{pid}", json={"date": "2030-01-01", "meal": "lunch"}).status_code == 422


def test_access_rules(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    assert TestClient(app).post(f"/trips/{tid}/restaurants", json={"name": "Casa Lima", "city": "Lisbon"}).status_code == 401
    assert _pick(sign_in_as("b@example.com"), tid).status_code == 404


def test_unknown_price_restaurant_can_be_picked_and_is_not_over_budget(sign_in_as):
    a = sign_in_as("a@example.com")
    unpriced = ProviderRestaurant(
        name="Cafe Misterio",
        city="Lisbon",
        cuisine="Cafe",
        dining_style="Casual",
        price_level=1,
        typical_price=None,
        currency="EUR",
        suits=[],
    )
    provider = InMemoryRestaurantProvider("Fixture", {"lisbon": [unpriced]})
    app.dependency_overrides[deps.get_restaurant_providers] = lambda: [provider]
    try:
        tid = _trip(a, budget=10)
        entry = a.get(f"/trips/{tid}/restaurant-shortlist").json()["entries"][0]
        assert entry["restaurant"]["typical_price"] is None and entry["fits_budget"] is True
        body = _pick(a, tid, "Cafe Misterio").json()
    finally:
        del app.dependency_overrides[deps.get_restaurant_providers]
    assert body["restaurants"][0]["typical_price"] is None
    assert body["cost"]["restaurant_unpriced_count"] == 1 and body["cost"]["restaurant_total"] == 0.0


def test_trip_stored_without_restaurants_loads_empty():
    trip = DynamoTripStore._to_trip({"pk": "USER#u", "sk": "TRIP#t", "id": "t", "name": "Old trip"})
    assert trip.restaurants == []
