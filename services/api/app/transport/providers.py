from datetime import date, time
from decimal import Decimal

from app.transport.options import TransportOption
from app.trips.profile_store import Cabin, Mode


class InMemoryTransportProvider:
    """A provider with fixed options, offered for any route and date."""

    def __init__(self, name: str, catalogue: list[TransportOption]) -> None:
        self.name = name
        self._catalogue = catalogue

    def fetch(self, origin: str, destination: str, on: date) -> list[TransportOption]:
        return list(self._catalogue)


def _option(
    slug: str,
    mode: Mode,
    title: str,
    provider: str,
    detail: str,
    stops: int,
    departs: time | None,
    cabin: Cabin | None,
    price: int,
    why: str,
    estimate: bool = False,
) -> TransportOption:
    return TransportOption(
        id=slug,
        mode=mode,
        title=title,
        provider=provider,
        detail=detail,
        stops=stops,
        departs=departs,
        cabin=cabin,
        price=Decimal(price),
        currency="USD",
        estimate=estimate,
        why=why,
        url=f"https://example.com/transport/{slug}",
    )


# Seeded default until a transport provider is chosen.
SEED_OPTIONS: list[TransportOption] = [
    _option("example-air-flight", "flight", "Flight - Example Air", "Example Air",
            "Nonstop, departs 08:05 (morning), 1 h 15 min", 0, time(8, 5), "economy", 112,
            "Nonstop, morning departure"),
    _option("iberia-rail-train", "train", "Train - 1 stop", "Iberia Rail",
            "Departs 09:10 (morning), 9 h 40 min", 1, time(9, 10), "economy", 64,
            "Lower fare than flying"),
    _option("other-air-flight", "flight", "Flight - Other Air", "Other Air",
            "2 stops, departs 19:40 (evening), 6 h 05 min", 2, time(19, 40), "economy", 89,
            "Lowest-priced flight"),
    _option("costa-coach-bus", "bus", "Bus - Costa Coach", "Costa Coach",
            "Direct, departs 07:30 (morning), 8 h 20 min", 0, time(7, 30), None, 31,
            "Lowest fare overall"),
    _option("ridenow-taxi", "taxi", "Taxi - RideNow", "RideNow",
            "Estimated fare, about 6 h 30 min", 0, None, None, 380,
            "Door to door", estimate=True),
]

SEED_CATALOGUES: dict[str, list[TransportOption]] = {
    "Example Air": [SEED_OPTIONS[0]],
    "Iberia Rail": [SEED_OPTIONS[1]],
    "Other Air": [SEED_OPTIONS[2]],
    "Costa Coach": [SEED_OPTIONS[3]],
    "RideNow": [SEED_OPTIONS[4]],
}
