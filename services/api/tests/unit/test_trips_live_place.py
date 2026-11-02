from datetime import UTC, datetime

import pytest

from app.main import app
from app.places.destination_search import sign_place_ref
from app.routers import deps
from app.trips.recommendations import Recommendation
from tests.trip_body import trip_body
from tests.unit.locations_fakes import AGRA

OWNER = "a@example.com"


def _ref(client, name="Agra"):
    matches = client.get("/places/search", params={"q": name}).json()["matches"]
    return next(m["id"] for m in matches if m["name"] == name)


def _agra_trip(client) -> str:
    r = client.post("/trips", json=trip_body(name="Agra", destination="Agra, India", place_ref=_ref(client)))
    assert r.status_code == 201, r.text
    return r.json()["id"]


class _Source:
    def __init__(self, items=(), fails=False):
        self.items, self.fails = list(items), fails

    def for_destination(self, place):
        if self.fails:
            raise RuntimeError("provider down")
        return self.items


def _use_source(source):
    app.dependency_overrides[deps.get_recommendations] = lambda: source


def test_a_picked_live_place_is_saved_as_the_destination(sign_in_as):
    client = sign_in_as(OWNER)
    trip_id = _agra_trip(client)
    trip = client.get(f"/trips/{trip_id}").json()
    assert (trip["place"], trip["country"], trip["place_source"]) == ("Agra", "India", "live")
    assert trip["destination"] == "Agra, India"
    assert trip["location"]["country_code"] == "IN"
    assert "place_ref" not in trip
    assert sign_in_as.resolver.calls == 0


def test_a_starter_pick_is_saved_as_before(sign_in_as):
    client = sign_in_as(OWNER)
    r = client.post("/trips", json=trip_body(destination="Lisbon"))
    assert r.status_code == 201
    assert r.json()["country"] is None or r.json()["place_source"] in (None, "starter")


@pytest.mark.parametrize(
    "extra",
    [
        {"destination": "Atlantis, Nowhere"},
        {"destination": "Agra, India", "place_ref": "live:forged.sig"},
        {"destination": "Delhi, India", "place_ref": "AGRA"},
        {"destination": "Agra, India", "place_ref": "EXPIRED"},
    ],
)
def test_an_unsearched_place_is_rejected_and_nothing_is_saved(sign_in_as, extra):
    client = sign_in_as(OWNER)
    if extra.get("place_ref") == "AGRA":
        extra = {**extra, "place_ref": _ref(client)}
    if extra.get("place_ref") == "EXPIRED":
        old = datetime(2020, 1, 1, tzinfo=UTC)
        extra = {**extra, "place_ref": sign_place_ref(AGRA, b"test-session-secret", old)}
    r = client.post("/trips", json=trip_body(**extra))
    assert r.status_code == 422 and r.json()["code"] == "place_not_from_search"
    assert client.get("/trips").json() == []


def test_changing_the_destination_to_an_unsearched_place_is_rejected(sign_in_as):
    client = sign_in_as(OWNER)
    trip_id = client.post("/trips", json=trip_body()).json()["id"]
    r = client.put(f"/trips/{trip_id}", json={"name": "Lisbon", "destination": "Atlantis, Nowhere"})
    assert r.status_code == 422 and r.json()["code"] == "place_not_from_search"


def test_changing_the_destination_to_a_live_place(sign_in_as):
    client = sign_in_as(OWNER)
    trip_id = client.post("/trips", json=trip_body()).json()["id"]
    r = client.put(
        f"/trips/{trip_id}", json={"name": "Agra", "destination": "Agra, India", "place_ref": _ref(client)}
    )
    assert r.status_code == 200
    assert (r.json()["place"], r.json()["place_source"]) == ("Agra", "live")


def test_an_edit_that_keeps_the_destination_needs_no_ref(sign_in_as):
    client = sign_in_as(OWNER)
    trip_id = _agra_trip(client)
    r = client.put(f"/trips/{trip_id}", json={"name": "Renamed", "destination": "Agra, India"})
    assert r.status_code == 200 and r.json()["place"] == "Agra"


def test_every_page_answers_for_a_live_trip(sign_in_as):
    client = sign_in_as(OWNER)
    trip_id = _agra_trip(client)
    _use_source(_Source())
    for path in ("recommendations", "visa", "medical-guidance"):
        assert client.get(f"/trips/{trip_id}/{path}").status_code == 200


def test_missing_data_on_a_live_trip_is_limited(sign_in_as):
    client = sign_in_as(OWNER)
    trip_id = _agra_trip(client)
    _use_source(_Source())
    assert client.get(f"/trips/{trip_id}/recommendations").json()["status"] == "limited_data"


def test_present_data_on_a_live_trip_is_ready(sign_in_as):
    client = sign_in_as(OWNER)
    trip_id = _agra_trip(client)
    item = Recommendation(id="r1", name="Taj Mahal", detail="Marble tomb")
    _use_source(_Source([item]))
    assert client.get(f"/trips/{trip_id}/recommendations").json()["status"] == "ready"


def test_a_failing_source_limits_only_its_own_page(sign_in_as):
    client = sign_in_as(OWNER)
    trip_id = _agra_trip(client)
    _use_source(_Source(fails=True))
    assert client.get(f"/trips/{trip_id}/recommendations").json()["status"] == "limited_data"
    assert client.get(f"/trips/{trip_id}/visa").json()["status"] == "ready"


def test_data_status_reports_each_feature(sign_in_as):
    client = sign_in_as(OWNER)
    trip_id = _agra_trip(client)
    _use_source(_Source())
    body = client.get(f"/trips/{trip_id}/data-status").json()
    assert body["features"] == {"recommendations": "limited", "visa": "available", "itinerary": "available"}
    assert body["destination"]["label"] == "Agra, India"


def test_data_status_limited_visa_and_itinerary(sign_in_as):
    client = sign_in_as(OWNER)
    trip_id = _agra_trip(client)
    _use_source(_Source(fails=True))
    from app.trips.visa import has_guidance

    assert has_guidance("India")
    store = sign_in_as.trips
    (owner, id_), trip = next(iter(store._trips.items()))
    store.save_trip(owner, trip.model_copy(update={"country": "Atlantis", "days": [], "start_date": None, "end_date": None}))
    features = client.get(f"/trips/{trip_id}/data-status").json()["features"]
    assert features == {"recommendations": "limited", "visa": "limited", "itinerary": "limited"}
