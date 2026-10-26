from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.identity import IdentityProvider
from app.flights.options import FlightOption, FlightProvider, SourceResult, gather_flights
from app.flights.shortlist import ShortlistFlight, modes_without_service, rank_flights
from app.routers.auth import get_identity
from app.routers.deps import get_current_user, get_flight_providers, get_profiles, get_rates, get_trips
from app.routers.trips import _load
from app.trips.cost import fare_over_budget_by
from app.trips.profile_store import Mode, ProfileStore, TransportPreferences
from app.trips.rates import RateSource
from app.trips.store import TripStore

router = APIRouter(prefix="/trips")


class FlightShortlist(BaseModel):
    origin: str
    destination: str
    date: date
    budget: float | None
    currency: str  # trip currency
    sources: list[SourceResult]
    flights: list[ShortlistFlight]
    no_service: list[Mode]  # modes with no entries on this leg, whose sources all answered


@router.get("/{trip_id}/flights/shortlist")
def flight_shortlist(
    trip_id: str,
    origin: str,
    destination: str,
    date: date,
    user: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    profiles: ProfileStore = Depends(get_profiles),
    rates: RateSource = Depends(get_rates),
    identity: IdentityProvider = Depends(get_identity),
    providers: list[FlightProvider] = Depends(get_flight_providers),
) -> FlightShortlist:
    """Ranked flights for one leg. Never filtered by budget: the ones that push the trip over come last."""
    trip, _, _ = _load(trips, identity, user, trip_id)
    profile = profiles.get_profile(user)
    prefs = profile.transport_preferences if profile else TransportPreferences()
    gathered, sources = gather_flights(providers, origin, destination, date)

    def over_by(f: FlightOption):
        return fare_over_budget_by(trip, rates, f.fare, f.currency)

    return FlightShortlist(
        origin=origin,
        destination=destination,
        date=date,
        budget=trip.budget,
        currency=trip.currency,
        sources=sources,
        flights=rank_flights(gathered, prefs, over_by),
        no_service=modes_without_service(sources, gathered),
    )
