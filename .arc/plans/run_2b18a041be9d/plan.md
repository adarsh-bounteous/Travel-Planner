summary: |
  The Destinations page (`/destinations`, `DestinationResultsPage`) already has Save/Unsave buttons wired to `useSavedPlaces`, which is what Recommendations uses. Reading the code shows five gaps against the ACs. (1) Local-mode places carry a `data:` placeholder image, and `PUT /saved-places/{id}` rejects it with 422 because `_safe_image_url` only allows https URLs or same-origin paths. (2) A direct save shows no success confirmation, because the toast only appears after the sign-in return. (3) The page treats `q` as the destination, so Recommendations "Open" (`?destination=X&q=name`) searches the place name as if it were a destination, and the places may not belong to the chosen destination. (4) There is no "already saved" message. (5) Re-saving must keep a single entry in Saved; it already does through the store's keyed upsert, and a test will pin it. The plan is test-first and reuses the existing hook, Toast, alert classes and places API.
scope:
  - description: |
      Backend: accept the local placeholder image when saving. In `services/api/app/routers/saved_places.py`, `_safe_image_url` also returns True for the exact `PLACEHOLDER_IMAGE` constant imported from `app.places.local_search`. It is an exact-match allow-list, so arbitrary `data:` URIs and `javascript:` URLs stay rejected. The existing `MAX_URL` bound still applies.
      ```python
      from app.places.local_search import PLACEHOLDER_IMAGE

      def _safe_image_url(url: str) -> bool:
          return url == PLACEHOLDER_IMAGE or url.startswith("https://") or (
              url.startswith("/") and not url.startswith("//")
          )
      ```
    files:
      - services/api/app/routers/saved_places.py
      - services/api/tests/unit/test_saved_places_router.py
    rationale: |
      AC2. Local places from `LocalPlaceSearch` use a `data:image/svg+xml` URI, so saving them currently fails with 422. Importing the constant keeps one source of truth.
  - description: |
      Web: `useSavedPlaces` gives clear feedback. (a) `toggle` on the add path shows a success toast `"${place.name} saved to your account."` (the same text the sign-in return already uses). A failed save keeps the existing danger alert and shows no success toast. (b) A new `notice` state, shown in `panel` as `<p role="status" className="alert alert-info">`, reads `"${place.name} is already saved."`. It is set by the shared `add` path whenever the place's id is already in the saved list. In that case `add` makes no PUT call and the list is unchanged, so Saved holds the place once. This covers the pending-save-after-sign-in flow, where the place was saved earlier. `toggle` and the sign-in return both clear `notice`, `failed` and the toast first.
      ```ts
      const add = useCallback(async (place: Place): Promise<boolean> => { /* already saved -> setNotice, return false */ }, [])
      ```
      Because `add` is a `useCallback` with no dependencies, the already-saved check reads the current list through a ref or the functional `setSaved`. It must not capture a stale `savedIds`.
    files:
      - apps/web/src/places/useSavedPlaces.tsx
      - apps/web/src/places/DestinationResultsPage.test.tsx
    rationale: |
      AC1, AC3, AC4, AC7, AC8. The hook is shared by Recommendations and Saved, so the success toast and notice are additive. Existing tests that assert no toast after a failed save must keep passing.
  - description: |
      Web: the Destinations page lists only places from the chosen destination. Read an optional `destination` search param. When present, call `searchPlaces(destination, query)`, treating `q` as a name filter, which the API already supports. When absent (Home search), keep the current `searchPlaces(query)`. Heading becomes `Places in {destination ?? query}`, and the local-mode count note uses the same value. The effect dependencies gain `destination`. The `!query` redirect becomes `!query && !destination`, and `destination` alone also works.
      ```ts
      const destination = (params.get('destination') ?? '').trim()
      const area = destination || query
      searchPlaces(area, destination ? query || undefined : undefined, { placeType, price })
      ```
    files:
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/places/DestinationResultsPage.test.tsx
    rationale: |
      AC6. `TripRecommendationsTab.open` already links to `/destinations?destination=...&q=<place name>`. Today that makes `q` the whole destination, so the page does not show the chosen destination's places.
