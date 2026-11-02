summary: |
  Commit scrubbed recorded Nominatim and Overpass responses (Lisbon, Kyoto, Paris, Porto; error, timeout, empty,
  category searches, one gzip response) and test the existing destination resolving and place search against them
  with no network: `NominatimResolver` + `OsmPlaceSearch` (Overpass) and `NominatimPlaceSearch` (category backup),
  including the Overpass-down and Overpass-timeout paths answered from the `IntegrationClient` cache. The recorder
  harness (`recorded.py`, `scrub.py`) exists but cannot replay gzip, and its scrubber would break the shape of
  Nominatim payloads (it turns the `address` object into a string and its phone pattern eats long coordinate
  strings), so both get small fixes first. The visible-message criteria are covered by web tests on the existing
  `DestinationResultsPage`. No production code changes.
scope:
  - description: |
      Make the scrubber structure-preserving. Today `_walk` replaces the whole value of a `PERSONAL_FIELDS` key with
      "[scrubbed]", so Nominatim's `address` object becomes a string and `NominatimResolver._location`
      (`hit["address"].get(...)`) and `_result_to_place` (`address.items()`) fail. Also `_PHONE` matches long
      numeric strings such as `"lat": "38.7077507"`, which would break `float(hit["lat"])`.
      Changes:
      - a personal key holding a dict or list keeps its structure and only leaf strings are redacted; a scalar is still replaced;
      - keys starting with `addr:` or `contact:`, plus `phone`, `email`, `website`, count as personal;
      - strings under `GEO_FIELDS = frozenset({"lat", "lon", "boundingbox", "place_id", "osm_id", "importance"})` are left alone (still passed through the email check).
      Signature unchanged: `scrub_body(body: bytes, *, secrets: Iterable[str]) -> bytes`.
    files:
      - services/api/tests/unit/integrations_support/scrub.py
    rationale: |
      AC15 needs scrubbed fixtures and AC1 needs the scrubbed Nominatim hit to still resolve; without this the two
      contradict each other.
  - description: |
      Teach the recorder to store and replay a gzip response. Fixture JSON gains an optional `"encoding": "gzip"`.
      `_replay` then gzips the stored text body and sets `Content-Encoding: gzip`, so the real httpx decoding path is
      exercised. `RecordingTransport` writes `"encoding": "gzip"` when the live response had `content-encoding: gzip`
      (the stored body stays the scrubbed, decoded text). Fixtures without the key replay exactly as today.
      Add an adapter for `NominatimResolver`, which takes an `http_get` callable rather than an `IntegrationClient`:
      ```python
      def replaying_http_get(transport: httpx.BaseTransport) -> Callable[..., httpx.Response]: ...
      ```
    files:
      - services/api/tests/unit/integrations_support/recorded.py
    rationale: |
      AC2, and lets the resolver read the same fixtures as the search classes.
  - description: |
      Add the committed fixtures and a one-off builder. `place_fixtures.py` holds payloads in the real Nominatim
      `jsonv2` and Overpass `out center tags` shapes for Lisbon, Kyoto, Paris, Porto (Porto is not in
      `SEED_CATALOGUE`); the seven `PHRASES` category searches per city; an empty Nominatim `[]` and empty Overpass
      `{"elements": []}`; a 500 and a 503 error; one gzip Overpass response. `write_place_fixtures(fixtures_dir)`
      runs each payload through `scrub_body` and writes `<fixture_key>.json` into
      `tests/unit/fixtures/recorded/places/`, building each request with the production code's own params
      (`overpass._query`, `PHRASES`, `PER_PHRASE`, resolver params) so keys match. The JSON is generated once and
      committed; tests only read it.
    files:
      - services/api/tests/unit/integrations_support/place_fixtures.py
      - services/api/tests/unit/fixtures/recorded/places/
    rationale: |
      AC1, 2, 6, 8, 10, 12, 14. See the open question on hand-built versus live-recorded payloads.
  - description: |
      New test module running production code against the fixtures through `ReplayTransport`: resolver +
      `OsmPlaceSearch` per city, the gzip case, Overpass-down and Overpass-timeout repeats served from the
      `IntegrationClient` cache, error/timeout/empty cases, `NominatimPlaceSearch` category cases, a network-off
      guard and a fixture-content scan. Timeouts come from a thin transport wrapper that raises `httpx.ReadTimeout`
      after the first request to a URL.
    files:
      - services/api/tests/unit/test_place_recorded_fixtures.py
    rationale: |
      All backend ACs (1-6, 8, 10, 12, 14, 15) and AC4.
  - description: |
      Web tests for the visible messages on the existing results page. Reuse `DestinationResultsPage` and its
      `stubApi` helper; no new component and no styling change, so no design tokens are used. Existing tests already
      cover a failed request (alert, near line 167) and an empty list (near line 147); add the timeout and
      down-with-no-cache cases and assert the cards are absent.
    files:
      - apps/web/src/places/DestinationResultsPage.test.tsx
    rationale: |
      AC7, 9, 11, 13.
