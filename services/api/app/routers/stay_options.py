from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import Field

from app.auth.identity import IdentityProvider
from app.routers.auth import get_identity
from app.routers.deps import get_current_user, get_stay_providers, get_trips
from app.routers.trips import NOT_FOUND, _load
from app.stays.options import Amenity, PropertyType, StayCriteria, StayOptions, StayProvider, search_stays
from app.stays.shortlist import Shortlist, build_shortlist
from app.trips.store import TripStore

router = APIRouter(prefix="/trips")


@router.get("/{trip_id}/stays/{stay_id}/options")
def stay_options(
    trip_id: str,
    stay_id: str,
    property_type: PropertyType = "hotel",
    rooms: int = Query(1, ge=1, le=10),
    max_price: Decimal | None = Query(None, ge=0),
    location: str = "",
    amenities: list[Amenity] = Query([]),
    stars: list[Annotated[int, Field(ge=1, le=5)]] = Query([]),
    widen: bool = False,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    providers: list[StayProvider] = Depends(get_stay_providers),
) -> StayOptions:
    trip, _, _ = _load(trips, identity, user, trip_id)
    stay = next((s for s in trip.stays if s.id == stay_id), None)
    if stay is None:
        raise NOT_FOUND
    criteria = StayCriteria(
        property_type=property_type,
        rooms=rooms,
        max_price=max_price,
        location=location,
        amenities=amenities,
        stars=stars,
        widen=widen,
    )
    return search_stays(providers, stay, criteria)


@router.get("/{trip_id}/stays/{stay_id}/shortlist")
def stay_shortlist(
    trip_id: str,
    stay_id: str,
    property_type: PropertyType = "hotel",
    rooms: int = Query(1, ge=1, le=10),
    max_price: Decimal | None = Query(None, ge=0),
    location: str = "",
    amenities: list[Amenity] = Query([]),
    stars: list[Annotated[int, Field(ge=1, le=5)]] = Query([]),
    widen: bool = False,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    providers: list[StayProvider] = Depends(get_stay_providers),
) -> Shortlist:
    trip, _, _ = _load(trips, identity, user, trip_id)
    stay = next((s for s in trip.stays if s.id == stay_id), None)
    if stay is None:
        raise NOT_FOUND
    criteria = StayCriteria(
        property_type=property_type,
        rooms=rooms,
        max_price=max_price,
        location=location,
        amenities=amenities,
        stars=stars,
        widen=widen,
    )
    return build_shortlist(providers, stay, criteria)
