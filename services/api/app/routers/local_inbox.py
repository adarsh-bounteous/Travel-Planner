from fastapi import APIRouter, Depends

from app.routers.deps import get_local_inbox
from app.trips.invites import InMemoryInviteSender

router = APIRouter(prefix="/local")

SUBJECTS = {
    "invite": "You are invited to a trip",
    "confirmation": "Confirm your sign-in",
    "email_change": "Confirm your new email address",
}


@router.get("/inbox")
def read_inbox(inbox: InMemoryInviteSender = Depends(get_local_inbox)) -> list[dict[str, str]]:
    """The emails local mode would have sent, newest first. 404 with local mode off."""
    return [
        {
            "to": to,
            "trip_name": trip_name,
            "link": link,
            "kind": (kind := "invite" if trip_name else inbox.kinds.get(link, "confirmation")),
            "subject": SUBJECTS[kind],
            "sent_at": sent_at.isoformat(),
        }
        for (to, trip_name, link), sent_at in zip(reversed(inbox.sent), reversed(inbox.sent_at))
    ]
