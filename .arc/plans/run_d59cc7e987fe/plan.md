summary: |
  Restyle discovery so places look inviting and are easy to save or add to a trip. Place covers become local colour gradients built only from design tokens (no photo request, no initial, no watermark) through one new `PlaceCover` component used by the Explore, Saved and trip Recommendations cards. The Explore screen becomes a real discovery screen: a place search field, a row of filter chips, a list/map toggle and `PlaceCard`s, each with a Save and an Add-to-trip control. Add-to-trip also marks the place saved and both controls confirm with a toast. The Saved screen switches to the same `PlaceCard`. Layout is checked at 390px and 1280px with no horizontal scrolling.
scope:
  - description: |
      New `PlaceCover` component: a decorative, empty `div` with a gradient class chosen deterministically from the place id (a tiny string hash modulo 4 variants). No children, no `img`, no text.

      ```tsx
      export const COVER_VARIANTS = 4
      export function coverVariant(seed: string): number
      export function PlaceCover({ seed }: { seed: string }) // <div className={`cover cover-${n}`} aria-hidden="true" data-testid="place-cover" />
      ```
    files:
      - apps/web/src/places/PlaceCover.tsx
      - apps/web/src/places/PlaceCover.test.tsx
    rationale: |
      One shared cover so Explore, Saved and Recommendations look the same and none loads a remote photo (AC 1, 2, 12).
  - description: |
      Add `.cover` (aspect-ratio 4 / 3, `border-radius: var(--radius-md)`) and four `.cover-0..3` variants to `index.css`, each a `linear-gradient(135deg, A, B)` of two colour tokens. Pairs use only `--color-primary`, `--color-info`, `--color-success` and `--color-primary-hover`. Warning and danger colours are skipped because they carry meaning. Remove the `.rec-img*` rules once `RecommendationImage` is gone. Add explore-toolbar layout (`.explore-bar`, flex-wrap, `min-width: 0`) using `--space-*` only.
    files:
      - apps/web/src/index.css
    rationale: |
      Tokens are loaded in `apps/web/src/index.css` line 2 (`@import "../../../design-system/tokens.css"`, after `@import "tailwindcss"`); there is no Tailwind config file and the app styles with token-based classes in this one stylesheet, so the new rules go here. `designSystem.test.ts` forbids colour literals and raw px, so tokens only.
  - description: |
      `PlaceCard`: replace the remote `<img src={place.image_url}>` with `<PlaceCover seed={place.id} />`. Move the "Saved" badge out of the cover into the card body so nothing overlays the cover. Make `onAdd` optional (`onAdd?: (place: Place) => void`) and render the Add-to-trip button only when it is given, so the Saved screen can reuse the card. Keep the Save button (`aria-label` "Save X" or "Unsave X", `aria-pressed`).
    files:
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/places/PlaceCard.test.tsx
    rationale: |
      Covers AC 1, 2, 7, 8, 12 and gives the Saved screen the same card style (AC 9).
  - description: |
      Add-to-trip also saves. `useAddToTrip` gets an optional callback, called only after `addPlaceToTrip` succeeds. `useSavedPlaces` exposes `ensureSaved(place): Promise<boolean>`, which saves only when not already saved and so never unsaves.

      ```ts
      export function useAddToTrip(options: { onAdded?: (place: Place) => void } = {})
      // in useSavedPlaces return: { savedIds, saved, toggle, ensureSaved, pendingIds, panel }
      const ensureSaved = (place: Place) => (savedRef.current ?? []).some((p) => p.id === place.id) ? Promise.resolve(true) : add(place)
      ```
    files:
      - apps/web/src/places/AddToTrip.tsx
      - apps/web/src/places/useSavedPlaces.tsx
      - apps/web/src/places/AddToTrip.test.tsx
    rationale: |
      AC 15 and 16: adding to a trip marks the place saved and shows a confirmation. The existing "Place added" toast is the add confirmation, and `add()` already shows "saved to your account". Existing callers such as `DestinationResultsPage` pass nothing and keep today's behaviour.
  - description: |
      Rewrite `ExplorePage`. It keeps the heading and the "Search stays, flights and transport" link and adds:
      - a `role="search"` form with a labelled "Search places" field and a Search button, which sets the `q` URL param and filters by place name;
      - `PlaceFilters` chips (type and price, reflected in the `type` and `price` URL params);
      - `ViewToggle` (the `view` URL param, `map` or list);
      - a `PlaceCard` grid, or `PlacesMap` in map view, with `useSavedPlaces` for Save and `useAddToTrip({ onAdded: ensureSaved })` for Add to trip;
      - loading skeletons, an empty state and an error alert, as on `DestinationResultsPage`.

      Places come from the existing `searchPlaces(destination, q, filters)`. The destination is the `destination` URL param and defaults to `DEFAULT_EXPLORE_DESTINATION` (see open questions). A heading line "Places in {destination}" and a "Change destination" link to `/` let the user change it.
    files:
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/explore/ExplorePage.test.tsx
    rationale: |
      AC 3 to 8 and 13 to 16. It reuses the existing places API, filters, toggle, map and hooks rather than re-implementing them. Layout is single-column on phone and the auto-fit `.grid` on desktop (AC 10, 11).
  - description: |
      `SavedPage` list view renders `<PlaceCard saved onToggleSave={unsave} savePending=... />` per saved place instead of its own `li` with an `img`. The map, empty and loading states, the toast with undo and the heading are unchanged.
    files:
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/saved/SavedPage.test.tsx
    rationale: |
      AC 9 and 2. The card is identical to Explore (cover, name, Save control).
  - description: |
      Recommendations (`TripRecommendationsTab`): swap `RecommendationImage` for `PlaceCover` (seed `r.place?.id ?? r.id`). Delete `RecommendationImage.tsx` and its test. `PLACEHOLDER_SRC` and `isAppImage` are only used there, so remove them. Update the recommendation tests and the local-recommendations e2e that assert on the photo, the "Placeholder" badge or "Saved in app".
    files:
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/trips/TripRecommendationsTab.test.tsx
      - apps/web/src/trips/RecommendationImage.tsx
      - apps/web/src/trips/RecommendationImage.test.tsx
      - apps/web/e2e/local-recommendations.spec.ts
    rationale: |
      AC 2: no discovery screen loads a remote photo. AC 12: no label or badge sits on the cover.
  - description: |
      Playwright spec for Explore at 390px and 1280px. The API is stubbed at the network edge, as in `foundations.spec.ts`.
    files:
      - apps/web/e2e/explore.spec.ts
    rationale: |
      AC 10 and 11 (layout without horizontal scroll) and AC 2 (no request leaves the app origin) need a real browser.
