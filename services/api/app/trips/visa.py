from datetime import date
from typing import Literal, Protocol

from pydantic import BaseModel

OWNER_KEY = "owner"
CONFIRM_NOTE = "Confirm with official sources."

# Each destination country's government visa / immigration page, for the no-data case.
OFFICIAL_SITES = {
    "Australia": "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-finder",
    "Canada": "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html",
    "France": "https://france-visas.gouv.fr",
    "Germany": "https://www.auswaertiges-amt.de/en/visa-service",
    "India": "https://indianvisaonline.gov.in",
    "Ireland": "https://www.irishimmigration.ie/coming-to-visit-ireland",
    "Japan": "https://www.mofa.go.jp/j_info/visit/visa/index.html",
    "Portugal": "https://vistos.mne.gov.pt/en",
    "United Kingdom": "https://www.gov.uk/check-uk-visa",
    "United States": "https://travel.state.gov/content/travel/en/us-visas.html",
}


class VisaRule(BaseModel):
    required: bool
    by_residence: dict[str, bool] = {}  # residence -> required, overrides `required`


class VisaRuleSource(Protocol):
    """Where visa rules come from. A real provider adapter implements this port."""

    def rule(self, destination_country: str, citizenship: str, residence: str) -> VisaRule | None:
        """The rule for this route, or None when the provider has no data for it."""

    def published_on(self) -> date:
        """When the provider last published rules."""


class InMemoryVisaRules:
    def __init__(self, rules: dict[tuple[str, str], VisaRule], published_on: date) -> None:
        self._rules = rules
        self._published_on = published_on

    def rule(self, destination_country: str, citizenship: str, residence: str) -> VisaRule | None:
        return self._rules.get((destination_country, citizenship))

    def published_on(self) -> date:
        return self._published_on

    def publish(self, rules: dict[tuple[str, str], VisaRule], on: date) -> None:
        """Simulates the provider publishing a change (tests, local mode)."""
        self._rules = rules
        self._published_on = on


# Seeded default until a visa-rule provider is chosen: Japan is visa-free for these citizenships.
_JAPAN_VISA_FREE = (
    "Australia", "Canada", "France", "Germany", "Ireland", "Japan",
    "Portugal", "United Kingdom", "United States",
)
SEED_VISA_RULES = {
    **{("Japan", citizenship): VisaRule(required=False) for citizenship in _JAPAN_VISA_FREE},
    ("Japan", "India"): VisaRule(required=True),
}
SEED_PUBLISHED_ON = date(2026, 10, 20)

VisaStatus = Literal["required", "not_needed", "no_data"]


class Person(BaseModel):
    traveller_id: str | None  # None for the owner row
    name: str
    citizenship: str
    residence: str


class VisaResult(BaseModel):
    traveller_id: str | None  # None for the owner row
    name: str
    citizenship: str
    residence: str
    status: VisaStatus | None  # None while citizenship or residence is blank
    message: str | None
    confirm_note: str | None  # only on a real answer: required or not needed
    official_site_url: str | None  # only for no data; no destination advisory is ever carried
    marked_self_check: bool
    unresolved: bool  # marked "I'll check myself" and still no data


def destination_country(destination: str | None) -> str:
    return (destination or "").rsplit(",", 1)[-1].strip()


def self_check_key(who: Person) -> str:
    return who.traveller_id or OWNER_KEY


def visa_result_for(
    destination: str | None, who: Person, source: VisaRuleSource, self_checks: list[str]
) -> VisaResult:
    country = destination_country(destination)
    marked = self_check_key(who) in self_checks
    base = {
        "traveller_id": who.traveller_id,
        "name": who.name,
        "citizenship": who.citizenship,
        "residence": who.residence,
    }
    if not who.citizenship or not who.residence:
        return VisaResult(
            **base, status=None, message=None, confirm_note=None, official_site_url=None,
            marked_self_check=False, unresolved=False,
        )
    rule = source.rule(country, who.citizenship, who.residence)
    if rule is None:
        where = country or "this destination"
        return VisaResult(
            **base,
            status="no_data",
            message=(
                f"We have no visa data for {who.citizenship} to {where}, so we can't say whether "
                "you need one. Check the official site, then decide how to proceed."
            ),
            confirm_note=None,
            official_site_url=OFFICIAL_SITES.get(country),
            marked_self_check=marked,
            unresolved=marked,
        )
    required = rule.by_residence.get(who.residence, rule.required)
    return VisaResult(
        **base,
        status="required" if required else "not_needed",
        message=f"A visa is required for {country}." if required else f"No visa is needed for {country}.",
        confirm_note=CONFIRM_NOTE,
        official_site_url=None,
        marked_self_check=False,
        unresolved=False,
    )
