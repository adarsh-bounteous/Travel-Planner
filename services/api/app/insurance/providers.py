from collections.abc import Callable
from datetime import datetime
from decimal import Decimal

from app.insurance.options import WORLDWIDE, AgeRate, Adventure, ProviderPlan, SourceKind


class InMemoryInsuranceProvider:
    """A provider with fixed plans per place (plus its worldwide plans); the clock stamps each as it is fetched."""

    def __init__(
        self,
        name: str,
        source: SourceKind,
        catalogue: dict[str, list[ProviderPlan]],
        clock: Callable[[], datetime],
    ) -> None:
        self.name = name
        self.source = source
        self._catalogue = {key.strip().casefold(): items for key, items in catalogue.items()}
        self._clock = clock

    def fetch(self, destination: str) -> list[ProviderPlan]:
        fetched_at = self._clock()
        plans = [*self._catalogue.get(destination.strip().casefold(), []), *self._catalogue.get(WORLDWIDE, [])]
        return [p.model_copy(update={"fetched_at": fetched_at}) for p in plans]


_EPOCH = datetime(2000, 1, 1)  # replaced by the clock at fetch time


def _plan(
    provider: str,
    slug: str,
    name: str,
    regions: list[str],
    max_days: int,
    max_age: int,
    adventure: Adventure,
    adult: str,
    senior: str,
    offer: str | None = None,
    commission: str = "0",
) -> ProviderPlan:
    return ProviderPlan(
        plan_id=slug,
        name=name,
        provider=provider,
        regions=regions,
        max_days=max_days,
        min_age=0,
        max_age=max_age,
        adventure=adventure,
        daily_rates=[
            AgeRate(min_age=0, max_age=60, per_day=Decimal(adult)),
            AgeRate(min_age=61, max_age=120, per_day=Decimal(senior)),
        ],
        currency="EUR",
        offer=offer,
        commission=Decimal(commission),
        fetched_at=_EPOCH,
        url=f"https://example.com/insurance/{slug}",
    )


# Seeded default until web-search and partner adapters exist: name -> (source, catalogue).
SEED_CATALOGUES: dict[str, tuple[SourceKind, dict[str, list[ProviderPlan]]]] = {
    "Globetrek": (
        "web_search",
        {
            "japan": [
                _plan("Globetrek", "globetrek", "Globetrek Adventure Plus", ["japan"], 30, 70, "full", "3.84", "7.12", "10% off online", "12"),
            ],
            "lisbon": [
                _plan("Globetrek", "globetrek-lisbon", "Globetrek City Break", ["lisbon"], 21, 75, "limited", "2.10", "4.30"),
            ],
        },
    ),
    "Asia Pacific": (
        "partner",
        {
            "japan": [_plan("Asia Pacific", "asia-pacific", "Asia Pacific Cover", ["japan"], 14, 75, "limited", "3.10", "6.40", None, "9")],
        },
    ),
    "Meridian": (
        "partner",
        {
            WORLDWIDE: [
                _plan("Meridian", "meridian", "Meridian Worldwide", [WORLDWIDE], 45, 80, "none", "4.50", "8.20", "Free cancellation add-on", "15")
            ],
        },
    ),
    "Pilot": (
        "web_search",
        {
            "japan": [_plan("Pilot", "pilot", "Pilot Travel Basic", ["japan"], 12, 65, "none", "1.95", "4.80", "15% off this week")],
            "lisbon": [_plan("Pilot", "pilot-lisbon", "Pilot Europe Basic", ["lisbon"], 30, 65, "none", "1.40", "3.10")],
        },
    ),
}
