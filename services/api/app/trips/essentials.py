from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.trips.destination_info import (
    CLIMATE_SOURCE,
    CURRENCY_AS_OF,
    CURRENCY_SOURCE,
    currency_for,
    typical_weather_for,
)
from app.trips.medical import MEDICAL_AS_OF, MEDICAL_SOURCE, TravellerGuidance, guidance_for, has_data
from app.trips.profile_store import Profile
from app.trips.store import Trip, visible_reminders
from app.trips.visa import (
    VISA_SOURCE,
    Person,
    VisaRuleSource,
    destination_country,
    official_site_for,
    visa_result_for,
)

PRICE_NOTICE = "Prices and availability may change. Check again before you book."
CONFIRM_NOTICE = "Confirm with official sources before you travel."


class EssentialFact(BaseModel):
    key: Literal["visa", "insurance", "sim", "currency", "weather", "medical"]
    label: str
    value: str | None  # None renders as "Not yet planned"
    detail: str | None = None
    link_text: str | None = None
    link_url: str | None = None  # http(s) only: the visa official source
    source: str | None = None
    as_of: date | None = None


class ChecklistItem(BaseModel):
    key: Literal["passport", "visa", "insurance", "sim", "reminders", "bookings"]
    label: str
    hint: str | None = None
    done: bool


class SourceLine(BaseModel):
    label: str
    source: str
    as_of: date


class ImportantNotes(BaseModel):
    price_notice: str
    confirm_notice: str
    sources: list[SourceLine]  # only facts that have a value


_CHECKLIST = [
    ("passport", "Passport validity", "Check it is valid for your whole stay."),
    ("visa", "Visa", "Apply early if you need one."),
    ("insurance", "Insurance", None),
    ("sim", "SIM", None),
    ("reminders", "Reminders", "Notes you set for the trip."),
    ("bookings", "Bookings to make", "Book anything still marked unbooked."),
]


def _medical_summary(guidance: TravellerGuidance) -> tuple[str | None, str | None]:
    if guidance.result == "no_data":
        return None, None
    if guidance.result == "none_required":
        return "No vaccinations or tests are required.", None
    vaccinations = [f"{v.name} ({v.status.replace('_', ' ')})" for v in guidance.vaccinations]
    parts = [*vaccinations, *guidance.tests] or guidance.advisories
    return "; ".join(parts), ("; ".join(guidance.advisories) or None)


def _sim_value(trip: Trip) -> str | None:
    sim = trip.sim
    if sim is None:
        return None
    return f"{sim.name}, {sim.data_gb.normalize():f} GB, valid {sim.valid_from.isoformat()} to {sim.valid_to.isoformat()}"


def build_essentials(
    trip: Trip, owner_profile: Profile | None, visa_rules: VisaRuleSource, today: date
) -> tuple[list[EssentialFact], list[ChecklistItem], ImportantNotes]:
    """Travel essentials, the six-item Before you go checklist and the notes, from data the trip already holds."""
    country = trip.country or destination_country(trip.destination)
    profile = owner_profile or Profile()
    updated = trip.updated_at.date() if trip.updated_at else None

    result = visa_result_for(
        country, Person(traveller_id=None, name=profile.display_name, citizenship=profile.citizenship, residence=profile.residence),
        visa_rules, trip.visa_self_checks,
    )
    answered = result.status in ("required", "not_needed")
    link = official_site_for(country)
    facts = [
        EssentialFact(
            key="visa", label="Visa status", value=result.message if answered else None,
            link_text="Official visa source" if link else None, link_url=link,
            source=VISA_SOURCE if answered else None, as_of=visa_rules.published_on() if answered else None,
        ),
        EssentialFact(
            key="insurance", label="Insurance",
            value=trip.insurance.name if trip.insurance else None,
            source=trip.insurance.provider if trip.insurance else None,
            as_of=updated if trip.insurance else None,
        ),
        EssentialFact(
            key="sim", label="SIM", value=_sim_value(trip),
            source=trip.sim.provider if trip.sim else None, as_of=updated if trip.sim else None,
        ),
    ]
    currency = currency_for(trip.destination or country)
    facts.append(EssentialFact(
        key="currency", label="Currency", value=currency,
        source=CURRENCY_SOURCE if currency else None, as_of=CURRENCY_AS_OF if currency else None,
    ))
    weather = typical_weather_for(trip.destination or country, trip.start_date.month) if trip.start_date else None
    facts.append(EssentialFact(
        key="weather", label="Typical weather for your dates", value=weather.summary if weather else None,
        source=CLIMATE_SOURCE if weather else None, as_of=weather.as_of if weather else None,
    ))
    if has_data(country) and owner_profile is not None:
        guidance = guidance_for(
            country, profile.citizenship, profile.residence, profile.vaccinations_had, profile.pregnant,
            name=profile.display_name, traveller_id=None,
        )
        value, detail = _medical_summary(guidance)
        if value:  # no guidance for this traveller: the card is left out
            facts.append(EssentialFact(
                key="medical", label="Medical guidance", value=value, detail=detail,
                source=MEDICAL_SOURCE, as_of=MEDICAL_AS_OF,
            ))

    derived = {
        "insurance": trip.insurance is not None,
        "sim": trip.sim is not None,
        "reminders": bool(visible_reminders(trip)),
    }
    checklist = [
        ChecklistItem(key=key, label=label, hint=hint, done=key in trip.checklist_done or derived.get(key, False))
        for key, label, hint in _CHECKLIST
    ]
    sources = [SourceLine(label=f.label, source=f.source, as_of=f.as_of) for f in facts if f.value and f.source and f.as_of]
    return facts, checklist, ImportantNotes(price_notice=PRICE_NOTICE, confirm_notice=CONFIRM_NOTICE, sources=sources)
