from datetime import date

from fastapi import APIRouter, Depends

from app.auth.identity import IdentityProvider
from app.routers.auth import get_identity
from app.routers.deps import get_current_user, get_profiles, get_today, get_trips, get_visa_rules
from app.routers.trips import _load
from app.trips.itinerary import Itinerary, build_itinerary
from app.trips.profile_store import ProfileStore
from app.trips.store import TripStore
from app.trips.visa import VisaRuleSource

router = APIRouter(prefix="/trips")


@router.get("/{trip_id}/itinerary")
def get_itinerary(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    profiles: ProfileStore = Depends(get_profiles),
    visa_rules: VisaRuleSource = Depends(get_visa_rules),
    today: date = Depends(get_today),
) -> Itinerary:
    """The printable itinerary for the owner or an accepted editor; anyone else gets the missing-trip 404."""
    trip, owner_id, _ = _load(trips, identity, user, trip_id)
    return build_itinerary(trip, profiles.get_profile(owner_id), visa_rules, today)
