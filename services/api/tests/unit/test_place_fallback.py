from datetime import date

import httpx
import pytest

from app.integrations.client import IntegrationClient
from app.places.fallback import FallbackPlaceSearch
from app.places.overpass import OsmPlaceSearch, overpass_settings
from app.places.search import SEED_CATALOGUE, InMemoryPlaceSearch, Place
from tests.unit.locations_fakes import FakeClock, FakeResolver

URL = "https://overpass.test/api/interpreter"
TODAY = date(2026, 10, 31)


def osm_with(handler):
    clock = FakeClock()
    client = IntegrationClient(
        [overpass_settings(URL)], transport=httpx.MockTransport(handler), clock=clock.now, sleep=clock.sleep
    )
    return OsmPlaceSearch(FakeResolver(), client, "UA")


def raise_timeout(request):
    raise httpx.ReadTimeout("slow")


class Empty:
    def search(self, destination):
        return []


class Counting:
    def __init__(self):
        self.calls = 0

    def search(self, destination):
        self.calls += 1
        return []


@pytest.mark.parametrize(
    "primary",
    [
        None,
        osm_with(lambda r: httpx.Response(500)),
        osm_with(raise_timeout),
        Empty(),
    ],
    ids=["off", "error", "timeout", "empty"],
)
def test_falls_back_to_stamped_seed(primary):
    found = FallbackPlaceSearch(primary, InMemoryPlaceSearch(SEED_CATALOGUE), lambda: TODAY).search("Lisbon")
    assert found and all(p.source == "seed" and p.as_of == TODAY for p in found)
    assert {p.category for p in found if p.place_type == "museum"} <= {"museums"}


def test_primary_places_never_touch_fallback():
    osm = Place(id="o", name="O", image_url="x", place_type="food", lat=1, lng=2, source="osm", category="food")
    fallback = Counting()

    class Primary:
        def search(self, d):
            return [osm]

    found = FallbackPlaceSearch(Primary(), fallback, lambda: TODAY).search("Lisbon")
    assert fallback.calls == 0
    assert {p.source for p in found} == {"osm"}
