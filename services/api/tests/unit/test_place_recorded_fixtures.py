"""Place search and resolving, run against committed scrubbed Nominatim and Overpass responses, offline."""
import json
import re
import socket

import httpx
import pytest

from app.integrations.client import IntegrationClient
from app.locations.nominatim import NominatimResolver
from app.places.nominatim_places import PHRASES, NominatimPlaceSearch, nominatim_places_settings
from app.places.overpass import OsmPlaceSearch, OsmUnavailableError, overpass_settings
from tests.unit.integrations_support.place_fixtures import (
    CITIES,
    ERROR_CITY,
    EMPTY_PLACE_QUERY,
    NOMINATIM_BASE,
    OVERPASS_URL,
    PLACES_DIR,
    overpass_request,
)
from tests.unit.integrations_support.recorded import ReplayTransport, replaying_http_get
from tests.unit.integrations_support.scrub import REDACTED, scrub_body

REAL_CITIES = ["Lisbon", "Kyoto", "Paris", "Porto"]
CATEGORY_OF_PHRASE = {
    "attraction": "sights", "monument": "sights", "historic": "sights", "viewpoint": "viewpoints",
    "museum": "museums", "restaurant": "food", "cafe": "food", "bar": "nightlife",
}


@pytest.fixture(autouse=True)
def network_off(monkeypatch):
    def refuse(*args, **kwargs):
        raise AssertionError("network used")

    monkeypatch.setattr(socket.socket, "connect", refuse)
    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", refuse)


class Scripted(httpx.BaseTransport):
    """Replays fixtures; Overpass (and optionally Nominatim) can be made to fail on demand."""

    def __init__(self, *, overpass: str | None = None, nominatim: str | None = None) -> None:
        self._replay = ReplayTransport(PLACES_DIR)
        self.overpass_mode = overpass
        self.nominatim_mode = nominatim
        self.overpass_calls = 0
        self.queries: list[str] = []
        self.answers: dict[str, list[int]] = {}

    def engage(self, overpass: str) -> None:
        self.overpass_mode = overpass

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        is_overpass = request.url.host == httpx.URL(OVERPASS_URL).host
        mode = self.overpass_mode if is_overpass else self.nominatim_mode
        self.overpass_calls += is_overpass
        if mode == "timeout":
            raise httpx.ReadTimeout("timed out", request=request)
        if mode == "down":
            return httpx.Response(502, request=request)
        response = self._replay.handle_request(request)
        if "q" in request.url.params and response.is_success:
            phrase = request.url.params["q"].split(" in ")[0]
            self.queries.append(phrase)
            self.answers[phrase] = [h["osm_id"] for h in response.json()]
        return response


def osm_search(transport, backup=None) -> OsmPlaceSearch:
    resolver = NominatimResolver(
        NOMINATIM_BASE, "UA", http_get=replaying_http_get(transport), tz_lookup=lambda *_: "Europe/Lisbon"
    )
    client = IntegrationClient([overpass_settings(OVERPASS_URL)], transport=transport)
    return OsmPlaceSearch(resolver, client, "UA", backup)


def nominatim_search(transport) -> NominatimPlaceSearch:
    client = IntegrationClient([nominatim_places_settings(NOMINATIM_BASE)], transport=transport)
    return NominatimPlaceSearch(client, "UA", sleep=lambda seconds: None)


def test_network_guard_blocks_real_requests():
    with pytest.raises(Exception):
        httpx.get("https://nominatim.test")


@pytest.mark.parametrize("city", REAL_CITIES)
def test_place_search_returns_places_for_each_recorded_city(city):
    found = osm_search(Scripted()).search(city)
    assert len(found) > 1 and all(p.source == "osm" for p in found)
    assert found[0].id.startswith("osm-destination-")
    lat, lng = CITIES[city][:2]
    assert found[0].lat == pytest.approx(lat) and found[0].lng == pytest.approx(lng)


def test_gzip_overpass_response_is_decoded_and_returned():
    transport = Scripted()
    with httpx.Client(transport=transport) as client:
        raw = client.send(overpass_request("Porto"))
    assert raw.headers["content-encoding"] == "gzip"
    assert len(raw.json()["elements"]) > 1
    assert {p.provider_id for p in osm_search(transport).search("Porto")} >= {"node/1001", "way/1002"}


@pytest.mark.parametrize("failure", ["down", "timeout"])
def test_overpass_down_or_timeout_repeat_returns_same_places_from_cache(failure):
    transport = Scripted()
    search = osm_search(transport)
    first = search.search("Lisbon")
    assert len(first) > 1
    transport.engage(failure)
    assert search.search("Lisbon") == first
    assert transport.overpass_calls == 1


@pytest.mark.parametrize("failure", ["down", "timeout"])
def test_overpass_down_with_no_cache_returns_no_places(failure):
    with pytest.raises(OsmUnavailableError):
        osm_search(Scripted(overpass=failure)).search("Lisbon")


