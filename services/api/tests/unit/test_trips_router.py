from fastapi.testclient import TestClient

from app.main import app


def test_each_traveller_lists_only_their_own_trips(sign_in_as):
    a = sign_in_as("a@example.com")
    b = sign_in_as("b@example.com")
    a.post("/trips", json={"name": "Lisbon"})
    b.post("/trips", json={"name": "Oslo"})
    assert [t["name"] for t in a.get("/trips").json()] == ["Lisbon"]
    assert [t["name"] for t in b.get("/trips").json()] == ["Oslo"]


def test_saved_trip_is_listed(sign_in_as):
    a = sign_in_as("a@example.com")
    response = a.post("/trips", json={"name": "Lisbon", "destination": "Portugal"})
    assert response.status_code == 201
    assert response.json()["id"]
    assert [t["id"] for t in a.get("/trips").json()] == [response.json()["id"]]


def test_other_traveller_cannot_open_or_change_a_trip(sign_in_as):
    a = sign_in_as("a@example.com")
    b = sign_in_as("b@example.com")
    trip_id = a.post("/trips", json={"name": "Lisbon"}).json()["id"]
    assert b.get(f"/trips/{trip_id}").status_code == 404
    assert b.get(f"/trips/{trip_id}").json() == {"code": "not_found"}
    assert b.put(f"/trips/{trip_id}", json={"name": "Hijacked"}).status_code == 404
    assert a.get(f"/trips/{trip_id}").json()["name"] == "Lisbon"
    assert [t["name"] for t in b.get("/trips").json()] == []


def test_owner_can_update_a_trip(sign_in_as):
    a = sign_in_as("a@example.com")
    trip_id = a.post("/trips", json={"name": "Lisbon"}).json()["id"]
    response = a.put(f"/trips/{trip_id}", json={"name": "Lisbon 2", "start_date": "2026-05-01"})
    assert response.status_code == 200
    assert a.get(f"/trips/{trip_id}").json()["name"] == "Lisbon 2"
    assert a.get(f"/trips/{trip_id}").json()["start_date"] == "2026-05-01"


def test_body_cannot_name_an_owner(sign_in_as):
    a = sign_in_as("a@example.com")
    b = sign_in_as("b@example.com")
    a.post("/trips", json={"name": "Lisbon", "owner_id": "user-2", "id": "chosen"})
    assert [t["name"] for t in b.get("/trips").json()] == []
    assert a.get("/trips").json()[0]["id"] != "chosen"


def test_signed_out_calls_are_rejected(sign_in_as):
    sign_in_as("a@example.com")
    client = TestClient(app)
    assert client.get("/trips").status_code == 401
    assert client.get("/trips").json() == {"code": "not_signed_in"}
    assert client.post("/trips", json={"name": "x"}).status_code == 401
    assert client.get("/trips/abc").status_code == 401
    assert client.put("/trips/abc", json={"name": "x"}).status_code == 401
