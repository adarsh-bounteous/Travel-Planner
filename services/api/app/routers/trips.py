import logging
import re
import secrets
import uuid
from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from app.auth.identity import IdentityProvider
from app.config import Settings, get_settings, session_secret
from app.routers.auth import get_identity, get_now
from app.routers.deps import (
    ApiError,
    get_backfill_resolver,
    get_current_user,
    get_destination_resolver,
    get_invite_sender,
    get_profiles,
    get_rates,
    get_recommendations,
    get_trips,
    get_visa_rules,
)
from app.locations.resolver import DestinationResolver, ResolvedLocation
from app.places.destination_search import verify_place_ref
from app.trips.destination import (
    ChosenDestination,
    DestinationStatus,
    chosen_destination,
    country_has_any_place,
    destination_status,
)
from app.trips.destination_conversion import convert_trip
from app.trips.destination_match import best_match
from app.trips.starter_destinations import fold
from app.trips.cost import CostSummary, summarise_cost
from app.trips.invites import InviteSender
from app.trips.medical import TravellerGuidance, guidance_for
from app.trips.medical import has_data as medical_has_data
from app.trips.profile_store import Profile, ProfileStore
from app.trips.rates import RateSource
from app.trips.recommendations import Recommendation, RecommendationSource
from app.trips.requirements import TravellerRequirement, medical_for
from app.trips.visa import (
    Person,
    VisaResult,
    VisaRuleSource,
    has_guidance,
    self_check_key,
    visa_result_for,
)
from app.trips.store import (
    Activity,
    ActivityFields,
    ActivityMove,
    ChosenSim,
    CompanionDetails,
    Day,
    DayName,
    Editor,
    InsurancePick,
    Invite,
    Reminder,
    ReminderFields,
    ShareLink,
    Stay,
    TransportPick,
    StayFields,
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
    stay_outside_trip,
    visible_reminders,
)

router = APIRouter(prefix="/trips")
logger = logging.getLogger(__name__)

MAX_REMINDERS = 200  # keeps the Trip item well under DynamoDB's 400 KB limit

MAX_STAYS = 50  # keeps the Trip item under DynamoDB's 400 KB limit
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
INVALID_STAY = ApiError(422, "invalid_stay")
INVALID_INSURANCE = ApiError(422, "invalid_insurance")
INVALID_TRANSPORT = ApiError(422, "invalid_transport")
INVALID_SIM = ApiError(422, "invalid_sim")
INVALID_RESTAURANT = ApiError(422, "invalid_restaurant")
ALREADY_ON_TRIP = ApiError(409, "already_on_trip")
VISA_HAS_DATA = ApiError(409, "visa_has_data")
INVALID_PLACE = ApiError(422, "invalid_place")
INVALID_TRAVELLER = ApiError(422, "invalid_traveller")
INVALID_EMAIL = ApiError(422, "invalid_email")
ALREADY_EDITOR = ApiError(409, "already_editor")
PLACE_NOT_FROM_SEARCH = ApiError(422, "place_not_from_search")


class EditorView(BaseModel):
    """An editor as the owner sees them. The invite link is relative; the web adds its origin."""

    email: str
    accepted: bool
    invite_url: str


class EditorEmail(BaseModel):
    email: str


class ShowItinerary(BaseModel):
    show: bool


class TripView(Trip):
    """A Trip as shown to one traveller: the owner, or an editor who can change the plan only."""

    editors: list[EditorView] = []  # empty unless the viewer is the owner
    is_owner: bool = True
    can_edit: bool = True
    cost: CostSummary | None = None
    share_url: str | None = None  # relative; owner only. The raw share_token is never sent
    unresolved_visas: list[str] = []  # owner only, on GET: names marked "I'll check myself" with still no data


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
        "share_itinerary": trip.share_itinerary if is_owner else False,
        "visa_self_checks": trip.visa_self_checks if is_owner else [],  # the owner's alone
    }
    return TripView(
        **data,
        share_url=f"/trips/read-only/{trip.share_token}" if is_owner and trip.share_token else None,
        cost=summarise_cost(trip, rates),
        is_owner=is_owner,
        can_edit=can_edit_trip(trip, user_id, user_id) if is_owner else True,  # a non-owner got here as a checked editor
    )


