from fastapi import APIRouter, Depends

from app.routers.deps import get_local_inbox
from app.trips.invites import InMemoryInviteSender

router = APIRouter(prefix="/local")


@router.get("/inbox")
def read_inbox(inbox: InMemoryInviteSender = Depends(get_local_inbox)) -> list[dict[str, str]]:
    """The emails local mode would have sent, newest first. 404 with local mode off."""
    return [
        {
            "to": to,
            "trip_name": trip_name,
            "link": link,
            "kind": "invite" if trip_name else "confirmation",
            "subject": "You are invited to a trip" if trip_name else "Confirm your sign-in",
            "sent_at": sent_at.isoformat(),
        }
        for (to, trip_name, link), sent_at in zip(reversed(inbox.sent), reversed(inbox.sent_at))
    ]
