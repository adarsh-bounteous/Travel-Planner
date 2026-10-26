import logging
from datetime import date
from decimal import Decimal
from typing import Literal, get_args

from pydantic import BaseModel

from app.stays.options import (
    Amenity,
    Property,
    ProviderListing,
    StayCriteria,
    StayProvider,
    _fold,
    match_listings,
    merge_properties,
)
from app.trips.store import Stay

logger = logging.getLogger(__name__)

SHORTLIST_SIZE = 5
WEIGHTS = {"price": Decimal("0.4"), "fit": Decimal("0.4"), "offers": Decimal("0.2")}
_AMENITY_COUNT = len(get_args(Amenity))

Reason = Literal["Best overall", "Best price", "Best match", "Best offers", "Closest to budget"]


class ShortlistStay(BaseModel):
    rank: int
    property: Property
    total: Decimal  # the lowest offer total for the stay's nights
    currency: str
    fits_budget: bool
    over_budget_by: Decimal  # 0 when it fits
    fit: int  # 0-100
    reason: Reason
    why: str


class Shortlist(BaseModel):
    place: str
    start_date: date
    end_date: date
    nights: int
    budget: Decimal | None  # total for the whole stay
    currency: str | None
    stays: list[ShortlistStay]


class _Scored:
    def __init__(self, p: Property, c: StayCriteria, budget: Decimal | None):
        cheapest = min(p.offers, key=lambda o: o.total)
        self.property = p
        self.total = cheapest.total
        self.currency = cheapest.currency
        self.fits = budget is None or self.total <= budget
        self.over = Decimal(0) if self.fits else self.total - budget
        self.fit = _fit(p, c)
        self.score = Decimal(0)


def _fit(p: Property, c: StayCriteria) -> int:
    """The share of the stated preferences (each amenity, the stars, the location) the property meets."""
    met = [a in p.amenities for a in c.amenities]
    if c.stars:
        met.append(p.stars in c.stars)
    if c.location.strip():
        met.append(_fold(c.location) in _fold(f"{p.area} {p.name}"))
    return round(100 * sum(met) / len(met)) if met else 100


def _reason(s: _Scored, first: bool, best: dict[str, _Scored]) -> tuple[Reason, str]:
    if first:
        return "Best overall", "Low total price and a strong match for your preferences."
    over = "" if s.fits else " Over your budget."
    if s is best["price"]:
        return "Best price", f"Lowest total of the shortlist.{over}"
    if s is best["fit"]:
        return "Best match", f"Closest to your preferences.{over}"
    if s is best["offers"]:
        extra = "Most extras included, but over your budget." if not s.fits else "Most extras included."
        return "Best offers", extra
    return "Closest to budget", f"Fewer matches than the stays above.{over}"


def rank_properties(properties: list[Property], c: StayCriteria, nights: int) -> list[ShortlistStay]:
    """Budget-fitting stays first, then by 40% total price, 40% preference fit, 20% offers; cut to the top."""
    if not properties:
        return []
    budget = None if c.max_price is None else c.max_price * nights
    scored = [_Scored(p, c, budget) for p in properties]
    lo, hi = min(s.total for s in scored), max(s.total for s in scored)
    for s in scored:
        price = Decimal(1) if hi == lo else (hi - s.total) / (hi - lo)
        offers = Decimal(len(s.property.amenities)) / _AMENITY_COUNT
        s.score = WEIGHTS["price"] * price + WEIGHTS["fit"] * Decimal(s.fit) / 100 + WEIGHTS["offers"] * offers
    scored.sort(key=lambda s: (not s.fits, -s.score, s.property.name))
    top = scored[:SHORTLIST_SIZE]
    best = {
        "price": min(top, key=lambda s: s.total),
        "fit": max(top, key=lambda s: s.fit),
        "offers": max(top, key=lambda s: len(s.property.amenities)),
    }
    out = []
    for i, s in enumerate(top):
        reason, why = _reason(s, i == 0, best)
        out.append(
            ShortlistStay(
                rank=i + 1,
                property=s.property,
                total=s.total,
                currency=s.currency,
                fits_budget=s.fits,
                over_budget_by=s.over,
                fit=s.fit,
                reason=reason,
                why=why,
            )
        )
    return out


def build_shortlist(providers: list[StayProvider], stay: Stay, c: StayCriteria) -> Shortlist:
    """Unlike the options search, budget and optional filters rank stays rather than remove them."""
    nights = (stay.end_date - stay.start_date).days
    gathered: list[tuple[str, ProviderListing]] = []
    for provider in providers:
        try:
            listings = provider.fetch(stay.place, stay.start_date, stay.end_date)
        except Exception:
            logger.exception("stay provider %s failed", provider.name)
            continue
        gathered.extend((provider.name, x) for x in match_listings(listings, c))
    stays = rank_properties(merge_properties(gathered, nights), c, nights)
    return Shortlist(
        place=stay.place,
        start_date=stay.start_date,
        end_date=stay.end_date,
        nights=nights,
        budget=None if c.max_price is None else c.max_price * nights,
        currency=stays[0].currency if stays else None,
        stays=stays,
    )
