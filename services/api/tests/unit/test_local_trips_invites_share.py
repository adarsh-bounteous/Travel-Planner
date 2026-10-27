from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.flights.options import FlightOption
from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD
from app.main import app
from app.routers import auth, deps

BODY = {
    "name": "Rome", "destination": "Rome", "start_date": "2026-06-01", "end_date": "2026-06-03",
    "budget": 300, "currency": "EUR", "traveller_count": 1,
}
INVITEE = {"email": "ana@example.com", "password": "abcdefghij12"}
CACHES = (auth._local_identity, auth._local_accounts, deps._local_trips, deps._local_invite_sender)


class FakeFlights:
    name = "Flight search API"

    def fetch(self, origin, destination, on):
        return [
            FlightOption(
                id="flight-a", mode="flight", estimate=False, provider="Atlantic Air",
                source=self.name, fare=Decimal("180"), currency="EUR", travel_minutes=60, stops=0,
                fetched_at=datetime(2026, 10, 26, 9, 14, tzinfo=UTC), url="https://airline.example/a",
            )
        ]


@pytest.fixture
def local(monkeypatch):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("WEB_ORIGIN", "http://localhost:5173")
    app.dependency_overrides[deps.get_flight_providers] = lambda: [FakeFlights()]
    for cache in CACHES:
        cache.cache_clear()
    with TestClient(app):  # startup builds the local store and seeds the demo account
        yield
    app.dependency_overrides.clear()
    for cache in CACHES:
        cache.cache_clear()


def restart():
    """A new API process: stores and accounts are re-read from the data file; the inbox is memory-only."""
    for cache in (auth._local_identity, auth._local_accounts, deps._local_trips):
        cache.cache_clear()


def demo(local):
    client = TestClient(app)
    assert client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}).status_code == 200
    return client


def invitee(owner):
    """Ana signs up through the local inbox and signs in."""
    client = TestClient(app)
    assert client.post("/auth/sign-up", json=INVITEE).status_code == 202
    mail = next(m for m in owner.get("/local/inbox").json() if m["kind"] == "confirmation")
    assert client.post("/auth/confirm", json={"token": mail["link"].rsplit("/", 1)[1]}).status_code == 200
    assert client.post("/auth/sign-in", json=INVITEE).status_code == 200
    return client


def trip_ids(client):
    return [t["id"] for t in client.get("/trips").json()]


def new_trip(client):
    return client.post("/trips", json=BODY).json()["id"]


def invite(owner, tid):
    r = owner.post(f"/trips/{tid}/editors", json={"email": INVITEE["email"]})
    assert r.status_code == 201
    return r.json()["editors"][0]["invite_url"].rsplit("/", 1)[1]


def test_create_edit_and_delete_a_trip(local):
    client = demo(local)
    tid = new_trip(client)
    assert tid in trip_ids(client)
    assert client.put(f"/trips/{tid}", json={"name": "Renamed"}).status_code == 200
    assert client.get(f"/trips/{tid}").json()["name"] == "Renamed"
    assert client.delete(f"/trips/{tid}").status_code in (200, 204)
    assert tid not in trip_ids(client)


def test_sample_trips_appear_alongside_a_new_trip(local):
    client = demo(local)
    new_trip(client)
    assert {"Summer in Kyoto", "Weekend in Lisbon", "Rome"} <= {t["name"] for t in client.get("/trips").json()}


def test_trip_contents_survive_a_restart(local):
    client = demo(local)
    tid = new_trip(client)
    assert client.put(f"/trips/{tid}/days/2026-06-01", json={"name": "Arrival"}).status_code == 200
    client.post(f"/trips/{tid}/activities", json={"name": "Tour", "date": "2026-06-01"})
    client.post(f"/trips/{tid}/stays", json={"place": "Rome", "start_date": "2026-06-01", "end_date": "2026-06-03"})
    leg = {"origin": "Lisbon", "destination": "Rome", "date": "2026-06-01", "option_id": "flight-a"}
    assert client.put(f"/trips/{tid}/transport/destination", json=leg).status_code == 200
    client.post(f"/trips/{tid}/travellers", json={"name": "Zed"})
    client.post(f"/trips/{tid}/reminders", json={"text": "Pack passports", "date": "2026-06-01"})
    before = client.get(f"/trips/{tid}").json()
    restart()
    after = demo(local).get(f"/trips/{tid}").json()
    for key in ("days", "activities", "stays", "transport", "travellers", "reminders"):
        assert before[key], key
        assert after[key] == before[key], key


