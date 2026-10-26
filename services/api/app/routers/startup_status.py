from dataclasses import asdict

from fastapi import APIRouter

from app.config import get_settings
from app.local_mode import stand_ins_for
from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD
from app.routers import deps

router = APIRouter()


def _demo_account() -> dict[str, str] | None:
    """The demo sign-in details once the demo user exists. Only called with local mode on."""
    target = deps.get_local_seed_target()
    if target is None or not target.identity.account_exists(DEMO_EMAIL):
        return None
    return {"email": DEMO_EMAIL, "password": DEMO_PASSWORD}


@router.get("/startup-status")
def startup_status() -> dict[str, object]:
    # get_settings() refuses local mode outside the local environment, so the demo password
    # can only be returned where local mode is allowed.
    settings = get_settings()
    return {
        "local_mode": settings.local_mode,
        "stand_ins": asdict(stand_ins_for(settings.local_mode)),
        "demo_account": _demo_account() if settings.local_mode else None,
    }
