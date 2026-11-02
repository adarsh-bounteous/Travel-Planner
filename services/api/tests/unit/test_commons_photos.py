import json

import httpx
import pytest

from app.integrations.client import IntegrationClient
from app.places.commons import CommonsPhotos, commons_settings
from app.places.local_search import PLACEHOLDER_IMAGE
from app.places.search import Place


def osm(slug, commons_file=None, wikidata_id=None):
    return Place(
        id=f"osm-{slug}", name=slug, image_url=PLACEHOLDER_IMAGE, place_type="landmark", lat=1, lng=2,
        source="osm", commons_file=commons_file, wikidata_id=wikidata_id,
    )


def tagged(n):
    return [osm(f"p{i}", commons_file=f"File:P{i}.jpg") for i in range(n)]


def page(title, licence="cc-by-sa-4.0", short="CC BY-SA 4.0", artist="Ana", thumb=None, desc=None):
    name = title.removeprefix("File:")
    return {
        "title": title,
        "imageinfo": [
            {
                "thumburl": thumb or f"https://upload.wikimedia.org/thumb/{name}",
                "descriptionurl": desc or f"https://commons.wikimedia.org/wiki/{title}",
                "extmetadata": {
                    "License": {"value": licence},
                    "LicenseShortName": {"value": short},
                    "Artist": {"value": artist},
                },
            }
        ],
    }


def commons_body(titles, **kwargs):
    return {"query": {"pages": {str(i): page(t, **kwargs) for i, t in enumerate(titles)}}}


class Transport(httpx.BaseTransport):
    def __init__(self, handler):
        self.handler = handler
        self.requests = []

    def handle_request(self, request):
        self.requests.append(request)
        result = self.handler(request)
        if isinstance(result, Exception):
            raise result
        if isinstance(result, httpx.Response):
            return result
        return httpx.Response(200, json=result)


def commons_ok(**kwargs):
    def handler(request):
        return commons_body(request.url.params["titles"].split("|"), **kwargs)

    return handler


def service(handler, cap=8, ttl=100.0, clock=lambda: 0.0):
    transport = Transport(handler)
    client = IntegrationClient(commons_settings(), transport=transport)
    return CommonsPhotos(client, "test-agent", cap, ttl, clock), transport


def test_commons_tag_with_allowed_licence_gets_photo():  # AC1
    svc, _ = service(commons_ok())
    out = svc.attach([osm("a", commons_file="File:A.jpg")])
    assert out[0].image_url.startswith("https://upload.wikimedia.org/")
    assert out[0].photo.author == "Ana" and out[0].photo.licence == "CC BY-SA 4.0"
    assert out[0].photo.file_url == "https://commons.wikimedia.org/wiki/File:A.jpg"


def test_wikidata_only_place_gets_photo():  # AC2
    def handler(request):
        if request.url.host == "www.wikidata.org":
            return {"entities": {"Q1": {"claims": {"P18": [{"mainsnak": {"datavalue": {"value": "A.jpg"}}}]}}}}
        return commons_body(request.url.params["titles"].split("|"))

    svc, transport = service(handler)
    out = svc.attach([osm("w", wikidata_id="Q1")])
    assert out[0].photo is not None and out[0].image_url.startswith("https://upload.wikimedia.org/")
    assert [r.url.host for r in transport.requests] == ["www.wikidata.org", "commons.wikimedia.org"]


def test_wikidata_without_image_keeps_placeholder():
    svc, transport = service(lambda r: {"entities": {"Q1": {"claims": {}}}})
    out = svc.attach([osm("w", wikidata_id="Q1")])
    assert out[0].photo is None and out[0].image_url == PLACEHOLDER_IMAGE and not out[0].photo_unavailable
    assert len(transport.requests) == 1


def test_untagged_place_makes_no_call():  # AC3
    svc, transport = service(commons_ok())
    out = svc.attach([osm("n"), osm("c", commons_file="Category:Lisbon")])
    assert transport.requests == []
    assert all(p.image_url == PLACEHOLDER_IMAGE and p.photo is None for p in out)


def test_seed_place_is_never_looked_up():
    svc, transport = service(commons_ok())
    seed = osm("s", commons_file="File:A.jpg").model_copy(update={"source": "seed"})
    svc.attach([seed])
    assert transport.requests == []


@pytest.mark.parametrize("licence", ["cc-by-nc-4.0", "cc-by-nc-sa-4.0", "cc-by-nd-4.0", "", "all-rights-reserved"])
def test_disallowed_licence_keeps_placeholder_without_credit(licence):  # AC4, AC5
    svc, _ = service(commons_ok(licence=licence))
    out = svc.attach([osm("a", commons_file="File:A.jpg")])
    assert out[0].image_url == PLACEHOLDER_IMAGE and out[0].photo is None and out[0].photo_unavailable is False


def test_missing_licence_metadata_is_rejected():
    body = {"query": {"pages": {"1": {"title": "File:A.jpg", "imageinfo": [{"thumburl": "x", "extmetadata": {}}]}}}}
    svc, _ = service(lambda r: body)
    assert svc.attach([osm("a", commons_file="File:A.jpg")])[0].photo is None


