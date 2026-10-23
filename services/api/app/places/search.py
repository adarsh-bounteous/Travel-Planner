from typing import Protocol

from pydantic import BaseModel


class Place(BaseModel):
    id: str
    name: str
    image_url: str


class PlaceSearch(Protocol):
    """Where places come from. A real Maps and Places Data adapter implements this port."""

    def search(self, destination: str) -> list[Place]: ...


class InMemoryPlaceSearch:
    """Matches a destination ignoring case and surrounding whitespace; unknown ones have no places."""

    def __init__(self, catalogue: dict[str, list[Place]]) -> None:
        self._catalogue = {key.strip().casefold(): places for key, places in catalogue.items()}

    def search(self, destination: str) -> list[Place]:
        return list(self._catalogue.get(destination.strip().casefold(), []))


def _place(slug: str, name: str) -> Place:
    return Place(id=slug, name=name, image_url=f"https://picsum.photos/seed/{slug}/400/300")


# Seeded default until a places provider is chosen.
SEED_CATALOGUE = {
    "lisbon": [_place("alfama", "Alfama"), _place("belem-tower", "Belém Tower"), _place("lx-factory", "LX Factory")],
    "paris": [_place("louvre", "Louvre Museum"), _place("montmartre", "Montmartre")],
    "oslo": [_place("vigeland-park", "Vigeland Park"), _place("opera-house", "Oslo Opera House")],
}
