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
    response = a.put(f"/trips/{trip_id}", json={"name": "Lisbon 2", "start_date": "2026-05-01", "end_date": "2026-05-02"})
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


def _lisbon(a):
    body = {"name": "Lisbon", "start_date": "2027-03-03", "end_date": "2027-03-05"}
    return a.post("/trips", json=body).json()["id"]


def _dates(trip):
    return [d["date"] for d in trip["days"]]


def test_days_are_derived_from_the_dates_in_order(sign_in_as):
    a = sign_in_as("a@example.com")
    trip = a.get(f"/trips/{_lisbon(a)}").json()
    assert _dates(trip) == ["2027-03-03", "2027-03-04", "2027-03-05"]
    assert [d["name"] for d in trip["days"]] == ["Day 1", "Day 2", "Day 3"]
    assert trip["is_owner"] is True


def test_owner_renames_trip_and_changes_budget(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    body = {"name": "Lisbon Spring", "start_date": "2027-03-03", "end_date": "2027-03-05", "budget": 1500}
    assert a.put(f"/trips/{tid}", json=body).status_code == 200
    trip = a.get(f"/trips/{tid}").json()
    assert trip["name"] == "Lisbon Spring"
    assert trip["budget"] == 1500
    assert trip["currency"] == "EUR"


def test_owner_renames_a_day(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    r = a.put(f"/trips/{tid}/days/2027-03-03", json={"name": "Arrival"})
    assert r.json()["days"][0]["name"] == "Arrival"
    assert a.put(f"/trips/{tid}/days/2027-04-01", json={"name": "x"}).status_code == 404


def test_blank_names_are_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    assert a.put(f"/trips/{tid}", json={"name": "   "}).status_code == 422
    assert a.get(f"/trips/{tid}").json()["name"] == "Lisbon"
    assert a.put(f"/trips/{tid}/days/2027-03-03", json={"name": " "}).status_code == 422
    assert a.get(f"/trips/{tid}").json()["days"][0]["name"] == "Day 1"


def test_bad_budget_is_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    assert a.put(f"/trips/{tid}", json={"name": "Lisbon", "budget": -5}).status_code == 422
    assert a.put(f"/trips/{tid}", json={"name": "Lisbon", "budget": "abc"}).status_code == 422
    assert a.get(f"/trips/{tid}").json()["budget"] is None


def test_bad_date_ranges_are_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    assert a.post("/trips", json={"name": "x", "start_date": "2027-03-05", "end_date": "2027-03-03"}).status_code == 422
    assert a.post("/trips", json={"name": "x", "start_date": "2027-03-01", "end_date": "2027-06-01"}).status_code == 422
    assert a.post("/trips", json={"name": "x", "start_date": "2027-03-01"}).status_code == 422


def test_changing_dates_keeps_names_adds_and_removes_days(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    a.put(f"/trips/{tid}/days/2027-03-04", json={"name": "Beach day"})
    body = {"name": "Lisbon", "start_date": "2027-03-04", "end_date": "2027-03-06"}
    after = a.put(f"/trips/{tid}", json=body).json()
    names = {d["date"]: d["name"] for d in after["days"]}
    assert names["2027-03-04"] == "Beach day"
    assert "2027-03-06" in names
    assert "2027-03-03" not in names


def test_update_keeps_options_and_currency(sign_in_as):
    from app.main import app
    from app.routers import deps
    from app.trips.store import ChosenOption

    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    store = app.dependency_overrides[deps.get_trips]()
    owner = next(iter(store._trips))[0]
    trip = store.get_trip(owner, tid)
    trip.options = [ChosenOption(id="o1", title="Tram pass", category="Conveyance", date="2027-03-04")]
    trip.currency = "GBP"
    store.save_trip(owner, trip)
    body = {"name": "Lisbon 2", "start_date": "2027-03-03", "end_date": "2027-03-05"}
    after = a.put(f"/trips/{tid}", json=body).json()
    assert [o["title"] for o in after["options"]] == ["Tram pass"]
    assert after["currency"] == "GBP"


def test_booking_url_round_trips_and_is_optional(sign_in_as):
    from app.main import app
    from app.routers import deps
    from app.trips.store import ChosenOption

    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    store = app.dependency_overrides[deps.get_trips]()
    owner = next(iter(store._trips))[0]
    trip = store.get_trip(owner, tid)
    trip.options = [
        ChosenOption(
            id="o1",
            title="Tram pass",
            category="Conveyance",
            date="2027-03-04",
            booking_url="https://example.com/tram",
        ),
        ChosenOption(id="o2", title="Walk", category="Attractions", date="2027-03-04"),
    ]
    store.save_trip(owner, trip)
    options = a.get(f"/trips/{tid}").json()["options"]
    assert options[0]["booking_url"] == "https://example.com/tram"
    assert options[1]["booking_url"] is None


def test_booking_url_must_be_http_or_https():
    import pytest
    from pydantic import ValidationError

    from app.trips.store import ChosenOption

    with pytest.raises(ValidationError):
        ChosenOption(id="o3", title="x", category="y", date="2027-03-04", booking_url="javascript:alert(1)")


def test_legacy_trip_without_days_gets_derived_days(sign_in_as):
    from app.main import app
    from app.routers import deps
    from app.trips.store import Trip

    a = sign_in_as("a@example.com")
    store = app.dependency_overrides[deps.get_trips]()
    _lisbon(a)
    owner = next(iter(store._trips))[0]
    store.save_trip(owner, Trip(id="old", name="Old", start_date="2027-03-03", end_date="2027-03-04"))
    assert _dates(a.get("/trips/old").json()) == ["2027-03-03", "2027-03-04"]
    assert store.get_trip(owner, "old").days == []


def test_owner_deletes_a_trip_and_others_cannot(sign_in_as):
    a = sign_in_as("a@example.com")
    b = sign_in_as("b@example.com")
    tid = _lisbon(a)
    assert b.delete(f"/trips/{tid}").status_code == 404
    assert a.get(f"/trips/{tid}").status_code == 200
    assert a.delete(f"/trips/{tid}").status_code == 204
    assert a.get(f"/trips/{tid}").status_code == 404
    assert a.delete(f"/trips/{tid}").status_code == 404


def test_list_is_newest_updated_first(sign_in_as):  # AC9
    from datetime import UTC, datetime, timedelta

    from app.routers import auth

    a = sign_in_as("a@example.com")
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    try:
        app.dependency_overrides[auth.get_now] = lambda: t0
        first = a.post("/trips", json={"name": "Lisbon"}).json()["id"]
        app.dependency_overrides[auth.get_now] = lambda: t0 + timedelta(days=1)
        a.post("/trips", json={"name": "Oslo"})
        app.dependency_overrides[auth.get_now] = lambda: t0 + timedelta(days=2)
        a.put(f"/trips/{first}", json={"name": "Lisbon 2"})
        assert [t["name"] for t in a.get("/trips").json()] == ["Lisbon 2", "Oslo"]
    finally:
        app.dependency_overrides[auth.get_now] = lambda: t0
