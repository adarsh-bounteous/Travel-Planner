# 01 Integration groundwork

Read `docs/agent-prompts/RULES.md` first. Those rules apply throughout this task.

## Goal
Build the shared layer that every real data source will use. That way the later adapters (places,
rates, weather, visa, vendors, Claude) only map data and don't each reinvent error handling. This
prompt adds **no real provider**. It adds the plumbing and proves it with a fake provider.

## Context
- Every data area is a `Protocol` port with in-memory and local adapters, chosen in
  `services/api/app/routers/deps.py`.
- `app/availability/` already probes URLs with `httpx` and sends alerts. Reuse its ideas, and
  extend it if that fits.
- Settings come from `app/config.py`. Local mode is controlled by `app/local_mode.py`.
  `GET /startup-status` reports the stand-ins.

## What already exists (reuse it, don't duplicate it)
- Timeouts at three call sites only: `auth/cognito_identity.py` (10 s), `availability/runner.py`
  (10 s) and `flights/options.py` (5 s per source).
- `gather_flights` already asks several sources at once, skips a slow or failing one and reports it
  as `timed_out` or `failed`. Generalise this pattern for every vertical instead of writing a new one.
- `LastKnownRates` (`trips/rates.py`) already keeps the last good rates as a fallback. Build the
  fallback helper on the same idea.
- `@lru_cache` in `deps.py` only keeps one instance of each provider object; it caches no responses.
- There are no retries (beyond boto3's own), response caching, outbound rate limits or circuit
  breaker in the app's code. Those are what this prompt adds.

## Build
1. **Integration client** (for example `app/integrations/http.py`), wrapping `httpx`:
   - Per-provider base URL, timeouts (connect and read), and retries with backoff and jitter for
     408, 429, 5xx and connection errors only. Honour `Retry-After`.
   - Per-provider rate limit and a circuit breaker (open after N failures, half-open after a
     cool-down).
   - A response cache with a per-provider TTL: in memory locally, pluggable for DynamoDB later. The
     cache key must not contain secrets.
   - Structured logs: provider, endpoint name, status, latency, cache hit, retry count. No query
     values that contain personal data, and no keys.
2. **Secrets**: `get_secret(name)` reads from the environment. Outside local mode it may read
   Secrets Manager. A missing key makes that provider "not configured"; the app still starts.
3. **Provider registry and status**: each adapter registers a name, a kind (places, rates,
   weather…) and a health state (configured, healthy, degraded, open circuit, not configured).
   Add it to `GET /startup-status`, and add an admin-only or local-only `GET /providers/status`.
4. **Fallback helper**: `with_fallback(primary, fallback)` returns the primary's result, or the
   fallback's on failure, marking the result `source` and `as_of` so the UI can say where the data
   came from.
5. **Local opt-in**: a new setting `LOCAL_LIVE_PROVIDERS` (comma-separated provider names, default
   empty). In local mode only the named providers may make outside calls. All others use the local
   stand-ins. Refuse unknown names at start-up, the same way `LOCAL_MODE` refuses bad values.
6. **Recorded responses**: a small helper (for example `tests/fixtures/recorded/<provider>/...`)
   to record a real response once, scrub keys and personal data, and replay it in tests. Use
   `httpx.MockTransport` or `respx`; pick one and document it.
7. **Contract test kit**: a reusable pytest helper that runs one set of behaviour rules against any
   adapter of a port (same pattern as `tests/unit/store_contract`).
8. **UI**: a small "Live data unavailable, showing saved data" notice component, following
   `design-system/UI-GUIDELINES.md` (`.alert`), that later screens can show when `source` is a
   fallback. Add the provider list to the existing Local mode page (`/account/local-mode`).

## Prove it
Add a `FakeEchoProvider` used only in tests. Show with tests:
- retries on 503 then succeeds; no retry on 400
- circuit opens after N failures and recovers
- cache hit on a second identical call
- the fallback is used and marked when the primary fails
- local mode blocks an outside call unless the provider is opted in
- no key and no personal data in logs or recorded fixtures

## Out of scope
Any real provider or Claude call. Those come in prompts 02–10.

## Report
List the new modules, the settings added to the README table, the test results, and a short "how
to add a new adapter" section in `services/api/README.md`.
