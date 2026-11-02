import gzip
import json

import httpx

from app.integrations.client import IntegrationClient
from app.integrations.settings import ProviderSettings

BODY = [{"name": "Taj Mahal"}]
SETTINGS = ProviderSettings(name="gz", base_url="https://gz.test", retries=0, cache_ttl_seconds=60)


def gzip_handler(calls):
    def handler(request):
        calls.append(request)
        return httpx.Response(
            200,
            content=gzip.compress(json.dumps(BODY).encode()),
            headers={"content-encoding": "gzip", "content-type": "application/json"},
        )

    return handler


def test_a_compressed_response_can_be_read_again_from_the_cache():
    calls = []
    client = IntegrationClient([SETTINGS], transport=httpx.MockTransport(gzip_handler(calls)))
    first = client.request("gz", "GET", "/x")
    second = client.request("gz", "GET", "/x")
    assert first.json() == BODY
    assert second.json() == BODY
    assert len(calls) == 1


def test_a_cached_copy_does_not_claim_an_encoding_it_no_longer_has():
    client = IntegrationClient([SETTINGS], transport=httpx.MockTransport(gzip_handler([])))
    client.request("gz", "GET", "/x")
    cached = client.request("gz", "GET", "/x")
    assert "content-encoding" not in cached.headers
    assert cached.headers["content-type"] == "application/json"
