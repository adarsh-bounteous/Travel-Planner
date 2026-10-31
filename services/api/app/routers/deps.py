import time
from collections.abc import Callable
from datetime import UTC, date, datetime
from functools import lru_cache

from fastapi import Cookie, Depends, Response

from app.auth.session import read_session
from app.availability.store import DynamoProbeStore, InMemoryProbeStore, ProbeStore
from app.config import Settings, get_settings
from app.local_seed import LocalSeedTarget
from app.providers.registry import ProviderRegistry, default_registry
from app.secrets import get_secret
from app.locations.cache import DynamoLocationCache
from app.locations.nominatim import NominatimResolver
from app.locations.resolver import CachedResolver, DestinationResolver, NoResolver, RateLimiter
from app.routers.auth import _local_identity, _set_session, get_now
from app.integrations.client import IntegrationClient
from app.locations.cache import InMemoryLocationCache
from app.places.fallback import FallbackPlaceSearch
from app.places.local_search import LocalPlaceSearch
from app.places.overpass import OsmPlaceSearch, overpass_settings
from app.places.tiles import TileSource
from app.places.search import SEED_CATALOGUE, InMemoryPlaceSearch, PlaceSearch
from app.flights.options import FlightProvider
from app.flights.providers import SEED_CATALOGUES as FLIGHT_SEED_CATALOGUES
from app.flights.providers import SEED_MODES as FLIGHT_SEED_MODES
from app.flights.providers import InMemoryFlightProvider
from app.attractions.options import ActivityProvider
from app.attractions.providers import SEED_CATALOGUES as ACTIVITY_SEED_CATALOGUES
from app.attractions.providers import InMemoryActivityProvider
from app.dining.options import RestaurantProvider
from app.dining.providers import SEED_CATALOGUES as RESTAURANT_SEED_CATALOGUES
from app.dining.providers import InMemoryRestaurantProvider
from app.sims.options import SimProvider
from app.sims.providers import SEED_CATALOGUES as SIM_SEED_CATALOGUES
from app.sims.providers import InMemorySimProvider
from app.insurance.options import InsuranceProvider
from app.insurance.providers import SEED_CATALOGUES as INSURANCE_SEED_CATALOGUES
from app.insurance.providers import InMemoryInsuranceProvider
from app.stays.options import StayProvider
from app.stays.providers import SEED_CATALOGUES, InMemoryStayProvider
from app.transport.options import TransportProvider
from app.transport.providers import SEED_CATALOGUES as TRANSPORT_SEED_CATALOGUES
from app.transport.providers import InMemoryTransportProvider
from app.travel.local import LocalFlightProvider, LocalStayProvider, LocalTransportProvider
from app.trips.recommendations import (
    SEED_LOCAL_RECOMMENDATIONS,
    SEED_RECOMMENDATIONS,
    InMemoryRecommendations,
    RecommendationSource,
)
from app.trips.osm_recommendations import FallbackRecommendations, OsmRecommendations
from app.trips.profile_store import DynamoProfileStore, ProfileStore
from app.trips.saved_store import DynamoSavedPlaceStore, SavedPlaceStore
from app.trips.invites import InviteSender, NoInviteSender, SesInviteSender
from app.trips.local_inbox_store import INBOX_FILE_NAME, PersistentInviteSender
from app.trips.forecast import DayForecast, ForecastSource, ForecastUnavailable, LocalForecast
from app.trips.rates import SEED_RATES, InMemoryRates, LastKnownRates, LocalRates, RateSource
from app.trips.visa import SEED_PUBLISHED_ON, SEED_VISA_RULES, InMemoryVisaRules, VisaRuleSource
from app.local_data import LOCAL_DATA_FILE_NAME, LocalDataFile
from app.trips.local_profile_store import PROFILES_FILE_NAME, PersistentProfileStore
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
def _local_profiles() -> PersistentProfileStore:
    """Local mode's profile storage stand-in: kept in its own data file, so profiles survive a restart."""
    return PersistentProfileStore(LocalDataFile(get_settings().local_data_dir / PROFILES_FILE_NAME))


