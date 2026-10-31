import logging
from collections.abc import Callable, Sized
from datetime import UTC, datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

from app.integrations.errors import FallbackError

logger = logging.getLogger(__name__)

T = TypeVar("T")

Source = Literal["live", "fallback"]


class Sourced(BaseModel, Generic[T]):
    """A result plus where it came from, so the UI can tell the traveller."""

    result: T
    source: Source
    as_of: datetime


def _is_empty(value: object) -> bool:
    return value is None or (isinstance(value, Sized) and len(value) == 0)


def with_fallback(
    primary: Callable[[], T],
    fallback: Callable[[], T],
    *,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> Sourced[T]:
    """Return the live result, or saved data when live fails or is empty."""
    try:
        value = primary()
        if not _is_empty(value):
            return Sourced(result=value, source="live", as_of=now())
        primary_reason = "empty result"
    except Exception as exc:
        primary_reason = f"{type(exc).__name__}: {exc}"
    logger.warning("primary source failed (%s); using fallback", primary_reason)

    try:
        saved = fallback()
    except Exception as exc:
        raise FallbackError(primary_reason, f"{type(exc).__name__}: {exc}") from exc
    if _is_empty(saved):
        raise FallbackError(primary_reason, "empty result")
    return Sourced(result=saved, source="fallback", as_of=now())
