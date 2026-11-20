from fastapi import APIRouter, Depends

from app.auth.identity import IdentityProvider
from app.routers.auth import get_identity
from app.routers.deps import get_current_user, get_profiles, get_rates, get_trips, get_visa_providers, get_visa_rules
from app.routers.trips import NOT_FOUND, _chosen_country, _owned_trip, _people
from app.trips.profile_store import ProfileStore
from app.trips.rates import RateSource
from app.trips.store import TripStore
from app.trips.visa import VisaRuleSource, self_check_key, visa_result_for
from app.visa_providers.options import VisaProvider, VisaProviderView, gather_visa_providers

router = APIRouter(prefix="/trips")


@router.get("/{trip_id}/visa/{traveller_key}/providers")
def visa_provider_options(
    trip_id: str,
    traveller_key: str,
    owner: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    profiles: ProfileStore = Depends(get_profiles),
    identity: IdentityProvider = Depends(get_identity),
    visa_rules: VisaRuleSource = Depends(get_visa_rules),
    providers: list[VisaProvider] = Depends(get_visa_providers),
    rates: RateSource = Depends(get_rates),
) -> VisaProviderView:
    """The traveller's lowest-fee visa application providers, owner only."""
    trip = _owned_trip(trips, identity, owner, trip_id)
    person = next((p for p in _people(trip, profiles.get_profile(owner)) if self_check_key(p) == traveller_key), None)
    if person is None:
        raise NOT_FOUND
    result = visa_result_for(_chosen_country(trip), person, visa_rules, trip.visa_self_checks)
    return gather_visa_providers(providers, trip, person, result, rates)
