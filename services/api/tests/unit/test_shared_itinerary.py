import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.trip_body import trip_body


@pytest.fixture
def shared(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = owner.post("/trips", json=trip_body(name="Lisbon", destination="Lisbon", start_date="2026-11-14", end_date="2026-11-16")).json()["id"]
    token = owner.post(f"/trips/{tid}/share-link").json()["share_url"].rsplit("/", 1)[1]
    return owner, tid, token, TestClient(app)


def _set(owner, tid, show):
    return owner.put(f"/trips/{tid}/share-link/itinerary", json={"show": show})


def test_a_new_link_shows_nothing_of_the_plan(shared):
    owner, tid, token, anon = shared
    body = anon.get(f"/shared/{token}").json()
    assert body["itinerary_shared"] is False and body["itinerary"] is None
    assert body["days"] == [] and body["activities"] == [] and body["options"] == [] and body["restaurants"] == []
    assert owner.get(f"/trips/{tid}").json()["share_itinerary"] is False


def test_switching_on_serves_the_complete_document_without_edit_links(shared):
    owner, tid, token, anon = shared
    assert _set(owner, tid, True).json()["share_itinerary"] is True
    body = anon.get(f"/shared/{token}").json()
    assert body["itinerary_shared"] is True
    assert body["itinerary"]["money"]["cost"]["total"] is not None
    assert body["itinerary"]["essentials"]
    assert len(body["itinerary"]["days"]) == 3
    assert all(n["add_path"] is None for n in body["itinerary"]["money"]["not_included"])
    assert all(b["link_url"] is None for b in body["itinerary"]["money"]["bookings"])


def test_shared_document_never_uses_the_owner_private_profile(shared):
    owner, tid, token, anon = shared
    owner.put("/profile", json={"citizenship": "India", "residence": "India", "pregnant": True, "vaccinations_had": ["Typhoid"]})
    _set(owner, tid, True)
    text = anon.get(f"/shared/{token}").text.lower()
    assert "typhoid" not in text and "pregnan" not in text
    essentials = {f["key"]: f for f in anon.get(f"/shared/{token}").json()["itinerary"]["essentials"]}
    assert "medical" not in essentials


def test_switching_off_hides_it_again_and_revoking_resets(shared):
    owner, tid, token, anon = shared
    _set(owner, tid, True)
    assert _set(owner, tid, False).status_code == 200
    assert anon.get(f"/shared/{token}").json()["itinerary"] is None
    _set(owner, tid, True)
    owner.delete(f"/trips/{tid}/share-link")
    owner.post(f"/trips/{tid}/share-link")
    assert owner.get(f"/trips/{tid}").json()["share_itinerary"] is False


def test_without_a_link_it_is_a_conflict(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = owner.post("/trips", json=trip_body()).json()["id"]
    r = _set(owner, tid, True)
    assert r.status_code == 409 and r.json() == {"code": "no_share_link"}


def test_editor_and_stranger_get_the_missing_trip_answer(shared, sign_in_as):
    owner, tid, token, anon = shared
    r = owner.post(f"/trips/{tid}/editors", json={"email": "ana@example.com"})
    invite = next(e for e in r.json()["editors"])["invite_url"].rsplit("/", 1)[1]
    ana, eve = sign_in_as("ana@example.com"), sign_in_as("eve@example.com")
    ana.post(f"/invites/{invite}/accept")
    for client in (ana, eve):
        r = _set(client, tid, True)
        assert r.status_code == 404 and r.json() == _set(client, "nope", True).json()
    assert ana.get(f"/trips/{tid}").json()["share_itinerary"] is False


def test_a_trip_stored_without_the_flag_loads_off():
    from app.trips.store import Trip

    stored = Trip(id="t1", name="Old").model_dump(exclude={"share_itinerary"})
    assert Trip(**stored).share_itinerary is False
