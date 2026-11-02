"""One-off builder for the committed place fixtures (tests/unit/fixtures/recorded/places).

The payloads follow the real Nominatim `jsonv2` and Overpass `out center tags` response shapes. Each
goes through `scrub_body` and is keyed by `fixture_key` of the request production code makes, so
`ReplayTransport` finds it. Run once and commit the output; tests only read the JSON:

    sh run-py.sh -m tests.unit.integrations_support.place_fixtures
"""
import json
from collections.abc import Iterator
from pathlib import Path

import httpx

from app.places.nominatim_places import PER_PHRASE, PHRASES
from app.places.overpass import _query
from tests.unit.integrations_support.recorded import FIXTURES_DIR, fixture_key
from tests.unit.integrations_support.scrub import scrub_body

PLACES_DIR = FIXTURES_DIR / "places"
NOMINATIM_BASE = "https://nominatim.test"
OVERPASS_URL = "https://overpass.test/api/interpreter"

# city: (lat, lon, (south, north, west, east), display name, country code, first element id)
CITIES = {
    "Lisbon": (38.7077507, -9.1365919, (38.6913, 38.7967, -9.2298, -9.0864), "Lisbon, Portugal", "pt", 2000),
    "Kyoto": (35.0116363, 135.7680294, (34.8, 35.2, 135.6, 135.9), "Kyoto, Japan", "jp", 3000),
    "Paris": (48.8588897, 2.3200410, (48.8156, 48.9022, 2.2242, 2.4698), "Paris, France", "fr", 4000),
    "Porto": (41.1494512, -8.6107884, (41.1, 41.2, -8.7, -8.5), "Porto, Portugal", "pt", 1000),
    "Emptyville": (10.5, 20.5, (10.4, 10.6, 20.4, 20.6), "Emptyville, Nowhere", "xx", 9000),
    "Brokenville": (11.5, 21.5, (11.4, 11.6, 21.4, 21.6), "Brokenville, Nowhere", "xx", 9100),
}
GZIP_CITY = "Porto"  # its Overpass answer is the one gzip-compressed response
ERROR_CITY = "Errorville"  # never resolves: Nominatim answers 500 / 503
EMPTY_PLACE_QUERY = "Nowhere"

# Overpass element: (type, id offset, tags). Names are scrubbed on write, so tests assert ids and categories.
_ELEMENTS = (
    ("node", 1, {"tourism": "attraction"}),
    ("way", 2, {"tourism": "museum"}),
    ("node", 3, {"amenity": "restaurant", "addr:street": "Rua Example", "addr:housenumber": "1"}),
    ("node", 4, {"amenity": "bar"}),
    ("node", 5, {"tourism": "viewpoint"}),
    ("way", 6, {"historic": "monument"}),
)
# Nominatim category search: phrase -> (category tag, type tag)
_PHRASE_TAGS = {
    "attraction": ("tourism", "attraction"),
    "viewpoint": ("tourism", "viewpoint"),
    "museum": ("tourism", "museum"),
    "monument": ("historic", "monument"),
    "restaurant": ("amenity", "restaurant"),
    "cafe": ("amenity", "cafe"),
    "bar": ("amenity", "bar"),
}


def _bbox(box) -> list[str]:
    return [str(v) for v in box]


def resolve_request(query: str) -> httpx.Request:
    params = {"format": "jsonv2", "limit": 1, "addressdetails": 1, "q": query}
    return httpx.Request("GET", f"{NOMINATIM_BASE}/search", params=params)


def phrase_request(phrase: str, destination: str) -> httpx.Request:
    params = {
        "format": "jsonv2", "limit": PER_PHRASE, "extratags": 1, "addressdetails": 1,
        "q": f"{phrase} in {destination}",
    }
    return httpx.Request("GET", f"{NOMINATIM_BASE}/search", params=params)


def overpass_request(city: str) -> httpx.Request:
    lat, lon = CITIES[city][:2]
    return httpx.Request("GET", OVERPASS_URL, params={"data": _query(round(lat, 2), round(lon, 2))})


