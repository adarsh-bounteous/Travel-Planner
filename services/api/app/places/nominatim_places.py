import time
from collections.abc import Callable

from app.integrations.client import IntegrationClient
from app.integrations.errors import IntegrationError
from app.integrations.settings import ProviderSettings
from app.places.local_search import PLACEHOLDER_IMAGE
from app.places.overpass import OSM_URL, OsmUnavailableError, _address, _classify
from app.places.search import Place

# What to ask Nominatim for, one request each: "<phrase> in <destination>".
PHRASES = ("attraction", "viewpoint", "museum", "monument", "restaurant", "cafe", "bar")
PER_PHRASE = 20
MIN_INTERVAL_SECONDS = 1.1  # Nominatim's policy: at most one request a second


def nominatim_places_settings(base_url: str) -> ProviderSettings:
    return ProviderSettings(
        name="nominatim-places",
        base_url=base_url,
        retries=0,
        timeout_seconds=10,
        cache_ttl_seconds=3600,
        breaker_threshold=3,
        breaker_cooldown_seconds=60,
    )


def _result_to_place(item: dict) -> Place | None:
    name = item.get("name")
    kind = _classify({item.get("category", ""): item.get("type", "")})
    osm_type, osm_id = item.get("osm_type"), item.get("osm_id")
    if not name or kind is None or not osm_type or osm_id is None:
        return None
    category, place_type = kind
    tags = item.get("extratags") or {}
    address = item.get("address") or {}
    return Place(
        id=f"osm-{osm_type}-{osm_id}",
        name=name,
        image_url=PLACEHOLDER_IMAGE,
        place_type=place_type,
        price=None,
        lat=float(item["lat"]),
        lng=float(item["lon"]),
        category=category,
        address=_address({f"addr:{k}": v for k, v in address.items()}) if address else None,
        opening_hours=tags.get("opening_hours"),
        source="osm",
        provider_id=f"{osm_type}/{osm_id}",
        url=f"{OSM_URL}/{osm_type}/{osm_id}",
        commons_file=tags.get("wikimedia_commons"),
        wikidata_id=tags.get("wikidata"),
    )


class NominatimPlaceSearch:
    """Real OpenStreetMap places by category through Nominatim: the backup for when Overpass is busy.

    Slower and shallower than Overpass (one request per category, capped results), but it answers
    when the public Overpass servers are at capacity.
    """

    def __init__(
        self,
        client: IntegrationClient,
        user_agent: str,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._client = client
        self._user_agent = user_agent
        self._sleep = sleep

    def search(self, destination: str) -> list[Place]:
        found: dict[str, Place] = {}
        failures = 0
        for index, phrase in enumerate(PHRASES):
            if index:
                self._sleep(MIN_INTERVAL_SECONDS)
            try:
                response = self._client.request(
                    "nominatim-places",
                    "GET",
                    "/search",
                    params={
                        "format": "jsonv2",
                        "limit": PER_PHRASE,
                        "extratags": 1,
                        "addressdetails": 1,
                        "q": f"{phrase} in {destination}",
                    },
                    headers={"User-Agent": self._user_agent},
                )
                items = response.json() if response.is_success else None
            except (IntegrationError, ValueError):
                items = None
            if not isinstance(items, list):
                failures += 1
                continue
            for item in items:
                place = _result_to_place(item)
                if place is not None:
                    found.setdefault(place.id, place)
        if failures == len(PHRASES):
            raise OsmUnavailableError("nominatim places unavailable")
        return list(found.values())
