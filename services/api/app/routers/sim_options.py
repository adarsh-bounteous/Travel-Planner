from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.identity import IdentityProvider
from app.routers.auth import get_identity, get_now
from app.routers.deps import get_current_user, get_profiles, get_rates, get_sim_providers, get_trips
from app.routers.trips import INVALID_SIM, TripView, _editable_trip, _load, _save_sim
from app.sims.options import SimOptions, SimProvider, covers_trip, gather_sims
from app.trips.profile_store import ProfileStore
from app.trips.rates import RateSource
from app.trips.store import ChosenSim, Trip, TripStore

router = APIRouter(prefix="/trips")


class PickedSim(ChosenSim):
    covers_dates: bool


class TripSimOptions(SimOptions):
    picked: PickedSim | None


def _labels(trip: Trip, owner_name: str) -> list[str]:
    """One label per traveller: the owner, the named travellers, then "Traveller N" up to the count."""
    labels = [owner_name or "You", *(t.name for t in trip.travellers)]
    while len(labels) < (trip.traveller_count or 1):
        labels.append(f"Traveller {len(labels) + 1}")
    return labels


def _shortlist(
    trip: Trip,
    owner: str,
    viewer: str,
    profiles: ProfileStore,
    providers: list[SimProvider],
    rates: RateSource,
) -> SimOptions:
    owner_profile = profiles.get_profile(owner)
    viewer_profile = owner_profile if viewer == owner else profiles.get_profile(viewer)
    return gather_sims(
        providers,
        trip,
        _labels(trip, owner_profile.display_name if owner_profile else ""),
        viewer_profile.sim_preference if viewer_profile else None,
        rates,
    )


@router.get("/{trip_id}/sim-options")
def sim_options(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    profiles: ProfileStore = Depends(get_profiles),
    rates: RateSource = Depends(get_rates),
    providers: list[SimProvider] = Depends(get_sim_providers),
) -> TripSimOptions:
    trip, owner, _ = _load(trips, identity, user, trip_id)
    shortlist = _shortlist(trip, owner, user, profiles, providers, rates)
    picked = (
        None
        if trip.sim is None
        else PickedSim(**trip.sim.model_dump(), covers_dates=covers_trip(trip.sim.valid_from, trip.sim.valid_to, trip))
    )
    return TripSimOptions(**shortlist.model_dump(), picked=picked)


class PickSim(BaseModel):
    option_id: str


@router.put("/{trip_id}/sim")
def pick_sim(
    trip_id: str,
    body: PickSim,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    profiles: ProfileStore = Depends(get_profiles),
    providers: list[SimProvider] = Depends(get_sim_providers),
    now: datetime = Depends(get_now),
) -> TripView:
    """Pick a SIM from the shortlist; its price, currency and booking link are taken from the rebuilt shortlist."""
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    option = next(
        (o for o in _shortlist(trip, owner, user, profiles, providers, rates).options if o.id == body.option_id),
        None,
    )
    if option is None:
        raise INVALID_SIM
    chosen = ChosenSim(
        option_id=option.id,
        name=option.name,
        provider=option.provider,
        sim_type=option.sim_type,
        valid_from=option.valid_from,
        valid_to=option.valid_to,
        data_gb=option.data_gb,
        price=option.price,
        currency=option.currency,
        url=option.url,
    )
    return _save_sim(trips, rates, user, owner, trip, chosen, now)


@router.delete("/{trip_id}/sim")
def clear_sim(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    return _save_sim(trips, rates, user, owner, trip, None, now)
