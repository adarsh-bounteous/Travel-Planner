from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from app.availability.gate import evaluate_month
from app.availability.store import ProbeStore, month_of
from app.routers.deps import get_probe_store

router = APIRouter()


def get_availability_now() -> datetime:
    return datetime.now(UTC)


@router.get("/availability")
def availability(
    store: ProbeStore = Depends(get_probe_store),
    now: datetime = Depends(get_availability_now),
) -> dict[str, object]:
    """The in-progress month's availability, including all downtime measured up to now."""
    month = month_of(now)
    report = evaluate_month(store.for_month(month), month, now)
    return {
        "month": report.month,
        "downtime_seconds": int(report.downtime.total_seconds()),
        "availability_percent": report.availability_percent,
        "status": report.status,
        "budget_exhausted": report.budget_exhausted,
        "final": report.final,
    }
