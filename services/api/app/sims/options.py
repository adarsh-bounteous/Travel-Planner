import logging
from datetime import date
from decimal import Decimal
from typing import Literal, Protocol

from pydantic import BaseModel

from app.trips.destination import ChosenDestination, DestinationStatus, chosen_destination, destination_status
from app.trips.rates import RateSource
from app.trips.store import Trip

logger = logging.getLogger(__name__)

SimType = Literal["esim", "physical"]
SourceKind = Literal["web_search", "partner"]


class ProviderSim(BaseModel):
    """One provider's SIM or eSIM offer, per traveller, with the price as fetched (whole currency units)."""

    id: str
    name: str
    sim_type: SimType
    countries: list[str]  # coverage, country names as in destination_info
    valid_from: date
    valid_to: date
    data_gb: Decimal
    price: Decimal
    currency: str
    url: str


class SimProvider(Protocol):
    """Where SIM options come from. Real web-search and partner adapters implement this port."""

    name: str
    source: SourceKind

    def fetch(self, country: str) -> list[ProviderSim]: ...


class TravellerPrice(BaseModel):
    label: str
    price: Decimal


class SimOption(BaseModel):
    id: str
    name: str
    provider: str
    source: SourceKind
    sim_type: SimType
    countries: list[str]
    coverage_count: int
    valid_from: date
    valid_to: date
    data_gb: Decimal
    price: Decimal
    currency: str
    traveller_prices: list[TravellerPrice]
    group_total: Decimal
    url: str


class SimOptions(BaseModel):
    destination: ChosenDestination | None
    status: DestinationStatus
    place: str
    start_date: date | None
    end_date: date | None
    travellers: list[str]
    preference: SimType | None
    options: list[SimOption]


def country_covered(providers: list[SimProvider], country: str) -> bool:
    """True when any provider lists a SIM covering the country, whatever its dates."""
    for provider in providers:
        try:
            if any(country in x.countries for x in provider.fetch(country)):
                return True
        except Exception:
            logger.exception("SIM provider %s failed", provider.name)
    return False


def covers_trip(sim_from: date, sim_to: date, trip: Trip) -> bool:
    """Valid from the first trip day to the last; both ends are inclusive."""
    return (
        trip.start_date is not None
        and trip.end_date is not None
        and sim_from <= trip.start_date
        and sim_to >= trip.end_date
    )


def gather_sims(
    providers: list[SimProvider],
    trip: Trip,
    travellers: list[str],
    preference: SimType | None,
    rates: RateSource,
) -> SimOptions:
    """SIM and eSIM options covering the trip destination country and every trip date, best first.

    The SIM type only reorders when the profile sets a preference. Every traveller pays the same price.
    """
    chosen = chosen_destination(trip)
    country = chosen.country if chosen else ""
    status = destination_status(
        chosen, needs_place=False, country_has_data=bool(country) and country_covered(providers, country)
    )
    found: list[tuple[SimProvider, ProviderSim]] = []
    for provider in providers if country and trip.start_date and trip.end_date else []:
        try:
            fetched = provider.fetch(country)
        except Exception:
            logger.exception("SIM provider %s failed", provider.name)
            continue
        found.extend(
            (provider, x)
            for x in fetched
            if country in x.countries and covers_trip(x.valid_from, x.valid_to, trip)
        )

    options = [
        SimOption(
            id=x.id,
            name=x.name,
            provider=p.name,
            source=p.source,
            sim_type=x.sim_type,
            countries=x.countries,
            coverage_count=len(x.countries),
            valid_from=x.valid_from,
            valid_to=x.valid_to,
            data_gb=x.data_gb,
            price=x.price,
            currency=x.currency,
            traveller_prices=[TravellerPrice(label=label, price=x.price) for label in travellers],
            group_total=x.price * len(travellers),
            url=x.url,
        )
        for p, x in found
    ]

    def sort_key(o: SimOption) -> tuple:
        type_rank = 0 if preference is None or o.sim_type == preference else 1
        rate = rates.rate(o.currency.upper(), trip.currency)
        converted = (1, Decimal(0)) if rate is None else (0, o.price * rate)  # unconvertible sorts last
        return (type_rank, -o.coverage_count, -o.data_gb, converted, o.id)

    options.sort(key=sort_key)
    return SimOptions(
        destination=chosen,
        status=status,
        place=chosen.label if chosen else "",
        start_date=trip.start_date,
        end_date=trip.end_date,
        travellers=travellers,
        preference=preference,
        options=options,
    )
