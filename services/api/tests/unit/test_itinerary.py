from datetime import date
from decimal import Decimal

from app.trips.itinerary import Itinerary, ItineraryItem, build_itinerary
from app.trips.rates import InMemoryRates
from app.trips.store import (
    Activity,
    ChosenStay,
    Day,
    Reminder,
    RestaurantPick,
    Stay,
    Trip,
    TransportPick,
    TripPlace,
)

START, END = date(2026, 11, 14), date(2026, 11, 16)


def _build(trip: Trip) -> Itinerary:
    return build_itinerary(trip, InMemoryRates({}), date(2026, 10, 28))


def _trip(**changes) -> Trip:
    fields = {
        "id": "t1",
        "name": "Lisbon & Porto in November",
        "destination": "Lisbon, Portugal",
        "start_date": START,
        "end_date": END,
        "days": [Day(date=date(2026, 11, 14 + i), name=f"Day {i + 1}") for i in range(3)],
    }
    return Trip(**{**fields, **changes})


def _chosen(url="https://stays.example.com/x") -> ChosenStay:
    return ChosenStay(
        property_id="p1", name="Alfama Loft", provider="Web", url=url, total=Decimal("300"), currency="EUR"
    )


def _stay(chosen=None, start=START, end=END) -> Stay:
    return Stay(id="s1", place="Alfama Loft", start_date=start, end_date=end, chosen=chosen)


def _transport(day=START) -> TransportPick:
    return TransportPick(
        leg="destination",
        option_id="o1",
        mode="train",
        provider="CP",
        origin="Porto",
        destination="Lisbon",
        date=day,
        fare=Decimal("30"),
        picked_fare=Decimal("30"),
        currency="EUR",
        url="https://cp.example.com/t",
    )


def _restaurant(day=None, meal=None) -> RestaurantPick:
    return RestaurantPick(
        id="r1",
        name="Cervejaria",
        city="Lisbon",
        cuisine="Seafood",
        typical_price=Decimal("25"),
        currency="EUR",
        date=day,
        meal=meal,
    )


def test_each_trip_day_is_listed_once_in_date_order():
    it = _build(_trip())
    assert [d.date for d in it.days] == [date(2026, 11, 14), date(2026, 11, 15), date(2026, 11, 16)]
    assert [d.number for d in it.days] == [1, 2, 3]


def test_days_come_from_the_dates_when_none_are_stored():
    it = _build(_trip(days=[]))
    assert [d.number for d in it.days] == [1, 2, 3]


def test_a_trip_without_dates_has_no_days():
    it = _build(Trip(id="t", name="Open"))
    assert it.days == [] and it.cover.start_date is None


def test_a_day_with_nothing_planned_has_no_items():
    assert all(d.items == [] for d in _build(_trip()).days)
    assert _build(_trip()).glance.booked == 0


def test_undated_and_out_of_range_items_are_still_to_schedule():
    trip = _trip(
        restaurants=[_restaurant()],
        places=[TripPlace(id="pl1", place_id="tram", name="Tram 28")],
        activities=[Activity(id="a1", name="Late walk", date=date(2026, 12, 1))],
    )
    it = _build(trip)
    assert {i.title for i in it.still_to_schedule} == {"Cervejaria", "Tram 28", "Late walk"}
    assert all(d.items == [] for d in it.days)


def test_cover_has_name_dates_and_destinations():
    cover = _build(_trip()).cover
    assert cover.name == "Lisbon & Porto in November"
    assert cover.destinations == ["Lisbon, Portugal"]
    assert (cover.start_date, cover.end_date) == (START, END)


def test_glance_counts_booked_and_unbooked():
    trip = _trip(
        stays=[_stay(_chosen())],
        transport=[_transport()],
        activities=[Activity(id="a1", name="Walk", date=START)],
        restaurants=[_restaurant(date(2026, 11, 15), "dinner")],
    )
    glance = _build(trip).glance
    assert (glance.booked, glance.unbooked) == (4, 2)


def test_a_stay_without_a_chosen_offer_is_unbooked():
    it = _build(_trip(stays=[_stay()]))
    assert (it.glance.booked, it.glance.unbooked) == (0, 3)


def test_one_day_lists_all_seven_kinds_in_order():
    trip = _trip(
        stays=[_stay(_chosen(), end=START)],
        transport=[_transport()],
        activities=[Activity(id="a1", name="Walk", date=START)],
        restaurants=[_restaurant(START, "dinner")],
        reminders=[Reminder(id="m1", text="Lisboa Card", date=START)],
    )
    items = _build(trip).days[0].items
    assert [i.kind for i in items] == [
        "stay",
        "check_in",
        "check_out",
        "transport",
        "activity",
        "meal",
        "reminder",
    ]
    assert items[-1].status is None


def test_check_in_is_on_the_start_and_check_out_on_the_end():
    it = _build(_trip(stays=[_stay(_chosen())]))
    assert [i.kind for i in it.days[0].items] == ["stay", "check_in"]
    assert [i.kind for i in it.days[2].items] == ["check_out"]


def test_links_are_http_only():
    https = _build(_trip(stays=[_stay(_chosen())])).days[0].items[0]
    assert https.link_url == "https://stays.example.com/x"
    local = _build(_trip(stays=[_stay(_chosen("local://booking/abc"))])).days[0].items[0]
    assert local.link_url is None and local.link_text is None


def test_the_model_carries_no_essentials_or_sharing_field():
    assert set(Itinerary.model_fields) == {"cover", "glance", "days", "still_to_schedule", "money"}
    assert set(ItineraryItem.model_fields) == {
        "kind",
        "title",
        "detail",
        "status",
        "link_text",
        "link_url",
    }
