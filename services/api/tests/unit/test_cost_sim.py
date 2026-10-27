from datetime import date
from decimal import Decimal

import pytest

from app.trips.cost import FxRate, summarise_cost
from app.trips.rates import InMemoryRates
from app.trips.store import ChosenSim, Trip

RATES = InMemoryRates({("GBP", "EUR"): Decimal("1.2")})


def chosen(price="14.50", currency="EUR") -> ChosenSim:
    return ChosenSim(
        option_id="roamly-europe-10",
        name="Roamly Europe 10 GB",
        provider="Web search",
        sim_type="esim",
        valid_from=date(2027, 3, 1),
        valid_to=date(2027, 3, 31),
        data_gb=Decimal(10),
        price=Decimal(price),
        currency=currency,
        url="https://roamly.example/roamly-europe-10",
    )


def trip(sim=None, traveller_count=2) -> Trip:
    return Trip(id="t", name="T", currency="EUR", traveller_count=traveller_count, sim=sim)


def test_total_includes_the_pick_for_every_traveller():
    before = summarise_cost(trip(), RATES).total
    after = summarise_cost(trip(chosen()), RATES).total
    assert after - before == pytest.approx(29.00)


def test_one_traveller_when_count_unset():
    assert summarise_cost(trip(chosen(), traveller_count=None), RATES).total == 14.5


def test_foreign_currency_is_converted_and_listed():
    out = summarise_cost(trip(chosen("10", "GBP")), RATES)
    assert out.total == 24.0
    assert out.rates == [FxRate(currency="GBP", rate=1.2)]


def test_unconvertible_pick_is_counted_not_added():
    out = summarise_cost(trip(chosen("10", "XYZ")), RATES)
    assert out.total == 0.0 and out.unconvertible_count == 1
