summary: |
  Commit scrubbed recorded Nominatim and Overpass responses (Lisbon, Kyoto, Paris, Porto; error, timeout, empty,
  category searches, one gzip response) and test the existing place search and destination resolving against them
  with no network: `NominatimResolver` + `OsmPlaceSearch` (Overpass) and `NominatimPlaceSearch` (category backup),
  including the Overpass-down and Overpass-timeout paths that are answered from the integration cache. The
  recorder harness (`recorded.py`, `scrub.py`) already exists but cannot yet replay the shapes these responses need
  (gzip) and its scrubber would break the Nominatim/Overpass payload shape, so both get small fixes first. The
  visible-message criteria are covered by web tests on the existing places page.
scope:
  - description: |
      Make the scrubber structure-preserving. Today `scrub_body` replaces the whole value of keys in
      `PERSONAL_FIELDS` (`name`, `address`, `city`, ...) with the string "[scrubbed]". For Nominatim that turns the
      `address` object into a string, and `NominatimResolver._location` (`hit["address"].get(...)`) and
      `_result_to_place` (`address.items()`) then fail. Change `_walk` so a personal key holding a dict or list keeps
      its structure and only its leaf strings are redacted; a personal key holding a scalar is still replaced.
      Also treat OSM contact/address tag keys as personal: any key starting with `addr:` or `contact:`, plus
      `phone`, `email`, `website`. Signature unchanged: `scrub_body(body: bytes, *, secrets: Iterable[str]) -> bytes`.
    files:
      - services/api/tests/unit/integrations_support/scrub.py
    rationale: |
      AC15 needs scrubbed fixtures, AC1 needs the scrubbed Nominatim hit to still resolve. Without this the two
      requirements contradict each other.
  - description: |
      Teach the recorder to store and replay a gzip response. Fixture JSON gains an optional
      `"encoding": "gzip"`. `_replay` then gzips the stored text body and sets `Content-Encoding: gzip`, so the
      real `httpx` decoding path is exercised; `RecordingTransport` writes `"encoding": "gzip"` when the live
      response had `content-encoding: gzip` (the stored body stays the scrubbed, decoded text). Fixtures without the
      key replay exactly as today. Add a `ReplayTransport` helper `replaying_http_get(transport)` that adapts it to
      `NominatimResolver`'s `http_get` argument: `def replaying_http_get(transport: httpx.BaseTransport) -> Callable[..., httpx.Response]`.
    files:
      - services/api/tests/unit/integrations_support/recorded.py
    rationale: |
      AC2. The resolver uses `httpx.get` (not `IntegrationClient`), so it needs an adapter to read the same fixtures.
  - description: |
      Add the committed fixtures and a one-off builder. `place_fixtures.py` holds the response payloads in the real
      Nominatim `jsonv2` and Overpass `out center tags` shapes (lat/lon, boundingbox, display_name, address with
      country_code, extratags, osm_type/osm_id, elements with tags and center) for Lisbon, Kyoto, Paris, Porto; the
      seven `PHRASES` category searches per city; an empty Nominatim `[]` and empty Overpass `{"elements": []}`;
      a 500 and a 429/503 error; and one gzip Overpass response. `write_place_fixtures(fixtures_dir)` runs each
      payload through `scrub_body` and writes `<fixture_key>.json` files into
      `tests/unit/fixtures/recorded/places/`, keyed with `fixture_key` using the exact request the production code
      sends (reuse `overpass._query` and the params in `NominatimPlaceSearch`/`NominatimResolver` so keys match).
      The JSON files are generated once and committed; tests only read them.
    files:
      - services/api/tests/unit/integrations_support/place_fixtures.py
      - services/api/tests/unit/fixtures/recorded/places/
    rationale: |
      AC1, 2, 6, 8, 10, 12, 14. See the open question about hand-built versus live-recorded payloads.
  - description: |
      New test module running the production code against the fixtures through `ReplayTransport`:
      resolver + `OsmPlaceSearch` per city, gzip case, Overpass-down and Overpass-timeout repeat served from the
      `IntegrationClient` cache, error/timeout/empty cases, `NominatimPlaceSearch` category cases, a network-off
      guard, and a fixture-content scan. Timeouts are produced by a thin transport wrapper that raises
      `httpx.ReadTimeout` after the first request to a given URL. No production code change.
    files:
      - services/api/tests/unit/test_place_recorded_fixtures.py
    rationale: |
      All backend ACs (1-6, 8, 10, 12, 14, 15) and AC4.
  - description: |
      Web tests for the visible messages on the existing results page. Reuse `DestinationResultsPage` and its
      `stubApi` helper; no new component. Error and timeout/down-with-no-cache responses from `/places` show the
      `role="alert"` message; an empty list shows "No places match your search" (rendered with `EmptyStateArt`). Styling is untouched, so no
      design tokens are used. See the open question on a distinct timeout message.
    files:
      - apps/web/src/places/DestinationResultsPage.test.tsx
    rationale: |
      AC7, 9, 11, 13. The messages exist already; these tests pin them against failing and empty responses.
