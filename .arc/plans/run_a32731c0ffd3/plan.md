summary: |
  Make `PlacesMap` show real OpenStreetMap tiles only when the places source is opted in, and keep
  today's local SVG map (layout, pins, labels, legend) unchanged otherwise. Tiles are served through a
  small API tile proxy (`GET /places/tiles/{z}/{x}/{y}.png`) so every request to the OSM server carries an
  identifying User-Agent and Referer (browsers cannot set those on an image request), is cached, and is
  refused with no outside call when not opted in. The web map reads `map_tiles` from `/startup-status`,
  then renders only the tiles covering the visible viewport (no prefetch ring), supports pan and zoom, and
  shows the OSM attribution on the map. Gating lives inside `PlacesMap`, so Explore, destination results
  and Saved are all covered with no call-site change.
scope:
  - description: |
      API opt-in setting. Add `live_providers`, `osm_tile_url_template`, `osm_user_agent` and
      `osm_referer` to `Settings`, and a derived `map_tiles_enabled` property. Opt-in is `"places"` named in a
      new comma-separated `LOCAL_LIVE_PROVIDERS` env var (default empty). Outside local mode the places
      source is live, so tiles are on. Unknown provider names are refused at start-up with
      `LocalModeRefusedError`, like bad `LOCAL_MODE` values.
      ```python
      # app/local_mode.py
      KNOWN_LIVE_PROVIDERS = frozenset({"places"})
      def resolve_live_providers(env: Mapping[str, str]) -> frozenset[str]: ...
      # app/config.py  Settings additions (all defaulted, after local_data_dir)
      live_providers: frozenset[str] = frozenset()
      osm_tile_url_template: str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      osm_user_agent: str = ""   # no invented contact; see open questions
      osm_referer: str = ""      # falls back to web_origin
      @property
      def map_tiles_enabled(self) -> bool:
          return (not self.local_mode) or "places" in self.live_providers
      ```
      `get_settings()` calls `resolve_live_providers(env)`. Prompt 01
      (docs/agent-prompts/01-integration-groundwork.md) specifies `LOCAL_LIVE_PROVIDERS`, but a grep found it
      only in docs, so this story adds the minimum: parsing and the "places" name.
    files:
      - services/api/app/local_mode.py
      - services/api/app/config.py
    rationale: |
      The item's "places source is opted in" has no code today. config.py and local_mode.py already own
      the env parsing and the refusal pattern, so the opt-in lands there.
  - description: |
      Tile proxy. New `app/places/tiles.py` with `TileSource` (validates z 0-19 and x/y in 0..2**z-1,
      builds the URL from the template, fetches with `httpx` sending `User-Agent` and `Referer`, short
      in-memory TTL cache keyed by z/x/y only, bounded timeout, raises a typed error on upstream failure).
      New router `routers/place_tiles.py`: `GET /places/tiles/{z}/{x}/{y}.png` returns 404 with no outside
      call when `map_tiles_enabled` is false, 400 for an invalid tile, 502 when OSM fails, and
      `Cache-Control: public, max-age=86400` on success. Register it in `app/main.py` before
      `places.router` so the path is not shadowed. Add `map_tiles: bool` to the `GET /startup-status` body.
      Add `get_tile_source()` in `deps.py` with an `@lru_cache` builder like the other providers, so tests
      can override it with an `httpx.MockTransport`. Log upstream status only, never query data.
      ```python
      class TileSource:
          def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None: ...
          def fetch(self, z: int, x: int, y: int) -> tuple[bytes, str]: ...  # body, content-type
      ```
    files:
      - services/api/app/places/tiles.py
      - services/api/app/routers/place_tiles.py
      - services/api/app/routers/deps.py
      - services/api/app/routers/startup_status.py
      - services/api/app/main.py
    rationale: |
      OSM's tile policy requires an identifying User-Agent and a Referer, and discourages heavy use. Only a
      server-side fetch can guarantee those headers (AC4, AC5), cache (limits load on OSM) and keep the
      browser from contacting any outside host when off (AC2). httpx is already a dependency
      (services/api/pyproject.toml, used by locations/nominatim.py), so nothing new is installed. `/places`
      is already proxied in apps/web/src/devProxy.ts, so check it covers the `/places/tiles` sub-path
      and add nothing if it does.
  - description: |
      Web tiles flag and tile maths. Add `fetchMapTiles(): Promise<boolean>` to places/api.ts (reads
      `map_tiles === true` from `/startup-status`, false on any failure, same shape as `fetchLocalMode` in
      auth/api.ts), and a pure `tileMath.ts`: Web Mercator project/unproject, `visibleTiles` returning only
      tiles that intersect the viewport, and `fitView(places, width, height)` giving the initial
      `{center, zoom}`.
      ```ts
      export type Tile = { z: number; x: number; y: number }
      export type View = { center: LatLng; zoom: number }
      export const visibleTiles = (center: LatLng, zoom: number, width: number, height: number): Tile[]
      export const fitView = (places: Place[], width: number, height: number): View
      ```
    files:
      - apps/web/src/places/api.ts
      - apps/web/src/places/tileMath.ts
    rationale: |
      Puts the "only visible tiles, nothing prefetched" rule (AC6, AC7) in a unit-testable pure function.
  - description: |
      `PlacesMap` tile mode. New hook `useMapTiles` (calls `fetchMapTiles()` once, returns false while
      loading). While loading or false, `PlacesMap` renders exactly today's SVG: no tile elements, no
      attribution, same linear `scale()` layout. When true it renders the same card and legend, plus a tile
      layer of SVG `<image data-testid="map-tile" href="/places/tiles/{z}/{x}/{y}.png">` for
      `visibleTiles(...)` only, keyed by z/x/y so off-screen tiles unmount. Markers and labels are placed by
      Mercator projection over the same `WIDTH x HEIGHT` viewBox, with drag-to-pan, "Zoom in" / "Zoom out"
      buttons (state `{center, zoom}` recomputes the visible set), and an attribution link
      "© OpenStreetMap contributors" to https://www.openstreetmap.org/copyright. No change to props or to the
      three call sites (ExplorePage, DestinationResultsPage, SavedPage).
      Tokens (already loaded through `@import "../../../design-system/tokens.css"` at
      apps/web/src/index.css:2, and mostly already used in PlacesMap.tsx): `--color-bg`, `--color-border`,
      `--border-width`, `--radius-md`, `--space-1`, `--space-2`, `--space-3`, `--font-size-sm`, `--color-fg`,
      `--color-primary`. Zoom buttons reuse the button classes in design-system/UI-GUIDELINES.md. No colour or
      px literals beyond the existing WIDTH/HEIGHT/PADDING constants. Implementer: open design-system/ to
      confirm each token name and button class before use.
    files:
      - apps/web/src/places/PlacesMap.tsx
      - apps/web/src/places/useMapTiles.ts
    rationale: |
      Extends the existing component (the UI catalogue has only CompareTable and OptionCard, neither a map).
      Gating inside `PlacesMap` covers all three screens at once (AC1, AC2, AC8, AC9).
  - description: |
      Docs. Add `LOCAL_LIVE_PROVIDERS`, `OSM_TILE_URL_TEMPLATE`, `OSM_USER_AGENT` and `OSM_REFERER` to the
      settings table in services/api/README.md, with a link to the OSM tile usage policy and the note that
      the public server is for light use only.
    files:
      - services/api/README.md
    rationale: |
      RULES.md requires every new setting to appear in the README settings table.
