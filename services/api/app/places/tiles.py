import logging
import time
from collections import OrderedDict
from collections.abc import Callable

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

MAX_ZOOM = 19
CACHE_SECONDS = 3600
TIMEOUT_SECONDS = 5.0
MAX_CACHED_TILES = 2000


class InvalidTileError(ValueError):
    pass


class TileUnavailableError(RuntimeError):
    """The tile server did not give a tile."""


class TileSource:
    """Fetches map tiles server-side, so each request carries the identifying headers the tile policy needs."""

    def __init__(
        self,
        settings: Settings,
        client: httpx.Client | None = None,
        clock: Callable[[], float] = time.monotonic,
        max_entries: int = MAX_CACHED_TILES,
    ) -> None:
        self._template = settings.osm_tile_url_template
        self._headers = {
            "User-Agent": settings.osm_user_agent or "TripPlanner/1.0",
            "Referer": settings.osm_referer or settings.web_origin,
        }
        self._client = client or httpx.Client(timeout=TIMEOUT_SECONDS)
        self._clock = clock
        self._max_entries = max_entries
        self._cache: OrderedDict[tuple[int, int, int], tuple[float, bytes, str]] = OrderedDict()

    def fetch(self, z: int, x: int, y: int) -> tuple[bytes, str]:
        if not 0 <= z <= MAX_ZOOM or not (0 <= x < 2**z and 0 <= y < 2**z):
            raise InvalidTileError
        key = (z, x, y)
        hit = self._cache.get(key)
        if hit and hit[0] > self._clock():
            self._cache.move_to_end(key)
            return hit[1], hit[2]
        try:
            response = self._client.get(
                self._template.format(z=z, x=x, y=y), headers=self._headers, timeout=TIMEOUT_SECONDS
            )
        except httpx.HTTPError as error:
            logger.warning("tile server unreachable: %s", type(error).__name__)
            raise TileUnavailableError from error
        if response.status_code != 200:
            logger.warning("tile server answered %s", response.status_code)
            raise TileUnavailableError
        content_type = response.headers.get("content-type", "image/png")
        self._cache[key] = (self._clock() + CACHE_SECONDS, response.content, content_type)
        self._cache.move_to_end(key)
        while len(self._cache) > self._max_entries:
            self._cache.popitem(last=False)  # least recently used goes first
        return response.content, content_type
