from dataclasses import replace

import anyio
import httpx

from app.auth.fake_identity import FakeIdentityProvider
from app.config import get_settings
from app.main import app
from app.routers import auth, deps
from app.trips.store import InMemoryTripStore
from tests.trip_body import trip_body

PASSWORD = "abcdefghij12"


def test_link_works_for_a_visitor_until_the_owner_turns_it_off():
    fake = FakeIdentityProvider()
    trips = InMemoryTripStore()
    settings = replace(get_settings(), cookie_secure=False)
    app.dependency_overrides[auth.get_identity] = lambda: fake
    app.dependency_overrides[auth.get_settings] = lambda: settings
    app.dependency_overrides[deps.get_trips] = lambda: trips

    async def flow() -> None:
        transport = httpx.ASGITransport(app=app)
        creds = {"email": "maya@example.com", "password": PASSWORD}
        async with (
            httpx.AsyncClient(transport=transport, base_url="http://test") as owner,
            httpx.AsyncClient(transport=transport, base_url="http://test") as visitor,
        ):
            await owner.post("/auth/sign-up", json=creds)
            fake.confirm(creds["email"])
            await owner.post("/auth/sign-in", json=creds)
            tid = (await owner.post("/trips", json=trip_body())).json()["id"]
            url = (await owner.post(f"/trips/{tid}/share-link")).json()["share_url"]
            path = url.replace("/trips/read-only/", "/shared/")

            assert (await visitor.get(path)).json()["name"] == "Lisbon"
            await owner.delete(f"/trips/{tid}/share-link")
            gone = await visitor.get(path)
            assert (gone.status_code, gone.json()) == (404, {"code": "not_found"})

    try:
        anyio.run(flow)
    finally:
        app.dependency_overrides.clear()
