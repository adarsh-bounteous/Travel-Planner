from datetime import date

from app.trips.store import StayFields, stay_outside_trip

STAY = StayFields(place="x", start_date=date(2027, 1, 4), end_date=date(2027, 1, 10))


def test_extending_beyond_is_outside():
    assert stay_outside_trip(STAY, date(2027, 1, 1), date(2027, 1, 6)) is True


def test_entirely_outside_is_outside():
    assert stay_outside_trip(STAY, date(2027, 2, 1), date(2027, 2, 6)) is True


def test_inside_is_not_outside():
    assert stay_outside_trip(STAY, date(2027, 1, 4), date(2027, 1, 10)) is False


def test_trip_without_both_dates_flags_nothing():
    assert stay_outside_trip(STAY, None, None) is False
    assert stay_outside_trip(STAY, date(2027, 1, 8), None) is False
