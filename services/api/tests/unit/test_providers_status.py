import pytest
from fastapi.testclient import TestClient

from app import secrets
from app.integrations.breaker import CircuitBreaker
from app.main import app
from app.providers.registry import HEALTH_STATES, ProviderEntry, ProviderRegistry, default_registry
from app.routers import deps
from tests.unit.test_secrets import FakeSecretsClient, RaisingClient

ALL_KEYS = [entry.secret_key for entry in default_registry()._entries]


def _local(monkeypatch):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")


def _outside_local(monkeypatch, client):
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setattr(secrets, "_secrets_client", lambda: client)


def _swap_registry(registry):
    app.dependency_overrides[deps.get_provider_registry] = lambda: registry


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for key in ALL_KEYS:
        monkeypatch.delenv(key, raising=False)
    yield
    app.dependency_overrides.clear()


def _entry(body, name):
    return next(p for p in body["providers"] if p["name"] == name)


def test_missing_key_is_not_configured_in_local_mode(monkeypatch):
    _local(monkeypatch)
    with TestClient(app) as client:
        body = client.get("/startup-status").json()
    assert _entry(body, "places")["health"] == "not configured"


def test_present_key_is_configured_in_local_mode(monkeypatch):
    _local(monkeypatch)
    monkeypatch.setenv("PLACES_API_KEY", "fake-api-key")
    with TestClient(app) as client:
        body = client.get("/startup-status").json()
    assert _entry(body, "places")["health"] == "configured"


def test_app_starts_with_every_key_unset(monkeypatch):
    _local(monkeypatch)
    with TestClient(app) as client:
        assert client.get("/startup-status").status_code == 200


def test_every_registered_provider_is_listed(monkeypatch):
    _local(monkeypatch)
    _swap_registry(
        ProviderRegistry([ProviderEntry("alpha", "maps", "ALPHA_KEY"), ProviderEntry("beta", "email", "BETA_KEY")])
    )
    with TestClient(app) as client:
        body = client.get("/startup-status").json()
    assert {p["name"] for p in body["providers"]} == {"alpha", "beta"}


def test_entry_shows_name_kind_and_health(monkeypatch):
    _local(monkeypatch)
    with TestClient(app) as client:
        body = client.get("/startup-status").json()
    assert body["providers"][0].keys() == {"name", "kind", "health"}


def test_providers_status_lists_every_provider_in_local_mode(monkeypatch):
    _local(monkeypatch)
    with TestClient(app) as client:
        r = client.get("/providers/status")
    assert r.status_code == 200
    assert {p["name"] for p in r.json()["providers"]} == {e.name for e in default_registry()._entries}
    assert r.json()["providers"][0].keys() == {"name", "kind", "health"}


def test_providers_status_is_404_outside_local_mode(monkeypatch):
    _outside_local(monkeypatch, FakeSecretsClient({}))
    with TestClient(app) as client:
        r = client.get("/providers/status")
    assert (r.status_code, r.json()) == (404, {"code": "not_found"})


def test_env_only_key_is_not_configured_outside_local_mode(monkeypatch):
    _outside_local(monkeypatch, FakeSecretsClient({}))
    monkeypatch.setenv("PLACES_API_KEY", "fake-api-key")
    with TestClient(app) as client:
        body = client.get("/startup-status").json()
    assert _entry(body, "places")["health"] == "not configured"


def test_secrets_manager_key_is_configured_outside_local_mode(monkeypatch):
    _outside_local(monkeypatch, FakeSecretsClient({"PLACES_API_KEY": "stored"}))
    with TestClient(app) as client:
        body = client.get("/startup-status").json()
    assert _entry(body, "places")["health"] == "configured"


def test_failed_lookup_is_not_configured_outside_local_mode(monkeypatch):
    _outside_local(monkeypatch, RaisingClient())
    with TestClient(app) as client:
        r = client.get("/startup-status")
    assert r.status_code == 200
    assert _entry(r.json(), "places")["health"] == "not configured"


@pytest.mark.parametrize("case", ["missing", "configured", "open"])
def test_health_is_one_of_the_allowed_states(monkeypatch, case):
    _local(monkeypatch)
    breaker = CircuitBreaker(1, 60, lambda: 0.0)
    if case != "missing":
        monkeypatch.setenv("KEY_A", "fake-api-key")
    if case == "open":
        breaker.allow()
        breaker.record_failure()
    _swap_registry(ProviderRegistry([ProviderEntry("a", "maps", "KEY_A", breaker=breaker)]))
    with TestClient(app) as client:
        entry = client.get("/startup-status").json()["providers"][0]
    assert entry["health"] in HEALTH_STATES
    assert entry["health"] == {"missing": "not configured", "configured": "configured", "open": "open circuit"}[case]


def test_health_override_reports_healthy_and_degraded():
    registry = ProviderRegistry([ProviderEntry("a", "maps", "K")])
    reader = lambda name: "fake-api-key"
    registry.health_override("a", "degraded")
    assert registry.statuses(reader)[0]["health"] == "degraded"
    registry.health_override("a", "healthy")
    assert registry.statuses(reader)[0]["health"] == "healthy"
    assert registry.statuses(lambda name: None)[0]["health"] == "not configured"


def test_breaker_is_open_does_not_consume_trial_slot():
    now = [0.0]
    breaker = CircuitBreaker(1, 10, lambda: now[0])
    assert breaker.is_open is False
    breaker.allow()
    breaker.record_failure()
    assert breaker.is_open is True
    now[0] = 11.0
    assert breaker.is_open is False
    assert breaker.allow() is True  # the trial slot was still free
