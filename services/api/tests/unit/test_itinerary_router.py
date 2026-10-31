import pytest

from tests.trip_body import trip_body


def _invite(owner, tid, email):
    r = owner.post(f"/trips/{tid}/editors", json={"email": email})
    editor = next(e for e in r.json()["editors"] if e["email"] == email)
    return editor["invite_url"].rsplit("/", 1)[1]


@pytest.fixture
def trip(sign_in_as):
    owner = sign_in_as("o@example.com")
    body = trip_body(name="Lisbon & Porto", destination="Lisbon", start_date="2026-11-14", end_date="2026-11-16")
    return owner, owner.post("/trips", json=body).json()["id"]


def test_owner_gets_the_itinerary(trip):
    owner, tid = trip
    r = owner.get(f"/trips/{tid}/itinerary")
    assert r.status_code == 200
    assert set(r.json()) == {"cover", "glance", "days", "still_to_schedule", "essentials", "checklist", "notes"}
    assert len(r.json()["checklist"]) == 6
    assert [d["number"] for d in r.json()["days"]] == [1, 2, 3]


def test_accepted_editor_gets_the_itinerary(trip, sign_in_as):
    owner, tid = trip
    ana = sign_in_as("ana@example.com")
    assert ana.post(f"/invites/{_invite(owner, tid, 'ana@example.com')}/accept").status_code == 200
    assert ana.get(f"/trips/{tid}/itinerary").status_code == 200


def test_stranger_and_unaccepted_editor_get_the_missing_trip_answer(trip, sign_in_as):
    owner, tid = trip
    stranger, invited = sign_in_as("eve@example.com"), sign_in_as("ana@example.com")
    _invite(owner, tid, "ana@example.com")
    for client in (stranger, invited):
        r = client.get(f"/trips/{tid}/itinerary")
        assert r.status_code == 404 and r.json() == client.get("/trips/nope/itinerary").json()
        assert "Lisbon" not in r.text and "2026-11-14" not in r.text


def test_money_editors_and_sharing_never_appear(trip):
    owner, tid = trip
    owner.post(f"/trips/{tid}/editors", json={"email": "ana@example.com"})
    owner.post(f"/trips/{tid}/share-link")
    text = owner.get(f"/trips/{tid}/itinerary").text.lower()
    for word in ("total", "fare", "budget", "editors", "share", "invite"):
        assert word not in text


def test_accepted_editor_sees_the_owners_visa_answer(trip, sign_in_as):
    owner, tid = trip
    owner.put("/profile", json={"citizenship": "India", "residence": "India"})
    ana = sign_in_as("ana@example.com")
    ana.post(f"/invites/{_invite(owner, tid, 'ana@example.com')}/accept")
    owner.put(f"/trips/{tid}", json=trip_body(destination="Lisbon, Portugal", start_date="2026-11-14", end_date="2026-11-16"))
    visa = next(f for f in ana.get(f"/trips/{tid}/itinerary").json()["essentials"] if f["key"] == "visa")
    assert visa["value"] == "A visa is required for Portugal."


def test_shared_link_payload_has_no_essentials(trip):
    owner, tid = trip
    token = owner.post(f"/trips/{tid}/share-link").json()["share_token"]
    text = owner.get(f"/shared/{token}").text
    for key in ("essentials", "checklist", "notes"):
        assert f'"{key}"' not in text


def test_reading_does_not_change_the_trip(trip):
    owner, tid = trip
    before = owner.get(f"/trips/{tid}").json()["updated_at"]
    owner.get(f"/trips/{tid}/itinerary")
    assert owner.get(f"/trips/{tid}").json()["updated_at"] == before