tests:
  - |
    AC1 - `test_place_search_returns_places_for_each_recorded_city`, parametrised over Lisbon, Kyoto, Paris, Porto.
    Build `NominatimResolver(base, "UA", http_get=replaying_http_get(ReplayTransport(DIR)), tz_lookup=lambda *_: "Europe/Lisbon")`
    and `OsmPlaceSearch(resolver, IntegrationClient([overpass_settings(URL)], transport=ReplayTransport(DIR)), "UA")`.
    ```python
    found = search.search(city)
    assert len(found) > 1 and all(p.source == "osm" for p in found)
    assert found[0].id.startswith("osm-destination-")
    ```
    Fails first with `FixtureMissing`, and then because an unfixed scrubber breaks the resolver.
  - |
    AC2 - `test_gzip_overpass_response_is_decoded_and_returned`. Assert the raw replay carries the header, then the places.
    ```python
    assert raw.headers["content-encoding"] == "gzip"
    assert {p.provider_id for p in search.search("Porto")} >= {"node/1001", "way/1002"}
    ```
  - |
    AC3 - `test_overpass_down_repeat_returns_same_places_from_cache`. A transport wrapper answers from the fixture on
    call 1, then `httpx.Response(502)` for Overpass.
    ```python
    first = search.search("Lisbon")
    down.engage()
    assert search.search("Lisbon") == first
    assert down.overpass_calls == 1
    ```
  - |
    AC4 - an autouse fixture in the new module patches `socket.socket.connect` and `httpx.HTTPTransport.handle_request`
    to raise; a canary test proves the guard works.
    ```python
    with pytest.raises(Exception):
        httpx.get("https://nominatim.test")
    ```
    Run narrow, with the neighbouring place tests: `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_place_recorded_fixtures.py tests/unit/test_nominatim_places.py tests/unit/test_overpass_places.py tests/unit/test_place_fallback.py tests/unit/test_places_router.py tests/unit/test_nominatim_resolver.py)`.
  - |
    AC5 - `test_overpass_timeout_repeat_returns_same_places_from_cache`: as AC3 but the second Overpass call raises `httpx.ReadTimeout`.
    ```python
    assert search.search("Lisbon") == first
    ```
  - |
    AC6 - `test_error_response_returns_no_places`, parametrised: Nominatim resolve 500 (resolver gives None) and Overpass 500 with no backup; `NominatimPlaceSearch` with every phrase 503.
    ```python
    with pytest.raises(OsmUnavailableError):
        search.search("Lisbon")
    ```
  - |
    AC7 - web test, `/places` stubbed to a 500 (extends the existing failure test).
    ```ts
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load places.")
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    ```
  - |
    AC8 - `test_nominatim_timeout_returns_no_places`: the transport raises `httpx.ReadTimeout` for the resolver call and for every `NominatimPlaceSearch` phrase.
    ```python
    with pytest.raises(OsmUnavailableError):
        NominatimPlaceSearch(client, "UA", sleep=lambda s: None).search("Lisbon")
    ```
  - |
    AC9 - web test, `/places` fetch rejects as a timeout; assert the alert is visible.
    ```ts
    expect(await screen.findByRole('alert')).toBeVisible()
    ```
  - |
    AC10 - `test_overpass_down_with_no_cache_returns_no_places`: fresh `IntegrationClient`, Overpass 502, no backup.
    ```python
    with pytest.raises(OsmUnavailableError):
        search.search("Lisbon")
    ```
  - |
    AC11 - web test, the same failing `/places` stub for the down-with-no-cache case.
    ```ts
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load places. Try searching again.")
    ```
  - |
    AC12 - `test_empty_recorded_response_returns_zero_places`: Nominatim places `[]`.
    ```python
    assert NominatimPlaceSearch(client, "UA", sleep=lambda s: None).search("Nowhere") == []
    ```
    A second case notes the existing behaviour that an empty Overpass answer still yields only the searched city (`osm-destination-...`); see the open question.
  - |
    AC13 - web test, `/places` stubbed to `[]`.
    ```ts
    expect(await screen.findByText('No places match your search')).toBeInTheDocument()
    ```
  - |
    AC14 - `test_category_fixtures_tag_every_place_with_the_searched_category`, parametrised over `PHRASES` and the four cities. A recording wrapper notes `q` per request so each phrase's places can be checked.
    ```python
    assert {p.category for p in from_phrase["restaurant"]} == {"food"}
    assert {p.category for p in from_phrase["bar"]} == {"nightlife"}
    ```
    Mapping: attraction, monument, historic -> sights; viewpoint -> viewpoints; museum -> museums; restaurant, cafe -> food; bar -> nightlife. Also `/places?destination=Lisbon&category=museums` over a replayed search returns only `museums`.
  - |
    AC15 - `test_committed_fixtures_contain_no_secrets_or_personal_data`: scan every JSON under `tests/unit/fixtures/recorded/places/`.
    ```python
    assert not re.search(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", text)
    assert not re.search(r"(?i)api[_-]?key|access[_-]?token|authorization|bearer ", text)
    assert all(v == "[scrubbed]" for v in values_of_keys(data, {"name", "email", "phone"}))
    ```
    The phone pattern is checked after removing numeric `lat`/`lon`/`osm_id`/`place_id` fields. Plus scrubber unit tests: `scrub_body` on a Nominatim hit keeps `isinstance(hit["address"], dict)`, keeps `hit["address"]["country_code"]`, and keeps `float(hit["lat"])` parseable; a body with a planted email, phone and key is still cleaned.
