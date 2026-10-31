summary: |
  Make every icon in navigation, section titles, meta rows, buttons and empty states come from the one inline-SVG set in `apps/web/src/auth/icons.tsx` (the `.icon` class, `ICONS` registry), and give each such element that has no icon one. Today the set exists and is used for alerts/badges, but the main nav links, page and section titles, meta rows and most buttons and empty states carry no icon, and `NotFoundPage` hand-draws its own search `<svg>`. The plan adds the few missing glyphs to the set, wires icons through shared pieces (nav config, `EmptyStateArt`, a small named-icon lookup) and then through each screen of the five sheets, guarded by tests that fail on any non-set icon or any icon-less element of those five kinds.
scope:
  - description: |
      Extend the single icon set. Add the glyphs the rollout needs that are missing (candidate names: `bed`, `plane`, `utensils`, `shield`, `compass`, `list`, `credit-card`, `map`, `share`, `check-circle` as needed per screen) as `export const XIcon = () => <Icon>…</Icon>` in the same stroke style, register every set icon in `ICONS`, and export a type plus a lookup:
      ```ts
      export type IconName = keyof typeof ICONS
      export function NamedIcon({ name }: { name: IconName }) { const I = ICONS[name]; return <I /> }
      ```
      Also register the existing icons not yet in `ICONS` (alert, check, info, bell, edit, trash, eye, heart, star, chevron-down, arrow-left, image) so screens can address them by name.
    files:
      - apps/web/src/auth/icons.tsx
      - apps/web/src/auth/icons.test.tsx
    rationale: One set, one registry; new glyphs are added here only, never inline in a screen.
  - description: |
      Navigation. Add `icon: IconName` to each `MAIN_SECTIONS` entry (trips → `trips`, explore → `search`/`compass`) and render `<NamedIcon>` before the label in `AppHeader` for the main links, plus Saved (`heart`), Account (`profile`) and the signed-out Sign in button (`profile`). Style via the existing `.shell-link`/`.btn` flex gap using `var(--space-2)`; no new literals. Other navigation (back links, tabs in `TripDetailPage`, `LocalMenu`) get the same treatment where they lack icons.
    files:
      - apps/web/src/navSections.ts
      - apps/web/src/AppHeader.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/local/LocalMenu.tsx
      - apps/web/src/index.css
    rationale: Navigation is the most visible place the product reads as one design (AC1, AC2).
  - description: |
      Empty states. Extend `EmptyStateArt` with an optional prop `icon?: IconName` (default `suitcase`) that renders the badge pattern `NotFoundPage` uses today (`.nf-icon` with `NamedIcon`), and pass a meaningful icon at each of the ~33 `className="empty-state"` sites. Replace the hand-drawn `<svg>` in `NotFoundPage` with `<NamedIcon name="search" />`. Reuse `.nf-icon`; if it is renamed to a neutral class (`.empty-icon`), keep the same tokens (`--size-check`).
    files:
      - apps/web/src/components/EmptyStateArt.tsx
      - apps/web/src/NotFoundPage.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/local/LocalInboxPage.tsx
      - apps/web/src/places/AddPlaceNoTripsPage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/index.css
    rationale: AC1 (no stray icon) and AC2 (every empty state has one); a shared component avoids per-page drift.
  - description: |
      Section titles, meta rows and buttons on the remaining screens. Put `<NamedIcon>` inside each `h1`/`h2`/`h3` section title (e.g. "My trips", "Stays", "Restaurants", "Itinerary", "Insurance", "Flights"), each meta row (dates → `calendar`, place → `map-pin`, time → `clock`, travellers → `profile`, price → `credit-card`) and each primary/secondary `.btn` that lacks one (Open, New trip, Retry, Save, Plan…). Screens, by sheet: sheet 2 entry (SignIn/SignUp/ConfirmEmail, MyTrips, NewTripSetup, starter pages), sheet 3 trip (TripDetailPage, ItineraryTab, ItineraryPage, BookTripDrawer, other drawers), sheet 4 options (Stay/Sim/Activity/Restaurant/Insurance options, shortlists and compare pages, FlightShortlistPage, TransportTab, OptionCard, RouteLine), sheet 5 (ExplorePage, DestinationResultsPage, TripRecommendationsTab, SavedPage, PlaceCard, PlaceDetails) and sheet 1 states. Icon-only buttons keep their `aria-label`; icons stay `aria-hidden`. Add `.title-icon`/`.meta-icon` helpers only if `.icon` sizing is not enough, using `--space-*` tokens and `currentColor`.
    files:
      - apps/web/src/components/OptionCard.tsx
      - apps/web/src/components/RouteLine.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/BookTripDrawer.tsx
      - apps/web/src/trips/StayOptionsPage.tsx
      - apps/web/src/trips/StayShortlistPage.tsx
      - apps/web/src/trips/SimOptionsPage.tsx
      - apps/web/src/trips/ActivityOptionsPage.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/RestaurantShortlistPage.tsx
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/trips/InsuranceComparePage.tsx
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/trips/TransportTab.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/places/PlaceDetails.tsx
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/auth/SignInPage.tsx
      - apps/web/src/auth/SignUpPage.tsx
      - apps/web/src/index.css
    rationale: Covers AC2 across the five sheets; the file list is the starting set, and the audit test (below) names any screen that still has an icon-less element.
