import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends

from app.auth.identity import IdentityProvider
from app.dining.options import RestaurantProvider
from app.dining.shortlist import build_shortlist
from app.routers.auth import get_identity, get_now
from app.routers.deps import get_current_user, get_profiles, get_rates, get_restaurant_providers, get_trips
from app.routers.restaurant_options import _matches
from app.routers.trips import (
    ALREADY_ON_TRIP,
    INVALID_RESTAURANT,
    NOT_FOUND,
    TripView,
    _editable_trip,
    _view,
)
from app.trips.profile_store import ProfileStore
from app.trips.rates import RateSource
from app.trips.store import (
    RestaurantPick,
    RestaurantPickFields,
    RestaurantPickMove,
    Trip,
    TripStore,
)

router = APIRouter(prefix="/trips")

MAX_RESTAURANTS = 40  # keeps the Trip item well under DynamoDB's 400 KB limit


def _check_day(trip: Trip, day: date | None) -> None:
    if day is not None and day not in {d.date for d in trip.days}:
        raise INVALID_RESTAURANT


def _save_restaurants(
    trips: TripStore,
    rates: RateSource,
    user: str,
    owner: str,
    trip: Trip,
    restaurants: list[RestaurantPick],
    now: datetime,
) -> TripView:
    trip.restaurants = restaurants
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, user, owner)


@router.post("/{trip_id}/restaurants", status_code=201)
def pick_restaurant(
    trip_id: str,
    body: RestaurantPickFields,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    profiles: ProfileStore = Depends(get_profiles),
    providers: list[RestaurantProvider] = Depends(get_restaurant_providers),
    now: datetime = Depends(get_now),
) -> TripView:
    """Pick a restaurant from the shortlist; its price, currency and link come from the rebuilt shortlist."""
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    _check_day(trip, body.date)
    if len(trip.restaurants) >= MAX_RESTAURANTS:
        raise INVALID_RESTAURANT
    _, profile, filters, found = _matches(trips, identity, profiles, providers, user, trip_id)
    entry = next(
        (
            e.restaurant
            for e in build_shortlist(found, trip, filters, profile.tastes).entries
            if (e.restaurant.name, e.restaurant.city) == (body.name, body.city)
        ),
        None,
    )
    if entry is None:
        raise INVALID_RESTAURANT
    if any((p.name, p.city) == (entry.name, entry.city) for p in trip.restaurants):
        raise ALREADY_ON_TRIP
    pick = RestaurantPick(
        id=uuid.uuid4().hex,
        name=entry.name,
        city=entry.city,
        cuisine=entry.cuisine,
        typical_price=entry.typical_price,
        currency=entry.currency,
        url=entry.url,
        date=body.date,
        meal=body.meal,
    )
    return _save_restaurants(trips, rates, user, owner, trip, [*trip.restaurants, pick], now)


@router.put("/{trip_id}/restaurants/{pick_id}")
def move_restaurant(
    trip_id: str,
    pick_id: str,
    body: RestaurantPickMove,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    if pick_id not in {p.id for p in trip.restaurants}:
        raise NOT_FOUND
    _check_day(trip, body.date)
    moved = [
        p.model_copy(update={"date": body.date, "meal": body.meal}) if p.id == pick_id else p
        for p in trip.restaurants
    ]
    return _save_restaurants(trips, rates, user, owner, trip, moved, now)
