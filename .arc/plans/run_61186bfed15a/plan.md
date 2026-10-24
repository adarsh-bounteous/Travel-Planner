summary: |
  Let a traveller save and unsave places from Destination results cards, see saved places with a distinct
  filled-heart pin on the Destination results map, and review every saved place on a new account-wide Saved
  page (list/map toggle, empty state, unsave with Undo). Saved places are stored per account on the existing
  account item in the Trip Database (no trip involved), exposed by three new Trip Planner API endpoints, and
  consumed by the React web app. A signed-out visitor who chooses Save is sent to sign in and the pending place
  is saved once sign-in completes. Built against the approved prototype (Save/Unsave buttons on `.place-card`,
  `.map-box` with legend and `.pin-saved`/`.pin-plain` pins, Saved list/map tabs, `.empty-state`, `.skeleton`
  loading, `.toast` with Undo).
scope:
  - description: |
      API: saved-place store port with in-memory and DynamoDB adapters, mirroring `ProfileStore`.
      ```python
      class SavedPlaceStore(Protocol):
          def list_saved(self, owner_id: str) -> list[Place]: ...
          def save(self, owner_id: str, place: Place) -> None: ...      # idempotent, keyed by place.id
          def unsave(self, owner_id: str, place_id: str) -> None: ...   # idempotent
      ```
      The Dynamo adapter keeps a `saved_places` map (place id to Place dict) on the account item
      `USER#{owner_id}` in the accounts table, same item as `profile`. A snapshot of the place is stored
      because the Saved map needs lat/lng and the catalogue is looked up by destination, not by id.
    files:
      - services/api/app/trips/saved_store.py
      - services/api/tests/unit/test_saved_store.py
    rationale: |
      Reuses the account item and accounts table (no new table, no new setting). `list_saved` returns the
      places in the order they were saved.
  - description: |
      API: `saved_places` router and wiring. `GET /saved-places` returns `list[Place]`;
      `PUT /saved-places/{place_id}` with a `Place` body saves (200, idempotent, 422 if the body id differs
      from the path); `DELETE /saved-places/{place_id}` unsaves (204, idempotent). All use
      `Depends(get_current_user)` so the owner is taken from the session cookie only. Add `get_saved_places`
      and a cached `_saved_places()` to deps, register the router in `main.py`, and override the new
      dependency in the test conftest.
    files:
      - services/api/app/routers/saved_places.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
      - services/api/tests/conftest.py
      - services/api/tests/unit/test_saved_places_router.py
    rationale: Follows the profile router and deps pattern; per-traveller isolation comes from the session owner.
  - description: |
      API: let a signed-out visitor load Destination results (AC 11 needs a signed-out visitor to be on that
      screen). Drop `get_current_user` from `GET /places` only (read-only seeded catalogue). Update
      `test_signed_out_calls_are_rejected` to assert 200 and keep every other router authenticated.
      See the first open question: this is a decision for the reviewer.
    files:
      - services/api/app/routers/places.py
      - services/api/tests/unit/test_places_router.py
    rationale: Today the whole web app sits behind RequireAuth and `/places` returns 401, so AC 11 and 12 cannot be reached.
  - description: |
      Web: saved-places client and state hook. In `places/api.ts` add
      `fetchSavedPlaces = () => call<Place[]>('/saved-places')`,
      `savePlace = (place: Place) => call<Place>(`/saved-places/${encodeURIComponent(place.id)}`, 'PUT', place)` and
      `unsavePlace = (id: string) => call<void>(`/saved-places/${encodeURIComponent(id)}`, 'DELETE')`.
      New `useSavedPlaces()` returns `{ savedIds: Set<string>, saved: Place[] | null, toggle(place), pendingIds }`.
      A save/unsave updates local state at once and rolls back with an `.alert` message if the call fails.
      The hook never fetches `/trips`, so it works with no trips (AC 4). When the visitor is signed out,
      `toggle` stores the place in sessionStorage under `pendingSave`, calls `rememberReturnTo(location)` and
      navigates to `/sign-in`; once `useAuth().status === 'signedIn'` the hook saves the pending place,
      clears it and calls `takeReturnTo()` (AC 11, 12).
    files:
      - apps/web/src/places/api.ts
      - apps/web/src/places/useSavedPlaces.ts
      - apps/web/src/places/useSavedPlaces.test.tsx
    rationale: One hook owns saved state for Destination results and the Saved page, like `useAddToTrip` does for adding to a trip.
  - description: |
      Web: place card save action. `PlaceCard` gains `saved: boolean`, `onToggleSave(place)` and
      `savePending?: boolean`. Not saved renders `.btn btn-primary` "Save" with a heart icon and
      `aria-pressed="false"`, `aria-label="Save {name}"`. Saved renders `.btn btn-secondary` "Unsave" with a filled
      heart, `aria-pressed="true"`, `aria-label="Unsave {name}"`, plus the "Saved" `.badge` over the image
      (prototype `.thumb .badge`). The existing "Add to trip" button stays. The prototype shows one primary
      button per card; "Add to trip" therefore becomes `.btn-secondary`, so Save is the only `.btn-primary`
      on the card while unsaved (guideline: one `.btn-primary` per section).
    files:
      - apps/web/src/places/PlaceCard.tsx
    rationale: Prototype `results-list` screen, `place-card` / `save-place` / `unsave-place` elements.
  - description: |
      Web: map markers. `PlacesMap` takes `savedIds?: Set<string>` and renders each place as a pin shaped like the
      prototype (`pin-saved`: filled `--color-primary` teardrop with a white heart, 36x46; `pin-plain`: outlined
      `--color-border-strong` teardrop with dot, 28x36), keeping the existing SVG viewBox scaling. Each pin keeps
      `role="listitem"` and its name label, and adds `data-saved="true|false"` plus an accessible label ending
      "saved" or "not saved" (never colour alone). A legend ("Saved place" and "Not saved") sits top-left as in
      `.map-legend`. The map component is shared with the Saved page via an optional `ariaLabel` prop
      (default "Map of places"; Saved uses "Map of saved places"). The legend on the Saved map lists only
      "Saved place".
    files:
      - apps/web/src/places/PlacesMap.tsx
    rationale: Prototype `results-map` and `saved-list-map` screens, `marker-legend`, `saved-marker`, `unsaved-marker`.
  - description: |
      Web: wire Destination results. `DestinationResultsPage` calls `useSavedPlaces()`, passes `saved`
      and `onToggleSave` to each `PlaceCard` and `savedIds` to `PlacesMap`. Remove the `RequireAuth` wrapper for
      `/destinations` in `App.tsx` and update the comment above `App` to list this third exception. The page
      renders for a signed-out visitor; `searchPlaces` no longer 401s.
    files:
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/App.tsx
    rationale: Signed-out Save needs the page reachable. HomePage and every other route stay behind RequireAuth.
  - description: |
      Web: Saved page and nav link. New `SavedPage` at route `/saved` (wrapped in `RequireAuth`) with the same
      List/Map tabs as `ViewToggle` (parameterise its `aria-label`: "Results view" stays the default, Saved
      passes "Saved view"), view held in `?view=map`. Loading shows three `.skeleton.card` placeholders in
      `role="status"`. List: count line ("2 saved places across all your trips"), `.grid` of
      cards with an Unsave `.btn-secondary`. Unsave removes the card at once and shows the existing `Toast`
      with an Undo action that re-saves. Map: `PlacesMap` with every saved place. Empty (list or map view): `.empty-state` with heart icon, `<h2>No places are saved yet</h2>`,
      "Save places from Destination results to see them here." and one `.btn-primary` "Find places" linking to `/`.
      `AppHeader` gets a `NavLink` "Saved" to `/saved` for signed-in travellers, before Account (utility
      links sit after the sections; the full nav is owned by the App shell story, so only this link is added).
    files:
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/saved/SavedPage.test.tsx
      - apps/web/src/places/ViewToggle.tsx
      - apps/web/src/AppHeader.tsx
      - apps/web/src/AppHeader.test.tsx
      - apps/web/src/App.tsx
    rationale: Prototype `saved-list`, `saved-list-map`, `saved-empty` screens; the shell owns the header, so only the Saved link is added.
  - description: |
      Web: pending-save plumbing in `returnTo.ts` is reused as is (`rememberReturnTo`, `takeReturnTo`). Add
      `pageLabel` entry so the sign-in notice reads "Destination results" for `/destinations`.
    files:
      - apps/web/src/auth/returnTo.ts
      - apps/web/src/auth/returnTo.test.ts
    rationale: The sign-in page shows "You'll go to {page label} after signing in"; the default "that page" is vague.
