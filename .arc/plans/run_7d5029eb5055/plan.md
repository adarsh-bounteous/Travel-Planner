summary: |
  Replace the local placeholder with a real, open-licensed Wikimedia Commons photo for OpenStreetMap places that carry a
  `wikimedia_commons` or `wikidata` tag, and show a "Photo: author, licence" credit (linking to the Commons file page)
  wherever the photo shows. The API gains a `commons` provider (registered, so `LOCAL_LIVE_PROVIDERS` controls it), a
  batched lookup service behind the shared IntegrationClient with an allow-list of licences and a per-request cap
  (named setting, default 8), and an in-process TTL memo so places beyond the cap fill in on later requests. Places
  come back with an optional `photo` credit and a `photo_unavailable` flag. The web app shows the photo and credit on
  Explore, destination results and trip recommendations (extending `PlacesSourceNote.tsx` with a `PhotoCredit`), shows
  "Photo unavailable" when a lookup failed, and on Saved shows only the small credit with no image. A saved place keeps
  just the credit (the thumbnail URL is dropped on save).

scope:
  - description: |
      Place model: add the photo fields and the (non-serialised) tags the lookup reads.

      ```python
      class PlacePhoto(BaseModel):
          author: str
          licence: str          # short label, e.g. "CC BY-SA 4.0"
          file_url: str         # https://commons.wikimedia.org/wiki/File:...

      class Place(BaseModel):
          ...
          photo: PlacePhoto | None = None
          photo_unavailable: bool = False
          commons_file: str | None = Field(default=None, exclude=True)   # OSM wikimedia_commons tag
          wikidata_id: str | None = Field(default=None, exclude=True)    # OSM wikidata tag
      ```

      `element_to_place` (Overpass `tags`) and `_result_to_place` (Nominatim `extratags`) copy `wikimedia_commons` and
      `wikidata` into the two excluded fields. When a photo is found, `image_url` is set to the https thumbnail.
    files:
      - services/api/app/places/search.py
      - services/api/app/places/overpass.py
      - services/api/app/places/nominatim_places.py
    rationale: |
      The tags exist in OSM data but are thrown away today. `exclude=True` keeps them out of API responses and saved
      snapshots, and `model_copy` keeps them for the lookup. New fields default to None/False, so old stored places and
      seed places still validate.
  - description: |
      New `app/places/commons.py`: `CommonsPhotos` lookup service.

      ```python
      ALLOWED_LICENCES = frozenset({"cc0", "cc-by", "cc-by-sa", "pd"})   # matched on extmetadata "License" key prefix
      def commons_settings(base_url: str, ttl_seconds: float) -> list[ProviderSettings]  # "commons" + "commons-wikidata"
      class PlacePhotos(Protocol):
          def attach(self, places: list[Place]) -> list[Place]: ...
      class NoPhotos:                       # provider switch off: returns places unchanged
      class CommonsPhotos:
          def __init__(self, client: IntegrationClient, user_agent: str, cap: int, ttl_seconds: float,
                       clock: Callable[[], float] = time.monotonic) -> None
      ```

      Behaviour of `attach`: (1) take the `source == "osm"` places with a tag; (2) serve anything already in the memo
      (hit or "no allowed image") for free; (3) of the remaining, look up at most `cap` places, in list order; (4) wikidata-only
      places first go through ONE `commons-wikidata` call (`wbgetentities`, `props=claims`, P18 file name), then all
      file titles go through ONE Commons call (`action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640&redirects=1&titles=File:A|File:B`);
      (5) keep an image only if its licence is on the allow-list, the thumbnail is https on `upload.wikimedia.org` (so it
      passes `_safe_image_url`) and the file page is https on `commons.wikimedia.org`; author comes from `Artist` with HTML
      tags stripped and entities unescaped, trimmed to a fixed length; (6) memoise hits and "no allowed image" for
      `ttl_seconds`; (7) on `IntegrationError`, a bad status or unparseable JSON, set `photo_unavailable=True` on the places
      in that batch and do NOT memoise. Places over the cap, untagged places, `Category:` tags and disallowed licences are
      left as they are (placeholder, no message, no credit). Returns copies via `model_copy`.
    files:
      - services/api/app/places/commons.py
    rationale: |
      One service owns the allow-list, the cap and the memo, so the routers stay thin. The shared IntegrationClient
      supplies the timeout, breaker and rate limit (retries 0, timeout about 3 s so a slow Commons never stalls a results page).
      Client-level response caching is off for these two providers (`cache_ttl_seconds=0`) because the client keys on the whole batch
      request, which would never hit across different batches; the per-title memo is the cache.
  - description: |
      Provider switch, settings and wiring.

      - `registry.py`: `ProviderEntry("commons", "open photos", "COMMONS_API_KEY")` in `default_registry()`. `KNOWN_LIVE_PROVIDERS`
        in `local_mode.py` derives from it, so `LOCAL_LIVE_PROVIDERS=places,commons` becomes valid.
      - `config.py`: `commons_photo_cap: int = 8` from `COMMONS_PHOTO_CAP` (the named setting) and
        `commons_cache_ttl_seconds: float = 604800` from `COMMONS_CACHE_TTL_SECONDS`; a blank, non-numeric or negative value falls back to the default.
      - `routers/deps.py`: `get_place_photos() -> PlacePhotos` returns a cached `CommonsPhotos` when `get_settings().is_live("commons")`, otherwise `NoPhotos()`;
        the User-Agent is `settings.osm_user_agent or settings.nominatim_user_agent`, as `_osm_places` does.
      - `routers/places.py`: `search_places(..., photos: PlacePhotos = Depends(get_place_photos))` returns `photos.attach(filtered)`, so the
        cap applies to the places actually shown.
      - `trips/osm_recommendations.py`: `OsmRecommendations(places, photos=None)` attaches photos to the places of the recommendations it builds;
        `deps.get_recommendations` passes `get_place_photos()`.
    files:
      - services/api/app/providers/registry.py
      - services/api/app/config.py
      - services/api/app/routers/deps.py
      - services/api/app/routers/places.py
      - services/api/app/trips/osm_recommendations.py
      - services/api/README.md
    rationale: |
      Mirrors how `places` and `osm_places_enabled` are switched today. README gets a row for each new setting and `commons` in
      the accepted names of `LOCAL_LIVE_PROVIDERS` (the existing README row test still passes: default stays empty).
  - description: |
      Saved places keep only the credit. In `save_place` (`saved_places.py`), when `body.photo` is set: validate `file_url`
      (https, `commons.wikimedia.org`, within `MAX_URL`) and the `author`/`licence` lengths (422 `invalid place` otherwise), then store
      `body.model_copy(update={"image_url": PLACEHOLDER_IMAGE, "photo_unavailable": False})`. Nothing else in the saved flow changes.
    files:
      - services/api/app/routers/saved_places.py
    rationale: |
      The thumbnail is third-party content that should not be kept; the credit has to stay with the saved place for attribution.
      Already-saved places have no `photo` and still load unchanged.
  - description: |
      Web: types and the shared credit.

      - `places/api.ts`: `Place` gains `photo?: { author: string; licence: string; file_url: string } | null` and `photo_unavailable?: boolean`;
        add `commonsPhoto(place): { src: string; alt: string } | undefined` (set only when `place.photo` exists and `image_url` is https).
      - `places/PlacesSourceNote.tsx`: add `export function PhotoCredit({ place })`, rendering nothing without `place.photo`; otherwise
        `<p className="text-sm text-muted"><a href={file_url} target="_blank" rel="noopener noreferrer">Photo: {author}, {licence}</a></p>`;
        and, when `place.photo_unavailable`, `<p className="text-sm text-muted">Photo unavailable</p>`. The page-level `PlacesSourceNote` stays as is.
    files:
      - apps/web/src/places/api.ts
      - apps/web/src/places/PlacesSourceNote.tsx
    rationale: |
      One credit component, reused by every list. Only existing utility classes (`text-sm`, `text-muted`) are used, so no new styling or token is needed.
  - description: |
      Web: show the photo and credit where places render.

      - `PlaceCard.tsx` (Explore, destination results, Saved): new prop `showPhoto?: boolean` (default true). `ImageFrame` gets `photo={showPhoto ? commonsPhoto(place) : undefined}`
        and the illustration stays as the fallback; render `<PhotoCredit place={place} />` under it. `SavedPage.tsx` passes `showPhoto={false}`.
      - `TripRecommendationsTab.tsx`: the recommendation card passes `photo={r.place ? commonsPhoto(r.place) : undefined}` to the existing `ImageFrame` and renders `PhotoCredit`.
      - `PhotoCredit` on Saved suppresses `photo_unavailable` because the API clears it on save.
      - `ExplorePage.tsx` and `DestinationResultsPage.tsx` need no change beyond the `PlaceCard` they already use; confirm by test.
    files:
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
    rationale: |
      Reuses `PlaceCard` and the existing `ImageFrame` `photo` prop (which already replaces the illustration in the same frame); no new component is scheduled.

