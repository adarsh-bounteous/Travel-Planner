from dataclasses import replace

import anyio
import httpx

from app.auth.fake_identity import FakeIdentityProvider
from app.config import get_settings
from app.main import app
from app.routers import auth, deps
from tests.trip_body import trip_body
from app.trips.profile_store import InMemoryProfileStore
from app.trips.store import InMemoryTripStore

PASSWORD = "abcdefghij12"


def test_two_devices_see_the_same_trips_and_profile():
    fake = FakeIdentityProvider()
    trips = InMemoryTripStore()
    profiles = InMemoryProfileStore()
    settings = replace(get_settings(), cookie_secure=False)
    app.dependency_overrides[auth.get_identity] = lambda: fake
    app.dependency_overrides[auth.get_settings] = lambda: settings
    app.dependency_overrides[deps.get_trips] = lambda: trips
    app.dependency_overrides[deps.get_profiles] = lambda: profiles

    async def flow() -> None:
        transport = httpx.ASGITransport(app=app)
        creds = {"email": "maya@example.com", "password": PASSWORD}
        async with (
            httpx.AsyncClient(transport=transport, base_url="http://test") as device1,
            httpx.AsyncClient(transport=transport, base_url="http://test") as device2,
        ):
            await device1.post("/auth/sign-up", json=creds)
            fake.confirm(creds["email"])
            await device1.post("/auth/sign-in", json=creds)
            tid = (await device1.post("/trips", json=trip_body())).json()["id"]
            await device1.put("/profile", json={"display_name": "Maya"})

            await device2.post("/auth/sign-in", json=creds)
            assert (await device2.get(f"/trips/{tid}")).json()["name"] == "Lisbon"
            assert (await device2.get("/profile")).json()["display_name"] == "Maya"

            await device1.put(f"/trips/{tid}", json={"name": "Lisbon 2"})
            await device1.put("/profile", json={"display_name": "Maya R"})
            assert (await device2.get(f"/trips/{tid}")).json()["name"] == "Lisbon 2"
            assert (await device2.get("/profile")).json()["display_name"] == "Maya R"

    try:
        anyio.run(flow)
    finally:
        app.dependency_overrides.clear()
