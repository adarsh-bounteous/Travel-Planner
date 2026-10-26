from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.auth.identity import IdentityProvider
from app.routers.auth import get_identity, get_now
from app.routers.deps import get_current_user, get_rates, get_stay_providers, get_trips
from app.routers.trips import INVALID_STAY, NOT_FOUND, TripView, _editable_trip, _load, _save_stays
from app.stays.options import Amenity, PropertyType, StayCriteria, StayOptions, StayProvider, search_stays
from app.stays.shortlist import Shortlist, build_shortlist
from app.trips.rates import RateSource
from app.trips.store import ChosenStay, TripStore

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


class ChooseStay(BaseModel):
    property_id: str


@router.put("/{trip_id}/stays/{stay_id}/chosen")
def choose_stay(
    trip_id: str,
    stay_id: str,
    body: ChooseStay,
    property_type: PropertyType = "hotel",
    rooms: int = Query(1, ge=1, le=10),
    max_price: Decimal | None = Query(None, ge=0),
    location: str = "",
    amenities: list[Amenity] = Query([]),
    stars: list[Annotated[int, Field(ge=1, le=5)]] = Query([]),
    widen: bool = False,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    providers: list[StayProvider] = Depends(get_stay_providers),
    now: datetime = Depends(get_now),
) -> TripView:
    """Choose a stay from the shortlist; its price and booking link are taken from the rebuilt shortlist."""
    trip, owner = _editable_trip(trips, identity, user, trip_id)
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
    shortlisted = next(
        (s.property for s in build_shortlist(providers, stay, criteria).stays if s.property.id == body.property_id),
        None,
    )
    if shortlisted is None:
        raise INVALID_STAY
    offer = min(shortlisted.offers, key=lambda o: o.total)
    chosen = ChosenStay(
        property_id=shortlisted.id,
        name=shortlisted.name,
        provider=offer.provider,
        url=offer.url,
        total=offer.total,
        currency=offer.currency,
    )
    stays = [s.model_copy(update={"chosen": chosen}) if s.id == stay_id else s for s in trip.stays]
    return _save_stays(trips, rates, user, owner, trip, stays, now)


@router.delete("/{trip_id}/stays/{stay_id}/chosen")
def clear_chosen_stay(
    trip_id: str,
    stay_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    if stay_id not in {s.id for s in trip.stays}:
        raise NOT_FOUND
    stays = [s.model_copy(update={"chosen": None}) if s.id == stay_id else s for s in trip.stays]
    return _save_stays(trips, rates, user, owner, trip, stays, now)