tests:
  - |
    AC1, web, apps/web/src/places/DestinationResultsPage.test.tsx (write first, fails: no Save button).
    ```tsx
    stubApi({ ...lisbon, 'GET /saved-places': { status: 200, body: [] },
              'PUT /saved-places/p1': { status: 200, body: alfama } })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    expect(await screen.findByRole('button', { name: 'Unsave Alfama' })).toHaveAttribute('aria-pressed', 'true')
    ```
  - |
    AC2, web: with `GET /saved-places` returning `[alfama]` and `DELETE /saved-places/p1` answering 204.
    ```tsx
    fireEvent.click(await screen.findByRole('button', { name: 'Unsave Alfama' }))
    expect(await screen.findByRole('button', { name: 'Save Alfama' })).toHaveAttribute('aria-pressed', 'false')
    ```
  - |
    AC3, web, apps/web/src/saved/SavedPage.test.tsx and AppHeader.test.tsx: the Saved link opens the list.
    ```tsx
    stubApi({ 'GET /saved-places': { status: 200, body: [alfama] } })
    renderAt('/')
    fireEvent.click(await screen.findByRole('link', { name: 'Saved' }))
    expect(await screen.findByText('Alfama')).toBeInTheDocument()
    ```
    Plus an end-to-end flow in the results test: save Alfama, then click the Saved link, using a stub whose
    `GET /saved-places` reflects the earlier PUT.
  - |
    AC4, web: `'GET /trips': { status: 200, body: [] }`, click Save and assert the card flips to Unsave and no
    request went to `/trips`.
    ```tsx
    expect(fetchMock.mock.calls.some(([p]) => String(p).startsWith('/trips'))).toBe(false)
    ```
  - |
    AC5, web: results with Alfama saved, Belém Tower not, then the Map tab.
    ```tsx
    fireEvent.click(await screen.findByRole('tab', { name: 'Map' }))
    const map = await screen.findByRole('img', { name: 'Map of places' })
    const pins = within(map).getAllByRole('listitem')
    expect(pins.map((p) => p.getAttribute('data-saved'))).toEqual(['true', 'false'])
    expect(within(map).getByText('Saved place')).toBeInTheDocument()
    ```
    Existing map tests keep passing: pin names stay in `aria-label` or `title`, so the aria-label order assertion
    at DestinationResultsPage.test.tsx is updated only if the label gains the saved suffix.
  - |
    AC6, web SavedPage.test.tsx: `renderAt('/saved')` with two saved places, click the Map tab.
    ```tsx
    fireEvent.click(await screen.findByRole('tab', { name: 'Map' }))
    const map = await screen.findByRole('img', { name: 'Map of saved places' })
    expect(within(map).getAllByRole('listitem')).toHaveLength(2)
    ```
  - |
    AC7, web SavedPage.test.tsx: `renderAt('/saved?view=map')`, click the List tab.
    ```tsx
    fireEvent.click(await screen.findByRole('tab', { name: 'List' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('img', { name: 'Map of saved places' })).not.toBeInTheDocument()
    ```
  - |
    AC8 and AC9, web SavedPage.test.tsx: `GET /saved-places` returns `[]`.
    ```tsx
    renderAt('/saved')
    expect(await screen.findByText('No places are saved yet')).toBeInTheDocument()
    expect(screen.getByText('Save places from Destination results to see them here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Find places' })).toBeInTheDocument()
    ```
  - |
    AC10, web SavedPage.test.tsx: one saved place; unsave removes it and offers Undo.
    ```tsx
    fireEvent.click(await screen.findByRole('button', { name: 'Unsave Alfama' }))
    await waitFor(() => expect(screen.queryByText('Alfama')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    ```
    Also: removing the last place shows the empty state.
  - |
    AC11, web DestinationResultsPage.test.tsx: `stubApi(lisbon, { signedOut: true })`, `renderAt('/destinations?q=Lisbon')`,
    click Save Alfama.
    ```tsx
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([p, i]) => String(p).startsWith('/saved-places') && i?.method === 'PUT')).toBe(false)
    expect(sessionStorage.getItem('returnTo')).toBe('/destinations?q=Lisbon')
    ```
  - |
    AC12, web (results test): signed-out Save, then sign in through the real form with
    `'POST /auth/sign-in': { status: 200 }` and `/auth/me` answering signed in after it.
    ```tsx
    await waitFor(() => expect(putCalls()).toEqual(['/saved-places/p1']))
    expect(await screen.findByRole('button', { name: 'Unsave Alfama' })).toBeInTheDocument()
    ```
    The stub's `/auth/me` must flip from 401 to 200 after sign-in; extend `stubApi` options in test-api.tsx
    with a `signedInAfter` hook, or use a mutable `options.signedOut`.
  - |
    API unit, services/api/tests/unit/test_saved_places_router.py (fails: 404 route).
    ```python
    def test_save_then_list(sign_in_as):
        a = sign_in_as("a@example.com")
        place = PLACE.model_dump()
        assert a.put("/saved-places/alfama", json=place).status_code == 200
        assert [p["id"] for p in a.get("/saved-places").json()] == ["alfama"]

    def test_save_is_idempotent_and_unsave_removes(sign_in_as):
        a = sign_in_as("a@example.com")
        a.put("/saved-places/alfama", json=PLACE.model_dump())
        a.put("/saved-places/alfama", json=PLACE.model_dump())
        assert len(a.get("/saved-places").json()) == 1
        assert a.delete("/saved-places/alfama").status_code == 204
        assert a.delete("/saved-places/alfama").status_code == 204
        assert a.get("/saved-places").json() == []

    def test_saved_places_are_per_traveller(sign_in_as):
        a, b = sign_in_as("a@example.com"), sign_in_as("b@example.com")
        a.put("/saved-places/alfama", json=PLACE.model_dump())
        assert b.get("/saved-places").json() == []

    def test_signed_out_is_rejected_and_mismatched_id_is_422(sign_in_as):
        a = sign_in_as("a@example.com")
        assert TestClient(app).get("/saved-places").status_code == 401
        assert a.put("/saved-places/other", json=PLACE.model_dump()).status_code == 422
    ```
  - |
    API unit, test_saved_store.py: the Dynamo adapter against a stubbed table (same technique as the existing
    Dynamo store tests, or botocore Stubber), and a row-compat test for existing data.
    ```python
    def test_account_item_without_saved_places_reads_as_empty():
        store = DynamoSavedPlaceStore.__new__(DynamoSavedPlaceStore)
        store._table = FakeTable({"pk": "USER#u1", "profile": {"display_name": "Maya"}})
        assert store.list_saved("u1") == []
    ```
    Also assert that saving does not overwrite the `profile` attribute (`SET saved_places.#id = :p`).
  - |
    API unit, test_places_router.py: replace the 401 test.
    ```python
    def test_search_is_readable_without_signing_in(sign_in_as):
        sign_in_as("a@example.com")
        assert TestClient(app).get("/places", params={"destination": "Lisbon"}).status_code == 200
    ```
