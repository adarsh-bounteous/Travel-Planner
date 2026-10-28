from datetime import UTC, datetime

from app.main import app
from app.routers import deps
from app.travel.local import LocalStayProvider
from app.stays.providers import SEED_CATALOGUES, InMemoryStayProvider
from tests.trip_body import trip_body

FIXED = datetime(2026, 1, 1, 10, 42, tzinfo=UTC)
CRITERIA = "property_type=hotel&rooms=1"


def _setup(client):
    providers = [InMemoryStayProvider(name, cat, lambda: FIXED) for name, cat in SEED_CATALOGUES.items()]
    app.dependency_overrides[deps.get_stay_providers] = lambda: providers
    body = trip_body(name="Trip", start_date="2027-01-01", end_date="2027-01-12", destination="Lisbon")
    tid = client.post("/trips", json=body).json()["id"]
    stay = {"place": "Lisbon", "start_date": "2027-01-01", "end_date": "2027-01-05"}
    sid = client.post(f"/trips/{tid}/stays", json=stay).json()["stays"][0]["id"]
    ranked = client.get(f"/trips/{tid}/stays/{sid}/shortlist?{CRITERIA}").json()["stays"]
    return tid, sid, ranked


def _url(tid, sid):
    return f"/trips/{tid}/stays/{sid}/chosen?{CRITERIA}"


def test_choosing_stores_the_server_priced_stay_and_persists(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid, ranked = _setup(a)
    pick = ranked[0]
    r = a.put(_url(tid, sid), json={"property_id": pick["property"]["id"], "total": "1", "url": "https://evil.example"})
    assert r.status_code == 200
    chosen = r.json()["stays"][0]["chosen"]
    cheapest = min(pick["property"]["offers"], key=lambda o: float(o["total"]))
    assert chosen["name"] == pick["property"]["name"]
    assert float(chosen["total"]) == float(cheapest["total"]) and chosen["url"].startswith(cheapest["url"][:20])
    assert "evil" not in chosen["url"]
    assert a.get(f"/trips/{tid}").json()["stays"][0]["chosen"]["property_id"] == pick["property"]["id"]


def test_choosing_another_replaces_the_first(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid, ranked = _setup(a)
    a.put(_url(tid, sid), json={"property_id": ranked[0]["property"]["id"]})
    r = a.put(_url(tid, sid), json={"property_id": ranked[1]["property"]["id"]})
    stays = r.json()["stays"]
    assert stays[0]["chosen"]["property_id"] == ranked[1]["property"]["id"]
    assert sum(1 for s in stays if s["chosen"]) == 1


def test_clearing_removes_the_choice_and_the_total(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid, ranked = _setup(a)
    r = a.put(_url(tid, sid), json={"property_id": ranked[0]["property"]["id"]})
    assert r.json()["cost"]["total"] > 0
    r = a.delete(f"/trips/{tid}/stays/{sid}/chosen")
    assert r.status_code == 200
    assert r.json()["stays"][0]["chosen"] is None and r.json()["cost"]["total"] == 0


def test_refusals(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid, ranked = _setup(a)
    assert a.put(_url(tid, sid), json={"property_id": "nope"}).status_code == 422
    assert a.put(_url(tid, "nope"), json={"property_id": "x"}).status_code == 404
    other = sign_in_as("b@example.com")
    assert other.put(_url(tid, sid), json={"property_id": ranked[0]["property"]["id"]}).status_code == 404
    assert other.delete(f"/trips/{tid}/stays/{sid}/chosen").status_code == 404


def test_changing_a_stay_keeps_the_choice_only_while_place_and_dates_match(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid, ranked = _setup(a)
    a.put(_url(tid, sid), json={"property_id": ranked[0]["property"]["id"]})
    same = {"place": "Lisbon", "start_date": "2027-01-01", "end_date": "2027-01-05"}
    assert a.put(f"/trips/{tid}/stays/{sid}", json=same).json()["stays"][0]["chosen"] is not None
    moved = {**same, "end_date": "2027-01-06"}
    assert a.put(f"/trips/{tid}/stays/{sid}", json=moved).json()["stays"][0]["chosen"] is None


def test_choosing_a_local_mode_stay_is_saved(sign_in_as):
    a = sign_in_as("a@example.com")
    app.dependency_overrides[deps.get_stay_providers] = lambda: [LocalStayProvider()]
    body = trip_body(name="Trip", start_date="2027-01-01", end_date="2027-01-12", destination="Lisbon")
    tid = a.post("/trips", json=body).json()["id"]
    stay = {"place": "Lisbon", "start_date": "2027-01-01", "end_date": "2027-01-05"}
    sid = a.post(f"/trips/{tid}/stays", json=stay).json()["stays"][0]["id"]
    ranked = a.get(f"/trips/{tid}/stays/{sid}/shortlist?{CRITERIA}").json()["stays"]
    r = a.put(_url(tid, sid), json={"property_id": ranked[0]["property"]["id"]})
    assert r.status_code == 200
    assert r.json()["stays"][0]["chosen"]["url"].startswith("local://booking/")
    assert a.get(f"/trips/{tid}").json()["stays"][0]["chosen"]["property_id"] == ranked[0]["property"]["id"]
