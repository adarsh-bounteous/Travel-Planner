from datetime import UTC, datetime

import pytest

from tests.unit.locations_fakes import LISBON


def body(**over):
    return {
        "name": "Trip",
        "destination": "Lisbon",
        "start_date": "2026-06-01",
        "end_date": "2026-06-03",
        "budget": 500,
        "currency": "EUR",
        "traveller_count": 2,
        **over,
    }


def test_creating_a_trip_stores_the_resolved_location(sign_in_as):
    client = sign_in_as("a@example.com")
    created = client.post("/trips", json=body()).json()
    loc = client.get(f"/trips/{created['id']}").json()["location"]
    assert loc["name"] == "Lisbon, Portugal" and loc["country_code"] == "PT"
    assert loc["time_zone"] == "Europe/Lisbon"
    assert (loc["lat"], loc["lng"]) == (38.7167, -9.1333)
    assert set(loc["bbox"]) == {"south", "north", "west", "east"}


def test_changing_the_destination_stores_the_new_location(sign_in_as):
    client = sign_in_as("a@example.com")
    sign_in_as.resolver.fail_with("no_match")
    trip_id = client.post("/trips", json=body()).json()["id"]
    sign_in_as.resolver.failure = None
    response = client.put(f"/trips/{trip_id}", json=body(destination="Porto"))
    assert response.json()["location"]["country_code"] == "PT"


def test_unchanged_destination_is_not_resolved_again(sign_in_as):
    client = sign_in_as("a@example.com")
    trip_id = client.post("/trips", json=body()).json()["id"]
    calls = sign_in_as.resolver.calls
    client.put(f"/trips/{trip_id}", json=body(name="Renamed"))
    assert sign_in_as.resolver.calls == calls


def test_first_open_resolves_an_existing_trip(sign_in_as):
    client = sign_in_as("a@example.com")
    store = sign_in_as.trips
    trip_id = client.post("/trips", json=body()).json()["id"]
    (owner,) = {o for o, _ in store._trips}
    store.save_trip(owner, store.get_trip(owner, trip_id).model_copy(update={"location": None}))
    sign_in_as.resolver.calls = 0
    assert client.get(f"/trips/{trip_id}").json()["location"]["country_code"] == "PT"
    saved = store.get_trip(owner, trip_id)
    assert saved.location == LISBON  # saved, not only returned
    assert saved.updated_at == datetime(2026, 1, 1, tzinfo=UTC)  # open does not touch updated_at
    client.get(f"/trips/{trip_id}")
    assert sign_in_as.resolver.calls == 1


def test_list_does_not_resolve(sign_in_as):
    client = sign_in_as("a@example.com")
    client.post("/trips", json=body())
    calls = sign_in_as.resolver.calls
    client.get("/trips")
    assert sign_in_as.resolver.calls == calls


@pytest.mark.parametrize("failure", ["no_match", "unreachable", "garbage_payload", "no_time_zone", "raises"])
def test_unresolved_destination_saves_without_location(sign_in_as, failure):
    client = sign_in_as("a@example.com")
    sign_in_as.resolver.fail_with(failure)
    response = client.post("/trips", json=body(destination="Atlantis"))
    assert response.status_code == 201
    assert response.json()["location"] is None
    assert client.get(f"/trips/{response.json()['id']}").json()["location"] is None


def test_edit_to_an_unresolvable_destination_clears_the_location(sign_in_as):
    client = sign_in_as("a@example.com")
    trip_id = client.post("/trips", json=body()).json()["id"]
    sign_in_as.resolver.fail_with("raises")
    response = client.put(f"/trips/{trip_id}", json=body(destination="Atlantis"))
    assert response.status_code == 200
    assert response.json()["location"] is None
