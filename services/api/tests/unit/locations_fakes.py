from datetime import datetime, timedelta, UTC

from app.locations.resolver import BoundingBox, ResolvedLocation

LISBON = ResolvedLocation(
    name="Lisbon, Portugal",
    country_code="PT",
    lat=38.7167,
    lng=-9.1333,
    time_zone="Europe/Lisbon",
    bbox=BoundingBox(south=38.69, north=38.80, west=-9.23, east=-9.09),
)
LISBON_REFRESHED = LISBON.model_copy(update={"name": "Lisboa, Portugal"})


class FakeClock:
    def __init__(self) -> None:
        self.t = 1000.0
        self.sleeps: list[float] = []

    def now(self) -> float:
        return self.t

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.t += seconds


class FakeDatetimeClock:
    def __init__(self) -> None:
        self.t = datetime(2026, 1, 1, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.t

    def advance(self, days: int) -> None:
        self.t += timedelta(days=days)


class FakeResolver:
    """A resolver for router tests: Lisbon for anything, until told to fail."""

    def __init__(self) -> None:
        self.calls = 0
        self.failure: str | None = None

    def fail_with(self, failure: str) -> None:
        self.failure = failure

    def resolve(self, country, place, destination):
        self.calls += 1
        if self.failure == "raises":
            raise RuntimeError("boom")
        if self.failure:
            return None
        return LISBON