tests:
  - |
    AC1 (vitest, DestinationResultsPage.test.tsx, `Saving places`): clicking Save on a card makes a PUT with the place and flips the card to saved.
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    await waitFor(() => expect(putCalls(fetchMock)).toEqual(['/saved-places/p1']))
    ```
    The existing 'Save flips the card to saved' test already covers the flip. Add the PUT body assertion with `JSON.parse(init.body)` equal to `alfama`.
  - |
    AC2 (pytest, test_saved_places_router.py): saving a place whose image is the local placeholder returns 200, and other `data:` URIs still return 422.
    ```python
    from app.places.local_search import PLACEHOLDER_IMAGE
    r = client.put("/saved-places/p1", json={**PLACE, "image_url": PLACEHOLDER_IMAGE})
    assert r.status_code == 200
    r = client.put("/saved-places/p1", json={**PLACE, "image_url": "data:text/html,<script>1</script>"})
    assert r.status_code == 422
    ```
    Match the file's own client and `sign_in_as` fixture usage. The first assertion fails today with 422.
    A vitest case in local mode also saves a place whose `image_url` is the `data:image/svg+xml,...` placeholder and expects a PUT to `/saved-places/<id>`.
  - |
    AC3 (vitest): after a successful Save a visible confirmation shows.
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    expect(await screen.findByText('Alfama saved to your account.')).toBeInTheDocument()
    ```
  - |
    AC4 (vitest): a failing PUT shows an alert and no success text. The `PUT /saved-places/p1` stub returns 500 for a signed-in user.
    ```ts
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't update your saved places")
    expect(screen.queryByText('Alfama saved to your account.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Alfama' })).toHaveAttribute('aria-pressed', 'false')
    ```
  - |
    AC5 (vitest, extends the existing 'a saved place then shows on the Saved list' test): after Save, opening Saved lists the place. Add a local-mode variant using a place with the placeholder image, so the Saved list shows its `img` with `alt` equal to the place name.
  - |
    AC6 (vitest): a `destination` param scopes the search, and `q` filters within it.
    ```ts
    stubApi({ 'GET /places?destination=Lisbon&q=Alfama': { status: 200, body: [alfama] }, 'GET /trips': { status: 200, body: [] } })
    renderAt('/destinations?destination=Lisbon&q=Alfama')
    expect(await screen.findByRole('heading', { name: 'Places in Lisbon' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([p]) => String(p) === '/places?destination=Alfama')).toBe(false)
    ```
    The existing `?q=Lisbon` tests must still pass unchanged.
  - |
    AC7 (vitest): a pending save for a place that is already saved shows the notice. Seed `sessionStorage.pendingSave` with `alfama`, stub `GET /saved-places` to return `[alfama]`, and sign in.
    ```ts
    expect(await screen.findByText('Alfama is already saved.')).toBeInTheDocument()
    expect(putCalls(fetchMock)).toEqual([])
    ```
    A second hook-level case clicks Save then Unsave then Save, to check the notice only appears for a genuine duplicate.
  - |
    AC8 (vitest and pytest): saving the same place twice leaves one entry. The vitest case checks that after the duplicate attempt the Saved page shows `screen.getAllByText('Alfama')` with length 1. The pytest case, in `test_save_is_idempotent_and_unsave_removes`, asserts `len(client.get("/saved-places").json()) == 1` after two PUTs of the same id. Extend it if it does not already assert this.
assumptions_or_open_questions:
  - |
    Interpretation of "Destinations page". This is `/destinations` (`DestinationResultsPage`), which Recommendations "Open" links to. The starter pages (`StarterPlannerPage`, `StarterPlaceContentPage`) list only sample names with no place ids, images or coordinates. They are out of scope, because saving needs a full `Place` snapshot. Please confirm.
  - |
    AC7 trigger. On the results page a saved card shows "Unsave", so a plain second click removes the place instead of re-saving it. The plan shows "already saved" for any save attempt on a place already in the saved list. In practice that is the pending save after sign-in, or a stale or duplicate attempt. If the reviewer wants a visible Save button on already-saved cards, so that a second click shows the message, that changes the Unsave behaviour covered by existing tests and needs a decision.
  - |
    The backend cannot tell a new save from a repeat. `PUT /saved-places/{id}` is an idempotent upsert that returns 200, so "already saved" is detected client-side from the loaded list. If that list failed to load, the card shows as not saved, the save succeeds, and the entry is still not duplicated (AC8).
  - |
    The settled starter countries (Japan, Portugal, India, Thailand, Mexico, Morocco, Peru) feed the starter-destination data, not the `/places` catalogue. The local catalogue (`local_search.py`) has only Lisbon, Kyoto and Paris, and extending it is out of scope here.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — no schema, stored-data shape, setting or seed changes. The saved-places map and the `Place` snapshot are unchanged, and the only new accepted value is one existing constant image URI. Existing saved places stay readable. Rollback is a plain revert.

  ### UI and design tokens

  `apps/web/src/index.css:2` imports `../../../design-system/tokens.css`. No new styles are added. The new UI reuses existing classes (`alert`, `alert-info`, `toast`) and the existing `Toast` component. It adds no colour or pixel literals and no new token usage.

  ```mermaid
  flowchart TD
    DRP[DestinationResultsPage.tsx] -->|destination param, heading| API[places/api.ts searchPlaces]
    DRP --> USP[useSavedPlaces.tsx]
    TRT[TripRecommendationsTab.tsx] -->|Open link with destination and q| DRP
    TRT --> USP
    SP[SavedPage.tsx] --> USP
    USP -->|PUT saved-places| SPR[saved_places.py]
    SPR -->|placeholder allow-list| LS[local_search.py PLACEHOLDER_IMAGE]
    SPR --> SS[saved_store.py keyed upsert]
    classDef touched fill:#f96,color:#000
    class DRP,USP,SPR touched
  ```

  Why each node is touched: `DestinationResultsPage` for the destination scoping (AC6), `useSavedPlaces` for the success toast and the already-saved notice (AC3, AC7), and `saved_places.py` for the placeholder image (AC2). The store already upserts by id, so no change is needed for AC8.

  Test command, narrow forms: `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_saved_places_router.py)` and `(cd apps/web && pnpm run test src/places/DestinationResultsPage.test.tsx)`.
review_focus: |
  IN: the placeholder allow-list in the saved-places router, the success toast and already-saved notice in `useSavedPlaces`, and the `destination` param on the Destinations page. OUT: starter-destination pages, new catalogue places, and any change to the Saved page layout. The riskiest part is `useSavedPlaces`, which Recommendations and Saved also use. Check that the added toast and notice do not break their existing tests, and that `add` reads the current saved list rather than a stale closure. The allow-list is deliberately an exact match on one constant, not a broader `data:` rule.
