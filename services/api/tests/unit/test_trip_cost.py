from datetime import date
from decimal import Decimal

from app.trips.cost import FxRate, summarise_cost
from app.trips.rates import InMemoryRates
from app.trips.store import ChosenOption, Trip

RATES = InMemoryRates({("USD", "EUR"): Decimal("0.92")})


def opt(id: str, price, currency: str | None = "EUR", category: str = "Stays") -> ChosenOption:
    return ChosenOption(
        id=id,
        title=id,
        category=category,
        date=date(2027, 3, 3),
        price=None if price is None else Decimal(str(price)),
        currency=currency,
    )


def trip(options, budget=None, needed=()) -> Trip:
    return Trip(id="t1", name="Lisbon", budget=budget, options=options, needed_categories=list(needed))


def test_total_sums_chosen_priced_options():
    cost = summarise_cost(trip([opt("o1", 120), opt("o2", 80)]), RATES)
    assert cost.total == 200 and cost.currency == "EUR"


def test_over_budget_by_the_excess():
    assert summarise_cost(trip([opt("o1", 200)], budget=150), RATES).over_budget_by == 50


def test_not_over_budget_when_under_or_equal_or_unset():
    for budget in (250, 200, None):
        assert summarise_cost(trip([opt("o1", 200)], budget=budget), RATES).over_budget_by == 0


def test_missing_categories_are_needed_ones_without_a_chosen_option():
    cost = summarise_cost(
        trip([opt("o1", 1)], needed=["Stays", "Conveyance", "Dining"]), RATES
    )
    assert cost.missing_categories == ["Conveyance", "Dining"]


def test_no_missing_categories_when_all_chosen_ignoring_case():
    options = [opt("a", 1, category="stays"), opt("b", 1, category="CONVEYANCE"), opt("c", 1, category="Dining")]
    cost = summarise_cost(trip(options, needed=["Stays", "Conveyance", "Dining"]), RATES)
    assert cost.missing_categories == []


def test_unpriced_option_is_left_out_and_counted():
    cost = summarise_cost(trip([opt("o1", None, None), opt("o2", 80)]), RATES)
    assert cost.total == 80 and cost.unpriced_count == 1


def test_foreign_price_is_converted_and_rate_returned():
    cost = summarise_cost(trip([opt("o1", 100, "USD"), opt("o2", 108)]), RATES)
    assert cost.total == 200 and cost.unconvertible_count == 0
    assert cost.rates == [FxRate(currency="USD", rate=0.92)]


def test_unknown_currency_is_excluded_and_counted():
    cost = summarise_cost(trip([opt("o1", 100, "JPY"), opt("o2", 80)]), RATES)
    assert cost.total == 80 and cost.unconvertible_count == 1 and cost.rates == []


def test_rounds_half_up_once_at_the_end():
    cost = summarise_cost(trip([opt("o1", "0.01", "USD"), opt("o2", "0.01", "USD")]), RATES)
    assert cost.total == 0.02  # 0.0184 rounded once, not 0.01 + 0.01
