from typing import Protocol

from pydantic import BaseModel


class Recommendation(BaseModel):
    id: str
    name: str
    detail: str


class RecommendationSource(Protocol):
    """Where suggested activities come from. A real provider adapter implements this port."""

    def for_destination(self, destination: str) -> list[Recommendation]: ...


class InMemoryRecommendations:
    """Matches a destination ignoring case and surrounding whitespace; unknown ones have none."""

    def __init__(self, catalogue: dict[str, list[Recommendation]]) -> None:
        self._catalogue = {key.strip().casefold(): recs for key, recs in catalogue.items()}

    def for_destination(self, destination: str) -> list[Recommendation]:
        return list(self._catalogue.get(destination.strip().casefold(), []))


# Seeded default until a recommendations provider is chosen.
SEED_RECOMMENDATIONS = {
    "lisbon": [
        Recommendation(id="tile-museum", name="Tile Museum", detail="Museum, about 2 hours"),
        Recommendation(id="alfama-tour", name="Alfama walking tour", detail="Guided walk, about 3 hours"),
        Recommendation(id="sintra", name="Sintra day trip", detail="Day trip, about 8 hours"),
    ],
}
