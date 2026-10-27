import logging
from datetime import datetime
from decimal import Decimal
from typing import Literal, Protocol

from pydantic import BaseModel

from app.trips.rates import RateSource
from app.trips.store import Trip

logger = logging.getLogger(__name__)

SourceKind = Literal["web_search", "partner"]
Adventure = Literal["none", "limited", "full"]

WORLDWIDE = "worldwide"
# Placeholder scoring, awaiting confirmation: each of the four scores is 0-1 and fit is their sum.
AGE_MARGIN = 10  # a traveller within this many years of a plan's age limit scores half
RISKY_SCORE: dict[str, Decimal] = {"full": Decimal(1), "limited": Decimal("0.5"), "none": Decimal(0)}
ADVENTURE_TEXT = {"full": "with adventure sports", "limited": "with limited adventure sports", "none": "no adventure sports"}


class AgeRate(BaseModel):
    min_age: int
    max_age: int
    per_day: Decimal


class ProviderPlan(BaseModel):
    """One provider's plan, with prices as fetched (whole currency units). Commission is never read by ranking."""

    plan_id: str
    name: str
    provider: str
    regions: list[str]  # lower-case place names, or "worldwide"
    max_days: int
    min_age: int
    max_age: int
    adventure: Adventure
    daily_rates: list[AgeRate]
    currency: str
    offer: str | None = None
    commission: Decimal = Decimal(0)
    url: str
    fetched_at: datetime


class InsuranceProvider(Protocol):
    """Where plans come from. Real web-search and partner adapters implement this port."""

    name: str
    source: SourceKind

    def fetch(self, destination: str) -> list[ProviderPlan]: ...


class InsuranceTraveller(BaseModel):
    label: str
    age: int | None


class TravellerPrice(BaseModel):
    label: str
    age: int
    price: Decimal


class InsurancePlan(BaseModel):
    rank: int
    plan_id: str
    name: str
    provider: str
    source: SourceKind
    fit: float
    reason: str
    offer: str | None
    traveller_prices: list[TravellerPrice]
    group_total: Decimal
    currency: str
    url: str


class InsuranceOptions(BaseModel):
    place: str
    days: int | None
    risky_activities: bool | None
    travellers: list[InsuranceTraveller]
    missing: list[str]  # what the trip still lacks before plans can be matched
    plans: list[InsurancePlan]


def _fold(text: str) -> str:
    return " ".join(text.casefold().split())


def insurance_travellers(trip: Trip) -> list[InsuranceTraveller]:
    """The owner as "You", then each named traveller."""
    return [
        InsuranceTraveller(label="You", age=trip.owner_age),
        *[InsuranceTraveller(label=t.name, age=t.age) for t in trip.travellers],
    ]


def _missing(trip: Trip, travellers: list[InsuranceTraveller]) -> list[str]:
    missing = []
    if not trip.destination:
        missing.append("destination")
    if trip.start_date is None or trip.end_date is None:
        missing.append("trip dates")
    if trip.risky_activities is None:
        missing.append("risky activities answer")
    missing += [f"age of {t.label}" if t.label != "You" else "your age" for t in travellers if t.age is None]
    short = (trip.traveller_count or 0) - len(travellers)
    if short > 0:
        missing.append(f"details of {short} more traveller{'s' if short > 1 else ''}")
    return missing


def _rate(plan: ProviderPlan, age: int) -> Decimal | None:
    return next((r.per_day for r in plan.daily_rates if r.min_age <= age <= r.max_age), None)


def _clamp(x: Decimal) -> Decimal:
    return max(Decimal(0), min(Decimal(1), x))


def _fit(plan: ProviderPlan, place: str, days: int, ages: list[int], risky: bool) -> Decimal:
    """Sum of four 0-1 scores. Price, offer and commission take no part."""
    destination = Decimal(1) if place in plan.regions else Decimal("0.5")
    length = _clamp(1 - Decimal(days - 1) / Decimal(plan.max_days))
    age = sum((Decimal(1) if a <= plan.max_age - AGE_MARGIN else Decimal("0.5") for a in ages), Decimal(0)) / len(ages)
    return destination + length + age + (RISKY_SCORE[plan.adventure] if risky else Decimal(1))


def _reason(plan: ProviderPlan, place: str, destination: str) -> str:
    where = destination if place in plan.regions else "worldwide"
    return f"Covers {where}, trips up to {plan.max_days} days, ages up to {plan.max_age}, {ADVENTURE_TEXT[plan.adventure]}."


def gather_insurance(providers: list[InsuranceProvider], trip: Trip, rates: RateSource) -> InsuranceOptions:
    """Plans matched to the trip, best fit first. Order is fit, then provider and plan name, nothing else.

    Trip length is inclusive days. Prices stay in each plan's currency, so `rates` is not needed here.
    """
    travellers = insurance_travellers(trip)
    missing = _missing(trip, travellers)
    days = (trip.end_date - trip.start_date).days + 1 if trip.start_date and trip.end_date else None
    out = InsuranceOptions(
        place=trip.destination or "",
        days=days,
        risky_activities=trip.risky_activities,
        travellers=travellers,
        missing=missing,
        plans=[],
    )
    if missing or days is None or days < 1:
        return out

    place = _fold(trip.destination or "")
    ages = [t.age for t in travellers if t.age is not None]
    candidates: list[tuple[ProviderPlan, SourceKind, Decimal]] = []
    for provider in providers:
        try:
            fetched = provider.fetch(trip.destination or "")
        except Exception:
            logger.exception("insurance provider %s failed", provider.name)
            continue
        for plan in fetched:
            if place not in plan.regions and WORLDWIDE not in plan.regions:
                continue
            if plan.max_days < days or any(not plan.min_age <= a <= plan.max_age for a in ages):
                continue
            if any(_rate(plan, a) is None for a in ages):
                continue
            candidates.append((plan, provider.source, _fit(plan, place, days, ages, bool(trip.risky_activities))))
    candidates.sort(key=lambda c: (-c[2], c[0].provider, c[0].name))

    previous: tuple[ProviderPlan, Decimal] | None = None
    for rank, (plan, source, fit) in enumerate(candidates, start=1):
        reason = _reason(plan, place, trip.destination or "")
        if previous is not None and previous[1] == fit:
            reason += f" Equal fit to {previous[0].name}; listed after it by provider name."
        previous = (plan, fit)
        prices = [TravellerPrice(label=t.label, age=t.age, price=(_rate(plan, t.age) or Decimal(0)) * days) for t in travellers if t.age is not None]
        out.plans.append(
            InsurancePlan(
                rank=rank,
                plan_id=plan.plan_id,
                name=plan.name,
                provider=plan.provider,
                source=source,
                fit=float(fit),
                reason=reason,
                offer=plan.offer,
                traveller_prices=prices,
                group_total=sum((p.price for p in prices), Decimal(0)),
                currency=plan.currency,
                url=plan.url,
            )
        )
    return out