def test_items_can_be_added_to_and_deleted_from_a_trip(local):
    client = demo(local)
    tid = new_trip(client)
    url = f"/trips/{tid}"

    r = client.post(f"{url}/activities", json={"name": "Tour", "date": "2026-06-01"})
    aid = r.json()["activities"][0]["id"]
    assert client.delete(f"{url}/activities/{aid}").json()["activities"] == []

    r = client.post(f"{url}/stays", json={"place": "Rome", "start_date": "2026-06-01", "end_date": "2026-06-03"})
    sid = r.json()["stays"][0]["id"]
    assert client.delete(f"{url}/stays/{sid}").json()["stays"] == []

    leg = {"origin": "Lisbon", "destination": "Rome", "date": "2026-06-01", "option_id": "flight-a"}
    assert len(client.put(f"{url}/transport/destination", json=leg).json()["transport"]) == 1
    assert client.delete(f"{url}/transport/destination").json()["transport"] == []

    r = client.post(f"{url}/travellers", json={"name": "Zed"})
    zid = r.json()["travellers"][0]["id"]
    assert client.delete(f"{url}/travellers/{zid}").json()["travellers"] == []

    r = client.post(f"{url}/reminders", json={"text": "Pack passports", "date": "2026-06-01"})
    rid = r.json()["reminders"][0]["id"]
    assert client.delete(f"{url}/reminders/{rid}").json()["reminders"] == []

    assert len(client.get(url).json()["days"]) == 3
    assert client.put(url, json={**BODY, "end_date": "2026-06-02"}).status_code == 200
    assert len(client.get(url).json()["days"]) == 2


def test_invite_is_pending_and_the_email_is_in_the_local_inbox(local):
    owner = demo(local)
    tid = new_trip(owner)
    token = invite(owner, tid)
    editors = owner.get(f"/trips/{tid}").json()["editors"]
    assert [(e["email"], e["accepted"]) for e in editors] == [(INVITEE["email"], False)]
    sent = [m for m in owner.get("/local/inbox").json() if m["kind"] == "invite"]
    assert [m["to"] for m in sent] == [INVITEE["email"]]
    assert sent[0]["link"].endswith(f"/invite/{token}")


def test_invitee_accepts_and_is_an_editor_also_after_a_restart(local):
    owner = demo(local)
    tid = new_trip(owner)
    token = invite(owner, tid)
    ana = invitee(owner)
    assert ana.post(f"/invites/{token}/accept").status_code == 200
    restart()
    editors = demo(local).get(f"/trips/{tid}").json()["editors"]
    assert [(e["email"], e["accepted"]) for e in editors] == [(INVITEE["email"], True)]


def test_revoking_removes_the_pending_invite(local):
    owner = demo(local)
    tid = new_trip(owner)
    token = invite(owner, tid)
    assert owner.delete(f"/trips/{tid}/editors/{INVITEE['email']}").status_code == 200
    assert owner.get(f"/trips/{tid}").json()["editors"] == []
    assert TestClient(app).get(f"/invites/{token}").status_code == 404


def test_accepting_an_accepted_or_revoked_invite_errors_and_editors_are_unchanged(local):
    owner = demo(local)
    tid = new_trip(owner)
    token = invite(owner, tid)
    ana = invitee(owner)
    assert ana.post(f"/invites/{token}/accept").status_code == 200
    before = owner.get(f"/trips/{tid}").json()["editors"]
    r = ana.post(f"/invites/{token}/accept")
    assert (r.status_code, r.json()["code"]) == (409, "invite_used")
    assert owner.get(f"/trips/{tid}").json()["editors"] == before
    r = ana.get(f"/invites/{token}")
    assert (r.status_code, r.json()["code"]) == (409, "invite_used")
    owner.delete(f"/trips/{tid}/editors/{INVITEE['email']}")
    assert ana.post(f"/invites/{token}/accept").status_code == 404
    assert owner.get(f"/trips/{tid}").json()["editors"] == []


def test_share_link_opens_until_revoked_and_survives_a_restart(local):
    owner = demo(local)
    tid = new_trip(owner)
    url = owner.post(f"/trips/{tid}/share-link").json()["share_url"]
    token = url.rsplit("/", 1)[1]
    restart()
    anon = TestClient(app)
    assert anon.get(f"/shared/{token}").json()["name"] == "Rome"
    owner = demo(local)
    assert owner.delete(f"/trips/{tid}/share-link").status_code in (200, 204)
    r = anon.get(f"/shared/{token}")
    assert r.status_code == 404
    assert "name" not in r.json()
