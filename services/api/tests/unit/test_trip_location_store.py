from decimal import Decimal

from app.locations.cache import DynamoLocationCache
from app.trips.store import DynamoTripStore, Trip
from tests.unit.locations_fakes import LISBON


class FakeTable:
    def __init__(self) -> None:
        self.items: list[dict] = []

    def put_item(self, Item):
        self.items.append(Item)

    def get_item(self, Key):
        for item in self.items:
            if item["pk"] == Key["pk"] and item["sk"] == Key["sk"]:
                return {"Item": item}
        return {}


def _floats(value, found=None):
    found = [] if found is None else found
    if isinstance(value, float):
        found.append(value)
    elif isinstance(value, dict):
        for v in value.values():
            _floats(v, found)
    elif isinstance(value, list):
        for v in value:
            _floats(v, found)
    return found


def _store(table: FakeTable) -> DynamoTripStore:
    store = DynamoTripStore.__new__(DynamoTripStore)
    store._table = table
    return store


def test_trip_saved_before_location_existed_loads_unchanged():
    item = {
        "pk": "USER#u", "sk": "TRIP#t1", "id": "t1", "name": "Old", "destination": "Lisbon",
        "budget": Decimal("500"), "currency": "USD", "days": [], "destination_converted": True,
    }
    trip = DynamoTripStore._to_trip(item)
    assert (trip.name, trip.destination, trip.budget, trip.currency) == ("Old", "Lisbon", 500.0, "USD")
    assert trip.location is None


def test_saving_a_located_trip_writes_no_float():
    table = FakeTable()
    store = _store(table)
    store.save_trip("u", Trip(id="t1", name="X", budget=10.5, location=LISBON))
    assert _floats(table.items[0]) == []
    assert store.get_trip("u", "t1").location == LISBON


def test_unresolved_trip_item_has_no_location_key():
    table = FakeTable()
    _store(table).save_trip("u", Trip(id="t1", name="X"))
    assert "location" not in table.items[0]


def test_dynamo_location_cache_round_trips_without_floats():
    from datetime import UTC, datetime

    table = FakeTable()
    cache = DynamoLocationCache.__new__(DynamoLocationCache)
    cache._table = table
    at = datetime(2026, 1, 1, tzinfo=UTC)
    cache.put("portugal|lisbon|", LISBON, at)
    assert _floats(table.items[0]) == []
    assert table.items[0]["pk"].startswith("GEOCODE#")
    assert cache.get("portugal|lisbon|") == (LISBON, at)
    assert cache.get("other") is None


def test_persistent_store_loads_a_file_written_before_the_field(tmp_path):
    from app.local_data import LocalDataFile
    from app.trips.local_store import PersistentTripStore

    store = PersistentTripStore(LocalDataFile(tmp_path / "data.json"))
    store.save_trip("u", Trip(id="t1", name="Old", destination="Lisbon", budget=5))
    reopened = PersistentTripStore(LocalDataFile(tmp_path / "data.json"))
    old = reopened.get_trip("u", "t1")
    assert old.location is None and old.name == "Old"
    reopened.save_trip("u", old.model_copy(update={"location": LISBON}))
    assert PersistentTripStore(LocalDataFile(tmp_path / "data.json")).get_trip("u", "t1").location == LISBON
