from datetime import date

from app.trips.forecast import forecast_dates

TODAY = date(2026, 10, 27)


def test_trip_within_the_window_keeps_its_dates():
    assert forecast_dates(date(2026, 11, 3), date(2026, 11, 9), TODAY) == (date(2026, 11, 3), date(2026, 11, 9))


def test_day_14_is_in_and_day_15_is_out():
    assert forecast_dates(date(2026, 11, 10), date(2026, 11, 12), TODAY) == (date(2026, 11, 10), date(2026, 11, 10))
    assert forecast_dates(date(2026, 11, 11), date(2026, 11, 12), TODAY) is None


def test_trip_under_way_is_clipped_to_today():
    assert forecast_dates(date(2026, 10, 25), date(2026, 10, 29), TODAY) == (TODAY, date(2026, 10, 29))


def test_ended_or_undated_trip_has_no_forecast():
    assert forecast_dates(date(2026, 10, 20), date(2026, 10, 26), TODAY) is None
    assert forecast_dates(None, None, TODAY) is None
