import pytest
from fastapi.testclient import TestClient

from app.local_data import LocalDataFile, LocalDataFileError
from app.main import app
from app.places.search import Place
from app.routers import auth, deps
from app.routers.saved_places import MAX_SAVED
from app.trips.local_saved_store import PersistentSavedPlaceStore
from app.trips.saved_store import DynamoSavedPlaceStore
from tests.unit.test_local_seed_startup import real_local, sign_in_demo  # noqa: F401

PLACE = Place(id="p1", name="Alfama", image_url="/a.jpg", place_type="landmark", price="free", lat=38.711, lng=-9.13)
OTHER = PLACE.model_copy(update={"id": "p2", "name": "Belem"})
RESET = {"X-Local-Reset": "1"}


def make(tmp_path):
    return PersistentSavedPlaceStore(LocalDataFile(tmp_path / "saved-places.json"))


def test_save_then_list(tmp_path):
    store = make(tmp_path)
    store.save("u1", PLACE)
    assert [p.id for p in store.list_saved("u1")] == ["p1"]


def test_unsave_removes_and_absent_id_does_not_raise(tmp_path):
    store = make(tmp_path)
    store.save("u1", PLACE)
    store.unsave("u1", "p1")
    assert store.list_saved("u1") == []
    store.unsave("u1", "p1")


def test_saved_places_survive_a_restart_with_every_field(tmp_path):
    make(tmp_path).save("u1", PLACE)
    again = make(tmp_path)
    assert again.list_saved("u1") == [PLACE]


def test_removal_persists_across_restart(tmp_path):
    store = make(tmp_path)
    store.save("u1", PLACE)
    store.unsave("u1", "p1")
    assert make(tmp_path).list_saved("u1") == []


def test_owners_are_separate_and_order_is_kept(tmp_path):
    store = make(tmp_path)
    store.save("u1", OTHER)
    store.save("u1", PLACE)
    store.save("u2", PLACE)
    again = make(tmp_path)
    assert [p.id for p in again.list_saved("u1")] == ["p2", "p1"]
    assert [p.id for p in again.list_saved("u2")] == ["p1"]


def test_saving_twice_keeps_one_entry_even_after_restart(tmp_path):
    store = make(tmp_path)
    store.save("u1", PLACE)
    store.save("u1", PLACE)
    assert len(store.list_saved("u1")) == 1
    assert len(make(tmp_path).list_saved("u1")) == 1


def test_reset_empties_and_persists(tmp_path):
    store = make(tmp_path)
    store.save("u1", PLACE)
    store.reset()
    assert store.list_saved("u1") == []
    assert make(tmp_path).list_saved("u1") == []


@pytest.mark.parametrize("content", ["{not json", '{"version": 2, "saved": []}', '{"version": 1, "saved": [{}]}'])
def test_bad_file_raises(tmp_path, content):
    (tmp_path / "saved-places.json").write_text(content)
    with pytest.raises(LocalDataFileError):
        make(tmp_path)


def test_local_mode_uses_the_file_store_and_never_boto3(real_local, monkeypatch):  # noqa: F811
    import boto3

    def boom(*a, **k):
        raise AssertionError("boto3 used")

    monkeypatch.setattr(boto3, "resource", boom)
    deps._local_saved_places.cache_clear()
    assert isinstance(deps.get_saved_places(), PersistentSavedPlaceStore)


def test_cloud_mode_uses_dynamo(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    monkeypatch.setattr(deps, "_saved_places", lambda: DynamoSavedPlaceStore.__new__(DynamoSavedPlaceStore))
    assert isinstance(deps.get_saved_places(), DynamoSavedPlaceStore)


@pytest.fixture
def client(real_local):  # noqa: F811
    deps._local_saved_places.cache_clear()
    with TestClient(app) as c:
        assert sign_in_demo(c).status_code == 200
        yield c
    deps._local_saved_places.cache_clear()


def test_router_save_list_remove(client):
    assert client.put("/saved-places/p1", json=PLACE.model_dump()).status_code == 200
    listed = client.get("/saved-places").json()
    assert [p["id"] for p in listed] == ["p1"]
    assert set(listed[0]) == set(Place.model_fields)
    assert client.delete("/saved-places/p1").status_code == 204
    assert client.get("/saved-places").json() == []


def test_router_repeat_save_is_one_entry_without_error_and_survives_restart(client):
    first = client.put("/saved-places/p1", json=PLACE.model_dump())
    second = client.put("/saved-places/p1", json=PLACE.model_dump())
    assert second.status_code == 200
    assert second.json() == first.json()
    deps._local_saved_places.cache_clear()
    assert len(client.get("/saved-places").json()) == 1


def test_resave_when_list_is_full_is_not_rejected(client):
    me = auth._local_identity().user_id_for("demo@example.com")
    store = deps._local_saved_places()
    for i in range(MAX_SAVED):
        store.save(me, PLACE.model_copy(update={"id": f"x{i}"}))
    assert client.put("/saved-places/x0", json={**PLACE.model_dump(), "id": "x0"}).status_code == 200
    assert client.put("/saved-places/new", json={**PLACE.model_dump(), "id": "new"}).status_code == 422


def test_reset_empties_saved_places_for_good(client):
    client.put("/saved-places/p1", json=PLACE.model_dump())
    assert client.post("/local/reset", headers=RESET).status_code == 204
    assert deps._local_saved_places().list_saved("anyone") == []
    deps._local_saved_places.cache_clear()
    assert make_from_settings().list_saved("anyone") == []


def make_from_settings():
    return deps._local_saved_places()