@lru_cache
def _probe_store() -> ProbeStore:
    return DynamoProbeStore(get_settings().availability_table_name)


@lru_cache
def _local_probe_store() -> InMemoryProbeStore:
    """Local mode's probe history stand-in: empty, so no table is needed to run locally."""
    return InMemoryProbeStore()


@lru_cache
def _resolver() -> DestinationResolver:
    settings = get_settings()
    return CachedResolver(
        NominatimResolver(settings.nominatim_base_url, settings.nominatim_user_agent),
        DynamoLocationCache(settings.trips_table_name),
        RateLimiter(time.monotonic, time.sleep),
        now=lambda: datetime.now(UTC),
    )


def get_destination_resolver() -> DestinationResolver:
    """Local mode resolves nothing: it makes no outside request."""
    return NoResolver() if get_settings().local_mode else _resolver()


def get_probe_store() -> ProbeStore:
    return _local_probe_store() if get_settings().local_mode else _probe_store()


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
def _osm_places() -> PlaceSearch:
    """Real places from OpenStreetMap. Local mode keeps its resolved cities in memory, never in DynamoDB."""
    settings = get_settings()
    if settings.local_mode:
        resolver: DestinationResolver = CachedResolver(
            NominatimResolver(settings.nominatim_base_url, settings.nominatim_user_agent),
            InMemoryLocationCache(),
            RateLimiter(time.monotonic, time.sleep),
            now=lambda: datetime.now(UTC),
        )
    else:
        resolver = _resolver()
    client = IntegrationClient([overpass_settings(settings.overpass_base_url)])
    return OsmPlaceSearch(resolver, client, settings.osm_user_agent or settings.nominatim_user_agent)


@lru_cache
def _local_places() -> PlaceSearch:
    """Local mode's places stand-in: generated from the destination, no outside request."""
    return LocalPlaceSearch()


@lru_cache
def _activity_providers() -> list[ActivityProvider]:
    def clock() -> datetime:
        return datetime.now(UTC)

    return [
        InMemoryActivityProvider(name, source, catalogue, clock)
        for name, (source, catalogue) in ACTIVITY_SEED_CATALOGUES.items()
    ]


@lru_cache
def _restaurant_providers() -> list[RestaurantProvider]:
    return [InMemoryRestaurantProvider(name, catalogue) for name, catalogue in RESTAURANT_SEED_CATALOGUES.items()]


@lru_cache
def _insurance_providers() -> list[InsuranceProvider]:
    def clock() -> datetime:
        return datetime.now(UTC)

    return [
        InMemoryInsuranceProvider(name, source, catalogue, clock)
        for name, (source, catalogue) in INSURANCE_SEED_CATALOGUES.items()
    ]


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
def _local_recommendations() -> RecommendationSource:
    """Local mode's recommendation stand-in: a catalogue tagged by interest."""
    return InMemoryRecommendations(SEED_LOCAL_RECOMMENDATIONS)


@lru_cache
def _rates() -> RateSource:
    return InMemoryRates(SEED_RATES)


@lru_cache
def get_visa_rules() -> VisaRuleSource:
    """One seeded source, in local mode too: it makes no outside call."""
    return InMemoryVisaRules(SEED_VISA_RULES, SEED_PUBLISHED_ON)


@lru_cache
def _local_rates() -> LocalRates:
    """Local mode's exchange rates: a fixed table, so the outside rates service is never used."""
    return LocalRates()


@lru_cache
def get_last_known_rates() -> LastKnownRates:
    return LastKnownRates()


class _NoForecastProvider:
    """Until a forecast provider is chosen, say so rather than invent numbers."""

    def for_dates(self, destination: str, start: date, end: date) -> list[DayForecast]:
        raise ForecastUnavailable


@lru_cache
def _local_forecast() -> LocalForecast:
    """Local mode's forecast stand-in: deterministic days, no outside request."""
    return LocalForecast()


