from decimal import Decimal

from app.visa_providers.options import ProviderVisaService, SourceKind


class InMemoryVisaProvider:
    """A provider with fixed visa services per destination country."""

    def __init__(self, name: str, source: SourceKind, catalogue: dict[str, list[ProviderVisaService]]) -> None:
        self.name = name
        self.source = source
        self._catalogue = {key.strip().casefold(): items for key, items in catalogue.items()}

    def fetch(self, destination_country: str) -> list[ProviderVisaService]:
        return list(self._catalogue.get(destination_country.strip().casefold(), []))


def _service(
    slug: str,
    name: str,
    country: str,
    fee: str,
    days: int,
    currency: str = "GBP",
    offers: str | None = None,
    nationalities: tuple[str, ...] = ("India",),
) -> ProviderVisaService:
    return ProviderVisaService(
        id=slug,
        name=name,
        destination_country=country,
        visa_types=["tourist"],
        nationalities=list(nationalities),
        fee=Decimal(fee),
        currency=currency,
        processing_days=days,
        offers=offers,
        url=f"https://example.com/visa/{slug}",  # placeholder booking link
    )


# Seeded default until web-search and partner adapters exist: name -> (source, catalogue).
# Placeholder fees, times and offers; replace with real provider data before release.
SEED_CATALOGUES: dict[str, tuple[SourceKind, dict[str, list[ProviderVisaService]]]] = {
    "VisaFinder": (
        "web_search",
        {
            "japan": [
                _service("visafinder-japan", "VisaFinder Japan", "Japan", "45", 7, offers="Free document check"),
                _service("easyvisa-japan", "EasyVisa Japan", "Japan", "30", 10, "EUR"),
            ],
            "portugal": [_service("visafinder-portugal", "VisaFinder Portugal", "Portugal", "55", 12)],
            "mexico": [_service("visafinder-mexico", "VisaFinder Mexico", "Mexico", "40", 6, nationalities=("Canada",))],
        },
    ),
    "Partner Visas": (
        "partner",
        {
            "japan": [
                _service("partner-japan-express", "Partner Visas Express", "Japan", "45", 3, offers="Express handling included"),
                _service("partner-japan-standard", "Partner Visas Standard", "Japan", "60", 8),
                _service("partner-japan-any", "Partner Visas Anywhere", "Japan", "80", 5, nationalities=("*",)),
            ],
            "portugal": [
                _service("partner-portugal", "Partner Visas Portugal", "Portugal", "50", 9, offers="10% off for groups"),
                _service("partner-portugal-fast", "Partner Visas Portugal Fast", "Portugal", "75", 4),
            ],
            "peru": [_service("partner-peru", "Partner Visas Peru", "Peru", "35", 5, nationalities=("Canada",))],
        },
    ),
}
