from datetime import UTC, datetime

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


def _names(response):
    return {p["name"] for p in response.json()["properties"]}


def test_lists_more_than_one_provider_for_the_stays_place_and_dates(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid = _stay(a)
    r = a.get(f"/trips/{tid}/stays/{sid}/options")
    assert r.status_code == 200
    providers = {o["provider"] for p in r.json()["properties"] for o in p["offers"]}
    assert len(providers) >= 2
    assert r.json()["place"] == "Lisbon" and r.json()["nights"] == 4


def test_access_and_unknown_ids(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid = _stay(a)
    assert a.get(f"/trips/{tid}/stays/nope/options").status_code == 404
    assert sign_in_as("b@example.com").get(f"/trips/{tid}/stays/{sid}/options").status_code == 404
    assert TestClient(app).get(f"/trips/{tid}/stays/{sid}/options").status_code == 401


def test_only_the_chosen_type_and_rooms(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid = _stay(a)
    base = f"/trips/{tid}/stays/{sid}/options"
    r = a.get(f"{base}?property_type=other&rooms=2")
    assert r.json()["properties"]
    assert all((p["property_type"], p["rooms"]) == ("other", 2) for p in r.json()["properties"])


def test_filters_and_validation(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid = _stay(a)
    base = f"/trips/{tid}/stays/{sid}/options"
    r = a.get(f"{base}?amenities=pool&amenities=parking&stars=4&stars=5&location=baixa")
    assert [p["name"] for p in r.json()["properties"]] == ["Baixa Grand Hotel"]
    assert a.get(f"{base}?stars=6").status_code == 422
    assert a.get(f"{base}?amenities=sauna").status_code == 422
    assert a.get(f"{base}?rooms=0").status_code == 422


def test_budget_narrows_only_when_given(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid = _stay(a)
    base = f"/trips/{tid}/stays/{sid}/options"
    everything = a.get(base).json()
    assert float(everything["price_min"]) < 70 and float(everything["price_max"]) > 200
    assert _names(a.get(f"{base}?max_price=100")) == {"Pensão Rossio"}


def test_no_match_is_an_empty_list_not_an_error(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid = _stay(a)
    r = a.get(f"/trips/{tid}/stays/{sid}/options?property_type=hotel&rooms=1&stars=1")
    assert r.status_code == 200 and r.json()["properties"] == []


def test_widen_adds_nearby_towns(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid = _stay(a)
    base = f"/trips/{tid}/stays/{sid}/options"
    assert "Cascais Bay Hotel" not in _names(a.get(base))
    assert "Cascais Bay Hotel" in _names(a.get(f"{base}?widen=true"))


def test_offers_merge_and_carry_the_fetch_time(sign_in_as):
    a = sign_in_as("a@example.com")
    _use_fixed_clock()
    tid, sid = _stay(a)
    props = a.get(f"/trips/{tid}/stays/{sid}/options").json()["properties"]
    alfama = [p for p in props if p["name"] == "Hotel Alfama Terrace"]
    assert len(alfama) == 1
    assert [o["provider"] for o in alfama[0]["offers"]] == ["Booknest", "Staylink"]
    assert all(o["fetched_at"] == "2026-01-01T10:42:00Z" for p in props for o in p["offers"])
    assert float(alfama[0]["offers"][0]["total"]) == 472


def test_a_place_with_no_provider_data_has_no_stays(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, sid = _stay(a, "Oslo")
    assert a.get(f"/trips/{tid}/stays/{sid}/options").json()["properties"] == []
