import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import StringConstraints

from app.places.search import Place, PlaceSearch
from app.routers.deps import get_current_user, get_places

router = APIRouter(prefix="/places")


def _fold(text: str) -> str:
    """Lower-case without accents, so "belem" finds "Belém"."""
    decomposed = unicodedata.normalize("NFKD", text.strip().casefold())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


@router.get("")
def search_places(
    destination: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)],
    q: str | None = None,
    _owner: str = Depends(get_current_user),
    places: PlaceSearch = Depends(get_places),
) -> list[Place]:
    found = places.search(destination)
    return [p for p in found if q is None or _fold(q) in _fold(p.name)]
