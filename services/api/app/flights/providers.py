from collections.abc import Callable
from datetime import date, datetime, time
from decimal import Decimal

from app.flights.options import FlightOption
from app.trips.profile_store import Cabin, Mode


class InMemoryFlightProvider:
    """A source with fixed flights per route; the clock stamps each flight as it is fetched."""

    def __init__(
        self,
        name: str,
        catalogue: dict[tuple[str, str], list[FlightOption]],
        clock: Callable[[], datetime],
        modes: tuple[Mode, ...] = ("flight",),
    ) -> None:
        self.name = name
        self.modes = modes
        self._catalogue = {(o.strip().casefold(), d.strip().casefold()): v for (o, d), v in catalogue.items()}
        self._clock = clock

    def fetch(self, origin: str, destination: str, on: date) -> list[FlightOption]:
        fetched_at = self._clock()
        key = (origin.strip().casefold(), destination.strip().casefold())
        return [f.model_copy(update={"fetched_at": fetched_at}) for f in self._catalogue.get(key, [])]


_EPOCH = datetime(2000, 1, 1)  # replaced by the clock at fetch time
_URL_PATH: dict[Mode, str] = {"flight": "flights", "train": "trains", "bus": "buses", "taxi": "rides"}


def _flight(
    source: str,
    slug: str,
    provider: str,
    fare: int,
    minutes: int,
    stops: int,
    departs: time | None,
    cabin: Cabin | None = "economy",
    deal: str | None = None,
    mode: Mode = "flight",
    estimate: bool = False,
) -> FlightOption:
    return FlightOption(
        id=slug,
        mode=mode,
        estimate=estimate,
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
        url=f"https://example.com/{_URL_PATH[mode]}/{slug}",
    )


def _ground(source: str, slug: str, provider: str, fare: int, minutes: int, stops: int, mode: Mode,
            departs: time, deal: str | None = None) -> FlightOption:
    return _flight(source, slug, provider, fare, minutes, stops, departs, cabin=None, deal=deal, mode=mode)


def _taxi(slug: str, provider: str, fare: int, minutes: int) -> FlightOption:
    """A taxi has no timetable or cabin; its fare is an estimate."""
    return _flight(RIDES, slug, provider, fare, minutes, 0, None, cabin=None, mode="taxi", estimate=True)


SEARCH, WEB, PARTNER = "Flight search API", "Web search", "Partner API"
LISBON_FARO = ("Lisbon", "Faro")
FARO_PORTO = ("Faro", "Porto")
FARO_AIRPORT_FARO = ("Faro Airport", "Faro")  # a local taxi inside the destination
RAIL, COACH, RIDES = "Rail search", "Coach search", "Ride provider"

# Which modes each seeded source covers; a source not listed here covers flights only.
SEED_MODES: dict[str, tuple[Mode, ...]] = {RAIL: ("train",), COACH: ("bus",), RIDES: ("taxi",)}

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
    RAIL: {
        LISBON_FARO: [
            _ground(RAIL, "alfa-rail-lis-far", "Alfa Rail", 24, 195, 0, "train", time(7, 30),
                    deal="Save 15% with a railcard"),
            _ground(RAIL, "regional-rail-lis-far", "Regional Rail", 19, 270, 2, "train", time(10, 0)),
        ],
        FARO_PORTO: [_ground(RAIL, "alfa-rail-far-opo", "Alfa Rail", 48, 330, 1, "train", time(8, 15))],
    },
    COACH: {
        LISBON_FARO: [_ground(COACH, "sul-coach-lis-far", "Sul Coach", 15, 240, 0, "bus", time(9, 0))],
        FARO_PORTO: [_ground(COACH, "sul-coach-far-opo", "Sul Coach", 29, 420, 1, "bus", time(21, 0))],
    },
    RIDES: {
        LISBON_FARO: [_taxi("ridenow-lis-far", "RideNow", 210, 170)],
        FARO_AIRPORT_FARO: [_taxi("ridenow-fao-far", "RideNow", 22, 20)],
    },
}
