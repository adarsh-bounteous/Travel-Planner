from datetime import date
from decimal import Decimal

from app.sims.options import ProviderSim, covers_trip, gather_sims
from app.sims.providers import SEED_CATALOGUES, InMemorySimProvider
from app.trips.rates import InMemoryRates
from app.trips.store import Trip

RATES = InMemoryRates({("USD", "EUR"): Decimal("0.9")})
LABELS = ["You"]
EUROPE = ["Portugal", "Spain", "France"]


def trip(dest="Lisbon, Portugal", start=date(2027, 3, 12), end=date(2027, 3, 20), traveller_count=None, travellers=()):
    return Trip(
        id="t1",
        name="Trip",
        destination=dest,
        start_date=start,
        end_date=end,
        traveller_count=traveller_count,
        currency="EUR",
    )


def sim(name="A", sim_type="esim", countries=("Portugal",), valid_from=date(2027, 3, 1), valid_to=date(2027, 3, 31),
        data_gb=10, price=14, currency="EUR"):
    return ProviderSim(
        id=name, name=name, sim_type=sim_type, countries=list(countries), valid_from=valid_from, valid_to=valid_to,
        data_gb=Decimal(data_gb), price=Decimal(str(price)), currency=currency, url=f"https://example.com/{name}",
    )


class Stub:
    def __init__(self, name, source, sims):
        self.name, self.source, self._sims = name, source, sims

    def fetch(self, country):
        return list(self._sims)


class Failing:
    name = "Broken"
    source = "partner"

    def fetch(self, country):
        raise RuntimeError("down")


SEEDED = [InMemorySimProvider(n, s, c) for n, (s, c) in SEED_CATALOGUES.items()]


def test_shortlist_has_esim_and_physical_for_destination():
    out = gather_sims(SEEDED, trip(), LABELS, None, RATES)
    assert {o.sim_type for o in out.options} == {"esim", "physical"}


def test_seeded_options_without_preference_interleave_types():
    out = gather_sims(SEEDED, trip(), LABELS, None, RATES)
    assert [o.id for o in out.options] == ["nomad-europe-20", "atlas-europe-20", "roamly-europe-10", "lisboa-prepaid-15"]


def test_web_search_and_partner_options_both_present():
    providers = [Stub("w", "web_search", [sim("A")]), Stub("p", "partner", [sim("B")])]
    out = gather_sims(providers, trip(), LABELS, None, RATES)
    assert {o.source for o in out.options} == {"web_search", "partner"}


def test_option_not_covering_destination_is_not_listed():
    out = gather_sims([Stub("w", "web_search", [sim("Spain", countries=["Spain"])])], trip(), LABELS, None, RATES)
    assert out.options == []


def test_failing_provider_is_skipped():
    out = gather_sims([Failing(), Stub("w", "web_search", [sim("A")])], trip(), LABELS, None, RATES)
    assert [o.name for o in out.options] == ["A"]


def test_validity_must_cover_all_trip_dates():
    ok = sim("ok", valid_from=date(2027, 3, 12), valid_to=date(2027, 3, 20))
    short_end = sim("short", valid_from=date(2027, 3, 1), valid_to=date(2027, 3, 19))
    late_start = sim("late", valid_from=date(2027, 3, 13), valid_to=date(2027, 3, 31))
    out = gather_sims([Stub("w", "web_search", [ok, short_end, late_start])], trip(), LABELS, None, RATES)
    assert [o.name for o in out.options] == ["ok"]


def test_covers_trip_boundaries():
    t = trip()
    assert covers_trip(date(2027, 3, 12), date(2027, 3, 20), t)
    assert not covers_trip(date(2027, 3, 13), date(2027, 3, 20), t)
    assert not covers_trip(date(2027, 3, 12), date(2027, 3, 19), t)


def test_no_destination_or_dates_gives_no_options():
    assert gather_sims(SEEDED, trip(dest=None), LABELS, None, RATES).options == []
    assert gather_sims(SEEDED, trip(start=None, end=None), LABELS, None, RATES).options == []


def test_data_and_price_are_on_every_option():
    out = gather_sims([Stub("w", "web_search", [sim(data_gb=10, price="14.50")])], trip(), LABELS, None, RATES)
    assert out.options[0].data_gb == Decimal(10) and out.options[0].price == Decimal("14.50")


def _mixed():
    return [Stub("w", "web_search", [
        sim("phys", "physical", EUROPE, data_gb=50, price=5),
        sim("esim", "esim", ["Portugal"], data_gb=5, price=30),
    ])]


def test_esim_preference_ranks_esim_first_even_when_physical_is_better():
    out = gather_sims(_mixed(), trip(), LABELS, "esim", RATES)
    assert [o.sim_type for o in out.options] == ["esim", "physical"]


def test_physical_preference_ranks_physical_first():
    p = [Stub("w", "web_search", [sim("e", "esim", EUROPE, data_gb=50, price=5), sim("p", "physical", ["Portugal"], data_gb=5, price=30)])]
    out = gather_sims(p, trip(), LABELS, "physical", RATES)
    assert [o.sim_type for o in out.options] == ["physical", "esim"]


def test_no_preference_does_not_reorder_by_type():
    out = gather_sims(_mixed(), trip(), LABELS, None, RATES)
    assert [o.name for o in out.options] == ["phys", "esim"]  # coverage decides, not type


def test_no_preference_orders_by_coverage_then_data_then_price():
    c33 = [f"C{i}" for i in range(32)] + ["Portugal"]
    a = sim("a", countries=c33, data_gb=10, price=14)
    b = sim("b", countries=c33, data_gb=20, price=26)
    c = sim("c", countries=c33, data_gb=20, price=24)
    d = sim("d", countries=["Portugal"], data_gb=50, price=1)
    out = gather_sims([Stub("w", "web_search", [a, b, c, d])], trip(), LABELS, None, RATES)
    assert [o.name for o in out.options] == ["c", "b", "a", "d"]


def test_unconvertible_price_sorts_last_in_its_group():
    cheap_odd = sim("odd", currency="XYZ", price=1)
    dear = sim("dear", price=100)
    out = gather_sims([Stub("w", "web_search", [cheap_odd, dear])], trip(), LABELS, None, RATES)
    assert [o.name for o in out.options] == ["dear", "odd"]


def test_each_traveller_price_and_group_total():
    out = gather_sims([Stub("w", "web_search", [sim()])], trip(traveller_count=2), ["Ana", "Marco"], None, RATES)
    o = out.options[0]
    assert [(t.label, t.price) for t in o.traveller_prices] == [("Ana", o.price), ("Marco", o.price)]
    assert o.group_total == o.price * 2
