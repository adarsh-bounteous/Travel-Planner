import pytest


@pytest.fixture(autouse=True)
def _session_secret(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")


@pytest.fixture
def sign_in_as():
    """Return a function that builds a client with its own cookie jar, signed in as `email`.

    Clients built in one test share the identity provider and stores, so two of them are two
    devices (same email) or two travellers (different emails).
    """
    from dataclasses import replace
    from datetime import UTC, datetime

    from fastapi.testclient import TestClient

    from app.auth.fake_identity import FakeIdentityProvider
    from app.config import get_settings
    from app.main import app
    from app.routers import auth, deps
    from app.trips.profile_store import InMemoryProfileStore
    from app.trips.store import InMemoryTripStore

    fake = FakeIdentityProvider()
    trips = InMemoryTripStore()
    profiles = InMemoryProfileStore()
    settings = replace(get_settings(), cookie_secure=False)
    now = datetime(2026, 1, 1, tzinfo=UTC)
    app.dependency_overrides[auth.get_identity] = lambda: fake
    app.dependency_overrides[auth.get_now] = lambda: now
    app.dependency_overrides[auth.get_settings] = lambda: settings
    app.dependency_overrides[deps.get_trips] = lambda: trips
    app.dependency_overrides[deps.get_profiles] = lambda: profiles
    password = "abcdefghij12"

    def make(email: str) -> TestClient:
        client = TestClient(app, follow_redirects=False)
        client.post("/auth/sign-up", json={"email": email, "password": password})
        fake.confirm(email)
        response = client.post("/auth/sign-in", json={"email": email, "password": password})
        assert response.status_code == 200
        return client

    yield make
    app.dependency_overrides.clear()
