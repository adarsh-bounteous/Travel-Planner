from fastapi.testclient import TestClient

from app.main import app
from app.places.search import Place

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
