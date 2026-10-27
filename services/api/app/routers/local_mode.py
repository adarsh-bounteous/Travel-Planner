import os

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import get_settings
from app.local_mode import LocalModeRefusedError, resolve_local_mode, set_local_mode_override
from app.routers.deps import ApiError, get_current_user

router = APIRouter(prefix="/local")


class LocalModeBody(BaseModel):
    on: bool


@router.get("/mode")
def get_mode(_: str = Depends(get_current_user)) -> dict[str, bool]:
    return {"local_mode": get_settings().local_mode}


@router.put("/mode")
def put_mode(body: LocalModeBody, _: str = Depends(get_current_user)) -> dict[str, bool]:
    """Turn the shared switch on or off for this process. A live deployment refuses On and stays Off."""
    try:
        resolve_local_mode(os.environ, body.on)  # the one refusal rule, before anything is stored
    except LocalModeRefusedError:
        raise ApiError(409, "local_mode_not_allowed")
    set_local_mode_override(body.on)
    return {"local_mode": get_settings().local_mode}