tests:
  - |
    AC1/12 `PlaceCover.test.tsx`, written first. It fails until the component exists.
    ```tsx
    render(<PlaceCover seed="p1" />)
    const cover = screen.getByTestId('place-cover')
    expect(cover.className).toMatch(/\bcover-[0-3]\b/)
    expect(cover).toBeEmptyDOMElement()
    expect(cover.querySelector('img')).toBeNull()
    expect(coverVariant('p1')).toBe(coverVariant('p1'))
    ```
  - |
    AC1/2 `ExplorePage.test.tsx` (mock `searchPlaces` with `image_url: 'https://img.example/a.jpg'`).
    ```tsx
    expect(await screen.findAllByTestId('place-cover')).toHaveLength(2)
    expect(document.querySelectorAll('img')).toHaveLength(0)
    ```
  - |
    AC3/4 `ExplorePage.test.tsx`.
    ```tsx
    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(screen.getByLabelText('Search places')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Filters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Museum' })).toHaveAttribute('aria-pressed', 'false')
    ```
  - |
    AC5/6 `ExplorePage.test.tsx`.
    ```tsx
    fireEvent.click(await screen.findByRole('tab', { name: 'Map' }))
    expect(screen.getByRole('img', { name: 'Map of places' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'List' }))
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(screen.queryByRole('img', { name: 'Map of places' })).toBeNull()
    ```
  - |
    AC7/8 `ExplorePage.test.tsx` and `PlaceCard.test.tsx`.
    ```tsx
    expect(await screen.findByRole('button', { name: 'Save Alfama' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Alfama to trip' })).toBeInTheDocument()
    ```
  - |
    AC9 `SavedPage.test.tsx`: the old assertions on `img` are replaced.
    ```tsx
    expect(await screen.findAllByTestId('place-cover')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Unsave Alfama' })).toBeInTheDocument()
    expect(document.querySelectorAll('img')).toHaveLength(0)
    ```
  - |
    AC10/11 `e2e/explore.spec.ts`, run once with viewport 390x800 and once with 1280x800.
    ```ts
    await page.goto('/explore')
    await expect(page.getByRole('search')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Filters' })).toBeVisible()
    await expect(page.getByRole('tablist', { name: 'Results view' })).toBeVisible()
    await expect(page.getByTestId('place-cover').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    ```
  - |
    AC2 `e2e/explore.spec.ts`: no request leaves the app origin while Explore, Saved and a trip's Recommendations render (same listener as `foundations.spec.ts`). It asserts `external` equals `[]`.
  - |
    AC13 `ExplorePage.test.tsx` (signed in, `savePlace` mocked).
    ```tsx
    fireEvent.click(await screen.findByRole('button', { name: 'Save Alfama' }))
    expect(await screen.findByRole('button', { name: 'Unsave Alfama' })).toHaveAttribute('aria-pressed', 'true')
    ```
  - |
    AC14 `ExplorePage.test.tsx`.
    ```tsx
    expect(await screen.findByText('Alfama saved to your account.')).toBeInTheDocument()
    ```
  - |
    AC15 `ExplorePage.test.tsx` and `AddToTrip.test.tsx` (one trip, `addPlaceToTrip` and `savePlace` mocked).
    ```tsx
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    expect(await screen.findByRole('button', { name: 'Unsave Alfama' })).toHaveAttribute('aria-pressed', 'true')
    expect(savePlace).toHaveBeenCalledTimes(1)
    ```
    An already-saved place stays saved: `savePlace` is not called and `unsavePlace` is not called. A failed `addPlaceToTrip` does not save.
  - |
    AC16 `ExplorePage.test.tsx`.
    ```tsx
    expect(await screen.findByText('Place added')).toBeInTheDocument()
    ```
  - |
    Regression: `designSystem.test.ts` stays green (no colour literals or raw px in the new CSS). `DestinationResultsPage.test.tsx` stays green with `PlaceCard` (it asserts Save and Add), after dropping any `img` assertion. The `TripRecommendationsTab` tests assert covers render and no `img` appears. Narrow commands: `(cd apps/web && pnpm run test -- src/explore/ExplorePage.test.tsx)` and `(cd apps/web && pnpm exec playwright test e2e/explore.spec.ts)`.
