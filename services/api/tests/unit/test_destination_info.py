from app.travel.local import PLACES
from app.trips.destination_info import currency_for, typical_weather_for


def test_tokyo_and_japan_use_jpy():
    assert currency_for("Tokyo") == "JPY"
    assert currency_for("Kyoto, Japan") == "JPY"


def test_unknown_destination_has_no_guidance():
    assert currency_for("Atlantis") is None
    assert typical_weather_for("Atlantis", 3) is None
    assert currency_for(None) is None


def test_typical_weather_is_dated_and_per_month():
    march = typical_weather_for("Tokyo, Japan", 3)
    assert march.month == 3 and march.rain_mm > 0
    assert march.as_of.isoformat() == "2026-10-01"


def test_every_seeded_place_has_a_currency():
    assert all(currency_for(place) for place in PLACES)