def get_forecast() -> ForecastSource:
    return _local_forecast() if get_settings().local_mode else _NoForecastProvider()


def get_today() -> date:
    return date.today()


@lru_cache
def _invite_sender() -> InviteSender:
    address = get_settings().invite_from_address
    return SesInviteSender(address) if address else NoInviteSender()


@lru_cache
def _local_invite_sender() -> PersistentInviteSender:
    """Local mode's email stand-in: every invite is kept in `inbox.json` and shown on the local inbox page."""
    return PersistentInviteSender(LocalDataFile(get_settings().local_data_dir / INBOX_FILE_NAME))


def require_local_mode() -> None:
    if not get_settings().local_mode:
        raise ApiError(404, "not_found")


@lru_cache
def get_provider_registry() -> ProviderRegistry:
    return default_registry()


def secret_reader() -> Callable[[str], str | None]:
    """Reads a provider key for the current mode: None when it is not configured."""
    local_mode = get_settings().local_mode
    return lambda name: get_secret(name, local_mode=local_mode)


def get_local_inbox() -> PersistentInviteSender:
    require_local_mode()
    return _local_invite_sender()


def get_invite_sender() -> InviteSender:
    return _local_invite_sender() if get_settings().local_mode else _invite_sender()


def get_rates() -> RateSource:
    return _local_rates() if get_settings().local_mode else _rates()


def get_recommendations() -> RecommendationSource:
    settings = get_settings()
    seed = _local_recommendations() if settings.local_mode else _recommendations()
    primary = OsmRecommendations(_osm_places()) if settings.osm_places_enabled else None
    return FallbackRecommendations(primary, seed, date.today)


@lru_cache
def _local_stay_providers() -> list[StayProvider]:
    return [LocalStayProvider()]


@lru_cache
def _local_flight_providers() -> list[FlightProvider]:
    return [LocalFlightProvider()]


@lru_cache
def _local_transport_providers() -> list[TransportProvider]:
    return [LocalTransportProvider()]


@lru_cache
def _sim_providers() -> list[SimProvider]:
    return [InMemorySimProvider(name, source, catalogue) for name, (source, catalogue) in SIM_SEED_CATALOGUES.items()]


def get_sim_providers() -> list[SimProvider]:
    return _sim_providers()


def get_activity_providers() -> list[ActivityProvider]:
    return _activity_providers()


def get_restaurant_providers() -> list[RestaurantProvider]:
    return _restaurant_providers()  # seeded in local mode too: it makes no outside call


def get_insurance_providers() -> list[InsuranceProvider]:
    return _insurance_providers()  # seeded in local mode too: no outside call


def get_stay_providers() -> list[StayProvider]:
    return _local_stay_providers() if get_settings().local_mode else _stay_providers()


def get_flight_providers() -> list[FlightProvider]:
    return _local_flight_providers() if get_settings().local_mode else _flight_providers()


def get_transport_providers() -> list[TransportProvider]:
    return _local_transport_providers() if get_settings().local_mode else _transport_providers()


def get_places() -> PlaceSearch:
    settings = get_settings()
    seed = _local_places() if settings.local_mode else _places()
    return FallbackPlaceSearch(_osm_places() if settings.osm_places_enabled else None, seed, date.today)


@lru_cache
def get_tile_source() -> TileSource:
    return TileSource(get_settings())


def get_local_seed_target() -> LocalSeedTarget | None:
    """The local stores to seed: the very ones sign-in and trips serve from. None with local mode off."""
    if not get_settings().local_mode:
        return None
    identity, trips = _local_identity(), _local_trips()
    return LocalSeedTarget(is_empty=trips.is_empty, identity=identity, trips=trips)


def get_trips() -> TripStore:
    return _local_trips() if get_settings().local_mode else _trips()


def get_profiles() -> ProfileStore:
    return _local_profiles() if get_settings().local_mode else _profiles()


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
