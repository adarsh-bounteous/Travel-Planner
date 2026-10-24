from app.main import app
from app.routers import deps
from app.trips.store import Trip
from tests.trip_body import trip_body


def _trip(client, destination: str | None = "Lisbon") -> str:
    body = trip_body(name="Trip", start_date="2027-03-03", end_date="2027-03-05", destination=destination or "x")
    tid = client.post("/trips", json=body).json()["id"]
    if not destination:  # a trip saved without one, as Trip settings allows
        client.put(f"/trips/{tid}", json={"name": "Trip", "start_date": "2027-03-03", "end_date": "2027-03-05"})
    return tid


def _add(client, tid, name="Cooking class", day="2027-03-04"):
    return client.post(f"/trips/{tid}/activities", json={"name": name, "date": day})


def test_stored_trip_without_activities_still_loads():
    assert Trip.model_validate({"id": "t1", "name": "Old"}).activities == []


def test_owner_adds_a_custom_activity(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    r = _add(a, tid, "  Cooking class ")
    assert r.status_code == 201
    assert [(x["name"], x["date"]) for x in r.json()["activities"]] == [("Cooking class", "2027-03-04")]
    assert r.json()["options"] == []
    assert a.get(f"/trips/{tid}").json()["activities"][0]["name"] == "Cooking class"


def test_blank_names_and_other_days_are_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    for name in ("", "   "):
        assert _add(a, tid, name).status_code == 422
    r = _add(a, tid, day="2027-04-01")
    assert (r.status_code, r.json()) == (422, {"code": "invalid_activity"})
    assert a.get(f"/trips/{tid}").json()["activities"] == []


def test_move_changes_only_the_day(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    aid = _add(a, tid, day="2027-03-03").json()["activities"][0]["id"]
    r = a.put(f"/trips/{tid}/activities/{aid}", json={"date": "2027-03-04"})
    assert [x["date"] for x in r.json()["activities"] if x["id"] == aid] == ["2027-03-04"]
    assert a.put(f"/trips/{tid}/activities/{aid}", json={"date": "2027-04-01"}).status_code == 422
    assert a.put(f"/trips/{tid}/activities/nope", json={"date": "2027-03-04"}).status_code == 404


def test_remove_deletes_the_activity(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    aid = _add(a, tid).json()["activities"][0]["id"]
    r = a.delete(f"/trips/{tid}/activities/{aid}")
    assert r.status_code == 200 and r.json()["activities"] == []
    assert a.delete(f"/trips/{tid}/activities/{aid}").status_code == 404


def test_recommendations_skip_ones_already_on_the_day(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    url = f"/trips/{tid}/days/2027-03-03/recommendations"
    assert a.get(url).json()[0]["name"] == "Tile Museum"
    _add(a, tid, "Tile Museum", "2027-03-03")
    assert "Tile Museum" not in [r["name"] for r in a.get(url).json()]


def test_no_destination_or_unknown_one_has_no_recommendations(sign_in_as):
    a = sign_in_as("a@example.com")
    for destination in (None, "Nowhereville"):
        tid = _trip(a, destination)
        assert a.get(f"/trips/{tid}/days/2027-03-03/recommendations").json() == []


def test_activity_cap(sign_in_as, monkeypatch):
    from app.routers import trips

    monkeypatch.setattr(trips, "MAX_ACTIVITIES", 1)
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    assert _add(a, tid).status_code == 201
    assert _add(a, tid).status_code == 422


def test_other_traveller_gets_404(sign_in_as):
    a = sign_in_as("a@example.com")
    b = sign_in_as("b@example.com")
    tid = _trip(a)
    aid = _add(a, tid).json()["activities"][0]["id"]
    assert _add(b, tid).status_code == 404
    assert b.put(f"/trips/{tid}/activities/{aid}", json={"date": "2027-03-04"}).status_code == 404
    assert b.delete(f"/trips/{tid}/activities/{aid}").status_code == 404
    assert b.get(f"/trips/{tid}/days/2027-03-03/recommendations").status_code == 404


def test_viewer_gets_403(sign_in_as, monkeypatch):
    from app.routers import trips

    a = sign_in_as("a@example.com")
    tid = _trip(a)
    aid = _add(a, tid).json()["activities"][0]["id"]
    monkeypatch.setattr(trips, "can_edit_trip", lambda *args: False)
    assert _add(a, tid).status_code == 403
    assert a.put(f"/trips/{tid}/activities/{aid}", json={"date": "2027-03-04"}).status_code == 403
    assert a.delete(f"/trips/{tid}/activities/{aid}").status_code == 403
