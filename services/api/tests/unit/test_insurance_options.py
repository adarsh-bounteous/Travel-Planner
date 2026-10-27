from datetime import UTC, datetime
from decimal import Decimal

from app.insurance.options import AgeRate, InsurancePlan, ProviderPlan, gather_insurance
from app.trips.rates import InMemoryRates
from app.trips.store import Trip, Traveller

NOW = datetime(2026, 1, 1, 10, 42, tzinfo=UTC)
RATES = InMemoryRates({})


class Fake:
    def __init__(self, plans, name="Fake", source="partner"):
        self.name = name
        self.source = source
        self._plans = plans

    def fetch(self, destination):
        return list(self._plans)


def _plan(
    plan_id,
    provider="P",
    regions=("japan",),
    max_days=30,
    min_age=0,
    max_age=70,
    adventure="none",
    per_day=10,
    offer=None,
    commission=Decimal(0),
    name=None,
):
    return ProviderPlan(
        plan_id=plan_id,
        name=name or plan_id.title(),
        provider=provider,
        regions=list(regions),
        max_days=max_days,
        min_age=min_age,
        max_age=max_age,
        adventure=adventure,
        daily_rates=[AgeRate(min_age=0, max_age=60, per_day=Decimal(per_day)), AgeRate(min_age=61, max_age=120, per_day=Decimal(per_day) * 2)],
        currency="EUR",
        offer=offer,
        commission=commission,
        url=f"https://{plan_id}.example/plan",
        fetched_at=NOW,
    )


def _trip(dest="Japan", start="2027-03-12", end="2027-03-21", owner_age=34, travellers=(("Marco", 61),), risky=True, count=None):
    named = [Traveller(id=f"t{i}", name=n, age=a) for i, (n, a) in enumerate(travellers)]
    return Trip(
        id="t1",
        name="Trip",
        destination=dest,
        start_date=start,
        end_date=end,
        owner_age=owner_age,
        risky_activities=risky,
        travellers=named,
        traveller_count=count if count is not None else 1 + len(named),
    )


PLANS = [
    _plan("pilot", provider="Pilot", max_days=12, max_age=65),
    _plan("meridian", provider="Meridian", regions=("worldwide",), max_days=45, max_age=80),
    _plan("globetrek", provider="Globetrek", adventure="full", per_day=Decimal("38.4")),
    _plan("asia-pacific", provider="Asia Pacific", max_days=14, max_age=75, adventure="limited"),
    _plan("elsewhere", provider="Elsewhere", regions=("lisbon",)),
    _plan("short", provider="Short", max_days=5),
    _plan("young", provider="Young", max_age=40),
]


def _ids(plans, **trip):
    return [p.plan_id for p in gather_insurance([Fake(plans)], _trip(**trip), RATES).plans]


def test_lists_plans_suited_to_the_trip():
    out = gather_insurance([Fake(PLANS)], _trip(), RATES)
    assert [p.plan_id for p in out.plans] == ["globetrek", "asia-pacific", "meridian", "pilot"]
    assert out.days == 10 and out.missing == []
    assert [p.rank for p in out.plans] == [1, 2, 3, 4]


def test_drops_plans_that_do_not_cover_destination_length_or_age():
    ids = _ids(PLANS)
    assert "elsewhere" not in ids  # other region
    assert "short" not in ids  # max_days below the 10-day trip
    assert "young" not in ids  # excludes Marco (61)


def test_orders_by_fit_to_destination_length_age_and_risky_answer():
    yes = gather_insurance([Fake(PLANS)], _trip(risky=True), RATES)
    no = gather_insurance([Fake(PLANS)], _trip(risky=False), RATES)
    assert yes.plans[0].plan_id == "globetrek"
    assert yes.plans[0].fit > yes.plans[1].fit
    plain = _plan("plain", provider="Plain", max_age=80)  # no adventure cover, otherwise the best fit
    assert _ids([*PLANS, plain], risky=False)[0] == "plain"
    assert _ids([*PLANS, plain], risky=True)[0] == "globetrek"
    assert _ids([*PLANS, plain], risky=True) != _ids([*PLANS, plain], risky=False)


def test_each_travellers_price_and_group_total():
    plan = gather_insurance([Fake(PLANS)], _trip(), RATES).plans[0]
    assert [(t.label, t.age, t.price) for t in plan.traveller_prices] == [
        ("You", 34, Decimal("384.0")),
        ("Marco", 61, Decimal("768.0")),
    ]
    assert plan.group_total == sum(t.price for t in plan.traveller_prices)
    assert plan.currency == "EUR" and plan.url == "https://globetrek.example/plan"


def test_equal_fit_is_not_reordered_by_price_or_offer():
    def order(per_day, offers):
        a = _plan("a-plan", provider="A", per_day=per_day[0], offer=offers[0])
        b = _plan("b-plan", provider="B", per_day=per_day[1], offer=offers[1])
        return _ids([b, a])

    assert order((900, 1), (None, "50% off")) == ["a-plan", "b-plan"]
    assert order((1, 900), ("50% off", None)) == ["a-plan", "b-plan"]


def test_commission_never_changes_the_order():
    lo = _plan("x", provider="A", commission=Decimal(0))
    hi = _plan("y", provider="B", commission=Decimal(99))
    flipped = [lo.model_copy(update={"commission": Decimal(99)}), hi.model_copy(update={"commission": Decimal(0)})]
    assert _ids([lo, hi]) == _ids(flipped) == ["x", "y"]
    assert "commission" not in InsurancePlan.model_fields


def test_each_plan_has_a_one_line_reason_and_notes_equal_fit():
    out = gather_insurance([Fake(PLANS)], _trip(), RATES)
    assert all(p.reason and "\n" not in p.reason for p in out.plans)
    assert out.plans[0].reason == "Covers Japan, trips up to 30 days, ages up to 70, with adventure sports."
    tied = gather_insurance([Fake([_plan("a", provider="A"), _plan("b", provider="B")])], _trip(), RATES).plans
    assert tied[1].reason.endswith("Equal fit to A; listed after it by provider name.")
    assert "Equal fit" not in tied[0].reason


def test_no_matching_plan_is_an_empty_list():
    out = gather_insurance([Fake([_plan("e", regions=("lisbon",))])], _trip(), RATES)
    assert out.plans == [] and out.missing == []


def test_missing_details_name_each_gap_and_list_no_plans():
    out = gather_insurance([Fake(PLANS)], _trip(owner_age=None, risky=None, travellers=(("Marco", None),), count=3), RATES)
    assert out.plans == []
    assert len(out.missing) == 4
    assert any("Marco" in m for m in out.missing)


def test_failing_provider_is_skipped():
    class Broken:
        name = "Broken"
        source = "partner"

        def fetch(self, destination):
            raise RuntimeError("down")

    out = gather_insurance([Broken(), Fake(PLANS)], _trip(), RATES)
    assert len(out.plans) == 4


def test_documents_without_the_new_keys_still_load():
    trip = Trip.model_validate({"id": "t1", "name": "Old", "travellers": [{"id": "x", "name": "Ana"}]})
    assert trip.insurance is None and trip.risky_activities is None and trip.owner_age is None
    assert trip.travellers[0].age is None
