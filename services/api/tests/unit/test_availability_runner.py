from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.availability import runner
from app.availability.gate import AvailabilityReport, ProbeResult, evaluate_month
from app.availability.runner import run_month_end_gate, run_probe
from app.availability.store import InMemoryProbeStore

NOW = datetime(2026, 11, 1, 0, 5, tzinfo=UTC)


class RecordingSink:
    def __init__(self) -> None:
        self.alerts: list[tuple[str, AvailabilityReport]] = []

    def raise_alert(self, kind: str, report: AvailabilityReport) -> None:
        self.alerts.append((kind, report))

    @property
    def kinds(self) -> list[str]:
        return [kind for kind, _ in self.alerts]


def store_with_outage(minutes: int) -> InMemoryProbeStore:
    store = InMemoryProbeStore()
    start = datetime(2026, 10, 10, 12, 0, tzinfo=UTC)
    store.record(ProbeResult(start, ok=False))
    store.record(ProbeResult(start + timedelta(minutes=minutes), ok=True))
    return store


def test_month_end_gate_evaluates_previous_month():
    report = run_month_end_gate(InMemoryProbeStore(), RecordingSink(), NOW)
    assert report.month == "2026-10" and report.final is True


def test_month_end_gate_in_january_evaluates_december():
    report = run_month_end_gate(InMemoryProbeStore(), RecordingSink(), datetime(2027, 1, 1, 0, 5, tzinfo=UTC))
    assert report.month == "2026-12"


def test_breach_raises_breach_alert():
    sink = RecordingSink()
    run_month_end_gate(store_with_outage(44), sink, NOW)
    assert "availability_breach" in sink.kinds


def test_exhausted_budget_raises_distinct_alert():
    sink = RecordingSink()
    run_month_end_gate(store_with_outage(44), sink, NOW)
    assert "downtime_budget_exhausted" in sink.kinds


def test_healthy_month_raises_nothing():
    sink = RecordingSink()
    run_month_end_gate(store_with_outage(10), sink, NOW)
    assert sink.alerts == []


def test_failed_probe_counts_as_downtime():
    store = InMemoryProbeStore()
    t0 = datetime(2026, 10, 5, 12, 0, tzinfo=UTC)
    r = run_probe("https://example.test/health", store, t0, fetch=lambda u: 503)
    assert r.ok is False
    run_probe("https://example.test/health", store, t0 + timedelta(minutes=50), fetch=lambda u: 200)
    rep = evaluate_month(store.for_month("2026-10"), "2026-10", now=t0 + timedelta(hours=1))
    assert rep.downtime == timedelta(minutes=50) and rep.status == "breached"


@pytest.mark.parametrize(
    "error", [httpx.ConnectError("refused"), httpx.ReadTimeout("slow"), OSError("dns"), httpx.InvalidURL("bad")]
)
def test_probe_error_is_failure(error):
    def down(url: str) -> int:
        raise error

    assert run_probe("https://example.test/health", InMemoryProbeStore(), NOW, fetch=down).ok is False


def test_probe_success_is_recorded():
    store = InMemoryProbeStore()
    assert run_probe("https://example.test/health", store, NOW, fetch=lambda u: 204).ok is True
    assert len(store.for_month("2026-11")) == 1


def test_handler_month_end_gate(monkeypatch):
    monkeypatch.setattr(runner, "_store", lambda: InMemoryProbeStore())
    monkeypatch.setattr(runner, "_sink", lambda: RecordingSink())
    monkeypatch.setattr(runner, "_now", lambda: NOW)
    result = runner.handler({"task": "month_end_gate"}, None)
    assert result["month"] == "2026-10" and result["status"] == "ok"


def test_handler_probe(monkeypatch):
    store = InMemoryProbeStore()
    monkeypatch.setattr(runner, "_store", lambda: store)
    monkeypatch.setattr(runner, "_now", lambda: NOW)
    monkeypatch.setattr(runner, "_http_status", lambda url: 200)
    monkeypatch.setenv("PUBLIC_HEALTH_URL", "https://example.test/health")
    assert runner.handler({"task": "probe"}, None) == {"ok": True}


def test_handler_probe_without_url_fails_closed(monkeypatch):
    store = InMemoryProbeStore()
    monkeypatch.setattr(runner, "_store", lambda: store)
    monkeypatch.setattr(runner, "_now", lambda: NOW)
    monkeypatch.delenv("PUBLIC_HEALTH_URL", raising=False)
    assert runner.handler({"task": "probe"}, None) == {"ok": False}


def test_handler_unknown_task():
    with pytest.raises(ValueError):
        runner.handler({"task": "nope"}, None)
