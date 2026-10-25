import logging
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from app.trips.store import Stay

logger = logging.getLogger(__name__)

PropertyType = Literal["hotel", "homestay", "other"]
Amenity = Literal["wifi", "breakfast", "parking", "pool", "ac"]


class ProviderListing(BaseModel):
    """One provider's offer for one property, with the price as fetched (whole currency units)."""

    property_name: str
    property_type: PropertyType
    rooms: int
    stars: int = 0  # 0 = unrated, as homestays are
    area: str
    amenities: list[Amenity]
    nearby: bool = False  # a town around the place, only shown when the search is widened
    price_per_night: Decimal
    currency: str
    fetched_at: datetime
    url: str


class StayProvider(Protocol):
    """Where stay listings come from. A real Flight and Hotel Search adapter implements this port."""

    name: str

    def fetch(self, place: str, start: date, end: date) -> list[ProviderListing]: ...


class StayCriteria(BaseModel):
    property_type: PropertyType
    rooms: int = Field(ge=1, le=10)
    max_price: Decimal | None = Field(default=None, ge=0)
    location: str = ""
    amenities: list[Amenity] = []
    stars: list[int] = []
    widen: bool = False


class Offer(BaseModel):
    provider: str
    price_per_night: Decimal
    total: Decimal
    currency: str
    fetched_at: datetime
    url: str


class Property(BaseModel):
    id: str
    name: str
    property_type: PropertyType
    rooms: int
    stars: int
    area: str
    amenities: list[Amenity]
    nearby: bool
    offers: list[Offer]
    price_min: Decimal
    price_max: Decimal


class StayOptions(BaseModel):
    place: str
    start_date: date
    end_date: date
    nights: int
    properties: list[Property]
    price_min: Decimal | None
    price_max: Decimal | None


def _fold(text: str) -> str:
    return " ".join(text.casefold().split())


def match_listings(listings: list[ProviderListing], c: StayCriteria) -> list[ProviderListing]:
    """What always applies: property type and rooms, and nearby towns only once widened."""
    return [
        x
        for x in listings
        if x.property_type == c.property_type and x.rooms == c.rooms and (c.widen or not x.nearby)
    ]


def merge_properties(listings: list[tuple[str, ProviderListing]], nights: int = 1) -> list[Property]:
    """One property per (name, area), with each provider's offer sorted by price."""
    grouped: dict[tuple[str, str], list[tuple[str, ProviderListing]]] = {}
    for provider, x in listings:
        grouped.setdefault((_fold(x.property_name), _fold(x.area)), []).append((provider, x))
    merged = []
    for (name_key, area_key), group in grouped.items():
        group.sort(key=lambda g: g[1].price_per_night)
        first = group[0][1]
        offers = [
            Offer(
                provider=provider,
                price_per_night=x.price_per_night,
                total=x.price_per_night * nights,
                currency=x.currency,
                fetched_at=x.fetched_at,
                url=x.url,
            )
            for provider, x in group
        ]
        merged.append(
            Property(
                id=re.sub(r"[^a-z0-9]+", "-", f"{name_key}-{area_key}").strip("-"),
                name=first.property_name.strip(),
                property_type=first.property_type,
                rooms=first.rooms,
                stars=first.stars,
                area=first.area,
                amenities=first.amenities,
                nearby=first.nearby,
                offers=offers,
                price_min=offers[0].price_per_night,
                price_max=offers[-1].price_per_night,
            )
        )
    return merged


def _keeps(p: Property, c: StayCriteria) -> bool:
    """The budget and optional filters; an empty one never narrows. Amenities are all-of, stars any-of."""
    return (
        (c.max_price is None or p.price_min <= c.max_price)
        and (not c.location.strip() or _fold(c.location) in _fold(f"{p.area} {p.name}"))
        and all(a in p.amenities for a in c.amenities)
        and (not c.stars or p.stars in c.stars)
    )


def search_stays(providers: list[StayProvider], stay: Stay, c: StayCriteria) -> StayOptions:
    nights = (stay.end_date - stay.start_date).days
    gathered: list[tuple[str, ProviderListing]] = []
    for provider in providers:
        try:
            listings = provider.fetch(stay.place, stay.start_date, stay.end_date)
        except Exception:
            logger.exception("stay provider %s failed", provider.name)
            continue
        gathered.extend((provider.name, x) for x in match_listings(listings, c))
    # Filter per property after merging, so one provider's price cannot hide the others' offers.
    properties = [p for p in merge_properties(gathered, nights) if _keeps(p, c)]
    return StayOptions(
        place=stay.place,
        start_date=stay.start_date,
        end_date=stay.end_date,
        nights=nights,
        properties=properties,
        price_min=min((p.price_min for p in properties), default=None),
        price_max=max((p.price_max for p in properties), default=None),
    )
