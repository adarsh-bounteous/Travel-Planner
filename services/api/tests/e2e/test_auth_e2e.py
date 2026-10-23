from dataclasses import replace

import anyio
import httpx

from app.auth.accounts import InMemoryAccountStore
from app.auth.fake_identity import FakeIdentityProvider
from app.config import get_settings
from app.main import app
from app.routers import auth

CREDENTIALS = {"email": "maya@example.com", "password": "abcdefghij12"}


def _run(fake: FakeIdentityProvider):
    accounts = InMemoryAccountStore()
    settings = replace(get_settings(), cookie_secure=False)
    app.dependency_overrides[auth.get_identity] = lambda: fake
    app.dependency_overrides[auth.get_accounts] = lambda: accounts
    app.dependency_overrides[auth.get_settings] = lambda: settings

    async def flow() -> list[int]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            codes = [(await client.post("/auth/sign-up", json=CREDENTIALS)).status_code]
            codes.append((await client.get("/auth/me")).status_code)
            fake.confirm(CREDENTIALS["email"])
            codes.append((await client.post("/auth/sign-in", json=CREDENTIALS)).status_code)
            codes.append((await client.get("/auth/me")).status_code)
            await client.post("/auth/sign-out")
            codes.append((await client.get("/auth/me")).status_code)
            return codes

    try:
        return anyio.run(flow)
    finally:
        app.dependency_overrides.clear()


def test_sign_up_confirm_sign_in_sign_out():
    # sign-up 202, not signed in, sign-in 200, signed in, signed out
    assert _run(FakeIdentityProvider()) == [202, 401, 200, 200, 401]
