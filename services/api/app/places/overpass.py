from app.integrations.client import IntegrationClient
from app.integrations.errors import IntegrationError
from app.integrations.settings import ProviderSettings
from app.locations.resolver import DestinationResolver
from app.places.local_search import PLACEHOLDER_IMAGE
from app.places.search import Category, Place, PlaceType

RADIUS_METRES = 5000
OSM_URL = "https://www.openstreetmap.org"

# First match wins: (tag, values or None for any) -> (category, place type)
_RULES: list[tuple[str, frozenset[str] | None, Category, PlaceType]] = [
    ("tourism", frozenset({"viewpoint"}), "viewpoints", "park"),
    ("tourism", frozenset({"museum", "gallery"}), "museums", "museum"),
    ("amenity", frozenset({"restaurant", "cafe", "fast_food"}), "food", "food"),
    ("amenity", frozenset({"bar", "pub", "nightclub"}), "nightlife", "food"),
    ("tourism", frozenset({"attraction"}), "sights", "landmark"),
    ("historic", None, "sights", "landmark"),
]

_QUERY_FILTERS = ['["tourism"~"^(viewpoint|museum|gallery|attraction)$"]', '["amenity"~"^(restaurant|cafe|fast_food|bar|pub|nightclub)$"]', '["historic"]']


def overpass_settings(base_url: str) -> ProviderSettings:
    return ProviderSettings(
        name="overpass",
        base_url=base_url,
        retries=0,  # one attempt: the 10 s budget is the AC, a retry would double it
        timeout_seconds=10,
        cache_ttl_seconds=3600,  # one city = one query per hour per instance
        rate_limit_calls=1,
        rate_limit_period_seconds=2,
        breaker_threshold=3,
        breaker_cooldown_seconds=60,
    )


class OsmUnavailableError(Exception):
    """The city could not be resolved or Overpass did not answer usefully."""


def _classify(tags: dict) -> tuple[Category, PlaceType] | None:
    for key, values, category, place_type in _RULES:
        if key in tags and (values is None or tags[key] in values):
            return category, place_type
    return None


def _address(tags: dict) -> str | None:
    street = " ".join(p for p in (tags.get("addr:housenumber"), tags.get("addr:street")) if p)
    parts = [p for p in (street, tags.get("addr:postcode"), tags.get("addr:city")) if p]
    return ", ".join(parts) or None


def element_to_place(element: dict) -> Place | None:
    tags = element.get("tags") or {}
    name = tags.get("name")
    kind = _classify(tags)
    point = element if "lat" in element else element.get("center") or {}
    if not name or kind is None or "lat" not in point or "lon" not in point or "id" not in element:
        return None
    osm_type, osm_id = element.get("type", "node"), element["id"]
    category, place_type = kind
    return Place(
        id=f"osm-{osm_type}-{osm_id}",
        name=name,
        image_url=PLACEHOLDER_IMAGE,
        place_type=place_type,
        price=None,
        lat=point["lat"],
        lng=point["lon"],
        category=category,
        address=_address(tags),
        opening_hours=tags.get("opening_hours"),
        source="osm",
        provider_id=f"{osm_type}/{osm_id}",
        url=f"{OSM_URL}/{osm_type}/{osm_id}",
    )


def _query(lat: float, lng: float) -> str:
    around = f"(around:{RADIUS_METRES},{lat:.2f},{lng:.2f})"
    clauses = "".join(f"{kind}{f}[name]{around};" for f in _QUERY_FILTERS for kind in ("node", "way", "relation"))
    return f"[out:json][timeout:10];({clauses});out center tags 200;"


class OsmPlaceSearch:
    """Real places around a destination, from OpenStreetMap through Overpass."""

    def __init__(self, resolver: DestinationResolver, client: IntegrationClient, user_agent: str) -> None:
        self._resolver = resolver
        self._client = client
        self._user_agent = user_agent

    def search(self, destination: str) -> list[Place]:
        location = self._resolver.resolve(None, destination, None)
        if location is None:
            raise OsmUnavailableError("destination not resolved")
        try:
            response = self._client.request(
                "overpass",
                "GET",
                "",
                params={"data": _query(round(location.lat, 2), round(location.lng, 2))},
                headers={"User-Agent": self._user_agent},
            )
            if not response.is_success:
                raise OsmUnavailableError(f"status {response.status_code}")
            elements = response.json()["elements"]
        except (IntegrationError, ValueError, KeyError, TypeError) as error:
            raise OsmUnavailableError(type(error).__name__) from error
        places = (element_to_place(e) for e in elements)
        return [p for p in places if p is not None]
