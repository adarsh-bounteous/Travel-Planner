import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import StringConstraints

from app.places.search import Place, PlaceSearch, PlaceType, Price
from app.routers.deps import get_places

# Read-only seeded catalogue, so a signed-out visitor can browse it and be asked to sign in on Save.
router = APIRouter(prefix="/places")


def _fold(text: str) -> str:
    """Lower-case without accents, so "belem" finds "Belém"."""
    decomposed = unicodedata.normalize("NFKD", text.strip().casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


@router.get("")
def search_places(
    destination: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)],
    q: str | None = None,
    place_type: PlaceType | None = None,
    price: Price | None = None,
    places: PlaceSearch = Depends(get_places),
) -> list[Place]:
    return [
        p
        for p in places.search(destination)
        if (q is None or _fold(q) in _fold(p.name))
        and (place_type is None or p.place_type == place_type)
        and (price is None or p.price == price)
    ]
