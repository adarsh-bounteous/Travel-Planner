from decimal import Decimal

import pytest

from app.config import get_settings
from app.routers import deps
from app.trips.rates import OFFERED_CURRENCIES, InMemoryRates, LocalRates


class ExplodingRates:
    def rate(self, from_currency, to_currency):
        raise AssertionError("outside rates service used")


@pytest.fixture
def local_client(sign_in_as, monkeypatch):
    """A signed-in client with local mode on and get_rates NOT overridden."""
    from app.main import app

    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    client = sign_in_as("maya@example.com")
    app.dependency_overrides.pop(deps.get_rates)
    return client


def _convert(client, amount, from_currency, to_currency):
    return client.get("/rates/convert", params={"amount": amount, "from": from_currency, "to": to_currency})


def test_100_eur_in_usd_uses_local_rate():
    assert LocalRates().rate("EUR", "USD") == Decimal("1.08")
    assert Decimal(100) * LocalRates().rate("EUR", "USD") == Decimal("108.00")


def test_cross_rate_goes_through_the_table():
    assert LocalRates().rate("USD", "GBP") == Decimal("0.85") / Decimal("1.08")
    assert LocalRates().rate("gbp", "eur") == Decimal(1) / Decimal("0.85")


@pytest.mark.parametrize("a,b", [(a, b) for a in OFFERED_CURRENCIES for b in OFFERED_CURRENCIES])
def test_every_pair_converts(a, b):
    assert LocalRates().rate(a, b) is not None


def test_offered_currencies_include_every_trip_currency():
    assert OFFERED_CURRENCIES == ("EUR", "USD", "GBP", "JPY", "AUD")


@pytest.mark.parametrize("a,b", [("XYZ", "USD"), ("USD", "XYZ"), ("XYZ", "XYZ")])
def test_unknown_currency_has_no_rate(a, b):
    assert LocalRates().rate(a, b) is None


def test_router_converts_at_local_rate(local_client):
    body = _convert(local_client, 100, "EUR", "USD").json()
    assert body == {"supported": True, "amount": 108.0, "currency": "USD", "rate": 1.08}


def test_router_rounds_jpy_to_whole_units(local_client):
    assert _convert(local_client, 100, "EUR", "JPY").json()["amount"] == 16000
    assert _convert(local_client, "0.0035", "EUR", "JPY").json()["amount"] == 1


def test_router_needs_sign_in(sign_in_as):
    from fastapi.testclient import TestClient

    from app.main import app

    sign_in_as("maya@example.com")
    assert _convert(TestClient(app), 1, "EUR", "USD").status_code == 401


def test_local_mode_never_reaches_outside_service(local_client, monkeypatch):
    monkeypatch.setattr(deps, "_rates", lambda: ExplodingRates())
    assert _convert(local_client, 100, "EUR", "GBP").json()["supported"] is True


def test_outside_rate_does_not_change_local_answer(local_client, monkeypatch):
    monkeypatch.setattr(deps, "_rates", lambda: InMemoryRates({("EUR", "USD"): Decimal("1.12")}))
    assert _convert(local_client, 100, "EUR", "USD").json()["amount"] == 108.0


def test_get_rates_follows_the_local_mode_switch(monkeypatch):
    monkeypatch.setenv("LOCAL_MODE", "true")
    monkeypatch.setenv("APP_ENV", "local")
    assert get_settings().local_mode is True
    assert isinstance(deps.get_rates(), LocalRates)
    monkeypatch.setenv("LOCAL_MODE", "false")
    assert not isinstance(deps.get_rates(), LocalRates)


def test_unsupported_currency_gets_a_message(local_client):
    body = _convert(local_client, 50, "XYZ", "USD").json()
    assert body["supported"] is False
    assert "not supported" in body["message"]
    assert "XYZ" in body["message"]


def test_unsupported_currency_has_no_amount(local_client):
    assert "amount" not in _convert(local_client, 50, "XYZ", "USD").json()
    assert "amount" not in _convert(local_client, 50, "USD", "XYZ").json()
