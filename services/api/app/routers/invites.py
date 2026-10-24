from fastapi import APIRouter, Depends

from app.routers.auth import get_identity
from app.routers.deps import ApiError, get_current_user, get_trips
from app.auth.identity import IdentityProvider
from app.trips.store import TripStore

router = APIRouter(prefix="/invites")

INVALID_INVITE = ApiError(404, "not_found")


def _live_invite(trips: TripStore, token: str):
    """The invite and its trip, only while the editor is still on the trip (revoking removes both)."""
    invite = trips.get_invite(token)
    trip = trips.get_trip(invite.owner_id, invite.trip_id) if invite else None
    if invite is None or trip is None:
        raise INVALID_INVITE
    if not any(e.token == token and e.email == invite.email for e in trip.editors):
        raise INVALID_INVITE
    return invite, trip


@router.get("/{token}")
def read_invite(token: str, trips: TripStore = Depends(get_trips)) -> dict:
    invite, trip = _live_invite(trips, token)
    return {"email": invite.email, "trip_name": trip.name}


@router.post("/{token}/accept")
def accept_invite(
    token: str,
    user_id: str = Depends(get_current_user),
    trips: TripStore = Depends(get_trips),
    identity: IdentityProvider = Depends(get_identity),
) -> dict:
    invite, trip = _live_invite(trips, token)
    if identity.email_for(user_id).strip().lower() != invite.email:
        raise ApiError(403, "wrong_account")
    for editor in trip.editors:
        if editor.token == token:
            editor.accepted = True
    trips.save_trip(invite.owner_id, trip)
    trips.link_editor(invite.email, invite.owner_id, invite.trip_id)
    return {"trip_id": invite.trip_id}
