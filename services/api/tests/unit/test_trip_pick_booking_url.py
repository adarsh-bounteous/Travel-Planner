from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.trips.store import ChosenStay, TransportPick


def _stay(url):
    return ChosenStay(property_id="p", name="n", provider="x", url=url, total=Decimal(1), currency="EUR")


def _transport(url):
    return TransportPick(
        leg="destination",
        option_id="o",
        mode="flight",
        provider="x",
        origin="Porto",
        destination="Lisbon",
        date=date(2027, 11, 18),
        fare=Decimal(1),
        picked_fare=Decimal(1),
        currency="EUR",
        url=url,
    )


def test_chosen_stay_accepts_a_local_booking_reference():
    url = "local://booking/stay-lisbon-1?start=2027-03-12&end=2027-03-15"
    assert _stay(url).url == url


def test_transport_pick_accepts_a_local_booking_reference():
    url = "local://booking/flight-lisbon-1?date=2027-11-18"
    assert _transport(url).url == url


@pytest.mark.parametrize("bad", ["javascript:alert(1)", "ftp://example.com/x", "local://other/x", "not a url"])
def test_pick_urls_still_refuse_other_schemes(bad):
    with pytest.raises(ValidationError):
        _stay(bad)
    with pytest.raises(ValidationError):
        _transport(bad)


def test_http_urls_are_unchanged():
    assert _stay("https://example.com/stays/a").url == "https://example.com/stays/a"
