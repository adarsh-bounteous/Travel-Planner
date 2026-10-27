from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.identity import IdentityProvider
from app.dining.options import (
    COUNTRY_CUISINE,
    DIET_TAGS,
    RELIGION_TAGS,
    DiningFilters,
    RestaurantOption,
    RestaurantProvider,
    gather_restaurants,
)
from app.routers.auth import get_identity, get_now
from app.routers.deps import get_current_user, get_profiles, get_restaurant_providers, get_trips
from app.routers.trips import _load, _owned_trip
from app.trips.profile_store import Profile, ProfileStore
from app.trips.store import TripStore

router = APIRouter(prefix="/trips")

DiningNeed = Literal["halal", "kosher", "gluten-free", "dairy-free", "nut-free"]


class DiningNeedsBody(BaseModel):
    needs: list[DiningNeed]


class FiltersApplied(BaseModel):
    profile: list[str]  # shown with the "From your profile" icon
    trip: list[str]  # shown as "Added for this trip only"


class RestaurantOptionsResponse(BaseModel):
    place: str
    home_cuisine: str
    options: list[RestaurantOption]
    filters_applied: FiltersApplied


def _need_label(need: str) -> str:
    return need.capitalize()


def _profile_filters(profile: Profile) -> DiningFilters:
    return DiningFilters(
        diet=profile.diet,
        religion=profile.religion,
        dining_style=profile.dining_style,
        price_level=profile.price_level,
        home_cuisine=COUNTRY_CUISINE.get(profile.residence, ""),
    )


def _profile_chips(profile: Profile) -> list[str]:
    chips = []
    if profile.diet.casefold() in DIET_TAGS:
        chips.append(profile.diet)
    if profile.religion.casefold() in RELIGION_TAGS:
        chips.append(profile.religion)
    if profile.dining_style:
        chips.append(profile.dining_style)
    if profile.price_level is not None:
        chips.append(f"Budget: {'$' * profile.price_level}")
    return chips


@router.get("/{trip_id}/restaurant-options")
def restaurant_options(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    profiles: ProfileStore = Depends(get_profiles),
    providers: list[RestaurantProvider] = Depends(get_restaurant_providers),
) -> RestaurantOptionsResponse:
    trip, owner_id, _ = _load(trips, identity, user, trip_id)
    # The owner's profile drives the filters, even when an editor is the one looking.
    profile = profiles.get_profile(owner_id) or Profile()
    filters = _profile_filters(profile).model_copy(update={"extra_needs": trip.dining_needs})
    found = gather_restaurants(providers, trip, filters)
    return RestaurantOptionsResponse(
        place=found.place,
        home_cuisine=filters.home_cuisine,
        options=found.options,
        filters_applied=FiltersApplied(
            profile=_profile_chips(profile), trip=[_need_label(n) for n in trip.dining_needs]
        ),
    )


@router.put("/{trip_id}/dining-needs")
def save_dining_needs(
    trip_id: str,
    body: DiningNeedsBody,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> DiningNeedsBody:
    trip = _owned_trip(trips, identity, user, trip_id)
    trip.dining_needs = list(dict.fromkeys(body.needs))
    trip.updated_at = now
    trips.save_trip(user, trip)
    return DiningNeedsBody(needs=trip.dining_needs)
