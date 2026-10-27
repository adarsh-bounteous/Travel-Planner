from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.identity import IdentityProvider
from app.insurance.options import InsuranceOptions, InsuranceProvider, gather_insurance
from app.routers.auth import get_identity, get_now
from app.routers.deps import get_current_user, get_insurance_providers, get_rates, get_trips
from app.routers.trips import INVALID_INSURANCE, TripView, _editable_trip, _load, _save_insurance
from app.trips.rates import RateSource
from app.trips.store import InsurancePick, TripStore

router = APIRouter(prefix="/trips")


@router.get("/{trip_id}/insurance-options")
def insurance_options(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
    rates: RateSource = Depends(get_rates),
    providers: list[InsuranceProvider] = Depends(get_insurance_providers),
) -> InsuranceOptions:
    trip, _, _ = _load(trips, identity, user, trip_id)
    return gather_insurance(providers, trip, rates)


class ChooseInsurance(BaseModel):
    plan_id: str


@router.put("/{trip_id}/insurance")
def choose_insurance(
    trip_id: str,
    body: ChooseInsurance,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    providers: list[InsuranceProvider] = Depends(get_insurance_providers),
    now: datetime = Depends(get_now),
) -> TripView:
    """Pick a plan from the shortlist; its price and booking link are taken from the rebuilt shortlist."""
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    plan = next((p for p in gather_insurance(providers, trip, rates).plans if p.plan_id == body.plan_id), None)
    if plan is None:
        raise INVALID_INSURANCE
    pick = InsurancePick(
        plan_id=plan.plan_id,
        name=plan.name,
        provider=plan.provider,
        url=plan.url,
        total=plan.group_total,
        currency=plan.currency,
    )
    return _save_insurance(trips, rates, user, owner, trip, pick, now)


@router.delete("/{trip_id}/insurance")
def clear_insurance(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    return _save_insurance(trips, rates, user, owner, trip, None, now)
