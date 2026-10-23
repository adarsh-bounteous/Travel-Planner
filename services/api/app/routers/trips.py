import uuid
from datetime import datetime

from fastapi import APIRouter, Depends

from app.routers.auth import get_now
from app.routers.deps import ApiError, get_current_user, get_trips
from app.trips.store import Trip, TripFields, TripStore

router = APIRouter(prefix="/trips")

NOT_FOUND = ApiError(404, "not_found")


@router.get("")
def list_trips(
    owner: str = Depends(get_current_user), trips: TripStore = Depends(get_trips)
) -> list[Trip]:
    return trips.list_trips(owner)


@router.post("", status_code=201)
def create_trip(
    body: TripFields,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    now: datetime = Depends(get_now),
) -> Trip:
    trip = Trip(id=uuid.uuid4().hex, updated_at=now, **body.model_dump())
    trips.save_trip(owner, trip)
    return trip


@router.get("/{trip_id}")
def get_trip(
    trip_id: str, owner: str = Depends(get_current_user), trips: TripStore = Depends(get_trips)
) -> Trip:
    trip = trips.get_trip(owner, trip_id)
    if trip is None:
        raise NOT_FOUND  # same answer for another traveller's trip and one that never existed
    return trip


@router.put("/{trip_id}")
def update_trip(
    trip_id: str,
    body: TripFields,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    now: datetime = Depends(get_now),
) -> Trip:
    if trips.get_trip(owner, trip_id) is None:
        raise NOT_FOUND
    trip = Trip(id=trip_id, updated_at=now, **body.model_dump())
    trips.save_trip(owner, trip)
    return trip
