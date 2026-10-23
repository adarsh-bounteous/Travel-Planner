from unittest.mock import MagicMock

import pytest

from app.trips.profile_store import DynamoProfileStore, InMemoryProfileStore, Profile
from app.trips.store import DynamoTripStore, InMemoryTripStore, Trip


class FakeTable:
    """Stubbed DynamoDB table that records the keys it is asked for."""

    def __init__(self) -> None:
        self.items: dict[tuple[str, str], dict] = {}
        self.get_keys: list[dict] = []
        self.query_kwargs: list[dict] = []

    def put_item(self, Item):
        self.items[(Item["pk"], Item["sk"])] = Item

    def get_item(self, Key):
        self.get_keys.append(Key)
        item = self.items.get((Key["pk"], Key["sk"]))
        return {"Item": item} if item else {}

    def query(self, **kwargs):
        self.query_kwargs.append(kwargs)
        pk = kwargs["ExpressionAttributeValues"][":pk"]
        return {"Items": [i for (p, _), i in self.items.items() if p == pk]}


def _dynamo_store():
    store = DynamoTripStore.__new__(DynamoTripStore)
    store._table = FakeTable()
    return store


@pytest.fixture(params=["memory", "dynamo"])
def store(request):
    return InMemoryTripStore() if request.param == "memory" else _dynamo_store()


def test_other_owner_cannot_resolve_a_trip(store):
    store.save_trip("owner-a", Trip(id="t1", name="Lisbon"))
    assert store.get_trip("owner-b", "t1") is None
    assert store.get_trip("owner-a", "t1").name == "Lisbon"
    assert [t.id for t in store.list_trips("owner-a")] == ["t1"]
    assert store.list_trips("owner-b") == []


def test_dynamo_keys_use_the_callers_partition():
    store = _dynamo_store()
    store.save_trip("owner-a", Trip(id="t1", name="Lisbon"))
    store.get_trip("owner-b", "t1")
    store.list_trips("owner-a")
    table = store._table
    assert table.get_keys == [{"pk": "USER#owner-b", "sk": "TRIP#t1"}]
    assert table.query_kwargs[0]["ExpressionAttributeValues"] == {
        ":pk": "USER#owner-a",
        ":sk": "TRIP#",
    }
    assert "pk = :pk" in table.query_kwargs[0]["KeyConditionExpression"]


def test_in_memory_profiles_are_per_owner():
    profiles = InMemoryProfileStore()
    profiles.save_profile("owner-a", Profile(display_name="Maya"))
    assert profiles.get_profile("owner-b") is None
    assert profiles.get_profile("owner-a").display_name == "Maya"


def test_dynamo_profile_is_a_map_on_the_account_item():
    store = DynamoProfileStore.__new__(DynamoProfileStore)
    store._table = MagicMock()
    store.save_profile("owner-a", Profile(display_name="Maya"))
    kwargs = store._table.update_item.call_args.kwargs
    assert kwargs["Key"] == {"pk": "USER#owner-a"}
    assert kwargs["UpdateExpression"] == "SET profile = :p"
    assert kwargs["ExpressionAttributeValues"][":p"]["display_name"] == "Maya"


def test_dynamo_profile_absent_on_legacy_account_item():
    store = DynamoProfileStore.__new__(DynamoProfileStore)
    store._table = MagicMock()
    store._table.get_item.return_value = {"Item": {"pk": "USER#x", "google_linked": True}}
    assert store.get_profile("x") is None
