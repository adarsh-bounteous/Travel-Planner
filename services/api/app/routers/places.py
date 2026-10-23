from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import StringConstraints

from app.places.search import Place, PlaceSearch
from app.routers.deps import get_current_user, get_places

router = APIRouter(prefix="/places")


@router.get("")
def search_places(
    destination: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)],
    _owner: str = Depends(get_current_user),
    places: PlaceSearch = Depends(get_places),
) -> list[Place]:
    return places.search(destination)
