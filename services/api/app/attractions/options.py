import logging
import re
from datetime import datetime
from decimal import Decimal
from typing import Literal, Protocol

from pydantic import BaseModel

from app.trips.rates import RateSource
from app.trips.store import Trip

logger = logging.getLogger(__name__)

ActivityKind = Literal["ticket", "tour", "day_trip", "experience", "free_sight", "event"]
SourceKind = Literal["web_search", "partner"]

# Free sights and one-off events are out of scope for activity options.
BOOKABLE_KINDS = ("ticket", "tour", "day_trip", "experience")


class ProviderActivity(BaseModel):
    """One provider's offer for one activity, with prices as fetched (whole currency units)."""

    title: str
    kind: ActivityKind
    interests: list[str]
    provider: str
    adult_price: Decimal
    child_price: Decimal | None = None
    currency: str
    offer: str | None = None
    fetched_at: datetime
    url: str


class ActivityProvider(Protocol):
    """Where activities come from. Real web-search and partner-platform adapters implement this port."""

    name: str
    source: SourceKind

    def fetch(self, place: str) -> list[ProviderActivity]: ...


class PriceEntry(BaseModel):
    provider: str
    source: SourceKind
    adult_price: Decimal
    child_price: Decimal | None
    group_estimate: Decimal
    currency: str
    fetched_at: datetime
    url: str
    offer: str | None


class ActivityOption(BaseModel):
    id: str
    title: str
    kind: ActivityKind
    interests: list[str]
    provider: str  # provider of the cheapest price entry
    adult_price: Decimal
    child_price: Decimal | None
    group_estimate: Decimal
    group_estimate_indicative: bool = True
    currency: str
    offer: str | None
    prices: list[PriceEntry]  # one per source, cheapest first


class ActivityOptions(BaseModel):
    place: str
    travellers: int
    options: list[ActivityOption]


def _fold(text: str) -> str:
    return " ".join(text.casefold().split())


def _in_trip_currency(amount: Decimal, currency: str, trip: Trip, rates: RateSource) -> Decimal | None:
    rate = rates.rate(currency, trip.currency)
    return None if rate is None else amount * rate


def gather_activities(providers: list[ActivityProvider], trip: Trip, rates: RateSource) -> ActivityOptions:
    """Bookable activities at the trip destination that fit its interests and budget.

    The trip holds only a traveller count, so every traveller is priced as an adult.
    """
    travellers = trip.traveller_count or 1
    place = trip.destination or ""
    grouped: dict[str, list[tuple[ActivityProvider, ProviderActivity]]] = {}
    for provider in providers if place else []:
        try:
            fetched = provider.fetch(place)
        except Exception:
            logger.exception("activity provider %s failed", provider.name)
            continue
        for x in fetched:
            if x.kind in BOOKABLE_KINDS:
                grouped.setdefault(_fold(x.title), []).append((provider, x))

    wanted = {_fold(i) for i in trip.interests}
    options = []
    for key, group in grouped.items():
        # Filter per activity after merging, so one source's price cannot hide the others'.
        group.sort(key=lambda g: _in_trip_currency(g[1].adult_price, g[1].currency, trip, rates) or g[1].adult_price)
        first = group[0][1]
        if wanted and not wanted & {_fold(i) for i in first.interests}:
            continue
        if trip.budget is not None:
            estimate = _in_trip_currency(first.adult_price * travellers, first.currency, trip, rates)
            if estimate is None or estimate > Decimal(str(trip.budget)):
                continue
        prices = [
            PriceEntry(
                provider=x.provider,
                source=p.source,
                adult_price=x.adult_price,
                child_price=x.child_price,
                group_estimate=x.adult_price * travellers,
                currency=x.currency,
                fetched_at=x.fetched_at,
                url=x.url,
                offer=x.offer,
            )
            for p, x in group
        ]
        options.append(
            ActivityOption(
                id=re.sub(r"[^a-z0-9]+", "-", key).strip("-"),
                title=first.title.strip(),
                kind=first.kind,
                interests=first.interests,
                provider=first.provider,
                adult_price=first.adult_price,
                child_price=first.child_price,
                group_estimate=first.adult_price * travellers,
                currency=first.currency,
                offer=next((x.offer for _, x in group if x.offer), None),
                prices=prices,
            )
        )
    return ActivityOptions(place=place, travellers=travellers, options=options)
