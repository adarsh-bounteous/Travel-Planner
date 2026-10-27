summary: |
  Make the ADR-0005 availability NFR (monthly uptime >= 99.9%, a 43 minute downtime budget) a permanent automatic gate in the Trip Planner API component. A new `app/availability` package turns external synthetic probe results into per-calendar-month downtime, evaluates a month into a report (availability percent, `within_target` / `breached`, `budget_exhausted`), and raises an on-call alert on a breach or an exhausted budget. A scheduled Lambda handler runs a probe of the public service endpoint on a short interval and evaluates the month that just ended on the first of each month, with no manual action. A read-only `GET /availability` endpoint shows the in-progress month's figure including all downtime measured up to now. The core is pure and clock-injected so every acceptance criterion is testable with pytest and no network or AWS.
scope:
  - description: |
      Pure gate logic. Create `services/api/app/availability/gate.py` holding the budget constant and the evaluation.

      ```python
      DOWNTIME_BUDGET = timedelta(minutes=43)

      @dataclass(frozen=True)
      class ProbeResult:
          at: datetime          # tz-aware UTC
          ok: bool

      @dataclass(frozen=True)
      class AvailabilityReport:
          month: str                    # "2026-10"
          downtime: timedelta
          availability_percent: float   # 100 * (1 - downtime / month_length_so_far)
          status: Literal["ok", "breached"]
          budget_exhausted: bool
          final: bool                   # False while the month is in progress

      def month_bounds(month: str) -> tuple[datetime, datetime]: ...
      def downtime_for_month(probes: Sequence[ProbeResult], month: str, now: datetime) -> timedelta: ...
      def evaluate_month(probes: Sequence[ProbeResult], month: str, now: datetime) -> AvailabilityReport: ...
      ```

      Rules. A failed probe counts as downtime from its timestamp until the next probe (or until `now`/month end for the last one), clipped to the month. A downtime interval spanning a month boundary is split between the two months. `status == "breached"` and `budget_exhausted` are both true exactly when `downtime > DOWNTIME_BUDGET` (43 minutes or less is `ok`, matching the acceptance criteria literally). For an in-progress month the denominator is the elapsed time so far and `final` is False.
    files:
      - services/api/app/availability/__init__.py
      - services/api/app/availability/gate.py
    rationale: |
      ACs 1-3, 5, 6 and 8 are all pure functions of probe history and a clock. Keeping them free of I/O makes them cheap to test first and keeps the 43 minute threshold in one place.
  - description: |
      Probe history store and alert sink, as small protocols with an in-memory implementation (used by tests and local mode) and an AWS implementation.

      ```python
      class ProbeStore(Protocol):
          def record(self, result: ProbeResult) -> None: ...
          def for_month(self, month: str) -> list[ProbeResult]: ...

      class AlertSink(Protocol):
          def raise_alert(self, kind: Literal["availability_breach", "downtime_budget_exhausted"], report: AvailabilityReport) -> None: ...
      ```

      The AWS implementations are `DynamoProbeStore` (boto3, partition key `month`, sort key `at`, table from `AVAILABILITY_TABLE_NAME`) and `SnsAlertSink` (boto3 SNS publish to `ONCALL_ALERT_TOPIC_ARN`). boto3 is already a dependency.
    files:
      - services/api/app/availability/store.py
      - services/api/app/availability/alerts.py
      - services/api/app/config.py
    rationale: |
      AC 4 and AC 7 need an alert raised to the on-call team, AC 8 needs probe history persisted between scheduled invocations on Lambda. Protocols keep tests offline. `config.py` gets `availability_table_name` and `oncall_alert_topic_arn` settings following the existing `Settings` pattern.
  - description: |
      Scheduled runner. Create `services/api/app/availability/runner.py` with two functions plus a Lambda entry point.

      ```python
      def run_probe(url: str, store: ProbeStore, now: datetime, fetch: Callable[[str], int]) -> ProbeResult: ...
      def run_month_end_gate(store: ProbeStore, sink: AlertSink, now: datetime) -> AvailabilityReport: ...
      def handler(event: dict, context: object) -> dict: ...
      ```

      `run_probe` GETs the public endpoint (`PUBLIC_HEALTH_URL`, the `/health` route) with a timeout, treats any non-2xx, timeout or connection error as `ok=False`, and records the result. `run_month_end_gate` evaluates the previous calendar month relative to `now` and calls `sink.raise_alert` for each of `availability_breach` and `downtime_budget_exhausted` that applies. `handler` dispatches on `event["task"]` of `probe` or `month_end_gate`, so one scheduled function serves both EventBridge rules (probe every minute, gate at 00:05 UTC on day 1). The probe uses `httpx`, already a dependency.
    files:
      - services/api/app/availability/runner.py
    rationale: |
      AC 1 (evaluation with no manual action) and AC 8 (external synthetic probe) need something that runs on a schedule. The repo has no infra-as-code directory, so the plan ships the handler and documents the two schedules rather than inventing a deployment stack.
  - description: |
      Read-only endpoint for the in-progress month. `GET /availability` returns the current month's `AvailabilityReport` as JSON (`month`, `downtime_seconds`, `availability_percent`, `status`, `budget_exhausted`, `final`). Register the router in `main.py` next to `health.router`. The store dependency is added to `routers/deps.py` following the existing `_local_*` factory pattern.
    files:
      - services/api/app/routers/availability.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      AC 5: the current figure must be viewable and include downtime measured up to that moment.
  - description: |
      Document the new settings and the two schedules (probe every minute, month-end gate at 00:05 UTC on day 1) and the alert topic that on-call must subscribe to.
    files:
      - docs/local-setup.md
    rationale: |
      Provisioning is outside the repo, so the required resources must be written down where the existing environment variables are documented.
