from typing import Literal
from urllib.parse import quote_plus

from pydantic import BaseModel

from app.trips.visa import destination_country as _country

# Placeholder rules seeded from the design prototype; real medical sources are out of scope.
VaccStatus = Literal["required", "recommended", "already_had", "unsuitable_in_pregnancy"]
Result = Literal["guidance", "no_data", "none_required"]

CONFIRM_NOTE = "Confirm with official sources before you travel."
PREGNANCY_ADVISORY = "Pregnancy advisory"

_OFFICIAL_SITES = {
    "Portugal": "https://www.portugal.gov.pt/",
    "Japan": "https://www.japan.travel/",
}

# destination country -> citizenship -> (tests, {vaccination: base status}, advisories)
_ROUTES: dict[str, dict[str, tuple[list[str], dict[str, VaccStatus], list[str]]]] = {
    "Portugal": {
        "Canada": (
            [],
            {"Hepatitis A": "recommended", "Tetanus booster": "recommended", "MMR booster": "required"},
            ["General health advisory for Portugal"],
        ),
        "India": (
            [],
            {"Hepatitis A": "recommended", "Typhoid": "required"},
            ["General health advisory for Portugal"],
        ),
        "Ireland": ([], {}, []),
    }
}

# Extras added by where the traveller lives: residence -> (tests, vaccinations)
_RESIDENCE_EXTRAS: dict[str, tuple[list[str], dict[str, VaccStatus]]] = {
    "India": (["TB screening"], {"Typhoid": "required"}),
}

# Vaccinations that should not be given during pregnancy (live vaccines).
_UNSUITABLE_IN_PREGNANCY = {"MMR booster"}

_PREGNANCY_ONLY_ADVISORIES = [PREGNANCY_ADVISORY]


def has_data(country: str) -> bool:
    return country in _ROUTES


def _official_site(country: str) -> str:
    """The seeded official site, else a search for the country's official government travel site."""
    known = _OFFICIAL_SITES.get(country)
    if known:
        return known
    query = quote_plus(f"{country} official government travel health advice".strip())
    return f"https://www.google.com/search?q={query}"


class VaccinationGuidance(BaseModel):
    name: str
    status: VaccStatus


class TravellerGuidance(BaseModel):
    traveller_id: str | None  # None for the owner row
    name: str
    citizenship: str
    residence: str
    result: Result
    tests: list[str]
    vaccinations: list[VaccinationGuidance]
    advisories: list[str]
    health_details_given: bool
    official_site_url: str | None  # set when result is no_data
    confirm_note: str


def guidance_for(
    destination: str | None,
    citizenship: str,
    residence: str,
    vaccinations_had: list[str],
    pregnant: bool | None,
    *,
    name: str,
    traveller_id: str | None,
) -> TravellerGuidance:
    country = _country(destination)
    details_given = bool(vaccinations_had) or pregnant is not None
    base = dict(
        traveller_id=traveller_id,
        name=name,
        citizenship=citizenship,
        residence=residence,
        health_details_given=details_given,
        confirm_note=CONFIRM_NOTE,
    )
    route = _ROUTES.get(country, {}).get(citizenship)
    if route is None:
        return TravellerGuidance(
            **base,
            result="no_data",
            tests=[],
            vaccinations=[],
            advisories=[],
            official_site_url=_official_site(country),
        )

    route_tests, route_vaccs, route_advisories = route
    extra_tests, extra_vaccs = _RESIDENCE_EXTRAS.get(residence, ([], {}))
    tests = [*route_tests, *(t for t in extra_tests if t not in route_tests)]
    statuses = {**route_vaccs, **extra_vaccs}

    def status_of(vaccination: str, planned: VaccStatus) -> VaccStatus:
        if vaccination in vaccinations_had:
            return "already_had"
        if pregnant is True and vaccination in _UNSUITABLE_IN_PREGNANCY:
            return "unsuitable_in_pregnancy"
        return planned

    vaccinations = [VaccinationGuidance(name=v, status=status_of(v, s)) for v, s in statuses.items()]
    advisories = [*route_advisories, *(_PREGNANCY_ONLY_ADVISORIES if pregnant is True else [])]
    result: Result = "guidance" if tests or vaccinations or advisories else "none_required"
    return TravellerGuidance(
        **base,
        result=result,
        tests=tests,
        vaccinations=vaccinations,
        advisories=advisories,
        official_site_url=None,
    )
