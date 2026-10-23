from dataclasses import replace

import anyio
import httpx

from app.auth.accounts import InMemoryAccountStore
from app.auth.fake_identity import FakeIdentityProvider
from app.config import get_settings
from app.main import app
from app.routers import auth

CREDENTIALS = {"email": "maya@example.com", "password": "abcdefghij12"}


def test_change_password_then_sign_in_with_it():
    fake = FakeIdentityProvider()
    accounts = InMemoryAccountStore()
    settings = replace(get_settings(), cookie_secure=False)
    app.dependency_overrides[auth.get_identity] = lambda: fake
    app.dependency_overrides[auth.get_accounts] = lambda: accounts
    app.dependency_overrides[auth.get_settings] = lambda: settings

    async def flow() -> list[int]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post("/auth/sign-up", json=CREDENTIALS)
            fake.confirm(CREDENTIALS["email"])
            await client.post("/auth/sign-in", json=CREDENTIALS)
            change = {"current_password": CREDENTIALS["password"], "new_password": "newpassword12"}
            codes = [(await client.post("/auth/account/password", json=change)).status_code]
            await client.post("/auth/sign-out")
            new = {"email": CREDENTIALS["email"], "password": "newpassword12"}
            codes.append((await client.post("/auth/sign-in", json=new)).status_code)
            codes.append((await client.post("/auth/sign-in", json=CREDENTIALS)).status_code)
            return codes

    try:
        assert anyio.run(flow) == [204, 200, 401]
    finally:
        app.dependency_overrides.clear()
