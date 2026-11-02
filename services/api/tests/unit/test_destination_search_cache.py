from datetime import UTC, datetime

import pytest

from app.locations.resolver import RateLimiter
from app.places.destination_search import (
    CachedDestinationSearch,
    LiveSearchUnavailable,
    sign_place_ref,
    verify_place_ref,
)
from tests.unit.locations_fakes import AGRA, FakeClock, FakeDatetimeClock, FakeLiveSearch

NOW = datetime(2026, 1, 1, tzinfo=UTC)


def _cached(upstream, clock=None):
    clock = clock or FakeClock()
    return CachedDestinationSearch(upstream, RateLimiter(clock.now, clock.sleep), FakeDatetimeClock())


def test_same_normalised_query_is_served_from_cache():
    upstream = FakeLiveSearch()
    cached = _cached(upstream)
    cached.search("Agra")
    cached.search("  agra ")
    assert upstream.calls == 1


def test_a_failure_is_not_cached():
    upstream = FakeLiveSearch()
    cached = _cached(upstream)
    upstream.down = True
    with pytest.raises(LiveSearchUnavailable):
        cached.search("Delhi")
    upstream.down = False
    cached.search("Delhi")
    assert upstream.calls == 2


def test_upstream_calls_are_spaced_one_second_apart():
    clock = FakeClock()
    cached = _cached(FakeLiveSearch(), clock)
    cached.search("Agra")
    cached.search("Delhi")
    assert clock.sleeps == [1.0]


def test_cache_is_bounded():
    upstream = FakeLiveSearch()
    cached = CachedDestinationSearch(
        upstream, RateLimiter(FakeClock().now, lambda s: None), FakeDatetimeClock(), size=1
    )
    cached.search("Agra")
    cached.search("Delhi")
    cached.search("Agra")
    assert upstream.calls == 3


def test_a_signed_ref_round_trips_and_names_the_place():
    ref = sign_place_ref(AGRA, b"k", NOW)
    place = verify_place_ref(ref, b"k", NOW)
    assert (place.name, place.country, place.location.country_code) == ("Agra", "India", "IN")


@pytest.mark.parametrize("ref", ["", "live:", "live:forged.sig", "live:é.é", "starter:x"])
def test_a_bad_ref_is_refused(ref):
    assert verify_place_ref(ref, b"k", NOW) is None


def test_a_ref_signed_with_another_key_or_expired_is_refused():
    ref = sign_place_ref(AGRA, b"k", NOW)
    assert verify_place_ref(ref, b"other", NOW) is None
    later = datetime(2026, 1, 1, 1, 0, 1, tzinfo=UTC)
    assert verify_place_ref(ref, b"k", later) is None


def test_a_tampered_payload_is_refused():
    ref = sign_place_ref(AGRA, b"k", NOW)
    payload, _, mac = ref[len("live:") :].rpartition(".")
    assert verify_place_ref(f"live:{payload}A.{mac}", b"k", NOW) is None
