from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from pydantic import BaseModel

from app.trips.cost import CENT
from app.trips.rates import RateSource
from app.trips.store import Trip, stay_outside_trip

# Never listed as "not included": the traveller is asked for these elsewhere.
ESSENTIAL_CATEGORIES = frozenset({"stay", "transport", "sim", "insurance", "visa", "flight"})

STANDARD_EXCLUSIONS = [
    "Flights to and from the destination",
    "Travel insurance",
    "Personal expenses",
    "Tips and gratuities",
    "Visas and entry fees",
]

ESTIMATES_NOTE = "Prices are estimates and may change before you pay."
STATUS_CHOSEN = "Chosen"


def _http_link(url: str | None) -> str | None:
    return url if url and url.startswith(("http://", "https://")) else None


class Booking(BaseModel):
    name: str
    kind: Literal["stay", "transport", "option", "restaurant"]
    provider: str | None
    start_date: date | None
    end_date: date | None
    price: Decimal | None
    currency: str | None  # None when there is no price
    status: str
    link_url: str | None
    outside_trip_dates: bool  # only ever true for a stay
    add_url: str  # where to add or change the item


class PricedLine(BaseModel):
    name: str
    amount: Decimal
    currency: str


class NotIncludedLine(BaseModel):
    name: str
    reason: Literal["unchosen", "unpriced"]
    add_url: str


class Subtotal(BaseModel):
    currency: str
    amount: Decimal


class Conversion(BaseModel):
    currency: str
    rate: Decimal  # 1 <currency> = <rate> <trip currency>
    rate_date: date


class CostBreakdown(BaseModel):
    currency: str  # the trip currency
    subtotals: list[Subtotal]  # per currency, in first-seen order
    total: Decimal  # in the trip currency, rounded to 2 dp
    conversions: list[Conversion]
    unconvertible_count: int  # priced in a currency the rate source cannot convert
    estimates_note: str


class Money(BaseModel):
    bookings: list[Booking]
    included: list[PricedLine]
    not_included: list[NotIncludedLine]
    standard_exclusions: list[str]
    cost: CostBreakdown


def _bookings(trip: Trip) -> list[Booking]:
    own = trip.currency
    activity_url = f"/trips/{trip.id}/activity-options"
    rows: list[Booking] = []
    for stay in trip.stays:
        if stay.chosen is None:
            continue
        c = stay.chosen
        rows.append(
            Booking(
                name=c.name, kind="stay", provider=c.provider, start_date=stay.start_date, end_date=stay.end_date,
                price=c.total, currency=c.currency.upper(), status=STATUS_CHOSEN, link_url=_http_link(c.url),
                outside_trip_dates=stay_outside_trip(stay, trip.start_date, trip.end_date),
                add_url=f"/trips/{trip.id}/stays/{stay.id}/options",
            )
        )
    for pick in trip.transport:
        rows.append(
            Booking(
                name=f"{pick.origin} to {pick.destination}", kind="transport", provider=pick.provider,
                start_date=pick.date, end_date=pick.date, price=pick.fare, currency=pick.currency.upper(),
                status=STATUS_CHOSEN, link_url=_http_link(pick.url), outside_trip_dates=False,
                add_url=f"/trips/{trip.id}/flights",
            )
        )
    for option in trip.options:
        rows.append(
            Booking(
                name=option.title, kind="option", provider=None, start_date=option.date, end_date=option.date,
                price=option.price, currency=None if option.price is None else (option.currency or own).upper(),
                status=STATUS_CHOSEN, link_url=_http_link(str(option.booking_url) if option.booking_url else None),
                outside_trip_dates=False, add_url=activity_url,
            )
        )
    for meal in trip.restaurants:
        rows.append(
            Booking(
                name=meal.name, kind="restaurant", provider=None, start_date=meal.date, end_date=meal.date,
                price=None if meal.typical_price is None else meal.typical_price * (trip.traveller_count or 1),
                currency=None if meal.typical_price is None else meal.currency.upper(),
                status=STATUS_CHOSEN, link_url=_http_link(meal.url), outside_trip_dates=False,
                add_url=f"/trips/{trip.id}/restaurant-options",
            )
        )
    return rows


def _unchosen(trip: Trip) -> list[NotIncludedLine]:
    """Saved places and needed categories with nothing chosen, apart from the essentials."""
    url = f"/trips/{trip.id}/activity-options"
    chosen = {o.category.casefold() for o in trip.options}
    names = [p.name for p in trip.places]
    names += [c for c in trip.needed_categories if c.casefold() not in chosen]
    return [
        NotIncludedLine(name=n, reason="unchosen", add_url=url)
        for n in names
        if n.casefold() not in ESSENTIAL_CATEGORIES
    ]


def _cost(trip: Trip, priced: list[Booking], rates: RateSource, today: date) -> CostBreakdown:
    sums: dict[str, Decimal] = {}
    total = Decimal(0)
    used: dict[str, Decimal] = {}
    unconvertible = 0
    for b in priced:
        assert b.price is not None and b.currency is not None
        sums[b.currency] = sums.get(b.currency, Decimal(0)) + b.price
        rate = rates.rate(b.currency, trip.currency)
        if rate is None:
            unconvertible += 1
            continue
        if b.currency != trip.currency:
            used[b.currency] = rate
        total += b.price * rate
    return CostBreakdown(
        currency=trip.currency,
        subtotals=[Subtotal(currency=c, amount=a) for c, a in sums.items()],
        total=total.quantize(CENT, rounding=ROUND_HALF_UP),
        conversions=[Conversion(currency=c, rate=r, rate_date=today) for c, r in used.items()],
        unconvertible_count=unconvertible,
        estimates_note=ESTIMATES_NOTE,
    )


def build_money(trip: Trip, rates: RateSource, today: date) -> Money:
    """What the plan books, includes and leaves out, and what it costs. SIM and insurance are essentials, left out here."""
    bookings = _bookings(trip)
    priced = [b for b in bookings if b.price is not None]
    return Money(
        bookings=bookings,
        included=[PricedLine(name=b.name, amount=b.price, currency=b.currency) for b in priced],
        not_included=_unchosen(trip)
        + [NotIncludedLine(name=b.name, reason="unpriced", add_url=b.add_url) for b in bookings if b.price is None],
        standard_exclusions=list(STANDARD_EXCLUSIONS),
        cost=_cost(trip, priced, rates, today),
    )