def _converted(trips: TripStore, owner_id: str, trip: Trip) -> Trip:
    """The trip with its destination converted and, if still unmatched, re-matched; saved once when it changes."""
    done = convert_trip(trip)
    if done.destination_unmatched and not done.country:
        done = _rematch_to_picked(trips, owner_id, done)
    if done is not trip:
        trips.save_trip(owner_id, done)
    return done


class _Picked(BaseModel):
    country: str
    place: str
    source: Literal["starter", "live"]
    location: ResolvedLocation | None = None  # set for a live pick: it travels in the signed ref


def _checked_destination(destination: str | None, place_ref: str | None, now: datetime) -> _Picked:
    """The place a request names, only if search returned it: a signed live id, or a starter place."""
    if place_ref:
        live = verify_place_ref(place_ref, session_secret(), now)
        if live is None or fold(destination or "") != fold(f"{live.name}, {live.country}"):
            raise PLACE_NOT_FROM_SEARCH
        return _Picked(country=live.country, place=live.name, source="live", location=live.location)
    match = best_match(destination)
    if match is None:
        raise PLACE_NOT_FROM_SEARCH
    return _Picked(country=match[0], place=match[1], source="starter")


def _qualifier_matches(text: str, location: ResolvedLocation) -> bool:
    """A second typed segment ("UP") names the pick's region by prefix or initials, or its country code."""
    wanted = fold(text)
    if not wanted:
        return True
    if wanted == fold(location.country_code):
        return True
    regions = [fold(part) for part in location.name.split(",")[1:]]
    initials = ["".join(word[0] for word in region.split()) for region in regions]
    return any(r.startswith(wanted) for r in regions) or wanted in initials


def _rematch_to_picked(trips: TripStore, owner_id: str, trip: Trip) -> Trip:
    """An unmatched old trip takes the one live place this traveller picked before that its text names."""
    first, _, rest = (trip.destination or "").partition(",")
    if not fold(first):
        return trip
    picks = {
        (fold(t.place), t.location.name): t
        for t in trips.list_trips(owner_id)
        if t.place_source == "live" and t.place and t.country and t.location is not None
    }
    found = [
        p
        for (name, _), p in picks.items()
        if name == fold(first) and _qualifier_matches(rest.split(",")[0], p.location)
    ]
    if len(found) != 1:
        return trip
    pick = found[0]
    return trip.model_copy(
        update={
            "country": pick.country,
            "place": pick.place,
            "location": pick.location,
            "place_source": "live",
            "destination": f"{pick.place}, {pick.country}",
            "destination_unmatched": False,
            "rematched_from": trip.destination,
        }
    )


def _located(trip: Trip, resolver: DestinationResolver) -> Trip:
    """The trip with `location` set from its destination; None when it cannot be resolved. Never raises."""
    location = None
    if trip.country or trip.place or trip.destination:
        try:
            location = resolver.resolve(trip.country, trip.place, trip.destination)
        except Exception:  # a resolver failure must never fail or block a save
            logger.warning("Destination resolution failed for trip %s", trip.id, exc_info=True)
    return trip.model_copy(update={"location": location})


def _rematched(existing: Trip, destination: str | None) -> dict:
    """A flagged trip whose destination now matches gets its country and place and loses the flag."""
    match = best_match(destination) if existing.destination_unmatched else None
    if match is None:
        return {}
    return {"country": match[0], "place": match[1], "destination_unmatched": False}


def _load(
    trips: TripStore, identity: IdentityProvider, user_id: str, trip_id: str
) -> tuple[Trip, str, bool]:
    """(trip, owner id, is owner). Your own trip first; else an accepted editor of someone else's.

    Anything else is NOT_FOUND, the same answer as a trip that never existed.
    """
    trip = trips.get_trip(user_id, trip_id)
    if trip is not None:
        return _converted(trips, user_id, trip), user_id, True
    email = identity.email_for(user_id)
    for owner_id, shared_id in trips.shared_trips(email.strip().lower()):
        if shared_id != trip_id:
            continue
        shared = trips.get_trip(owner_id, trip_id)
        if shared is not None and can_edit_trip(shared, user_id, owner_id, email):
            return _converted(trips, owner_id, shared), owner_id, False
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
    mine = [TripListItem(**t.model_dump(exclude={"share_token"})) for t in (_converted(trips, user, t) for t in trips.list_trips(user))]
    email = identity.email_for(user).strip().lower()
    shared = []
    for owner_id, trip_id in trips.shared_trips(email):
        trip = trips.get_trip(owner_id, trip_id)
        if trip is not None and can_edit_trip(trip, user, owner_id, email):  # stale index rows are skipped
            trip = _converted(trips, owner_id, trip)
            shared.append(TripListItem(**trip.model_dump(exclude={"editors", "share_token", "share_itinerary"}), shared=True))
    return sorted([*mine, *shared], key=_updated_key, reverse=True)


