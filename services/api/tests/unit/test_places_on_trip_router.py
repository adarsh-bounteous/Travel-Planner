from app.trips.store import Trip

PLACE = {"place_id": "alfama", "name": "Alfama", "image_url": "/a.jpg"}


def _trip(client) -> str:
    return client.post("/trips", json={"name": "Trip"}).json()["id"]


def _add(client, tid, **overrides):
    return client.post(f"/trips/{tid}/places", json={**PLACE, **overrides})


def test_stored_trip_without_places_still_loads():
    assert Trip.model_validate({"id": "t1", "name": "Old trip"}).places == []


def test_place_is_added_with_no_day(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    r = _add(a, tid)
    assert r.status_code == 201
    assert [p["place_id"] for p in r.json()["places"]] == ["alfama"]
    assert "date" not in r.json()["places"][0]
    assert a.get(f"/trips/{tid}").json()["places"][0]["name"] == "Alfama"


def test_same_place_is_not_added_twice(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    _add(a, tid)
    second = _add(a, tid, name="Alfama again")
    assert (second.status_code, second.json()) == (409, {"code": "already_on_trip"})
    assert len(a.get(f"/trips/{tid}").json()["places"]) == 1


def test_stranger_gets_404_and_empty_name_422(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    assert _add(a, tid, name="  ").status_code == 422
    b = sign_in_as("b@example.com")
    assert _add(b, tid).status_code == 404


def test_place_limit(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    for n in range(200):
        assert _add(a, tid, place_id=f"p{n}").status_code == 201
    r = _add(a, tid, place_id="one-too-many")
    assert (r.status_code, r.json()) == (422, {"code": "invalid_place"})
