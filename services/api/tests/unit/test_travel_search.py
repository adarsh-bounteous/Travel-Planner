from datetime import date

import pytest

from app.routers import deps
from app.travel.local import LocalFlightProvider, LocalStayProvider, LocalTransportProvider
from app.travel.search import ReturnBeforeDepartError, booking_preview, search_travel

D1, D2 = date(2027, 3, 12), date(2027, 3, 15)
LOCAL = dict(
    stays=[LocalStayProvider()],
    flights=[LocalFlightProvider()],
    transports=[LocalTransportProvider()],
    local=True,
)
KINDS = ["stay", "flight", "transport"]


@pytest.mark.parametrize("kind", KINDS)
def test_local_search_lists_several_options(kind):
    result = search_travel(kind, "Lisbon", D1, D2, "Porto - Lisbon", **LOCAL)
    assert result.matched is True and result.source == "local"
    assert len(result.options) >= 3
    assert all("example.com" not in o.url for o in result.options)


@pytest.mark.parametrize("kind", KINDS)
def test_local_search_differs_when_the_search_differs(kind):
    base = search_travel(kind, "Lisbon", D1, D2, "Porto - Lisbon", **LOCAL)
    other = search_travel(kind, "Paris", D1, D2, "Porto - Paris", **LOCAL)
    assert [o.id for o in other.options] != [o.id for o in base.options]
    assert search_travel(kind, "Lisbon", D1, D2, "Porto - Lisbon", **LOCAL) == base


@pytest.mark.parametrize("kind", KINDS)
def test_unmatched_place_is_empty_not_an_error(kind):
    result = search_travel(kind, "Nowhere Land", D1, D2, "Porto - Nowhere Land", **LOCAL)
    assert result.options == [] and result.matched is False


@pytest.mark.parametrize("kind", KINDS)
def test_return_before_depart_is_rejected(kind):
    with pytest.raises(ReturnBeforeDepartError):
        search_travel(kind, "Lisbon", D2, D1, "Porto - Lisbon", **LOCAL)


def real(kind, destination="Faro", route="Lisbon - Faro"):
    return search_travel(
        kind,
        destination,
        D1,
        D2,
        route,
        stays=deps._stay_providers(),
        flights=deps._flight_providers(),
        transports=deps._transport_providers(),
        local=False,
    )


def test_local_off_uses_the_real_providers():
    stays = real("stay", "Lisbon")
    assert stays.source == "provider" and stays.options
    assert any("Hotel Alfama Terrace" in o.name for o in stays.options)
    assert real("flight").options
    assert real("transport").options


def test_booking_preview_rebuilds_the_listed_option():
    result = search_travel("flight", "Lisbon", D1, D2, "Porto - Lisbon", **LOCAL)
    preview = booking_preview(result.options[1].url)
    assert preview is not None
    assert preview.option == result.options[1]
    assert (preview.kind, preview.place, preview.number) == ("flight", "Lisbon", 2)


@pytest.mark.parametrize("ref", ["https://example.com/x", "local://booking/stay-nowhere-1?start=2027-03-12&end=2027-03-15", "local://booking/stay-lisbon-9?start=2027-03-12&end=2027-03-15", "local://booking/stay-lisbon-1", "local://booking/junk"])
def test_booking_preview_rejects_what_does_not_match(ref):
    assert booking_preview(ref) is None
