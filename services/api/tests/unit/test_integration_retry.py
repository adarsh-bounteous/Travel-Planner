import pytest

from app.integrations import ProviderUnavailableError
from tests.unit.integrations_support.fakes import CONNECT_ERROR, make_client


@pytest.mark.parametrize("first", [503, 408, 429, CONNECT_ERROR])
def test_retries_then_returns_200(first):
    h = make_client(script=[first, 200])
    assert h.client.request("p", "GET", "/x").status_code == 200
    assert h.calls == 2


def test_400_is_not_retried():
    h = make_client(script=[400, 200])
    assert h.client.request("p", "GET", "/x").status_code == 400
    assert h.calls == 1


def test_gives_up_after_configured_retries():
    h = make_client(settings=dict(retries=3), script=[503] * 10)
    with pytest.raises(ProviderUnavailableError) as err:
        h.client.request("p", "GET", "/x")
    assert h.calls == 4
    assert err.value.last_status == 503


def test_retries_are_per_provider():
    h = make_client(
        providers={
            "a": (dict(retries=1), [503] * 10),
            "b": (dict(retries=3), [503] * 10),
        }
    )
    for name in ("a", "b"):
        with pytest.raises(ProviderUnavailableError):
            h.client.request(name, "GET", "/x")
    assert (h.calls_for("a"), h.calls_for("b")) == (2, 4)


def test_honours_retry_after():
    h = make_client(script=[(429, {"Retry-After": "5"}), 200])
    h.client.request("p", "GET", "/x")
    assert h.call_times[1] - h.call_times[0] >= 5


def test_backoff_without_retry_after():
    h = make_client(settings=dict(retries=2), script=[503, 503, 200])
    h.client.request("p", "GET", "/x")
    assert h.sleeps[0] >= 1 and h.sleeps[1] >= 2
