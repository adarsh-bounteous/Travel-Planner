from app.locations.cache import InMemoryLocationCache
from app.locations.resolver import CachedResolver, RateLimiter
from tests.unit.locations_fakes import LISBON, LISBON_REFRESHED, FakeClock, FakeDatetimeClock

KEY = "portugal|lisbon|"


class SpyResolver:
    def __init__(self, result, stamp=None):
        self.result = result
        self.calls = 0
        self.stamps: list[float] = []
        self.stamp = stamp

    def resolve(self, country, place, destination):
        self.calls += 1
        if self.stamp:
            self.stamps.append(self.stamp())
        return self.result


def build(result=LISBON, clock=None):
    clock = clock or FakeDatetimeClock()
    upstream = SpyResolver(result)
    cache = InMemoryLocationCache()
    wall = FakeClock()
    limiter = RateLimiter(wall.now, wall.sleep, 0)
    return CachedResolver(upstream, cache, limiter, now=clock), upstream, cache, clock


def test_cached_destination_is_not_requested_again():
    resolver, upstream, _, _ = build()
    resolver.resolve("Portugal", "Lisbon", None)
    assert resolver.resolve("Portugal", "Lisbon", None) == LISBON
    assert upstream.calls == 1


def test_key_ignores_case_and_whitespace():
    resolver, upstream, _, _ = build()
    resolver.resolve("Portugal", "Lisbon", None)
    assert resolver.resolve(" portugal ", " lisbon ", None) == LISBON
    assert upstream.calls == 1


def test_destination_resolved_29_days_ago_is_served_from_cache():
    resolver, upstream, _, clock = build()
    resolver.resolve("Portugal", "Lisbon", None)
    clock.advance(29)
    assert resolver.resolve("Portugal", "Lisbon", None) == LISBON
    assert upstream.calls == 1


def test_destination_resolved_31_days_ago_is_requested_again_and_stored():
    resolver, upstream, cache, clock = build()
    resolver.resolve("Portugal", "Lisbon", None)
    clock.advance(31)
    upstream.result = LISBON_REFRESHED
    assert resolver.resolve("Portugal", "Lisbon", None) == LISBON_REFRESHED
    assert upstream.calls == 2
    assert cache.get(KEY) == (LISBON_REFRESHED, clock())


def test_expired_entry_with_failing_upstream_returns_none():
    resolver, upstream, _, clock = build()
    resolver.resolve("Portugal", "Lisbon", None)
    clock.advance(31)
    upstream.result = None
    assert resolver.resolve("Portugal", "Lisbon", None) is None


def test_failures_are_not_cached():
    resolver, upstream, cache, _ = build(result=None)
    assert resolver.resolve("Portugal", "Lisbon", None) is None
    assert cache.get(KEY) is None
    resolver.resolve("Portugal", "Lisbon", None)
    assert upstream.calls == 2


def test_distinct_destinations_are_requested_a_second_apart():
    wall = FakeClock()
    upstream = SpyResolver(LISBON, stamp=wall.now)
    resolver = CachedResolver(
        upstream, InMemoryLocationCache(), RateLimiter(wall.now, wall.sleep, 1.0), now=FakeDatetimeClock()
    )
    for place in ("Lisbon", "Porto", "Faro"):
        resolver.resolve("Portugal", place, None)
    stamps = upstream.stamps
    assert len(stamps) == 3
    assert all(b - a >= 1.0 for a, b in zip(stamps, stamps[1:]))


def test_cache_hit_does_not_wait():
    class Counting:
        waits = 0

        def wait(self):
            self.waits += 1

    limiter = Counting()
    resolver = CachedResolver(SpyResolver(LISBON), InMemoryLocationCache(), limiter, now=FakeDatetimeClock())
    resolver.resolve("Portugal", "Lisbon", None)
    resolver.resolve("Portugal", "Lisbon", None)
    assert limiter.waits == 1
