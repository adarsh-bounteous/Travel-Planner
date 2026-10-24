from fastapi import APIRouter, Depends, HTTPException, Response

from app.places.search import Place
from app.routers.deps import get_current_user, get_saved_places
from app.trips.saved_store import SavedPlaceStore

router = APIRouter(prefix="/saved-places")


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
