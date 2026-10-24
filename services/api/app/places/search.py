from typing import Literal, Protocol

from pydantic import BaseModel

PlaceType = Literal["landmark", "museum", "park", "food", "shopping"]
Price = Literal["free", "budget", "moderate", "premium"]


class Place(BaseModel):
    id: str
    name: str
    image_url: str
    place_type: PlaceType
    price: Price
    lat: float
    lng: float


class PlaceSearch(Protocol):
    """Where places come from. A real Maps and Places Data adapter implements this port."""

    def search(self, destination: str) -> list[Place]: ...


class InMemoryPlaceSearch:
    """Matches a destination ignoring case and surrounding whitespace; unknown ones have no places."""

    def __init__(self, catalogue: dict[str, list[Place]]) -> None:
        self._catalogue = {key.strip().casefold(): places for key, places in catalogue.items()}

    def search(self, destination: str) -> list[Place]:
        return list(self._catalogue.get(destination.strip().casefold(), []))


def _place(slug: str, name: str, place_type: PlaceType, price: Price, lat: float, lng: float) -> Place:
    return Place(
        id=slug,
        name=name,
        image_url=f"https://picsum.photos/seed/{slug}/400/300",
        place_type=place_type,
        price=price,
        lat=lat,
        lng=lng,
    )


# Seeded default until a places provider is chosen.
SEED_CATALOGUE = {
    "lisbon": [
        _place("alfama", "Alfama", "landmark", "free", 38.7110, -9.1300),
        _place("belem-tower", "Belém Tower", "museum", "budget", 38.6916, -9.2160),
        _place("lx-factory", "LX Factory", "shopping", "moderate", 38.7036, -9.1786),
    ],
    "paris": [
        _place("louvre", "Louvre Museum", "museum", "moderate", 48.8606, 2.3376),
        _place("montmartre", "Montmartre", "landmark", "free", 48.8867, 2.3431),
    ],
    "oslo": [
        _place("vigeland-park", "Vigeland Park", "park", "free", 59.9270, 10.7005),
        _place("opera-house", "Oslo Opera House", "landmark", "budget", 59.9075, 10.7529),
    ],
}
