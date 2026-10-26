from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi.testclient import TestClient

from app.flights.options import FlightOption
from app.flights.providers import SEED_CATALOGUES, SEED_MODES, InMemoryFlightProvider
from app.main import app
from app.routers import deps
from app.trips.store import ChosenOption
from tests.trip_body import trip_body

FIXED = datetime(2026, 10, 26, 9, 14, tzinfo=UTC)
LEG = {"origin": "Lisbon", "destination": "Faro", "date": "2027-11-18"}


def _use_seeded_sources():
    providers = [InMemoryFlightProvider(n, c, lambda: FIXED, SEED_MODES.get(n, ("flight",))) for n, c in SEED_CATALOGUES.items()]
    app.dependency_overrides[deps.get_flight_providers] = lambda: providers


def _trip(client, **changes) -> str:
    return client.post("/trips", json=trip_body(**changes)).json()["id"]


def _url(tid: str) -> str:
    return f"/trips/{tid}/flights/shortlist"


def test_ranked_flights_from_all_sources_with_what_the_card_shows(sign_in_as):
    a = sign_in_as("a@example.com")
    _use_seeded_sources()
    body = a.get(_url(_trip(a)), params=LEG).json()
    assert [f["rank"] for f in body["flights"]] == list(range(1, len(body["flights"]) + 1))
    assert len(body["flights"]) == 8
    assert {s["status"] for s in body["sources"]} == {"ok"} and len(body["sources"]) == 6
    first = body["flights"][0]
    assert {"provider", "fare", "currency", "travel_minutes", "stops", "deal"} <= first["flight"].keys()
    assert first["flight"]["fetched_at"].startswith("2026-10-26T09:14")


def test_each_leg_only_gets_flights_for_its_own_route(sign_in_as):
    a = sign_in_as("a@example.com")
    calls = []

    class Recording:
        name = "Flight search API"

        def fetch(self, origin, destination, on):
            calls.append((origin, destination, on))
            inner = InMemoryFlightProvider(self.name, SEED_CATALOGUES[self.name], lambda: FIXED)
            return inner.fetch(origin, destination, on)

    app.dependency_overrides[deps.get_flight_providers] = lambda: [Recording()]
    tid = _trip(a)
    first = a.get(_url(tid), params=LEG).json()["flights"]
    second = a.get(_url(tid), params={"origin": "Faro", "destination": "Porto", "date": "2027-11-22"}).json()["flights"]
    assert first and second
    assert {f["flight"]["id"] for f in first}.isdisjoint({f["flight"]["id"] for f in second})
    assert calls == [("Lisbon", "Faro", date(2027, 11, 18)), ("Faro", "Porto", date(2027, 11, 22))]


def test_over_budget_flights_are_kept_and_listed_after_the_fitting_ones(sign_in_as):
    a = sign_in_as("a@example.com")
    _use_seeded_sources()
    tid = _trip(a, budget=100)
    owner_id = next(iter(sign_in_as.trips._trips))[0]
    saved = sign_in_as.trips.get_trip(owner_id, tid)
    chosen = ChosenOption(id="o1", title="Hotel", category="Stays", date=date(2027, 3, 3), price=Decimal(40), currency="EUR")
    sign_in_as.trips.save_trip(owner_id, saved.model_copy(update={"options": [chosen]}))
    body = a.get(_url(tid), params=LEG).json()
    assert len(body["flights"]) == 8 and body["budget"] == 100 and body["currency"] == "EUR"
    flags = [f["fits_budget"] for f in body["flights"]]
    assert flags == sorted(flags, reverse=True) and True in flags and False in flags
    fits = {f["flight"]["provider"]: f for f in body["flights"]}
    assert fits["Algarve Air"]["fits_budget"] and Decimal(fits["Algarve Air"]["over_budget_by"]) == 0
    assert not fits["Costa Premium"]["fits_budget"] and Decimal(fits["Costa Premium"]["over_budget_by"]) == 36
    assert body["flights"][-1]["fits_budget"] is False


