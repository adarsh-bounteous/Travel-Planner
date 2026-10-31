from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth.local_identity import LocalIdentityProvider
from app.config import get_settings
from app.local_mode import KNOWN_LIVE_PROVIDERS, LocalModeRefusedError, resolve_live_providers
from app.locations.resolver import NoResolver
from app.main import app
from app.places.local_search import LocalPlaceSearch
from app.providers.registry import default_registry
from app.routers import auth, deps


def test_unknown_provider_refused():
    with pytest.raises(LocalModeRefusedError):
        resolve_live_providers({"LOCAL_LIVE_PROVIDERS": "bogus"})


def test_places_parsed_and_empty_default():
    assert resolve_live_providers({"LOCAL_LIVE_PROVIDERS": " places "}) == {"places"}
    assert resolve_live_providers({}) == frozenset()


def _map_tiles(monkeypatch, providers):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("LOCAL_LIVE_PROVIDERS", providers)
    with TestClient(app) as client:
        return client.get("/startup-status").json()["map_tiles"]


def test_places_opt_in_turns_tiles_on(monkeypatch):
    assert _map_tiles(monkeypatch, "places") is True


def test_empty_keeps_tiles_off(monkeypatch):
    assert _map_tiles(monkeypatch, "") is False


def _env(monkeypatch, providers, local=True):
    if local:
        monkeypatch.setenv("LOCAL_MODE", "true")
        monkeypatch.setenv("APP_ENV", "local")
    else:
        monkeypatch.delenv("LOCAL_MODE", raising=False)
    if providers is None:
        monkeypatch.delenv("LOCAL_LIVE_PROVIDERS", raising=False)
    else:
        monkeypatch.setenv("LOCAL_LIVE_PROVIDERS", providers)


def test_known_names_match_registry():
    assert KNOWN_LIVE_PROVIDERS == {e["name"] for e in default_registry().statuses(lambda _: "x")}


@pytest.mark.parametrize("providers", ["", None])
def test_nothing_live_by_default(monkeypatch, providers):
    _env(monkeypatch, providers)
    assert not any(get_settings().is_live(n) for n in KNOWN_LIVE_PROVIDERS)
    assert isinstance(deps.get_places(), LocalPlaceSearch)
    assert isinstance(deps.get_destination_resolver(), NoResolver)
    assert deps.get_flight_providers() is deps._local_flight_providers()
    assert deps.get_transport_providers() is deps._local_transport_providers()
    assert deps.get_stay_providers() is deps._local_stay_providers()
    assert deps.get_invite_sender() is deps._local_invite_sender()
    assert isinstance(auth.get_identity(), LocalIdentityProvider)


def test_named_provider_live_others_local(monkeypatch):
    _env(monkeypatch, "places")
    assert deps.get_places() is deps._places()
    assert deps.get_stay_providers() is deps._local_stay_providers()
    assert deps.get_invite_sender() is deps._local_invite_sender()


def test_two_named_providers_live(monkeypatch):
    _env(monkeypatch, "places,hotels")
    assert deps.get_places() is deps._places()
    assert deps.get_stay_providers() is deps._stay_providers()
    assert deps.get_flight_providers() is deps._local_flight_providers()


def test_whitespace_and_trailing_comma(monkeypatch):
    assert resolve_live_providers({"LOCAL_LIVE_PROVIDERS": " places , hotels, "}) == {"places", "hotels"}
    _env(monkeypatch, " places , hotels, ")
    assert get_settings().is_live("places") and get_settings().is_live("hotels")
    assert deps.get_places() is deps._places()
    assert deps.get_stay_providers() is deps._stay_providers()


def test_local_mode_off_everything_live(monkeypatch):
    _env(monkeypatch, "places", local=False)
    s = get_settings()
    assert s.is_live("places") and s.is_live("flights")
    assert deps.get_places() is deps._places()
    assert deps.get_flight_providers() is deps._flight_providers()


def test_wrong_case_refused():
    with pytest.raises(LocalModeRefusedError, match="Places"):
        resolve_live_providers({"LOCAL_LIVE_PROVIDERS": "Places"})


@pytest.mark.parametrize("value", ["places,bogus", "PLACES"])
def test_app_start_refuses_bad_name(monkeypatch, value):
    _env(monkeypatch, value)
    with pytest.raises(LocalModeRefusedError, match=value.split(",")[-1]):
        with TestClient(app):
            pass


def test_readme_row_default_empty():
    readme = (Path(__file__).parents[2] / "README.md").read_text()
    row = next(line for line in readme.splitlines() if line.startswith("| `LOCAL_LIVE_PROVIDERS`"))
    assert [c.strip() for c in row.strip("|").split("|")][1] == "empty"
