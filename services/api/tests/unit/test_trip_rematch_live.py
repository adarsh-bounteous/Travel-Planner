import pytest

from app.trips.store import Trip
from tests.trip_body import trip_body
from tests.unit.test_trips_live_place import _agra_trip

OWNER = "a@example.com"


def _flagged(sign_in_as, destination: str) -> str:
    """A trip saved before the destination conversion, whose text matches no starter place."""
    store = sign_in_as.trips
    owner = next(iter(store._trips))[0]
    old = Trip(id="old1", name="Old", destination=destination, destination_converted=False)
    store.save_trip(owner, old)
    return old.id


def test_an_old_trip_takes_the_live_place_the_traveller_picked_before(sign_in_as):
    client = sign_in_as(OWNER)
    _agra_trip(client)
    old_id = _flagged(sign_in_as, "Agra, UP")
    t = client.get(f"/trips/{old_id}").json()
    assert (t["place"], t["place_source"], t["rematched_from"]) == ("Agra", "live", "Agra, UP")
    assert t["destination"] == "Agra, India" and t["destination_unmatched"] is False
    stored = next(v for (o, i), v in sign_in_as.trips._trips.items() if i == old_id)
    assert stored.place == "Agra"


def test_an_old_trip_that_matches_nothing_is_shown_as_today(sign_in_as):
    client = sign_in_as(OWNER)
    _agra_trip(client)
    old_id = _flagged(sign_in_as, "Hidden Valley Retreat")
    t = client.get(f"/trips/{old_id}").json()
    assert t["place"] is None and t["destination"] == "Hidden Valley Retreat"
    assert t["destination_unmatched"] is True and t["rematched_from"] is None


def test_two_different_picks_with_one_name_leave_the_trip_unchanged(sign_in_as):
    from app.places.destination_search import sign_place_ref
    from datetime import UTC, datetime
    from tests.unit.locations_fakes import _candidate

    client = sign_in_as(OWNER)
    now = datetime(2026, 1, 1, tzinfo=UTC)
    for region in ("Maharashtra", "Bihar"):
        c = _candidate("Aurangabad", "India", region, "IN", 19.8, 75.3)
        ref = sign_place_ref(c, b"test-session-secret", now)
        r = client.post("/trips", json=trip_body(destination="Aurangabad, India", place_ref=ref))
        assert r.status_code == 201
    old_id = _flagged(sign_in_as, "Aurangabad")
    t = client.get(f"/trips/{old_id}").json()
    assert t["place"] is None and t["destination_unmatched"] is True


def test_a_trip_saved_without_the_new_fields_still_loads():
    legacy = {"id": "t1", "name": "Old", "destination": "Lisbon"}
    trip = Trip(**legacy)
    assert (trip.place_source, trip.rematched_from) == (None, None)
