from fastapi.testclient import TestClient

from app.main import app
from app.routers import deps
from tests.trip_body import create_trip


def _trip(client, **extra):
    return create_trip(client, name="Trip", start_date="2027-01-01", end_date="2027-01-12", destination="Lisbon", **extra)


def test_owner_gets_options_from_two_source_kinds(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    r = a.get(f"/trips/{tid}/activity-options")
    assert r.status_code == 200
    assert {p["source"] for o in r.json()["options"] for p in o["prices"]} == {"web_search", "partner"}


def test_access_and_auth(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a)
    assert sign_in_as("b@example.com").get(f"/trips/{tid}/activity-options").status_code == 404
    assert TestClient(app).get(f"/trips/{tid}/activity-options").status_code == 401


def test_nothing_matching_is_an_empty_list(sign_in_as):
    a = sign_in_as("a@example.com")
    tid = _trip(a, interests=["skiing"])
    assert a.get(f"/trips/{tid}/activity-options").json()["options"] == []


def test_failing_provider_is_skipped(sign_in_as):
    class Broken:
        name = "Broken"
        source = "partner"

        def fetch(self, place):
            raise RuntimeError("down")

    a = sign_in_as("a@example.com")
    tid = _trip(a)
    app.dependency_overrides[deps.get_activity_providers] = lambda: [Broken()]
    r = a.get(f"/trips/{tid}/activity-options")
    assert r.status_code == 200 and r.json()["options"] == []