tests:
  - |
    AC1 - `test_place_search_returns_places_for_each_recorded_city`, parametrised over Lisbon, Kyoto, Paris, Porto
    (Porto is not in `SEED_CATALOGUE`). Build `NominatimResolver(base, "UA", http_get=replaying_http_get(ReplayTransport(DIR)), tz_lookup=lambda *_: "Europe/Lisbon")`
    and `OsmPlaceSearch(resolver, IntegrationClient([overpass_settings(URL)], transport=ReplayTransport(DIR)), "UA")`.
    ```python
    found = search.search(city)
    assert len(found) > 1 and all(p.source == "osm" for p in found)
    assert found[0].id.startswith("osm-destination-")
    ```
    Fails first because no fixture exists (`FixtureMissing`), and because the scrubbed address breaks the resolver.
  - |
    AC2 - `test_gzip_overpass_response_is_decoded_and_returned`. The recorded Overpass response for one city has
    `"encoding": "gzip"`; first assert the replayed response carries the header
    (`assert r.headers["content-encoding"] == "gzip"` on a raw `ReplayTransport` call), then
    ```python
    assert {p.provider_id for p in search.search("Porto")} >= {"node/1001", "way/1002"}
    ```
  - |
    AC3 - `test_overpass_down_repeat_returns_same_places_from_cache`. Transport wrapper answers 200 from the fixture on
    call 1, then `httpx.Response(502)` for Overpass.
    ```python
    first = search.search("Lisbon")
    down.engage()
    assert search.search("Lisbon") == first
    assert down.overpass_calls == 1  # the repeat never reached Overpass
    ```
  - |
    AC4 - `test_place_suite_makes_no_network_call`: an autouse fixture in the new module patches `socket.socket.connect`
    and `httpx.HTTPTransport.handle_request` to raise, so any live call fails the test; the module's own tests
    all pass under it. `assert` the guard by a canary test using `pytest.raises` around a real `httpx.get("https://nominatim.test")`.
    Run narrow: `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_place_recorded_fixtures.py tests/unit/test_nominatim_places.py tests/unit/test_overpass_places.py tests/unit/test_place_fallback.py tests/unit/test_places_router.py tests/unit/test_nominatim_resolver.py)`.
  - |
    AC5 - `test_overpass_timeout_repeat_returns_same_places_from_cache`: same as AC3 but the second call raises
    `httpx.ReadTimeout`.
    ```python
    assert search.search("Lisbon") == first
    ```
  - |
    AC6 - `test_error_response_returns_no_places`, parametrised: Nominatim resolve 500 (resolver returns None) and
    Overpass 500 with no backup.
    ```python
    with pytest.raises(OsmUnavailableError):
        search.search("Lisbon")
    ```
    Plus `NominatimPlaceSearch` with every category 503 raises `OsmUnavailableError`. No place list is ever returned.
  - |
    AC7 - web test in `DestinationResultsPage.test.tsx`: `/places` stubbed to a 500.
    ```ts
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load places.")
    ```
  - |
    AC8 - `test_nominatim_timeout_returns_no_places`: transport raises `httpx.ReadTimeout` for the resolver call
    (resolver returns None) and for every `NominatimPlaceSearch` phrase.
    ```python
    with pytest.raises(OsmUnavailableError):
        search.search("Lisbon")
    ```
  - |
    AC9 - web test: `/places` fetch rejects with a timeout error (as in the existing failure test at
    `DestinationResultsPage.test.tsx:154-170`); assert the alert is visible. If the reviewer wants timeout-specific
    wording, the expected text changes here (open question).
    ```ts
    expect(await screen.findByRole('alert')).toBeVisible()
    ```
  - |
    AC10 - `test_overpass_down_with_no_cache_returns_no_places`: fresh `IntegrationClient` (empty cache), Overpass 502,
    no backup, resolver fixture ok.
    ```python
    with pytest.raises(OsmUnavailableError):
        search.search("Lisbon")
    ```
  - |
    AC11 - web test: same stub as AC7 for the down-with-no-cache case, asserting the `role="alert"` message is shown and
    `screen.queryByRole('article')` (place cards) is absent. The alert text is
    `We couldn't load places. Try searching again.`
  - |
    AC12 - `test_empty_recorded_response_returns_zero_places`. Overpass fixture `{"elements": []}`, Nominatim places `[]`.
    ```python
    assert NominatimPlaceSearch(client, "UA", sleep=lambda s: None).search("Nowhere") == []
    assert [p.id for p in osm.search("Lisbon")] == [f"osm-destination-{lat:.4f}-{lng:.4f}"]  # only the searched city itself
    ```
    Only the first assertion is "zero places"; the second records the existing behaviour of `_destination_place` (see open question).
  - |
    AC13 - web test: `/places` stubbed to `[]` for a city.
    ```ts
    expect(await screen.findByText('No places match your search')).toBeInTheDocument()
    ```
  - |
    AC14 - `test_category_fixtures_tag_every_place_with_the_searched_category`, parametrised over `PHRASES` and the four
    cities. Drive `NominatimPlaceSearch` with a transport wrapper that records `q`, and for each phrase check the
    places that came from that phrase's response.
    ```python
    assert {p.category for p in from_phrase["restaurant"]} == {"food"}
    assert {p.category for p in from_phrase["bar"]} == {"nightlife"}
    ```
    Mapping per phrase: attraction/monument/historic -> sights, viewpoint -> viewpoints, museum -> museums,
    restaurant/cafe -> food, bar -> nightlife. Also hits the route filter: `/places?destination=Lisbon&category=museums` with a replayed search returns only `museums`.
  - |
    AC15 - `test_committed_fixtures_contain_no_secrets_or_personal_data`: read every JSON under
    `tests/unit/fixtures/recorded/places/` and assert
    ```python
    assert not re.search(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", text)
    assert not re.search(r"\+?\d[\d\s().-]{6,}\d", re.sub(r'"(lat|lon|osm_id|id|place_id)": ?"?-?[\d.]+"?', "", text))
    assert not re.search(r"(?i)api[_-]?key|access[_-]?token|authorization|bearer ", text)
    assert all(v == "[scrubbed]" for v in values_of_keys(data, {"name", "email", "phone"}))
    ```
    The phone pattern is applied after removing numeric coordinate/id fields. Also a scrub unit test:
    `scrub_body` on a Nominatim hit keeps `isinstance(hit["address"], dict)` and `hit["address"]["country_code"]`.
