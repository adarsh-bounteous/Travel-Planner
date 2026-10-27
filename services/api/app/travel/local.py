import hashlib
import random
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from decimal import Decimal
from typing import Literal
from urllib.parse import urlencode

from app.flights.options import FlightOption
from app.stays.options import ProviderListing
from app.transport.options import TransportOption
from app.trips.profile_store import Mode

Kind = Literal["stay", "flight", "transport"]

BOOKING_PREFIX = "local://booking/"
CURRENCY = "EUR"
OPTIONS_PER_SEARCH = 3

PLACES = ["Lisbon", "Paris", "Tokyo", "Rome", "Barcelona", "Lima", "Cape Town", "Berlin", "Marrakech", "New York"]
_BY_KEY = {p.casefold(): p for p in PLACES}

_POOLS: dict[Kind, list[str]] = {
    "stay": [
        "Central Boutique Hotel",
        "Riverside Guesthouse",
        "Old Town Apartments",
        "Garden Suites",
        "Harbour View Inn",
        "Station Lodge",
    ],
    "flight": ["Atlantic Air", "Skyline Airways", "Meridian Air", "Nordic Wing", "Sunrise Jet", "Coastline Air"],
    "transport": ["Express train", "Intercity coach", "Shared transfer", "Private car", "Regional ferry", "Night bus"],
}
_TRANSPORT_MODE: dict[str, Mode] = {
    "Express train": "train",
    "Intercity coach": "bus",
    "Shared transfer": "taxi",
    "Private car": "taxi",
    "Regional ferry": "bus",
    "Night bus": "bus",
}


@dataclass(frozen=True)
class Generated:
    """One generated option, before it is shaped for a provider port or the search page."""

    id: str
    n: int
    name: str
    detail: str
    price: Decimal  # a stay's whole stay; a flight's or transport's per traveller
    unit: Literal["total", "per traveller"]
    url: str
    per_night: Decimal = Decimal(0)
    mode: Mode = "flight"
    minutes: int = 0
    stops: int = 0
    departs: time | None = None


def match_place(text: str) -> str | None:
    """The known place a text names: exact, ignoring case and outer spaces. Anything else is None."""
    return _BY_KEY.get(text.strip().casefold())


def place_slug(place: str) -> str:
    return re.sub(r"\s+", "-", place.strip().casefold())


def _rng(kind: str, place: str, start: date, end: date, origin: str) -> random.Random:
    # sha256, not hash(): the same search must give the same options in every process
    seed = "|".join([kind, place, start.isoformat(), end.isoformat(), origin.strip().casefold()])
    return random.Random(int.from_bytes(hashlib.sha256(seed.encode()).digest()[:8], "big"))


def booking_url(kind: Kind, place: str, n: int, start: date, end: date, origin: str) -> str:
    query = {"start": start.isoformat(), "end": end.isoformat()}
    if kind != "stay":
        query["origin"] = origin.strip()
    return f"{BOOKING_PREFIX}{kind}-{place_slug(place)}-{n}?{urlencode(query)}"


def generate(kind: Kind, destination: str, start: date, end: date, origin: str = "") -> list[Generated]:
    """A few options for one search. Same search, same options; any changed input, different options."""
    place = match_place(destination)
    if place is None:
        return []
    origin = origin.strip() if kind != "stay" else ""
    rnd = _rng(kind, place, start, end, origin)
    pool = list(_POOLS[kind])
    rnd.shuffle(pool)
    nights = max(1, (end - start).days)
    route = f"{origin} - {place}" if origin else place
    out: list[Generated] = []
    for n, label in enumerate(pool[:OPTIONS_PER_SEARCH], start=1):
        url = booking_url(kind, place, n, start, end, origin)
        ident = f"{kind}-{place_slug(place)}-{n}-{hashlib.sha256(url.encode()).hexdigest()[:8]}"
        if kind == "stay":
            per_night = 60 + rnd.randrange(140)
            rating = 7.5 + rnd.random() * 2
            out.append(
                Generated(
                    id=ident,
                    n=n,
                    name=f"{place} {label}",
                    detail=f"{nights} night{'s' if nights > 1 else ''} · rated {rating:.1f} of 10 · free cancellation",
                    price=Decimal(per_night * nights),
                    unit="total",
                    url=url,
                    per_night=Decimal(per_night),
                )
            )
            continue
        hour, minute = 5 + rnd.randrange(15), rnd.randrange(12) * 5
        if kind == "flight":
            hours, stops = 1 + rnd.randrange(8), 1 if rnd.random() > 0.6 else 0
            price, mode = 70 + rnd.randrange(260), "flight"
        else:
            hours, stops = 2 + rnd.randrange(9), 1 if rnd.random() <= 0.5 else 0
            price, mode = 20 + rnd.randrange(60), _TRANSPORT_MODE[label]
        arrive = (hour + hours) % 24
        stop_text = ("1 stop" if kind == "flight" else "1 change") if stops else "direct"
        out.append(
            Generated(
                id=ident,
                n=n,
                name=f"{label} · {route}",
                detail=f"{hour:02d}:{minute:02d} to {arrive:02d}:{minute:02d} · {hours} h · {stop_text}",
                price=Decimal(price),
                unit="per traveller",
                url=url,
                mode=mode,
                minutes=hours * 60,
                stops=stops,
                departs=time(hour, minute),
            )
        )
    return out


class LocalStayProvider:
    """Local mode's stand-in for the stay provider port."""

    name = "Local stays"

    def fetch(self, place: str, start: date, end: date) -> list[ProviderListing]:
        now = datetime.now(UTC)
        return [
            ProviderListing(
                property_name=g.name,
                property_type="hotel",
                rooms=1,
                stars=3 + g.n % 3,
                area=match_place(place) or place,
                amenities=["wifi", "breakfast"],
                price_per_night=g.per_night,
                currency=CURRENCY,
                fetched_at=now,
                url=g.url,
            )
            for g in generate("stay", place, start, end)
        ]


class LocalFlightProvider:
    """Local mode's stand-in for the flight provider port."""

    name = "Local flights"
    modes = ("flight",)

    def fetch(self, origin: str, destination: str, on: date) -> list[FlightOption]:
        now = datetime.now(UTC)
        return [
            FlightOption(
                id=g.id,
                provider=g.name.split(" · ")[0],
                source=self.name,
                fare=g.price,
                currency=CURRENCY,
                travel_minutes=g.minutes,
                stops=g.stops,
                departs=g.departs,
                cabin="economy",
                fetched_at=now,
                url=g.url,
            )
            for g in generate("flight", destination, on, on, origin)
        ]


class LocalTransportProvider:
    """Local mode's stand-in for the transport provider port."""

    name = "Local transport"

    def fetch(self, origin: str, destination: str, on: date) -> list[TransportOption]:
        return [
            TransportOption(
                id=g.id,
                mode=g.mode,
                title=g.name.split(" · ")[0],
                provider=self.name,
                detail=g.detail,
                stops=g.stops,
                departs=g.departs,
                price=g.price,
                currency=CURRENCY,
                why="Generated for local mode",
                url=g.url,
            )
            for g in generate("transport", destination, on, on, origin)
        ]
