from datetime import date

from fastapi import APIRouter, Depends

from app.routers.deps import get_current_user, get_profiles, get_transport_providers
from app.transport.options import TransportOptions, TransportProvider, search_transport
from app.trips.profile_store import ProfileStore, TransportPreferences

router = APIRouter(prefix="/transport")


@router.get("/options")
def transport_options(
    origin: str,
    destination: str,
    date: date,
    owner: str = Depends(get_current_user),
    profiles: ProfileStore = Depends(get_profiles),
    providers: list[TransportProvider] = Depends(get_transport_providers),
) -> TransportOptions:
    """Search never takes preferences: the traveller's saved ones are applied here, if any."""
    profile = profiles.get_profile(owner)
    prefs = profile.transport_preferences if profile else TransportPreferences()
    return search_transport(providers, origin, destination, date, prefs)
