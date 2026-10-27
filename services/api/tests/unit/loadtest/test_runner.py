import asyncio
import json
from dataclasses import replace

import httpx
import pytest
from fastapi import FastAPI, Response

from loadtest.profile import TEN_THOUSAND_USERS, LoadProfile
from loadtest.runner import main, p95, run_load

TINY = LoadProfile(
    concurrent_users=8, ramp_seconds=0.4, hold_seconds=0.6, think_time_seconds=0.05
)


def _app(delay: float = 0.0, fail: bool = False) -> FastAPI:
    app = FastAPI()

    async def respond(body: dict):
        await asyncio.sleep(delay)
        return Response(status_code=500) if fail else body

    @app.get("/health")
    async def health():
        return await respond({"status": "ok"})

    @app.post("/auth/sign-in")
    async def sign_in(response: Response):
        response.set_cookie("session", "fake-session")
        return await respond({"status": "signed_in"})

    @app.get("/trips")
    async def trips():
        return await respond([])

    return app


def _client(app: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def test_p95_is_nearest_rank():
    assert p95([float(i) for i in range(1, 101)]) == 95.0


def test_p95_of_nothing_is_zero():
    assert p95([]) == 0.0


def test_scaled_profile_keeps_thresholds():
    s = TEN_THOUSAND_USERS.scaled(0.01)
    assert s.concurrent_users == 10
    assert s.ramp_seconds == pytest.approx(1.2)
    assert s.hold_seconds == pytest.approx(3.0)
    assert (s.p95_limit_ms, s.error_rate_limit) == (500.0, 0.01)


def test_peak_users_reached_after_ramp_and_held():
    async def go():
        async with _client(_app()) as client:
            return await run_load(client, TINY)

    result = asyncio.run(go())
    assert result.peak_active_users == TINY.concurrent_users
    assert result.peak_reached_at >= TINY.ramp_seconds
    assert result.peak_held_seconds >= TINY.hold_seconds * 0.9
    assert result.requests > 0
    assert result.errors == 0


def test_requests_that_fail_are_counted_as_errors():
    async def go():
        async with _client(_app(fail=True)) as client:
            return await run_load(client, TINY)

    result = asyncio.run(go())
    assert result.error_rate == 1.0


def _main(app, tmp_path):
    out = tmp_path / "result.json"
    code = main(
        ["--scale", "0.01", "--output", str(out)],
        transport=httpx.ASGITransport(app=app),
    )
    return code, out


def test_cli_exits_nonzero_when_target_is_slow(tmp_path):
    code, out = _main(_app(delay=0.6), tmp_path)
    assert code == 1
    assert json.loads(out.read_text())["met"] is False


def test_cli_exits_nonzero_when_target_errors(tmp_path):
    code, _ = _main(_app(fail=True), tmp_path)
    assert code == 1


def test_cli_exits_zero_against_healthy_app(tmp_path):
    code, out = _main(_app(), tmp_path)
    assert code == 0
    assert json.loads(out.read_text())["met"] is True
