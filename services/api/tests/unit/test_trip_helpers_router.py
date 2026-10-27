from datetime import date
from decimal import Decimal

import pytest

from app.routers import deps
from app.trips.forecast import ForecastUnavailable, LocalForecast
from app.trips.rates import InMemoryRates, LastKnownRates, RateUnavailable
from tests.trip_body import trip_body

TODAY = date(2026, 10, 27)


class _FailingRates:
    def rate(self, from_currency, to_currency):
        raise RateUnavailable


class _FailingForecast:
    def for_dates(self, destination, start, end):
        raise ForecastUnavailable


@pytest.fixture
def overrides():
    from app.main import app

    state = {
        "rates": InMemoryRates({("JPY", "EUR"): Decimal("0.0061")}),
        "forecast": LocalForecast(),
        "today": TODAY,
        "last_known": LastKnownRates(),
    }
    app.dependency_overrides[deps.get_rates] = lambda: state["rates"]
    app.dependency_overrides[deps.get_forecast] = lambda: state["forecast"]
    app.dependency_overrides[deps.get_today] = lambda: state["today"]
    app.dependency_overrides[deps.get_last_known_rates] = lambda: state["last_known"]
    yield state


def _tokyo(client, **changes):
    return client.post(
        "/trips",
        json=trip_body(
            destination="Tokyo, Japan", start_date="2026-11-03", end_date="2026-11-09", **changes
        ),
    ).json()["id"]


def test_destination_currency_is_jpy(sign_in_as, overrides):
    client = sign_in_as("a@example.com")
    body = client.get(f"/trips/{_tokyo(client)}/currency-helper").json()
    assert body["destination_currency"] == "JPY"


def test_live_rate_between_destination_and_home_currency(sign_in_as, overrides):
    client = sign_in_as("a@example.com")
    body = client.get(f"/trips/{_tokyo(client)}/currency-helper").json()
    assert body["home_currency"] == "EUR"
    assert body["live"]["rate"] == "0.0061"
    assert body["live"]["inverse"] == "163.93"
    assert body["last_known"] is None


def test_unavailable_rate_without_a_last_known_rate(sign_in_as, overrides):
    overrides["rates"] = _FailingRates()
    client = sign_in_as("a@example.com")
    body = client.get(f"/trips/{_tokyo(client)}/currency-helper").json()
    assert body["live"] is None and body["last_known"] is None


def test_unavailable_rate_falls_back_to_the_dated_last_known_rate(sign_in_as, overrides):
    client = sign_in_as("a@example.com")
    tid = _tokyo(client)
    overrides["today"] = date(2026, 10, 14)
    client.get(f"/trips/{tid}/currency-helper")
    overrides["rates"] = _FailingRates()
    overrides["today"] = TODAY
    body = client.get(f"/trips/{tid}/currency-helper").json()
    assert body["live"] is None
    assert body["last_known"] == {"rate": "0.0061", "as_of": "2026-10-14"}


def test_typical_weather_for_the_trip_month(sign_in_as, overrides):
    client = sign_in_as("a@example.com")
    tid = client.post(
        "/trips",
        json=trip_body(destination="Tokyo, Japan", start_date="2027-03-14", end_date="2027-03-20"),
    ).json()["id"]
    body = client.get(f"/trips/{tid}/weather-helper").json()
    assert body["typical"]["month"] == 3
    assert body["forecast"] is None  # more than 14 days away


def test_forecast_for_a_trip_within_14_days(sign_in_as, overrides):
    client = sign_in_as("a@example.com")
    body = client.get(f"/trips/{_tokyo(client)}/weather-helper").json()
    assert body["forecast"]["status"] == "available"
    assert len(body["forecast"]["days"]) == 7


def test_unavailable_forecast_still_returns_dated_typical_weather(sign_in_as, overrides):
    overrides["forecast"] = _FailingForecast()
    client = sign_in_as("a@example.com")
    body = client.get(f"/trips/{_tokyo(client)}/weather-helper").json()
    assert body["forecast"] == {"status": "unavailable", "days": []}
    assert body["typical"]["month"] == 11
    assert body["typical"]["as_of"] == "2026-10-01"


def test_a_stranger_gets_not_found(sign_in_as, overrides):
    owner = sign_in_as("a@example.com")
    tid = _tokyo(owner)
    other = sign_in_as("b@example.com")
    assert other.get(f"/trips/{tid}/currency-helper").status_code == 404
    assert other.get(f"/trips/{tid}/weather-helper").status_code == 404
