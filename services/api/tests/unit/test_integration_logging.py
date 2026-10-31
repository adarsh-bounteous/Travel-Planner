import logging

import pytest

from app.integrations import ProviderUnavailableError
from tests.unit.integrations_support.fakes import make_client

SETTINGS = dict(credential_params=("key",), credential_headers=("X-Api-Key",))


def everything_logged(caplog) -> str:
    return " ".join(r.getMessage() + repr(r.__dict__) for r in caplog.records)


def test_entry_has_required_fields(caplog):
    caplog.set_level(logging.INFO)
    make_client().client.request("p", "GET", "/x?secret=1")
    entry = caplog.records[-1].integration
    assert {"provider", "endpoint", "status", "latency_ms", "cache_hit", "retries"} <= entry.keys()
    assert entry["endpoint"] == "/x"
    assert entry["status"] == 200


def test_entry_reports_retries_and_cache_hit(caplog):
    caplog.set_level(logging.INFO)
    h = make_client(settings=dict(cache_ttl_seconds=60), script=[503, 200])
    h.client.request("p", "GET", "/x")
    assert caplog.records[-1].integration["retries"] == 1
    h.client.request("p", "GET", "/x")
    assert caplog.records[-1].integration["cache_hit"] is True


def test_api_key_never_logged(caplog):
    caplog.set_level(logging.DEBUG)
    h = make_client(settings=SETTINGS, script=[503, 200])
    h.client.request(
        "p", "GET", "/x", params={"key": "SECRET-KEY"}, headers={"X-Api-Key": "SECRET-KEY"}
    )
    assert caplog.records and "SECRET-KEY" not in everything_logged(caplog)


def test_personal_data_never_logged(caplog):
    caplog.set_level(logging.DEBUG)
    h = make_client(settings=dict(retries=1), script=[503, 200])
    h.client.request("p", "POST", "/x", json={"email": "jane@example.com"})
    h = make_client(settings=dict(retries=1), script=[503, 503])
    with pytest.raises(ProviderUnavailableError):
        h.client.request("p", "POST", "/x", json={"email": "jane@example.com"})
    assert caplog.records and "jane@example.com" not in everything_logged(caplog)
