from datetime import UTC, datetime
from functools import lru_cache

from fastapi import Cookie, Depends, Response

from app.auth.session import read_session
from app.config import Settings, get_settings
from app.local_seed import LocalSeedTarget
from app.routers.auth import _local_identity, _set_session, get_now
from app.places.search import SEED_CATALOGUE, InMemoryPlaceSearch, PlaceSearch
from app.flights.options import FlightProvider
from app.flights.providers import SEED_CATALOGUES as FLIGHT_SEED_CATALOGUES
from app.flights.providers import SEED_MODES as FLIGHT_SEED_MODES
from app.flights.providers import InMemoryFlightProvider
from app.stays.options import StayProvider
from app.stays.providers import SEED_CATALOGUES, InMemoryStayProvider
from app.transport.options import TransportProvider
from app.transport.providers import SEED_CATALOGUES as TRANSPORT_SEED_CATALOGUES
from app.transport.providers import InMemoryTransportProvider
from app.trips.recommendations import (
    SEED_RECOMMENDATIONS,
    InMemoryRecommendations,
    RecommendationSource,
)
from app.trips.profile_store import DynamoProfileStore, ProfileStore
from app.trips.saved_store import DynamoSavedPlaceStore, SavedPlaceStore
from app.trips.invites import InMemoryInviteSender, InviteSender, NoInviteSender, SesInviteSender
from app.trips.rates import SEED_RATES, InMemoryRates, RateSource
from app.local_data import LOCAL_DATA_FILE_NAME, LocalDataFile
from app.trips.local_saved_store import SAVED_PLACES_FILE_NAME, PersistentSavedPlaceStore
from app.trips.local_store import PersistentTripStore
from app.trips.store import DynamoTripStore, TripStore


class ApiError(Exception):
    """An error answered as `{"code": ...}`, like the auth routes."""

    def __init__(self, status: int, code: str) -> None:
        self.status = status
        self.code = code


@lru_cache
def _trips() -> TripStore:
    return DynamoTripStore(get_settings().trips_table_name)


@lru_cache
def _local_trips() -> PersistentTripStore:
    """Local mode's trip storage stand-in: kept in a data file, so trips survive a restart."""
    return PersistentTripStore(LocalDataFile(get_settings().local_data_dir / LOCAL_DATA_FILE_NAME))


@lru_cache
def _profiles() -> ProfileStore:
    return DynamoProfileStore(get_settings().accounts_table_name)


@lru_cache
def _saved_places() -> SavedPlaceStore:
    return DynamoSavedPlaceStore(get_settings().accounts_table_name)


@lru_cache
def _local_saved_places() -> PersistentSavedPlaceStore:
    """Local mode's saved places: kept in their own data file, so they survive a restart."""
    return PersistentSavedPlaceStore(LocalDataFile(get_settings().local_data_dir / SAVED_PLACES_FILE_NAME))


@lru_cache
def _places() -> PlaceSearch:
    return InMemoryPlaceSearch(SEED_CATALOGUE)


@lru_cache
def _stay_providers() -> list[StayProvider]:
    def clock() -> datetime:
        return datetime.now(UTC)

    return [InMemoryStayProvider(name, catalogue, clock) for name, catalogue in SEED_CATALOGUES.items()]


@lru_cache
def _flight_providers() -> list[FlightProvider]:
    def clock() -> datetime:
        return datetime.now(UTC)

    return [
        InMemoryFlightProvider(name, catalogue, clock, FLIGHT_SEED_MODES.get(name, ("flight",)))
        for name, catalogue in FLIGHT_SEED_CATALOGUES.items()
    ]


@lru_cache
def _transport_providers() -> list[TransportProvider]:
    return [InMemoryTransportProvider(name, catalogue) for name, catalogue in TRANSPORT_SEED_CATALOGUES.items()]


@lru_cache
def _recommendations() -> RecommendationSource:
    return InMemoryRecommendations(SEED_RECOMMENDATIONS)


@lru_cache
def _rates() -> RateSource:
    return InMemoryRates(SEED_RATES)


@lru_cache
def _invite_sender() -> InviteSender:
    address = get_settings().invite_from_address
    return SesInviteSender(address) if address else NoInviteSender()


@lru_cache
def _local_invite_sender() -> InMemoryInviteSender:
    """Local mode's email stand-in: every invite is kept in memory and shown on the local inbox page."""
    return InMemoryInviteSender()


def require_local_mode() -> None:
    if not get_settings().local_mode:
        raise ApiError(404, "not_found")


def get_local_inbox() -> InMemoryInviteSender:
    require_local_mode()
    return _local_invite_sender()


def get_invite_sender() -> InviteSender:
    return _local_invite_sender() if get_settings().local_mode else _invite_sender()


def get_rates() -> RateSource:
    return _rates()


def get_recommendations() -> RecommendationSource:
    return _recommendations()


def get_stay_providers() -> list[StayProvider]:
    return _stay_providers()


def get_flight_providers() -> list[FlightProvider]:
    return _flight_providers()


def get_transport_providers() -> list[TransportProvider]:
    return _transport_providers()


def get_places() -> PlaceSearch:
    return _places()


def get_local_seed_target() -> LocalSeedTarget | None:
    """The local stores to seed: the very ones sign-in and trips serve from. None with local mode off."""
    if not get_settings().local_mode:
        return None
    identity, trips = _local_identity(), _local_trips()
    return LocalSeedTarget(is_empty=trips.is_empty, identity=identity, trips=trips)


def get_trips() -> TripStore:
    return _local_trips() if get_settings().local_mode else _trips()


def get_profiles() -> ProfileStore:
    return _profiles()


def get_saved_places() -> SavedPlaceStore:
    return _local_saved_places() if get_settings().local_mode else _saved_places()


def get_current_user(
    response: Response,
    session: str | None = Cookie(default=None),
    now: datetime = Depends(get_now),
    settings: Settings = Depends(get_settings),
) -> str:
    """The signed-in traveller's id, from the session cookie only. Never from the path or body."""
    user_id = read_session(session, now) if session else None
    if user_id is None:
        raise ApiError(401, "not_signed_in")
    _set_session(response, user_id, now, settings)  # slide the 7-day idle window
    return user_id