tests:
  - |
    AC1 and AC10 and AC11, services/api/tests/unit/test_commons_photos.py (httpx.MockTransport behind IntegrationClient). Write first:
    ```python
    def test_commons_tag_with_allowed_licence_gets_photo():
        out = photos(transport=commons_ok("File:A.jpg", licence="cc-by-sa-4.0")).attach([osm("a", commons_file="File:A.jpg")])
        assert out[0].image_url.startswith("https://upload.wikimedia.org/")
        assert out[0].photo.licence == "CC BY-SA 4.0" and out[0].photo.file_url.startswith("https://commons.wikimedia.org/wiki/File:")

    def test_five_places_one_batched_request():
        t = RecordingTransport(commons_ok_for(5)); photos(transport=t).attach(tagged(5))
        assert len(t.requests) == 1 and t.requests[0].url.params["titles"].count("|") == 4

    def test_eight_places_all_get_photos_at_default_cap():
        assert all(p.photo for p in photos(transport=commons_ok_for(8)).attach(tagged(8)))
    ```
  - |
    AC2, same file: a place with only `wikidata_id="Q1"`; the Wikidata fake returns P18 `A.jpg`, the Commons fake returns an allowed licence.
    ```python
    out = photos(transport=wikidata_then_commons("Q1", "A.jpg")).attach([osm("w", wikidata_id="Q1")])
    assert out[0].photo is not None and out[0].image_url.startswith("https://upload.wikimedia.org/")
    ```
  - |
    AC3, same file: an OSM place with neither tag causes no HTTP call and stays on the placeholder.
    ```python
    t = RecordingTransport(); out = photos(transport=t).attach([osm("n")])
    assert t.requests == [] and out[0].image_url == PLACEHOLDER_IMAGE and out[0].photo is None
    ```
  - |
    AC4 and AC5, same file, parametrised over `cc-by-nc-4.0`, `cc-by-nc-sa-4.0` and a missing licence:
    ```python
    out = photos(transport=commons_ok("File:A.jpg", licence="cc-by-nc-4.0")).attach([osm("a", commons_file="File:A.jpg")])
    assert out[0].image_url == PLACEHOLDER_IMAGE and out[0].photo is None and out[0].photo_unavailable is False
    ```
    Also covers HTML stripping of `Artist` and rejecting a non-https thumbnail.
  - |
    AC6, services/api/tests/unit/test_places_router.py and the recommendations router test, with `app.dependency_overrides[get_place_photos]` set to a fake:
    ```python
    body = client.get("/places", params={"destination": "Lisbon"}).json()
    assert body[0]["photo"] == {"author": "Ana", "licence": "CC BY 4.0", "file_url": "https://commons.wikimedia.org/wiki/File:A.jpg"}
    ```
    Web: PlaceCard.test.tsx, ExplorePage.test.tsx, DestinationResultsPage.test.tsx and TripRecommendationsTab.test.tsx each render a place with a `photo` and assert
    ```ts
    expect(screen.getByRole('link', { name: 'Photo: Ana, CC BY 4.0' })).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:A.jpg')
    ```
    and `getByRole('img')` has `src` equal to the thumbnail (not the illustration).
  - |
    AC7, AC8, AC9, apps/web/src/saved/SavedPage.test.tsx:
    ```ts
    expect(screen.getByText('Photo: Ana, CC BY 4.0')).toBeInTheDocument()          // AC7
    expect(container.querySelector('img[src="https://upload.wikimedia.org/a.jpg"]')).toBeNull()   // AC8
    expect(screen.queryByText(/^Photo:/)).toBeNull()                               // AC9, saved place without photo
    ```
    API side, test_saved_places_router.py: PUT a place with `photo` and a thumbnail URL, then
    ```python
    saved = client.get("/saved-places").json()[0]
    assert saved["image_url"] == PLACEHOLDER_IMAGE and saved["photo"]["licence"] == "CC BY 4.0"
    ```
    plus a 422 for a `photo.file_url` that is `javascript:` or not on commons.wikimedia.org, and a test that a place saved before this change (no `photo` key) still lists unchanged.
  - |
    AC12 and AC16, test_commons_photos.py, 9 tagged places and the default cap:
    ```python
    t = RecordingTransport(commons_ok_for(8)); out = photos(transport=t).attach(tagged(9))
    assert t.requests[0].url.params["titles"].count("|") == 7      # 8 titles, never 9
    assert out[8].image_url == PLACEHOLDER_IMAGE and out[8].photo is None and out[8].photo_unavailable is False
    ```
    A settings test: `get_settings().commons_photo_cap == 8` unset, `== 3` with `COMMONS_PHOTO_CAP=3`, and `== 8` for `abc`.
  - |
    AC17, same file: one service instance with a controllable clock. Request one looks up place 9 (list `[p9]`); request two is `tagged(9)` with the transport now failing for anything outside the memo.
    ```python
    svc.attach([p9]); out = svc.attach(tagged(9))
    assert out[8].photo is not None                              # served from the memo, not counted against the cap
    ```
    Also: the memo expires after `ttl_seconds` (advance the clock, assert a new request), and failures are never memoised.
  - |
    AC13, services/api/tests/unit/test_live_providers.py: with `LOCAL_MODE` on and `LOCAL_LIVE_PROVIDERS=places`, `assert isinstance(deps.get_place_photos(), NoPhotos)`; with `places,commons` it is a `CommonsPhotos`;
    outside local mode it is a `CommonsPhotos`; `resolve_live_providers({"LOCAL_LIVE_PROVIDERS": "commons"}) == {"commons"}`. Router test: with `NoPhotos`, every tagged place keeps `PLACEHOLDER_IMAGE` and has `photo is None`.
    The providers status test is updated for the new `commons` row.
  - |
    AC14 and AC15, test_commons_photos.py and PlaceCard.test.tsx. Transport raising `httpx.ConnectTimeout`, then returning 503:
    ```python
    out = photos(transport=timing_out()).attach([osm("a", commons_file="File:A.jpg")])
    assert out[0].image_url == PLACEHOLDER_IMAGE and out[0].photo_unavailable is True
    ```
    Web: `render(<PlaceCard place={{ ...alfama, photo_unavailable: true }} .../>)` then `expect(screen.getByText('Photo unavailable')).toBeVisible()` and no `Photo:` link.
    Also: a breaker-open or rate-limited call gives the same result and does not raise out of `attach`.
  - |
    AC18, PlacesSourceNote.test.tsx (extended) and PlaceCard.test.tsx:
    ```ts
    const link = screen.getByRole('link', { name: 'Photo: Ana, CC BY 4.0' })
    expect(link).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:A.jpg')
    expect(link).toHaveAttribute('target', '_blank'); expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    ```
    And `<PhotoCredit place={{ ...p, photo: null }} />` renders nothing. Existing PlacesSourceNote tests (OSM note, saved-data notice) must still pass.