assumptions_or_open_questions:
  - |
    Recording needs a live network and a human with the provider opted in (docs/agent-prompts/02b). The implementing
    agent must not contact those servers, so the plan builds the payloads by hand in the real response shapes and
    writes them with the same scrub and keying path. If the reviewer wants true recordings, a person records once
    with `RecordingTransport` and the builder is dropped; the tests do not change.
  - |
    Scrubbing redacts every `name`, so recorded place names become "[scrubbed]". Tests therefore assert on ids,
    counts, categories and provider ids, never on names. AC15's "name" is read as including place names. The
    alternative (keep public POI names, scrub only personal names) cannot be told apart by the scrubber.
  - |
    Failure behaviour has two layers. `OsmPlaceSearch`/`NominatimPlaceSearch` raise `OsmUnavailableError` (no places),
    but `FallbackPlaceSearch` (wired in `deps.get_places`) catches that and serves the stamped seed catalogue with the
    "Live data unavailable, showing saved data" notice. AC6, 8 and 10 are therefore tested at the search-class level and
    AC7, 9, 11 at the web page level against a failing `/places` call. Whether the API itself should return an error
    instead of the seed catalogue is a product change this plan does not make. Please confirm.
  - |
    There is no timeout-specific message today: the page shows "We couldn't load places. Try searching again." for any
    failure. AC9 is satisfied by that message. If it must say "timed out", that needs a new API error code and a
    web change, which this plan leaves out unless the reviewer asks.
  - |
    An empty Overpass result still returns the searched city as one place (`_destination_place`), so the "zero places"
    of AC12 holds for `NominatimPlaceSearch` and for the route after filtering, not for `OsmPlaceSearch` alone.
    Confirm that this existing behaviour stays.
  - |
    Existing tests use mock transports and `FakeResolver` and stay as they are; the new module sits alongside them.
    `timezonefinder` is bypassed with a `tz_lookup` stub so the tests need no extra data.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — test fixtures and test helpers only. No production code, stored data, settings or migrations change, so
  nothing needs a backfill or provisioning, and rollback is reverting the commit.

  Existing pieces reused: `IntegrationClient` and its in-memory cache (`app/integrations/client.py`, cache TTL 3600 s
  is what serves the repeat when Overpass is down), `ReplayTransport`/`fixture_key` (`recorded.py`), `scrub_body`
  (`scrub.py`), `FakeClock` (`tests/unit/locations_fakes.py`), the `.gitkeep` fixtures folder, and the web
  `DestinationResultsPage` messages. `NominatimResolver` takes an `http_get` callable, not an `IntegrationClient`,
  hence the adapter.

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
  IN: test helpers (`scrub.py`, `recorded.py`), committed fixtures, one new backend test module and added web tests;
  OUT: any production change (no new error codes, no change to `FallbackPlaceSearch` or the integration client).
  Riskiest part is the scrubber change: it must keep Nominatim's `address` as an object while still removing personal
  data, and the AC15 scan must really fail on a leaked email, phone or key. Deliberate: fixtures are hand-built in the
  real response shapes (no live recording by the agent), place names are scrubbed so tests assert ids and categories,
  and AC6/8/10 are checked at the search-class level because `FallbackPlaceSearch` serves seed data in production.
