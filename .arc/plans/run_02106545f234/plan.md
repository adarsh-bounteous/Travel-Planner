summary: |
  Add one shared outbound HTTP client for the Trip Planner API (`services/api/app/integrations/`) that every future data-source adapter goes through. It owns per-provider settings, retry with exponential backoff on 408/429/5xx/connection errors (honouring Retry-After), a sliding-window rate limit, a circuit breaker with half-open trial, an in-memory response cache behind a pluggable `ResponseCache` interface (API key excluded from the cache key), and structured logs that never contain keys or request-body data. Adapters then only map data. It is proven with a test-only `FakeEchoProvider` adapter; no real provider is added. Time and sleeping are injected, so every timing AC is tested deterministically with a fake clock and no real waiting.
scope:
  - description: |
      Settings and errors. `ProviderSettings` is a frozen dataclass with these fields: name, base_url, retries (default 2), backoff_base_seconds (default 1.0), rate_limit_calls and rate_limit_period_seconds (default None, meaning unlimited), breaker_threshold (default 5), breaker_cooldown_seconds (default 30), cache_ttl_seconds (default 0, meaning off), credential_params and credential_headers (tuples of names, stripped from the cache key and never logged), and timeout_seconds (default 10). The module also defines `IntegrationError` plus `RateLimitError`, `CircuitOpenError` and `ProviderUnavailableError` (carries last_status, or None for a connection error).
    files:
      - services/api/app/integrations/__init__.py
      - services/api/app/integrations/settings.py
      - services/api/app/integrations/errors.py
    rationale: |
      Per-provider config is the single place a new adapter declares its policy (AC6, AC7, AC11, AC17).
  - description: |
      Resilience building blocks, each a small class that takes an injected `clock: Callable[[], float]`. `RateLimiter.try_acquire() -> bool` uses a sliding window of timestamps. `CircuitBreaker` has `allow() -> bool`, `record_success()` and `record_failure()`, with states closed, open and half-open. It opens at N consecutive failed calls, blocks until the cooldown ends, then lets exactly one trial through. A successful trial closes it. A failed trial re-opens it for a fresh cooldown. `backoff_delay(attempt, base, retry_after)` returns `retry_after` when present, else base * 2**attempt. `parse_retry_after` accepts delta-seconds or an HTTP-date. The cache module defines `class ResponseCache(Protocol)` with `get(key) -> CachedResponse | None` and `set(key, value, ttl_seconds) -> None`, plus the default `InMemoryCache(clock)`, and `build_cache_key(settings, method, path, params, headers, body)`, which drops credential params/headers and hashes the body.
    files:
      - services/api/app/integrations/rate_limit.py
      - services/api/app/integrations/breaker.py
      - services/api/app/integrations/retry.py
      - services/api/app/integrations/cache.py
    rationale: |
      Separate units keep the client readable and let AC10-AC20 be tested without HTTP.
  - description: |
      The shared client and safe logging.

      ```python
      class IntegrationClient:
          def __init__(self, providers: Iterable[ProviderSettings], *,
                       cache: ResponseCache | None = None,
                       transport: httpx.BaseTransport | None = None,
                       clock: Callable[[], float] = time.monotonic,
                       sleep: Callable[[float], None] = time.sleep,
                       logger: logging.Logger | None = None) -> None: ...

          def request(self, provider: str, method: str, path: str, *,
                      params: Mapping[str, str] | None = None,
                      headers: Mapping[str, str] | None = None,
                      json: Any = None) -> httpx.Response: ...
      ```

      Flow per call:
      1. Look up the cache. On a hit, log and return.
      2. Check the breaker and raise `CircuitOpenError` immediately if it blocks the call.
      3. Loop up to retries+1 attempts. Before each outbound send, call `RateLimiter.try_acquire()` and raise `RateLimitError` if it is refused. Send via `httpx.Client(transport=...)`.
      4. A 408/429/5xx status or an `httpx.TransportError` is retryable. Sleep `backoff_delay(...)`, using Retry-After for 429/503 when it is present.
      5. Any other status, including 400, is returned at once with no retry.
      6. When retries are exhausted, record a breaker failure and raise `ProviderUnavailableError`.
      7. A 2xx response is cached when cache_ttl_seconds > 0 and records a breaker success. A non-retryable 4xx neither trips the breaker nor is cached.

      Exactly one structured log entry is written per call, as a `logging` record with `extra={"integration": {...}}` and a JSON message. Its keys are provider, endpoint (the path only, never the query string), status, latency_ms, cache_hit and retries. Each retry also gets a warning entry with the same safe keys. Request bodies, headers and query values are never passed to the logger.
    files:
      - services/api/app/integrations/client.py
      - services/api/app/integrations/logging.py
    rationale: |
      Satisfies AC1-AC23. The injected clock, sleep and transport are what make the timing ACs deterministic.
  - description: |
      Test-only provider and shared test helpers. `FakeEchoProvider` is a thin adapter with `echo(message: str) -> EchoResult`. It calls `client.request("fake-echo", "POST", "/echo", json={...})` and maps the JSON into an `EchoResult` dataclass, with no retry, rate-limit, breaker or cache code. A `FakeClock` has `now()` and `sleep(s)`, where sleep advances now and records the waits. A scripted `httpx.MockTransport` handler returns queued statuses, raises `httpx.ConnectError` for a marker, counts calls and records the time of each call. It lives under tests only, so no real provider ships in app code.
    files:
      - services/api/tests/unit/integrations_support/__init__.py
      - services/api/tests/unit/integrations_support/fake_echo.py
      - services/api/tests/unit/integrations_support/fakes.py
    rationale: |
      The story requires a FakeEchoProvider proof with no real provider (AC24-AC26).
  - description: |
      The test files, written first, grouped by concern. See the `tests` list for the individual cases.
    files:
      - services/api/tests/unit/test_integration_retry.py
      - services/api/tests/unit/test_integration_rate_limit.py
      - services/api/tests/unit/test_integration_breaker.py
      - services/api/tests/unit/test_integration_cache.py
      - services/api/tests/unit/test_integration_logging.py
      - services/api/tests/unit/test_integration_fake_echo.py
    rationale: |
      Follows the flat `tests/unit/test_*.py` layout that `pytest.ini` (`testpaths = tests/unit`) already collects.
