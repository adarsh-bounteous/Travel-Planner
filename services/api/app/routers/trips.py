import logging
import re
import secrets
import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.identity import IdentityProvider
from app.config import Settings, get_settings
from app.routers.auth import get_identity, get_now
from app.routers.deps import (
    ApiError,
    get_current_user,
    get_invite_sender,
    get_profiles,
    get_rates,
    get_recommendations,
    get_trips,
)
from app.trips.cost import CostSummary, summarise_cost
from app.trips.invites import InviteSender
from app.trips.profile_store import ProfileStore
from app.trips.rates import RateSource
from app.trips.recommendations import Recommendation, RecommendationSource
from app.trips.requirements import TravellerRequirement, medical_for, visa_for
from app.trips.store import (
    Activity,
    ActivityFields,
    ActivityMove,
    CompanionDetails,
    Day,
    DayName,
    Editor,
    Invite,
    Reminder,
    ReminderFields,
    ShareLink,
    Traveller,
    TravellerFields,
    Trip,
    TripCreate,
    TripFields,
    TripPlace,
    TripPlaceFields,
    TripStore,
    can_edit_trip,
    reconcile_days,
    visible_reminders,
)

router = APIRouter(prefix="/trips")
logger = logging.getLogger(__name__)

MAX_REMINDERS = 200  # keeps the Trip item well under DynamoDB's 400 KB limit

MAX_ACTIVITIES = 200  # keeps the Trip item well under DynamoDB's 400 KB limit

MAX_PLACES = 200  # keeps the Trip item well under DynamoDB's 400 KB limit

MAX_TRAVELLERS = 50  # keeps the Trip item well under DynamoDB's 400 KB limit

MAX_EDITORS = 50  # keeps the Trip item well under DynamoDB's 400 KB limit

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")  # same rule as the auth routes

NOT_FOUND = ApiError(404, "not_found")
FORBIDDEN = ApiError(403, "forbidden")
INVALID_DATES = ApiError(422, "invalid_dates")
INVALID_REMINDER = ApiError(422, "invalid_reminder")
INVALID_ACTIVITY = ApiError(422, "invalid_activity")
ALREADY_ON_TRIP = ApiError(409, "already_on_trip")
INVALID_PLACE = ApiError(422, "invalid_place")
INVALID_TRAVELLER = ApiError(422, "invalid_traveller")
INVALID_EMAIL = ApiError(422, "invalid_email")
ALREADY_EDITOR = ApiError(409, "already_editor")


class EditorView(BaseModel):
    """An editor as the owner sees them. The invite link is relative; the web adds its origin."""

    email: str
    accepted: bool
    invite_url: str


class EditorEmail(BaseModel):
    email: str


class TripView(Trip):
    """A Trip as shown to one traveller: the owner, or an editor who can change the plan only."""

    editors: list[EditorView] = []  # empty unless the viewer is the owner
    is_owner: bool = True
    can_edit: bool = True
    cost: CostSummary | None = None
    share_url: str | None = None  # relative; owner only. The raw share_token is never sent


def _view(trip: Trip, rates: RateSource, user_id: str, owner_id: str | None = None) -> TripView:
    """The trip as `user_id` sees it. Editors never see the access list or invite tokens."""
    is_owner = owner_id is None or user_id == owner_id
    editors = (
        [
            EditorView(email=e.email, accepted=e.accepted, invite_url=f"/invite/{e.token}")
            for e in trip.editors
        ]
        if is_owner
        else []
    )
    travellers = (
        trip.travellers
        if is_owner
        else [Traveller(id=t.id, name=t.name) for t in trip.travellers]  # companion details are the owner's alone
    )
    data = {
        **trip.model_dump(),
        "travellers": travellers,
        "reminders": visible_reminders(trip),
        "editors": editors,
        "share_token": None,
    }
    return TripView(
        **data,
        share_url=f"/trips/read-only/{trip.share_token}" if is_owner and trip.share_token else None,
        cost=summarise_cost(trip, rates),
        is_owner=is_owner,
        can_edit=can_edit_trip(trip, user_id, user_id) if is_owner else True,  # a non-owner got here as a checked editor
    )


