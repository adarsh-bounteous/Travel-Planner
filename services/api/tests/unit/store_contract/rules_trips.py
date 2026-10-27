from datetime import date

from app.trips.store import Trip


def _trip(store, **fields) -> Trip:
    return Trip(id=store.new_id(), name="Rome", **fields)


def rule_save_get_list_delete_round_trip(store):
    owner = store.new_id()
    trip = _trip(store)
    assert store.trips.list_trips(owner) == []
    store.trips.save_trip(owner, trip)
    assert store.trips.get_trip(owner, trip.id) == trip
    assert [t.id for t in store.trips.list_trips(owner)] == [trip.id]
    store.trips.delete_trip(owner, trip.id)
    assert store.trips.get_trip(owner, trip.id) is None
    assert store.trips.list_trips(owner) == []


def rule_trip_id_alone_resolves_nothing_for_another_owner(store):
    owner, other = store.new_id(), store.new_id()
    trip = _trip(store)
    store.trips.save_trip(owner, trip)
    assert store.trips.get_trip(other, trip.id) is None
    assert store.trips.list_trips(other) == []


def rule_budget_and_dates_round_trip(store):
    owner = store.new_id()
    trip = _trip(
        store, destination="Rome", start_date=date(2026, 6, 1), end_date=date(2026, 6, 3),
        budget=300.5, currency="GBP", traveller_count=2,
    )
    store.trips.save_trip(owner, trip)
    saved = store.trips.get_trip(owner, trip.id)
    assert saved.budget == 300.5
    assert (saved.start_date, saved.end_date) == (date(2026, 6, 1), date(2026, 6, 3))
    assert (saved.currency, saved.traveller_count) == ("GBP", 2)


def rule_saving_again_replaces_the_trip(store):
    owner = store.new_id()
    trip = _trip(store)
    store.trips.save_trip(owner, trip)
    store.trips.save_trip(owner, trip.model_copy(update={"name": "Paris"}))
    assert [t.name for t in store.trips.list_trips(owner)] == ["Paris"]


def rule_trips_survive_a_restart(store):
    owner = store.new_id()
    trip = _trip(store, budget=120)
    store.trips.save_trip(owner, trip)
    assert store.reopen().trips.get_trip(owner, trip.id) == trip
