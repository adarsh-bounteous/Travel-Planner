from dataclasses import asdict

from fastapi import APIRouter

from app.config import get_settings
from app.local_mode import stand_ins_for

router = APIRouter()


@router.get("/startup-status")
def startup_status() -> dict[str, object]:
    settings = get_settings()
    return {
        "local_mode": settings.local_mode,
        "stand_ins": asdict(stand_ins_for(settings.local_mode)),
    }
