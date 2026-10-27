from datetime import UTC, datetime

import anyio
import httpx

from app.availability.gate import ProbeResult
from app.availability.store import InMemoryProbeStore
from app.main import app
from app.routers import availability

NOW = datetime(2026, 10, 5, 12, 30, tzinfo=UTC)


async def _get(path: str) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.get(path)


def test_availability_includes_open_outage():
    store = InMemoryProbeStore()
    store.record(ProbeResult(datetime(2026, 10, 5, 12, 0, tzinfo=UTC), ok=False))
    app.dependency_overrides[availability.get_probe_store] = lambda: store
    app.dependency_overrides[availability.get_availability_now] = lambda: NOW
    try:
        resp = anyio.run(_get, "/availability")
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200
    body = resp.json()
    assert body["month"] == "2026-10"
    assert body["downtime_seconds"] == 1800
    assert body["final"] is False
    assert body["status"] == "ok"
