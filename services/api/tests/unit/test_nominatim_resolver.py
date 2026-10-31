import httpx
import pytest

from app.locations.nominatim import NominatimResolver
from tests.unit.locations_fakes import LISBON

HIT = {
    "display_name": "Lisbon, Portugal",
    "lat": "38.7167",
    "lon": "-9.1333",
    "boundingbox": ["38.69", "38.80", "-9.23", "-9.09"],
    "address": {"country_code": "pt"},
}


def resolver(respond, tz="Europe/Lisbon"):
    sent = []

    def http_get(url, params, headers, timeout):
        sent.append((url, params, headers, timeout))
        return respond()

    r = NominatimResolver("https://nominatim.test", "test-agent", http_get, lambda lat, lng: tz)
    return r, sent


def ok(payload):
    return lambda: httpx.Response(200, json=payload, request=httpx.Request("GET", "https://nominatim.test"))


def test_maps_the_first_hit():
    r, sent = resolver(ok([HIT]))
    assert r.resolve("Portugal", "Lisbon", None) == LISBON
    url, params, headers, timeout = sent[0]
    assert url == "https://nominatim.test/search"
    assert headers["User-Agent"] == "test-agent"
    assert params["format"] == "jsonv2" and params["limit"] == 1
    assert params["q"] == "Lisbon, Portugal"
    assert timeout == 10


def test_falls_back_to_the_typed_destination():
    r, sent = resolver(ok([HIT]))
    r.resolve(None, None, "Lisbon")
    assert sent[0][1]["q"] == "Lisbon"


def test_nothing_to_look_up_makes_no_request():
    r, sent = resolver(ok([HIT]))
    assert r.resolve(None, None, "  ") is None
    assert sent == []


def test_no_match_is_none():
    assert resolver(ok([]))[0].resolve("Portugal", "Atlantis", None) is None


def test_unreachable_is_none():
    def boom():
        raise httpx.ConnectError("down")

    assert resolver(boom)[0].resolve("Portugal", "Lisbon", None) is None


def test_503_is_none():
    r, _ = resolver(lambda: httpx.Response(503, request=httpx.Request("GET", "https://nominatim.test")))
    assert r.resolve("Portugal", "Lisbon", None) is None


@pytest.mark.parametrize("payload", [{"oops": 1}, [{"display_name": "x"}], [{**HIT, "boundingbox": ["1"]}]])
def test_garbage_payload_is_none(payload):
    assert resolver(ok(payload))[0].resolve("Portugal", "Lisbon", None) is None


def test_hit_without_country_code_is_none():
    hit = {**HIT, "address": {}}
    assert resolver(ok([hit]))[0].resolve("Portugal", "Lisbon", None) is None


def test_hit_without_time_zone_is_none():
    assert resolver(ok([HIT]), tz=None)[0].resolve("Portugal", "Lisbon", None) is None


def test_timezone_at_reads_the_zone_offline():
    from app.locations.nominatim import timezone_at

    assert timezone_at(38.7167, -9.1333) == "Europe/Lisbon"
