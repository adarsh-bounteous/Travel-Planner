import pytest


@pytest.fixture(autouse=True)
def _session_secret(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")


@pytest.fixture(autouse=True)
def _local_data_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCAL_DATA_DIR", str(tmp_path / "local-data"))


class _NoOsmPlaces:
    """Tests never reach Overpass: the live search is unavailable, so the seed catalogue is served."""

    def search(self, destination):
        raise RuntimeError("overpass is not reachable in tests")


@pytest.fixture(autouse=True)
def _no_overpass(monkeypatch):
    from app.routers import deps

    monkeypatch.setattr(deps, "_osm_places", lambda: _NoOsmPlaces())


@pytest.fixture
def sign_in_as():
    """Return a function that builds a client with its own cookie jar, signed in as `email`.

    Clients built in one test share the identity provider and stores, so two of them are two
    devices (same email) or two travellers (different emails).
    """
    from dataclasses import replace
    from datetime import UTC, datetime
    from decimal import Decimal

    from fastapi.testclient import TestClient

    from app.auth.fake_identity import FakeIdentityProvider
    from app.config import get_settings
    from app.main import app
    from app.routers import auth, deps
    from app.places.search import InMemoryPlaceSearch, Place
    from app.trips.profile_store import InMemoryProfileStore
    from app.trips.saved_store import InMemorySavedPlaceStore
    from app.trips.invites import InMemoryInviteSender
    from app.trips.rates import InMemoryRates
    from app.trips.store import InMemoryTripStore

    fake = FakeIdentityProvider()
    trips = InMemoryTripStore()
    profiles = InMemoryProfileStore()
    saved_places = InMemorySavedPlaceStore()
    places = InMemoryPlaceSearch(
        {
            "Lisbon": [
                Place(
                    id="p1",
                    name="Alfama",
                    image_url="/alfama.jpg",
                    place_type="landmark",
                    price="free",
                    lat=38.711,
                    lng=-9.130,
                )
            ]
        }
    )
    invites = InMemoryInviteSender()
    settings = replace(get_settings(), cookie_secure=False)
    now = datetime(2026, 1, 1, tzinfo=UTC)
    app.dependency_overrides[auth.get_identity] = lambda: fake
    app.dependency_overrides[auth.get_now] = lambda: now
    app.dependency_overrides[auth.get_settings] = lambda: settings
    app.dependency_overrides[deps.get_trips] = lambda: trips
    app.dependency_overrides[deps.get_invite_sender] = lambda: invites
    app.dependency_overrides[deps.get_profiles] = lambda: profiles
    app.dependency_overrides[deps.get_places] = lambda: places
    app.dependency_overrides[deps.get_saved_places] = lambda: saved_places
    rates = InMemoryRates({("USD", "EUR"): Decimal("0.92")})
    app.dependency_overrides[deps.get_rates] = lambda: rates
    from tests.unit.locations_fakes import FakeResolver

    resolver = FakeResolver()
    app.dependency_overrides[deps.get_destination_resolver] = lambda: resolver
    password = "abcdefghij12"

    def make(email: str) -> TestClient:
        client = TestClient(app, follow_redirects=False)
        client.post("/auth/sign-up", json={"email": email, "password": password})
        fake.confirm(email)
        response = client.post("/auth/sign-in", json={"email": email, "password": password})
        assert response.status_code == 200
        return client

    make.invites = invites
    make.trips = trips
    make.rates = rates
    make.resolver = resolver
    yield make
    app.dependency_overrides.clear()
