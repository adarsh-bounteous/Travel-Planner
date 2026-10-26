import anyio
import httpx

from app.main import app


async def _get(path: str) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def test_startup_status_with_no_env_set(monkeypatch):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    resp = anyio.run(_get, "/startup-status")
    assert resp.status_code == 200
    assert resp.json()["local_mode"] is False
