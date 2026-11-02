from datetime import UTC, datetime

import pytest

from app.locations.cache import InMemoryLocationCache
from app.locations.resolver import CacheOnlyResolver, cache_key
from app.main import app
from app.routers import deps
from app.trips.destination import chosen_destination
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


def _older_trip(sign_in_as, client):
    store = sign_in_as.trips
    trip_id = client.post("/trips", json=body()).json()["id"]
    (owner,) = {o for o, _ in store._trips}
    older = {"country": "Portugal", "place": "Lisbon", "location": None}
    store.save_trip(owner, store.get_trip(owner, trip_id).model_copy(update=older))
    return store, owner, trip_id


def test_opening_an_older_trip_stores_its_location(sign_in_as):
    client = sign_in_as("a@example.com")
    store, owner, trip_id = _older_trip(sign_in_as, client)
    client.get(f"/trips/{trip_id}")
    assert store.get_trip(owner, trip_id).location == LISBON


def test_an_unopened_older_trip_has_no_location(sign_in_as):
    client = sign_in_as("a@example.com")
    store, owner, trip_id = _older_trip(sign_in_as, client)
    client.get("/trips")  # listing does not backfill
    assert store.get_trip(owner, trip_id).location is None


def test_cached_result_backfills_with_the_provider_off(sign_in_as):
    client = sign_in_as("a@example.com")
    store, owner, trip_id = _older_trip(sign_in_as, client)
    cache = InMemoryLocationCache()
    cache.put(cache_key("Portugal", "Lisbon", "Lisbon"), LISBON, datetime(2020, 1, 1, tzinfo=UTC))
    app.dependency_overrides[deps.get_backfill_resolver] = lambda: CacheOnlyResolver(cache)
    assert client.get(f"/trips/{trip_id}").status_code == 200
    assert store.get_trip(owner, trip_id).location == LISBON


def test_no_cached_result_leaves_the_trip_unresolved_with_the_provider_off(sign_in_as):
    client = sign_in_as("a@example.com")
    store, owner, trip_id = _older_trip(sign_in_as, client)
    app.dependency_overrides[deps.get_backfill_resolver] = lambda: CacheOnlyResolver(InMemoryLocationCache())
    assert client.get(f"/trips/{trip_id}").status_code == 200
    assert store.get_trip(owner, trip_id).location is None


def test_a_stored_location_is_not_resolved_again(sign_in_as):
    client = sign_in_as("a@example.com")
    store, owner, trip_id = _older_trip(sign_in_as, client)
    client.get(f"/trips/{trip_id}")
    stored, calls = store.get_trip(owner, trip_id).location, sign_in_as.resolver.calls
    sign_in_as.resolver.failure = "no_match"  # a second lookup would now find nothing
    client.get(f"/trips/{trip_id}")
    assert store.get_trip(owner, trip_id).location == stored
    assert sign_in_as.resolver.calls == calls


def test_a_location_stored_by_another_open_is_kept(sign_in_as):
    client = sign_in_as("a@example.com")
    store, owner, trip_id = _older_trip(sign_in_as, client)
    other = LISBON.model_copy(update={"name": "Elsewhere"})

    class RacingResolver:
        def resolve(self, country, place, destination):
            store.save_trip(owner, store.get_trip(owner, trip_id).model_copy(update={"location": other}))
            return LISBON

    app.dependency_overrides[deps.get_backfill_resolver] = lambda: RacingResolver()
    client.get(f"/trips/{trip_id}")
    assert store.get_trip(owner, trip_id).location == other


def test_open_shows_the_page_before_the_lookup(sign_in_as):
    client = sign_in_as("a@example.com")
    _, _, trip_id = _older_trip(sign_in_as, client)
    assert client.get(f"/trips/{trip_id}").json()["location"] is None  # the lookup runs after the response
    assert client.get(f"/trips/{trip_id}").json()["location"]["country_code"] == "PT"


def test_backfill_leaves_the_destination_alone(sign_in_as):
    client = sign_in_as("a@example.com")
    store, owner, trip_id = _older_trip(sign_in_as, client)
    before = store.get_trip(owner, trip_id)
    client.get(f"/trips/{trip_id}")
    after = store.get_trip(owner, trip_id)
    assert (after.destination, after.country, after.place) == (before.destination, before.country, before.place)
    assert after.updated_at == before.updated_at and after.location == LISBON
    assert chosen_destination(after) == chosen_destination(before)


def test_a_trip_with_an_earlier_no_match_is_retried(sign_in_as):
    client = sign_in_as("a@example.com")
    store, owner, trip_id = _older_trip(sign_in_as, client)
    sign_in_as.resolver.fail_with("no_match")
    client.get(f"/trips/{trip_id}")
    assert store.get_trip(owner, trip_id).location is None
    sign_in_as.resolver.failure = None
    client.get(f"/trips/{trip_id}")
    assert store.get_trip(owner, trip_id).location == LISBON


def test_a_resolver_that_raises_does_not_fail_the_open(sign_in_as):
    client = sign_in_as("a@example.com")
    store, owner, trip_id = _older_trip(sign_in_as, client)
    sign_in_as.resolver.fail_with("raises")
    assert client.get(f"/trips/{trip_id}").status_code == 200
    assert store.get_trip(owner, trip_id).location is None


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
