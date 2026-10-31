import pytest

from app.main import app
from app.routers import deps
from tests.trip_body import trip_body


class RaisingSender:
    def send_itinerary(self, email, trip_name, html):
        raise RuntimeError("down")


@pytest.fixture
def trip(sign_in_as):
    owner = sign_in_as("owner@example.com")
    body = trip_body(name="Lisbon", destination="Lisbon", start_date="2026-11-14", end_date="2026-11-16")
    return owner, owner.post("/trips", json=body).json()["id"], sign_in_as.invites


def test_email_sends_the_complete_html_to_the_traveller(trip):
    owner, tid, inbox = trip
    assert owner.post(f"/trips/{tid}/itinerary/email").status_code == 204
    to, trip_name, link = inbox.sent[-1]
    assert (to, trip_name) == ("owner@example.com", "Lisbon")
    assert inbox.kinds[link] == "itinerary"
    html = inbox.bodies[link]
    for heading in ("Cost summary", "Included", "Travel essentials", "Day by day"):
        assert heading in html


def test_accepted_editor_can_email_a_copy_to_themself(trip, sign_in_as):
    owner, tid, inbox = trip
    r = owner.post(f"/trips/{tid}/editors", json={"email": "ana@example.com"})
    invite = r.json()["editors"][0]["invite_url"].rsplit("/", 1)[1]
    ana = sign_in_as("ana@example.com")
    ana.post(f"/invites/{invite}/accept")
    assert ana.post(f"/trips/{tid}/itinerary/email").status_code == 204
    assert inbox.sent[-1][0] == "ana@example.com"


def test_stranger_gets_the_missing_trip_answer(trip, sign_in_as):
    owner, tid, inbox = trip
    eve = sign_in_as("eve@example.com")
    assert eve.post(f"/trips/{tid}/itinerary/email").status_code == 404
    assert not inbox.sent


def test_a_failing_sender_gives_502(trip):
    owner, tid, _ = trip
    app.dependency_overrides[deps.get_invite_sender] = lambda: RaisingSender()
    r = owner.post(f"/trips/{tid}/itinerary/email")
    assert r.status_code == 502 and r.json() == {"code": "email_failed"}


def test_no_configured_sender_is_an_error_not_a_silent_success(trip):
    from app.trips.invites import NoInviteSender

    owner, tid, _ = trip
    app.dependency_overrides[deps.get_invite_sender] = lambda: NoInviteSender()
    assert owner.post(f"/trips/{tid}/itinerary/email").status_code == 502
