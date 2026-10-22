import anyio
import httpx

from app.main import app


async def _get(path: str) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def test_health_endpoint():
    resp = anyio.run(_get, "/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
