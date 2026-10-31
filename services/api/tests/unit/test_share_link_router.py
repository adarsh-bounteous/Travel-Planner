from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.trips.store import ChosenOption, Editor, Reminder, RestaurantPick, Traveller
from tests.trip_body import trip_body


def _trip(owner, make):
    body = trip_body(start_date="2027-03-04", end_date="2027-03-05", budget=900)
    tid = owner.post("/trips", json=body).json()["id"]
    owner_id = next(iter(make.trips._trips))[0]
    trip = make.trips.get_trip(owner_id, tid)
    option = ChosenOption(
        id="o1",
        title="Hotel Avenida",
        category="Stays",
        date=date(2027, 3, 4),
        price=Decimal(120),
        currency="EUR",
        booking_url="https://example.com/book/secret",
    )
    reminder = Reminder(id="r1", text="private note", date=date(2027, 3, 4))
    make.trips.save_trip(
        owner_id,
        trip.model_copy(
            update={
                "options": [option],
                "reminders": [reminder],
                "travellers": [Traveller(id="t1", name="Maya")],
            }
        ),
    )
    return tid


def _token(share_url: str) -> str:
    return share_url.rsplit("/", 1)[1]


def test_owner_creates_a_read_only_link(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = owner.post("/trips", json=trip_body()).json()["id"]
    r = owner.post(f"/trips/{tid}/share-link")
    assert r.status_code == 201
    assert r.json()["share_url"].startswith("/trips/read-only/")
    assert owner.post(f"/trips/{tid}/share-link").json()["share_url"] == r.json()["share_url"]


def test_visitor_without_an_account_reads_the_itinerary(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = _trip(owner, sign_in_as)
    share_url = owner.post(f"/trips/{tid}/share-link").json()["share_url"]
    owner.put(f"/trips/{tid}/share-link/itinerary", json={"show": True})  # a new link starts Off
    visitor = TestClient(app)  # no session cookie
    r = visitor.get(share_url.replace("/trips/read-only/", "/shared/"))
    assert r.status_code == 200
    assert r.json()["name"] == "Lisbon" and len(r.json()["days"]) == 2
    assert r.json()["options"][0]["title"] == "Hotel Avenida"
    assert (r.json()["is_owner"], r.json()["can_edit"]) == (False, False)
    assert r.headers["cache-control"] == "no-store"


def test_public_body_is_an_allow_list(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = _trip(owner, sign_in_as)
    token = _token(owner.post(f"/trips/{tid}/share-link").json()["share_url"])
    body = TestClient(app).get(f"/shared/{token}").json()
    assert not {"editors", "reminders", "travellers", "budget", "cost", "share_token", "share_url"} & body.keys()
    assert all("booking_url" not in o for o in body["options"])
    assert "private note" not in str(body) and token not in str(body)


def test_public_body_carries_restaurant_picks_without_their_link(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = _trip(owner, sign_in_as)
    owner_id = next(iter(sign_in_as.trips._trips))[0]
    trip = sign_in_as.trips.get_trip(owner_id, tid)
    pick = RestaurantPick(
        id="p1",
        name="Casa Lima",
        city="Lisbon",
        cuisine="Portuguese",
        typical_price=Decimal(19),
        currency="EUR",
        url="https://example.com/secret-menu",
        date=date(2027, 3, 4),
        meal="dinner",
    )
    sign_in_as.trips.save_trip(owner_id, trip.model_copy(update={"restaurants": [pick]}))
    token = _token(owner.post(f"/trips/{tid}/share-link").json()["share_url"])
    owner.put(f"/trips/{tid}/share-link/itinerary", json={"show": True})
    body = TestClient(app).get(f"/shared/{token}").json()
    assert [r["name"] for r in body["restaurants"]] == ["Casa Lima"]
    assert "url" not in body["restaurants"][0]
    assert "secret-menu" not in str(body)


def test_the_token_is_not_a_credential_on_trip_routes(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = owner.post("/trips", json=trip_body(start_date="2027-03-04", end_date="2027-03-04")).json()["id"]
    token = _token(owner.post(f"/trips/{tid}/share-link").json()["share_url"])
    visitor = TestClient(app)
    assert visitor.post(f"/trips/{tid}/activities", json={"name": "x", "date": "2027-03-04"}).status_code == 401
    assert visitor.get(f"/trips/{tid}").status_code == 401
    assert visitor.get(f"/trips/{token}").status_code == 401


def test_turned_off_link_is_the_same_404_as_an_unknown_one(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = _trip(owner, sign_in_as)
    token = _token(owner.post(f"/trips/{tid}/share-link").json()["share_url"])
    r = owner.delete(f"/trips/{tid}/share-link")
    assert r.status_code == 200 and r.json()["share_url"] is None
    visitor = TestClient(app)
    gone = visitor.get(f"/shared/{token}")
    assert (gone.status_code, gone.json()) == (404, {"code": "not_found"})
    assert visitor.get("/shared/never-issued").json() == gone.json()
    assert owner.delete(f"/trips/{tid}/share-link").status_code == 200  # safe to repeat


def test_a_new_link_after_turning_off_has_a_different_token(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = owner.post("/trips", json=trip_body()).json()["id"]
    old = _token(owner.post(f"/trips/{tid}/share-link").json()["share_url"])
    owner.delete(f"/trips/{tid}/share-link")
    new = _token(owner.post(f"/trips/{tid}/share-link").json()["share_url"])
    visitor = TestClient(app)
    assert new != old
    assert visitor.get(f"/shared/{old}").status_code == 404
    assert visitor.get(f"/shared/{new}").status_code == 200


def test_deleting_the_trip_kills_the_link(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = owner.post("/trips", json=trip_body()).json()["id"]
    token = _token(owner.post(f"/trips/{tid}/share-link").json()["share_url"])
    assert owner.delete(f"/trips/{tid}").status_code == 204
    assert TestClient(app).get(f"/shared/{token}").status_code == 404
    assert sign_in_as.trips.get_share_link(token) is None


def test_editing_the_trip_keeps_the_link(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = owner.post("/trips", json=trip_body()).json()["id"]
    token = _token(owner.post(f"/trips/{tid}/share-link").json()["share_url"])
    owner.put(f"/trips/{tid}", json={"name": "Porto"})
    assert TestClient(app).get(f"/shared/{token}").json()["name"] == "Porto"


@pytest.fixture
def with_editor(sign_in_as):
    owner, ana, ben = (sign_in_as(e) for e in ("o@example.com", "ana@example.com", "ben@example.com"))
    tid = owner.post("/trips", json=trip_body()).json()["id"]
    owner_id = next(iter(sign_in_as.trips._trips))[0]
    trip = sign_in_as.trips.get_trip(owner_id, tid)
    sign_in_as.trips.save_trip(
        owner_id, trip.model_copy(update={"editors": [Editor(email="ana@example.com", token="fake-token", accepted=True)]})
    )
    sign_in_as.trips.link_editor("ana@example.com", owner_id, tid)
    owner.post(f"/trips/{tid}/share-link")
    return owner, ana, ben, tid


def test_only_the_owner_manages_the_link(with_editor):
    owner, ana, ben, tid = with_editor
    assert ana.post(f"/trips/{tid}/share-link").status_code == 403
    assert ana.delete(f"/trips/{tid}/share-link").status_code == 403
    assert ben.post(f"/trips/{tid}/share-link").status_code == 404
    assert ben.delete(f"/trips/{tid}/share-link").status_code == 404
    assert owner.get(f"/trips/{tid}").json()["share_url"] is not None


def test_editors_never_see_the_token(with_editor):
    _, ana, _, tid = with_editor
    body = ana.get(f"/trips/{tid}").json()
    assert body["share_url"] is None and body["share_token"] is None
    listed = [t for t in ana.get("/trips").json() if t["id"] == tid]
    assert listed and all(t["share_token"] is None for t in listed)


def test_owner_view_hides_the_raw_token_but_shows_the_url(with_editor):
    owner, _, _, tid = with_editor
    body = owner.get(f"/trips/{tid}").json()
    assert body["share_token"] is None and body["share_url"].startswith("/trips/read-only/")
    assert all(t["share_token"] is None for t in owner.get("/trips").json())


def test_trip_stored_before_share_links_has_no_link(sign_in_as):
    owner = sign_in_as("o@example.com")
    tid = owner.post("/trips", json=trip_body()).json()["id"]
    assert owner.get(f"/trips/{tid}").json()["share_url"] is None
    assert TestClient(app).get("/shared/anything").status_code == 404