def _load(
    trips: TripStore, identity: IdentityProvider, user_id: str, trip_id: str
) -> tuple[Trip, str, bool]:
    """(trip, owner id, is owner). Your own trip first; else an accepted editor of someone else's.

    Anything else is NOT_FOUND, the same answer as a trip that never existed.
    """
    trip = trips.get_trip(user_id, trip_id)
    if trip is not None:
        return trip, user_id, True
    email = identity.email_for(user_id)
    for owner_id, shared_id in trips.shared_trips(email.strip().lower()):
        if shared_id != trip_id:
            continue
        shared = trips.get_trip(owner_id, trip_id)
        if shared is not None and can_edit_trip(shared, user_id, owner_id, email):
            return shared, owner_id, False
    raise NOT_FOUND


def _owned_trip(trips: TripStore, identity: IdentityProvider, user_id: str, trip_id: str) -> Trip:
    """Owner only: 404 for a stranger, 403 for an editor."""
    trip, _, is_owner = _load(trips, identity, user_id, trip_id)
    if not is_owner:
        raise FORBIDDEN
    return trip


def _editable_trip(
    trips: TripStore, identity: IdentityProvider, user_id: str, trip_id: str
) -> tuple[Trip, str]:
    """The trip and its owner's id, for the owner or an accepted editor."""
    trip, owner_id, is_owner = _load(trips, identity, user_id, trip_id)
    email = None if is_owner else identity.email_for(user_id)
    if not can_edit_trip(trip, user_id, owner_id, email):
        raise FORBIDDEN
    return trip, owner_id


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


def _save_reminders(
    trips: TripStore,
    rates: RateSource,
    user: str,
    owner: str,
    trip: Trip,
    reminders: list[Reminder],
    now: datetime,
) -> TripView:
    trip.reminders = reminders
    trip.reminders = visible_reminders(trip)  # drop stale activity notes so they cannot reappear
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, user, owner)


def _days(trip: Trip, start: date | None, end: date | None) -> list[Day]:
    try:
        return reconcile_days(start, end, trip.days)
    except ValueError:
        raise INVALID_DATES from None


class TripListItem(Trip):
    shared: bool = False  # shared with this traveller by another traveller


def _updated_key(trip: Trip) -> datetime:
    """Sort key: trips saved before updated_at existed sort last; naive times are read as UTC."""
    at = trip.updated_at
    if at is None:
        return datetime.min.replace(tzinfo=UTC)
    return at if at.tzinfo else at.replace(tzinfo=UTC)


@router.get("")
def list_trips(
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
) -> list[TripListItem]:
    mine = [TripListItem(**t.model_dump(exclude={"share_token"})) for t in trips.list_trips(user)]
    email = identity.email_for(user).strip().lower()
    shared = []
    for owner_id, trip_id in trips.shared_trips(email):
        trip = trips.get_trip(owner_id, trip_id)
        if trip is not None and can_edit_trip(trip, user, owner_id, email):  # stale index rows are skipped
            shared.append(TripListItem(**trip.model_dump(exclude={"editors", "share_token"}), shared=True))
    return sorted([*mine, *shared], key=_updated_key, reverse=True)


