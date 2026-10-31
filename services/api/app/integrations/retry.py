from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

RETRYABLE_STATUSES = frozenset({408, 429})


def is_retryable_status(status: int) -> bool:
    return status in RETRYABLE_STATUSES or status >= 500


def parse_retry_after(value: str | None, now: datetime | None = None) -> float | None:
    """Seconds to wait from a Retry-After header (delta-seconds or HTTP-date)."""
    if not value:
        return None
    value = value.strip()
    if value.isdigit():
        return float(value)
    try:
        when = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    return max(0.0, (when - (now or datetime.now(UTC))).total_seconds())


def backoff_delay(attempt: int, base: float, retry_after: float | None = None) -> float:
    if retry_after is not None:
        return retry_after
    return base * 2**attempt