@router.post("", status_code=201)
def create_trip(
    body: TripCreate,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    now: datetime = Depends(get_now),
    resolver: DestinationResolver = Depends(get_destination_resolver),
) -> TripView:
    picked = _checked_destination(body.destination, body.place_ref, now)  # before anything is built, so a rejection saves nothing
    trip = Trip(
        id=uuid.uuid4().hex,
        updated_at=now,
        destination_converted=True,
        **body.model_dump(exclude={"place_ref"}),
    )
    trip.days = _days(trip, trip.start_date, trip.end_date)
    if picked.location is not None:  # a live pick carries its location, so the save makes no outside request
        trip = trip.model_copy(
            update={
                "destination": f"{picked.place}, {picked.country}",
                "country": picked.country,
                "place": picked.place,
                "place_source": "live",
                "location": picked.location,
            }
        )
    else:
        trip = _located(trip, resolver)
    trips.save_trip(owner, trip)
    return _view(trip, rates, owner)


def _backfill_location(trips: TripStore, owner_id: str, trip_id: str, resolver: DestinationResolver) -> None:
    """Resolve once and store it. Never raises; never changes the destination or updated_at."""
    try:
        current = trips.get_trip(owner_id, trip_id)
        if current is None or current.location is not None:  # deleted, or another open got there first
            return
        location = _located(current, resolver).location
        if location is None:
            return  # no match stays unstored, so a later open tries again
        fresh = trips.get_trip(owner_id, trip_id)  # re-read just before writing so a concurrent edit is not overwritten
        if fresh is not None and fresh.location is None:
            trips.save_trip(owner_id, fresh.model_copy(update={"location": location}))
    except Exception:
        logger.warning("Location backfill failed for trip %s", trip_id, exc_info=True)


@router.get("/{trip_id}")
def get_trip(
    trip_id: str,
    background: BackgroundTasks,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    profiles: ProfileStore = Depends(get_profiles),
    visa_rules: VisaRuleSource = Depends(get_visa_rules),
    identity: IdentityProvider = Depends(get_identity),
    resolver: DestinationResolver = Depends(get_backfill_resolver),
) -> TripView:
    trip, owner, is_owner = _load(trips, identity, user, trip_id)  # same 404 for another traveller's trip and one that never existed
    if trip.location is None and trip.country and trip.place:  # saved before locations existed, or one that could not be resolved
        background.add_task(_backfill_location, trips, owner, trip.id, resolver)  # runs after the response is sent
    if not trip.days and trip.start_date and trip.end_date:
        trip = trip.model_copy(update={"days": _days(trip, trip.start_date, trip.end_date)})  # saved before days existed; not written
    view = _view(trip, rates, user, owner)
    if is_owner:
        results = _visa_results(trip, profiles.get_profile(owner), visa_rules)
        view.unresolved_visas = [r.name for r in results if r.unresolved]
    return view


