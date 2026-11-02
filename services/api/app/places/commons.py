import html
import re
import time
from collections.abc import Callable
from typing import Protocol
from urllib.parse import urlparse

from app.integrations.client import IntegrationClient
from app.integrations.errors import IntegrationError
from app.integrations.settings import ProviderSettings
from app.places.search import Place, PlacePhoto

COMMONS_URL = "https://commons.wikimedia.org"
WIKIDATA_URL = "https://www.wikidata.org"
COMMONS_HOST = "commons.wikimedia.org"
UPLOAD_HOST = "upload.wikimedia.org"
THUMB_WIDTH = "640"

# Licence families (the Commons "License" metadata key without its version) a photo may carry.
ALLOWED_LICENCES = frozenset({"cc0", "cc-by", "cc-by-sa", "pd"})

MAX_AUTHOR = 100
MAX_LICENCE = 40
MAX_TITLE = 255
MAX_URL = 2048
UNKNOWN_AUTHOR = "Unknown author"

_TAG = re.compile(r"<[^>]*>")
_WIKIDATA_ID = re.compile(r"^Q\d+$")


def commons_settings() -> list[ProviderSettings]:
    """Commons and Wikidata, both behind the one `commons` switch.

    Client caching is off: it keys on the whole batch, so it would never hit across batches.
    The per-title memo in CommonsPhotos is the cache.
    """

    def settings(name: str, base_url: str) -> ProviderSettings:
        return ProviderSettings(
            name=name,
            base_url=base_url,
            retries=0,  # a slow Commons must never stall a results page
            timeout_seconds=3,
            cache_ttl_seconds=0,
            rate_limit_calls=5,
            rate_limit_period_seconds=1,
            breaker_threshold=3,
            breaker_cooldown_seconds=60,
        )

    return [settings("commons", COMMONS_URL), settings("commons-wikidata", WIKIDATA_URL)]


def is_commons_file_page(url: str) -> bool:
    parts = urlparse(url)
    return parts.scheme == "https" and parts.hostname == COMMONS_HOST and parts.path.startswith("/wiki/File:")


def _licence_family(key: str) -> str:
    tokens = key.lower().split("-")
    if tokens[0] in ("pd", "cc0"):
        return tokens[0]
    family = []
    for token in tokens:
        if token[:1].isdigit():
            break
        family.append(token)
    return "-".join(family)


def _clean_author(raw: str) -> str:
    text = " ".join(html.unescape(_TAG.sub("", raw)).split())
    return text[:MAX_AUTHOR].strip() or UNKNOWN_AUTHOR


class PlacePhotos(Protocol):
    def attach(self, places: list[Place]) -> list[Place]: ...


class NoPhotos:
    """The commons switch is off: places keep their placeholder."""

    def attach(self, places: list[Place]) -> list[Place]:
        return places


class _Found:
    def __init__(self, thumbnail: str, photo: PlacePhoto) -> None:
        self.thumbnail = thumbnail
        self.photo = photo


class _LookupFailed(Exception):
    pass