tests:
  - |
    AC1 (web, new file apps/web/src/places/PlacesMap.test.tsx, none exists today; write first). With
    `/startup-status` answering `{ map_tiles: true }`:
    ```ts
    render(<PlacesMap places={PLACES} />)
    const tiles = await screen.findAllByTestId('map-tile')
    expect(tiles[0]).toHaveAttribute('href', expect.stringMatching(/^\/places\/tiles\/\d+\/\d+\/\d+\.png$/))
    ```
    Add the same `map-tile` presence assertion to the existing Explore, DestinationResultsPage (map view) and
    SavedPage tests.
  - |
    AC2 and AC8 (web). With `{ map_tiles: false }` and also with the status call rejecting:
    ```ts
    render(<PlacesMap places={PLACES} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/startup-status', expect.anything()))
    expect(screen.queryAllByTestId('map-tile')).toHaveLength(0)
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes('/places/tiles'))).toBe(true)
    expect(document.querySelector('image')).toBeNull()
    ```
  - |
    AC2 (api, services/api/tests/unit/test_place_tiles.py). Not opted in, so no outside call:
    ```python
    calls = []
    app.dependency_overrides[deps.get_tile_source] = lambda: TileSource(settings_off, httpx.Client(
        transport=httpx.MockTransport(lambda r: calls.append(r) or httpx.Response(200))))
    assert client.get("/places/tiles/3/4/2.png").status_code == 404
    assert calls == []
    ```
    The route must also check `get_settings().map_tiles_enabled` itself, not only rely on the injected source.
  - |
    AC3 (web). Tiles on:
    ```ts
    const link = await screen.findByRole('link', { name: /openstreetmap contributors/i })
    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
    ```
    With tiles off, `expect(screen.queryByText(/openstreetmap/i)).toBeNull()`.
  - |
    AC4 (api). Opted in, upstream mocked:
    ```python
    assert client.get("/places/tiles/3/4/2.png").status_code == 200
    assert calls[0].headers["user-agent"].startswith("TripPlanner/")
    assert str(calls[0].url) == "https://tile.openstreetmap.org/3/4/2.png"
    ```
  - |
    AC5 (api). Same setup:
    ```python
    assert calls[0].headers["referer"] == settings_on.web_origin
    ```
    Also: a second identical request is served from the cache (`len(calls) == 1`); `/places/tiles/25/0/0.png`
    and an x out of range for z return 400 with no upstream call; an upstream 500 returns 502.
  - |
    AC6 (web, apps/web/src/places/tileMath.test.ts). Only tiles intersecting the viewport:
    ```ts
    const tiles = visibleTiles({ lat: 38.72, lng: -9.14 }, 12, 400, 300)
    expect(tiles.length).toBeLessThanOrEqual(6)
    for (const t of tiles) expect(intersectsViewport(t, center, 12, 400, 300)).toBe(true)
    ```
    In PlacesMap.test.tsx: after clicking "Zoom in" or a pointer drag, every rendered `map-tile` href is in
    `visibleTiles(newView)` and tiles no longer visible are unmounted.
  - |
    AC7 (web). On first render with tiles on, the requested tile URLs equal `visibleTiles(initialView)`
    exactly, with no margin ring and no neighbouring zoom level:
    ```ts
    const hrefs = (await screen.findAllByTestId('map-tile')).map((t) => t.getAttribute('href'))
    expect(new Set(hrefs)).toEqual(new Set(visibleTiles(initialView).map(tileHref)))
    ```
  - |
    AC9 (web). Regression with tiles off: legend text ("Saved place", "Not saved"), `role="listitem"` pins
    with `aria-label` "<name>, saved|not saved", `data-saved`, pin `transform` values and label text equal the
    current scale()-based layout. Capture the transforms for a 3-place fixture from the current
    implementation BEFORE editing PlacesMap.tsx and assert them, for example
    `expect(pin).toHaveAttribute('transform', 'translate(30 270)')`. Existing DestinationResultsPage, Explore
    and Saved tests must pass unchanged.
  - |
    API config (services/api/tests/unit/test_live_providers.py). `LOCAL_LIVE_PROVIDERS=places` in local mode
    makes `/startup-status` return `map_tiles` true; empty makes it false; `bogus` raises
    `LocalModeRefusedError`:
    ```python
    with pytest.raises(LocalModeRefusedError):
        resolve_live_providers({"LOCAL_LIVE_PROVIDERS": "bogus"})
    ```
    Run narrowly with `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_live_providers.py tests/unit/test_place_tiles.py)`
    and `(cd apps/web && pnpm run test -- src/places)`.
