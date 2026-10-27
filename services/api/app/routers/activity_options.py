from fastapi import APIRouter, Depends

from app.attractions.options import ActivityOptions, ActivityProvider, gather_activities
from app.auth.identity import IdentityProvider
from app.routers.auth import get_identity
from app.routers.deps import get_activity_providers, get_current_user, get_rates, get_trips
from app.routers.trips import _load
from app.trips.rates import RateSource
from app.trips.store import TripStore

router = APIRouter(prefix="/trips")


@router.get("/{trip_id}/activity-options")
def activity_options(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    rates: RateSource = Depends(get_rates),
    providers: list[ActivityProvider] = Depends(get_activity_providers),
) -> ActivityOptions:
    trip, _, _ = _load(trips, identity, user, trip_id)
    return gather_activities(providers, trip, rates)