@pytest.mark.parametrize("city", [ERROR_CITY, "Brokenville"])
def test_error_response_returns_no_places(city):
    # Nominatim 500 (the city never resolves) and Overpass 500, with no backup to fall back on.
    with pytest.raises(OsmUnavailableError):
        osm_search(Scripted()).search(city)


def test_nominatim_category_search_error_returns_no_places():
    with pytest.raises(OsmUnavailableError):
        nominatim_search(Scripted()).search(ERROR_CITY)


def test_nominatim_timeout_returns_no_places():
    transport = Scripted(nominatim="timeout")
    with pytest.raises(OsmUnavailableError):
        osm_search(transport).search("Lisbon")
    with pytest.raises(OsmUnavailableError):
        nominatim_search(transport).search("Lisbon")


def test_empty_recorded_response_returns_zero_places():
    assert nominatim_search(Scripted()).search(EMPTY_PLACE_QUERY) == []


def test_empty_overpass_answer_leaves_only_the_searched_city():
    found = osm_search(Scripted()).search("Emptyville")
    assert [p.id.startswith("osm-destination-") for p in found] == [True]


@pytest.mark.parametrize("city", REAL_CITIES)
def test_category_fixtures_tag_every_place_with_the_searched_category(city):
    transport = Scripted()
    found = nominatim_search(transport).search(city)
    assert transport.queries == list(PHRASES)
    by_id = {p.provider_id: p for p in found}
    for phrase in PHRASES:
        places = [by_id[f"{kind}/{osm_id}"] for osm_id, kind in zip(transport.answers[phrase], ("node", "way"))]
        assert places
        assert {p.category for p in places} == {CATEGORY_OF_PHRASE[phrase]}


def test_category_filter_over_a_replayed_search_returns_only_that_category(sign_in_as):
    from app.main import app
    from app.routers import deps

    a = sign_in_as("a@example.com")
    app.dependency_overrides[deps.get_places] = lambda: osm_search(Scripted())
    body = a.get("/places", params={"destination": "Lisbon", "category": "museums"}).json()
    assert body and {p["category"] for p in body} == {"museums"}


def test_scrubber_keeps_the_shape_resolving_needs():
    raw = {
        "lat": "38.7077507", "lon": "-9.1365919", "boundingbox": ["38.6913", "38.7967", "-9.2298", "-9.0864"],
        "name": "Somebody's Cafe", "address": {"road": "Rua X", "country_code": "pt"},
    }
    hit = json.loads(scrub_body(json.dumps([raw]).encode(), secrets=[]))[0]
    assert isinstance(hit["address"], dict) and hit["address"]["country_code"] == "pt"
    assert hit["address"]["road"] == REDACTED and hit["name"] == REDACTED
    assert float(hit["lat"]) == 38.7077507 and hit["boundingbox"][0] == "38.6913"


def test_scrubber_still_cleans_planted_personal_data_and_keys():
    body = {"tags": {"contact:phone": "+351 21 123 4567", "addr:street": "Rua X", "website": "https://x.example"},
            "note": "mail ann@example.com or call +351 21 123 4567 key=FAKE-KEY", "email": "ann@example.com"}
    out = scrub_body(json.dumps(body).encode(), secrets=["FAKE-KEY"]).decode()
    for leaked in ("ann@example.com", "123 4567", "FAKE-KEY", "Rua X", "x.example"):
        assert leaked not in out


def _values_of(data, keys):
    if isinstance(data, dict):
        for key, value in data.items():
            if key in keys:
                yield value
            yield from _values_of(value, keys)
    elif isinstance(data, list):
        for item in data:
            yield from _values_of(item, keys)


def _without_numbers(data):
    if isinstance(data, dict):
        return {k: _without_numbers(v) for k, v in data.items()
                if k not in {"lat", "lon", "osm_id", "place_id", "boundingbox", "id"}}
    if isinstance(data, list):
        return [_without_numbers(v) for v in data]
    return data


def test_committed_fixtures_contain_no_secrets_or_personal_data():
    files = sorted(PLACES_DIR.glob("*.json"))
    assert len(files) > 50
    for path in files:
        text = path.read_text()
        assert not re.search(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", text), path.name
        assert not re.search(r"(?i)api[_-]?key|access[_-]?token|authorization|bearer ", text), path.name
        stored = json.loads(text)
        body = json.loads(stored["body"])
        assert all(v == REDACTED for v in _values_of(body, {"name", "email", "phone"})), path.name
        assert not re.search(r"\+?\d[\d\s().-]{6,}\d", json.dumps(_without_numbers(body))), path.name
        assert "set-cookie" not in {h.lower() for h in stored["headers"]}


def test_scan_fails_on_a_planted_leak():
    assert re.search(r"(?i)api[_-]?key", '{"api_key": "FAKE"}')
    assert re.search(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", "ann@example.com")