def test_a_leg_with_no_flights_is_an_empty_list(sign_in_as):
    a = sign_in_as("a@example.com")
    _use_seeded_sources()
    body = a.get(_url(_trip(a)), params={"origin": "Oslo", "destination": "Bergen", "date": "2027-11-18"}).json()
    assert body["flights"] == [] and {s["status"] for s in body["sources"]} == {"ok"}


def test_saved_max_stops_ranks_the_nonstop_flight_first(sign_in_as):
    a = sign_in_as("a@example.com")

    def f(id, stops):
        return FlightOption(id=id, provider=id, source="Web search", fare=Decimal(60), currency="EUR",
                            travel_minutes=60, stops=stops, fetched_at=FIXED, url="https://example.com/f")

    class Two:
        name = "Web search"

        def fetch(self, origin, destination, on):
            return [f("one-stop", 1), f("nonstop", 0)]

    app.dependency_overrides[deps.get_flight_providers] = lambda: [Two()]
    assert a.put("/profile", json={"transport_preferences": {"max_stops": 0}}).status_code == 200
    body = a.get(_url(_trip(a)), params=LEG).json()
    assert [x["flight"]["id"] for x in body["flights"]] == ["nonstop", "one-stop"]
    assert [x["fit"] for x in body["flights"]] == [100, 0]


def test_access(sign_in_as):
    a = sign_in_as("a@example.com")
    _use_seeded_sources()
    tid = _trip(a)
    assert sign_in_as("b@example.com").get(_url(tid), params=LEG).status_code == 404
    assert TestClient(app).get(_url(tid), params=LEG).status_code == 401


def _body(a, **leg):
    _use_seeded_sources()
    return a.get(_url(_trip(a)), params={**LEG, **leg}).json()


def _entries(body):
    return [e["flight"] for e in body["flights"]]


def test_every_mode_is_listed_with_exactly_one_mode_each(sign_in_as):
    body = _body(sign_in_as("a@example.com"))
    modes = [e["mode"] for e in _entries(body)]
    assert set(modes) == {"flight", "train", "bus", "taxi"}
    assert not any("+" in m or "," in m for m in modes)
    assert body["no_service"] == []


def test_taxi_fare_is_an_estimate_with_a_ride_provider_link(sign_in_as):
    entries = _entries(_body(sign_in_as("a@example.com")))
    taxi = next(e for e in entries if e["mode"] == "taxi")
    assert taxi["estimate"] is True and taxi["url"].startswith("https://")
    assert all(not e["estimate"] for e in entries if e["mode"] != "taxi")


def test_ground_entries_show_the_same_details_as_a_flight(sign_in_as):
    for e in _entries(_body(sign_in_as("a@example.com"))):
        assert {"provider", "fare", "currency", "travel_minutes", "stops", "deal"} <= e.keys()


def test_each_leg_of_a_trip_has_entries(sign_in_as):
    a = sign_in_as("a@example.com")
    for leg in (
        {"origin": "Faro", "destination": "Porto", "date": "2027-11-22"},
        {"origin": "Faro Airport", "destination": "Faro", "date": "2027-11-19"},
    ):
        assert _body(a, **leg)["flights"]


def test_a_mode_with_no_service_is_noted_and_not_listed(sign_in_as):
    body = _body(sign_in_as("a@example.com"), origin="Faro Airport", destination="Faro")
    assert body["no_service"] == ["flight", "train", "bus"]
    assert {e["mode"] for e in _entries(body)} == {"taxi"}


def test_a_failed_source_is_not_reported_as_no_service(sign_in_as):
    a = sign_in_as("a@example.com")

    class Broken:
        name = "Rail search"
        modes = ("train",)

        def fetch(self, origin, destination, on):
            raise RuntimeError("down")

    app.dependency_overrides[deps.get_flight_providers] = lambda: [Broken()]
    body = a.get(_url(_trip(a)), params=LEG).json()
    assert "train" not in body["no_service"] and body["sources"][0]["status"] == "failed"
