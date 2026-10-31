from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.trips.cost import summarise_cost
from app.trips.rates import RateSource
from app.trips.store import Trip, stay_outside_trip

# Never listed as "not included": the traveller is asked for these on their own screens.
ESSENTIAL_CATEGORIES = frozenset({"sim", "insurance", "visa"})

STANDARD_EXCLUSIONS = [
    "Flights to and from the destination",
    "Travel insurance",
    "Personal expenses",
    "Tips and gratuities",
    "Visas and entry fees",
]

ESTIMATES_NOTE = "Prices are estimates and may change before you pay."


def _http_link(url: str | None) -> str | None:
    return url if url and url.startswith(("http://", "https://")) else None


class BookingRow(BaseModel):
    id: str
    kind: Literal["stay", "transport", "option", "sim", "insurance", "restaurant"]
    name: str
    provider: str | None
    start_date: date | None
    end_date: date | None
    price: float | None  # whole currency units; None = unpriced
    currency: str | None  # the item's own currency; the trip currency when the pick has none
    status: Literal["confirmed"]  # nothing stores a booking status yet: every chosen item is confirmed
    link_url: str | None
    outside_trip: bool  # stays only


class NotIncludedItem(BaseModel):
    name: str
    reason: Literal["unchosen", "unpriced"]
    add_path: str | None  # app route where the item can be added


class CurrencyTotal(BaseModel):
    currency: str
    total: float


class Conversion(BaseModel):
    currency: str
    rate: float  # 1 <currency> = <rate> <trip currency>
    rate_date: date


class CostBlock(BaseModel):
    currency: str  # the trip currency
    total: float  # the Costs page total
    by_currency: list[CurrencyTotal]
    conversions: list[Conversion]  # empty when nothing foreign was converted
    estimates_note: str


class Money(BaseModel):
    bookings: list[BookingRow]
    included: list[BookingRow]  # chosen and priced
    not_included: list[NotIncludedItem]
    standard_exclusions: list[str]
    cost: CostBlock


def _lines(trip: Trip) -> list[tuple[BookingRow, Decimal | None]]:
    """Every chosen item as a row with its amount, so Included, the totals and the table cannot drift."""
    travellers = trip.traveller_count or 1
    own = trip.currency

    def row(id, kind, name, provider, start, end, amount, currency, url, outside=False):
        return (
            BookingRow(
                id=id, kind=kind, name=name, provider=provider, start_date=start, end_date=end,
                price=None if amount is None else float(amount),
                currency=None if amount is None else (currency or own).upper(),
                status="confirmed", link_url=_http_link(url), outside_trip=outside,
            ),
            amount,
        )

    lines = []
    for stay in trip.stays:
        c = stay.chosen
        if c is not None:
            outside = stay_outside_trip(stay, trip.start_date, trip.end_date)
            lines.append(row(stay.id, "stay", c.name, c.provider, stay.start_date, stay.end_date, c.total, c.currency, c.url, outside))
    for p in trip.transport:
        lines.append(row(f"{p.leg}-{p.option_id}", "transport", f"{p.origin} to {p.destination}", p.provider, p.date, p.date, p.fare, p.currency, p.url))
    for o in trip.options:
        lines.append(row(o.id, "option", o.title, None, o.date, o.date, o.price, o.currency, str(o.booking_url) if o.booking_url else None))
    if trip.sim is not None:
        s = trip.sim
        lines.append(row("sim", "sim", s.name, s.provider, s.valid_from, s.valid_to, s.price * travellers, s.currency, str(s.url)))
    if trip.insurance is not None:
        i = trip.insurance
        lines.append(row("insurance", "insurance", i.name, i.provider, None, None, i.total, i.currency, str(i.url)))
    for r in trip.restaurants:
        amount = None if r.typical_price is None else r.typical_price * travellers
        lines.append(row(r.id, "restaurant", r.name, None, r.date, r.date, amount, r.currency, r.url))
    return lines


def _unchosen(trip: Trip) -> list[NotIncludedItem]:
    """Stays with no pick and needed categories with no pick, apart from the essentials."""
    items = [
        NotIncludedItem(name=s.place, reason="unchosen", add_path=f"/trips/{trip.id}/stays/{s.id}/shortlist")
        for s in trip.stays
        if s.chosen is None
    ]
    picked = {o.category.casefold() for o in trip.options}
    items += [
        NotIncludedItem(name=c, reason="unchosen", add_path=f"/trips/{trip.id}/shortlists")
        for c in trip.needed_categories
        if c.casefold() not in picked and c.casefold() not in ESSENTIAL_CATEGORIES
    ]
    return items


def build_money(trip: Trip, rates: RateSource, today: date) -> Money:
    """What the plan books, includes and leaves out, and what it costs. The total and rates come from the Costs page."""
    lines = _lines(trip)
    bookings = [r for r, _ in lines]
    sums: dict[str, Decimal] = {}
    for r, amount in lines:
        if amount is not None and r.currency is not None:
            sums[r.currency] = sums.get(r.currency, Decimal(0)) + amount
    summary = summarise_cost(trip, rates)
    return Money(
        bookings=bookings,
        included=[r for r in bookings if r.price is not None],
        not_included=_unchosen(trip)
        + [NotIncludedItem(name=r.name, reason="unpriced", add_path=None) for r in bookings if r.price is None],
        standard_exclusions=list(STANDARD_EXCLUSIONS),
        cost=CostBlock(
            currency=trip.currency,
            total=summary.total,
            by_currency=[CurrencyTotal(currency=c, total=float(t)) for c, t in sums.items()],
            conversions=[Conversion(currency=f.currency, rate=f.rate, rate_date=today) for f in summary.rates],
            estimates_note=ESTIMATES_NOTE,
        ),
    )
