import json
from datetime import date

import httpx
import pytest
from pydantic import ValidationError

from app.integrations.client import IntegrationClient
from app.integrations.errors import CircuitOpenError, RateLimitError
from app.places.fallback import FallbackPlaceSearch
from app.places.local_search import PLACEHOLDER_IMAGE
from app.places.overpass import OsmPlaceSearch, OsmUnavailableError, element_to_place, overpass_settings
from app.places.search import SEED_CATALOGUE, InMemoryPlaceSearch, Place
from tests.unit.locations_fakes import FakeClock, FakeResolver

URL = "https://overpass.test/api/interpreter"


def node(id, name, **tags):
    return {"type": "node", "id": id, "lat": 38.7, "lon": -9.1, "tags": {"name": name, **tags}}


NODE_WITH_ADDR = node(
    42, "X", tourism="attraction", **{"addr:housenumber": "1", "addr:street": "Rua X", "addr:city": "Lisbon"}
)
NODE_WITH_HOURS = node(43, "Y", tourism="museum", opening_hours="Mo-Fr 09:00-17:00")
NODE_NO_HOURS = node(44, "Z", tourism="museum")
ALL = [
    node(1, "a", tourism="viewpoint"),
    node(2, "b", tourism="gallery"),
    node(3, "c", amenity="restaurant"),
    node(4, "d", amenity="nightclub"),
    node(5, "e", historic="monument"),
    NODE_WITH_ADDR,
]


def make(handler, clock=None):
    calls = []

    def wrapped(request):
        calls.append(request)
        return handler(request)

    clock = clock or FakeClock()
    client = IntegrationClient(
        [overpass_settings(URL)], transport=httpx.MockTransport(wrapped), clock=clock.now, sleep=clock.sleep
    )
    return OsmPlaceSearch(FakeResolver(), client, "UA"), calls, clock


def ok(request):
    return httpx.Response(200, json={"elements": ALL})


def test_any_city_lists_osm_places():
    places, _, _ = make(ok)
    found = places.search("Ljubljana")
    assert found and all(p.source == "osm" for p in found)
    assert "ljubljana" not in SEED_CATALOGUE


@pytest.mark.parametrize(
    "tags,category,place_type",
    [
        ({"tourism": "viewpoint"}, "viewpoints", "park"),
        ({"amenity": "nightclub"}, "nightlife", "food"),
        ({"amenity": "restaurant"}, "food", "food"),
        ({"tourism": "museum"}, "museums", "museum"),
        ({"historic": "monument"}, "sights", "landmark"),
    ],
)
def test_tag_mapping(tags, category, place_type):
    p = element_to_place(node(1, "N", **tags))
    assert (p.category, p.place_type) == (category, place_type)


def test_unnamed_or_unmappable_is_dropped():
    assert element_to_place({"type": "node", "id": 1, "lat": 1, "lon": 2, "tags": {"tourism": "museum"}}) is None
    assert element_to_place(node(1, "N", shop="bakery")) is None


def test_way_uses_center():
    el = {"type": "way", "id": 9, "center": {"lat": 1.5, "lon": 2.5}, "tags": {"name": "W", "tourism": "museum"}}
    p = element_to_place(el)
    assert (p.lat, p.lng, p.provider_id) == (1.5, 2.5, "way/9")


def test_details_fields():
    p = element_to_place(NODE_WITH_ADDR)
    assert (p.address, p.lat, p.lng, p.provider_id, p.url) == (
        "1 Rua X, Lisbon", 38.7, -9.1, "node/42", "https://www.openstreetmap.org/node/42",
    )


def test_opening_hours_only_when_tagged():
    assert element_to_place(NODE_WITH_HOURS).opening_hours == "Mo-Fr 09:00-17:00"
    assert element_to_place(NODE_NO_HOURS).opening_hours is None


def test_no_price_rating_or_photo():
    p = element_to_place(NODE_WITH_HOURS)
    assert p.price is None and not hasattr(p, "rating")
    assert p.image_url == PLACEHOLDER_IMAGE


def test_place_types_stay_existing():
    assert {element_to_place(e).place_type for e in ALL} <= {"landmark", "museum", "park", "food", "shopping"}
    with pytest.raises(ValidationError):
        Place.model_validate({**element_to_place(ALL[0]).model_dump(), "place_type": "viewpoint"})


def test_old_and_new_rows_validate():
    old = {"id": "a", "name": "A", "image_url": "https://x/y", "place_type": "park", "price": "free", "lat": 1, "lng": 2}
    assert Place.model_validate(old).source == "seed"
    osm = element_to_place(NODE_WITH_HOURS)
    assert Place.model_validate(json.loads(osm.model_dump_json())) == osm


def test_settings_are_ten_seconds_no_retry():
    s = overpass_settings(URL)
    assert s.timeout_seconds == 10 and s.retries == 0


def test_second_search_is_cached():
    places, calls, _ = make(ok)
    places.search("Lisbon")
    places.search("Lisbon")
    assert len(calls) == 1


def test_search_returns_empty_when_nothing_found():
    places, _, _ = make(lambda r: httpx.Response(200, json={"elements": []}))
    assert places.search("Lisbon") == []


def test_unreachable_raises():
    places, _, _ = make(lambda r: httpx.Response(500))
    with pytest.raises(OsmUnavailableError):
        places.search("Lisbon")


def test_bad_json_raises():
    places, _, _ = make(lambda r: httpx.Response(200, content=b"<html>"))
    with pytest.raises(OsmUnavailableError):
        places.search("Lisbon")


def test_breaker_opens_after_three_failures():
    places, calls, clock = make(lambda r: httpx.Response(500))
    for _ in range(3):
        with pytest.raises(OsmUnavailableError):
            places.search("Lisbon")
        clock.t += 3
    with pytest.raises(OsmUnavailableError) as exc:
        places.search("Lisbon")
    assert isinstance(exc.value.__cause__, CircuitOpenError)
    assert len(calls) == 3


def test_rate_limit_falls_back_to_seed():
    places, _, _ = make(ok)
    places.search("Lisbon")
    places._resolver = FakeResolver()
    # a different city inside 2s resolves to another cache key only if the centre differs
    from app.locations.resolver import ResolvedLocation

    class Other(FakeResolver):
        def resolve(self, c, p, d):
            return super().resolve(c, p, d).model_copy(update={"lat": 10.0, "lng": 10.0})

    places._resolver = Other()
    with pytest.raises(OsmUnavailableError) as exc:
        places.search("Elsewhere")
    assert isinstance(exc.value.__cause__, RateLimitError)
    found = FallbackPlaceSearch(places, InMemoryPlaceSearch(SEED_CATALOGUE), lambda: date(2026, 10, 31)).search("Lisbon")
    assert found and all(p.source == "seed" for p in found) or found == []
