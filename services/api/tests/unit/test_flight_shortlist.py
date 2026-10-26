from datetime import UTC, datetime, time
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.flights.options import FlightOption
from app.flights.shortlist import preference_fit, rank_flights
from app.trips.profile_store import TransportPreferences

NO_PREFS = TransportPreferences()


def _f(id, fare=60, minutes=60, stops=0, departs=None, provider=None, mode="flight") -> FlightOption:
    return FlightOption(
        id=id,
        provider=provider or id,
        mode=mode,
        source="Flight search API",
        fare=Decimal(fare),
        currency="EUR",
        travel_minutes=minutes,
        stops=stops,
        departs=departs,
        fetched_at=datetime(2026, 10, 26, tzinfo=UTC),
        url="https://example.com/f",
    )


def _fits(_f):
    return Decimal(0)


def ids(ranked):
    return [s.flight.id for s in ranked]


def test_lower_fare_ranks_higher():
    assert ids(rank_flights([_f("dear", fare=70), _f("cheap", fare=60)], NO_PREFS, _fits)) == ["cheap", "dear"]


def test_shorter_travel_time_ranks_higher():
    assert ids(rank_flights([_f("slow", minutes=140), _f("quick", minutes=50)], NO_PREFS, _fits)) == ["quick", "slow"]


def test_fewer_stops_rank_higher():
    assert ids(rank_flights([_f("one", stops=1), _f("none", stops=0)], NO_PREFS, _fits)) == ["none", "one"]


def test_preference_fit_ranks_higher():
    prefs = TransportPreferences(departure_window="morning")
    ranked = rank_flights([_f("evening", departs=time(19, 0)), _f("morning", departs=time(8, 0))], prefs, _fits)
    assert ids(ranked) == ["morning", "evening"]
    assert preference_fit(_f("x"), NO_PREFS) == 100
    assert [s.fit for s in ranked] == [100, 0]


def test_reasons():
    ranked = rank_flights(
        [_f("cheap", fare=50, minutes=120, stops=1), _f("quick", fare=80, minutes=40, stops=1), _f("mid", fare=70, minutes=90, stops=1)],
        NO_PREFS,
        _fits,
    )
    by_id = {s.flight.id: s for s in ranked}
    assert by_id["cheap"].reason == "Cheapest"
    assert by_id["quick"].reason == "Fastest"
    assert by_id["mid"].reason == "Balanced fare and travel time"
    assert [s.rank for s in ranked] == [1, 2, 3]


def test_fewest_stops_reason():
    ranked = rank_flights([_f("cheap", fare=50, minutes=40), _f("direct", fare=90, minutes=90), _f("hop", fare=95, minutes=100, stops=1)], NO_PREFS, _fits)
    assert {s.flight.id: s.reason for s in ranked}["direct"] == "Fewest stops"


def test_fitting_budget_flights_come_first_and_none_are_dropped():
    over = lambda f: Decimal(5) if f.id == "cheap" else Decimal(0)  # noqa: E731
    ranked = rank_flights([_f("cheap", fare=40), _f("a", fare=60), _f("b", fare=70)], NO_PREFS, over)
    assert ids(ranked) == ["a", "b", "cheap"]
    flags = [s.fits_budget for s in ranked]
    assert flags == sorted(flags, reverse=True)
    assert ranked[-1].over_budget_by == 5 and ranked[0].over_budget_by == 0
    assert ranked[-1].reason == "Cheapest"


def test_cheapest_mode_wins_on_equal_time_and_stops():
    ranked = rank_flights(
        [_f("flight", fare=90, mode="flight"), _f("train", fare=80, mode="train"), _f("bus", fare=30, mode="bus")],
        NO_PREFS,
        _fits,
    )
    assert ids(ranked)[0] == "bus"


def test_fastest_mode_wins_on_equal_fare_and_stops():
    ranked = rank_flights(
        [_f("flight", minutes=120, mode="flight"), _f("train", minutes=60, mode="train"),
         _f("bus", minutes=120, mode="bus")],
        NO_PREFS,
        _fits,
    )
    assert ids(ranked)[0] == "train"


def test_preference_fit_follows_the_entry_mode():
    assert preference_fit(_f("t", mode="train"), TransportPreferences(modes=["train"])) == 100
    assert preference_fit(_f("f"), TransportPreferences(modes=["train"])) == 0


def test_a_combined_mode_is_invalid():
    with pytest.raises(ValidationError):
        _f("x", mode="train+bus")
