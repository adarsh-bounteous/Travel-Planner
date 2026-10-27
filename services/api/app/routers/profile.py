from fastapi import APIRouter, Depends

from app.routers.deps import get_current_user, get_profiles
from app.trips.profile_store import Profile, ProfileStore

router = APIRouter(prefix="/profile")


@router.get("")
def get_profile(
    owner: str = Depends(get_current_user), profiles: ProfileStore = Depends(get_profiles)
) -> Profile:
    return profiles.get_profile(owner) or Profile()


@router.put("")
def save_profile(
    body: Profile,
    owner: str = Depends(get_current_user),
    profiles: ProfileStore = Depends(get_profiles),
) -> Profile:
    # PUT replaces the profile; a client that never sends these fields must not wipe them.
    kept = ("transport_preferences", "dining_style", "price_level")
    missing = [f for f in kept if f not in body.model_fields_set]
    stored = profiles.get_profile(owner) if missing else None
    if stored:
        body = body.model_copy(update={f: getattr(stored, f) for f in missing})
    profiles.save_profile(owner, body)
    return body
