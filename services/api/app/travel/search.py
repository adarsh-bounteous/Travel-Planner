import logging
import re
from datetime import date
from decimal import Decimal
from typing import Literal
from urllib.parse import parse_qs, urlsplit

from pydantic import BaseModel

from app.flights.options import FlightProvider
from app.stays.options import StayProvider
from app.transport.options import TransportProvider
from app.travel.local import BOOKING_PREFIX, CURRENCY, PLACES, Generated, Kind, generate, place_slug

logger = logging.getLogger(__name__)

_REF_NAME = re.compile(r"([a-z]+)-(.+)-(\d+)")


class ReturnBeforeDepartError(ValueError):
    pass


class TravelOption(BaseModel):
    id: str
    name: str
    detail: str
    price: Decimal
    currency: str
    unit: Literal["total", "per traveller"]
    url: str


class TravelSearchResult(BaseModel):
    kind: Kind
    source: Literal["local", "provider"]
    matched: bool
    options: list[TravelOption]


class BookingPreview(BaseModel):
    option: TravelOption
    kind: Kind
    place: str
    number: int
    start: date
    end: date


def route_origin(route: str) -> str:
    """The "from" of a route typed as "From - to"; a route with no dash is taken whole."""
    return re.split(r"\s+[-–—]\s+|\s*[–—]\s*", route.strip(), maxsplit=1)[0].strip()


def _option(g: Generated) -> TravelOption:
    return TravelOption(
        id=g.id, name=g.name, detail=g.detail, price=g.price, currency=CURRENCY, unit=g.unit, url=g.url
    )


def _from_providers(
    kind: Kind,
    destination: str,
    depart: date,
    return_date: date,
    origin: str,
    stays: list[StayProvider],
    flights: list[FlightProvider],
    transports: list[TransportProvider],
) -> list[TravelOption]:
    options: list[TravelOption] = []
    nights = max(1, (return_date - depart).days)
    for provider in {"stay": stays, "flight": flights, "transport": transports}[kind]:
        try:
            if kind == "stay":
                options += [
                    TravelOption(
                        id=f"{provider.name}-{x.property_name}",
                        name=x.property_name,
                        detail=f"{x.area} · {nights} night{'s' if nights > 1 else ''}",
                        price=x.price_per_night * nights,
                        currency=x.currency,
                        unit="total",
                        url=x.url,
                    )
                    for x in provider.fetch(destination, depart, return_date)
                ]
            elif kind == "flight":
                options += [
                    TravelOption(
                        id=f.id,
                        name=f.provider,
                        detail=f"{f.travel_minutes // 60} h {f.travel_minutes % 60} min · {'direct' if f.stops == 0 else f'{f.stops} stop'}",
                        price=f.fare,
                        currency=f.currency,
                        unit="per traveller",
                        url=f.url,
                    )
                    for f in provider.fetch(origin, destination, depart)
                ]
            else:
                options += [
                    TravelOption(
                        id=t.id,
                        name=t.title,
                        detail=t.detail,
                        price=t.price,
                        currency=t.currency,
                        unit="per traveller",
                        url=t.url,
                    )
                    for t in provider.fetch(origin, destination, depart)
                ]
        except Exception:
            logger.exception("%s provider %s failed", kind, provider.name)
    return options


def search_travel(
    kind: Kind,
    destination: str,
    depart: date,
    return_date: date,
    route: str,
    *,
    stays: list[StayProvider],
    flights: list[FlightProvider],
    transports: list[TransportProvider],
    local: bool,
) -> TravelSearchResult:
    """One search for any kind. Local mode generates from the query; otherwise the real providers answer."""
    if return_date < depart:
        raise ReturnBeforeDepartError()
    origin = route_origin(route) if kind != "stay" else ""
    if local:
        options = [_option(g) for g in generate(kind, destination, depart, return_date, origin)]
        return TravelSearchResult(kind=kind, source="local", matched=bool(options), options=options)
    options = _from_providers(kind, destination, depart, return_date, origin, stays, flights, transports)
    return TravelSearchResult(kind=kind, source="provider", matched=bool(options), options=options)


def booking_preview(ref: str) -> BookingPreview | None:
    """Rebuild the option a local booking link points at, from the link alone. None when it matches nothing."""
    if not ref.startswith(BOOKING_PREFIX):
        return None
    parts = urlsplit(ref)
    named = _REF_NAME.fullmatch(parts.path.removeprefix("/"))
    query = parse_qs(parts.query)
    try:
        start, end = date.fromisoformat(query["start"][0]), date.fromisoformat(query["end"][0])
    except (KeyError, ValueError):
        return None
    if named is None:
        return None
    kind, slug, number = named.group(1), named.group(2), int(named.group(3))
    place = next((p for p in PLACES if place_slug(p) == slug), None)
    if place is None or kind not in ("stay", "flight", "transport"):
        return None
    origin = query.get("origin", [""])[0]
    for g in generate(kind, place, start, end, origin):  # type: ignore[arg-type]
        if g.n == number:
            return BookingPreview(option=_option(g), kind=kind, place=place, number=number, start=start, end=end)  # type: ignore[arg-type]
    return None
