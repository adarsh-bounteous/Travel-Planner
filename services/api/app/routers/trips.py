import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends

from app.routers.auth import get_now
from app.routers.deps import ApiError, get_current_user, get_trips
from app.trips.store import Day, DayName, Trip, TripFields, TripStore, reconcile_days

router = APIRouter(prefix="/trips")

NOT_FOUND = ApiError(404, "not_found")
INVALID_DATES = ApiError(422, "invalid_dates")


class TripView(Trip):
    """A Trip as shown to one traveller. Only the owner can reach a trip until sharing exists."""

    is_owner: bool = True


def _days(trip: Trip, start: date | None, end: date | None) -> list[Day]:
    try:
        return reconcile_days(start, end, trip.days)
    except ValueError:
        raise INVALID_DATES from None


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
) -> TripView:
    trip = Trip(id=uuid.uuid4().hex, updated_at=now, **body.model_dump())
    trip.days = _days(trip, trip.start_date, trip.end_date)
    trips.save_trip(owner, trip)
    return TripView(**trip.model_dump())


@router.get("/{trip_id}")
def get_trip(
    trip_id: str, owner: str = Depends(get_current_user), trips: TripStore = Depends(get_trips)
) -> TripView:
    trip = trips.get_trip(owner, trip_id)
    if trip is None:
        raise NOT_FOUND  # same answer for another traveller's trip and one that never existed
    if not trip.days and trip.start_date and trip.end_date:
        trip = trip.model_copy(update={"days": _days(trip, trip.start_date, trip.end_date)})  # saved before days existed; not written
    return TripView(**trip.model_dump())


@router.put("/{trip_id}")
def update_trip(
    trip_id: str,
    body: TripFields,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    now: datetime = Depends(get_now),
) -> TripView:
    existing = trips.get_trip(owner, trip_id)
    if existing is None:
        raise NOT_FOUND
    # The body cannot carry days, options or currency: keep the stored ones.
    days = _days(existing, body.start_date, body.end_date)
    trip = existing.model_copy(update={**body.model_dump(), "days": days, "updated_at": now})
    trips.save_trip(owner, trip)
    return TripView(**trip.model_dump())


@router.put("/{trip_id}/days/{day_date}")
def rename_day(
    trip_id: str,
    day_date: date,
    body: DayName,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = trips.get_trip(owner, trip_id)
    if trip is None:
        raise NOT_FOUND
    if not trip.days:
        trip.days = _days(trip, trip.start_date, trip.end_date)
    day = next((d for d in trip.days if d.date == day_date), None)
    if day is None:
        raise NOT_FOUND
    day.name = body.name
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return TripView(**trip.model_dump())


@router.delete("/{trip_id}", status_code=204)
def delete_trip(
    trip_id: str, owner: str = Depends(get_current_user), trips: TripStore = Depends(get_trips)
) -> None:
    if trips.get_trip(owner, trip_id) is None:
        raise NOT_FOUND
    trips.delete_trip(owner, trip_id)
