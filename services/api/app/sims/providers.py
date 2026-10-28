from datetime import date
from decimal import Decimal

from app.sims.options import ProviderSim, SimType, SourceKind


class InMemorySimProvider:
    """A provider with a fixed catalogue; each entry lists the countries it covers."""

    def __init__(self, name: str, source: SourceKind, catalogue: list[ProviderSim]) -> None:
        self.name = name
        self.source = source
        self._catalogue = catalogue

    def fetch(self, country: str) -> list[ProviderSim]:
        return [x for x in self._catalogue if country in x.countries]


IBERIA = ["Portugal", "Spain"]
EUROPE = [
    "Portugal", "Spain", "France", "Italy", "Germany", "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus",
    "Czechia", "Denmark", "Estonia", "Finland", "Greece", "Hungary", "Iceland", "Ireland", "Latvia",
    "Lithuania", "Luxembourg", "Malta", "Netherlands", "Norway", "Poland", "Romania", "Slovakia", "Slovenia",
    "Sweden", "Switzerland", "Liechtenstein", "Monaco", "United Kingdom",
]


SEED_VALID_FROM = date(2000, 1, 1)
SEED_VALID_TO = date(2099, 12, 31)


def _sim(
    slug: str,
    name: str,
    sim_type: SimType,
    countries: list[str],
    data_gb: int,
    price: str,
    valid_from: date = SEED_VALID_FROM,
    valid_to: date = SEED_VALID_TO,
) -> ProviderSim:
    return ProviderSim(
        id=slug,
        name=name,
        sim_type=sim_type,
        countries=countries,
        valid_from=valid_from,
        valid_to=valid_to,
        data_gb=Decimal(data_gb),
        price=Decimal(price),
        currency="EUR",
        url=f"https://roamly.example/{slug}" if slug.startswith("roamly") else f"https://example.com/sims/{slug}",
    )


# Seeded default until web-search and partner adapters exist: name -> (source, catalogue).
# Some entries fail on coverage or dates on purpose, so the filters have something to remove.
SEED_CATALOGUES: dict[str, tuple[SourceKind, list[ProviderSim]]] = {
    "Web search": (
        "web_search",
        [
            _sim("roamly-europe-10", "Roamly Europe 10 GB", "esim", EUROPE, 10, "14.50"),
            _sim("lisboa-prepaid-15", "Lisboa Prepaid 15 GB", "physical", IBERIA, 15, "12"),
            _sim("roamly-europe-3", "Roamly Europe 3 GB", "esim", EUROPE, 3, "6", valid_to=date(2027, 3, 10)),
            _sim("madrid-tourist-20", "Madrid Tourist 20 GB", "physical", ["Spain"], 20, "15"),
        ],
    ),
    "SimPartner": (
        "partner",
        [
            _sim("nomad-europe-20", "Nomad Europe 20 GB", "esim", EUROPE, 20, "24"),
            _sim("atlas-europe-20", "Atlas Europe 20 GB", "physical", EUROPE, 20, "26"),
            _sim("atlas-asia-10", "Atlas Asia 10 GB", "physical", ["Japan", "Thailand"], 10, "18"),
        ],
    ),
}
