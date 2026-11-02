import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.places.search import Place, PlacePhoto

PLACE = Place(
    id="alfama",
    name="Alfama",
    image_url="/alfama.jpg",
    place_type="landmark",
    price="free",
    lat=38.711,
    lng=-9.130,
)


def test_save_then_list(sign_in_as):
    a = sign_in_as("a@example.com")
    assert a.put("/saved-places/alfama", json=PLACE.model_dump()).status_code == 200
    assert [p["id"] for p in a.get("/saved-places").json()] == ["alfama"]


def test_save_is_idempotent_and_unsave_removes(sign_in_as):
    a = sign_in_as("a@example.com")
    a.put("/saved-places/alfama", json=PLACE.model_dump())
    a.put("/saved-places/alfama", json=PLACE.model_dump())
    assert len(a.get("/saved-places").json()) == 1
    assert a.delete("/saved-places/alfama").status_code == 204
    assert a.delete("/saved-places/alfama").status_code == 204
    assert a.get("/saved-places").json() == []


def test_saved_places_are_per_traveller(sign_in_as):
    a, b = sign_in_as("a@example.com"), sign_in_as("b@example.com")
    a.put("/saved-places/alfama", json=PLACE.model_dump())
    assert b.get("/saved-places").json() == []


def test_snapshot_fields_are_constrained(sign_in_as):
    a = sign_in_as("a@example.com")
    for bad in (
        {"image_url": "javascript:alert(1)"},
        {"image_url": "//evil.example/x.jpg"},
        {"image_url": "https://x.example/" + "a" * 3000},
        {"name": "n" * 500},
        {"id": "i" * 500},
    ):
        body = {**PLACE.model_dump(), **bad}
        assert a.put(f"/saved-places/{body['id']}", json=body).status_code == 422
    assert a.get("/saved-places").json() == []


def test_saved_places_per_account_are_capped(sign_in_as, monkeypatch):
    from app.routers import saved_places

    monkeypatch.setattr(saved_places, "MAX_SAVED", 2)
    a = sign_in_as("a@example.com")
    for pid in ("a", "b"):
        assert a.put(f"/saved-places/{pid}", json={**PLACE.model_dump(), "id": pid}).status_code == 200
    over = {**PLACE.model_dump(), "id": "c"}
    assert a.put("/saved-places/c", json=over).status_code == 422
    # Re-saving one already saved is still fine.
    assert a.put("/saved-places/a", json={**PLACE.model_dump(), "id": "a"}).status_code == 200


def test_signed_out_is_rejected_and_mismatched_id_is_422(sign_in_as):
    a = sign_in_as("a@example.com")
    assert TestClient(app).get("/saved-places").status_code == 401
    assert a.put("/saved-places/other", json=PLACE.model_dump()).status_code == 422


def test_local_placeholder_image_can_be_saved(sign_in_as):
    from app.places.local_search import PLACEHOLDER_IMAGE

    a = sign_in_as("a@example.com")
    body = {**PLACE.model_dump(), "image_url": PLACEHOLDER_IMAGE}
    assert a.put("/saved-places/alfama", json=body).status_code == 200
    other = {**body, "image_url": "data:text/html,<script>1</script>"}
    assert a.put("/saved-places/alfama", json=other).status_code == 422


def _photo_place(**photo):
    credit = PlacePhoto(
        **{"author": "Ana", "licence": "CC BY 4.0", "file_url": "https://commons.wikimedia.org/wiki/File:A.jpg", **photo}
    )
    return PLACE.model_copy(
        update={"image_url": "https://upload.wikimedia.org/a.jpg", "photo": credit, "photo_unavailable": True}
    ).model_dump()


def test_saved_place_keeps_the_credit_but_not_the_thumbnail(sign_in_as):  # AC7, AC8
    from app.places.local_search import PLACEHOLDER_IMAGE

    a = sign_in_as("a@example.com")
    assert a.put("/saved-places/alfama", json=_photo_place()).status_code == 200
    saved = a.get("/saved-places").json()[0]
    assert saved["image_url"] == PLACEHOLDER_IMAGE and saved["photo"]["licence"] == "CC BY 4.0"
    assert saved["photo_unavailable"] is False


@pytest.mark.parametrize(
    "file_url",
    ["javascript:alert(1)", "https://evil.example/wiki/File:A.jpg", "http://commons.wikimedia.org/wiki/File:A.jpg"],
)
def test_photo_with_a_bad_file_page_is_refused(sign_in_as, file_url):
    a = sign_in_as("a@example.com")
    assert a.put("/saved-places/alfama", json=_photo_place(file_url=file_url)).status_code == 422


def test_photo_with_an_oversized_credit_is_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    assert a.put("/saved-places/alfama", json=_photo_place(author="x" * 1000)).status_code == 422


def test_place_saved_before_photos_still_lists(sign_in_as):
    a = sign_in_as("a@example.com")
    old = {k: v for k, v in PLACE.model_dump().items() if k not in ("photo", "photo_unavailable")}
    a.put("/saved-places/alfama", json=old)
    saved = a.get("/saved-places").json()[0]
    assert saved["photo"] is None and saved["image_url"] == "/alfama.jpg"
