import json
from dataclasses import dataclass, field

import httpx

from app.integrations import IntegrationClient, ProviderSettings

CONNECT_ERROR = "connect_error"


class FakeClock:
    def __init__(self) -> None:
        self.t = 1000.0
        self.sleeps: list[float] = []

    def now(self) -> float:
        return self.t

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.t += seconds

    def advance(self, seconds: float) -> None:
        self.t += seconds


@dataclass
class Harness:
    client: IntegrationClient
    clock: FakeClock
    hosts: list[str] = field(default_factory=list)
    call_times: list[float] = field(default_factory=list)

    @property
    def calls(self) -> int:
        return len(self.hosts)

    def calls_for(self, name: str) -> int:
        return self.hosts.count(f"{name}.test")

    @property
    def sleeps(self) -> list[float]:
        return self.clock.sleeps


def make_client(settings=None, script=None, providers=None, cache=None, logger=None) -> Harness:
    """Script items: a status, (status, headers), or CONNECT_ERROR; 200 once exhausted."""
    providers = providers or {"p": (settings or {}, script or [])}
    queues = {name: list(s) for name, (_, s) in providers.items()}
    clock = FakeClock()
    harness = Harness(client=None, clock=clock)

    def handler(request: httpx.Request) -> httpx.Response:
        harness.hosts.append(request.url.host)
        harness.call_times.append(clock.now())
        queue = queues[request.url.host.removesuffix(".test")]
        item = queue.pop(0) if queue else 200
        if item == CONNECT_ERROR:
            raise httpx.ConnectError("boom", request=request)
        status, headers = item if isinstance(item, tuple) else (item, {})
        return httpx.Response(status, headers=headers, content=json.dumps({"ok": True}))

    harness.client = IntegrationClient(
        [
            ProviderSettings(name=n, base_url=f"http://{n}.test", **overrides)
            for n, (overrides, _) in providers.items()
        ],
        cache=cache,
        transport=httpx.MockTransport(handler),
        clock=clock.now,
        sleep=clock.sleep,
        logger=logger,
    )
    return harness
