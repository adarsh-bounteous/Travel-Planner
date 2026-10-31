import threading
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Protocol

from pydantic import BaseModel

LOCATION_TTL = timedelta(days=30)


class BoundingBox(BaseModel):
    south: float
    north: float
    west: float
    east: float


class ResolvedLocation(BaseModel):
    name: str  # canonical display name
    country_code: str  # ISO 3166-1 alpha-2, upper-case
    lat: float
    lng: float
    time_zone: str  # IANA, e.g. "Europe/Lisbon"
    bbox: BoundingBox


class DestinationResolver(Protocol):
    def resolve(
        self, country: str | None, place: str | None, destination: str | None
    ) -> ResolvedLocation | None:
        """The real location of a destination. Never raises: no match or unreachable is None."""
        ...


class NoResolver:
    """Local mode's resolver: makes no outside request, so trips stay unresolved."""

    def resolve(
        self, country: str | None, place: str | None, destination: str | None
    ) -> ResolvedLocation | None:
        return None


class LocationCache(Protocol):
    def get(self, key: str) -> tuple[ResolvedLocation, datetime] | None: ...  # (location, resolved_at)

    def put(self, key: str, location: ResolvedLocation, resolved_at: datetime) -> None: ...


class RateLimiter:
    """Keeps calls at least `min_interval` seconds apart (Nominatim allows one request a second)."""

    def __init__(
        self,
        clock: Callable[[], float],
        sleep: Callable[[float], None],
        min_interval: float = 1.0,
    ) -> None:
        self._clock = clock
        self._sleep = sleep
        self._min_interval = min_interval
        self._last: float | None = None
        self._lock = threading.Lock()

    def wait(self) -> None:
        with self._lock:
            if self._last is not None:
                remaining = self._min_interval - (self._clock() - self._last)
                if remaining > 0:
                    self._sleep(remaining)
            self._last = self._clock()


def cache_key(country: str | None, place: str | None, destination: str | None) -> str:
    return "|".join((part or "").strip().casefold() for part in (country, place, destination))


class CachedResolver:
    """A resolver that serves a stored result younger than `ttl` and rate-limits the upstream."""

    def __init__(
        self,
        upstream: DestinationResolver,
        cache: LocationCache,
        limiter: RateLimiter,
        now: Callable[[], datetime],
        ttl: timedelta = LOCATION_TTL,
    ) -> None:
        self._upstream = upstream
        self._cache = cache
        self._limiter = limiter
        self._now = now
        self._ttl = ttl

    def resolve(
        self, country: str | None, place: str | None, destination: str | None
    ) -> ResolvedLocation | None:
        key = cache_key(country, place, destination)
        hit = self._cache.get(key)
        if hit is not None and self._now() - hit[1] < self._ttl:
            return hit[0]
        self._limiter.wait()
        result = self._upstream.resolve(country, place, destination)
        if result is not None:  # a failure is not cached: the next look-up tries again
            self._cache.put(key, result, self._now())
        return result
