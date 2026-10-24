from fastapi import APIRouter, Depends, HTTPException, Response

from app.places.search import Place
from app.routers.deps import get_current_user, get_saved_places
from app.trips.saved_store import SavedPlaceStore

router = APIRouter(prefix="/saved-places")

MAX_SAVED = 500
MAX_ID = 100
MAX_NAME = 200
MAX_URL = 2048


def _safe_image_url(url: str) -> bool:
    """An https URL or a same-origin path; never another scheme or a protocol-relative URL."""
    return url.startswith("https://") or (url.startswith("/") and not url.startswith("//"))


@router.get("")
def list_saved(
    owner: str = Depends(get_current_user), saved: SavedPlaceStore = Depends(get_saved_places)
) -> list[Place]:
    return saved.list_saved(owner)


@router.put("/{place_id}")
def save_place(
    place_id: str,
    body: Place,
    owner: str = Depends(get_current_user),
    saved: SavedPlaceStore = Depends(get_saved_places),
) -> Place:
    if body.id != place_id:
        raise HTTPException(422, "place id in the body must match the path")
    # The snapshot is client-supplied and rendered later, so bound it and the account item's size.
    if (
        len(body.id) > MAX_ID
        or len(body.name) > MAX_NAME
        or len(body.image_url) > MAX_URL
        or not _safe_image_url(body.image_url)
    ):
        raise HTTPException(422, "invalid place")
    current = saved.list_saved(owner)
    if len(current) >= MAX_SAVED and all(p.id != body.id for p in current):
        raise HTTPException(422, "too many saved places")
    saved.save(owner, body)
    return body


@router.delete("/{place_id}", status_code=204)
def unsave_place(
    place_id: str,
    owner: str = Depends(get_current_user),
    saved: SavedPlaceStore = Depends(get_saved_places),
) -> Response:
    saved.unsave(owner, place_id)
    return Response(status_code=204)
