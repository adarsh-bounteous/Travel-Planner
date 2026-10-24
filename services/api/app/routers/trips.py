import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends

from app.routers.auth import get_now
from app.routers.deps import ApiError, get_current_user, get_recommendations, get_trips
from app.trips.recommendations import Recommendation, RecommendationSource
from app.trips.store import (
    Activity,
    ActivityFields,
    ActivityMove,
    Day,
    DayName,
    Reminder,
    ReminderFields,
    Trip,
    TripFields,
    TripStore,
    can_edit_trip,
    reconcile_days,
    visible_reminders,
)

router = APIRouter(prefix="/trips")

MAX_REMINDERS = 200  # keeps the Trip item well under DynamoDB's 400 KB limit

MAX_ACTIVITIES = 200  # keeps the Trip item well under DynamoDB's 400 KB limit

NOT_FOUND = ApiError(404, "not_found")
INVALID_DATES = ApiError(422, "invalid_dates")
INVALID_REMINDER = ApiError(422, "invalid_reminder")
INVALID_ACTIVITY = ApiError(422, "invalid_activity")


class TripView(Trip):
    """A Trip as shown to one traveller. Only the owner can reach a trip until sharing exists."""

    is_owner: bool = True
    can_edit: bool = True


def _view(trip: Trip, user_id: str) -> TripView:
    """The trip as `user_id` sees it. Only the owner can reach a trip until sharing exists."""
    data = {**trip.model_dump(), "reminders": visible_reminders(trip)}
    return TripView(**data, can_edit=can_edit_trip(trip, user_id, user_id))


def _editable_trip(trips: TripStore, owner: str, trip_id: str) -> Trip:
    trip = trips.get_trip(owner, trip_id)
    if trip is None:
        raise NOT_FOUND
    if not can_edit_trip(trip, owner, owner):
        raise ApiError(403, "forbidden")
    return trip


def _check_reminder(trip: Trip, body: ReminderFields) -> date | None:
    """The day of the chosen option (None for the whole trip). Raises when the note cannot go on this trip."""
    option_date = None
    if body.option_id is not None:
        option = next((o for o in trip.options if o.id == body.option_id), None)
        if option is None:
            raise INVALID_REMINDER
        option_date = option.date
    if body.date not in {d.date for d in trip.days}:
        raise INVALID_REMINDER
    return option_date


def _save_reminders(trips: TripStore, owner: str, trip: Trip, reminders: list[Reminder], now: datetime) -> TripView:
    trip.reminders = reminders
    trip.reminders = visible_reminders(trip)  # drop stale activity notes so they cannot reappear
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, owner)


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
    return _view(trip, owner)


@router.get("/{trip_id}")
def get_trip(
    trip_id: str, owner: str = Depends(get_current_user), trips: TripStore = Depends(get_trips)
) -> TripView:
    trip = trips.get_trip(owner, trip_id)
    if trip is None:
        raise NOT_FOUND  # same answer for another traveller's trip and one that never existed
    if not trip.days and trip.start_date and trip.end_date:
        trip = trip.model_copy(update={"days": _days(trip, trip.start_date, trip.end_date)})  # saved before days existed; not written
    return _view(trip, owner)


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
    return _view(trip, owner)


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
    return _view(trip, owner)


@router.post("/{trip_id}/reminders", status_code=201)
def add_reminder(
    trip_id: str,
    body: ReminderFields,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _editable_trip(trips, owner, trip_id)
    option_date = _check_reminder(trip, body)
    if len(trip.reminders) >= MAX_REMINDERS:
        raise INVALID_REMINDER
    reminder = Reminder(id=uuid.uuid4().hex, option_date=option_date, **body.model_dump())
    return _save_reminders(trips, owner, trip, [*trip.reminders, reminder], now)


@router.put("/{trip_id}/reminders/{reminder_id}")
def update_reminder(
    trip_id: str,
    reminder_id: str,
    body: ReminderFields,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _editable_trip(trips, owner, trip_id)
    if reminder_id not in {r.id for r in visible_reminders(trip)}:
        raise NOT_FOUND
    option_date = _check_reminder(trip, body)
    changed = Reminder(id=reminder_id, option_date=option_date, **body.model_dump())
    reminders = [changed if r.id == reminder_id else r for r in trip.reminders]
    return _save_reminders(trips, owner, trip, reminders, now)


@router.delete("/{trip_id}/reminders/{reminder_id}")
def delete_reminder(
    trip_id: str,
    reminder_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _editable_trip(trips, owner, trip_id)
    if reminder_id not in {r.id for r in visible_reminders(trip)}:
        raise NOT_FOUND
    reminders = [r for r in trip.reminders if r.id != reminder_id]
    return _save_reminders(trips, owner, trip, reminders, now)


def _save_activities(
    trips: TripStore, owner: str, trip: Trip, activities: list[Activity], now: datetime
) -> TripView:
    trip.activities = activities
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, owner)


def _check_activity_day(trip: Trip, day: date) -> None:
    if day not in {d.date for d in trip.days}:
        raise INVALID_ACTIVITY


@router.get("/{trip_id}/days/{day_date}/recommendations")
def day_recommendations(
    trip_id: str,
    day_date: date,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    source: RecommendationSource = Depends(get_recommendations),
) -> list[Recommendation]:
    trip = _editable_trip(trips, owner, trip_id)
    if not trip.destination:
        return []
    on_day = {a.name for a in trip.activities if a.date == day_date}
    return [r for r in source.for_destination(trip.destination) if r.name not in on_day]


@router.post("/{trip_id}/activities", status_code=201)
def add_activity(
    trip_id: str,
    body: ActivityFields,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _editable_trip(trips, owner, trip_id)
    _check_activity_day(trip, body.date)
    if len(trip.activities) >= MAX_ACTIVITIES:
        raise INVALID_ACTIVITY
    activity = Activity(id=uuid.uuid4().hex, **body.model_dump())
    return _save_activities(trips, owner, trip, [*trip.activities, activity], now)


@router.put("/{trip_id}/activities/{activity_id}")
def move_activity(
    trip_id: str,
    activity_id: str,
    body: ActivityMove,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _editable_trip(trips, owner, trip_id)
    if activity_id not in {a.id for a in trip.activities}:
        raise NOT_FOUND
    _check_activity_day(trip, body.date)
    moved = [
        a.model_copy(update={"date": body.date}) if a.id == activity_id else a
        for a in trip.activities
    ]
    return _save_activities(trips, owner, trip, moved, now)


@router.delete("/{trip_id}/activities/{activity_id}")
def remove_activity(
    trip_id: str,
    activity_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _editable_trip(trips, owner, trip_id)
    if activity_id not in {a.id for a in trip.activities}:
        raise NOT_FOUND
    kept = [a for a in trip.activities if a.id != activity_id]
    return _save_activities(trips, owner, trip, kept, now)


@router.delete("/{trip_id}", status_code=204)
def delete_trip(
    trip_id: str, owner: str = Depends(get_current_user), trips: TripStore = Depends(get_trips)
) -> None:
    if trips.get_trip(owner, trip_id) is None:
        raise NOT_FOUND
    trips.delete_trip(owner, trip_id)
