import pytest

from app.trips.destination_conversion import convert_trip
from app.trips.store import Trip


def test_existing_trip_with_lisbon_gets_country_and_place():
    trip = Trip(id="t1", name="Spring", destination="Lisbon")
    done = convert_trip(trip)
    assert (done.country, done.place) == ("Portugal", "Lisbon")
    assert done.destination_unmatched is False and done.destination_converted is True
    assert done.updated_at == trip.updated_at


@pytest.mark.parametrize("typed", ["Atlantis", "Portugal", "Lisbn", "Sunny coast, somewhere"])
def test_unmatchable_destination_is_flagged(typed):
    done = convert_trip(Trip(id="t2", name="X", destination=typed))
    assert done.destination_unmatched is True
    assert done.country is None and done.place is None


def test_lisbon_portugal_matches():
    done = convert_trip(Trip(id="t3", name="X", destination="Lisbon, Portugal"))
    assert (done.country, done.place) == ("Portugal", "Lisbon")


def test_trip_with_country_and_place_is_unchanged():
    trip = Trip(id="t8", name="Kyoto", destination="Lisbon", country="Japan", place="Kyoto")
    done = convert_trip(trip)
    assert (done.country, done.place) == ("Japan", "Kyoto")
    assert done.destination_unmatched is False and done.destination_converted is True


def test_trip_without_a_destination_is_not_flagged():
    done = convert_trip(Trip(id="t5", name="X"))
    assert done.destination_unmatched is False and done.destination_converted is True


def test_conversion_runs_once_and_is_safe_to_repeat():
    once = convert_trip(Trip(id="t9", name="X", destination="Lisbon"))
    assert convert_trip(once) is once


def test_trip_stored_before_the_new_fields_still_loads():
    trip = Trip.model_validate({"id": "t10", "name": "Old", "destination": "Lisbon"})
    assert trip.destination_converted is False and trip.country is None