tests:
  - |
    AC1 (503 then 200), written first in test_integration_retry.py. The same shape, with a different first status, covers AC3 (408) and AC4 (429). AC5 uses a connection error as the first outcome.
    ```python
    @pytest.mark.parametrize("first", [503, 408, 429, "connect_error"])
    def test_retries_then_returns_200(first):
        h = make_client(script=[first, 200])
        assert h.client.request("p", "GET", "/x").status_code == 200
        assert h.calls == 2
    ```
  - |
    AC2 (400 is not retried).
    ```python
    h = make_client(script=[400, 200])
    assert h.client.request("p", "GET", "/x").status_code == 400
    assert h.calls == 1
    ```
  - |
    AC6 (retries=3, always 503).
    ```python
    h = make_client(settings=dict(retries=3), script=[503] * 10)
    with pytest.raises(ProviderUnavailableError):
        h.client.request("p", "GET", "/x")
    assert h.calls == 4
    ```
  - |
    AC7 (per-provider retries). Provider a has retries=1 and provider b has retries=3, both always 503.
    ```python
    assert (h.calls_for("a"), h.calls_for("b")) == (2, 4)
    ```
  - |
    AC8 (Retry-After) with a fake clock.
    ```python
    h = make_client(script=[(429, {"Retry-After": "5"}), 200])
    h.client.request("p", "GET", "/x")
    assert h.call_times[1] - h.call_times[0] >= 5
    ```
  - |
    AC9 (backoff without Retry-After), with retries=2 and script 503, 503, 200.
    ```python
    assert h.sleeps[0] >= 1 and h.sleeps[1] >= 2
    ```
  - |
    AC10 (rate limit reached). With rate_limit_calls=2 and period 60, two calls are made and then a third.
    ```python
    with pytest.raises(RateLimitError):
        h.client.request("p", "GET", "/x?n=3")
    assert h.calls == 2
    ```
  - |
    AC11 (below the limit). With 2 calls per 60s, one completed call and a second 10s later, the second reaches the provider.
    ```python
    assert h.calls == 2
    ```
  - |
    AC12 (4 failures leave the breaker closed), with threshold 5, retries=0 and four 503 calls. The fifth call is sent.
    ```python
    assert h.calls == 5
    ```
  - |
    AC13 (breaker open). Five failed calls open it, then the clock advances 29s.
    ```python
    with pytest.raises(CircuitOpenError):
        h.client.request("p", "GET", "/x")
    assert h.calls == 5
    ```
  - |
    AC14 (half-open trial). After 31s the call reaches the provider.
    ```python
    assert h.calls == 6
    ```
  - |
    AC15 (trial succeeds, breaker closes). After the successful trial, the next call reaches the provider with no error.
    ```python
    assert h.calls == 7
    ```
  - |
    AC16 (trial fails, breaker re-opens). After the failed trial, a call 29s later raises CircuitOpenError.
    ```python
    assert h.calls == 6
    ```
  - |
    AC17 (cache hit within validity). With cache_ttl=60, the identical call 10s later is a cache hit.
    ```python
    assert h.calls == 1
    ```
  - |
    AC18 (cache expiry). The identical call 61s later reaches the provider.
    ```python
    assert h.calls == 2
    ```
  - |
    AC19 (API key excluded from the cache key). The two calls differ only in `params={"key": "A"}` versus `{"key": "B"}`, with `credential_params=("key",)`.
    ```python
    assert h.calls == 1
    ```
  - |
    AC20 (pluggable cache). A recording `DictCache` implementing `ResponseCache` is passed in.
    ```python
    assert cache.set_calls == 1 and cache.hits == 1 and h.calls == 1
    ```
  - |
    AC21 (log fields), using caplog.
    ```python
    entry = caplog.records[-1].integration
    assert {"provider", "endpoint", "status", "latency_ms", "cache_hit", "retries"} <= entry.keys()
    ```
  - |
    AC22 (API key never logged). Run with a header key and a query key, then check every record and its formatted message.
    ```python
    assert all("SECRET-KEY" not in r.getMessage() + repr(r.__dict__) for r in caplog.records)
    ```
  - |
    AC23 (personal data never logged). The body is `json={"email": "jane@example.com"}` and the same check as AC22 is applied to "jane@example.com". Include one failed-then-retried call so the retry warnings are covered.
  - |
    AC24 (FakeEchoProvider through the client).
    ```python
    assert FakeEchoProvider(client).echo("hi").message == "hi"
    ```
  - |
    AC25 (adapter uses the shared client). A spy wraps `IntegrationClient.request`.
    ```python
    assert spy.call_count == 1 and spy.call_args.args[0] == "fake-echo"
    ```
  - |
    AC26 (no resilience logic in the adapter), by reading the adapter source.
    ```python
    src = inspect.getsource(fake_echo).lower()
    assert not any(w in src for w in ("retry", "sleep", "rate", "breaker", "cache", "backoff"))
    ```
