from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel

from app.trips.rates import RateSource
from app.trips.store import Trip

CENT = Decimal("0.01")


class FxRate(BaseModel):
    currency: str  # the option's currency
    rate: float  # 1 <currency> = <rate> <trip currency>


class CostSummary(BaseModel):
    currency: str
    total: float  # chosen, priced, convertible options, rounded to 2 dp
    budget: float | None
    over_budget_by: float  # 0 unless total > budget (equal is not over)
    missing_categories: list[str]  # needed categories with no chosen option, in needed order
    unpriced_count: int
    unconvertible_count: int  # priced in a currency the rate source cannot convert
    rates: list[FxRate]  # one per foreign currency that was converted


def summarise_cost(trip: Trip, rates: RateSource) -> CostSummary:
    """The trip total in the trip currency against its budget. Money is summed in Decimal."""
    total = Decimal(0)
    unpriced = unconvertible = 0
    used: dict[str, Decimal] = {}
    for option in trip.options:
        if option.price is None:
            unpriced += 1
            continue
        currency = (option.currency or trip.currency).upper()
        rate = rates.rate(currency, trip.currency)
        if rate is None:
            unconvertible += 1
            continue
        if currency != trip.currency:
            used[currency] = rate
        total += option.price * rate
    for stay in trip.stays:
        if stay.chosen is None:
            continue
        currency = stay.chosen.currency.upper()
        rate = rates.rate(currency, trip.currency)
        if rate is None:
            unconvertible += 1
            continue
        if currency != trip.currency:
            used[currency] = rate
        total += stay.chosen.total * rate
    for pick in trip.transport:
        currency = pick.currency.upper()
        rate = rates.rate(currency, trip.currency)
        if rate is None:
            unconvertible += 1
            continue
        if currency != trip.currency:
            used[currency] = rate
        total += pick.fare * rate
    total = total.quantize(CENT, rounding=ROUND_HALF_UP)
    budget = None if trip.budget is None else Decimal(str(trip.budget))
    over = total - budget if budget is not None and total > budget else Decimal(0)
    chosen = {o.category.casefold() for o in trip.options}
    return CostSummary(
        currency=trip.currency,
        total=float(total),
        budget=trip.budget,
        over_budget_by=float(over),
        missing_categories=[c for c in trip.needed_categories if c.casefold() not in chosen],
        unpriced_count=unpriced,
        unconvertible_count=unconvertible,
        rates=[FxRate(currency=c, rate=float(r)) for c, r in used.items()],
    )


def fare_over_budget_by(trip: Trip, rates: RateSource, fare: Decimal, currency: str) -> Decimal:
    """How far the trip total goes over budget with `fare` added; 0 when it fits, there is no budget, or the currency cannot be converted."""
    rate = rates.rate(currency.upper(), trip.currency)
    if rate is None or trip.budget is None:
        return Decimal(0)
    total = Decimal(str(summarise_cost(trip, rates).total))
    with_fare = total + (fare * rate).quantize(CENT, rounding=ROUND_HALF_UP)
    budget = Decimal(str(trip.budget))
    return with_fare - budget if with_fare > budget else Decimal(0)
