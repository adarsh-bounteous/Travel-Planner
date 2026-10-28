from datetime import UTC, date, datetime
from decimal import Decimal

from app.flights.options import FlightOption
from app.main import app
from app.routers import deps
from app.travel.local import LocalFlightProvider
from tests.trip_body import trip_body

FIXED = datetime(2026, 10, 26, 9, 14, tzinfo=UTC)
LEG = {"origin": "Lisbon", "destination": "Faro", "date": "2027-11-18"}


def _opt(oid, mode="flight", fare="180", estimate=False):
    return FlightOption(
        id=oid,
        mode=mode,
        estimate=estimate,
        provider="Atlantic Air",
        source="Flight search API",
        fare=Decimal(fare),
        currency="EUR",
        travel_minutes=60,
        stops=0,
        fetched_at=FIXED,
        url=f"https://airline.example/{oid}",
    )


class Fake:
    name = "Flight search API"

    def __init__(self):
        self.options = {
            "flight-a": _opt("flight-a"),
            "flight-b": _opt("flight-b", fare="210"),
            "bus-1": _opt("bus-1", "bus", "30"),
            "taxi-1": _opt("taxi-1", "taxi", "25", True),
        }

    def fetch(self, origin, destination, on):
        return list(self.options.values())


def _setup(client):
    provider = Fake()
    app.dependency_overrides[deps.get_flight_providers] = lambda: [provider]
    tid = client.post("/trips", json=trip_body(name="Trip")).json()["id"]
    return tid, provider


def _put(client, tid, leg, option_id, **extra):
    return client.put(f"/trips/{tid}/transport/{leg}", json={**LEG, "option_id": option_id, **extra})


def test_picking_shows_the_pick_with_provider_url(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, _ = _setup(a)
    r = _put(a, tid, "destination", "flight-a", url="https://evil.example", fare="1")
    assert r.status_code == 200
    pick = r.json()["transport"][0]
    assert pick["option_id"] == "flight-a" and pick["url"] == "https://airline.example/flight-a"
    assert Decimal(pick["fare"]) == 180
    assert a.get(f"/trips/{tid}").json()["transport"][0]["option_id"] == "flight-a"


def test_picking_another_on_the_same_leg_replaces_it(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, _ = _setup(a)
    _put(a, tid, "destination", "flight-a")
    r = _put(a, tid, "destination", "flight-b")
    assert [p["option_id"] for p in r.json()["transport"]] == ["flight-b"]


def test_clearing_removes_the_pick_and_the_fare_from_the_total(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, _ = _setup(a)
    r = _put(a, tid, "destination", "flight-a")
    assert r.json()["cost"]["total"] == 180.0
    r = a.delete(f"/trips/{tid}/transport/destination")
    assert r.json()["transport"] == [] and r.json()["cost"]["total"] == 0.0
    assert a.delete(f"/trips/nope/transport/destination").status_code == 404


def test_three_legs_at_once_and_taxi_estimate_in_total(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, _ = _setup(a)
    _put(a, tid, "destination", "flight-a")
    _put(a, tid, "between_cities", "bus-1")
    r = _put(a, tid, "local_taxi", "taxi-1")
    assert {p["leg"] for p in r.json()["transport"]} == {"destination", "between_cities", "local_taxi"}
    assert r.json()["cost"]["total"] == 235.0
    assert [p["estimate"] for p in r.json()["transport"] if p["leg"] == "local_taxi"] == [True]


def test_unknown_option_and_non_editor_are_refused(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, _ = _setup(a)
    r = _put(a, tid, "destination", "nope")
    assert r.status_code == 422 and r.json()["code"] == "invalid_transport"
    other = sign_in_as("b@example.com")
    assert _put(other, tid, "destination", "flight-a").status_code in (403, 404)


def test_refresh_updates_the_fare_and_keeps_the_pick(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, provider = _setup(a)
    _put(a, tid, "destination", "flight-a")
    provider.options["flight-a"] = _opt("flight-a", fare="195")
    r = a.post(f"/trips/{tid}/transport/refresh")
    pick = r.json()["transport"][0]
    assert Decimal(pick["fare"]) == 195 and Decimal(pick["picked_fare"]) == 180
    assert r.json()["cost"]["total"] == 195.0


def test_refresh_keeps_a_pick_whose_option_disappeared(sign_in_as):
    a = sign_in_as("a@example.com")
    tid, provider = _setup(a)
    _put(a, tid, "destination", "flight-a")
    del provider.options["flight-a"]
    r = a.post(f"/trips/{tid}/transport/refresh")
    assert Decimal(r.json()["transport"][0]["fare"]) == 180


def test_picking_a_local_mode_flight_is_saved(sign_in_as):
    a = sign_in_as("a@example.com")
    app.dependency_overrides[deps.get_flight_providers] = lambda: [LocalFlightProvider()]
    tid = a.post("/trips", json=trip_body(name="Trip")).json()["id"]
    option = LocalFlightProvider().fetch("Porto", "Lisbon", date(2027, 11, 18))[0]
    leg = {"origin": "Porto", "destination": "Lisbon", "date": "2027-11-18", "option_id": option.id}
    r = a.put(f"/trips/{tid}/transport/destination", json=leg)
    assert r.status_code == 200
    assert r.json()["transport"][0]["url"].startswith("local://booking/")
    assert a.get(f"/trips/{tid}").json()["transport"][0]["option_id"] == option.id
