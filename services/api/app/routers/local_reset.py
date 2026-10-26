from datetime import date

from fastapi import APIRouter, Depends, Response

from app.local_seed import run_first_start_seed
from app.routers import deps
from app.routers.auth import SESSION_COOKIE, _local_accounts, _local_identity
from app.routers.deps import require_local_mode

router = APIRouter(prefix="/local")


@router.post("/reset", status_code=204)
def reset_local_data(_: None = Depends(require_local_mode)) -> Response:
    """Empty every local store, restore the demo data and sign the caller out. 404 with local mode off."""
    _local_identity().reset()
    _local_accounts().reset()
    deps._local_trips().reset()
    deps._local_invite_sender().reset()
    run_first_start_seed(deps.get_local_seed_target(), date.today())
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response