assumptions_or_open_questions:
  - |
    DECISION NEEDED, signed-out access (AC 11, 12). Today every page except the invite and read-only trip
    pages is wrapped in RequireAuth and GET /places returns 401, so a signed-out visitor can never be on
    Destination results. This plan makes `/destinations` and `GET /places` public (read-only seeded catalogue)
    and keeps everything else, including all saved-places endpoints, authenticated. If you would rather keep
    Destination results private, AC 11 and 12 cannot be exercised as written and would need to be dropped or reworded.
  - |
    Prototype conflict, sign-in. The prototype opens an inline modal ("Sign in to save", email only, "Sign in and
    save"). The product signs in with email and password, Google and an email-confirm flow on `/sign-in`. This plan
    reuses the real `/sign-in` page and its returnTo flow instead of adding a second sign-in form, and saves the
    pending place on return. The toast text after the pending save follows the prototype ("{name} saved to your account.").
  - |
    Prototype conflict, Add to trip. The prototype card shows only Save/Unsave (primary/secondary). The existing
    "Add to trip" button (story 015) is kept and demoted to `.btn-secondary` so the card has one primary action.
  - |
    Prototype map uses percent-positioned pins on a grid; the app's `PlacesMap` scales real lat/lng into an SVG.
    This plan keeps the SVG scaling and only copies the pin shapes, colours and legend from the prototype.
  - |
    Saved places are stored as a snapshot of the Place (name, image, type, price, lat, lng) on the account item. If a
    place later changes in the catalogue the saved copy is stale; acceptable until a places provider is chosen.
    A DynamoDB item is limited to 400 KB, which holds thousands of snapshots; no cap is added.
  - |
    GDPR (ADR-0011): saved places are personal data on the account item. I did not verify that account deletion
    removes the whole `USER#` item. The implementer should check `routers/auth.py` and `auth/accounts.py` and
    make sure `saved_places` goes with it.
  - |
    Empty-state "Find places" links to `/` (Home search), the only entry to Destination results today.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: no migration. DynamoDB is schemaless; saved places are a new optional `saved_places` map
    on the existing `USER#{id}` item in the accounts table. Items without it read as an empty list, and the
    `profile` and credential attributes are untouched (updates use `SET saved_places.#id = :p` and `REMOVE`,
    never a whole-item put).
  - **Backfill / seed**: none needed.
  - **Settings**: none. The adapter reuses `accounts_table_name` (`app/config.py`, already used by `DynamoProfileStore`).
  - **Provisioning**: none. The Lambda role already has `GetItem`/`UpdateItem` on the accounts table for the profile.
  - **Order and rollback**: deploy API before web (the web calls the new endpoints). Rolling back leaves the
    `saved_places` attribute in place; old code ignores it.

  ### Design and code notes

  - Read: prototype screens `results-list`, `results-map`, `results-sign-in`, `saved-list`, `saved-list-map`,
    `saved-empty`; existing `PlaceCard`, `PlacesMap`, `ViewToggle`, `DestinationResultsPage`, `AddToTrip`,
    `AppHeader`, `RequireAuth`, `returnTo`, `SignInPage`, `places` and `profile` routers, `profile_store`, `deps`.
  - Save is account-wide and never reads or writes a trip.
  - Component and token usage follows the guidelines: `.btn-primary` Save, `.btn-secondary` Unsave, `.empty-state`
    with one `.btn-primary`, `.skeleton` for loading, `.toast` for the unsave Undo, `.tabs` for the toggle, `--color-primary` only
    for the saved pin and actions. Voice: buttons start with a verb.
  - Mobile: grids use `.grid` (single column on phones); map keeps `width: 100%` SVG scaling; pins are at least 44px targets.

  ```mermaid
  flowchart TD
    App[App.tsx routes]:::touched --> Results[DestinationResultsPage]:::touched
    App --> Saved[SavedPage new]:::touched
    App --> Header[AppHeader Saved link]:::touched
    Results --> Card[PlaceCard save button]:::touched
    Results --> Map[PlacesMap saved pins]:::touched
    Saved --> Map
    Results --> Hook[useSavedPlaces new]:::touched
    Saved --> Hook
    Hook --> PApi[places/api.ts]:::touched
    PApi --> Call[trips/api.ts call]
    Hook --> Return[auth/returnTo.ts]:::touched
    PApi -. HTTP .-> SRouter[routers/saved_places.py new]:::touched
    PRouter[routers/places.py public search]:::touched
    SRouter --> Deps[routers/deps.py]:::touched
    Deps --> Store[trips/saved_store.py new]:::touched
    Store --> Dynamo[(accounts table USER item)]
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN: save/unsave on cards, saved pins and legend on the results map, the Saved page (list/map/empty/undo), three
  saved-places endpoints, and the signed-out Save to sign-in to saved flow. OUT: trips, the full App shell nav, filters and
  Add to trip behaviour. Riskiest parts are the decision to make `/destinations` and `GET /places` public
  (the only way AC 11 and 12 can hold) and the Dynamo update expressions that must not clobber the profile or
  credential attributes on the shared account item. The reviewer should not flag reuse of `/sign-in` instead of
  the prototype's inline email modal, or demoting Add to trip to secondary, as these are deliberate and listed under open questions.
