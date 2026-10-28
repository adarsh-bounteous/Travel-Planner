summary: |
  In local mode the trip Recommendations tab still shows images from `https://picsum.photos/seed/<slug>/400/300`, because `SEED_LOCAL_RECOMMENDATIONS` builds each `Recommendation.place` with `_place()` in `services/api/app/places/search.py`. Offline those images break, and online they hit an outside host. This plan ships a small set of recommendation images as static assets of the web app, and has the local recommendation catalogue point at them by a stable per-recommendation path. A recommendation with no local image shows a neutral placeholder. Only the recommendation images change: place cards, the Saved page and the trip cover keep their original `image_url`.
scope:
  - description: |
      API: give local recommendations an app-relative image. Add `local_image_url(slug)` and a `LOCAL_IMAGE_SLUGS` set in `services/api/app/trips/recommendations.py`. The `_local` helper (used only by the seed catalogues) builds its place, then replaces `image_url` with `/rec/{slug}.svg` when the slug has a shipped image, else with `PLACEHOLDER_IMAGE_PATH = "/rec/placeholder.svg"`.
      Do NOT change `_place()` in `search.py`. It also serves the non-local `places` catalogue, which AC3 leaves alone.
      Before: `image_url="https://picsum.photos/seed/{slug}/400/300"`. After, for local recommendations: `image_url="/rec/{slug}.svg"` or `"/rec/placeholder.svg"`.
      `SEED_RECOMMENDATIONS` (non-local) also goes through `_local`. Keep its images unchanged by giving `_local` an `image_url` override or splitting a `_remote` helper, so only `SEED_LOCAL_RECOMMENDATIONS` changes.
    files:
      - services/api/app/trips/recommendations.py
    rationale: |
      The picsum URL is the only outside host behind recommendation images. The URL is derived from the slug, so every visit returns the same image (AC4). `/rec/...` is a path on the web app origin, so `_safe_image_url` in `routers/saved_places.py` still accepts it when a user saves the place.
  - description: |
      Web: ship the images as static assets in `apps/web/public/rec/`. Vite serves `public/` at the site root and copies it into the build, so the images work offline and carry no outside host. There is no `apps/web/public` folder today (checked with Glob). Create one `.svg` per slug in `SEED_LOCAL_RECOMMENDATIONS`, plus `placeholder.svg`:
      time-out-market, pastel-de-belem, tile-museum-local, fado-alfama, cabo-da-roca, fushimi-inari, nishiki-market, arashiyama-bamboo, philosophers-path.
      Each is a simple self-contained 4:3 illustration with no external references (no `href` to a URL, no web font, no `@import`). `placeholder.svg` is a neutral grey picture glyph, matching the design's dashed neutral "Photo not available" tile.
    files:
      - apps/web/public/rec/placeholder.svg
      - apps/web/public/rec/time-out-market.svg
      - apps/web/public/rec/pastel-de-belem.svg
      - apps/web/public/rec/tile-museum-local.svg
      - apps/web/public/rec/fado-alfama.svg
      - apps/web/public/rec/cabo-da-roca.svg
      - apps/web/public/rec/fushimi-inari.svg
      - apps/web/public/rec/nishiki-market.svg
      - apps/web/public/rec/arashiyama-bamboo.svg
      - apps/web/public/rec/philosophers-path.svg
    rationale: |
      Makes AC1 true offline. The images are code-reviewed assets, not downloaded content. SVG keeps them small and avoids binary or licensed photos.
  - description: |
      Web: a `RecommendationImage` component used by `TripRecommendationsTab.tsx` in place of the bare `<img src={r.place.image_url}>` (line 99-104).
      ```tsx
      export const PLACEHOLDER_SRC = '/rec/placeholder.svg'
      export function isAppImage(src: string | undefined | null): src is string {
        return !!src && src.startsWith('/') && !src.startsWith('//')
      }
      export function RecommendationImage({ src, name }: { src?: string | null; name: string })
      ```
      Behaviour. The `<img>` src is `src` only when `isAppImage(src)`, so an `https://` or `//host` value is never requested (AC2). Otherwise the src is `PLACEHOLDER_SRC` (AC5). On `onError` it swaps once to `PLACEHOLDER_SRC`, for a missing file. It keeps `loading="lazy"`, 4:3 and `object-fit: cover`, as today.
      The design shows a `.badge` over the image corner: `badge badge-success` "Saved in app" for a local image, `badge badge-neutral` "Placeholder" plus the label "Photo not available" for the neutral one. Render these over a `position: relative` wrapper. The design's `.rec-img` positions them with `var(--space-1)`, `var(--radius-md)` and a 4:3 aspect ratio.
      Alt text: the design uses `aria-label` "<name> photo" or "No photo available for <name>". Use that as `alt` (it replaces the current `alt=""`).
      Style only with tokens: `--color-surface`, `--color-border-strong`, `--color-fg-muted`, `--radius-md`, `--space-1`, `--border-width`. These are loaded by `@import "../../../design-system/tokens.css"` at `apps/web/src/index.css:2`. Add a `.rec-img*` rule block to `index.css` next to `.restaurant-photo` (line 327), since `.restaurant-photo` is the existing neutral tile and the same pattern. No hex or px literals.
      Fallback is for `place` being null too: `r.place` null today renders no image, so render the placeholder instead (AC5).
    files:
      - apps/web/src/trips/RecommendationImage.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/index.css
    rationale: |
      Enforces "no outside host" on the client as well, so a stale or remote `image_url` from the service, or a recommendation without an image, can never trigger an outside request in the Recommendations tab. The Saved page and place cards keep their own `<img>` (AC3).
  - description: |
      Local-mode-only guard. The tab already reads `local` from `fetchLocalMode()`. Pass `appOnly={local}` to `RecommendationImage`, so outside URLs are blocked only in local mode and the non-local service path still shows its original images.
      Until `fetchLocalMode()` resolves, `local` is false, so a non-app URL could be requested before the flag is known. Mitigate by rendering the grid only after the flag has loaded. Hold `recs` back behind a `localKnown` state, reusing the existing skeleton (the design's loading state).
    files:
      - apps/web/src/trips/TripRecommendationsTab.tsx
    rationale: |
      Without this, a first render in local mode could request an outside image before the mode is known.
tests:
  - |
    AC1 and AC2, API (write first, in `services/api/tests/unit/test_local_recommendations.py`). Every local recommendation has an app-relative image and none has an outside host.
    ```python
    @pytest.mark.parametrize("dest", ["Lisbon", "Kyoto"])
    def test_local_recommendation_images_are_app_paths(client, dest):
        recs = get_for(client, dest)
        assert recs
        for r in recs:
            url = r["place"]["image_url"]
            assert url.startswith("/rec/") and not url.startswith("//")
            assert "picsum" not in url and not url.startswith("http")
    ```
  - |
    AC1, API (`test_local_recommendations.py`). Every image the API names exists as a shipped file, so none is a broken link offline.
    ```python
    from pathlib import Path
    PUBLIC = Path(__file__).resolve().parents[4] / "apps" / "web" / "public"

    def test_every_local_image_file_exists():
        from app.trips.recommendations import SEED_LOCAL_RECOMMENDATIONS
        urls = {r.place.image_url for recs in SEED_LOCAL_RECOMMENDATIONS.values() for r in recs}
        assert urls and all((PUBLIC / u.lstrip("/")).is_file() for u in urls)
    ```
  - |
    AC3, API (`test_local_places.py` and `test_places_router.py` must keep passing). A non-recommendation place keeps its original source and the non-local recommendation catalogue is untouched.
    ```python
    def test_places_catalogue_image_is_unchanged():
        assert _place("x", "X", "park", "free", 1, 2).image_url == "https://picsum.photos/seed/x/400/300"

    def test_non_local_recommendations_keep_their_image():
        from app.trips.recommendations import SEED_RECOMMENDATIONS
        assert all(r.place.image_url.startswith("https://") for r in SEED_RECOMMENDATIONS["lisbon"])
    ```
  - |
    AC4, API (`test_local_recommendations.py`). The same recommendation gets the same image on a later visit.
    ```python
    def test_image_is_stable_across_visits(client):
        first = {r["id"]: r["place"]["image_url"] for r in get_for(client, "Lisbon")}
        second = {r["id"]: r["place"]["image_url"] for r in get_for(client, "Lisbon")}
        assert first == second
    ```
  - |
    AC5, API (`test_local_recommendations.py`). A recommendation whose slug has no shipped image gets the neutral placeholder path.
    ```python
    def test_unknown_slug_gets_placeholder():
        from app.trips.recommendations import local_image_url
        assert local_image_url("no-such-recommendation") == "/rec/placeholder.svg"
    ```
  - |
    AC2 and AC5, web unit (write first, in `apps/web/src/trips/RecommendationImage.test.tsx`, vitest and Testing Library).
    ```tsx
    it('never requests an outside host', () => {
      render(<RecommendationImage src="https://picsum.photos/seed/a/400/300" name="Tile Museum" appOnly />)
      expect(screen.getByRole('img')).toHaveAttribute('src', '/rec/placeholder.svg')
    })
    it('shows an app image as is', () => {
      render(<RecommendationImage src="/rec/tile-museum-local.svg" name="Tile Museum" appOnly />)
      expect(screen.getByRole('img', { name: 'Tile Museum photo' })).toHaveAttribute('src', '/rec/tile-museum-local.svg')
    })
    it('falls back to the placeholder when the file fails to load', () => {
      render(<RecommendationImage src="/rec/gone.svg" name="Tile Museum" appOnly />)
      fireEvent.error(screen.getByRole('img'))
      expect(screen.getByRole('img')).toHaveAttribute('src', '/rec/placeholder.svg')
    })
    it('shows the neutral placeholder when there is no image', () => {
      render(<RecommendationImage src={null} name="Tile Museum" appOnly />)
      expect(screen.getByText('Photo not available')).toBeVisible()
    })
    it('leaves the source alone when not in local mode (AC3)', () => {
      render(<RecommendationImage src="https://img.example/a.jpg" name="A" appOnly={false} />)
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://img.example/a.jpg')
    })
    ```
  - |
    AC2 and AC3, web unit (extend `TripRecommendationsTab.test.tsx`; its fixture `place()` uses `https://img.example/...`). With `local_mode: true`, no rendered `<img>` src starts with `http`. With local mode off, the original `https://img.example/...` src is kept. Assert the loading skeleton shows until `fetchLocalMode()` resolves, so no `<img>` exists before then.
    ```tsx
    const srcs = screen.getAllByRole('img').map((i) => i.getAttribute('src'))
    expect(srcs.every((s) => s!.startsWith('/'))).toBe(true)
    ```
  - |
    AC1 and AC2, e2e (extend `apps/web/e2e/local-recommendations.spec.ts`, Playwright). Stub the API with local `/rec/...` image URLs, record every request, go offline, and open the Recommendations tab. Assert each image decoded and that no image request left the app origin. The existing fixture uses `https://img.example/...`, so change it to `/rec/<id>.svg` for this test.
    ```ts
    const outside: string[] = []
    page.on('request', (req) => {
      if (req.resourceType() === 'image' && new URL(req.url()).origin !== new URL(page.url()).origin) outside.push(req.url())
    })
    await page.context().setOffline(true)  // after the page and tab have loaded the data
    for (const img of await page.getByRole('img').all())
      expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    expect(outside).toEqual([])
    ```
  - |
    AC4, e2e (same spec). Open the tab, read the first image `src`, reload, and assert the same `src` is shown. A recommendation whose place has no local image shows `Photo not available`.
assumptions_or_open_questions:
  - |
    "Recommendation images" is read as the images in the trip Recommendations tab (`TripRecommendationsTab.tsx`), which is the only screen that reads `Recommendation.place.image_url` (searched `apps/web/src` for `Recommendation`). The approved design shows a "Restaurants in Lisbon" page. The only restaurant UI in code, `RestaurantOptionsPage.tsx`, has no image (it renders a placeholder `restaurant-photo` tile). If the story means restaurant options, say so, because they have no image field to localise today.
  - |
    The prototype shows a trip cover, filter chips, "Simulate" chips and an "Image requests" panel. The simulate chips and the request panel are prototype aids and are not planned. The "Local mode" badge, status strip and drawer for details are not planned either. The tab already has an `.alert` strip ("Generated locally."), and "Open" navigates to the destination page. The cover image does not exist in the app (AC3 only needs that non-recommendation images are untouched). The planned UI is limited to the card image, the "Saved in app" or "Placeholder" badge and the neutral tile. Confirm the details drawer is not wanted here.
  - |
    The prototype's "You're offline" message needs a connectivity signal that the app does not have. It is left out. AC1 only needs the images to show.
  - |
    Images are hand-made SVG illustrations, one per seeded slug, not photos. If real photos are wanted they need a licence and a source, and would be dropped into `apps/web/public/rec/` with a changed extension in `local_image_url`.
  - |
    Places a user already saved from a local recommendation hold the old `https://picsum.photos/...` `image_url` in the local data file and are shown on the Saved page. That page is a non-recommendation image (AC3) and is left alone. A follow-up could rewrite them.
  - |
    API and web run on different origins locally (`scripts/start.mjs` picks a web port), so `/rec/...` resolves against the web origin because the `<img>` is rendered by the web app. If the API ever serves a page itself this must be revisited.
  - |
    The settled decision about starter countries (Japan, Portugal, India, Thailand, Mexico, Morocco, Peru) belongs to another story (STORY-102). It adds no recommendations here, so it is not applied. Seeded destinations here stay Lisbon and Kyoto.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — no schema, migration or setting changes. The seed catalogues are code, and the new files are static assets bundled by Vite. Existing local data files that hold saved places keep their stored `image_url` (see the open questions). No new env var. Rolling back is a plain revert.

  ```mermaid
  flowchart TD
    Deps[routers/deps.py get_recommendations] --> Rec[trips/recommendations.py]
    Rec --> Place[places/search.py _place]
    Router[routers/trips.py recommendations route] --> Deps
    Tab[TripRecommendationsTab.tsx] --> Router
    Tab --> Img[RecommendationImage.tsx]
    Img --> Assets[public/rec/*.svg]
    Tab --> CSS[index.css tokens.css]
    Saved[SavedPage.tsx and PlaceCard.tsx] --> Place
    classDef touched fill:#f96,color:#000
    class Rec,Tab,Img,Assets,CSS touched
  ```

  Touched nodes. `recommendations.py` swaps the picsum URL for an app path, `TripRecommendationsTab.tsx` uses the new image component, `RecommendationImage.tsx` enforces app-only sources and the placeholder, `public/rec` holds the assets, and `index.css` styles the badge and neutral tile with tokens. `search.py`, `SavedPage.tsx` and `PlaceCard.tsx` are deliberately untouched (AC3).

  The prototype's CSS uses tokens only (`--color-surface`, `--color-success-subtle`, `--color-border-strong`, `--radius-md`, `--space-*`). The SVG assets are image files and are not styled by tokens.
review_focus: |
  IN scope: the seeded local recommendation images, the `/rec/*.svg` assets, and the Recommendations tab image rendering with the placeholder. OUT: `_place()` and the places catalogue, Saved and place-card images, the trip cover, connectivity detection, the details drawer and any API change to saved data. Riskiest part: the `local` flag is read asynchronously, so check that no outside `<img>` can render before it resolves, and that `SEED_RECOMMENDATIONS` (non-local) keeps its https images. Deliberate: the client also rejects non-app URLs in local mode, as a second guard beside the API change.