@pytest.mark.parametrize("licence", ["cc0-1.0", "cc-by-4.0", "cc-by-sa-3.0", "pd", "pd-old-70"])
def test_allowed_licences(licence):
    svc, _ = service(commons_ok(licence=licence))
    assert svc.attach([osm("a", commons_file="File:A.jpg")])[0].photo is not None


def test_author_html_is_stripped_and_trimmed():
    svc, _ = service(commons_ok(artist='<a href="x">Ana &amp; Bo</a><script>x</script>' + "z" * 300))
    author = svc.attach([osm("a", commons_file="File:A.jpg")])[0].photo.author
    assert author.startswith("Ana & Bo") and "<" not in author and len(author) <= 100


@pytest.mark.parametrize(
    "kwargs",
    [
        {"thumb": "http://upload.wikimedia.org/a.jpg"},
        {"thumb": "https://evil.example/a.jpg"},
        {"desc": "https://evil.example/wiki/File:A.jpg"},
        {"desc": "javascript:alert(1)"},
    ],
)
def test_unsafe_urls_are_rejected(kwargs):
    svc, _ = service(commons_ok(**kwargs))
    out = svc.attach([osm("a", commons_file="File:A.jpg")])
    assert out[0].photo is None and out[0].image_url == PLACEHOLDER_IMAGE


def test_redirected_title_is_matched():
    body = {
        "query": {
            "normalized": [{"from": "File:a b.jpg", "to": "File:A b.jpg"}],
            "redirects": [{"from": "File:A b.jpg", "to": "File:New.jpg"}],
            "pages": {"1": page("File:New.jpg")},
        }
    }
    svc, _ = service(lambda r: body)
    assert svc.attach([osm("a", commons_file="File:a b.jpg")])[0].photo is not None


def test_five_places_one_batched_request():  # AC11
    svc, transport = service(commons_ok())
    svc.attach(tagged(5))
    assert len(transport.requests) == 1 and transport.requests[0].url.params["titles"].count("|") == 4
    assert transport.requests[0].headers["User-Agent"] == "test-agent"


def test_eight_places_all_get_photos_at_default_cap():  # AC10
    svc, _ = service(commons_ok())
    assert all(p.photo for p in svc.attach(tagged(8)))


def test_nine_places_look_up_only_eight():  # AC12, AC16
    svc, transport = service(commons_ok())
    out = svc.attach(tagged(9))
    assert transport.requests[0].url.params["titles"].count("|") == 7
    assert out[8].image_url == PLACEHOLDER_IMAGE and out[8].photo is None and out[8].photo_unavailable is False


def test_cap_zero_looks_nothing_up():
    svc, transport = service(commons_ok(), cap=0)
    svc.attach(tagged(3))
    assert transport.requests == []


def test_place_beyond_cap_fills_in_on_a_later_request():  # AC17
    svc, transport = service(commons_ok())
    places = tagged(9)
    svc.attach(places[8:])
    assert len(transport.requests) == 1
    transport.handler = lambda r: httpx.ConnectError("down")
    out = svc.attach(places)
    # the 8 unseen places use the cap; the 9th comes from the memo, and nothing fails for it
    assert out[8].photo is not None


def test_memo_serves_repeat_requests_and_expires():
    now = [0.0]
    svc, transport = service(commons_ok(), ttl=10, clock=lambda: now[0])
    svc.attach(tagged(2))
    svc.attach(tagged(2))
    assert len(transport.requests) == 1
    now[0] = 11
    svc.attach(tagged(2))
    assert len(transport.requests) == 2


def test_no_allowed_image_is_memoised_too():
    svc, transport = service(commons_ok(licence="cc-by-nc-4.0"))
    svc.attach(tagged(1))
    svc.attach(tagged(1))
    assert len(transport.requests) == 1


@pytest.mark.parametrize(
    "failure",
    [httpx.ConnectTimeout("slow"), httpx.Response(503), httpx.Response(200, content=b"not json")],
)
def test_failed_lookup_shows_unavailable_and_is_not_memoised(failure):  # AC14, AC15
    outcome = [failure]
    svc, transport = service(lambda r: outcome[0])
    out = svc.attach([osm("a", commons_file="File:A.jpg")])
    assert out[0].image_url == PLACEHOLDER_IMAGE and out[0].photo_unavailable is True
    outcome[0] = commons_body(["File:A.jpg"])
    retry = svc.attach([osm("a", commons_file="File:A.jpg")])
    assert retry[0].photo is not None and retry[0].photo_unavailable is False


def test_open_breaker_does_not_raise():
    svc, _ = service(lambda r: httpx.Response(503))
    for _ in range(5):
        out = svc.attach([osm("a", commons_file="File:A.jpg")])
    assert out[0].photo_unavailable is True


def test_wikidata_failure_does_not_block_commons_tagged_places():
    def handler(request):
        if request.url.host == "www.wikidata.org":
            return httpx.Response(503)
        return commons_body(request.url.params["titles"].split("|"))

    svc, _ = service(handler)
    out = svc.attach([osm("w", wikidata_id="Q1"), osm("c", commons_file="File:A.jpg")])
    assert out[0].photo_unavailable is True and out[1].photo is not None


def test_tags_are_not_serialised():
    dumped = json.loads(osm("a", commons_file="File:A.jpg", wikidata_id="Q1").model_dump_json())
    assert "commons_file" not in dumped and "wikidata_id" not in dumped
    assert dumped["photo"] is None and dumped["photo_unavailable"] is False
