from datetime import date
from decimal import Decimal

from app.trips.money import build_money
from app.trips.rates import InMemoryRates
from app.trips.store import ChosenOption, ChosenStay, RestaurantPick, Stay, TransportPick, Trip, TripPlace

START, END = date(2026, 11, 14), date(2026, 11, 16)
TODAY = date(2026, 10, 28)
RATES = InMemoryRates({("EUR", "USD"): Decimal("1.08")})


def _trip(**changes) -> Trip:
    fields = {"id": "t1", "name": "Lisbon", "start_date": START, "end_date": END, "currency": "USD"}
    return Trip(**{**fields, **changes})


def _chosen(currency="EUR", url="https://stays.example.com/x") -> ChosenStay:
    return ChosenStay(
        property_id="p1", name="Alfama Loft", provider="Web", url=url, total=Decimal("300"), currency=currency
    )


def _stay(chosen=None, start=START, end=END) -> Stay:
    return Stay(id="s1", place="Alfama", start_date=start, end_date=end, chosen=chosen)


def _transport() -> TransportPick:
    return TransportPick(
        leg="destination", option_id="o1", mode="train", provider="CP", origin="Porto", destination="Lisbon",
        date=START, fare=Decimal("20"), picked_fare=Decimal("20"), currency="USD", url="https://cp.example.com/t",
    )


def _option(price=Decimal("120"), currency="USD", title="Walking tour", category="Tours") -> ChosenOption:
    return ChosenOption(id="x1", title=title, category=category, date=START, price=price, currency=currency)


def test_bookings_lists_each_chosen_item():
    m = build_money(_trip(stays=[_stay(_chosen())], transport=[_transport()], options=[_option()]), RATES, TODAY)
    assert [b.kind for b in m.bookings] == ["stay", "transport", "option"]


def test_booking_row_carries_provider_dates_price_status_link():
    b = build_money(_trip(stays=[_stay(_chosen())]), RATES, TODAY).bookings[0]
    assert (b.provider, b.start_date, b.end_date) == ("Web", START, END)
    assert (b.price, b.currency, b.link_url) == (Decimal("300"), "EUR", "https://stays.example.com/x")
    assert b.status


def test_restaurant_price_is_per_traveller():
    pick = RestaurantPick(
        id="r1", name="Cervejaria", city="Lisbon", cuisine="Seafood", typical_price=Decimal("25"), currency="USD"
    )
    b = build_money(_trip(restaurants=[pick], traveller_count=2), RATES, TODAY).bookings[0]
    assert (b.kind, b.price, b.start_date) == ("restaurant", Decimal("50"), None)


def test_included_lists_priced_chosen_items_only():
    m = build_money(_trip(stays=[_stay(_chosen())], places=[TripPlace(id="a", place_id="p", name="Sintra")]), RATES, TODAY)
    assert [i.name for i in m.included] == ["Alfama Loft"]
    assert "Sintra" not in [i.name for i in m.included]


def test_unchosen_place_is_not_included_with_add_link():
    m = build_money(_trip(places=[TripPlace(id="a", place_id="p", name="Sintra")]), RATES, TODAY)
    n = next(n for n in m.not_included if n.name == "Sintra")
    assert n.reason == "unchosen" and n.add_url == "/trips/t1/activity-options"


def test_unpriced_chosen_item_is_not_included_and_marked():
    m = build_money(_trip(options=[_option(price=None)]), RATES, TODAY)
    assert ("Walking tour", "unpriced") in [(n.name, n.reason) for n in m.not_included]
    assert "Walking tour" not in [i.name for i in m.included]


def test_unchosen_items_come_before_unpriced():
    m = build_money(_trip(options=[_option(price=None)], needed_categories=["Dining"]), RATES, TODAY)
    assert [n.reason for n in m.not_included] == ["unchosen", "unpriced"]


def test_standard_exclusions():
    m = build_money(_trip(), RATES, TODAY)
    assert m.standard_exclusions[0] == "Flights to and from the destination"
    assert len(m.standard_exclusions) == 5


def test_unchosen_essentials_are_not_listed():
    m = build_money(_trip(needed_categories=["Insurance", "Tours"]), RATES, TODAY)
    assert [n.name for n in m.not_included if n.reason == "unchosen"] == ["Tours"]


def test_needed_category_with_a_chosen_option_is_not_unchosen():
    m = build_money(_trip(needed_categories=["tours"], options=[_option()]), RATES, TODAY)
    assert [n for n in m.not_included if n.reason == "unchosen"] == []


def test_unchosen_stay_is_never_listed():
    m = build_money(_trip(stays=[_stay()]), RATES, TODAY)
    assert m.not_included == [] and m.bookings == []


def test_cost_shows_each_total_with_currency():
    m = build_money(_trip(stays=[_stay(_chosen())], options=[_option()]), RATES, TODAY)
    assert [(s.currency, s.amount) for s in m.cost.subtotals] == [("EUR", Decimal("300")), ("USD", Decimal("120"))]
    assert m.cost.currency == "USD"
    assert m.cost.total == Decimal("444.00")  # 300 * 1.08 + 120


def test_no_conversion_when_all_in_trip_currency():
    m = build_money(_trip(options=[_option()]), RATES, TODAY)
    assert m.cost.conversions == []


def test_conversion_has_rate_and_date():
    m = build_money(_trip(stays=[_stay(_chosen())]), RATES, TODAY)
    assert [(c.currency, c.rate, c.rate_date) for c in m.cost.conversions] == [("EUR", Decimal("1.08"), TODAY)]


def test_missing_rate_is_counted_not_converted():
    m = build_money(_trip(stays=[_stay(_chosen("JPY"))]), RATES, TODAY)
    assert m.cost.conversions == [] and m.cost.unconvertible_count == 1 and m.cost.total == Decimal("0.00")


def test_estimates_note():
    assert build_money(_trip(), RATES, TODAY).cost.estimates_note == "Prices are estimates and may change before you pay."


def test_stay_outside_trip_dates_is_shown_and_flagged():
    stay = _stay(_chosen(), start=date(2026, 11, 15), end=date(2026, 11, 20))
    b = build_money(_trip(stays=[stay]), RATES, TODAY).bookings[0]
    assert (b.start_date, b.end_date) == (date(2026, 11, 15), date(2026, 11, 20))
    assert b.outside_trip_dates is True


def test_stay_inside_trip_dates_is_not_flagged():
    assert build_money(_trip(stays=[_stay(_chosen())]), RATES, TODAY).bookings[0].outside_trip_dates is False


def test_two_stays_two_rows():
    two = _trip(
        stays=[
            _stay(_chosen(), start=START, end=date(2026, 11, 15)),
            Stay(id="s2", place="Porto", start_date=date(2026, 11, 15), end_date=END, chosen=_chosen()),
        ]
    )
    assert [b.kind for b in build_money(two, RATES, TODAY).bookings] == ["stay", "stay"]
