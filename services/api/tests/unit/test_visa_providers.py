from decimal import Decimal

from app.trips.rates import InMemoryRates
from app.trips.store import Trip
from app.trips.visa import OFFICIAL_SITES, Person, VisaResult
from app.visa_providers.options import NO_DATA_MESSAGE, SHORTLIST_SIZE, ProviderVisaService, gather_visa_providers

RATES = InMemoryRates({("EUR", "GBP"): Decimal("0.5")})


def trip(dest="Kyoto, Japan"):
    return Trip(id="t1", name="Trip", country=dest.rsplit(",", 1)[-1].strip(), place=dest.split(",")[0], currency="GBP")


def who(name="Ben", citizenship="India"):
    return Person(traveller_id=name.lower(), name=name, citizenship=citizenship, residence=citizenship)


def result(person, status="required", visa_type="tourist", marked=False):
    return VisaResult(
        traveller_id=person.traveller_id, name=person.name, citizenship=person.citizenship, residence=person.residence,
        status=status, message=None, confirm_note=None, official_site_url=None, visa_type=visa_type,
        marked_self_check=marked, unresolved=marked,
    )


def svc(id, fee=30, days=5, currency="GBP", types=("tourist",), nats=("India",), country="Japan", offers=None):
    return ProviderVisaService(
        id=id, name=id, destination_country=country, visa_types=list(types), nationalities=list(nats),
        fee=Decimal(str(fee)), currency=currency, processing_days=days, offers=offers, url=f"https://example.com/visa/{id}",
    )


class Stub:
    def __init__(self, source, services):
        self.name, self.source, self._services = f"stub-{source}", source, services

    def fetch(self, country):
        return list(self._services)


class Broken:
    name, source = "broken", "partner"

    def fetch(self, country):
        raise RuntimeError("down")


def gather(providers, person=None, status="required", dest="Kyoto, Japan", marked=False):
    person = person or who()
    return gather_visa_providers(providers, trip(dest), person, result(person, status, marked=marked), RATES)


def test_required_traveller_gets_a_shortlist_with_comparison_fields():
    view = gather([Stub("web_search", [svc("a", 25, 5, offers="Express option")])])
    assert view.outcome == "shortlist" and 1 <= len(view.providers) <= SHORTLIST_SIZE
    p = view.providers[0]
    assert (p.fee, p.currency, p.processing_days, p.offers, p.url) == (
        Decimal("25"), "GBP", 5, "Express option", "https://example.com/visa/a",
    )


def test_only_providers_handling_type_and_nationality_are_shown():
    services = [
        svc("a"), svc("any", nats=("*",)), svc("BusinessOnly", types=("business",)),
        svc("CanadaOnly", nats=("Canada",)), svc("Peru", country="Peru"),
    ]
    view = gather([Stub("partner", services)])
    assert {p.name for p in view.providers} == {"a", "any"}
    assert view.matching_count == 2


def test_both_source_kinds_are_included():
    view = gather([Stub("web_search", [svc("a")]), Stub("partner", [svc("b")])])
    assert {p.source for p in view.providers} == {"web_search", "partner"}


def test_exactly_three_when_more_match():
    view = gather([Stub("partner", [svc(str(i), 10 + i) for i in range(5)])])
    assert view.matching_count == 5 and len(view.providers) == 3
    assert len(gather([Stub("partner", [svc("a"), svc("b")])]).providers) == 2


def test_lowest_fee_first_with_ties_by_processing_time():
    services = [svc("a", 40), svc("b", 25), svc("c", 30, 7), svc("d", 30, 3), svc("e", 90)]
    view = gather([Stub("partner", services)])
    assert [(p.fee, p.processing_days) for p in view.providers] == [
        (Decimal("25"), 5), (Decimal("30"), 3), (Decimal("30"), 7),
    ]


def test_fees_are_compared_after_conversion_and_unconvertible_last():
    services = [svc("eur", 70, currency="EUR"), svc("gbp", 40), svc("odd", 1, currency="XYZ")]
    view = gather([Stub("partner", services)])
    assert [p.id for p in view.providers] == ["eur", "gbp", "odd"]


def test_a_failing_provider_is_skipped():
    view = gather([Broken(), Stub("web_search", [svc("a")])])
    assert [p.id for p in view.providers] == ["a"]


def test_no_visa_needed_has_no_providers():
    view = gather([Stub("partner", [svc("a")])], status="not_needed")
    assert view.outcome == "no_visa_needed" and view.providers == []


def test_no_data_gives_message_and_official_site():
    view = gather([Stub("partner", [svc("a")])], status="no_data")
    assert view.outcome == "no_data" and view.providers == []
    assert view.message == NO_DATA_MESSAGE and view.official_site_url == OFFICIAL_SITES["Japan"]


def test_no_matching_provider_is_no_data_with_official_site():
    view = gather([Stub("partner", [svc("a", nats=("Canada",))])])
    assert view.outcome == "no_data" and view.matching_count == 0
    assert view.message == NO_DATA_MESSAGE and view.official_site_url == OFFICIAL_SITES["Japan"]


def test_destination_outside_the_table_still_gets_a_link():
    view = gather([], dest="Cusco, Peru")
    assert view.official_site_url.startswith("https://www.google.com/search")


def test_blank_details_need_details():
    assert gather([Stub("partner", [svc("a")])], status=None).outcome == "details_needed"


def test_marked_self_check_still_gets_the_shortlist():
    assert gather([Stub("partner", [svc("a")])], marked=True).outcome == "shortlist"
