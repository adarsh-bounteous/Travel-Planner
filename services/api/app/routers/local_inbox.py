from fastapi import APIRouter, Depends

from app.routers.deps import get_local_inbox
from app.trips.invites import InMemoryInviteSender

router = APIRouter(prefix="/local")


@router.get("/inbox")
def read_inbox(inbox: InMemoryInviteSender = Depends(get_local_inbox)) -> list[dict[str, str]]:
    """The emails local mode would have sent, newest first. 404 with local mode off."""
    return [
        {"to": to, "trip_name": trip_name, "link": link} for to, trip_name, link in reversed(inbox.sent)
    ]
