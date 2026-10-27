from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings
from app.local_mode import LOCAL_ENVIRONMENT
from app.routers.deps import ApiError

router = APIRouter(prefix="/local")


class LocalModeRequest(BaseModel):
    local_mode: bool


@router.put("/mode")
def set_local_mode(body: LocalModeRequest) -> dict[str, bool]:
    """Refuse turning local mode on in a live deployment; the switch itself is set at startup.

    Always answers the effective value, which this route never changes.
    """
    settings = get_settings()
    if body.local_mode and settings.environment != LOCAL_ENVIRONMENT:
        raise ApiError(403, "local_mode_not_allowed")
    return {"local_mode": settings.local_mode}
