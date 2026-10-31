import logging
from collections.abc import Callable
from functools import lru_cache

import httpx

from app.locations.resolver import BoundingBox, ResolvedLocation

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 10


def _query(country: str | None, place: str | None, destination: str | None) -> str:
    country, place, destination = ((v or "").strip() for v in (country, place, destination))
    if place and country:
        return f"{place}, {country}"
    return destination or place or country


@lru_cache
def _finder():
    from timezonefinder import TimezoneFinder

    return TimezoneFinder()


def timezone_at(lat: float, lng: float) -> str | None:
    """The IANA time zone at a point, looked up offline (Nominatim returns none)."""
    return _finder().timezone_at(lat=lat, lng=lng)


class NominatimResolver:
    def __init__(
        self,
        base_url: str,
        user_agent: str,
        http_get: Callable[..., httpx.Response] = httpx.get,
        tz_lookup: Callable[[float, float], str | None] = timezone_at,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._user_agent = user_agent
        self._http_get = http_get
        self._tz_lookup = tz_lookup

    def resolve(
        self, country: str | None, place: str | None, destination: str | None
    ) -> ResolvedLocation | None:
        query = _query(country, place, destination)
        if not query:
            return None
        try:
            response = self._http_get(
                url=f"{self._base_url}/search",
                params={"format": "jsonv2", "limit": 1, "addressdetails": 1, "q": query},
                headers={"User-Agent": self._user_agent},
                timeout=TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            hits = response.json()
            if not hits:
                return None
            return self._location(hits[0])
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
            logger.warning("Nominatim look-up failed for %r: %s", query, error)
            return None

    def _location(self, hit: dict) -> ResolvedLocation | None:
        country_code = hit["address"].get("country_code")
        lat, lng = float(hit["lat"]), float(hit["lon"])
        time_zone = self._tz_lookup(lat, lng)
        if not country_code or not time_zone:  # stored all-or-nothing
            return None
        south, north, west, east = (float(v) for v in hit["boundingbox"])
        return ResolvedLocation(
            name=hit["display_name"],
            country_code=country_code.upper(),
            lat=lat,
            lng=lng,
            time_zone=time_zone,
            bbox=BoundingBox(south=south, north=north, west=west, east=east),
        )
