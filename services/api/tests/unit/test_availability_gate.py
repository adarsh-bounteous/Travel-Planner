from datetime import UTC, datetime, timedelta

from app.availability.gate import ProbeResult, evaluate_month


def outage(start: datetime, minutes: int) -> list[ProbeResult]:
    return [ProbeResult(start, ok=False), ProbeResult(start + timedelta(minutes=minutes), ok=True)]


SEPT_START = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)
OCT_1 = datetime(2026, 10, 1, tzinfo=UTC)


def test_43_minutes_is_within_target():
    r = evaluate_month(outage(SEPT_START, 43), "2026-09", now=OCT_1)
    assert r.downtime == timedelta(minutes=43)
    assert r.status == "ok" and r.budget_exhausted is False
    assert r.availability_percent >= 99.9
    assert r.final is True


def test_44_minutes_is_breached_and_exhausted():
    r = evaluate_month(outage(SEPT_START, 44), "2026-09", now=OCT_1)
    assert r.status == "breached"
    assert r.budget_exhausted is True


def test_outage_spanning_month_boundary_is_split():
    probes = outage(datetime(2026, 9, 30, 23, 50, tzinfo=UTC), 30)
    now = datetime(2026, 10, 2, tzinfo=UTC)
    assert evaluate_month(probes, "2026-09", now).downtime == timedelta(minutes=10)
    assert evaluate_month(probes, "2026-10", now).downtime == timedelta(minutes=20)


def test_open_outage_in_progress_month_counts_up_to_now():
    now = datetime(2026, 10, 5, 12, 30, tzinfo=UTC)
    probes = [ProbeResult(datetime(2026, 10, 5, 12, 0, tzinfo=UTC), ok=False)]
    r = evaluate_month(probes, "2026-10", now)
    assert r.downtime == timedelta(minutes=30)
    assert r.final is False


def test_no_probes_is_zero_downtime():
    r = evaluate_month([], "2026-09", now=OCT_1)
    assert r.downtime == timedelta(0) and r.availability_percent == 100.0


def test_unsorted_probes_are_ordered():
    probes = list(reversed(outage(SEPT_START, 10)))
    assert evaluate_month(probes, "2026-09", OCT_1).downtime == timedelta(minutes=10)
