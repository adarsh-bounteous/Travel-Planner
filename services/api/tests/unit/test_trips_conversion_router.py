import pytest

from app.main import app
from app.routers import deps
from app.trips.store import Trip
from tests.trip_body import trip_body


@pytest.fixture
def legacy(sign_in_as):
    """(client, save) where save(id, destination) stores an unconverted trip straight into the store."""
    client = sign_in_as("a@example.com")
    client.post("/trips", json=trip_body())  # so the owner id exists in the store
    store = app.dependency_overrides[deps.get_trips]()
    owner = next(iter(store._trips))[0]

    def save(trip_id, destination):
        store.save_trip(owner, Trip(id=trip_id, name="X", destination=destination))

    return client, save


def test_trip_created_after_conversion_gets_no_country_or_place(sign_in_as):
    client = sign_in_as("a@example.com")
    created = client.post("/trips", json=trip_body(destination="Lisbon")).json()
    fetched = client.get(f"/trips/{created['id']}").json()
    assert fetched["country"] is None and fetched["place"] is None
    assert fetched["destination_unmatched"] is False
    assert client.get("/trips").json()[0]["country"] is None


def test_list_converts_a_legacy_trip(legacy):
    client, save = legacy
    save("t5", "Sunny coast")
    save("t6", "Lisbon")
    by_id = {t["id"]: t for t in client.get("/trips").json()}
    assert by_id["t5"]["destination_unmatched"] is True
    assert (by_id["t6"]["country"], by_id["t6"]["place"]) == ("Portugal", "Lisbon")


def test_detail_flags_a_legacy_trip(legacy):
    client, save = legacy
    save("t6", "Atlantis")
    assert client.get("/trips/t6").json()["destination_unmatched"] is True


def test_editing_a_flagged_trip_to_a_match_clears_the_flag(legacy):
    client, save = legacy
    save("t7", "Atlantis")
    client.get("/trips/t7")
    saved = client.put("/trips/t7", json={"name": "X", "destination": "Lisbon, Portugal"}).json()
    assert saved["destination_unmatched"] is False
    assert (saved["country"], saved["place"]) == ("Portugal", "Lisbon")


def test_editing_to_another_non_match_keeps_the_flag(legacy):
    client, save = legacy
    save("t7", "Atlantis")
    client.get("/trips/t7")
    saved = client.put("/trips/t7", json={"name": "X", "destination": "Narnia"}).json()
    assert saved["destination_unmatched"] is True


def test_body_cannot_set_the_conversion_fields(legacy):
    client, save = legacy
    save("t7", "Atlantis")
    body = {"name": "X", "destination": "Narnia", "country": "Japan", "place": "Kyoto", "destination_unmatched": False}
    saved = client.put("/trips/t7", json=body).json()
    assert saved["country"] is None and saved["destination_unmatched"] is True
