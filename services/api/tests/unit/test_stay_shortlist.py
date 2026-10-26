from datetime import UTC, datetime
from decimal import Decimal

from app.stays.options import Offer, Property, StayCriteria
from app.stays.shortlist import SHORTLIST_SIZE, rank_properties

FIXED = datetime(2026, 1, 1, 10, 42, tzinfo=UTC)


def _prop(name, nightly, amenities=(), stars=3, nights=4):
    price = Decimal(nightly)
    offer = Offer(
        provider="Booknest",
        price_per_night=price,
        total=price * nights,
        currency="EUR",
        fetched_at=FIXED,
        url="https://example.com",
    )
    return Property(
        id=name.lower().replace(" ", "-"),
        name=name,
        property_type="hotel",
        rooms=1,
        stars=stars,
        area="Baixa",
        amenities=list(amenities),
        nearby=False,
        offers=[offer],
        price_min=price,
        price_max=price,
    )


def _criteria(**kw):
    return StayCriteria(property_type="hotel", rooms=1, **kw)


def _three():
    return [
        _prop("Cheap Weak", 50),
        _prop("Mid Fit", 80, ["pool", "wifi"]),
        _prop("Dear Offers", 150, ["ac", "parking", "breakfast", "wifi"]),
    ]


def test_ordered_by_a_blend_of_price_fit_and_offers():
    c = _criteria(amenities=["pool", "wifi"])
    out = rank_properties(_three(), c, nights=4)
    assert [s.property.name for s in out] == ["Mid Fit", "Cheap Weak", "Dear Offers"]
    assert [s.rank for s in out] == [1, 2, 3]
    assert out[0].total == Decimal(320) and out[0].fit == 100


def test_weights_are_not_swapped_cheaper_wins_on_equal_fit_and_offers():
    c = _criteria(amenities=["wifi"])
    cheap, dear = _prop("Cheap", 60, ["wifi"]), _prop("Dear", 90, ["wifi"])
    assert rank_properties([dear, cheap], c, 4)[0].property.name == "Cheap"


def test_every_budget_fitting_stay_precedes_every_over_budget_one():
    props = [
        _prop("Fits Low", 100, [], stars=3),
        _prop("Fits Mid", 130, [], stars=3),
        _prop("Over Rich", 200, ["wifi", "pool", "ac", "parking", "breakfast"], stars=5),
    ]
    c = _criteria(max_price=Decimal("137.5"), stars=[5])
    out = rank_properties(props, c, nights=4)
    flags = [s.fits_budget for s in out]
    assert flags == sorted(flags, reverse=True)
    assert out[-1].property.name == "Over Rich"
    assert out[-1].over_budget_by == out[-1].total - Decimal("550")
    assert all(s.over_budget_by == 0 for s in out if s.fits_budget)


def test_no_budget_means_every_stay_fits():
    out = rank_properties(_three(), _criteria(), nights=4)
    assert all(s.fits_budget and s.over_budget_by == 0 for s in out)


def test_each_stay_has_a_reason_following_the_rules():
    out = rank_properties(_three(), _criteria(amenities=["pool", "wifi"]), nights=4)
    assert out[0].reason == "Best overall"
    assert all(s.reason and s.why for s in out)
    assert next(s for s in out[1:] if s.property.name == "Cheap Weak").reason == "Best price"


def test_cut_to_the_shortlist_size_and_empty_input():
    props = [_prop(f"Stay {n}", 50 + n * 10, ["wifi"]) for n in range(7)]
    out = rank_properties(props, _criteria(), nights=4)
    assert len(out) == SHORTLIST_SIZE == 5
    assert [s.rank for s in out] == [1, 2, 3, 4, 5]
    assert rank_properties([], _criteria(), 4) == []
