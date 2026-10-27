from decimal import Decimal

from pydantic import BaseModel

from app.dining.options import DiningFilters, RestaurantOption, RestaurantOptions, _fold
from app.trips.store import Trip

DINING_SHARE = Decimal("0.25")  # share of the trip budget set aside for restaurant meals; one meal per person per day


class ShortlistEntry(BaseModel):
    rank: int
    restaurant: RestaurantOption
    fits_budget: bool
    preferences_met: list[str]  # labels, e.g. "Portuguese cuisine"
    preferences_total: int


class RestaurantShortlist(BaseModel):
    place: str
    budget_per_person: Decimal | None  # None when the trip has no usable budget
    currency: str | None  # the trip currency the budget is in
    entries: list[ShortlistEntry]


def budget_per_person(trip: Trip) -> Decimal | None:
    """The dining budget for one person's meal: a share of the trip budget over travellers and days."""
    if not trip.budget or not trip.start_date or not trip.end_date:
        return None
    days = (trip.end_date - trip.start_date).days + 1
    if days < 1:
        return None
    return Decimal(str(trip.budget)) * DINING_SHARE / (trip.traveller_count or 1) / days


def preference_labels(filters: DiningFilters, tastes: list[str]) -> list[str]:
    """The traveller's soft preferences: the home cuisine and each profile taste."""
    labels = [f"{filters.home_cuisine} cuisine"] if filters.home_cuisine else []
    return labels + [t for t in tastes if t.strip()]


def _meets(label: str, filters: DiningFilters, r: RestaurantOption) -> bool:
    if filters.home_cuisine and label == f"{filters.home_cuisine} cuisine":
        return _fold(r.cuisine) == _fold(filters.home_cuisine)
    return _fold(label) in (_fold(r.cuisine), _fold(r.dining_style))


def _fits(r: RestaurantOption, trip: Trip, budget: Decimal | None) -> bool:
    # Without exchange rates, a restaurant priced in another currency cannot be compared, so it is not marked over.
    # The same goes for one with no known price.
    return budget is None or r.currency != trip.currency or r.typical_price is None or r.typical_price <= budget


def build_shortlist(
    options: RestaurantOptions, trip: Trip, filters: DiningFilters, tastes: list[str]
) -> RestaurantShortlist:
    """Every matching restaurant, budget-fitting first, then more preferences met, then cheaper."""
    budget = budget_per_person(trip)
    labels = preference_labels(filters, tastes)
    scored = []
    for r in options.options:
        met = [label for label in labels if _meets(label, filters, r)]
        scored.append((r, _fits(r, trip, budget), met))
    scored.sort(key=lambda s: (not s[1], -len(s[2]), s[0].typical_price is None, s[0].typical_price or Decimal(0), s[0].name))
    return RestaurantShortlist(
        place=options.place,
        budget_per_person=budget,
        currency=trip.currency if budget is not None else None,
        entries=[
            ShortlistEntry(
                rank=i + 1, restaurant=r, fits_budget=fits, preferences_met=met, preferences_total=len(labels)
            )
            for i, (r, fits, met) in enumerate(scored)
        ],
    )
