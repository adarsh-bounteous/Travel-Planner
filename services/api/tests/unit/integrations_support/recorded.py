"""Record a real response once, scrub it, and replay it offline through an httpx transport."""
import hashlib
import json
from collections.abc import Iterable
from pathlib import Path

import httpx

from tests.unit.integrations_support.scrub import scrub_body

FIXTURES_DIR = Path(__file__).parents[1] / "fixtures" / "recorded"

CREDENTIAL_PARAMS = frozenset({"key", "api_key", "apikey", "token", "access_token", "appid", "app_id"})
CREDENTIAL_HEADERS = frozenset({"authorization", "x-api-key", "api-key", "x-auth-token", "cookie"})
_UNSAFE_RESPONSE_HEADERS = frozenset({"set-cookie", "authorization", "content-length", "content-encoding"})


class FixtureMissing(Exception):
    """A replayed call has no recorded fixture."""


def fixture_key(request: httpx.Request, credential_params: Iterable[str] = ()) -> str:
    hidden = {p.lower() for p in credential_params} | CREDENTIAL_PARAMS
    params = sorted((k, v) for k, v in request.url.params.multi_items() if k.lower() not in hidden)
    url = request.url.copy_with(query=None)
    material = json.dumps([request.method, str(url), params, hashlib.sha256(request.content).hexdigest()])
    return hashlib.sha256(material.encode()).hexdigest()[:32]


def _path(fixtures_dir: Path, key: str) -> Path:
    return fixtures_dir / f"{key}.json"


def _replay(path: Path) -> httpx.Response:
    data = json.loads(path.read_text())
    return httpx.Response(data["status"], headers=data["headers"], content=data["body"].encode())


class ReplayTransport(httpx.BaseTransport):
    def __init__(self, fixtures_dir: Path) -> None:
        self._dir = fixtures_dir

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        path = _path(self._dir, fixture_key(request))
        if not path.exists():
            raise FixtureMissing(f"no recorded fixture for {request.method} {request.url.copy_with(query=None)}")
        return _replay(path)


class RecordingTransport(httpx.BaseTransport):
    def __init__(
        self, fixtures_dir: Path, live: httpx.BaseTransport, *, secrets: Iterable[str] = ()
    ) -> None:
        self._dir = fixtures_dir
        self._live = live
        self._secrets = list(secrets)

    def _request_secrets(self, request: httpx.Request) -> list[str]:
        found = [v for k, v in request.url.params.multi_items() if k.lower() in CREDENTIAL_PARAMS]
        for name, value in request.headers.items():
            if name.lower() in CREDENTIAL_HEADERS:
                found.append(value)
                found.extend(value.split())
        return found

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        path = _path(self._dir, fixture_key(request))
        if path.exists():
            return _replay(path)
        response = self._live.handle_request(request)
        response.read()
        secrets = self._secrets + self._request_secrets(request)
        body = scrub_body(response.content, secrets=secrets).decode()
        headers = {
            k: v for k, v in response.headers.items() if k.lower() not in _UNSAFE_RESPONSE_HEADERS
        }
        headers = {k: scrub_body(v.encode(), secrets=secrets).decode() for k, v in headers.items()}
        self._dir.mkdir(parents=True, exist_ok=True)
        with path.open("x") as handle:
            json.dump({"status": response.status_code, "headers": headers, "body": body}, handle, indent=2)
        return _replay(path)