@router.put("/{trip_id}")
def update_trip(
    trip_id: str,
    body: TripFields,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
    resolver: DestinationResolver = Depends(get_destination_resolver),
) -> TripView:
    existing = _owned_trip(trips, identity, owner, trip_id)
    picked = (
        _checked_destination(body.destination, body.place_ref, now)
        if body.destination is not None and body.destination != existing.destination
        else None
    )
    # The body cannot carry days, options or currency: keep the stored ones.
    days = _days(existing, body.start_date, body.end_date)
    fields = body.model_dump(exclude={"place_ref"})
    if picked is not None and picked.location is not None:
        fields["destination"] = f"{picked.place}, {picked.country}"
    if "interests" not in body.model_fields_set:
        del fields["interests"]  # settings edits do not send interests: keep the stored ones
    for kept in ("owner_age", "risky_activities"):
        if kept not in body.model_fields_set:
            del fields[kept]  # settings edits do not send these either
    # A price quoted for other places, dates or ages must not stay in the total.
    priced = ("destination", "start_date", "end_date", "owner_age")
    cleared = any(k in fields and fields[k] != getattr(existing, k) for k in priced)
    # Stays are flagged only at a date change: a name or budget edit leaves the flags as they are.
    redated = (body.start_date, body.end_date) != (existing.start_date, existing.end_date)
    flagged = [
        s.model_copy(update={"outside_trip": stay_outside_trip(s, body.start_date, body.end_date)})
        for s in existing.stays
    ]
    trip = existing.model_copy(
        update={
            **fields,
            "days": days,
            "updated_at": now,
            **({"insurance": None} if cleared else {}),
            **({"stays": flagged} if redated else {}),
            **_rematched(existing, body.destination),
            **(
                {
                    "country": picked.country,
                    "place": picked.place,
                    "place_source": "live",
                    "destination_unmatched": False,
                    "rematched_from": None,
                }
                if picked is not None and picked.location is not None
                else {}
            ),
        }
    )
    if picked is not None and picked.location is not None:
        trip = trip.model_copy(update={"location": picked.location})
    elif (trip.destination, trip.country, trip.place) != (existing.destination, existing.country, existing.place):
        # A country and place this edit did not rematch describe the old destination: look up the typed one.
        rematched = (trip.country, trip.place) != (existing.country, existing.place)
        query = trip if rematched else trip.model_copy(update={"country": None, "place": None})
        trip = trip.model_copy(update={"location": _located(query, resolver).location})
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
    trip.travellers = [*trip.travellers, Traveller(id=uuid.uuid4().hex, name=body.name, age=body.age)]
    trip.insurance = None  # quoted for the old travellers
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
    trip.visa_self_checks = [k for k in trip.visa_self_checks if k != traveller.id]
    trip.insurance = None  # quoted for the old travellers
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, owner)


def _people(trip: Trip, profile) -> list[Person]:
    """The owner (from their profile, read only) then each named traveller."""
    return [
        Person(
            traveller_id=None,
            name="You (owner)",
            citizenship=profile.citizenship if profile else "",
            residence=profile.residence if profile else "",
        ),
        *(
            Person(traveller_id=t.id, name=t.name, citizenship=t.citizenship, residence=t.residence)
            for t in trip.travellers
        ),
    ]


def _chosen_country(trip: Trip) -> str:
    chosen = chosen_destination(trip)
    return chosen.country if chosen else ""


def _visa_results(trip: Trip, profile, source: VisaRuleSource) -> list[VisaResult]:
    country = _chosen_country(trip)
    return [visa_result_for(country, p, source, trip.visa_self_checks) for p in _people(trip, profile)]


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
    health = [profile.health_status if profile else "", *(t.health_status for t in trip.travellers)]
    return [
        TravellerRequirement(
            traveller_id=p.traveller_id,
            name=p.name,
            citizenship=p.citizenship,
            residence=p.residence,
            health_status=h,
            medical=medical_for(h),
        )
        for p, h in zip(_people(trip, profile), health, strict=True)
    ]


class VisaView(BaseModel):
    destination: ChosenDestination | None
    status: DestinationStatus
    published_on: date
    travellers: list[VisaResult]


class SelfCheck(BaseModel):
    checked: bool


def _visa_view(
    trip: Trip, profile, source: VisaRuleSource
) -> VisaView:
    chosen = chosen_destination(trip)
    return VisaView(
        destination=chosen,
        status=destination_status(
            chosen,
            needs_place=False,
            country_has_data=bool(chosen) and has_guidance(chosen.country),
            live=trip.place_source == "live",
        ),
        published_on=source.published_on(),
        travellers=_visa_results(trip, profile, source),
    )


@router.get("/{trip_id}/visa")
def trip_visa(
    trip_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    profiles: ProfileStore = Depends(get_profiles),
    visa_rules: VisaRuleSource = Depends(get_visa_rules),
    identity: IdentityProvider = Depends(get_identity),
) -> VisaView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    return _visa_view(trip, profiles.get_profile(owner), visa_rules)


