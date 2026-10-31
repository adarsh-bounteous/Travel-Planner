import socket

import httpx
import pytest

from app.integrations import IntegrationClient
from tests.unit.integrations_support.fake_echo import SETTINGS
from tests.unit.integrations_support.recorded import FixtureMissing, RecordingTransport, ReplayTransport
from tests.unit.integrations_support.scrub import scrub_body

URL = "https://api.example/x"


def live_returning(body, calls=None):
    def handler(request):
        if calls is not None:
            calls.append(request)
        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


def record(tmp_path, body, **kwargs):
    secrets = kwargs.pop("secrets", ())
    client = httpx.Client(transport=RecordingTransport(tmp_path, live_returning(body), secrets=secrets))
    return client.get(URL, **kwargs)


def stored_text(tmp_path):
    return "".join(p.read_text() for p in tmp_path.glob("*.json"))


def test_recording_a_new_call_stores_a_replayable_fixture(tmp_path):
    record(tmp_path, {"ok": 1})
    assert len(list(tmp_path.glob("*.json"))) == 1
    replay = httpx.Client(transport=ReplayTransport(tmp_path))
    assert replay.get(URL).json() == {"ok": 1}


def test_api_key_is_not_stored(tmp_path):
    record(
        tmp_path, {"echo": "key=SECRET123"}, secrets=["SECRET123"],
        params={"key": "SECRET123"}, headers={"X-Api-Key": "SECRET123"},
    )
    assert "SECRET123" not in stored_text(tmp_path)


def test_request_credentials_are_scrubbed_without_being_declared(tmp_path):
    record(tmp_path, {"echo": "SECRET456"}, headers={"Authorization": "Bearer SECRET456"})
    assert "SECRET456" not in stored_text(tmp_path)


def test_key_that_looks_like_a_phone_number_is_not_stored():
    out = scrub_body(b'{"k": "key 1234567890123"}', secrets=["1234567890123"])
    assert b"1234567890123" not in out


@pytest.mark.parametrize(
    "field, value",
    [
        ("name", "Ada Lovelace"), ("email", "ada@lovelace.org"), ("phone", "+44 20 7946 0958"),
        ("address", "12 St James Sq, London"), ("date_of_birth", "1815-12-10"),
    ],
)
def test_personal_field_is_not_stored(tmp_path, field, value):
    record(tmp_path, {"guest": {field: value}})
    assert value not in stored_text(tmp_path)


def test_email_and_phone_in_any_field_are_scrubbed(tmp_path):
    record(tmp_path, {"notes": "write to bob@example.com or call +1 415 555 0100"})
    text = stored_text(tmp_path)
    assert "bob@example.com" not in text and "415 555 0100" not in text


def test_non_json_body_is_scrubbed():
    out = scrub_body(b"mail bob@example.com key=SECRET123", secrets=["SECRET123"])
    assert b"bob@example.com" not in out and b"SECRET123" not in out


def test_existing_fixture_is_not_rewritten(tmp_path):
    record(tmp_path, {"v": 1})
    path = next(tmp_path.glob("*.json"))
    before = path.read_bytes()
    record(tmp_path, {"v": 2})
    assert path.read_bytes() == before


def test_no_live_request_when_fixture_exists(tmp_path):
    record(tmp_path, {"v": 1})
    calls = []
    httpx.Client(transport=RecordingTransport(tmp_path, live_returning({}, calls))).get(URL)
    assert calls == []


def test_replay_without_network(tmp_path, monkeypatch):
    client = IntegrationClient([SETTINGS], transport=RecordingTransport(tmp_path, live_returning({"v": 1})))
    client.request("fake-echo", "GET", "/x")
    monkeypatch.setattr(socket.socket, "connect", lambda *a, **k: pytest.fail("network used"))
    replayed = IntegrationClient([SETTINGS], transport=ReplayTransport(tmp_path))
    assert replayed.request("fake-echo", "GET", "/x").json() == {"v": 1}


def test_replay_of_an_unrecorded_call_raises(tmp_path):
    with pytest.raises(FixtureMissing):
        httpx.Client(transport=ReplayTransport(tmp_path)).get(URL)
