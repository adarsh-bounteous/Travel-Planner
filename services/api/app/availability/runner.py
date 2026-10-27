from collections.abc import Callable
from datetime import UTC, datetime

import httpx

from app.availability.alerts import AlertSink, SnsAlertSink
from app.availability.gate import AvailabilityReport, ProbeResult, evaluate_month
from app.availability.store import DynamoProbeStore, ProbeStore
from app.config import MissingSettingError, get_settings

PROBE_TIMEOUT_SECONDS = 10.0


def _http_status(url: str) -> int:
    return httpx.get(url, timeout=PROBE_TIMEOUT_SECONDS).status_code


def _store() -> ProbeStore:
    return DynamoProbeStore(get_settings().availability_table_name)


def _sink() -> AlertSink:
    topic_arn = get_settings().oncall_alert_topic_arn
    if not topic_arn:
        raise MissingSettingError("ONCALL_ALERT_TOPIC_ARN must be set")
    return SnsAlertSink(topic_arn)


def _now() -> datetime:
    return datetime.now(UTC)


def run_probe(url: str, store: ProbeStore, now: datetime, fetch: Callable[[str], int]) -> ProbeResult:
    """Probe the public endpoint. Any non-2xx answer, timeout or connection error is a failure."""
    try:
        ok = 200 <= fetch(url) < 300
    except httpx.HTTPError:
        ok = False
    result = ProbeResult(now, ok)
    store.record(result)
    return result


def run_month_end_gate(store: ProbeStore, sink: AlertSink, now: datetime) -> AvailabilityReport:
    """Evaluate the calendar month before `now`, and alert on-call about a breach or exhausted budget."""
    year, month = (now.year, now.month - 1) if now.month > 1 else (now.year - 1, 12)
    label = f"{year:04d}-{month:02d}"
    report = evaluate_month(store.for_month(label), label, now)
    if report.status == "breached":
        sink.raise_alert("availability_breach", report)
    if report.budget_exhausted:
        sink.raise_alert("downtime_budget_exhausted", report)
    return report


def handler(event: dict, context: object) -> dict:
    """Scheduled entry point: `probe` every minute, `month_end_gate` at 00:05 UTC on day 1."""
    task = event.get("task")
    if task == "probe":
        url = get_settings().public_health_url
        if not url:  # fail closed: an unconfigured probe counts as down
            _store().record(ProbeResult(_now(), False))
            return {"ok": False}
        return {"ok": run_probe(url, _store(), _now(), _http_status).ok}
    if task == "month_end_gate":
        report = run_month_end_gate(_store(), _sink(), _now())
        return {
            "month": report.month,
            "status": report.status,
            "budget_exhausted": report.budget_exhausted,
            "availability_percent": report.availability_percent,
        }
    raise ValueError(f"unknown task: {task!r}")
