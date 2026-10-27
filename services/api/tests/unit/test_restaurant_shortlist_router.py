from fastapi.testclient import TestClient

from app.main import app
from tests.trip_body import trip_body


def _trip(client, destination="Lisbon"):
    body = trip_body(name="Trip", start_date="2027-01-01", end_date="2027-01-12", destination=destination)
    return client.post("/trips", json=body).json()["id"]


def _shortlist(client, tid):
    return client.get(f"/trips/{tid}/restaurant-shortlist").json()


def test_entries_carry_what_the_compare_grid_needs(sign_in_as):
    a = sign_in_as("a@example.com")
    body = _shortlist(a, _trip(a))
    assert len(body["entries"]) >= 2
    r = body["entries"][0]["restaurant"]
    assert {"cuisine", "dining_style", "typical_price", "currency"} <= r.keys()
    assert [e["rank"] for e in body["entries"]] == list(range(1, len(body["entries"]) + 1))


def test_shortlist_names_equal_the_options_names(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.put(f"/trips/{tid}/dining-needs", json={"needs": ["gluten-free"]})
    options = a.get(f"/trips/{tid}/restaurant-options").json()["options"]
    entries = _shortlist(a, tid)["entries"]
    assert sorted(o["name"] for o in options) == sorted(e["restaurant"]["name"] for e in entries)
    assert all("gluten-free" in e["restaurant"]["suits"] for e in entries)


def test_no_matches_gives_no_entries(sign_in_as):
    a = sign_in_as("a@example.com")
    assert _shortlist(a, _trip(a, destination="Nowhere"))["entries"] == []


def test_access_rules(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    assert TestClient(app).get(f"/trips/{tid}/restaurant-shortlist").status_code == 401
    assert sign_in_as("b@example.com").get(f"/trips/{tid}/restaurant-shortlist").status_code == 404


def test_editor_can_read_it(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    r = a.post(f"/trips/{tid}/editors", json={"email": "e@example.com"})
    token = next(x for x in r.json()["editors"] if x["email"] == "e@example.com")["invite_url"].rsplit("/", 1)[1]
    e = sign_in_as("e@example.com")
    assert e.post(f"/invites/{token}/accept").status_code == 200
    assert e.get(f"/trips/{tid}/restaurant-shortlist").status_code == 200
