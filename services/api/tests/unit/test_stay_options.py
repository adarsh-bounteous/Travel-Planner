from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from app.stays.options import ProviderListing, StayCriteria, match_listings, merge_properties, search_stays
from app.trips.store import Stay

NOW = datetime(2026, 1, 1, 10, 42, tzinfo=UTC)
STAY = Stay(id="s1", place="Lisbon", start_date=date(2027, 1, 1), end_date=date(2027, 1, 5))


def listing(name="Hotel A", type_="hotel", rooms=1, stars=3, area="Baixa", amenities=(), price=100, nearby=False):
    return ProviderListing(
        property_name=name,
        property_type=type_,
        rooms=rooms,
        stars=stars,
        area=area,
        amenities=list(amenities),
        nearby=nearby,
        price_per_night=Decimal(price),
        currency="EUR",
        fetched_at=NOW,
        url="https://example.com/x",
    )


class Fake:
    def __init__(self, name, listings):
        self.name = name
        self._listings = listings

    def fetch(self, place, start, end):
        return list(self._listings)


class Failing:
    name = "Broken"

    def fetch(self, place, start, end):
        raise RuntimeError("down")


def search(providers, **kw):
    return search_stays(providers, STAY, StayCriteria(**{"property_type": "hotel", "rooms": 1, **kw}))


MIXED = [listing("A"), listing("B", type_="homestay"), listing("C", rooms=2), listing("D", type_="other", rooms=2)]


def test_type_and_rooms_always_apply():
    got = match_listings(MIXED, StayCriteria(property_type="hotel", rooms=1))
    assert {(g.property_type, g.rooms) for g in got} == {("hotel", 1)}


def test_price_range_whole_without_budget_and_capped_with_one():
    p = Fake("P", [listing("Cheap", price=60), listing("Mid", price=150), listing("Dear", price=250)])
    all_ = search([p])
    assert min(x.price_min for x in all_.properties) < 70 and max(x.price_max for x in all_.properties) > 200
    capped = search([p], max_price=Decimal(100))
    assert [x.name for x in capped.properties] == ["Cheap"]


def test_budget_uses_cheapest_offer_but_keeps_all_offers():
    a = Fake("A", [listing("X", price=90)])
    b = Fake("B", [listing("X", price=130)])
    got = search([a, b], max_price=Decimal(100))
    assert [len(p.offers) for p in got.properties] == [2]


CATALOGUE = [
    listing("Plain", stars=0, area="Graça"),
    listing("Pool Hotel", stars=4, amenities=["pool", "wifi"], area="Baixa"),
    listing("Star5", stars=5, amenities=["pool"], area="Belém"),
    listing("Wifi Only", stars=2, amenities=["wifi"], area="Estrela"),
]


@pytest.mark.parametrize(
    "kw,check",
    [
        ({"amenities": ["pool"]}, lambda p: "pool" in p.amenities),
        ({"stars": [4, 5]}, lambda p: p.stars in (4, 5)),
        ({"location": "baixa"}, lambda p: "baixa" in (p.area + p.name).lower()),
    ],
)
def test_each_optional_filter_narrows(kw, check):
    got = search([Fake("P", CATALOGUE)], **kw).properties
    assert got and len(got) < len(CATALOGUE)
    assert all(check(p) for p in got)


def test_all_amenities_required():
    got = search([Fake("P", CATALOGUE)], amenities=["pool", "wifi"]).properties
    assert [p.name for p in got] == ["Pool Hotel"]


def test_no_optional_filter_does_not_narrow():
    p = Fake("P", CATALOGUE)
    bare = search([p])
    explicit = search([p], location="", amenities=[], stars=[])
    assert bare == explicit
    assert "Plain" in [x.name for x in bare.properties] and len(bare.properties) == 4


def test_same_property_listed_once_with_offers_sorted_by_price():
    a = Fake("Booknest", [listing("Hotel Alfama Terrace", area="Alfama", price=118)])
    b = Fake("Staylink", [listing("  hotel alfama  terrace", area="ALFAMA", price=124)])
    got = search([b, a])
    assert [p.name for p in got.properties] == ["Hotel Alfama Terrace"]
    assert [o.provider for o in got.properties[0].offers] == ["Booknest", "Staylink"]
    assert got.properties[0].offers[0].total == Decimal(118 * 4)


def test_merge_properties_keeps_single_offer():
    assert len(merge_properties([("A", listing("X"))])[0].offers) == 1


def test_nearby_only_when_widened():
    p = Fake("P", [listing("Town", nearby=True), listing("Here")])
    assert [x.name for x in search([p]).properties] == ["Here"]
    assert {x.name for x in search([p], widen=True).properties} == {"Here", "Town"}


def test_failing_provider_is_skipped():
    got = search([Failing(), Fake("P", [listing("Here")])])
    assert len(got.properties) == 1


def test_nothing_matches_gives_empty_list():
    got = search([Fake("P", CATALOGUE)], stars=[1])
    assert got.properties == [] and got.price_min is None
