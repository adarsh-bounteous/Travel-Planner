import inspect
from unittest.mock import patch

import httpx

from app.integrations import IntegrationClient
from tests.unit.integrations_support import fake_echo
from tests.unit.integrations_support.fake_echo import SETTINGS, FakeEchoProvider


def echo_client() -> IntegrationClient:
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=request.content))
    return IntegrationClient([SETTINGS], transport=transport)


def test_echoes_through_client():
    assert FakeEchoProvider(echo_client()).echo("hi").message == "hi"


def test_adapter_uses_shared_client():
    client = echo_client()
    with patch.object(
        IntegrationClient, "request", autospec=True, side_effect=IntegrationClient.request
    ) as spy:
        FakeEchoProvider(client).echo("hi")
    assert spy.call_count == 1 and spy.call_args.args[1] == "fake-echo"


def test_adapter_has_no_resilience_logic():
    src = inspect.getsource(fake_echo).lower()
    assert not any(w in src for w in ("retry", "sleep", "rate", "breaker", "cache", "backoff"))
