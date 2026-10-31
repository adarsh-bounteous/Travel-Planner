from app.locations.resolver import RateLimiter
from tests.unit.locations_fakes import FakeClock


def test_back_to_back_waits_are_at_least_one_second_apart():
    clock = FakeClock()
    limiter = RateLimiter(clock.now, clock.sleep, 1.0)
    stamps = []
    for _ in range(3):
        limiter.wait()
        stamps.append(clock.now())
    assert all(b - a >= 1.0 for a, b in zip(stamps, stamps[1:]))


def test_first_wait_does_not_sleep():
    clock = FakeClock()
    RateLimiter(clock.now, clock.sleep, 1.0).wait()
    assert clock.sleeps == []