assumptions_or_open_questions:
  - |
    Deferred question, cache lifetime and refresh. Decided here: a per-title in-memory memo with a 7-day TTL (`COMMONS_CACHE_TTL_SECONDS`, 604800), holding both hits and "no allowed image"
    results. It refreshes lazily: an expired entry is looked up again on the next request that shows the place, within the per-request cap. Failures are never cached.
    The cache is per Lambda instance, so it is lost on a cold start and not shared between instances. A shared cache (DynamoDB, like `DynamoLocationCache`) is not planned. Please confirm 7 days
    and in-memory are acceptable, or ask for a shared cache.
  - |
    The per-request cap counts only lookups actually sent. Places already in the memo do not use it up, which is how a place beyond the cap (AC16) fills in on a later request (AC17).
  - |
    The cap is applied to the places in the response after the router's own filters (q, type, price, category), so it limits what the page shows. Recommendations apply it to the whole list returned.
  - |
    Wikidata-only places need a second host (wikidata.org) to find the P18 image. It is registered as an extra `commons-wikidata` IntegrationClient provider under the single `commons` switch, and it adds a call
    before the Commons batch. AC11's single batched request is for places with Commons tags; wikidata-only places add one Wikidata call. Please confirm that reading of AC11.
  - |
    Only `File:` values of `wikimedia_commons` are looked up. `Category:` values are skipped (placeholder) because they name no single image.
  - |
    The allow-list is CC0, CC BY, CC BY-SA and public domain (from `docs/agent-prompts/02b-places-photos-and-fixtures.md`), any version. Matching uses the Commons `License` metadata key; a file with no licence metadata is rejected.
  - |
    The registry entry needs a secret key name (`COMMONS_API_KEY`) like the other entries, but Commons needs no key, so `/providers/status` will show `commons` as not configured, the same as `places` today.
  - |
    `AddToTrip` copies `image_url` into the trip place, so a trip place can hold a Commons thumbnail URL without a credit. The item says nothing about trip places, so this plan leaves them unchanged.
    If trips should carry the credit too, that is a follow-up.
  - |
    Recorded fixtures for Commons (the 02b prompt asks for recorded responses) are out of scope; tests use small hand-built JSON served from `httpx.MockTransport`. No test calls the network.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout

  - **Existing data**: no migration. `Place` gains optional fields (`photo`, `photo_unavailable`) with defaults, so saved places already in DynamoDB or the local `saved-places` data file validate and list unchanged
    (test: a saved place with no `photo` key still lists). The two tag fields are `exclude=True`, so they are never written to storage.
    A rolled-back build ignores the extra `photo` key when reading, because the pydantic default ignores unknown fields.
  - **Backfill / seed**: none. Already-saved places do not gain photos.
  - **Settings**: `COMMONS_PHOTO_CAP` (default 8) and `COMMONS_CACHE_TTL_SECONDS` (default 604800) are optional and safe when unset; both are documented in `services/api/README.md`.
    The provider switch is `commons` in `LOCAL_LIVE_PROVIDERS` (local mode only; outside local mode every provider is live). Commons needs no API key.
  - **Provisioning**: none. Outbound HTTPS to `commons.wikimedia.org`, `www.wikidata.org` and `upload.wikimedia.org` must be allowed from the Lambda (no VPC restriction is known; not checked). The descriptive User-Agent reuses `OSM_USER_AGENT` / `NOMINATIM_USER_AGENT`.
  - **Order and rollback**: API and web can ship together. If the web ships first, nothing breaks (the fields are absent). If the API ships first, the old web ignores the new fields. To turn it off, take `commons` out of `LOCAL_LIVE_PROVIDERS` locally;
    in deployed environments set `COMMONS_PHOTO_CAP=0` (cap 0 means no lookups; the test for this belongs with the AC12 tests) or roll back the code.

  ### Design system and UI

  Tokens load in `apps/web/src/index.css:2` (`@import "../../../design-system/tokens.css"`); Tailwind and the app's utility classes sit on top of it. This plan adds no CSS: the credit uses the existing `text-sm text-muted` classes and the photo uses the existing
  `ImageFrame` `photo` prop, so no token, colour literal or pixel value is introduced. Reused components: `ImageFrame`, plus `PlaceCard` and `PlacesSourceNote` which are extended. No new component.

  ### Flow

  ```mermaid
  flowchart TD
    OSM[overpass.py / nominatim_places.py: copy tags onto Place]:::touched
    Search[search.py: Place + PlacePhoto]:::touched
    Commons[commons.py: batched lookup, allow-list, cap, memo]:::touched
    Deps[deps.py: get_place_photos switch]:::touched
    Reg[registry.py + config.py: commons provider, cap, TTL]:::touched
    PlacesRouter[routers/places.py: attach after filters]:::touched
    Recs[osm_recommendations.py: attach to recommendation places]:::touched
    Saved[routers/saved_places.py: keep credit, drop thumbnail]:::touched
    Client[integrations/client.py IntegrationClient]
    Card[PlaceCard.tsx + PlacesSourceNote.tsx PhotoCredit]:::touched
    Explore[ExplorePage / DestinationResultsPage]
    RecTab[TripRecommendationsTab.tsx]:::touched
    SavedPage[SavedPage.tsx: showPhoto false]:::touched
    Frame[ImageFrame.tsx photo prop]

    OSM --> Search
    Reg --> Deps
    Deps --> Commons
    Commons --> Client
    PlacesRouter --> Commons
    Recs --> Commons
    PlacesRouter -->|JSON with photo| Explore
    Recs -->|JSON with photo| RecTab
    Explore --> Card
    SavedPage --> Card
    RecTab --> Card
    Card --> Frame
    Saved -->|credit only| SavedPage

    classDef touched fill:#f96,color:#000
  ```

  ### Reasoning

  - Enrichment is a separate step after search (not inside `OsmPlaceSearch`) so the Overpass and Nominatim searches, their caches and the seed fallback are not touched, and seed places never trigger a lookup.
  - `FallbackPlaceSearch` stamps seed places and leaves OSM places alone, so the photo step in the router works the same on both.
  - Run `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_commons_photos.py)` and `(cd apps/web && pnpm run test src/places/PlaceCard.test.tsx)` for the narrow loops; the full command stays the final check.

review_focus: |
  IN: the Commons and Wikidata lookup service, allow-list, cap and memo, the `commons` provider switch, the credit and "Photo unavailable" UI on Explore, destination results, trip recommendations and Saved, and dropping the thumbnail on save.
  OUT: recorded fixtures, trip-place credits, a shared (DynamoDB) cache, ratings. Riskiest part is `commons.py`: the cap must count only lookups sent, failures must never be memoised, and licence, thumbnail and file-page URL checks must reject anything unsafe.
  Deliberate: tag fields are `exclude=True` so they never reach the API response or storage; the memo (not the client cache) is the cache, so client `cache_ttl_seconds` is 0 for the two Commons providers; enrichment runs after the router's filters.
