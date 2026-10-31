from fastapi import APIRouter, Depends

from app.providers.registry import ProviderRegistry
from app.routers import deps
from app.routers.deps import require_local_mode

router = APIRouter()


@router.get("/providers/status", dependencies=[Depends(require_local_mode)])
def providers_status(registry: ProviderRegistry = Depends(deps.get_provider_registry)) -> dict[str, object]:
    return {"providers": registry.statuses(deps.secret_reader())}
