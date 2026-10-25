from app.trips.store import Trip
from tests.trip_body import trip_body

S, E = "2027-01-01", "2027-01-05"


def _trip(client) -> str:
    body = trip_body(name="Trip", start_date="2027-01-01", end_date="2027-01-12", destination="Lisbon")
    return client.post("/trips", json=body).json()["id"]


def _add(client, tid, place, start, end):
    return client.post(f"/trips/{tid}/stays", json={"place": place, "start_date": start, "end_date": end})


def _rows(stays):
    return [(s["place"], s["start_date"], s["end_date"]) for s in stays]


def test_stored_trip_without_stays_still_loads():
    assert Trip.model_validate({"id": "t1", "name": "Old"}).stays == []


def test_owner_adds_a_stay_to_a_trip_with_none(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    r = _add(a, tid, "Lisbon", S, E)
    assert r.status_code == 201
    assert _rows(r.json()["stays"]) == [("Lisbon", S, E)]
    assert a.get(f"/trips/{tid}").json()["stays"][0]["place"] == "Lisbon"


def test_a_second_stay_is_separate(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    _add(a, tid, "Lisbon", S, E)
    r = _add(a, tid, "Porto", "2027-01-10", "2027-01-12")
    assert [s["place"] for s in r.json()["stays"]] == ["Lisbon", "Porto"]
    assert len({s["id"] for s in r.json()["stays"]}) == 2


def test_change_keeps_id_and_others(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    sid = _add(a, tid, "Lisbon", S, E).json()["stays"][0]["id"]
    _add(a, tid, "Porto", "2027-01-10", "2027-01-12")
    body = {"place": "Faro", "start_date": "2027-01-02", "end_date": "2027-01-06"}
    r = a.put(f"/trips/{tid}/stays/{sid}", json=body)
    assert [x for x in _rows([s for s in r.json()["stays"] if s["id"] == sid])] == [("Faro", "2027-01-02", "2027-01-06")]
    assert len(r.json()["stays"]) == 2
    assert a.put(f"/trips/{tid}/stays/nope", json=body).status_code == 404
    bad = {"place": "Lisbon", "start_date": "2027-01-08", "end_date": "2027-01-04"}
    assert a.put(f"/trips/{tid}/stays/{sid}", json=bad).status_code == 422


def test_remove_deletes_the_stay(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    sid = _add(a, tid, "Lisbon", S, E).json()["stays"][0]["id"]
    r = a.delete(f"/trips/{tid}/stays/{sid}")
    assert r.status_code == 200 and r.json()["stays"] == []
    assert a.delete(f"/trips/{tid}/stays/{sid}").status_code == 404


def test_removing_from_one_trip_leaves_the_other(sign_in_as):
    a = sign_in_as("a@example.com")
    first, second = _trip(a), _trip(a)
    first_stay = _add(a, first, "Lisbon", S, E).json()["stays"][0]["id"]
    _add(a, second, "Porto", "2027-01-10", "2027-01-12")
    a.delete(f"/trips/{first}/stays/{first_stay}")
    assert _rows(a.get(f"/trips/{second}").json()["stays"]) == [("Porto", "2027-01-10", "2027-01-12")]


def test_overlaps_and_gaps_are_saved(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    _add(a, tid, "Lisbon", S, E)
    assert _add(a, tid, "Porto", "2027-01-04", "2027-01-08").status_code == 201
    assert _add(a, tid, "Faro", "2027-02-10", "2027-02-12").status_code == 201


def test_missing_or_reversed_fields_are_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    for body in (
        {"start_date": S, "end_date": E},
        {"place": "  ", "start_date": S, "end_date": E},
        {"place": "Lisbon", "end_date": E},
        {"place": "Lisbon", "start_date": S},
        {"place": "Lisbon", "start_date": "2027-01-08", "end_date": "2027-01-04"},
    ):
        assert a.post(f"/trips/{tid}/stays", json=body).status_code == 422
    assert a.get(f"/trips/{tid}").json()["stays"] == []


def test_stranger_gets_404_and_stays_are_server_owned(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    sid = _add(a, tid, "Lisbon", S, E).json()["stays"][0]["id"]
    body = trip_body(name="Renamed", start_date="2027-01-01", end_date="2027-01-12", destination="Lisbon")
    a.put(f"/trips/{tid}", json={**body, "stays": []})
    assert [s["id"] for s in a.get(f"/trips/{tid}").json()["stays"]] == [sid]
    b = sign_in_as("b@example.com")
    assert _add(b, tid, "Porto", S, E).status_code == 404


def test_the_51st_stay_is_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    for _ in range(50):
        assert _add(a, tid, "Lisbon", S, E).status_code == 201
    r = _add(a, tid, "Lisbon", S, E)
    assert (r.status_code, r.json()) == (422, {"code": "invalid_stay"})
