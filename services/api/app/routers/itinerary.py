import logging
from datetime import date

from fastapi import APIRouter, Depends, Response

from app.auth.identity import IdentityProvider
from app.routers.auth import get_identity
from app.routers.deps import ApiError, get_current_user, get_invite_sender, get_profiles, get_rates, get_today, get_trips, get_visa_rules
from app.routers.trips import _load
from app.trips.invites import InviteSender
from app.trips.itinerary import Itinerary, build_itinerary
from app.trips.itinerary_email import render_itinerary_html
from app.trips.profile_store import ProfileStore
from app.trips.rates import RateSource
from app.trips.store import TripStore
from app.trips.visa import VisaRuleSource

router = APIRouter(prefix="/trips")
logger = logging.getLogger(__name__)


@router.get("/{trip_id}/itinerary")
def get_itinerary(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    profiles: ProfileStore = Depends(get_profiles),
    visa_rules: VisaRuleSource = Depends(get_visa_rules),
    today: date = Depends(get_today),
    rates: RateSource = Depends(get_rates),
) -> Itinerary:
    """The printable itinerary for the owner or an accepted editor; anyone else gets the missing-trip 404."""
    return _itinerary(trips, identity, profiles, visa_rules, today, rates, user, trip_id)


def _itinerary(trips, identity, profiles, visa_rules, today, rates, user: str, trip_id: str) -> Itinerary:
    trip, owner_id, is_owner = _load(trips, identity, user, trip_id)
    # The owner's citizenship, vaccinations and pregnancy answers are private: editors never get facts built from them.
    profile = profiles.get_profile(owner_id) if is_owner else None
    return build_itinerary(trip, profile, visa_rules, today, rates)


@router.post("/{trip_id}/itinerary/email", status_code=204)
def email_itinerary(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    profiles: ProfileStore = Depends(get_profiles),
    visa_rules: VisaRuleSource = Depends(get_visa_rules),
    today: date = Depends(get_today),
    rates: RateSource = Depends(get_rates),
    sender: InviteSender = Depends(get_invite_sender),
) -> Response:
    """Emails the complete itinerary, as HTML, to the signed-in traveller. A send that cannot happen is an error, never a silent success."""
    itinerary = _itinerary(trips, identity, profiles, visa_rules, today, rates, user, trip_id)
    try:
        sender.send_itinerary(identity.email_for(user), itinerary.cover.name, render_itinerary_html(itinerary))
    except Exception:
        logger.exception("Could not email the itinerary of trip %s", trip_id)
        raise ApiError(502, "email_failed")
    return Response(status_code=204)
