from datetime import date
from decimal import Decimal

from app.trips.cost import summarise_cost
from app.trips.inclusions import ESTIMATES_NOTE, STANDARD_EXCLUSIONS, build_money
from app.trips.rates import InMemoryRates
from app.trips.store import ChosenOption, ChosenStay, Stay, TransportPick, Trip

START, END = date(2026, 11, 14), date(2026, 11, 16)
TODAY = date(2026, 10, 31)
RATES = InMemoryRates({("USD", "EUR"): Decimal("0.92")})


def _trip(**changes) -> Trip:
    fields = {"id": "t1", "name": "Lisbon", "start_date": START, "end_date": END, "currency": "EUR"}
    return Trip(**{**fields, **changes})


def _chosen(url="https://stays.example.com/x", currency="EUR", total="300") -> ChosenStay:
    return ChosenStay(
        property_id="p1", name="Alfama Loft", provider="Web", url=url, total=Decimal(total), currency=currency
    )


def _stay(chosen=None, start=START, end=END, id="s1", place="Alfama") -> Stay:
    return Stay(id=id, place=place, start_date=start, end_date=end, chosen=chosen)


def _transport(currency="EUR", fare="30") -> TransportPick:
    return TransportPick(
        leg="destination", option_id="o1", mode="train", provider="CP", origin="Porto", destination="Lisbon",
        date=START, fare=Decimal(fare), picked_fare=Decimal(fare), currency=currency, url="https://cp.example.com/t",
    )


def _option(price="120", currency=None, title="Day trip", category="tours") -> ChosenOption:
    return ChosenOption(
        id="x1", title=title, category=category, date=START, price=None if price is None else Decimal(price),
        currency=currency,
    )


def test_every_chosen_item_is_a_booking_row():
    money = build_money(_trip(stays=[_stay(_chosen())], transport=[_transport()]), RATES, TODAY)
    assert {r.kind for r in money.bookings} == {"stay", "transport"}


def test_row_carries_provider_dates_price_currency_status_and_link():
    row = build_money(_trip(stays=[_stay(_chosen())]), RATES, TODAY).bookings[0]
    assert (row.provider, row.start_date, row.end_date) == ("Web", START, END)
    assert (row.price, row.currency, row.status) == (300.0, "EUR", "confirmed")
    assert row.link_url == "https://stays.example.com/x"


def test_non_http_link_is_dropped():
    row = build_money(_trip(stays=[_stay(_chosen("local://booking/abc"))]), RATES, TODAY).bookings[0]
    assert row.link_url is None


def test_included_lists_chosen_priced_items_never_unchosen():
    money = build_money(_trip(stays=[_stay(_chosen()), _stay(id="s2", place="Sintra tour")]), RATES, TODAY)
    assert [r.name for r in money.included] == ["Alfama Loft"]
    assert "Sintra tour" not in [r.name for r in money.included]


def test_unchosen_stay_is_not_included_with_add_path():
    money = build_money(_trip(stays=[_stay()]), RATES, TODAY)
    item = next(i for i in money.not_included if i.reason == "unchosen")
    assert item.name == "Alfama" and item.add_path == "/trips/t1/stays/s1/shortlist"
    assert money.bookings == []


def test_unchosen_needed_category_links_to_shortlists():
    money = build_money(_trip(needed_categories=["tours"]), RATES, TODAY)
    assert [(i.name, i.add_path) for i in money.not_included] == [("tours", "/trips/t1/shortlists")]


def test_needed_category_with_a_chosen_option_is_not_unchosen():
    assert build_money(_trip(needed_categories=["Tours"], options=[_option()]), RATES, TODAY).not_included == []


def test_unchosen_essentials_are_never_listed():
    money = build_money(_trip(needed_categories=["SIM", "insurance", "visa", "tours"]), RATES, TODAY)
    assert [i.name for i in money.not_included] == ["tours"]


def test_cost_has_each_currency_total_and_matches_summary():
    trip = _trip(stays=[_stay(_chosen(total="330"))], options=[_option(price="120", currency="USD")])
    money = build_money(trip, RATES, TODAY)
    assert money.cost.currency == "EUR"
    assert {(t.currency, t.total) for t in money.cost.by_currency} == {("EUR", 330.0), ("USD", 120.0)}
    assert money.cost.total == summarise_cost(trip, RATES).total


def test_no_conversion_when_everything_is_in_the_trip_currency():
    assert build_money(_trip(stays=[_stay(_chosen())]), RATES, TODAY).cost.conversions == []


def test_conversion_has_rate_and_rate_date():
    money = build_money(_trip(options=[_option(currency="USD")]), RATES, TODAY)
    conv = money.cost.conversions[0]
    assert (conv.currency, conv.rate, conv.rate_date) == ("USD", 0.92, TODAY)


def test_currency_without_a_rate_has_no_conversion():
    assert build_money(_trip(options=[_option(currency="JPY")]), RATES, TODAY).cost.conversions == []


def test_unpriced_chosen_item_is_not_included_and_marked_unpriced():
    money = build_money(_trip(options=[_option(price=None, title="Day trip")]), RATES, TODAY)
    assert [(i.name, i.reason) for i in money.not_included if i.reason == "unpriced"] == [("Day trip", "unpriced")]
    assert "Day trip" not in [r.name for r in money.included]
    assert [r.name for r in money.bookings] == ["Day trip"]


def test_standard_exclusions_and_estimates_note():
    money = build_money(_trip(), RATES, TODAY)
    assert money.standard_exclusions == list(STANDARD_EXCLUSIONS)
    assert money.standard_exclusions[0] == "Flights to and from the destination"
    assert money.cost.estimates_note == ESTIMATES_NOTE == "Prices are estimates and may change before you pay."


def test_stay_outside_trip_dates_keeps_its_dates_and_is_flagged():
    stay = _stay(_chosen(), start=date(2026, 11, 15), end=date(2026, 11, 20))
    row = build_money(_trip(stays=[stay]), RATES, TODAY).bookings[0]
    assert (row.start_date, row.end_date) == (date(2026, 11, 15), date(2026, 11, 20))
    assert row.outside_trip is True


def test_stay_inside_trip_dates_is_not_flagged():
    assert build_money(_trip(stays=[_stay(_chosen())]), RATES, TODAY).bookings[0].outside_trip is False


def test_two_stays_two_rows():
    two = _trip(stays=[_stay(_chosen(), id="s1"), _stay(_chosen(), id="s2", place="Porto")])
    assert [r.kind for r in build_money(two, RATES, TODAY).bookings] == ["stay", "stay"]
