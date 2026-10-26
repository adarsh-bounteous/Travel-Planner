from dataclasses import asdict

from fastapi import APIRouter, Request

from app.config import get_settings
from app.local_mode import stand_ins_for
from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD
from app.routers.auth import get_identity

router = APIRouter()


def _demo_account(request: Request) -> dict[str, str] | None:
    """The demo sign-in details, once the demo user exists. Only called with local mode on."""
    # Resolved here, not as a dependency, so nothing is built when local mode is off.
    provider = request.app.dependency_overrides.get(get_identity, get_identity)
    try:
        exists = provider().account_exists(DEMO_EMAIL)
    except Exception:  # the hint is optional: no local sign-in yet means no hint, never a failed status
        return None
    return {"email": DEMO_EMAIL, "password": DEMO_PASSWORD} if exists else None


@router.get("/startup-status")
def startup_status(request: Request) -> dict[str, object]:
    settings = get_settings()
    return {
        "local_mode": settings.local_mode,
        "stand_ins": asdict(stand_ins_for(settings.local_mode)),
        "demo_account": _demo_account(request) if settings.local_mode else None,
    }
