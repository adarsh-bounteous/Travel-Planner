import httpx
import pytest

from app.integrations.client import IntegrationClient
from app.places.nominatim_places import PHRASES, NominatimPlaceSearch, nominatim_places_settings
from app.places.overpass import OsmPlaceSearch, OsmUnavailableError, overpass_settings
from tests.unit.locations_fakes import FakeClock, FakeResolver

NOMINATIM = "https://nominatim.test"
OVERPASS = "https://overpass.test/api/interpreter"


def hit(osm_id, name, category, type_, **extra):
    return {
        "osm_type": "node", "osm_id": osm_id, "name": name, "category": category, "type": type_,
        "lat": "27.17", "lon": "78.04", "extratags": extra, "address": {"city": "Agra"},
    }


BY_PHRASE = {
    "attraction": [hit(1, "Taj Mahal", "tourism", "attraction")],
    "viewpoint": [hit(2, "Taj View Point", "tourism", "viewpoint")],
    "museum": [],
    "monument": [hit(3, "Darwaza-i-Rauza", "historic", "monument"), hit(1, "Taj Mahal", "tourism", "attraction")],
    "restaurant": [hit(4, "Joney's place", "amenity", "restaurant", opening_hours="Mo-Su 08:00-22:00")],
    "cafe": [hit(5, "Taj Cafe", "amenity", "cafe")],
    "bar": [hit(6, "Tea'se Me", "amenity", "bar"), hit(7, "Unnamed", "shop", "kiosk")],
}


def search_with(handler):
    sleeps: list[float] = []
    client = IntegrationClient([nominatim_places_settings(NOMINATIM)], transport=httpx.MockTransport(handler))
    return NominatimPlaceSearch(client, "UA", sleep=sleeps.append), sleeps


def by_phrase(request):
    phrase = request.url.params["q"].split(" in ")[0]
    return httpx.Response(200, json=BY_PHRASE[phrase])


def test_one_request_per_category_for_the_destination():
    queries = []

    def handler(request):
        queries.append(request.url.params["q"])
        return by_phrase(request)

    search, _ = search_with(handler)
    search.search("Agra")
    assert queries == [f"{p} in Agra" for p in PHRASES]


def test_results_are_classified_and_deduplicated():
    search, _ = search_with(by_phrase)
    found = search.search("Agra")
    assert [p.name for p in found] == [
        "Taj Mahal", "Taj View Point", "Darwaza-i-Rauza", "Joney's place", "Taj Cafe", "Tea'se Me"
    ]
    assert {p.category for p in found} == {"sights", "viewpoints", "food", "nightlife"}
    assert all(p.source == "osm" and p.price is None for p in found)
    assert found[0].url == "https://www.openstreetmap.org/node/1" and found[0].provider_id == "node/1"
    assert next(p for p in found if p.name == "Joney's place").opening_hours == "Mo-Su 08:00-22:00"


def test_requests_are_spaced_a_second_apart():
    search, sleeps = search_with(by_phrase)
    search.search("Agra")
    assert len(sleeps) == len(PHRASES) - 1 and all(s >= 1 for s in sleeps)


def test_one_failed_category_still_returns_the_rest():
    def handler(request):
        if request.url.params["q"].startswith("cafe"):
            return httpx.Response(500)
        return by_phrase(request)

    search, _ = search_with(handler)
    assert "Taj Cafe" not in [p.name for p in search.search("Agra")]


def test_all_categories_failing_is_unavailable():
    search, _ = search_with(lambda r: httpx.Response(503))
    with pytest.raises(OsmUnavailableError):
        search.search("Agra")


def test_no_results_anywhere_is_an_empty_list_not_an_error():
    search, _ = search_with(lambda r: httpx.Response(200, json=[]))
    assert search.search("Nowhere") == []


def osm_with_backup(overpass_handler):
    clock = FakeClock()
    overpass = IntegrationClient(
        [overpass_settings(OVERPASS)], transport=httpx.MockTransport(overpass_handler), clock=clock.now, sleep=clock.sleep
    )
    backup, _ = search_with(by_phrase)
    return OsmPlaceSearch(FakeResolver(), overpass, "UA", backup)


def test_overpass_down_falls_back_to_nominatim_places():
    found = osm_with_backup(lambda r: httpx.Response(502)).search("Agra")
    assert "Taj Mahal" in [p.name for p in found]


def test_overpass_up_does_not_touch_the_backup():
    node = {"type": "node", "id": 9, "lat": 1.0, "lon": 2.0, "tags": {"name": "Only", "tourism": "attraction"}}
    found = osm_with_backup(lambda r: httpx.Response(200, json={"elements": [node]})).search("Agra")
    names = [p.name for p in found]
    assert "Only" in names and "Taj Mahal" not in names
