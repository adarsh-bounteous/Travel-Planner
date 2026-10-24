from datetime import date

from app.main import app
from app.routers import deps
from app.trips.store import ChosenOption, Reminder, Trip, can_edit_trip, visible_reminders
from tests.trip_body import trip_body


def _lisbon(client) -> str:
    body = trip_body(start_date="2027-03-03", end_date="2027-03-05")
    return client.post("/trips", json=body).json()["id"]


def _store_and_owner():
    store = app.dependency_overrides[deps.get_trips]()
    return store, next(iter(store._trips))[0]


def _with_option(tid: str, day: str = "2027-03-04"):
    store, owner = _store_and_owner()
    trip = store.get_trip(owner, tid)
    trip.options = [ChosenOption(id="o1", title="Museum visit", category="Activity", date=day)]
    store.save_trip(owner, trip)
    return store, owner


def test_owner_adds_a_trip_reminder(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    r = a.post(f"/trips/{tid}/reminders", json={"text": "Pack passports", "date": "2027-03-04"})
    assert r.status_code == 201
    note = r.json()["reminders"][0]
    assert (note["text"], note["date"], note["option_id"]) == ("Pack passports", "2027-03-04", None)
    assert a.get(f"/trips/{tid}").json()["reminders"][0]["date"] == "2027-03-04"
    assert a.get(f"/trips/{tid}").json()["can_edit"] is True


def test_invalid_reminders_are_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    url = f"/trips/{tid}/reminders"
    assert a.post(url, json={"text": "x", "date": "2027-04-01"}).status_code == 422
    assert a.post(url, json={"text": "x", "date": "2027-04-01"}).json() == {"code": "invalid_reminder"}
    assert a.post(url, json={"text": "   ", "date": "2027-03-04"}).status_code == 422
    assert a.post(url, json={"text": "x", "date": "2027-03-04", "option_id": "nope"}).status_code == 422
    assert a.get(f"/trips/{tid}").json()["reminders"] == []


def test_reminder_on_an_activity_records_its_day(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    _with_option(tid)
    body = {"text": "Book timed tickets", "date": "2027-03-04", "option_id": "o1"}
    note = a.post(f"/trips/{tid}/reminders", json=body).json()["reminders"][0]
    assert note["option_id"] == "o1" and note["option_date"] == "2027-03-04"


def test_owner_edits_a_reminder(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    url = f"/trips/{tid}/reminders"
    rid = a.post(url, json={"text": "Pack passports", "date": "2027-03-04"}).json()["reminders"][0]["id"]
    r = a.put(f"{url}/{rid}", json={"text": "Pack passports", "date": "2027-03-05"})
    assert [n["date"] for n in r.json()["reminders"]] == ["2027-03-05"]
    assert a.put(f"{url}/{rid}", json={"text": "x", "date": "2027-06-01"}).status_code == 422
    assert [n["date"] for n in a.get(f"/trips/{tid}").json()["reminders"]] == ["2027-03-05"]
    assert a.put(f"{url}/missing", json={"text": "x", "date": "2027-03-04"}).status_code == 404


def test_owner_deletes_a_reminder(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    url = f"/trips/{tid}/reminders"
    rid = a.post(url, json={"text": "Pack passports", "date": "2027-03-04"}).json()["reminders"][0]["id"]
    assert a.delete(f"{url}/{rid}").json()["reminders"] == []
    assert a.delete(f"{url}/{rid}").status_code == 404


def test_other_traveller_cannot_reach_reminders(sign_in_as):
    a = sign_in_as("a@example.com")
    b = sign_in_as("b@example.com")
    tid = _lisbon(a)
    assert b.post(f"/trips/{tid}/reminders", json={"text": "x", "date": "2027-03-04"}).status_code == 404


def test_viewer_gets_403_on_every_write(sign_in_as, monkeypatch):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    url = f"/trips/{tid}/reminders"
    rid = a.post(url, json={"text": "x", "date": "2027-03-04"}).json()["reminders"][0]["id"]
    monkeypatch.setattr("app.routers.trips.can_edit_trip", lambda *args: False)
    assert a.post(url, json={"text": "x", "date": "2027-03-04"}).status_code == 403
    assert a.post(url, json={"text": "x", "date": "2027-03-04"}).json() == {"code": "forbidden"}
    assert a.put(f"{url}/{rid}", json={"text": "y", "date": "2027-03-04"}).status_code == 403
    assert a.delete(f"{url}/{rid}").status_code == 403
    view = a.get(f"/trips/{tid}").json()
    assert view["can_edit"] is False and len(view["reminders"]) == 1


def test_can_edit_trip_is_owner_or_editor():
    trip = Trip(id="t", name="x")
    assert can_edit_trip(trip, "u1", "u1") is True
    assert can_edit_trip(trip, "u2", "u1") is False


def test_moving_or_removing_an_activity_hides_its_reminder(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    store, owner = _with_option(tid)
    url = f"/trips/{tid}/reminders"
    a.post(url, json={"text": "Tickets", "date": "2027-03-04", "option_id": "o1"})
    a.post(url, json={"text": "Passports", "date": "2027-03-04"})
    trip = store.get_trip(owner, tid)
    trip.options[0].date = date(2027, 3, 5)
    store.save_trip(owner, trip)
    assert [n["text"] for n in a.get(f"/trips/{tid}").json()["reminders"]] == ["Passports"]
    trip.options = []
    store.save_trip(owner, trip)
    assert [n["text"] for n in a.get(f"/trips/{tid}").json()["reminders"]] == ["Passports"]


def test_visible_reminders_when_option_moves_back():
    option = ChosenOption(id="o1", title="M", category="c", date=date(2027, 3, 4))
    note = Reminder(id="r", text="t", date=date(2027, 3, 4), option_id="o1", option_date=date(2027, 3, 4))
    trip = Trip(id="t", name="x", options=[option], reminders=[note])
    assert visible_reminders(trip) == [note]
    option.date = date(2027, 3, 5)
    assert visible_reminders(trip) == []
    option.date = date(2027, 3, 4)
    assert visible_reminders(trip) == [note]
    trip.options = []
    assert visible_reminders(trip) == []


def test_write_drops_stale_activity_reminders(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    store, owner = _with_option(tid)
    url = f"/trips/{tid}/reminders"
    a.post(url, json={"text": "Tickets", "date": "2027-03-04", "option_id": "o1"})
    trip = store.get_trip(owner, tid)
    trip.options[0].date = date(2027, 3, 5)
    store.save_trip(owner, trip)
    a.post(url, json={"text": "Passports", "date": "2027-03-04"})
    trip.options[0].date = date(2027, 3, 4)
    store.save_trip(owner, trip)
    assert [n["text"] for n in a.get(f"/trips/{tid}").json()["reminders"]] == ["Passports"]


def test_stored_trip_without_reminders_still_loads():
    assert Trip.model_validate({"id": "t", "name": "Old"}).reminders == []


def test_reminders_send_no_email_or_push(sign_in_as, monkeypatch):
    import smtplib

    import boto3
    import socket

    def boom(*args, **kwargs):
        raise AssertionError("outbound call")

    monkeypatch.setattr(boto3, "client", boom)
    monkeypatch.setattr(smtplib, "SMTP", boom)
    monkeypatch.setattr(socket.socket, "connect", boom)
    a = sign_in_as("a@example.com")
    tid = _lisbon(a)
    r = a.post(f"/trips/{tid}/reminders", json={"text": "Today", "date": "2027-03-03"})
    assert r.status_code == 201


def test_modules_reference_no_email_or_push_sender():
    import app.routers.trips as router
    import app.trips.store as store

    for module in (router, store):
        source = open(module.__file__).read().lower()
        for word in ("smtp", "send_email", "sendmail", "sns", "push"):
            assert word not in source


def test_dynamo_round_trip_keeps_iso_dates():
    from tests.unit.test_trip_store import FakeTable

    from app.trips.store import DynamoTripStore

    store = DynamoTripStore.__new__(DynamoTripStore)
    store._table = FakeTable()
    note = Reminder(id="r", text="t", date=date(2027, 3, 4), option_id="o1", option_date=date(2027, 3, 4))
    store.save_trip("u", Trip(id="t", name="x", reminders=[note]))
    stored = next(iter(store._table.items.values()))["reminders"][0]
    assert stored["date"] == "2027-03-04" and stored["option_date"] == "2027-03-04"
    assert store.get_trip("u", "t").reminders == [note]
