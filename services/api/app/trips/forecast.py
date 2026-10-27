from datetime import date, timedelta
from typing import Protocol

from pydantic import BaseModel

FORECAST_HORIZON_DAYS = 14


class ForecastUnavailable(Exception):
    """The forecast service could not be reached."""


class DayForecast(BaseModel):
    date: date
    high_c: int
    low_c: int
    rain_percent: int


class ForecastSource(Protocol):
    """Where forecasts come from. A real provider adapter implements this port."""

    def for_dates(self, destination: str, start: date, end: date) -> list[DayForecast]:
        """One forecast per day from `start` to `end`; raises ForecastUnavailable on failure."""


def forecast_dates(start: date | None, end: date | None, today: date) -> tuple[date, date] | None:
    """The trip dates clipped to today..today+14, or None when start is more than 14 days away or the trip is over."""
    if start is None:
        return None
    last = end or start
    horizon = today + timedelta(days=FORECAST_HORIZON_DAYS)
    if start > horizon or last < today:
        return None
    return max(start, today), min(last, horizon)


class LocalForecast:
    """Local mode's forecast stand-in: deterministic days for any destination, no outside request."""

    def for_dates(self, destination: str, start: date, end: date) -> list[DayForecast]:
        days = (end - start).days + 1
        return [
            DayForecast(
                date=start + timedelta(days=i),
                high_c=14 + (start.toordinal() + i) % 5,
                low_c=7 + (start.toordinal() + i) % 4,
                rain_percent=((start.toordinal() + i) * 10) % 70,
            )
            for i in range(days)
        ]