@router.put("/{trip_id}/visa/{traveller_key}/self-check")
def set_visa_self_check(
    trip_id: str,
    traveller_key: str,
    body: SelfCheck,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    profiles: ProfileStore = Depends(get_profiles),
    visa_rules: VisaRuleSource = Depends(get_visa_rules),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> VisaView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    profile = profiles.get_profile(owner)
    person = next((p for p in _people(trip, profile) if self_check_key(p) == traveller_key), None)
    if person is None:
        raise NOT_FOUND
    if visa_result_for(_chosen_country(trip), person, visa_rules, []).status != "no_data":
        raise VISA_HAS_DATA  # the mark only means something while there is no data
    others = [k for k in trip.visa_self_checks if k != traveller_key]
    trip.visa_self_checks = [*others, traveller_key] if body.checked else others
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _visa_view(trip, profile, visa_rules)


class MedicalGuidanceView(BaseModel):
    destination: ChosenDestination | None
    status: DestinationStatus
    travellers: list[TravellerGuidance]


@router.get("/{trip_id}/medical-guidance")
def trip_medical_guidance(
    trip_id: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    profiles: ProfileStore = Depends(get_profiles),
    identity: IdentityProvider = Depends(get_identity),
) -> MedicalGuidanceView:
    trip = _owned_trip(trips, identity, owner, trip_id)
    chosen = chosen_destination(trip)
    profile = profiles.get_profile(owner) or Profile()  # read only: the owner's own answers
    people = [
        (None, profile.display_name or "You", profile),
        *((t.id, t.name, t) for t in trip.travellers),
    ]
    return MedicalGuidanceView(
        destination=chosen,
        status=destination_status(
            chosen,
            needs_place=False,
            country_has_data=bool(chosen) and medical_has_data(chosen.country),
            live=trip.place_source == "live",
        ),
        travellers=[
            guidance_for(
                chosen.country if chosen else "",
                who.citizenship,
                who.residence,
                who.vaccinations_had,
                who.pregnant,
                name=name,
                traveller_id=tid,
            )
            for tid, name, who in people
        ],
    )


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
    trip.share_itinerary = False  # a re-created link starts Off again
    if token is not None:
        trip.updated_at = now
        trips.save_trip(owner, trip)  # the Trip item decides access, so it goes first
        trips.delete_share_link(token)
    return _view(trip, rates, owner)


@router.put("/{trip_id}/share-link/itinerary")
def set_share_itinerary(
    trip_id: str,
    body: ShowItinerary,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    now: datetime = Depends(get_now),
) -> TripView:
    """Owner only: whether the read-only link shows the full itinerary. Editors and strangers get the missing-trip 404."""
    trip = trips.get_trip(owner, trip_id)
    if trip is None:
        raise NOT_FOUND
    if trip.share_token is None:
        raise ApiError(409, "no_share_link")
    trip.share_itinerary = body.show
    trip.updated_at = now
    trips.save_trip(owner, trip)
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
    chosen = chosen_destination(trip)
    if chosen is None or not chosen.place:
        return []
    on_day = {a.name for a in trip.activities if a.date == day_date}
    return [r for r in source.for_destination(chosen.place) if r.name not in on_day]


class FeatureStatus(BaseModel):
    recommendations: Literal["available", "limited"]
    visa: Literal["available", "limited"]
    itinerary: Literal["available", "limited"]


class DataStatusView(BaseModel):
    destination: ChosenDestination | None
    features: FeatureStatus


def _recommendations_available(source: RecommendationSource, place: str) -> bool:
    try:
        return bool(source.for_destination(place))
    except Exception:
        return False


@router.get("/{trip_id}/data-status")
def trip_data_status(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    source: RecommendationSource = Depends(get_recommendations),
) -> DataStatusView:
    """Whether each feature has data for this trip's place, so the overview can say where data is limited."""
    trip, _ = _editable_trip(trips, identity, user, trip_id)
    chosen = chosen_destination(trip)
    live = trip.place_source == "live"
    has_place = chosen is not None and bool(chosen.place)
    available = {
        "recommendations": has_place and (not live or _recommendations_available(source, chosen.place)),
        "visa": chosen is not None and (not live or has_guidance(chosen.country)),
        "itinerary": has_place and (not live or bool(trip.days or (trip.start_date and trip.end_date))),
    }
    return DataStatusView(
        destination=chosen,
        features=FeatureStatus(**{k: "available" if v else "limited" for k, v in available.items()}),
    )


class TripRecommendations(BaseModel):
    destination: ChosenDestination | None
    status: DestinationStatus
    items: list[Recommendation]


@router.get("/{trip_id}/recommendations")
def trip_recommendations(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    source: RecommendationSource = Depends(get_recommendations),
) -> TripRecommendations:
    trip, _ = _editable_trip(trips, identity, user, trip_id)
    chosen = chosen_destination(trip)
    live = trip.place_source == "live"
    # Place data is measured before the interest filter, so a filter that empties the list is not "no information".
    try:
        recommendations = source.for_destination(chosen.place) if chosen and chosen.place else []
    except Exception:
        if not live:
            raise
        logger.warning("Recommendations failed for trip %s", trip_id, exc_info=True)
        return TripRecommendations(destination=chosen, status="limited_data", items=[])
    status = destination_status(
        chosen,
        needs_place=True,
        country_has_data=bool(chosen)
        and (
            bool(recommendations)
            or (not live and country_has_any_place(chosen.country, lambda p: bool(source.for_destination(p))))
        ),
        place_has_data=bool(recommendations),
        live=live,
    )
    wanted = {i.casefold() for i in trip.interests}
    items = [r for r in recommendations if r.interest and r.interest.casefold() in wanted] if wanted else recommendations
    return TripRecommendations(destination=chosen, status=status, items=items)


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


def _save_stays(
    trips: TripStore,
    rates: RateSource,
    user: str,
    owner: str,
    trip: Trip,
    stays: list[Stay],
    now: datetime,
) -> TripView:
    trip.stays = stays
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, user, owner)


