from datetime import UTC, datetime
from decimal import Decimal

from app.attractions.options import ProviderActivity, gather_activities
from app.attractions.providers import SEED_CATALOGUES, InMemoryActivityProvider
from app.trips.rates import InMemoryRates
from app.trips.store import Trip

NOW = datetime(2026, 1, 1, 10, 42, tzinfo=UTC)
RATES = InMemoryRates({("USD", "EUR"): Decimal("0.92")})
PROVIDERS = [InMemoryActivityProvider(n, s, c, lambda: NOW) for n, (s, c) in SEED_CATALOGUES.items()]


def trip(interests=(), budget=None, traveller_count=None, currency="EUR"):
    return Trip(
        id="t1",
        name="Trip",
        country="Portugal",
        place="Lisbon",
        interests=list(interests),
        budget=budget,
        traveller_count=traveller_count,
        currency=currency,
    )


def activity(title="Thing", kind="tour", adult=80, currency="EUR", interests=("food",), child=None, offer=None):
    return ProviderActivity(
        title=title,
        kind=kind,
        interests=list(interests),
        provider="P",
        adult_price=Decimal(adult),
        child_price=None if child is None else Decimal(child),
        currency=currency,
        offer=offer,
        fetched_at=NOW,
        url="https://example.com/x",
    )


class Stub:
    def __init__(self, *activities, name="Stub", source="partner"):
        self.name = name
        self.source = source
        self._activities = list(activities)

    def fetch(self, place):
        return list(self._activities)


class Failing:
    name = "Broken"
    source = "partner"

    def fetch(self, place):
        raise RuntimeError("down")


def _one(out, title):
    return next(o for o in out.options if o.title == title)


def test_all_four_kinds_gathered():
    out = gather_activities(PROVIDERS, trip(), RATES)
    assert {"ticket", "tour", "day_trip", "experience"} <= {o.kind for o in out.options}


def test_both_source_kinds_present():
    out = gather_activities(PROVIDERS, trip(), RATES)
    assert {p.source for o in out.options for p in o.prices} == {"web_search", "partner"}


def test_provider_on_every_option_and_price():
    out = gather_activities(PROVIDERS, trip(), RATES)
    assert all(o.provider and all(p.provider for p in o.prices) for o in out.options)


def test_group_estimate_for_group_is_indicative():
    o = _one(gather_activities(PROVIDERS, trip(traveller_count=3), RATES), "Tile Museum")
    assert o.group_estimate == o.adult_price * 3 and o.group_estimate_indicative is True


def test_adult_and_child_price():
    o = _one(gather_activities(PROVIDERS, trip(), RATES), "Tile Museum")
    assert o.adult_price == Decimal("18") and o.child_price == Decimal("9")


def test_no_child_price_when_unknown():
    assert _one(gather_activities(PROVIDERS, trip(), RATES), "Sunset Sail").child_price is None


def test_offer_carried():
    assert _one(gather_activities(PROVIDERS, trip(), RATES), "Sintra Day Trip").offer == "10% off online"


def test_no_interest_match_dropped():
    assert gather_activities(PROVIDERS, trip(interests=["skiing"]), RATES).options == []


def test_interest_match_is_case_folded():
    out = gather_activities([Stub(activity(interests=["Food"]))], trip(interests=["FOOD"]), RATES)
    assert len(out.options) == 1


def test_over_budget_dropped():
    assert gather_activities([Stub(activity(adult=150))], trip(budget=100, traveller_count=1), RATES).options == []


def test_under_budget_shown():
    assert len(gather_activities([Stub(activity(adult=80))], trip(budget=100, traveller_count=1), RATES).options) == 1


def test_estimate_equal_to_budget_shown():
    assert len(gather_activities([Stub(activity(adult=100))], trip(budget=100, traveller_count=1), RATES).options) == 1


def test_group_estimate_counts_against_budget():
    out = gather_activities([Stub(activity(adult=60))], trip(budget=100, traveller_count=2), RATES)
    assert out.options == []


def test_budget_compared_in_trip_currency():
    usd = Stub(activity(adult=100, currency="USD"))  # 92 EUR
    assert len(gather_activities([usd], trip(budget=95, traveller_count=1), RATES).options) == 1
    assert gather_activities([usd], trip(budget=90, traveller_count=1), RATES).options == []


def test_unknown_rate_excluded_when_budgeted():
    jpy = Stub(activity(adult=100, currency="JPY"))
    assert gather_activities([jpy], trip(budget=500, traveller_count=1), RATES).options == []


def test_free_sight_and_event_excluded():
    titles = {o.title for o in gather_activities(PROVIDERS, trip(), RATES).options}
    assert "Rossio Square" not in titles and "Midsummer Concert" not in titles


def test_differing_prices_merged_with_provider_and_date():
    o = _one(gather_activities(PROVIDERS, trip(), RATES), "Tile Museum")
    assert len(o.prices) == 2 and len({p.adult_price for p in o.prices}) == 2
    assert all(p.provider and p.fetched_at for p in o.prices)


def test_failing_provider_skipped():
    out = gather_activities([Failing(), Stub(activity())], trip(), RATES)
    assert len(out.options) == 1
