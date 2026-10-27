from decimal import Decimal

from app.trips.cost import summarise_cost
from app.trips.rates import InMemoryRates
from app.trips.store import RestaurantPick, Trip

RATES = InMemoryRates({("GBP", "EUR"): Decimal("1.2")})


def pick(name="Casa Lima", price="19", currency="EUR") -> RestaurantPick:
    return RestaurantPick(
        id=name,
        name=name,
        city="Lisbon",
        cuisine="Portuguese",
        typical_price=None if price is None else Decimal(price),
        currency=currency,
    )


def trip(picks, budget=None, traveller_count=2) -> Trip:
    return Trip(id="t", name="T", currency="EUR", budget=budget, traveller_count=traveller_count, restaurants=picks)


def test_estimate_is_price_times_group_size():
    out = summarise_cost(trip([pick(price="19")], traveller_count=3), RATES)
    assert out.restaurant_total == 57.0
    assert out.total == 57.0


def test_one_traveller_when_count_unset():
    assert summarise_cost(trip([pick()], traveller_count=None), RATES).restaurant_total == 19.0


def test_sum_of_several_picks():
    out = summarise_cost(trip([pick("A", "19"), pick("B", "22")]), RATES)
    assert out.restaurant_total == 82.0


def test_foreign_price_is_converted():
    out = summarise_cost(trip([pick(price="10", currency="GBP")]), RATES)
    assert out.restaurant_total == 24.0


def test_unpriced_pick_is_left_out_and_counted():
    out = summarise_cost(trip([pick("A", "19"), pick("B", None)]), RATES)
    assert out.restaurant_total == 38.0
    assert out.total == 38.0
    assert out.restaurant_unpriced_count == 1
    assert out.unpriced_count == 1


def test_unconvertible_pick_is_counted_not_added():
    out = summarise_cost(trip([pick(price="10", currency="XYZ")]), RATES)
    assert out.restaurant_total == 0.0 and out.unconvertible_count == 1


def test_over_budget_includes_restaurants():
    out = summarise_cost(trip([pick()], budget=30), RATES)
    assert out.over_budget_by == 8.0


def test_within_or_equal_to_budget_is_not_over():
    assert summarise_cost(trip([pick()], budget=38), RATES).over_budget_by == 0.0
    assert summarise_cost(trip([pick()], budget=100), RATES).over_budget_by == 0.0
