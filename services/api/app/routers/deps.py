from datetime import datetime
from functools import lru_cache

from fastapi import Cookie, Depends, Response

from app.auth.session import read_session
from app.config import Settings, get_settings
from app.routers.auth import _set_session, get_now
from app.places.search import SEED_CATALOGUE, InMemoryPlaceSearch, PlaceSearch
from app.trips.recommendations import (
    SEED_RECOMMENDATIONS,
    InMemoryRecommendations,
    RecommendationSource,
)
from app.trips.profile_store import DynamoProfileStore, ProfileStore
from app.trips.saved_store import DynamoSavedPlaceStore, SavedPlaceStore
from app.trips.invites import InviteSender, NoInviteSender, SesInviteSender
from app.trips.rates import SEED_RATES, InMemoryRates, RateSource
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
def _profiles() -> ProfileStore:
    return DynamoProfileStore(get_settings().accounts_table_name)


@lru_cache
def _saved_places() -> SavedPlaceStore:
    return DynamoSavedPlaceStore(get_settings().accounts_table_name)


@lru_cache
def _places() -> PlaceSearch:
    return InMemoryPlaceSearch(SEED_CATALOGUE)


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


def get_invite_sender() -> InviteSender:
    return _invite_sender()


def get_rates() -> RateSource:
    return _rates()


def get_recommendations() -> RecommendationSource:
    return _recommendations()


def get_places() -> PlaceSearch:
    return _places()


def get_trips() -> TripStore:
    return _trips()


def get_profiles() -> ProfileStore:
    return _profiles()


def get_saved_places() -> SavedPlaceStore:
    return _saved_places()


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
