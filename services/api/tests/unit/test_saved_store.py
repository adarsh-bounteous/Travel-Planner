from decimal import Decimal

from app.places.search import Place
from app.trips.saved_store import DynamoSavedPlaceStore, InMemorySavedPlaceStore

PLACE = Place(
    id="p1",
    name="Alfama",
    image_url="/alfama.jpg",
    place_type="landmark",
    price="free",
    lat=38.711,
    lng=-9.130,
)


class FakeTable:
    """Just enough of a DynamoDB table: get_item and the two update expressions we use."""

    def __init__(self, item: dict) -> None:
        self.item = item
        self.expressions: list[str] = []

    def get_item(self, Key):
        return {"Item": self.item}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeNames=None, **kwargs):
        self.expressions.append(UpdateExpression)
        if ExpressionAttributeNames is None:  # the map-initialising update
            self.item.setdefault("saved_places", {})
            return
        place_id = ExpressionAttributeNames["#id"]
        saved = self.item.setdefault("saved_places", {})
        if UpdateExpression.startswith("SET"):
            saved[place_id] = kwargs["ExpressionAttributeValues"][":p"]
        else:
            saved.pop(place_id, None)


def _dynamo(item: dict) -> tuple[DynamoSavedPlaceStore, FakeTable]:
    store = DynamoSavedPlaceStore.__new__(DynamoSavedPlaceStore)
    store._table = FakeTable(item)
    return store, store._table


def test_account_item_without_saved_places_reads_as_empty():
    store, _ = _dynamo({"pk": "USER#u1", "profile": {"display_name": "Maya"}})
    assert store.list_saved("u1") == []


def test_dynamo_save_list_unsave_keeps_profile():
    store, table = _dynamo({"pk": "USER#u1", "profile": {"display_name": "Maya"}})
    store.save("u1", PLACE)
    assert [p.id for p in store.list_saved("u1")] == ["p1"]
    assert "SET saved_places.#id = :p" in table.expressions
    assert isinstance(table.item["saved_places"]["p1"]["lat"], Decimal)
    store.unsave("u1", "p1")
    assert store.list_saved("u1") == []
    assert table.item["profile"] == {"display_name": "Maya"}


def test_in_memory_keeps_save_order_and_is_idempotent():
    store = InMemorySavedPlaceStore()
    other = PLACE.model_copy(update={"id": "p2"})
    store.save("u1", PLACE)
    store.save("u1", other)
    store.save("u1", PLACE)
    assert [p.id for p in store.list_saved("u1")] == ["p1", "p2"]
    store.unsave("u1", "p1")
    store.unsave("u1", "p1")
    assert [p.id for p in store.list_saved("u1")] == ["p2"]
    assert store.list_saved("u2") == []