def _resolve_payload(city: str) -> list[dict]:
    lat, lon, box, display, code, _ = CITIES[city]
    return [{
        "place_id": 100000 + len(city), "licence": "Data © OpenStreetMap contributors, ODbL 1.0",
        "osm_type": "relation", "osm_id": 5000 + len(city), "lat": str(lat), "lon": str(lon),
        "category": "boundary", "type": "administrative", "place_rank": 16, "importance": 0.75,
        "addresstype": "city", "name": city, "display_name": display, "boundingbox": _bbox(box),
        "address": {"city": city, "country": display.split(", ")[-1], "country_code": code},
    }]


def _overpass_payload(city: str) -> dict:
    lat, lon, *_ , first = CITIES[city]
    elements = []
    for index, (kind, offset, tags) in enumerate(_ELEMENTS):
        element = {"type": kind, "id": first + offset, "tags": {"name": f"{city} place {offset}", **tags}}
        point = {"lat": round(lat + 0.001 * (index + 1), 7), "lon": round(lon + 0.001 * (index + 1), 7)}
        element.update(point if kind == "node" else {"center": point})
        elements.append(element)
    return {"version": 0.6, "generator": "Overpass API", "elements": elements}


def _phrase_payload(city: str, phrase_index: int, phrase: str) -> list[dict]:
    lat, lon, *_ , first = CITIES[city]
    category, kind = _PHRASE_TAGS[phrase]
    hits = []
    for n, osm_type in enumerate(("node", "way")):
        osm_id = first + 100 + phrase_index * 2 + n
        hits.append({
            "place_id": 200000 + osm_id, "osm_type": osm_type, "osm_id": osm_id,
            "lat": str(round(lat + 0.002 * (phrase_index + n + 1), 7)),
            "lon": str(round(lon + 0.002 * (phrase_index + n + 1), 7)),
            "category": category, "type": kind, "importance": 0.3, "name": f"{city} {phrase} {n}",
            "display_name": f"{city} {phrase} {n}, {city}", "extratags": {},
            "address": {"road": "Rua Example", "city": city, "country_code": CITIES[city][4]},
        })
    return hits


def entries() -> Iterator[tuple[httpx.Request, int, object, str | None]]:
    """(request, status, payload, encoding) for every recorded response."""
    for city in CITIES:
        yield resolve_request(city), 200, _resolve_payload(city), None
    for city in ("Lisbon", "Kyoto", "Paris", "Porto"):
        yield overpass_request(city), 200, _overpass_payload(city), "gzip" if city == GZIP_CITY else None
        for index, phrase in enumerate(PHRASES):
            yield phrase_request(phrase, city), 200, _phrase_payload(city, index, phrase), None
    yield overpass_request("Emptyville"), 200, {"version": 0.6, "elements": []}, None
    yield overpass_request("Brokenville"), 500, {"error": "internal server error"}, None
    yield resolve_request(ERROR_CITY), 500, {"error": "internal server error"}, None
    yield resolve_request(EMPTY_PLACE_QUERY), 200, [], None
    for phrase in PHRASES:
        yield phrase_request(phrase, ERROR_CITY), 503, {"error": "service unavailable"}, None
        yield phrase_request(phrase, EMPTY_PLACE_QUERY), 200, [], None


def write_place_fixtures(fixtures_dir: Path = PLACES_DIR) -> None:
    fixtures_dir.mkdir(parents=True, exist_ok=True)
    for request, status, payload, encoding in entries():
        body = scrub_body(json.dumps(payload).encode(), secrets=()).decode()
        stored = {"status": status, "headers": {"content-type": "application/json"}, "body": body}
        if encoding:
            stored["encoding"] = encoding
        (fixtures_dir / f"{fixture_key(request)}.json").write_text(json.dumps(stored, indent=2) + "\n")


if __name__ == "__main__":
    write_place_fixtures()
