from collections.abc import Callable
from datetime import datetime
from decimal import Decimal

from app.attractions.options import ActivityKind, ProviderActivity, SourceKind


class InMemoryActivityProvider:
    """A provider with fixed activities per place; the clock stamps each as it is fetched."""

    def __init__(
        self,
        name: str,
        source: SourceKind,
        catalogue: dict[str, list[ProviderActivity]],
        clock: Callable[[], datetime],
    ) -> None:
        self.name = name
        self.source = source
        self._catalogue = {key.strip().casefold(): items for key, items in catalogue.items()}
        self._clock = clock

    def fetch(self, place: str) -> list[ProviderActivity]:
        fetched_at = self._clock()
        return [x.model_copy(update={"fetched_at": fetched_at}) for x in self._catalogue.get(place.strip().casefold(), [])]


_EPOCH = datetime(2000, 1, 1)  # replaced by the clock at fetch time


def _activity(
    provider: str,
    slug: str,
    title: str,
    kind: ActivityKind,
    interests: list[str],
    adult: int,
    child: int | None = None,
    offer: str | None = None,
) -> ProviderActivity:
    return ProviderActivity(
        title=title,
        kind=kind,
        interests=interests,
        provider=provider,
        adult_price=Decimal(adult),
        child_price=None if child is None else Decimal(child),
        currency="EUR",
        offer=offer,
        fetched_at=_EPOCH,
        url=f"https://example.com/activities/{slug}",
    )


# Seeded default until web-search and partner-platform adapters exist: name -> (source, catalogue).
SEED_CATALOGUES: dict[str, tuple[SourceKind, dict[str, list[ProviderActivity]]]] = {
    "Lisbon Tours Co": (
        "web_search",
        {
            "lisbon": [
                _activity("Lisbon Tours Co", "ltc-tile", "Tile Museum", "ticket", ["museum", "history"], 18, 9),
                _activity("Lisbon Tours Co", "ltc-sail", "Sunset Sail", "experience", ["sea", "romance"], 45),
                _activity("Lisbon Tours Co", "ltc-sintra", "Sintra Day Trip", "day_trip", ["history", "nature"], 60, 30, "10% off online"),
                _activity("Lisbon Tours Co", "ltc-rossio", "Rossio Square", "free_sight", ["history"], 0),
            ]
        },
    ),
    "GetYourTrip": (
        "partner",
        {
            "lisbon": [
                _activity("GetYourTrip", "gyt-tile", "Tile Museum", "ticket", ["museum", "history"], 20, 10),
                _activity("GetYourTrip", "gyt-food", "Alfama Food Tour", "tour", ["food"], 55, 35),
                _activity("GetYourTrip", "gyt-concert", "Midsummer Concert", "event", ["music"], 30),
            ]
        },
    ),
}
