from fastapi import APIRouter, Depends, Response

from app.config import get_settings
from app.places.tiles import InvalidTileError, TileSource, TileUnavailableError
from app.routers import deps
from app.routers.deps import ApiError

router = APIRouter()


@router.get("/places/tiles/{z}/{x}/{y}.png")
def get_tile(z: int, x: int, y: int, source: TileSource = Depends(deps.get_tile_source)) -> Response:
    if not get_settings().map_tiles_enabled:
        raise ApiError(404, "not_found")  # not opted in: no outside call
    try:
        body, content_type = source.fetch(z, x, y)
    except InvalidTileError:
        raise ApiError(400, "invalid_tile")
    except TileUnavailableError:
        raise ApiError(502, "tiles_unavailable")
    return Response(body, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})
