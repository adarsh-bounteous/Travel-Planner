summary: |
  Make the ~10,000 registered-user scale NFR (ADR-0004) a permanent automated gate. Add a small Python load driver (httpx + asyncio, no new dependency) to the Trip Planner API component that applies a defined 10,000-user load profile (1,000 concurrent users, 2-minute ramp, 5-minute hold), computes p95 latency and error rate, and exits non-zero unless p95 < 500 ms and error rate < 1%. Wire it into a GitHub Actions workflow that runs on every merge (push) to main and on a nightly schedule, so a capacity regression fails the pipeline with no manual action. The plan states the concurrency and load profile derivation explicitly (see notes).
scope:
  - description: |
      Load profile definition: a frozen dataclass holding the single source of truth for the 10,000-user profile and the pass thresholds.

      ```python
      @dataclass(frozen=True)
      class LoadProfile:
          registered_users: int = 10_000
          concurrent_users: int = 1_000
          ramp_seconds: int = 120
          hold_seconds: int = 300
          think_time_seconds: float = 10.0
          p95_limit_ms: float = 500.0
          error_rate_limit: float = 0.01

      TEN_THOUSAND_USERS = LoadProfile()
      ```
    files:
      - services/api/loadtest/__init__.py
      - services/api/loadtest/profile.py
    rationale: |
      Keeps the numbers in AC6/AC1 in one place that both the runner and the tests read, so the profile cannot silently drift.
  - description: |
      Pass/fail verdict as a pure function. Strict comparisons so exactly 500 ms or exactly 1% is NOT met.

      ```python
      def evaluate(p95_ms: float, error_rate: float, profile: LoadProfile = TEN_THOUSAND_USERS) -> Verdict: ...
      # Verdict(met: bool, p95_ms: float, error_rate: float, reasons: list[str])
      ```
    files:
      - services/api/loadtest/verdict.py
    rationale: Isolates the AC1/AC7/AC8 decision logic so it is unit-testable without running any load.
  - description: |
      Async load runner and CLI. Ramps virtual users linearly from 0 to concurrent_users over ramp_seconds, holds for hold_seconds, each user looping a read-mostly scenario (GET /health, then sign-in and an authenticated trips read) with think_time between iterations. Records per-request latency and failures (non-2xx, timeout, transport error), computes p95 (nearest-rank) and error rate, prints a summary, and exits 0 only when evaluate() reports met.

      ```python
      async def run_load(client: httpx.AsyncClient, profile: LoadProfile) -> LoadResult: ...
      def p95(latencies_ms: list[float]) -> float: ...
      # CLI: python -m loadtest.runner --base-url http://127.0.0.1:8000 [--scale 1.0]
      ```
      A `--scale` factor (default 1.0) shortens durations and user counts only for the unit tests and local smoke runs; the pipeline never passes it. Summary also written to a JSON file for the workflow to upload as an artifact.
    files:
      - services/api/loadtest/runner.py
      - services/api/loadtest/__main__.py
    rationale: |
      Python and httpx are already the component's stack (pytest + httpx), so no new tool is introduced. The runner takes an injected httpx client so tests can drive the ASGI app in-process.
  - description: |
      Automated pipeline: new GitHub Actions workflow with triggers `push` to `main` and `schedule` (nightly cron, e.g. `0 2 * * *`). Steps: checkout, set up Python 3.12 and uv, install API deps, start the API with uvicorn in local mode in the background (LOCAL_MODE=true, APP_ENV=local, a generated SESSION_SECRET, same as scripts/start.mjs), wait for /health, run `python -m loadtest.runner`, upload the JSON result. A non-zero runner exit fails the job, which is the failure report for AC3.
    files:
      - .github/workflows/capacity.yml
    rationale: Satisfies AC2 and AC5 with no manual action. No .github directory exists yet, so this is the first pipeline file.
  - description: |
      Document the profile, how to run it locally, thresholds and limitations in the API README.
    files:
      - services/api/README.md
    rationale: Makes the load profile reviewable and discoverable (AC4).
