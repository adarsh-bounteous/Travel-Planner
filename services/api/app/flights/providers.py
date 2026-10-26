from collections.abc import Callable
from datetime import date, datetime, time
from decimal import Decimal

from app.flights.options import FlightOption
from app.trips.profile_store import Cabin


class InMemoryFlightProvider:
    """A source with fixed flights per route; the clock stamps each flight as it is fetched."""

    def __init__(
        self, name: str, catalogue: dict[tuple[str, str], list[FlightOption]], clock: Callable[[], datetime]
    ) -> None:
        self.name = name
        self._catalogue = {(o.strip().casefold(), d.strip().casefold()): v for (o, d), v in catalogue.items()}
        self._clock = clock

    def fetch(self, origin: str, destination: str, on: date) -> list[FlightOption]:
        fetched_at = self._clock()
        key = (origin.strip().casefold(), destination.strip().casefold())
        return [f.model_copy(update={"fetched_at": fetched_at}) for f in self._catalogue.get(key, [])]


_EPOCH = datetime(2000, 1, 1)  # replaced by the clock at fetch time


def _flight(
    source: str,
    slug: str,
    provider: str,
    fare: int,
    minutes: int,
    stops: int,
    departs: time,
    cabin: Cabin = "economy",
    deal: str | None = None,
) -> FlightOption:
    return FlightOption(
        id=slug,
        provider=provider,
        source=source,
        fare=Decimal(fare),
        currency="EUR",
        travel_minutes=minutes,
        stops=stops,
        departs=departs,
        cabin=cabin,
        deal=deal,
        fetched_at=_EPOCH,
        url=f"https://example.com/flights/{slug}",
    )


SEARCH, WEB, PARTNER = "Flight search API", "Web search", "Partner API"
LISBON_FARO = ("Lisbon", "Faro")
FARO_PORTO = ("Faro", "Porto")

# Seeded default until a flight source is chosen.
SEED_CATALOGUES: dict[str, dict[tuple[str, str], list[FlightOption]]] = {
    SEARCH: {
        LISBON_FARO: [
            _flight(SEARCH, "algarve-air-lis-far", "Algarve Air", 54, 55, 0, time(8, 10),
                    deal="EUR 12.00 off online fares until 31 Oct"),
        ],
        FARO_PORTO: [_flight(SEARCH, "algarve-air-far-opo", "Algarve Air", 72, 65, 0, time(9, 30))],
    },
    WEB: {
        LISBON_FARO: [
            _flight(WEB, "atlantic-connect-lis-far", "Atlantic Connect", 68, 140, 1, time(13, 20)),
            _flight(WEB, "costa-premium-lis-far", "Costa Premium", 96, 50, 0, time(18, 5), cabin="premium_economy"),
        ],
        FARO_PORTO: [_flight(WEB, "atlantic-connect-far-opo", "Atlantic Connect", 64, 150, 1, time(15, 45))],
    },
    PARTNER: {
        LISBON_FARO: [_flight(PARTNER, "lusitania-jet-lis-far", "Lusitania Jet", 59, 50, 0, time(11, 40))],
        FARO_PORTO: [_flight(PARTNER, "lusitania-jet-far-opo", "Lusitania Jet", 79, 60, 0, time(19, 15))],
    },
}
