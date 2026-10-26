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
    if "transport_preferences" not in body.model_fields_set:
        # PUT replaces the profile; a client that never sends the block must not wipe it.
        stored = profiles.get_profile(owner)
        if stored:
            body = body.model_copy(update={"transport_preferences": stored.transport_preferences})
    profiles.save_profile(owner, body)
    return body