tests:
  - |
    AC1 (met): tests/unit/loadtest/test_verdict.py written first, fails until verdict.py exists.
    ```python
    def test_met_when_p95_and_errors_under_limits():
        v = evaluate(p95_ms=499.9, error_rate=0.0099)
        assert v.met is True
        assert v.reasons == []
    ```
  - |
    AC7 (p95 at or over limit is not met):
    ```python
    @pytest.mark.parametrize("p95_ms", [500.0, 500.1, 2000.0])
    def test_not_met_when_p95_at_or_over_500ms(p95_ms):
        v = evaluate(p95_ms=p95_ms, error_rate=0.0)
        assert v.met is False
        assert any("p95" in r for r in v.reasons)
    ```
  - |
    AC8 (error rate at or over limit is not met):
    ```python
    @pytest.mark.parametrize("rate", [0.01, 0.02, 1.0])
    def test_not_met_when_error_rate_at_or_over_1_percent(rate):
        v = evaluate(p95_ms=100.0, error_rate=rate)
        assert v.met is False
        assert any("error" in r for r in v.reasons)
    ```
  - |
    AC6 (profile shape), tests/unit/loadtest/test_profile.py:
    ```python
    def test_profile_is_1000_users_2min_ramp_5min_hold():
        p = TEN_THOUSAND_USERS
        assert (p.registered_users, p.concurrent_users) == (10_000, 1_000)
        assert (p.ramp_seconds, p.hold_seconds) == (120, 300)
    ```
    Plus a runner test using a fake clock/sleep that asserts the peak number of simultaneously active virtual users equals concurrent_users, is reached no earlier than the end of the ramp, and is held for the hold duration (scaled).
  - |
    AC3 (a capacity drop is reported as a failure), tests/unit/loadtest/test_runner.py. Drive run_load and the CLI main against an in-process ASGI app with an artificially slow route, and a second app returning 500s, using a tiny scaled profile:
    ```python
    def test_cli_exits_nonzero_when_target_is_slow(slow_app):
        assert main(["--scale", "0.01"], transport=httpx.ASGITransport(app=slow_app)) == 1

    def test_cli_exits_nonzero_when_target_errors(failing_app):
        assert main(["--scale", "0.01"], transport=httpx.ASGITransport(app=failing_app)) == 1

    def test_cli_exits_zero_against_healthy_app(healthy_app):
        assert main(["--scale", "0.01"], transport=httpx.ASGITransport(app=healthy_app)) == 0
    ```
    Also `assert p95([float(i) for i in range(1, 101)]) == 95.0` for the nearest-rank percentile.
  - |
    AC2 and AC5 (pipeline triggers), tests/unit/loadtest/test_workflow.py loads .github/workflows/capacity.yml with yaml.safe_load (PyYAML is already pulled in transitively; if not, parse with a minimal check) and asserts:
    ```python
    on = wf[True] if True in wf else wf["on"]   # YAML 1.1 parses the key `on` as True
    assert on["push"]["branches"] == ["main"]
    assert on["schedule"][0]["cron"]
    ```
    and that a step runs `python -m loadtest.runner` without `continue-on-error`.
  - |
    AC4 (plan states the profile): reviewed by reading the notes section of this plan; the same numbers are asserted in test_profile.py and documented in services/api/README.md, and a test asserts the README contains the strings "1,000 concurrent" and "10,000".
assumptions_or_open_questions:
  - |
    The pipeline is GitHub Actions: the repo has no existing CI config, no .github directory, and the host is not confirmed. If the project uses a different CI, only capacity.yml changes. Please confirm.
  - |
    The pipeline load run targets the API started locally with uvicorn in local mode (in-memory/file-backed stores), not the deployed Lambda + API Gateway + DynamoDB stack, because no deployed environment or credentials are available to the pipeline. This catches regressions in application code and per-request cost, but not infrastructure limits (Lambda concurrency, DynamoDB capacity). A follow-up could point `--base-url` at a staging stage. Please confirm that is acceptable for this story.
  - |
    The scenario (health check, sign-in, authenticated trips read) is read-mostly, which matches a trip-planning app where browsing dominates. Exact endpoints will be confirmed against app/routers/auth.py and app/routers/trips.py while writing the failing runner test.
  - |
    A hosted CI runner is a shared, noisy machine, so p95 may vary run to run. The thresholds (500 ms, 1%) are fixed by the acceptance criteria and are not loosened; flakiness would be handled by tuning the runner size or scenario, not the limits.
  - The nightly cron time (02:00 UTC) is a placeholder choice.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  None — adds a test/load tool and a CI workflow only. No schema, stored data, seed, or runtime setting changes. The workflow generates its own throwaway SESSION_SECRET at run time; nothing needs provisioning. Roll back by deleting the workflow file and the loadtest package.

  ### Concurrency and load profile for 10,000 registered users (AC4)
  - Population: 10,000 registered users (ADR-0004).
  - Peak concurrency: 10% of registered users active at once, so 1,000 concurrent users. This matches AC6.
  - Shape: linear ramp 0 to 1,000 users over 2 minutes, hold 1,000 users for 5 minutes (7 minutes total).
  - Per-user behaviour: one request roughly every 10 s of think time, so about 100 requests per second at the plateau.
  - Pass criteria: p95 response time < 500 ms and error rate < 1% (an error is a non-2xx response, timeout, or transport failure). Both limits are strict, so exactly 500 ms or exactly 1% is "not met".
  - Latency is measured over the whole run including the ramp.

  ```mermaid
  flowchart TD
    wf[".github/workflows/capacity.yml"] -->|starts and runs| runner["loadtest/runner.py"]
    runner --> profile["loadtest/profile.py"]
    runner --> verdict["loadtest/verdict.py"]
    runner -->|HTTP via httpx| api["app/main.py"]
    api --> health["app/routers/health.py"]
    api --> auth["app/routers/auth.py"]
    api --> trips["app/routers/trips.py"]
    classDef touched fill:#f96,color:#000
    class wf,runner,profile,verdict touched
  ```
  New nodes (orange) are the loadtest package and the workflow; the app modules are untouched context.
review_focus: |
  IN scope: the loadtest package under services/api, its unit tests, one GitHub Actions workflow (push to main plus nightly), and README docs. OUT: any change to API behaviour, performance tuning, or testing against the deployed AWS stack. The riskiest areas are the strict boundary comparisons (500 ms and 1% are failures) and CI flakiness from a noisy shared runner; the limits are deliberately not loosened. The runner's --scale option exists only for fast tests and is never used by the pipeline.
