import pytest

from app.integrations import CircuitOpenError, ProviderUnavailableError
from tests.unit.integrations_support.fakes import make_client

NO_RETRY = dict(retries=0)


def fail(h):
    with pytest.raises(ProviderUnavailableError):
        h.client.request("p", "GET", "/x")


def opened(script):
    h = make_client(settings=NO_RETRY, script=script)
    for _ in range(5):
        fail(h)
    return h


def test_four_failures_leave_breaker_closed():
    h = make_client(settings=NO_RETRY, script=[503] * 10)
    for _ in range(4):
        fail(h)
    fail(h)
    assert h.calls == 5


def test_open_breaker_blocks_calls():
    h = opened([503] * 10)
    h.clock.advance(29)
    with pytest.raises(CircuitOpenError):
        h.client.request("p", "GET", "/x")
    assert h.calls == 5


def test_trial_after_cooldown():
    h = opened([503] * 5 + [200])
    h.clock.advance(31)
    assert h.client.request("p", "GET", "/x").status_code == 200
    assert h.calls == 6


def test_successful_trial_closes_breaker():
    h = opened([503] * 5 + [200])
    h.clock.advance(31)
    h.client.request("p", "GET", "/x")
    h.client.request("p", "GET", "/x")
    assert h.calls == 7


def test_failed_trial_reopens_breaker():
    h = opened([503] * 10)
    h.clock.advance(31)
    fail(h)
    h.clock.advance(29)
    with pytest.raises(CircuitOpenError):
        h.client.request("p", "GET", "/x")
    assert h.calls == 6


def test_success_resets_failure_count():
    h = make_client(settings=NO_RETRY, script=[503] * 4 + [200] + [503] * 4)
    for _ in range(4):
        fail(h)
    h.client.request("p", "GET", "/x")
    for _ in range(4):
        fail(h)
    assert h.calls == 9
