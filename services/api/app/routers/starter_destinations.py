from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.routers.deps import get_current_user
from app.trips.starter_destinations import (
    STARTER_DESTINATIONS,
    StarterPlace,
    content_for,
)

# Read-only seeded catalogue: the same list feeds the dropdowns and the content, so nothing offered is empty.
router = APIRouter(prefix="/starter-destinations")


class CountryView(BaseModel):
    name: str
    places: list[str]


@router.get("")
def list_destinations(owner: str = Depends(get_current_user)) -> list[CountryView]:
    return [
        CountryView(name=c.name, places=[p.name for p in c.places]) for c in STARTER_DESTINATIONS
    ]


@router.get("/{country}/{place}")
def place_content(
    country: str, place: str, owner: str = Depends(get_current_user)
) -> StarterPlace:
    content = content_for(country, place)
    if content is None:
        raise HTTPException(404, f"no starter content for {place} in {country}")
    return content