assumptions_or_open_questions:
  - |
    Recording needs live network and a person opting in to the providers (docs/agent-prompts/02b). The implementing
    agent must not contact those servers, so payloads are hand-built in the real response shapes and written through
    the same scrub and keying path. If the reviewer wants true recordings, a person records once with
    `RecordingTransport` and the builder is dropped; the tests do not change.
  - |
    Scrubbing redacts every `name`, so place names in fixtures become "[scrubbed]". Tests assert ids, counts,
    categories and provider ids, never names. AC15's "name" is read as including place names; the scrubber cannot tell a public POI name from a personal one.
  - |
    Failure has two layers. `OsmPlaceSearch` and `NominatimPlaceSearch` raise `OsmUnavailableError` (no places), but
    `FallbackPlaceSearch` (wired in `deps.get_places`) catches that and serves the seed catalogue with a notice.
    AC6, 8 and 10 are therefore tested at the search-class level and AC7, 9 and 11 at the web page level. Whether the
    API should return an error instead of seed data is a product change this plan does not make. Please confirm.
  - |
    No timeout-specific message exists today; the page shows "We couldn't load places. Try searching again." for any
    failure. AC9 is met by that alert. Distinct "timed out" wording would need a new API error code and a web change,
    left out unless the reviewer asks.
  - |
    An empty Overpass result still returns the searched city as one place (`_destination_place`), so "zero places" in
    AC12 holds for `NominatimPlaceSearch` and for the route after category filtering, not for `OsmPlaceSearch` alone.
    Confirm that this existing behaviour stays.
  - |
    `timezonefinder` is bypassed with a `tz_lookup` stub so the tests need no data files. Existing mock-transport tests stay as they are.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — test helpers and committed test fixtures only. No production code, stored data, settings or migrations
  change; rollback is reverting the commit.

  Reused: `IntegrationClient` and its in-memory cache (`app/integrations/client.py`, TTL 3600 s serves the repeat when
  Overpass is down), `ReplayTransport` and `fixture_key` (`recorded.py`), `scrub_body` (`scrub.py`), the
  `tests/unit/fixtures/recorded/` folder, and the existing `DestinationResultsPage` messages.

  ```mermaid
  flowchart TD
    T[test_place_recorded_fixtures.py]:::touched -->|replays| R[recorded.py ReplayTransport]:::touched
    R -->|scrubbed JSON| F[fixtures/recorded/places]:::touched
    B[place_fixtures.py builder]:::touched -->|scrub_body| S[scrub.py]:::touched
    B --> F
    T --> O[OsmPlaceSearch overpass.py]
    T --> N[NominatimPlaceSearch nominatim_places.py]
    T --> NR[NominatimResolver locations/nominatim.py]
    O --> C[IntegrationClient client.py]
    N --> C
    O -->|backup| N
    W[DestinationResultsPage.test.tsx]:::touched --> P[DestinationResultsPage.tsx]
    classDef touched fill:#f96,color:#000
  ```
  Orange nodes are changed or added; the rest is production code that is only exercised.
review_focus: |
  IN: test helpers (`scrub.py`, `recorded.py`), committed fixtures, one new backend test module, added web tests.
  OUT: any production change (no new error codes, no change to `FallbackPlaceSearch` or the integration client).
  Riskiest part is the scrubber change: it must keep Nominatim's `address` object and numeric coordinate strings
  intact while still removing personal data, and the AC15 scan must really fail on a leaked email, phone or key.
  Deliberate: fixtures are hand-built in real response shapes, names are scrubbed so tests assert ids and categories,
  and AC6/8/10 are checked at the search-class level because production falls back to seed data.
