from datetime import date
from typing import Literal, Protocol
from urllib.parse import quote_plus

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


def _fallback_site(country: str) -> str:
    """A search for the destination's government visa page, for countries outside OFFICIAL_SITES."""
    query = quote_plus(f"{country or 'destination'} government visa immigration official site")
    return f"https://www.google.com/search?q={query}"


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


class VisaGuidance(BaseModel):
    country: str
    entry_requirement: str
    max_stay: str
    documents: list[str]


# Seeded guidance per destination country (every country the destination dropdown offers).
# Seed facts are unverified: a human must check them against official sources before release.
_GUIDANCE = {
    "Japan": ("90 days", ["Passport valid for the whole stay", "Onward or return ticket"]),
    "Portugal": ("90 days in any 180", ["Passport valid 3 months beyond departure", "Proof of accommodation", "Proof of funds"]),
    "India": ("90 days", ["Passport valid 6 months beyond arrival", "Return ticket", "Passport photo"]),
    "Thailand": ("60 days", ["Passport valid 6 months beyond arrival", "Proof of onward travel", "Proof of accommodation"]),
    "Mexico": ("180 days", ["Valid passport", "Return ticket", "Proof of funds"]),
    "Morocco": ("90 days", ["Passport valid 6 months beyond arrival", "Return ticket", "Proof of accommodation"]),
    "Peru": ("183 days", ["Valid passport", "Return ticket", "Proof of accommodation"]),
}


def guidance_for(country: str, required: bool) -> VisaGuidance | None:
    if country not in _GUIDANCE:
        return None
    max_stay, documents = _GUIDANCE[country]
    entry = (
        f"A visa must be obtained before travelling to {country}."
        if required
        else f"No visa is needed to enter {country} for a short visit."
    )
    return VisaGuidance(country=country, entry_requirement=entry, max_stay=max_stay, documents=documents)


# Seeded default until a visa-rule provider is chosen: these citizenships get a rule per country.
_SEEDED_CITIZENSHIPS = (
    "Australia", "Canada", "France", "Germany", "India", "Ireland", "Japan",
    "Portugal", "United Kingdom", "United States",
)
# Citizenships that need a visa, per destination; every other seeded citizenship is visa-free.
_VISA_REQUIRED = {
    "Japan": {"India"},
    "Portugal": {"India"},
    "India": {c for c in _SEEDED_CITIZENSHIPS if c != "India"},
    "Thailand": set(),
    "Mexico": {"India"},
    "Morocco": {"India"},
    "Peru": {"India"},
}
SEED_VISA_RULES = {
    (country, citizenship): VisaRule(required=citizenship in required)
    for country, required in _VISA_REQUIRED.items()
    for citizenship in _SEEDED_CITIZENSHIPS
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
    guidance: VisaGuidance | None = None  # only on a real answer: required or not needed


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
            official_site_url=OFFICIAL_SITES.get(country) or _fallback_site(country),
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
        guidance=guidance_for(country, required),
    )