assumptions_or_open_questions:
  - |
    Tile server and caching (deferred question). The plan uses the public OSM server
    tile.openstreetmap.org through an API proxy with an in-memory per-process TTL cache and `Cache-Control`
    headers. That is adequate for local opt-in and light use. OSM policy discourages heavy use and the target
    scale (about 10,000 users, ADR-0004) needs a commercial or self-hosted tile provider in production. The
    URL template is a setting, so the swap needs no code change. A human should confirm the production tile
    provider before launch.
  - |
    "Places source is opted in" has no existing code. Assumed: in local mode, `places` in
    `LOCAL_LIVE_PROVIDERS` (from prompt 01, not yet implemented); outside local mode the source is live, so
    tiles are on. Confirm whether deployed environments should show OSM tiles by default.
  - |
    Monitoring of OSM availability and rate-limit errors (project-wide open question) is out of scope. The
    proxy logs upstream status without query data and returns 502, which gives a hook for later work.
  - |
    The proxy returns binary PNG bodies through Mangum on Lambda. Assumed API Gateway binary media types
    include image/png. Deployment config is not in this plan, so this needs verifying.
  - |
    OSM policy needs a real contact in the User-Agent. The owner must supply `OSM_USER_AGENT` (an email or
    URL); the plan does not invent one. The AC4 test uses a settings fixture value starting with "TripPlanner/",
    and the code default is a documented placeholder prefix, to be confirmed.
  - |
    The current map has no pan or zoom, so AC6 adds them in tile mode only. Local mode stays static as today
    (AC9).
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: none. No schema, stored data or migration change.
  - **Backfill / seed**: none.
  - **Settings**: `LOCAL_LIVE_PROVIDERS` (default empty, so no outside calls in local mode),
    `OSM_TILE_URL_TEMPLATE` (default the public OSM URL), `OSM_USER_AGENT`, `OSM_REFERER` (default
    `WEB_ORIGIN`). Documented in services/api/README.md.
  - **Provisioning**: API Gateway must pass `image/png` as binary through Mangum. No other resource.
  - **Order and rollback**: deploy the API first (the web reads `map_tiles` and treats a missing field as
    false), then the web. Roll back by unsetting `LOCAL_LIVE_PROVIDERS` (local) or reverting; the old map is
    the default path.

  Verified while planning: `PlacesMap.tsx` has no existing test file; httpx is already a dependency;
  `deps.py` uses `@lru_cache` providers; `/startup-status` is read by `fetchLocalMode` in auth/api.ts.
  Design tokens load through `@import "../../../design-system/tokens.css"` at apps/web/src/index.css:2.

  ```mermaid
  flowchart TD
    Explore[ExplorePage] --> PM[PlacesMap]
    Dest[DestinationResultsPage] --> PM
    Saved[SavedPage] --> PM
    PM -->|reads map_tiles| SS[startup_status router]
    PM -->|image href| TR[place_tiles router]
    TR --> TS[TileSource]
    TS -->|UA + Referer| OSM[(tile.openstreetmap.org)]
    SS --> CFG[config Settings]
    TS --> CFG
    CFG --> LM[local_mode]
    PM --> TM[tileMath]
    classDef touched fill:#f96,color:#000
    class PM,SS,TR,TS,CFG,LM,TM touched
  ```
review_focus: |
  IN: tile mode of `PlacesMap`, the API tile proxy, the opt-in setting and the attribution. OUT: real place
  data, geocoding, provider monitoring, a production tile vendor. Riskiest: the not-opted-in path must stay
  identical and make zero tile or outside requests, and the visible-only tile maths. The proxy is deliberate
  (browsers cannot set User-Agent or Referer on image requests), and `LOCAL_LIVE_PROVIDERS` is introduced
  minimally because prompt 01 has not landed.
