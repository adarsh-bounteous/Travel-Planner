import logging
from collections.abc import Callable
from datetime import date

from app.places.search import CATEGORY_FOR_TYPE, Place, PlaceSearch

logger = logging.getLogger(__name__)


def stamp_seed(place: Place, as_of: date) -> Place:
    """A seed place served in place of live data says so, and says how old it is."""
    return place.model_copy(
        update={"source": "seed", "as_of": as_of, "category": place.category or CATEGORY_FOR_TYPE.get(place.place_type)}
    )


class FallbackPlaceSearch:
    """Live places when the primary has some; otherwise the seed catalogue, stamped with source and as_of."""

    def __init__(self, primary: PlaceSearch | None, fallback: PlaceSearch, today: Callable[[], date]) -> None:
        self._primary = primary
        self._fallback = fallback
        self._today = today

    def search(self, destination: str) -> list[Place]:
        if self._primary is not None:
            try:
                found = self._primary.search(destination)
            except Exception as error:  # any failure shows saved data instead of an error
                logger.warning("live places unavailable: %s", type(error).__name__)
            else:
                if found:
                    return found
        as_of = self._today()
        return [stamp_seed(p, as_of) for p in self._fallback.search(destination)]