@router.post("", status_code=201)
def create_trip(
    body: TripCreate,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = Trip(id=uuid.uuid4().hex, updated_at=now, **body.model_dump())
    trip.days = _days(trip, trip.start_date, trip.end_date)
    trips.save_trip(owner, trip)
    return _view(trip, rates, owner)


@router.get("/{trip_id}")
def get_trip(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
) -> TripView:
    trip, owner, _ = _load(trips, identity, user, trip_id)  # same 404 for another traveller's trip and one that never existed
    if not trip.days and trip.start_date and trip.end_date:
        trip = trip.model_copy(update={"days": _days(trip, trip.start_date, trip.end_date)})  # saved before days existed; not written
    return _view(trip, rates, user, owner)


@router.put("/{trip_id}")
def update_trip(
    trip_id: str,
    body: TripFields,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    existing = _owned_trip(trips, identity, owner, trip_id)
    # The body cannot carry days, options or currency: keep the stored ones.
    days = _days(existing, body.start_date, body.end_date)
    trip = existing.model_copy(update={**body.model_dump(), "days": days, "updated_at": now})
    trips.save_trip(owner, trip)
    return _view(trip, rates, owner)


@router.put("/{trip_id}/days/{day_date}")
def rename_day(
    trip_id: str,
    day_date: date,
    body: DayName,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    if not trip.days:
        trip.days = _days(trip, trip.start_date, trip.end_date)
    day = next((d for d in trip.days if d.date == day_date), None)
    if day is None:
        raise NOT_FOUND
    day.name = body.name
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, owner)


@router.post("/{trip_id}/travellers", status_code=201)
def add_traveller(
    trip_id: str,
    body: TravellerFields,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    if len(trip.travellers) >= MAX_TRAVELLERS:
        raise INVALID_TRAVELLER
    trip.travellers = [*trip.travellers, Traveller(id=uuid.uuid4().hex, name=body.name)]
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, owner)


def _traveller(trip: Trip, traveller_id: str) -> Traveller:
    for traveller in trip.travellers:
        if traveller.id == traveller_id:
            return traveller
    raise NOT_FOUND


@router.put("/{trip_id}/travellers/{traveller_id}")
def update_traveller_details(
    trip_id: str,
    traveller_id: str,
    body: CompanionDetails,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    traveller = _traveller(trip, traveller_id)
    traveller.citizenship = body.citizenship
    traveller.residence = body.residence
    traveller.health_status = body.health_status
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, owner)


@router.delete("/{trip_id}/travellers/{traveller_id}")
def remove_traveller(
    trip_id: str,
    traveller_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    traveller = _traveller(trip, traveller_id)
    trip.travellers = [t for t in trip.travellers if t is not traveller]
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, owner)


@router.get("/{trip_id}/requirements")
def trip_requirements(
    trip_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    profiles: ProfileStore = Depends(get_profiles),
    identity: IdentityProvider = Depends(get_identity),
) -> list[TravellerRequirement]:
    trip = _owned_trip(trips, identity, owner, trip_id)
    profile = profiles.get_profile(owner)  # read only: the owner's own answers
    people = [
        (
            None,
            "You (owner)",
            profile.citizenship if profile else "",
            profile.residence if profile else "",
            profile.health_status if profile else "",
        ),
        *((t.id, t.name, t.citizenship, t.residence, t.health_status) for t in trip.travellers),
    ]
    return [
        TravellerRequirement(
            traveller_id=tid,
            name=name,
            citizenship=cit,
            residence=res,
            health_status=health,
            visa=visa_for(trip.destination, cit, res),
            medical=medical_for(health),
        )
        for tid, name, cit, res, health in people
    ]


@router.post("/{trip_id}/editors", status_code=201)
def invite_editor(
    trip_id: str,
    body: EditorEmail,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    sender: InviteSender = Depends(get_invite_sender),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    email = body.email.strip().lower()
    if not _EMAIL.match(email) or len(trip.editors) >= MAX_EDITORS:
        raise INVALID_EMAIL
    if any(e.email == email for e in trip.editors):
        raise ALREADY_EDITOR
    token = secrets.token_urlsafe(24)
    trip.editors = [*trip.editors, Editor(email=email, token=token)]
    trip.updated_at = now
    trips.save_invite(Invite(token=token, owner_id=owner, trip_id=trip.id, email=email))
    trips.save_trip(owner, trip)
    try:
        sender.send(email, trip.name, f"{settings.web_origin}/invite/{token}")
    except Exception:  # best effort: the invite is saved, and the owner can copy its link
        logger.exception("could not send the editor invite email")
    return _view(trip, rates, owner)


@router.delete("/{trip_id}/editors/{email}")
def revoke_editor(
    trip_id: str,
    email: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    email = email.strip().lower()
    editor = next((e for e in trip.editors if e.email == email), None)
    if editor is None:
        raise NOT_FOUND
    trip.editors = [e for e in trip.editors if e.email != email]
    trip.updated_at = now
    trips.save_trip(owner, trip)  # the Trip item decides access, so it goes first
    trips.delete_invite(editor.token)
    trips.unlink_editor(email, trip.id)
    return _view(trip, rates, owner)


@router.post("/{trip_id}/share-link", status_code=201)
def create_share_link(
    trip_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    if trip.share_token is None:  # one link per trip: creating again returns the same one
        trip.share_token = secrets.token_urlsafe(24)
        trip.updated_at = now
        trips.save_share_link(ShareLink(token=trip.share_token, owner_id=owner, trip_id=trip.id))
        trips.save_trip(owner, trip)
    return _view(trip, rates, owner)


@router.delete("/{trip_id}/share-link")
def revoke_share_link(
    trip_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    token, trip.share_token = trip.share_token, None
    if token is not None:
        trip.updated_at = now
        trips.save_trip(owner, trip)  # the Trip item decides access, so it goes first
        trips.delete_share_link(token)
    return _view(trip, rates, owner)


@router.post("/{trip_id}/reminders", status_code=201)
def add_reminder(
    trip_id: str,
    body: ReminderFields,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    option_date = _check_reminder(trip, body)
    if len(trip.reminders) >= MAX_REMINDERS:
        raise INVALID_REMINDER
    reminder = Reminder(id=uuid.uuid4().hex, option_date=option_date, **body.model_dump())
    return _save_reminders(trips, rates, user, owner, trip, [*trip.reminders, reminder], now)


@router.put("/{trip_id}/reminders/{reminder_id}")
def update_reminder(
    trip_id: str,
    reminder_id: str,
    body: ReminderFields,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    if reminder_id not in {r.id for r in visible_reminders(trip)}:
        raise NOT_FOUND
    option_date = _check_reminder(trip, body)
    changed = Reminder(id=reminder_id, option_date=option_date, **body.model_dump())
    reminders = [changed if r.id == reminder_id else r for r in trip.reminders]
    return _save_reminders(trips, rates, user, owner, trip, reminders, now)


@router.delete("/{trip_id}/reminders/{reminder_id}")
def delete_reminder(
    trip_id: str,
    reminder_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    if reminder_id not in {r.id for r in visible_reminders(trip)}:
        raise NOT_FOUND
    reminders = [r for r in trip.reminders if r.id != reminder_id]
    return _save_reminders(trips, rates, user, owner, trip, reminders, now)


def _save_activities(
    trips: TripStore,
    rates: RateSource,
    user: str,
    owner: str,
    trip: Trip,
    activities: list[Activity],
    now: datetime,
) -> TripView:
    trip.activities = activities
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, user, owner)


def _check_activity_day(trip: Trip, day: date) -> None:
    if day not in {d.date for d in trip.days}:
        raise INVALID_ACTIVITY


@router.get("/{trip_id}/days/{day_date}/recommendations")
def day_recommendations(
    trip_id: str,
    day_date: date,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    source: RecommendationSource = Depends(get_recommendations),
) -> list[Recommendation]:
    trip, _ = _editable_trip(trips, identity, user, trip_id)
    if not trip.destination:
        return []
    on_day = {a.name for a in trip.activities if a.date == day_date}
    return [r for r in source.for_destination(trip.destination) if r.name not in on_day]


@router.post("/{trip_id}/activities", status_code=201)
def add_activity(
    trip_id: str,
    body: ActivityFields,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    _check_activity_day(trip, body.date)
    if len(trip.activities) >= MAX_ACTIVITIES:
        raise INVALID_ACTIVITY
    activity = Activity(id=uuid.uuid4().hex, **body.model_dump())
    return _save_activities(trips, rates, user, owner, trip, [*trip.activities, activity], now)


@router.post("/{trip_id}/places", status_code=201)
def add_place(
    trip_id: str,
    body: TripPlaceFields,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    if any(p.place_id == body.place_id for p in trip.places):
        raise ALREADY_ON_TRIP
    if len(trip.places) >= MAX_PLACES:
        raise INVALID_PLACE
    trip.places = [*trip.places, TripPlace(id=uuid.uuid4().hex, **body.model_dump())]
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, user, owner)


@router.put("/{trip_id}/activities/{activity_id}")
def move_activity(
    trip_id: str,
    activity_id: str,
    body: ActivityMove,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    if activity_id not in {a.id for a in trip.activities}:
        raise NOT_FOUND
    _check_activity_day(trip, body.date)
    moved = [
        a.model_copy(update={"date": body.date}) if a.id == activity_id else a
        for a in trip.activities
    ]
    return _save_activities(trips, rates, user, owner, trip, moved, now)


@router.delete("/{trip_id}/activities/{activity_id}")
def remove_activity(
    trip_id: str,
    activity_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    if activity_id not in {a.id for a in trip.activities}:
        raise NOT_FOUND
    kept = [a for a in trip.activities if a.id != activity_id]
    return _save_activities(trips, rates, user, owner, trip, kept, now)


@router.delete("/{trip_id}", status_code=204)
def delete_trip(
    trip_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
) -> None:
    trip = _owned_trip(trips, identity, owner, trip_id)
    for editor in trip.editors:
        trips.delete_invite(editor.token)
        trips.unlink_editor(editor.email, trip_id)
    if trip.share_token is not None:
        trips.delete_share_link(trip.share_token)
    trips.delete_trip(owner, trip_id)