class CommonsPhotos:
    """Open-licensed photos for OSM places tagged with a Commons file or a Wikidata item.

    Looks up at most `cap` places a call, in one batched Commons request. What it learns (a photo, or
    that there is no usable one) is remembered for `ttl_seconds`, so places past the cap fill in on later
    requests. Failures are never remembered.
    """

    def __init__(
        self,
        client: IntegrationClient,
        user_agent: str,
        cap: int,
        ttl_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client
        self._headers = {"User-Agent": user_agent}
        self._cap = cap
        self._ttl = ttl_seconds
        self._clock = clock
        self._memo: dict[tuple[str, str], tuple[float, _Found | None]] = {}

    def attach(self, places: list[Place]) -> list[Place]:
        keyed = [(p, self._key(p)) for p in places]
        results: dict[tuple[str, str], _Found | None] = {}
        pending: list[tuple[str, str]] = []
        for _, key in keyed:
            if key is None or key in results or key in pending:
                continue
            cached = self._recall(key)
            if cached is not None:
                results[key] = cached[0]
            else:
                pending.append(key)
        failed = self._look_up(pending[: self._cap], results)
        return [self._with_photo(p, key, results, failed) for p, key in keyed]

    @staticmethod
    def _key(place: Place) -> tuple[str, str] | None:
        if place.source != "osm":
            return None
        file = place.commons_file
        if file and file.startswith("File:") and len(file) <= MAX_TITLE and "|" not in file:
            return ("file", file)
        if place.wikidata_id and _WIKIDATA_ID.match(place.wikidata_id):
            return ("wikidata", place.wikidata_id)
        return None

    def _recall(self, key: tuple[str, str]) -> tuple[_Found | None] | None:
        entry = self._memo.get(key)
        if entry is None:
            return None
        expires, found = entry
        if self._clock() >= expires:
            del self._memo[key]
            return None
        return (found,)

    def _remember(self, key: tuple[str, str], found: _Found | None, results: dict) -> None:
        self._memo[key] = (self._clock() + self._ttl, found)
        results[key] = found

    def _look_up(self, keys: list[tuple[str, str]], results: dict) -> set[tuple[str, str]]:
        """Fill `results` for `keys`; returns the keys whose lookup failed."""
        failed: set[tuple[str, str]] = set()
        titles: dict[tuple[str, str], str] = {k: k[1] for k in keys if k[0] == "file"}
        wikidata = [k for k in keys if k[0] == "wikidata"]
        no_image: list[tuple[str, str]] = []
        if wikidata:
            try:
                files = self._wikidata_files([k[1] for k in wikidata])
            except _LookupFailed:
                failed.update(wikidata)
            else:
                for key in wikidata:
                    if key[1] in files:
                        titles[key] = files[key[1]]
                    else:
                        no_image.append(key)
        for key in no_image:
            self._remember(key, None, results)
        if titles:
            try:
                found = self._commons_images(sorted(set(titles.values())))
            except _LookupFailed:
                failed.update(titles)
            else:
                for key, title in titles.items():
                    self._remember(key, found.get(title), results)
        return failed

    def _get(self, provider: str, path: str, params: dict[str, str]) -> dict:
        try:
            response = self._client.request(provider, "GET", path, params=params, headers=self._headers)
            if not response.is_success:
                raise _LookupFailed(str(response.status_code))
            body = response.json()
        except (IntegrationError, ValueError) as error:
            raise _LookupFailed(type(error).__name__) from error
        if not isinstance(body, dict):
            raise _LookupFailed("unexpected body")
        return body

    def _wikidata_files(self, ids: list[str]) -> dict[str, str]:
        """The P18 (image) file name of each item that has one."""
        body = self._get(
            "commons-wikidata",
            "/w/api.php",
            {"action": "wbgetentities", "ids": "|".join(ids), "props": "claims", "format": "json"},
        )
        files: dict[str, str] = {}
        entities = body.get("entities")
        for item_id, entity in (entities.items() if isinstance(entities, dict) else []):
            try:
                name = entity["claims"]["P18"][0]["mainsnak"]["datavalue"]["value"]
            except (KeyError, IndexError, TypeError):
                continue
            if isinstance(name, str) and name and len(name) <= MAX_TITLE and "|" not in name:
                files[item_id] = f"File:{name}"
        return files

    def _commons_images(self, titles: list[str]) -> dict[str, _Found]:
        body = self._get(
            "commons",
            "/w/api.php",
            {
                "action": "query",
                "prop": "imageinfo",
                "iiprop": "url|extmetadata",
                "iiurlwidth": THUMB_WIDTH,
                "redirects": "1",
                "format": "json",
                "titles": "|".join(titles),
            },
        )
        try:
            query = body["query"]
            pages = [p for p in query.get("pages", {}).values() if isinstance(p, dict)]
            # A requested title may have been normalised or redirected to the title the page carries.
            renamed = {t: t for t in titles}
            for step in ("normalized", "redirects"):
                moves = {m["from"]: m["to"] for m in query.get(step, [])}
                renamed = {t: moves.get(now, now) for t, now in renamed.items()}
        except (KeyError, TypeError, AttributeError) as error:
            raise _LookupFailed("unexpected body") from error
        by_title = {page.get("title"): _found(page) for page in pages}
        return {t: found for t, now in renamed.items() if (found := by_title.get(now)) is not None}

    @staticmethod
    def _with_photo(
        place: Place, key: tuple[str, str] | None, results: dict, failed: set[tuple[str, str]]
    ) -> Place:
        if key is None:
            return place
        if key in failed:
            return place.model_copy(update={"photo_unavailable": True})
        found = results.get(key)
        if found is None:
            return place
        return place.model_copy(update={"image_url": found.thumbnail, "photo": found.photo})


def _found(page: dict) -> _Found | None:
    """The photo on a Commons page, or None when its licence, thumbnail or file page is not acceptable."""
    try:
        info = page["imageinfo"][0]
        meta = info["extmetadata"]
        licence_key = meta["License"]["value"]
        thumbnail = info["thumburl"]
        file_url = info["descriptionurl"]
    except (KeyError, IndexError, TypeError):
        return None
    if not all(isinstance(v, str) for v in (licence_key, thumbnail, file_url)):
        return None
    if _licence_family(licence_key) not in ALLOWED_LICENCES:
        return None
    thumb = urlparse(thumbnail)
    if thumb.scheme != "https" or thumb.hostname != UPLOAD_HOST or len(thumbnail) > MAX_URL:
        return None
    if not is_commons_file_page(file_url) or len(file_url) > MAX_URL:
        return None
    short = meta.get("LicenseShortName", {}).get("value")
    licence = " ".join(html.unescape(_TAG.sub("", short if isinstance(short, str) else licence_key)).split())
    artist = meta.get("Artist", {}).get("value")
    author = _clean_author(artist if isinstance(artist, str) else "")
    return _Found(thumbnail, PlacePhoto(author=author, licence=licence[:MAX_LICENCE], file_url=file_url))
