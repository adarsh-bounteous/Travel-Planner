from datetime import UTC, datetime
from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from app.routers import deps
from app.stays.providers import SEED_CATALOGUES, InMemoryStayProvider
from tests.trip_body import trip_body

FIXED = datetime(2026, 1, 1, 10, 42, tzinfo=UTC)


def _stay(client, place="Lisbon"):
    body = trip_body(name="Trip", start_date="2027-01-01", end_date="2027-01-12", destination=place)
    tid = client.post("/trips", json=body).json()["id"]
    stay = {"place": place, "start_date": "2027-01-01", "end_date": "2027-01-05"}
    sid = client.post(f"/trips/{tid}/stays", json=stay).json()["stays"][0]["id"]
    return tid, sid


def _use_fixed_clock():
    providers = [InMemoryStayProvider(name, cat, lambda: FIXED) for name, cat in SEED_CATALOGUES.items()]
    app.dependency_overrides[deps.get_stay_providers] = lambda: providers


def test_response_carries_what_the_comparison_shows(sign_in_as):
    a = sign_in_as("a@example.com")
    _use_fixed_clock()
    tid, sid = _stay(a)
    r = a.get(f"/trips/{tid}/stays/{sid}/shortlist")
    assert r.status_code == 200
    body = r.json()
    assert body["nights"] == 4 and body["budget"] is None
    s = body["stays"][0]
    assert {"rank", "total", "fit", "reason", "why", "fits_budget"} <= s.keys()
    assert s["property"]["amenities"] and Decimal(s["total"]) > 0
    assert s["rank"] == 1 and s["reason"] == "Best overall"


def test_over_budget_stays_are_kept_but_listed_after_the_fitting_ones(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid = _stay(a)
    base = f"/trips/{tid}/stays/{sid}/shortlist"
    everything = a.get(f"/trips/{tid}/stays/{sid}/options").json()["properties"]
    r = a.get(f"{base}?max_price=100")
    body = r.json()
    assert Decimal(body["budget"]) == 400
    assert len(body["stays"]) == min(5, len(everything)) and len(body["stays"]) > 1
    flags = [s["fits_budget"] for s in body["stays"]]
    assert flags == sorted(flags, reverse=True) and True in flags and False in flags
    assert body["stays"][0]["property"]["name"] == "Pensão Rossio"


def test_access_and_validation(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid = _stay(a)
    assert a.get(f"/trips/{tid}/stays/nope/shortlist").status_code == 404
    assert sign_in_as("b@example.com").get(f"/trips/{tid}/stays/{sid}/shortlist").status_code == 404
    assert TestClient(app).get(f"/trips/{tid}/stays/{sid}/shortlist").status_code == 401
    assert a.get(f"/trips/{tid}/stays/{sid}/shortlist?stars=6").status_code == 422
