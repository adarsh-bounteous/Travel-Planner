from typing import Protocol

from pydantic import BaseModel

from app.places.search import Place, _place


class Recommendation(BaseModel):
    id: str
    name: str
    detail: str
    interest: str | None = None  # the interest this suggestion matches, when known
    place: Place | None = None  # what Save stores, through the saved-places flow


class RecommendationSource(Protocol):
    """Where suggested activities come from. A real provider adapter implements this port."""

    def for_destination(self, destination: str) -> list[Recommendation]: ...


class InMemoryRecommendations:
    """Matches a destination ignoring case and surrounding whitespace; unknown ones have none."""

    def __init__(self, catalogue: dict[str, list[Recommendation]]) -> None:
        self._catalogue = {key.strip().casefold(): recs for key, recs in catalogue.items()}

    def for_destination(self, destination: str) -> list[Recommendation]:
        return list(self._catalogue.get(destination.strip().casefold(), []))





def _local(slug: str, name: str, detail: str, interest: str, place_type, price, lat: float, lng: float) -> Recommendation:
    return Recommendation(
        id=slug, name=name, detail=detail, interest=interest, place=_place(slug, name, place_type, price, lat, lng)
    )


# Local mode's stand-in for the recommendation service: tagged by interest, no shared ids between destinations.
SEED_LOCAL_RECOMMENDATIONS = {
    "lisbon": [
        _local("time-out-market", "Time Out Market tasting hour", "Food hall, about 1 hour", "Food", "food", "moderate", 38.7071, -9.1459),
        _local("pastel-de-belem", "Pastéis de Belém stop", "Bakery, about 45 minutes", "Food", "food", "budget", 38.6975, -9.2032),
        _local("tile-museum-local", "Tile Museum", "Museum, about 2 hours", "Culture", "museum", "budget", 38.7249, -9.1136),
        _local("fado-alfama", "Fado evening in Alfama", "Live music, about 2 hours", "Culture", "landmark", "moderate", 38.7110, -9.1300),
        _local("cabo-da-roca", "Cabo da Roca viewpoint", "Coast walk, about 3 hours", "Outdoors", "park", "free", 38.7804, -9.4986),
    ],
    "kyoto": [
        _local("fushimi-inari", "Fushimi Inari gates", "Shrine walk, about 2 hours", "Culture", "landmark", "free", 34.9671, 135.7727),
        _local("nishiki-market", "Nishiki Market tea stop", "Tea tasting, about 1 hour", "Culture", "food", "budget", 35.0050, 135.7649),
        _local("arashiyama-bamboo", "Arashiyama bamboo grove", "Forest walk, about 2 hours", "Nature", "park", "free", 35.0170, 135.6713),
        _local("philosophers-path", "Philosopher's Path stroll", "Canal walk, about 1.5 hours", "Nature", "park", "free", 35.0270, 135.7948),
    ],
}


# Seeded default until a recommendations provider is chosen.
SEED_RECOMMENDATIONS = {
    "lisbon": [
        _local("tile-museum", "Tile Museum", "Museum, about 2 hours", "Culture", "museum", "budget", 38.7249, -9.1136),
        _local("alfama-tour", "Alfama walking tour", "Guided walk, about 3 hours", "Culture", "landmark", "free", 38.7110, -9.1300),
        _local("sintra", "Sintra day trip", "Day trip, about 8 hours", "Outdoors", "park", "moderate", 38.7979, -9.3880),
    ],
}