assumptions_or_open_questions:
  - |
    The places API (`GET /places`) requires a `destination`, and Explore currently has none. I assume Explore opens on a default destination, `DEFAULT_EXPLORE_DESTINATION = 'Lisbon'` (the seeded catalogue's destination), overridable with `?destination=`. Please confirm, or say what the default should be. The alternative is to add a destination-less catalogue endpoint to the API, which I treated as out of scope.
  - |
    The old Explore search was a destination search that navigated to `/destinations?q=`. It now filters places by name within the destination, and the Home page keeps the destination search. The existing Explore test that expects navigation to `/destinations` is replaced.
  - |
    AC15 reads "add-to-trip marks the place saved". I save only after the trip add succeeds. The no-trips path, which navigates to `/places/add`, does not save. The destination results page keeps its current add-only behaviour.
  - |
    Both the "Place added" and "saved to your account" toasts can appear on add-to-trip. That is acceptable for the ACs; say if only one is wanted.
  - |
    The "Saved" badge no longer overlays the cover, so the cover carries no text (AC 12). The saved state shows on the Save button and in the card body.
  - |
    The 390px phone width is checked in Playwright. The existing phone rules already set the `--size-control-lg` touch height on `.chip` and `.tab`.
  - |
    No gradient token exists in `design-system/tokens.css`. Gradients are built from existing colour tokens, so no new token or literal is needed.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — front-end restyle only. No schema, stored data, settings or env vars change. Saved places and trip places keep their stored `image_url`, which is simply no longer rendered. Rollback is a plain revert.

  ### Findings
  - Tokens: `design-system/tokens.css` is imported at `apps/web/src/index.css:2`. Styling is token-based classes in that one file, so there is no Tailwind config to change.
  - `PlaceCard` (with Save and Add to trip) already exists and is used only by `DestinationResultsPage`. `ExplorePage` today is just a heading, `DestinationSearch` and a link. `SavedPage` renders its own `li` with an `img`. `TripRecommendationsTab` uses `RecommendationImage`, which can request remote photos.
  - `useSavedPlaces.add` already toasts "saved to your account", and `useAddToTrip` already toasts "Place added". Those are the confirmations for AC 14 and 16.

  ```mermaid
  flowchart TD
    Explore[explore/ExplorePage]:::touched -->|new discovery screen| Card[places/PlaceCard]:::touched
    Saved[saved/SavedPage]:::touched -->|same card style| Card
    Card -->|gradient cover| Cover[places/PlaceCover]:::touched
    Recs[trips/TripRecommendationsTab]:::touched -->|replaces RecommendationImage| Cover
    Explore --> Filters[places/PlaceFilters]
    Explore --> Toggle[places/ViewToggle]
    Explore --> Map[places/PlacesMap]
    Explore -->|onAdded saves| AddHook[places/AddToTrip useAddToTrip]:::touched
    Explore --> SavedHook[places/useSavedPlaces]:::touched
    Saved --> SavedHook
    Explore --> Api[places/api searchPlaces]
    Results[places/DestinationResultsPage] --> Card
    Cover --> Css[index.css gradients from tokens]:::touched
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN: gradient covers, the Explore screen (search, chips, toggle, cards, save and add-to-trip), the Saved screen on `PlaceCard`, and Recommendations covers. OUT: API changes, a destination-less places endpoint, map redesign, and the no-trips add flow. The riskiest parts are the add-to-trip then save sequencing (it must not unsave a saved place, and must not save when the add fails) and the removal of `RecommendationImage` with its tests and e2e. The default Explore destination is an assumption flagged for confirmation. Gradients deliberately use only existing colour tokens, and the "Saved" badge was moved off the cover to satisfy the no-watermark criterion.
