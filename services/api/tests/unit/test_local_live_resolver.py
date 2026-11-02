import pytest

from app.locations.cache import InMemoryLocationCache
from app.routers import deps


@pytest.fixture
def local_live_places(monkeypatch):
    """Local mode with places opted in and no AWS region or credentials, as on a developer machine."""
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("LOCAL_LIVE_PROVIDERS", "places")
    for name in ("AWS_DEFAULT_REGION", "AWS_REGION", "AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
        monkeypatch.delenv(name, raising=False)
    caches = (deps._resolver, deps._location_cache)
    for cache in caches:
        cache.cache_clear()
    yield
    for cache in caches:
        cache.cache_clear()


def test_destination_resolver_needs_no_dynamodb_in_local_mode(local_live_places):
    assert deps.get_destination_resolver() is not None  # used to raise NoRegionError


def test_backfill_resolver_needs_no_dynamodb_in_local_mode(local_live_places):
    assert deps.get_backfill_resolver() is not None  # opening a trip used to return 500


def test_local_resolver_keeps_its_cache_in_memory(local_live_places):
    assert isinstance(deps._location_cache(), InMemoryLocationCache)
