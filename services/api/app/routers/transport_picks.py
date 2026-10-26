from datetime import date, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.identity import IdentityProvider
from app.flights.options import FlightProvider, gather_flights
from app.routers.auth import get_identity, get_now
from app.routers.deps import get_current_user, get_flight_providers, get_rates, get_trips
from app.routers.trips import INVALID_TRANSPORT, TripView, _editable_trip, _save_transport
from app.trips.rates import RateSource
from app.trips.store import TransportLeg, TransportPick, TripStore

router = APIRouter(prefix="/trips")


class ChooseTransport(BaseModel):
    origin: str
    destination: str
    date: date
    option_id: str


@router.put("/{trip_id}/transport/{leg}")
def pick_transport(
    trip_id: str,
    leg: TransportLeg,
    body: ChooseTransport,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    providers: list[FlightProvider] = Depends(get_flight_providers),
    now: datetime = Depends(get_now),
) -> TripView:
    """Pick an option for a leg; its fare and booking link come from the providers, never the request."""
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    options, _ = gather_flights(providers, body.origin, body.destination, body.date)
    option = next((o for o in options if o.id == body.option_id), None)
    if option is None:
        raise INVALID_TRANSPORT
    pick = TransportPick(
        leg=leg,
        option_id=option.id,
        mode=option.mode,
        provider=option.provider,
        origin=body.origin,
        destination=body.destination,
        date=body.date,
        estimate=option.estimate,
        fare=option.fare,
        picked_fare=option.fare,
        currency=option.currency,
        url=option.url,
    )
    kept = [p for p in trip.transport if p.leg != leg]
    return _save_transport(trips, rates, user, owner, trip, [*kept, pick], now)


@router.delete("/{trip_id}/transport/{leg}")
def clear_transport(
    trip_id: str,
    leg: TransportLeg,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    now: datetime = Depends(get_now),
) -> TripView:
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    kept = [p for p in trip.transport if p.leg != leg]
    return _save_transport(trips, rates, user, owner, trip, kept, now)


@router.post("/{trip_id}/transport/refresh")
def refresh_transport(
    trip_id: str,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    providers: list[FlightProvider] = Depends(get_flight_providers),
    now: datetime = Depends(get_now),
) -> TripView:
    """Re-fetch each pick's leg and take the current fare; a pick whose option is gone keeps its last fare."""
    trip, owner = _editable_trip(trips, identity, user, trip_id)
    refreshed: list[TransportPick] = []
    for pick in trip.transport:
        options, _ = gather_flights(providers, pick.origin, pick.destination, pick.date)
        current = next((o for o in options if o.id == pick.option_id), None)
        refreshed.append(pick if current is None else pick.model_copy(update={"fare": current.fare, "currency": current.currency}))
    return _save_transport(trips, rates, user, owner, trip, refreshed, now)
