import pytest

from app.integrations import RateLimitError
from tests.unit.integrations_support.fakes import make_client

LIMIT = dict(rate_limit_calls=2, rate_limit_period_seconds=60)


def test_refuses_when_limit_reached_without_calling_provider():
    h = make_client(settings=LIMIT)
    h.client.request("p", "GET", "/x?n=1")
    h.client.request("p", "GET", "/x?n=2")
    with pytest.raises(RateLimitError):
        h.client.request("p", "GET", "/x?n=3")
    assert h.calls == 2


def test_below_limit_reaches_provider():
    h = make_client(settings=LIMIT)
    h.client.request("p", "GET", "/x")
    h.clock.advance(10)
    h.client.request("p", "GET", "/x")
    assert h.calls == 2


def test_window_slides():
    h = make_client(settings=LIMIT)
    h.client.request("p", "GET", "/x")
    h.client.request("p", "GET", "/x")
    h.clock.advance(61)
    h.client.request("p", "GET", "/x")
    assert h.calls == 3
