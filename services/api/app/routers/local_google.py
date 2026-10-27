from fastapi import APIRouter, Depends

from app.routers.auth import _local_identity
from app.routers.deps import require_local_mode

router = APIRouter(prefix="/local")

SAMPLE_NEW_IDENTITY = "new.user@example.com"


@router.get("/google-identities")
def list_google_identities(_: None = Depends(require_local_mode)) -> dict:
    """The identities the local Google consent page offers. 404 with local mode off."""
    emails = _local_identity().known_emails()
    identities = [{"email": email, "has_account": True} for email in emails]
    if SAMPLE_NEW_IDENTITY not in emails:
        identities.append({"email": SAMPLE_NEW_IDENTITY, "has_account": False})
    return {"identities": identities}
