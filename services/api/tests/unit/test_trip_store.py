from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from app.trips.profile_store import DynamoProfileStore, InMemoryProfileStore, Profile
from app.trips.store import DynamoTripStore, Day, InMemoryTripStore, Trip, reconcile_days


class FakeTable:
    """Stubbed DynamoDB table that records the keys it is asked for."""

    def __init__(self) -> None:
        self.items: dict[tuple[str, str], dict] = {}
        self.get_keys: list[dict] = []
        self.query_kwargs: list[dict] = []

    def put_item(self, Item):
        self.items[(Item["pk"], Item["sk"])] = Item

    def delete_item(self, Key):
        self.items.pop((Key["pk"], Key["sk"]), None)

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


def test_delete_trip_only_removes_the_owners_trip(store):
    store.save_trip("owner-a", Trip(id="t1", name="Lisbon"))
    store.delete_trip("owner-b", "t1")
    assert store.get_trip("owner-a", "t1") is not None
    store.delete_trip("owner-a", "t1")
    assert store.get_trip("owner-a", "t1") is None


def test_legacy_trip_item_without_days_or_budget_loads():
    store = _dynamo_store()
    store._table.items[("USER#o", "TRIP#t1")] = {"pk": "USER#o", "sk": "TRIP#t1", "id": "t1", "name": "Old"}
    t = store.get_trip("o", "t1")
    assert t.days == [] and t.budget is None and t.currency == "EUR"


def test_dynamo_budget_saved_as_decimal_and_read_as_float():
    store = _dynamo_store()
    store.save_trip("o", Trip(id="t1", name="x", budget=1500.5))
    assert isinstance(store._table.items[("USER#o", "TRIP#t1")]["budget"], Decimal)
    assert store.get_trip("o", "t1").budget == 1500.5


def test_reconcile_days_keeps_names_of_dates_still_in_range():
    existing = [Day(date=date(2027, 3, d), name=f"N{d}") for d in (3, 4, 5)]
    days = reconcile_days(date(2027, 3, 4), date(2027, 3, 6), existing)
    assert [(d.date.day, d.name) for d in days] == [(4, "N4"), (5, "N5"), (6, "Day 3")]
    assert reconcile_days(None, None, existing) == []


def test_stored_trip_without_travellers_or_editors_still_loads():
    t = Trip.model_validate({"id": "t1", "name": "Old"})
    assert (t.travellers, t.editors) == ([], [])


def test_in_memory_editor_and_invite_index():
    from app.trips.store import Invite

    store = InMemoryTripStore()
    store.save_invite(Invite(token="tok", owner_id="o", trip_id="t", email="a@example.com"))
    assert store.get_invite("tok").trip_id == "t"
    store.delete_invite("tok")
    assert store.get_invite("tok") is None
    store.link_editor("a@example.com", "o", "t")
    assert store.shared_trips("a@example.com") == [("o", "t")]
    store.unlink_editor("a@example.com", "t")
    assert store.shared_trips("a@example.com") == []


def test_dynamo_editor_and_invite_index_key_shapes():
    from app.trips.store import Invite

    store = DynamoTripStore.__new__(DynamoTripStore)
    store._table = FakeTable()
    store.save_invite(Invite(token="tok", owner_id="o", trip_id="t", email="a@example.com"))
    assert ("INVITE#tok", "INVITE") in store._table.items
    assert store.get_invite("tok").owner_id == "o"
    store.link_editor("a@example.com", "o", "t")
    assert ("EDITOR#a@example.com", "TRIP#t") in store._table.items
    assert store.shared_trips("a@example.com") == [("o", "t")]
    store.unlink_editor("a@example.com", "t")
    store.delete_invite("tok")
    assert store._table.items == {}


def test_trip_saved_before_prices_and_needed_categories_still_loads():
    trip = Trip.model_validate(
        {"id": "t1", "name": "Old", "options": [{"id": "o", "title": "x", "category": "Stays", "date": "2027-03-03"}]}
    )
    assert trip.needed_categories == [] and trip.options[0].price is None


def test_priced_option_round_trips_through_json_dump():
    trip = Trip.model_validate(
        {"id": "t1", "name": "New", "options": [{"id": "o", "title": "x", "category": "Stays", "date": "2027-03-03", "price": "120.50", "currency": "USD"}]}
    )
    again = Trip.model_validate(trip.model_dump(mode="json"))
    assert again.options[0].price == Decimal("120.50") and again.options[0].currency == "USD"


def test_in_memory_share_link_round_trips():
    from app.trips.store import ShareLink

    store = InMemoryTripStore()
    store.save_share_link(ShareLink(token="tok", owner_id="o", trip_id="t"))
    assert store.get_share_link("tok").trip_id == "t"
    store.delete_share_link("tok")
    assert store.get_share_link("tok") is None


def test_dynamo_share_link_key_shape_and_trip_token_omitted_when_none():
    from app.trips.store import ShareLink

    store = _dynamo_store()
    store.save_share_link(ShareLink(token="tok", owner_id="o", trip_id="t"))
    assert ("SHARE#tok", "SHARE") in store._table.items
    assert store.get_share_link("tok").owner_id == "o"
    store.delete_share_link("tok")
    assert store._table.items == {}
    store.save_trip("o", Trip(id="t1", name="Lisbon"))
    assert "share_token" not in store._table.items[("USER#o", "TRIP#t1")]
    store.save_trip("o", Trip(id="t1", name="Lisbon", share_token="tok"))
    assert store._table.items[("USER#o", "TRIP#t1")]["share_token"] == "tok"


def test_trip_stored_before_share_links_loads_without_a_token():
    assert DynamoTripStore._to_trip({"pk": "USER#o", "sk": "TRIP#t1", "id": "t1", "name": "Old"}).share_token is None
