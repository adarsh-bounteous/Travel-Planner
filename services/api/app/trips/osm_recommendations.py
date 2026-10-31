import logging
from collections.abc import Callable
from datetime import date

from app.places.fallback import stamp_seed
from app.places.search import Place, PlaceSearch
from app.trips.recommendations import Recommendation, RecommendationSource

logger = logging.getLogger(__name__)

_INTEREST = {
    "sights": "Culture",
    "museums": "Culture",
    "food": "Food",
    "viewpoints": "Outdoors",
    "nightlife": "Nightlife",
}
_LABEL = {
    "sights": "Sights",
    "museums": "Museums",
    "food": "Food",
    "viewpoints": "Viewpoints",
    "nightlife": "Nightlife",
}


def _recommendation(place: Place) -> Recommendation:
    label = _LABEL.get(place.category or "", "Place")
    return Recommendation(
        id=place.id,
        name=place.name,
        detail=f"{label}, {place.address}" if place.address else label,
        interest=_INTEREST.get(place.category or ""),
        place=place,
    )


class OsmRecommendations:
    """Recommendations from real OpenStreetMap places; raises when the search does."""

    def __init__(self, places: PlaceSearch) -> None:
        self._places = places

    def for_destination(self, destination: str) -> list[Recommendation]:
        return [_recommendation(p) for p in self._places.search(destination)]


class FallbackRecommendations:
    """Live recommendations when there are some; otherwise the seed ones, stamped with source and as_of."""

    def __init__(
        self, primary: RecommendationSource | None, fallback: RecommendationSource, today: Callable[[], date]
    ) -> None:
        self._primary = primary
        self._fallback = fallback
        self._today = today

    def for_destination(self, destination: str) -> list[Recommendation]:
        if self._primary is not None:
            try:
                found = self._primary.for_destination(destination)
            except Exception as error:
                logger.warning("live recommendations unavailable: %s", type(error).__name__)
            else:
                if found:
                    return found
        as_of = self._today()
        return [
            r.model_copy(update={"place": stamp_seed(r.place, as_of) if r.place else None})
            for r in self._fallback.for_destination(destination)
        ]