tests:
  - |
    AC1, written first in `services/api/tests/unit/test_availability_runner.py`. Run on 2026-11-01 00:05 UTC, the gate evaluates October with no other call.
    ```python
    store = InMemoryProbeStore(); sink = RecordingSink()
    report = run_month_end_gate(store, sink, datetime(2026, 11, 1, 0, 5, tzinfo=UTC))
    assert report.month == "2026-10" and report.final is True
    ```
    Also `handler({"task": "month_end_gate"}, None)` returns that month's status, and an unknown task raises `ValueError`.
  - |
    AC2, in `services/api/tests/unit/test_availability_gate.py`. Downtime of exactly 43 minutes is within target, and the percentage is at or above 99.9 for a 30 day month.
    ```python
    probes = outage(start=datetime(2026, 9, 10, 12, 0, tzinfo=UTC), minutes=43)
    r = evaluate_month(probes, "2026-09", now=datetime(2026, 10, 1, tzinfo=UTC))
    assert r.downtime == timedelta(minutes=43)
    assert r.status == "ok" and r.budget_exhausted is False
    assert r.availability_percent >= 99.9
    ```
  - |
    AC3, same file. 44 minutes of downtime is breached.
    ```python
    r = evaluate_month(outage(start=..., minutes=44), "2026-09", now=datetime(2026, 10, 1, tzinfo=UTC))
    assert r.status == "breached"
    ```
    Also cover a downtime interval that spans the month boundary, split between the two months.
  - |
    AC4, in the runner test file. A breached month raises an availability_breach alert to the sink, and a healthy month raises nothing.
    ```python
    run_month_end_gate(store_with_outage(minutes=44), sink, now)
    assert "availability_breach" in [a.kind for a in sink.alerts]
    sink2 = RecordingSink(); run_month_end_gate(store_with_outage(minutes=10), sink2, now)
    assert sink2.alerts == []
    ```
  - |
    AC5, in the gate test file and in `services/api/tests/e2e/test_availability_e2e.py`. For a month in progress, the figure includes downtime up to `now`, including an outage that is still open (last probe failed).
    ```python
    now = datetime(2026, 10, 5, 12, 30, tzinfo=UTC)
    probes = [ProbeResult(datetime(2026, 10, 5, 12, 0, tzinfo=UTC), ok=False)]
    r = evaluate_month(probes, "2026-10", now)
    assert r.downtime == timedelta(minutes=30) and r.final is False
    ```
    E2E, using httpx with ASGITransport as in `test_health_e2e.py`, seeds an in-memory store via a dependency override and asserts `GET /availability` returns `status` 200 with `downtime_seconds == 1800`.
  - |
    AC6, gate test file. Downtime over 43 minutes reports the budget exhausted, and 43 minutes exactly does not.
    ```python
    assert evaluate_month(outage(minutes=43), m, now).budget_exhausted is False
    assert evaluate_month(outage(minutes=44), m, now).budget_exhausted is True
    ```
  - |
    AC7, runner test file. A month with an exhausted budget raises a distinct alert.
    ```python
    run_month_end_gate(store_with_outage(minutes=44), sink, now)
    assert "downtime_budget_exhausted" in [a.kind for a in sink.alerts]
    ```
  - |
    AC8, runner test file. A failing probe against the public endpoint is recorded as a failure and counted as downtime.
    ```python
    def down(url): raise httpx.ConnectError("refused")
    r = run_probe("https://example.test/health", store, t0, fetch=lambda u: 503)
    assert r.ok is False
    run_probe(url, store, t0 + timedelta(minutes=50), fetch=lambda u: 200)
    rep = evaluate_month(store.for_month("2026-10"), "2026-10", now=t0 + timedelta(hours=1))
    assert rep.downtime == timedelta(minutes=50) and rep.status == "breached"
    ```
    Also assert a timeout and a connection error each yield `ok=False`.
