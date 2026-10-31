import hashlib
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from app.integrations.settings import ProviderSettings


@dataclass(frozen=True)
class CachedResponse:
    status_code: int
    headers: tuple[tuple[str, str], ...]
    content: bytes


class ResponseCache(Protocol):
    def get(self, key: str) -> CachedResponse | None: ...

    def set(self, key: str, value: CachedResponse, ttl_seconds: float) -> None: ...


class InMemoryCache:
    def __init__(self, clock: Callable[[], float]) -> None:
        self._clock = clock
        self._items: dict[str, tuple[float, CachedResponse]] = {}

    def get(self, key: str) -> CachedResponse | None:
        item = self._items.get(key)
        if item is None:
            return None
        expires_at, value = item
        if self._clock() >= expires_at:
            del self._items[key]
            return None
        return value

    def set(self, key: str, value: CachedResponse, ttl_seconds: float) -> None:
        self._items[key] = (self._clock() + ttl_seconds, value)


def build_cache_key(
    settings: ProviderSettings,
    method: str,
    path: str,
    params: Mapping[str, str] | None,
    headers: Mapping[str, str] | None,
    body: Any,
) -> str:
    """Identifies a call; credentials are dropped and the body is hashed."""
    secret_params = set(settings.credential_params)
    secret_headers = {h.lower() for h in settings.credential_headers}
    kept_params = sorted((k, v) for k, v in (params or {}).items() if k not in secret_params)
    kept_headers = sorted(
        (k.lower(), v) for k, v in (headers or {}).items() if k.lower() not in secret_headers
    )
    body_hash = hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()
    return json.dumps(
        [settings.name, method.upper(), path, kept_params, kept_headers, body_hash]
    )