assumptions_or_open_questions:
  - |
    The client is synchronous. The existing code (`app/locations/nominatim.py`) uses sync `httpx` and no async code was seen. Switching to async would be a small change if the reviewer wants it.
  - |
    A "failed call" for the breaker means the call's final outcome after retries is exhausted. A 4xx other than 408/429 does not count. A 2xx resets the count. The ACs do not say whether each retry attempt counts; per-call is assumed.
  - |
    Each outbound send, retries included, consumes one rate-limit slot, and cache hits consume none. A rate-limit refusal in the middle of a retry loop raises `RateLimitError` immediately.
  - |
    After retries are exhausted, the client raises `ProviderUnavailableError`. A non-retryable response such as 400 is returned unchanged, so the adapter decides how to map it.
  - |
    Backoff is base * 2**attempt, giving 1s, 2s, 4s, and is not jittered, so AC9's "at least" bounds hold. When Retry-After is present it is used as given, with no cap. Only 2xx responses are cached.
  - |
    Provider settings are plain Python objects registered by each adapter. No env vars or config files are added; wiring real-provider settings from the environment is left to later stories.
  - |
    Rate-limit, breaker and cache state is per process (in memory). On Lambda it is therefore per warm container. This is acceptable here because the story asks for an in-memory default behind a pluggable cache interface.
  - |
    I read ADR-0007/0008/0010 only as titles in the index; I did not open the ADR files, so any provider-specific rules in them are not reflected.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — this adds new in-process library code and tests only. It has no schema, stored data, seed, env var or config change, and no new dependency, since `httpx` is already in `services/api/pyproject.toml`. It can be rolled back by reverting the commit.

  Existing code in `services/api/app/locations/nominatim.py` calls `httpx.get` directly. Migrating it onto the shared client is out of scope; the story says only that future sources use it.

  ```mermaid
  flowchart TD
    FE[tests FakeEchoProvider] -->|request| C[integrations/client.py]
    C --> S[settings.py]
    C --> R[rate_limit.py]
    C --> B[breaker.py]
    C --> T[retry.py]
    C --> K[cache.py ResponseCache]
    C --> L[logging.py safe log]
    C -->|httpx.Client| H[httpx transport]
    classDef touched fill:#f96,color:#000
    class FE,C,S,R,B,T,K,L touched
  ```
review_focus: |
  IN scope is the new `app/integrations` package plus the test-only FakeEchoProvider. OUT of scope are real providers, env/config wiring, and migrating `NominatimResolver` to the client. The riskiest parts are the breaker half-open transitions (AC13-AC16) and keeping credentials and body data out of both the cache key and every log record (AC19, AC22, AC23). Deliberate choices are that the client is synchronous, that breaker failures are counted per call rather than per attempt, and that time and sleep are injected so no test really waits.
