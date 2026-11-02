import unicodedata
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import StringConstraints

from datetime import datetime

from app.config import Settings, get_settings, session_secret
from app.places.commons import PlacePhotos
from app.places.destination_search import (
    DestinationSearchResult,
    LiveDestinationSearch,
    search_destinations,
)
from app.places.search import Category, Place, PlaceSearch, PlaceType, Price
from app.routers.auth import get_now
from app.routers.deps import get_destination_search, get_place_photos, get_places

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
    category: Category | None = None,
    places: PlaceSearch = Depends(get_places),
    photos: PlacePhotos = Depends(get_place_photos),
) -> list[Place]:
    filtered = [
        p
        for p in places.search(destination)
        if (q is None or _fold(q) in _fold(p.name))
        and (place_type is None or p.place_type == place_type)
        and (price is None or p.price == price)
        and (category is None or p.category == category)
    ]
    return photos.attach(filtered)


@router.get("/search")
def search_destination_matches(
    q: str = "",
    live_search: LiveDestinationSearch = Depends(get_destination_search),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(get_now),
) -> DestinationSearchResult:
    """Cities and towns for a destination picker: starter places first, then live ones with a signed id."""
    return search_destinations(q, live_search, settings.is_live("places"), session_secret(), now)
