from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.insurance.options import AgeRate  # noqa: F401  (keeps the port importable from tests)
from app.main import app
from app.trips.cost import summarise_cost
from app.trips.rates import InMemoryRates
from app.trips.store import InsurancePick, Trip
from tests.trip_body import trip_body


def _trip(client, **extra):
    body = trip_body(
        name="Japan",
        destination="Japan",
        start_date="2027-03-12",
        end_date="2027-03-21",
        traveller_count=2,
        owner_age=34,
        risky_activities=True,
        **extra,
    )
    tid = client.post("/trips", json=body).json()["id"]
    client.post(f"/trips/{tid}/travellers", json={"name": "Marco", "age": 61})
    return tid


def test_options_list_ranked_plans_with_prices(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    r = a.get(f"/trips/{tid}/insurance-options")
    assert r.status_code == 200
    body = r.json()
    assert body["days"] == 10 and body["missing"] == []
    assert [p["plan_id"] for p in body["plans"]][0] == "globetrek"
    plan = body["plans"][0]
    assert [t["label"] for t in plan["traveller_prices"]] == ["You", "Marco"]
    assert "commission" not in plan
    assert plan["reason"].startswith("Covers Japan")


def test_options_access_and_auth(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    assert sign_in_as("b@example.com").get(f"/trips/{tid}/insurance-options").status_code == 404
    assert TestClient(app).get(f"/trips/{tid}/insurance-options").status_code == 401


def test_no_matching_plan_is_a_200_with_an_empty_list(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = a.post(
        "/trips",
        json=trip_body(  # longer than any plan covers
            destination="Japan", start_date="2027-01-01", end_date="2027-02-19", owner_age=30, risky_activities=False, traveller_count=1
        ),
    ).json()["id"]
    body = a.get(f"/trips/{tid}/insurance-options").json()
    assert body["plans"] == [] and body["missing"] == []


def test_missing_details_are_reported(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = a.post("/trips", json=trip_body(destination="Japan")).json()["id"]
    body = a.get(f"/trips/{tid}/insurance-options").json()
    assert body["plans"] == [] and "risky activities answer" in body["missing"]


def test_picking_stores_server_priced_plan_and_adds_to_total(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    before = a.get(f"/trips/{tid}").json()["cost"]["total"]
    plan = a.get(f"/trips/{tid}/insurance-options").json()["plans"][0]
    r = a.put(f"/trips/{tid}/insurance", json={"plan_id": "globetrek", "url": "https://evil.example", "total": "1"})
    assert r.status_code == 200
    pick = r.json()["insurance"]
    assert pick["url"] == plan["url"] and Decimal(pick["total"]) == Decimal(plan["group_total"])
    assert r.json()["cost"]["total"] == pytest.approx(before + float(plan["group_total"]))
    assert a.get(f"/trips/{tid}").json()["insurance"]["plan_id"] == "globetrek"


def test_unknown_plan_is_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    r = a.put(f"/trips/{tid}/insurance", json={"plan_id": "nope"})
    assert r.status_code == 422 and r.json()["code"] == "invalid_insurance"


def test_no_pick_means_no_insurance_amount(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    before = a.get(f"/trips/{tid}").json()["cost"]["total"]
    assert a.get(f"/trips/{tid}").json()["insurance"] is None
    a.put(f"/trips/{tid}/insurance", json={"plan_id": "globetrek"})
    r = a.delete(f"/trips/{tid}/insurance")
    assert r.status_code == 200 and r.json()["insurance"] is None and r.json()["cost"]["total"] == before


def _change_destination(a, tid):
    return a.put(f"/trips/{tid}", json={**_body(a, tid), "destination": "Lisbon"})


def _change_dates(a, tid):
    return a.put(f"/trips/{tid}", json={**_body(a, tid), "end_date": "2027-03-20"})


def _add_traveller(a, tid):
    return a.post(f"/trips/{tid}/travellers", json={"name": "Lena", "age": 8})


def _remove_traveller(a, tid):
    marco = a.get(f"/trips/{tid}").json()["travellers"][0]["id"]
    return a.delete(f"/trips/{tid}/travellers/{marco}")


def _body(a, tid):
    t = a.get(f"/trips/{tid}").json()
    keys = ("name", "destination", "start_date", "end_date", "budget", "interests", "owner_age", "risky_activities")
    return {k: t[k] for k in keys}


@pytest.mark.parametrize("change", [_change_destination, _change_dates, _add_traveller, _remove_traveller])
def test_changing_the_trip_clears_the_pick(sign_in_as, change):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.put(f"/trips/{tid}/insurance", json={"plan_id": "globetrek"})
    r = change(a, tid)
    assert r.status_code in (200, 201) and r.json()["insurance"] is None
    assert a.get(f"/trips/{tid}").json()["insurance"] is None


def test_edits_that_do_not_affect_cover_keep_the_pick(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.put(f"/trips/{tid}/insurance", json={"plan_id": "globetrek"})
    r = a.put(f"/trips/{tid}", json={**_body(a, tid), "name": "Renamed", "interests": ["food"]})
    assert r.json()["insurance"]["plan_id"] == "globetrek"


def test_changing_a_travellers_age_clears_the_pick(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    a.put(f"/trips/{tid}/insurance", json={"plan_id": "globetrek"})
    r = a.put(f"/trips/{tid}", json={**_body(a, tid), "owner_age": 35})
    assert r.json()["insurance"] is None


def test_a_settings_edit_keeps_the_stored_age_and_answer(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    body = {k: v for k, v in _body(a, tid).items() if k not in ("owner_age", "risky_activities")}
    r = a.put(f"/trips/{tid}", json=body)
    assert r.json()["owner_age"] == 34 and r.json()["risky_activities"] is True


def test_the_pick_total_is_converted_and_unconvertible_is_counted():
    pick = InsurancePick(plan_id="p", name="P", provider="P", url="https://p.example/x", total=Decimal("100"), currency="USD")
    trip = Trip(id="t", name="T", insurance=pick)
    assert summarise_cost(trip, InMemoryRates({("USD", "EUR"): Decimal("0.9")})).total == 90
    cost = summarise_cost(trip, InMemoryRates({}))
    assert cost.total == 0 and cost.unconvertible_count == 1
    assert summarise_cost(Trip(id="t", name="T"), InMemoryRates({})).total == 0