assumptions_or_open_questions:
  - |
    The repo has no infrastructure-as-code (no infra, CDK or workflow directories), so the EventBridge schedules, the DynamoDB availability table and the SNS on-call topic are documented in `docs/local-setup.md` but not provisioned by this plan. Confirm that is acceptable, or say where the infrastructure definition should live.
  - |
    "On-call team" is modelled as an SNS topic (`ONCALL_ALERT_TOPIC_ARN`) because the project is AWS serverless (ADR-0006) and no paging tool is named. Confirm or name the intended channel.
  - |
    The threshold is taken from the acceptance criteria literally: more than 43 minutes is a breach, regardless of month length. 99.9% of a 31 day month is 44.6 minutes and of a 28 day month 40.3 minutes, so the percentage reported can differ slightly from the 43 minute verdict at the edges.
  - |
    A failed probe counts as downtime until the next probe result (or until now). The one minute probe interval therefore bounds measurement error to about a minute. A gap with no probes at all is treated as unmeasured, not as downtime.
  - |
    The "external" synthetic probe runs as a scheduled function that calls the public URL over HTTP. A probe from a separate region or a third party monitor would be stronger, but is out of scope here.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: no existing table or row is changed. The probe history is a new store.
  - **Backfill / seed**: none needed. Months with no probe history evaluate as zero downtime.
  - **Settings**: `AVAILABILITY_TABLE_NAME` (default `trip-planner-availability`), `ONCALL_ALERT_TOPIC_ARN` (default empty, meaning alerts are logged and the gate raises `MissingSettingError` rather than silently dropping them outside local mode) and `PUBLIC_HEALTH_URL` (default empty, the probe fails closed). All documented in `docs/local-setup.md`.
  - **Provisioning**: a DynamoDB table (partition key `month` string, sort key `at` string), an SNS topic with the on-call subscription, and two EventBridge schedules invoking the handler with `{"task": "probe"}` every minute and `{"task": "month_end_gate"}` at 00:05 UTC on day 1. None of these exist in the repo today.
  - **Order and rollback**: create the table and topic first, then deploy the code, then enable the schedules. Rollback is disabling the schedules; the new code paths are additive and `GET /availability` is the only change to the running API surface.

  Mirrors existing structure. `/health` (`services/api/app/routers/health.py`) is the endpoint probed. Store and sink protocols follow the `trips/store.py` vs `trips/local_store.py` split.

  ```mermaid
  flowchart TD
    main[app/main.py]:::touched -->|registers router| availrouter[routers/availability.py]:::touched
    availrouter -->|reads in-progress month| gate[availability/gate.py]:::touched
    availrouter -->|store dependency| deps[routers/deps.py]:::touched
    main --> health[routers/health.py]
    runner[availability/runner.py]:::touched -->|evaluates months| gate
    runner -->|persists probes| store[availability/store.py]:::touched
    runner -->|raises alerts| alerts[availability/alerts.py]:::touched
    runner -.->|probes public URL| health
    config[config.py]:::touched -->|new settings| store
    config --> alerts
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN scope: the availability package, the `GET /availability` endpoint, the scheduled handler and the settings and docs for them. OUT of scope: provisioning AWS resources (no infra code exists in the repo), a dashboard in the web app, and changes to `/health`. The riskiest part is interval arithmetic in `downtime_for_month` (open outages, month-boundary splits, clipping to `now`) and the exact `> 43 minutes` boundary, which is deliberately literal to the acceptance criteria rather than derived from 99.9% of the month length.
