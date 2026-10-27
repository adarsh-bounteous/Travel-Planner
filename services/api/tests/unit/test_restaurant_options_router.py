from fastapi.testclient import TestClient

from app.main import app
from tests.trip_body import trip_body


def _trip(client, destination="Lisbon"):
    body = trip_body(name="Trip", start_date="2027-01-01", end_date="2027-01-12", destination=destination)
    return client.post("/trips", json=body).json()["id"]


def _options(client, tid):
    return client.get(f"/trips/{tid}/restaurant-options").json()


def test_needs_are_per_trip(sign_in_as):
    a = sign_in_as("a@example.com")
    trip_a, trip_b = _trip(a), _trip(a)
    assert a.put(f"/trips/{trip_a}/dining-needs", json={"needs": ["gluten-free"]}).status_code == 200
    a_opts = _options(a, trip_a)["options"]
    b_opts = _options(a, trip_b)["options"]
    assert a_opts and all("gluten-free" in o["suits"] for o in a_opts)
    assert any("gluten-free" not in o["suits"] for o in b_opts)
    assert _options(a, trip_a)["filters_applied"]["trip"] == ["Gluten-free"]


def test_unknown_need_is_422_and_access_rules(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    assert a.put(f"/trips/{tid}/dining-needs", json={"needs": ["fruitarian"]}).status_code == 422
    assert sign_in_as("b@example.com").put(f"/trips/{tid}/dining-needs", json={"needs": []}).status_code == 404
    assert TestClient(app).put(f"/trips/{tid}/dining-needs", json={"needs": []}).status_code == 401
    assert TestClient(app).get(f"/trips/{tid}/restaurant-options").status_code == 401


def test_editor_cannot_change_needs_and_sees_owner_filters(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.put("/profile", json={"diet": "Vegetarian"})
    a.put(f"/trips/{tid}/dining-needs", json={"needs": ["halal"]})
    r = a.post(f"/trips/{tid}/editors", json={"email": "e@example.com"})
    token = next(x for x in r.json()["editors"] if x["email"] == "e@example.com")["invite_url"].rsplit("/", 1)[1]
    e = sign_in_as("e@example.com")
    assert e.post(f"/invites/{token}/accept").status_code == 200
    assert e.put(f"/trips/{tid}/dining-needs", json={"needs": []}).status_code == 403
    filters = _options(e, tid)["filters_applied"]
    assert filters["profile"] == ["Vegetarian"] and filters["trip"] == ["Halal"]


def test_home_cuisine_comes_from_residence(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.put("/profile", json={"residence": "Portugal"})
    cuisines = [o["cuisine"] for o in _options(a, tid)["options"]]
    assert cuisines[0] == "Portuguese" and any(c != "Portuguese" for c in cuisines)
    a.put("/profile", json={})
    plain = [o["cuisine"] for o in _options(a, tid)["options"]]
    assert plain != cuisines  # no residence: catalogue order, no reordering


def test_no_match_is_empty_list_with_filters(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.put("/profile", json={"price_level": 1, "diet": "Vegan"})
    body = _options(a, tid)
    assert body["options"] == [] and "filters_applied" in body


def test_profile_put_keeps_dining_answers(sign_in_as):
    a = sign_in_as("a@example.com")
    a.put("/profile", json={"dining_style": "Casual", "price_level": 2})
    a.put("/profile", json={"diet": "Vegan"})
    got = a.get("/profile").json()
    assert got["dining_style"] == "Casual" and got["price_level"] == 2
