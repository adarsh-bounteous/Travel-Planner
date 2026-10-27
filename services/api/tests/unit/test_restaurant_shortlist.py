from datetime import date
from decimal import Decimal

from app.dining.options import DiningFilters, RestaurantOption, RestaurantOptions
from app.dining.shortlist import budget_per_person, build_shortlist, preference_labels
from app.trips.store import Trip


def _r(name, price, cuisine="Portuguese", style="Casual", currency="EUR"):
    return RestaurantOption(
        name=name,
        city="Lisbon",
        cuisine=cuisine,
        dining_style=style,
        price_level=2,
        typical_price=Decimal(price),
        currency=currency,
        suits=[],
    )


def _trip(budget=700, travellers=2, days=7):
    return Trip(
        id="t1",
        name="Trip",
        destination="Lisbon",
        budget=budget,
        traveller_count=travellers,
        start_date=date(2027, 1, 1),
        end_date=date(2027, 1, days),
        currency="EUR",
    )


def _options(*specs):
    return RestaurantOptions(place="Lisbon", options=[_r(*s) for s in specs])


def _names(out):
    return [e.restaurant.name for e in out.entries]


def test_every_matching_restaurant_is_an_entry():
    options = _options(("A", 10), ("B", 90), ("C", 20))
    out = build_shortlist(options, _trip(budget=700), DiningFilters(), [])
    assert sorted(_names(out)) == ["A", "B", "C"]


def test_fitting_restaurants_come_first():
    out = build_shortlist(_options(("Pricey", 68), ("Cheap", 10)), _trip(), DiningFilters(), [])
    assert _names(out) == ["Cheap", "Pricey"]
    assert [e.fits_budget for e in out.entries] == [True, False]
    assert [e.rank for e in out.entries] == [1, 2]


def test_more_preferences_met_first_within_a_group():
    f = DiningFilters(home_cuisine="Portuguese")
    out = build_shortlist(_options(("Zaytoon", 10, "Lebanese"), ("Casa", 12, "Portuguese")), _trip(budget=None), f, [])
    assert _names(out) == ["Casa", "Zaytoon"]
    assert out.entries[0].preferences_met == ["Portuguese cuisine"]
    assert out.entries[0].preferences_total == 1


def test_cheaper_first_when_fit_and_preferences_tie():
    out = build_shortlist(_options(("B", 12), ("A", 10)), _trip(), DiningFilters(), [])
    assert _names(out) == ["A", "B"]
    out = build_shortlist(_options(("B", 70), ("A", 60)), _trip(), DiningFilters(), [])
    assert _names(out) == ["A", "B"]
    assert [e.fits_budget for e in out.entries] == [False, False]


def test_preferences_beat_price_when_neither_fits():
    f = DiningFilters(home_cuisine="Portuguese")
    out = build_shortlist(_options(("Zaytoon", 60, "Lebanese"), ("Casa", 80, "Portuguese")), _trip(), f, [])
    assert _names(out) == ["Casa", "Zaytoon"]


def test_budget_per_person_and_missing_budget():
    assert budget_per_person(_trip()) == Decimal("12.50")
    assert budget_per_person(_trip(budget=None)) is None
    out = build_shortlist(_options(("A", 500)), _trip(budget=None), DiningFilters(), [])
    assert out.budget_per_person is None and out.entries[0].fits_budget is True


def test_other_currency_counts_as_fitting():
    options = RestaurantOptions(place="Lisbon", options=[_r("Tokyo", 9000, currency="JPY")])
    out = build_shortlist(options, _trip(), DiningFilters(), [])
    assert out.entries[0].fits_budget is True


def test_tastes_match_cuisine_or_style_case_insensitively():
    f = DiningFilters(home_cuisine="Portuguese")
    assert preference_labels(f, ["lebanese", "Casual"]) == ["Portuguese cuisine", "lebanese", "Casual"]
    out = build_shortlist(_options(("Z", 10, "Lebanese", "Fine dining")), _trip(), f, ["LEBANESE", "casual"])
    assert out.entries[0].preferences_met == ["LEBANESE"]
    assert out.entries[0].preferences_total == 3
