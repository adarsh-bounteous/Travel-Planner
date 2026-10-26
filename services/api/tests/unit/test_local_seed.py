from datetime import date

import pytest

from app.auth.fake_identity import FakeIdentityProvider
from app.auth.identity import EmailTaken
from app.auth.password import validate_password
from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD, seed_demo_data
from app.trips.store import InMemoryTripStore

TODAY = date(2026, 1, 1)


def seed(identity, trips):
    return seed_demo_data(
        is_empty=lambda: identity.is_empty() and trips.is_empty(),
        identity=identity,
        trips=trips,
        today=TODAY,
    )


@pytest.fixture
def stores():
    return FakeIdentityProvider(), InMemoryTripStore()


@pytest.fixture
def seeded_client(sign_in_as):
    # sign_in_as wires its own fake and store; reuse them by seeding through its store and identity.
    from app.main import app
    from app.routers import auth

    identity = app.dependency_overrides[auth.get_identity]()
    trips = sign_in_as.trips
    assert seed(identity, trips) is True
    return sign_in_as, identity, trips


def demo_client(sign_in_as):
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app, follow_redirects=False)
    r = client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200
    return client


def test_demo_password_obeys_real_rule():
    assert validate_password(DEMO_PASSWORD)


def test_first_start_creates_confirmed_demo_user(stores):
    identity, trips = stores
    assert seed(identity, trips) is True
    assert identity.sign_in_email(DEMO_EMAIL, DEMO_PASSWORD)  # raises EmailNotConfirmed if not confirmed


def test_demo_user_lists_two_sample_trips(seeded_client, sign_in_as):
    client = demo_client(sign_in_as)
    names = [t["name"] for t in client.get("/trips").json()]
    assert sorted(names) == ["Summer in Kyoto", "Weekend in Lisbon"]


def test_sample_trips_are_complete_and_dated_from_today(stores):
    identity, trips = stores
    seed(identity, trips)
    user_id = identity.sign_in_email(DEMO_EMAIL, DEMO_PASSWORD)
    by_name = {t.name: t for t in trips.list_trips(user_id)}
    lisbon, kyoto = by_name["Weekend in Lisbon"], by_name["Summer in Kyoto"]
    assert (lisbon.end_date - lisbon.start_date).days == 3
    assert (kyoto.end_date - kyoto.start_date).days == 10
    for trip in (lisbon, kyoto):
        assert trip.start_date > TODAY
        assert trip.destination and trip.budget and trip.currency and trip.traveller_count
        assert len(trip.days) == (trip.end_date - trip.start_date).days + 1
    assert lisbon.id != kyoto.id


def test_sign_in_with_demo_details_needs_no_sign_up(seeded_client, sign_in_as):
    from app.auth.accounts import InMemoryAccountStore
    from app.main import app
    from app.routers import auth

    accounts = InMemoryAccountStore()
    app.dependency_overrides[auth.get_accounts] = lambda: accounts
    client = demo_client(sign_in_as)
    assert client.get("/auth/me").status_code == 200


def test_restart_adds_nothing(stores):
    identity, trips = stores
    assert seed(identity, trips) is True
    user_id = identity.sign_in_email(DEMO_EMAIL, DEMO_PASSWORD)
    assert seed(identity, trips) is False
    assert identity.account_count(DEMO_EMAIL) == 1
    assert len(trips.list_trips(user_id)) == 2


def test_edited_sample_trip_keeps_its_edits(seeded_client, sign_in_as):
    _, identity, trips = seeded_client
    client = demo_client(sign_in_as)
    listed = client.get("/trips").json()
    lisbon = next(t for t in listed if t["name"] == "Weekend in Lisbon")
    body = {k: lisbon[k] for k in ("destination", "start_date", "end_date", "budget")}
    r = client.put(f"/trips/{lisbon['id']}", json={**body, "name": "Lisbon, extended"})
    assert r.status_code == 200
    assert seed(identity, trips) is False  # restart
    names = [t["name"] for t in client.get("/trips").json()]
    assert "Lisbon, extended" in names
    assert "Weekend in Lisbon" not in names


def test_new_visitor_can_sign_up_after_seeding(seeded_client):
    from fastapi.testclient import TestClient

    from app.main import app

    _, identity, _ = seeded_client
    client = TestClient(app, follow_redirects=False)
    r = client.post("/auth/sign-up", json={"email": "sam@example.com", "password": "abcdefghij12"})
    assert r.status_code == 202
    assert identity.account_count("sam@example.com") == 1
    again = client.post("/auth/sign-up", json={"email": DEMO_EMAIL, "password": "abcdefghij12"})
    assert again.status_code == 400
    assert again.json() == {"code": "could_not_create"}


def test_other_account_only_adds_nothing(stores):
    identity, trips = stores
    identity.sign_up_email("sam@example.com", "abcdefghij12")
    assert seed(identity, trips) is False
    assert identity.account_exists(DEMO_EMAIL) is False
    assert trips.list_trips("user-1") == []


def test_trip_only_adds_nothing(stores):
    from app.trips.store import Trip

    identity, trips = stores
    trips.save_trip("user-9", Trip(id="t1", name="Mine"))
    assert seed(identity, trips) is False
    assert identity.account_exists(DEMO_EMAIL) is False
    assert [t.name for t in trips.list_trips("user-9")] == ["Mine"]


def test_fake_create_confirmed_user_refuses_a_taken_email(stores):
    identity, _ = stores
    identity.create_confirmed_user("a@example.com", "abcdefghij12")
    with pytest.raises(EmailTaken):
        identity.create_confirmed_user("a@example.com", "abcdefghij12")
