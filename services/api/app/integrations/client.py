import logging
import time
from collections.abc import Callable, Iterable, Mapping
from typing import Any

import httpx

from app.integrations.breaker import CircuitBreaker
from app.integrations.cache import CachedResponse, InMemoryCache, ResponseCache, build_cache_key
from app.integrations.errors import CircuitOpenError, ProviderUnavailableError, RateLimitError
from app.integrations.logging import log_call, silence_httpx_request_logs
from app.integrations.rate_limit import RateLimiter
from app.integrations.retry import backoff_delay, is_retryable_status, parse_retry_after
from app.integrations.settings import ProviderSettings

DEFAULT_LOGGER = logging.getLogger("app.integrations")


class _Provider:
    def __init__(self, settings: ProviderSettings, clock: Callable[[], float]) -> None:
        self.settings = settings
        self.breaker = CircuitBreaker(
            settings.breaker_threshold, settings.breaker_cooldown_seconds, clock
        )
        self.limiter = (
            RateLimiter(settings.rate_limit_calls, settings.rate_limit_period_seconds, clock)
            if settings.rate_limit_calls and settings.rate_limit_period_seconds
            else None
        )


class IntegrationClient:
    """The one outbound client every data-source adapter goes through."""

    def __init__(
        self,
        providers: Iterable[ProviderSettings],
        *,
        cache: ResponseCache | None = None,
        transport: httpx.BaseTransport | None = None,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
        logger: logging.Logger | None = None,
    ) -> None:
        self._providers = {p.name: _Provider(p, clock) for p in providers}
        self._cache = cache if cache is not None else InMemoryCache(clock)
        silence_httpx_request_logs()
        self._http = httpx.Client(transport=transport)
        self._clock = clock
        self._sleep = sleep
        self._logger = logger or DEFAULT_LOGGER

    def request(
        self,
        provider: str,
        method: str,
        path: str,
        *,
        params: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,
        json: Any = None,
    ) -> httpx.Response:
        state = self._providers[provider]
        settings = state.settings
        started = self._clock()
        outcome = {"status": None, "cache_hit": False, "retries": 0}

        def log(level: int = logging.INFO) -> None:
            log_call(
                self._logger,
                level,
                provider=provider,
                path=path,
                status=outcome["status"],
                latency_ms=(self._clock() - started) * 1000,
                cache_hit=outcome["cache_hit"],
                retries=outcome["retries"],
            )

        key = None
        if settings.cache_ttl_seconds > 0:
            key = build_cache_key(settings, method, path, params, headers, json)
            cached = self._cache.get(key)
            if cached is not None:
                outcome.update(status=cached.status_code, cache_hit=True)
                log()
                return httpx.Response(
                    cached.status_code, headers=list(cached.headers), content=cached.content
                )

        if not state.breaker.allow():
            log(logging.WARNING)
            raise CircuitOpenError(f"{provider} circuit is open")
        response = self._send_with_retries(state, method, path, params, headers, json, outcome, log)
        if key is not None and response.is_success:
            self._cache.set(
                key,
                CachedResponse(
                    response.status_code, tuple(response.headers.items()), response.content
                ),
                settings.cache_ttl_seconds,
            )
        log()
        return response

    def _send_with_retries(self, state, method, path, params, headers, json, outcome, log):
        settings = state.settings
        url = settings.base_url.rstrip("/") + path
        for attempt in range(settings.retries + 1):
            if state.limiter is not None and not state.limiter.try_acquire():
                state.breaker.abort_trial()
                log(logging.WARNING)
                raise RateLimitError(f"{settings.name} rate limit reached")
            retry_after = None
            try:
                response = self._http.request(
                    method,
                    url,
                    params=params,
                    headers=headers,
                    json=json,
                    timeout=settings.timeout_seconds,
                )
            except httpx.TransportError:
                outcome["status"] = None
            else:
                outcome["status"] = response.status_code
                if not is_retryable_status(response.status_code):
                    state.breaker.record_success()
                    return response
                if response.status_code in (429, 503):
                    retry_after = parse_retry_after(response.headers.get("Retry-After"))
            if attempt == settings.retries:
                break
            outcome["retries"] = attempt + 1
            log(logging.WARNING)
            self._sleep(backoff_delay(attempt, settings.backoff_base_seconds, retry_after))
        state.breaker.record_failure()
        log(logging.WARNING)
        raise ProviderUnavailableError(settings.name, outcome["status"])
