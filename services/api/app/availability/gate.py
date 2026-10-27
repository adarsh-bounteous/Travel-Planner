from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

# ADR-0005: monthly availability of at least 99.9%, taken literally as 43 minutes of downtime.
DOWNTIME_BUDGET = timedelta(minutes=43)


@dataclass(frozen=True)
class ProbeResult:
    at: datetime  # tz-aware UTC
    ok: bool


@dataclass(frozen=True)
class AvailabilityReport:
    month: str  # "2026-10"
    downtime: timedelta
    availability_percent: float
    status: Literal["ok", "breached"]
    budget_exhausted: bool
    final: bool  # False while the month is in progress


def month_bounds(month: str) -> tuple[datetime, datetime]:
    """The start (inclusive) and end (exclusive) of a "YYYY-MM" calendar month, in UTC."""
    year, number = (int(part) for part in month.split("-"))
    start = datetime(year, number, 1, tzinfo=UTC)
    end = datetime(year + number // 12, number % 12 + 1, 1, tzinfo=UTC)
    return start, end


def downtime_for_month(probes: Sequence[ProbeResult], month: str, now: datetime) -> timedelta:
    """A failed probe is downtime until the next probe (or `now`), clipped to the month."""
    start, end = month_bounds(month)
    horizon = min(now, end)
    ordered = sorted(probes, key=lambda probe: probe.at)
    downtime = timedelta(0)
    for index, probe in enumerate(ordered):
        if probe.ok:
            continue
        until = ordered[index + 1].at if index + 1 < len(ordered) else horizon
        interval_start, interval_end = max(probe.at, start), min(until, horizon)
        if interval_end > interval_start:
            downtime += interval_end - interval_start
    return downtime


def evaluate_month(probes: Sequence[ProbeResult], month: str, now: datetime) -> AvailabilityReport:
    start, end = month_bounds(month)
    elapsed = min(now, end) - start
    downtime = downtime_for_month(probes, month, now)
    exceeded = downtime > DOWNTIME_BUDGET
    percent = 100.0 * (1 - downtime / elapsed) if elapsed > timedelta(0) else 100.0
    return AvailabilityReport(
        month=month,
        downtime=downtime,
        availability_percent=percent,
        status="breached" if exceeded else "ok",
        budget_exhausted=exceeded,
        final=now >= end,
    )