tests:
  - |
    AC1, set membership. Write first in `apps/web/src/auth/icons.test.tsx`, then make it pass by registering all icons and removing the hand-drawn svg:
    ```ts
    it('registers every exported icon component', () => {
      for (const name of Object.keys(ICONS) as IconName[]) {
        const { container } = render(<NamedIcon name={name} />)
        expect(container.querySelector('svg.icon[aria-hidden="true"]')).not.toBeNull()
      }
    })
    ```
    And in `apps/web/src/NotFoundPage.test.tsx`: `expect(container.querySelectorAll('svg:not(.icon):not(.brand-mark)')).toHaveLength(0)` inside the empty state (EmptyStateArt's `ImageFrame` svg is excluded by its own selector).
  - |
    AC1, source guard. New `apps/web/src/iconSet.test.ts` reads every non-test `apps/web/src/**/*.tsx` except `auth/icons.tsx`, `components/BrandLogo.tsx`, `components/ImageFrame.tsx` and `places/PlacesMap.tsx` (map markers, not nav/title/meta/button/empty-state icons), and asserts no raw icon markup or glyph characters:
    ```ts
    expect(source).not.toMatch(/<svg\b/)
    expect(source).not.toMatch(/[✈★✓✕→←📍🏨🍴]/)
    ```
  - |
    AC2, navigation. In `apps/web/src/AppHeader.test.tsx`, signed in:
    ```ts
    for (const link of within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')) {
      expect(link.querySelector('svg.icon')).not.toBeNull()
    }
    ```
    plus the signed-out Sign in button has `svg.icon`. In `navSections.test.ts`: `MAIN_SECTIONS.every((s) => s.icon in ICONS)`.
  - |
    AC2, empty states. In `apps/web/src/components/EmptyStateArt.test.tsx`: render `<EmptyStateArt />` and `<EmptyStateArt icon="heart" />` and assert `container.querySelector('.nf-icon svg.icon')` is not null for both. Then per page test (MyTrips, Saved, Explore, LocalInbox, DestinationResults, AddPlaceNoTrips, Itinerary tab, Recommendations tab, option and shortlist pages): `expect(document.querySelector('.empty-state svg.icon')).not.toBeNull()` in the existing empty-state test of each.
  - |
    AC2, section titles, meta rows, buttons. New `apps/web/src/iconAudit.test.tsx` renders each routed screen in `App` with the existing mocked API fixtures (MyTrips, TripDetail tabs, Stay/Sim/Activity/Restaurant/Insurance options, Flights, Explore, Saved) and asserts:
    ```ts
    for (const el of container.querySelectorAll('h1, h2, h3, .meta, .btn')) {
      expect(el.querySelector('svg.icon'), el.textContent ?? '').not.toBeNull()
    }
    ```
    The test lists a small, commented exclusion set (e.g. text-only toggles, card-wrapping headings that already hold an icon in a child) and each exclusion must be justified in the test file. It fails first on the current code, then passes as the screens are updated.
assumptions_or_open_questions:
  - |
    "The five sheets" is read as the five sheets produced by `docs/design/render-sheets.mjs` (foundations/states, entry, trip, options, explore and phone), which together cover every routed screen. I have not verified the rendered mockups in `docs/design/mockups.html` for the intended icon per element, so icon choices are mine unless the reviewer names others.
  - |
    "One consistent icon set" is taken to be the existing inline-SVG set in `apps/web/src/auth/icons.tsx` (same 24px viewBox, stroke style from `.icon` in `apps/web/src/index.css`). No third-party icon library is added, so `package_dependencies` is empty.
  - |
    Not treated as icons for AC1: `BrandLogo`, the `ImageFrame` illustration svg, and `PlacesMap` map markers/controls. The reviewer should confirm that excluding map markers is acceptable.
  - |
    Every button gaining an icon is a large change (many files, plus layout risk on the 390px phone layout). I assumed icon-only treatment is not wanted: icons sit beside the visible text, so existing text-based tests (`getByRole('button', { name })`) keep passing because icons are `aria-hidden`.
  - |
    The `icon` prop on `EmptyStateArt` defaults to `suitcase`, so callers not yet updated still show an icon, but each site should pass a specific one.
estimated_points: 8
package_dependencies: []
notes: |
  ### Data & rollout
  None — front-end rendering only; no stored data, schema, settings or env vars. Safe to roll back by reverting the PR.

  Design tokens: `apps/web/src/index.css:2` imports `../../../design-system/tokens.css`, and `apps/web/src/main.tsx:6` imports `index.css`. Any new CSS uses only existing tokens (`--space-2`, `--space-3`, `--size-check`, `--color-fg-muted`, `--color-primary`); icons inherit `currentColor` through the existing `.icon` rule (`index.css:53`). No colour or pixel literals.

  Reuse: `EmptyStateArt` is extended (not replaced); `.nf-icon` and `.icon` styles are reused; no new component is introduced beyond the `NamedIcon` helper inside `icons.tsx`. The recent history (STORY-116 foundations, 118 imagery, 121 micro-interactions) touched the same files, so rebase conflicts in `index.css` and the trips pages are likely.

  ```mermaid
  flowchart TD
    icons[auth/icons.tsx]:::touched
    nav[navSections.ts]:::touched
    header[AppHeader.tsx]:::touched
    empty[components/EmptyStateArt.tsx]:::touched
    nf[NotFoundPage.tsx]:::touched
    pages[trips, places, explore, saved, auth pages]:::touched
    css[index.css]:::touched
    nav -->|icon per section| header
    icons -->|NamedIcon, ICONS| header
    icons -->|NamedIcon| empty
    empty -->|icon prop| nf
    empty -->|icon prop| pages
    icons -->|titles, meta rows, buttons| pages
    css -->|spacing for icon + label| header
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN: icons in navigation, section titles, meta rows, buttons and empty states on the screens of the five sheets, all from `auth/icons.tsx`. OUT: logo, `ImageFrame` art, `PlacesMap` markers, and any new icon library. The riskiest parts are the wide fan-out across ~30 screens (layout and phone-width regressions, merge conflicts with recent work) and the audit test's exclusion list, which must stay small and justified. Icon choices per element are judgement calls; the aria-hidden icons beside visible text are deliberate so accessible names do not change.
