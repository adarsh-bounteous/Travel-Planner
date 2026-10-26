import time as clock
from datetime import UTC, date, datetime
from decimal import Decimal

from app.flights.options import FLIGHT_SOURCE_TIMEOUT_SECONDS, FlightOption, gather_flights

DAY = date(2027, 11, 18)


def flight(source: str) -> FlightOption:
    return FlightOption(
        id=source,
        provider="Algarve Air",
        source=source,
        fare=Decimal(54),
        currency="EUR",
        travel_minutes=55,
        stops=0,
        fetched_at=datetime(2026, 10, 26, tzinfo=UTC),
        url="https://example.com/f",
    )


class Fake:
    def __init__(self, name, behaviour="ok"):
        self.name = name
        self.behaviour = behaviour

    def fetch(self, origin, destination, on):
        if self.behaviour == "boom":
            raise RuntimeError("down")
        if self.behaviour == "slow":
            clock.sleep(2)
        return [flight(self.name)]


def test_options_from_all_three_sources_are_listed():
    providers = [Fake("Flight search API"), Fake("Web search"), Fake("Partner API")]
    flights, sources = gather_flights(providers, "Lisbon", "Faro", DAY)
    assert {f.source for f in flights} == {"Flight search API", "Web search", "Partner API"}
    assert [s.status for s in sources] == ["ok", "ok", "ok"]


def test_a_failing_or_slow_source_does_not_hide_the_rest():
    providers = [Fake("Flight search API"), Fake("Web search", "boom"), Fake("Partner API", "slow")]
    started = clock.monotonic()
    flights, sources = gather_flights(providers, "Lisbon", "Faro", DAY, timeout=0.05)
    assert clock.monotonic() - started < 1
    assert [f.source for f in flights] == ["Flight search API"]
    assert {s.name: s.status for s in sources} == {
        "Flight search API": "ok",
        "Web search": "failed",
        "Partner API": "timed_out",
    }


def test_default_timeout_is_five_seconds():
    assert FLIGHT_SOURCE_TIMEOUT_SECONDS == 5.0
