import logging
from decimal import Decimal
from typing import Literal, Protocol

from pydantic import BaseModel

from app.trips.destination import ChosenDestination, chosen_destination
from app.trips.rates import RateSource
from app.trips.store import Trip
from app.trips.visa import OFFICIAL_SITES, Person, VisaResult, _fallback_site

logger = logging.getLogger(__name__)

SourceKind = Literal["web_search", "partner"]
ProviderOutcome = Literal["shortlist", "no_visa_needed", "no_data", "details_needed"]

SHORTLIST_SIZE = 3
ANY_NATIONALITY = "*"
NO_DATA_MESSAGE = (
    "We have no visa application providers for this route. "
    "Apply through the destination's official government site instead."
)


class ProviderVisaService(BaseModel):
    """One provider's visa service as fetched; fee in whole currency units, processing in working days."""

    id: str
    name: str
    destination_country: str
    visa_types: list[str]
    nationalities: list[str]  # citizenships handled; ["*"] = any
    fee: Decimal
    currency: str
    processing_days: int
    offers: str | None = None
    url: str  # the provider's booking link


class VisaProvider(Protocol):
    """Where visa services come from. Real web-search and partner adapters implement this port."""

    name: str
    source: SourceKind

    def fetch(self, destination_country: str) -> list[ProviderVisaService]: ...


class VisaProviderOption(BaseModel):
    id: str
    name: str
    source: SourceKind
    fee: Decimal
    currency: str
    processing_days: int
    offers: str | None
    url: str


class VisaProviderView(BaseModel):
    outcome: ProviderOutcome
    traveller_id: str | None
    name: str
    destination: ChosenDestination | None
    visa_type: str | None
    citizenship: str
    matching_count: int
    providers: list[VisaProviderOption]  # at most SHORTLIST_SIZE
    message: str | None
    official_site_url: str | None  # set whenever outcome is no_data


def _handles(service: ProviderVisaService, country: str, visa_type: str, citizenship: str) -> bool:
    return (
        service.destination_country == country
        and visa_type in service.visa_types
        and (citizenship in service.nationalities or ANY_NATIONALITY in service.nationalities)
    )


def gather_visa_providers(
    providers: list[VisaProvider], trip: Trip, who: Person, result: VisaResult, rates: RateSource
) -> VisaProviderView:
    """The lowest-fee providers for a traveller who needs a visa, equal fees by shorter processing time.

    Fees are compared in the trip currency, unconvertible ones last. Whether the traveller marked
    "I'll check myself" does not change the result.
    """
    destination = chosen_destination(trip)
    country = destination.country if destination else ""
    view = VisaProviderView(
        outcome="details_needed",
        traveller_id=who.traveller_id,
        name=who.name,
        destination=destination,
        visa_type=result.visa_type,
        citizenship=who.citizenship,
        matching_count=0,
        providers=[],
        message=None,
        official_site_url=None,
    )
    if result.status is None:
        return view
    if result.status == "not_needed":
        view.outcome = "no_visa_needed"
        return view

    matches: list[tuple[ProviderVisaService, SourceKind]] = []
    if result.status == "required" and result.visa_type:
        for provider in providers:
            try:
                fetched = provider.fetch(country)
            except Exception:
                logger.exception("visa provider %s failed", provider.name)
                continue
            matches += [
                (s, provider.source) for s in fetched if _handles(s, country, result.visa_type, who.citizenship)
            ]
    view.matching_count = len(matches)
    if not matches:
        view.outcome = "no_data"
        view.message = NO_DATA_MESSAGE
        view.official_site_url = OFFICIAL_SITES.get(country) or _fallback_site(country)
        return view

    def order(match: tuple[ProviderVisaService, SourceKind]):
        service = match[0]
        rate = rates.rate(service.currency.upper(), trip.currency)
        converted = (1, Decimal(0)) if rate is None else (0, service.fee * rate)  # unconvertible sorts last
        return (converted, service.processing_days, service.id)

    matches.sort(key=order)
    view.outcome = "shortlist"
    view.providers = [
        VisaProviderOption(
            id=s.id, name=s.name, source=source, fee=s.fee, currency=s.currency,
            processing_days=s.processing_days, offers=s.offers, url=s.url,
        )
        for s, source in matches[:SHORTLIST_SIZE]
    ]
    return view
