import argparse
import asyncio
import json
import math
import time
from dataclasses import asdict, dataclass

import httpx

from app.local_seed import DEMO_EMAIL, DEMO_PASSWORD
from loadtest.profile import TEN_THOUSAND_USERS, LoadProfile
from loadtest.verdict import evaluate

REQUEST_TIMEOUT_SECONDS = 10.0


@dataclass(frozen=True)
class LoadResult:
    requests: int
    errors: int
    p95_ms: float
    error_rate: float
    peak_active_users: int
    peak_reached_at: float
    peak_held_seconds: float


def p95(latencies_ms: list[float]) -> float:
    """Nearest-rank 95th percentile."""
    if not latencies_ms:
        return 0.0
    ordered = sorted(latencies_ms)
    return ordered[math.ceil(0.95 * len(ordered)) - 1]


class _Recorder:
    def __init__(self, peak_target: int) -> None:
        self.latencies_ms: list[float] = []
        self.errors = 0
        self.active = 0
        self.peak = 0
        self.peak_target = peak_target
        self.peak_reached_at: float | None = None
        self.peak_left_at: float | None = None

    def user_started(self, at: float) -> None:
        self.active += 1
        self.peak = max(self.peak, self.active)
        if self.active == self.peak_target and self.peak_reached_at is None:
            self.peak_reached_at = at

    def user_stopped(self, at: float) -> None:
        if self.active == self.peak_target and self.peak_left_at is None:
            self.peak_left_at = at
        self.active -= 1

    async def timed(self, client: httpx.AsyncClient, method: str, url: str, **kwargs):
        started = time.perf_counter()
        response = None
        try:
            response = await client.request(method, url, **kwargs)
            failed = not response.is_success
        except httpx.HTTPError:  # timeout or transport error
            failed = True
        self.latencies_ms.append((time.perf_counter() - started) * 1000)
        self.errors += failed
        return None if failed else response


async def _virtual_user(
    client: httpx.AsyncClient, rec: _Recorder, profile: LoadProfile, start: float, end: float
) -> None:
    """Sign in once, then loop a read-mostly scenario until the hold ends."""
    rec.user_started(time.perf_counter() - start)
    try:
        signed_in = await rec.timed(
            client, "POST", "/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
        )
        session = signed_in.cookies.get("session") if signed_in else None
        headers = {"Cookie": f"session={session}"} if session else {}
        while time.perf_counter() - start < end:
            await rec.timed(client, "GET", "/health")
            await rec.timed(client, "GET", "/trips", headers=headers)
            await asyncio.sleep(profile.think_time_seconds)
    finally:
        rec.user_stopped(time.perf_counter() - start)


async def run_load(client: httpx.AsyncClient, profile: LoadProfile) -> LoadResult:
    """Ramp users linearly to concurrent_users over ramp_seconds, then hold until the end."""
    rec = _Recorder(profile.concurrent_users)
    start = time.perf_counter()
    end = profile.ramp_seconds + profile.hold_seconds
    users = []
    for i in range(profile.concurrent_users):
        ready = (i + 1) * profile.ramp_seconds / profile.concurrent_users
        await asyncio.sleep(max(0.0, ready - (time.perf_counter() - start)))
        users.append(asyncio.create_task(_virtual_user(client, rec, profile, start, end)))
    await asyncio.gather(*users)

    total = len(rec.latencies_ms)
    reached = rec.peak_reached_at if rec.peak_reached_at is not None else end
    left = rec.peak_left_at if rec.peak_left_at is not None else end
    return LoadResult(
        requests=total,
        errors=rec.errors,
        p95_ms=p95(rec.latencies_ms),
        error_rate=rec.errors / total if total else 1.0,  # no answer at all is a failure
        peak_active_users=rec.peak,
        peak_reached_at=reached,
        peak_held_seconds=max(0.0, left - reached),
    )


def main(argv: list[str] | None = None, transport: httpx.AsyncBaseTransport | None = None) -> int:
    parser = argparse.ArgumentParser(prog="loadtest.runner")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", default="loadtest-result.json")
    parser.add_argument(
        "--scale", type=float, default=1.0, help="shrink the run; for tests and smoke runs only"
    )
    args = parser.parse_args(argv)
    profile = TEN_THOUSAND_USERS.scaled(args.scale)

    async def go() -> LoadResult:
        async with httpx.AsyncClient(
            base_url=args.base_url, transport=transport, timeout=REQUEST_TIMEOUT_SECONDS,
            limits=httpx.Limits(max_connections=None, max_keepalive_connections=None),
        ) as client:
            return await run_load(client, profile)

    result = asyncio.run(go())
    verdict = evaluate(result.p95_ms, result.error_rate, profile)
    summary = {**asdict(result), "met": verdict.met, "reasons": verdict.reasons,
               "profile": asdict(profile)}
    with open(args.output, "w") as out:
        json.dump(summary, out, indent=2)
    print(
        f"{result.requests} requests, p95 {result.p95_ms:.1f} ms, "
        f"error rate {result.error_rate:.2%}, peak {result.peak_active_users} users"
    )
    if verdict.met:
        print("10,000-user capacity: MET")
        return 0
    print("10,000-user capacity: NOT MET - " + "; ".join(verdict.reasons))
    return 1
