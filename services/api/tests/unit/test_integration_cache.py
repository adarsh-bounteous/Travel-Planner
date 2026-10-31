from app.integrations import CachedResponse
from tests.unit.integrations_support.fakes import make_client

TTL = dict(cache_ttl_seconds=60, credential_params=("key",))


def test_identical_call_within_validity_is_cached():
    h = make_client(settings=TTL)
    first = h.client.request("p", "GET", "/x")
    h.clock.advance(10)
    second = h.client.request("p", "GET", "/x")
    assert h.calls == 1
    assert second.json() == first.json()


def test_cache_expires():
    h = make_client(settings=TTL)
    h.client.request("p", "GET", "/x")
    h.clock.advance(61)
    h.client.request("p", "GET", "/x")
    assert h.calls == 2


def test_api_key_is_not_part_of_cache_key():
    h = make_client(settings=TTL)
    h.client.request("p", "GET", "/x", params={"key": "A"})
    h.client.request("p", "GET", "/x", params={"key": "B"})
    assert h.calls == 1


def test_other_params_and_body_change_the_key():
    h = make_client(settings=TTL)
    h.client.request("p", "POST", "/x", json={"a": 1})
    h.client.request("p", "POST", "/x", json={"a": 2})
    assert h.calls == 2


def test_errors_are_not_cached():
    h = make_client(settings=TTL, script=[400, 200])
    h.client.request("p", "GET", "/x")
    h.client.request("p", "GET", "/x")
    assert h.calls == 2


def test_cache_is_off_by_default():
    h = make_client()
    h.client.request("p", "GET", "/x")
    h.client.request("p", "GET", "/x")
    assert h.calls == 2


class DictCache:
    def __init__(self):
        self.items: dict[str, CachedResponse] = {}
        self.set_calls = 0
        self.hits = 0

    def get(self, key):
        value = self.items.get(key)
        self.hits += value is not None
        return value

    def set(self, key, value, ttl_seconds):
        self.set_calls += 1
        self.items[key] = value


def test_replacement_cache_is_used():
    cache = DictCache()
    h = make_client(settings=TTL, cache=cache)
    h.client.request("p", "GET", "/x")
    h.client.request("p", "GET", "/x")
    assert cache.set_calls == 1 and cache.hits == 1 and h.calls == 1
