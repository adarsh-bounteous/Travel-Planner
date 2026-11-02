import base64
import hashlib
import hmac
import logging
import threading
from collections import OrderedDict
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Literal, Protocol

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.locations.nominatim import timezone_at
from app.locations.resolver import BoundingBox, RateLimiter, ResolvedLocation
from app.trips.starter_destinations import STARTER_DESTINATIONS, fold

logger = logging.getLogger(__name__)

MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 80
RESULT_LIMIT = 8
CACHE_TTL = timedelta(minutes=10)
CACHE_SIZE = 256
REF_TTL = timedelta(hours=1)
TIMEOUT_SECONDS = 10
_PURPOSE = b"destination-search-ref:"


class LiveSearchUnavailable(Exception):
    """The live provider could not answer: not the same as "no match"."""


class LiveCandidate(BaseModel):
    name: str
    country: str
    region: str
    location: ResolvedLocation


class DestinationMatch(BaseModel):
    id: str
    name: str
    region: str
    kind: Literal["starter", "live"]
    full_guide: bool = Field(serialization_alias="fullGuide")


class DestinationSearchResult(BaseModel):
    live: bool
    unavailable: bool = False
    matches: list[DestinationMatch]


class LiveDestinationSearch(Protocol):
    def search(self, q: str) -> list[LiveCandidate]:
        """Cities and towns matching `q`. Raises LiveSearchUnavailable when the provider fails."""
        ...


class NominatimDestinationSearch:
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

    def search(self, q: str) -> list[LiveCandidate]:
        try:
            response = self._http_get(
                url=f"{self._base_url}/search",
                params={
                    "format": "jsonv2",
                    "addressdetails": 1,
                    "accept-language": "en",
                    "featuretype": "city",
                    "limit": RESULT_LIMIT,
                    "q": q,
                },
                headers={"User-Agent": self._user_agent},
                timeout=TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            found = [self._candidate(hit) for hit in response.json()]
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
            logger.warning("Nominatim destination search failed for %r: %s", q, error)
            raise LiveSearchUnavailable from error
        return [c for c in found if c is not None]

    def _candidate(self, hit: dict) -> LiveCandidate | None:
        address = hit["address"]
        country, code = address.get("country"), address.get("country_code")
        name = hit.get("name") or hit["display_name"].split(",")[0].strip()
        lat, lng = float(hit["lat"]), float(hit["lon"])
        time_zone = self._tz_lookup(lat, lng)
        if not (country and code and name and time_zone):
            return None
        south, north, west, east = (float(v) for v in hit["boundingbox"])
        region = address.get("state") or address.get("region") or address.get("county") or ""
        return LiveCandidate(
            name=name,
            country=country,
            region=region,
            location=ResolvedLocation(
                name=hit["display_name"],
                country_code=code.upper(),
                lat=lat,
                lng=lng,
                time_zone=time_zone,
                bbox=BoundingBox(south=south, north=north, west=west, east=east),
            ),
        )


class CachedDestinationSearch:
    """Serves a repeated query from memory and spaces upstream calls. A failure is never cached."""

    def __init__(
        self,
        upstream: LiveDestinationSearch,
        limiter: RateLimiter,
        now: Callable[[], datetime],
        ttl: timedelta = CACHE_TTL,
        size: int = CACHE_SIZE,
    ) -> None:
        self._upstream = upstream
        self._limiter = limiter
        self._now = now
        self._ttl = ttl
        self._size = size
        self._entries: OrderedDict[str, tuple[datetime, list[LiveCandidate]]] = OrderedDict()
        self._lock = threading.Lock()

    def search(self, q: str) -> list[LiveCandidate]:
        key = fold(q)
        with self._lock:
            hit = self._entries.get(key)
            if hit is not None and self._now() - hit[0] < self._ttl:
                self._entries.move_to_end(key)
                return hit[1]
        self._limiter.wait()
        found = self._upstream.search(key)
        with self._lock:
            self._entries[key] = (self._now(), found)
            self._entries.move_to_end(key)
            while len(self._entries) > self._size:
                self._entries.popitem(last=False)
        return found


class NoLiveSearch:
    """Live places off: makes no outside request."""

    def search(self, q: str) -> list[LiveCandidate]:
        return []


def _starter_matches(q: str) -> list[DestinationMatch]:
    needle = fold(q)
    return [
        DestinationMatch(
            id=f"starter:{country.name}/{place.name}",
            name=place.name,
            region=country.name,
            kind="starter",
            full_guide=True,
        )
        for country in STARTER_DESTINATIONS
        for place in country.places
        if needle in fold(place.name) or needle in fold(country.name)
    ]


def search_destinations(
    q: str, live_search: LiveDestinationSearch, live_on: bool, secret: bytes, now: datetime
) -> DestinationSearchResult:
    """Starter matches first (marked Full guide), then live ones with a signed id."""
    q = q.strip()[:MAX_QUERY_LENGTH]
    if len(q) < MIN_QUERY_LENGTH:
        return DestinationSearchResult(live=live_on, matches=[])
    starters = _starter_matches(q)
    if not live_on:
        return DestinationSearchResult(live=False, matches=starters)
    try:
        candidates = live_search.search(q)
    except LiveSearchUnavailable:
        return DestinationSearchResult(live=True, unavailable=True, matches=starters)
    taken = {(fold(m.name), fold(m.region)) for m in starters}
    seen: set[tuple[str, str]] = set()
    live: list[DestinationMatch] = []
    for c in candidates:
        key = (fold(c.name), fold(c.country))
        if key in taken or key in seen:
            continue
        seen.add(key)
        live.append(
            DestinationMatch(
                id=sign_place_ref(c, secret, now),
                name=c.name,
                region=", ".join(part for part in (c.region, c.country) if part),
                kind="live",
                full_guide=False,
            )
        )
    return DestinationSearchResult(live=True, matches=[*starters, *live])


class LivePlace(LiveCandidate):
    exp: int


def _mac(payload: str, secret: bytes) -> str:
    return hmac.new(_PURPOSE + secret, payload.encode(), hashlib.sha256).hexdigest()


def sign_place_ref(candidate: LiveCandidate, secret: bytes, now: datetime) -> str:
    live = LivePlace(**candidate.model_dump(), exp=int((now + REF_TTL).timestamp()))
    payload = base64.urlsafe_b64encode(live.model_dump_json().encode()).decode()
    return f"live:{payload}.{_mac(payload, secret)}"


def verify_place_ref(ref: str, secret: bytes, now: datetime) -> LivePlace | None:
    """The place a signed id names; None for a bad signature, bad shape or an expired id."""
    if not ref.startswith("live:") or "." not in ref:
        return None
    payload, _, mac = ref[len("live:") :].rpartition(".")
    if not hmac.compare_digest(mac.encode(), _mac(payload, secret).encode()):
        return None
    try:
        place = LivePlace.model_validate_json(base64.urlsafe_b64decode(payload.encode()))
    except (ValueError, ValidationError):
        return None
    return place if place.exp > now.timestamp() else None