def _save_insurance(
    trips: TripStore,
    rates: RateSource,
    user: str,
    owner: str,
    trip: Trip,
    pick: InsurancePick | None,
    now: datetime,
) -> TripView:
    trip.insurance = pick
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, user, owner)


def _save_transport(
    trips: TripStore,
    rates: RateSource,
    user: str,
    owner: str,
    trip: Trip,
    transport: list[TransportPick],
    now: datetime,
) -> TripView:
    trip.transport = transport
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, user, owner)


def _save_sim(
    trips: TripStore,
    rates: RateSource,
    user: str,
    owner: str,
    trip: Trip,
    sim: ChosenSim | None,
    now: datetime,
) -> TripView:
    trip.sim = sim
    trip.updated_at = now
    trips.save_trip(owner, trip)
    return _view(trip, rates, user, owner)


@router.post("/{trip_id}/stays", status_code=201)
def add_stay(
    trip_id: str,
    body: StayFields,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    if len(trip.stays) >= MAX_STAYS:
        raise INVALID_STAY
    stay = Stay(id=uuid.uuid4().hex, **body.model_dump())
    return _save_stays(trips, rates, user, owner, trip, [*trip.stays, stay], now)


@router.put("/{trip_id}/stays/{stay_id}")
def change_stay(
    trip_id: str,
    stay_id: str,
    body: StayFields,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    if stay_id not in {s.id for s in trip.stays}:
        raise NOT_FOUND
    def revised(s: Stay) -> Stay:
        # The priced dates no longer apply once the place or dates move, so the choice goes with them.
        same = (s.place, s.start_date, s.end_date) == (body.place, body.start_date, body.end_date)
        # Only an already-flagged stay is rechecked, so adjusting it inside the trip clears the flag.
        outside = s.outside_trip and stay_outside_trip(body, trip.start_date, trip.end_date)
        return Stay(id=stay_id, **body.model_dump(), chosen=s.chosen if same else None, outside_trip=outside)

    changed = [revised(s) if s.id == stay_id else s for s in trip.stays]
    return _save_stays(trips, rates, user, owner, trip, changed, now)


@router.delete("/{trip_id}/stays/{stay_id}")
def remove_stay(
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
    kept = [s for s in trip.stays if s.id != stay_id]
    return _save_stays(trips, rates, user, owner, trip, kept, now)


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
