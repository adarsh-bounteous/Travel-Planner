summary: |
  The web app already has one inline-SVG icon set (`apps/web/src/auth/icons.tsx`, `.icon` class, 2px round stroke, no icon package) but it is applied unevenly. The header navigation links have no icons, most `.section-title` / `.section-head` headings and meta rows (dates, places, travelers, price, source) are text only, many buttons and `.empty-state` blocks have none, and `NotFoundPage` hand-writes its own `<svg>`. This item finishes the rollout. We first add a guard test that fails on any non-set icon or on an icon-less nav item, section title, meta row, button or empty state. We then extend the set with the glyphs the redesign names (users, bed, plane, wallet, SIM, utensils, shield) and apply them screen by screen. Everything uses the existing `.icon` class and design tokens. No new dependency and no new icon source.

scope:
  - description: |
      Extend the single icon set. Add the missing glyphs the redesign names (UI-UX-REDESIGN.md section "Icons"): `UsersIcon`, `BedIcon`, `PlaneIcon`, `WalletIcon`, `SimIcon`, `UtensilsIcon`, `ShieldIcon`, plus any generic ones the audit shows are needed (for example `CompassIcon`, `MapIcon`, `ListIcon`, `BookmarkIcon`). Each is built on the existing private `Icon` wrapper (24x24 viewBox, `aria-hidden`, stroke from `.icon`). Register each in `ICONS` under its design name (`users`, `bed`, `plane`, `wallet`, `sim`, `utensils`, `shield`, ...). Export the `IconName` type: `export type IconName = keyof typeof ICONS`.
      Replace the hand-written `<svg>` in `NotFoundPage.tsx` with `<SearchIcon />`.
    files:
      - apps/web/src/auth/icons.tsx
      - apps/web/src/NotFoundPage.tsx
    rationale: |
      One set, one place. `designSystem.test.ts` already forbids icon packages and icon fonts, so new glyphs are hand-copied paths in the same style.
  - description: |
      Navigation. Give each `MAIN_SECTIONS` entry an `icon: IconName` (trips -> `trips`, explore -> `search`) and render `ICONS[section.icon]` inside the `.shell-link`. Add `SearchIcon`/`HeartIcon`/`UserIcon` to the Saved and Account utility links and an icon to the signed-out "Sign in" button. `.shell-link` is already `display:flex; align-items:center`, so add only a `gap: var(--space-1)` rule to it. Also cover the trip tab strip (Overview, Itinerary, Transport, ...) and the Local menu items if they render without icons.
    files:
      - apps/web/src/navSections.ts
      - apps/web/src/AppHeader.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/local/LocalMenu.tsx
      - apps/web/src/index.css
    rationale: |
      Acceptance criterion 2 for navigation items. Tokens used: `--space-1`, `--color-fg`, `--color-primary`, `--color-primary-subtle` (already on `.shell-link`).
  - description: |
      Section titles and meta rows. Put a set icon in front of every `.section-title`, `.section-head` heading and card heading, and in front of each meta fact. These include `.cover-meta` and `.fact-label` in `ItineraryPage`, `.option-card-meta` via `OptionCard`'s existing `meta` prop, `.restaurant-pick-meta` in `RestaurantsCard`, and the `mail-meta` rows. Use calendar / map-pin / users / bed / plane / wallet / sim / utensils / shield by topic. Extend `OptionCard` (do not make a new card) only if it needs an optional `icon` slot. Reuse `.badge .icon`, `.fact-source .icon` and the existing icon sizing rules. Add one small rule such as `.section-title .icon { color: var(--color-primary); margin-right: var(--space-1); }`.
    files:
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/RestaurantsCard.tsx
      - apps/web/src/trips/StaysSection.tsx
      - apps/web/src/trips/TripTotalCard.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/components/OptionCard.tsx
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/places/PlaceDetails.tsx
      - apps/web/src/local/LocalInboxPage.tsx
      - apps/web/src/travel/LocalBookingPage.tsx
      - apps/web/src/index.css
    rationale: |
      Acceptance criterion 2 for section titles and meta rows. Tokens used: `--space-1`, `--color-primary`, `--color-fg-muted`.
  - description: |
      Buttons and empty states. Give each text `.btn` that has no icon one from the set: arrow-right / plus / search / check / trash / edit by action. Icon-only buttons keep their `aria-label`. Every `.empty-state` gets the icon circle (`nf-icon` pattern, or a shared rule) with a topic icon. The files below hold the screens where the audit finds an icon-less `.btn` or `.empty-state`. Re-check the list against the audit test output.
    files:
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/places/AddPlaceNoTripsPage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/travel/TravelSearchPage.tsx
      - apps/web/src/account/LocalModePage.tsx
      - apps/web/src/account/AccountPage.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/trips/TransportTab.tsx
      - apps/web/src/trips/TravelersTab.tsx
      - apps/web/src/trips/StayOptionsPage.tsx
      - apps/web/src/trips/StayShortlistPage.tsx
      - apps/web/src/trips/SimOptionsPage.tsx
      - apps/web/src/trips/ActivityOptionsPage.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/RestaurantShortlistPage.tsx
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/trips/InsuranceComparePage.tsx
      - apps/web/src/trips/MedicalGuidancePage.tsx
      - apps/web/src/trips/InvitePage.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/index.css
    rationale: |
      Acceptance criteria 1 and 2 for buttons and empty states. Tokens used: `--size-control-md`, `--color-sand`, `--color-fg-muted`, `--space-1`, `--space-2`.

tests:
  - |
    AC1, written first, in `apps/web/src/iconRollout.test.ts` (new). It is a source audit with no hand-drawn or non-set icons. It fails today on `NotFoundPage.tsx`:
    ```ts
    const files = glob.sync('src/**/*.tsx', { ignore: ['**/*.test.tsx', 'src/auth/icons.tsx'] })
    // allowed non-set svg: BrandLogo (logo) and PlacesMap (map pins/tiles)
    const ALLOWED_SVG = ['src/components/BrandLogo.tsx', 'src/places/PlacesMap.tsx']
    it('has no inline <svg> outside the icon set', () => {
      const offenders = files.filter((f) => !ALLOWED_SVG.includes(f) && /<svg\b/.test(read(f)))
      expect(offenders).toEqual([])
    })
    it('uses no emoji or glyph characters as icons', () => {
      const offenders = files.filter((f) => /[\u{1F300}-\u{1FAFF}☀-➿←-⇿✓✕★]/u.test(read(f)))
      expect(offenders).toEqual([])
    })
    ```
  - |
    AC1, in `apps/web/src/auth/icons.test.tsx` (extended). Every `ICONS` entry, including the new names, renders an inline `svg.icon` with `aria-hidden="true"` and a drawable child. Add the new names to the `it.each` list:
    ```ts
    it.each(Object.keys(ICONS) as IconName[])('renders %s as an inline svg', (name) => {
      const Icon = ICONS[name]
      const { container } = render(<Icon />)
      expect(container.querySelector('svg.icon')!.getAttribute('aria-hidden')).toBe('true')
      expect(container.querySelector('svg.icon path,circle,rect')).not.toBeNull()
    })
    ```
    `NotFoundPage.test.tsx` also asserts `expect(container.querySelector('.empty-state svg.icon')).not.toBeNull()`.
  - |
    AC2 navigation, in `apps/web/src/AppHeader.test.tsx` (extended), with the signed-in setup the file already uses:
    ```ts
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')
    for (const link of links) expect(link.querySelector('svg.icon')).not.toBeNull()
    ```
    The signed-out case asserts `screen.getByRole('link', { name: 'Sign in' }).querySelector('svg.icon')` is not null. `navSections.test.ts` asserts `MAIN_SECTIONS.every((s) => s.icon in ICONS)`.
  - |
    AC2 empty states and buttons, in `apps/web/src/iconRollout.test.ts`. A static check over the same file list: every JSX element with `className` containing `empty-state` has an `*Icon` child, and every `.btn` element with visible text has one. Use a small regex or TSX-parse helper in the test file. Allow-list entries need a one-line reason, for example icon-only buttons that carry an `aria-label`, or a submit button whose label is the only content in a form. Written first, it lists the offending files. The implementer then works through the list until it is empty:
    ```ts
    expect(emptyStatesWithoutIcon).toEqual([])
    expect(textButtonsWithoutIcon).toEqual([])
    ```
  - |
    AC2 section titles and meta rows, in the existing per-screen test files (`ItineraryPage`, `TripDetailPage`, `ExplorePage`, `SavedPage`, `LocalInboxPage` and the `OptionCard`/`PlaceCard` tests). Each asserts the heading/meta element contains an icon, for example:
    ```ts
    for (const el of container.querySelectorAll('.section-title, .section-head h2, .cover-meta, .option-card-meta')) {
      expect(el.querySelector('svg.icon')).not.toBeNull()
    }
    ```
    `OptionCard.test.tsx` also asserts an optional `icon` prop renders before `meta`, if the slot is added.
  - |
    Guard rail, `designSystem.test.ts` stays green. The icon-package/icon-font/external-request check at line 47 must still pass, and the new CSS rules use tokens only. Narrow run: `cd apps/web && pnpm run test -- src/iconRollout.test.ts src/auth/icons.test.tsx src/AppHeader.test.tsx src/designSystem.test.ts`. Full run before finishing: `(cd services/api && sh run-py.sh -m pytest -c pytest.ini) && (cd apps/web && pnpm run test)`.

assumptions_or_open_questions:
  - |
    "The five sheets" is not defined in the work item. The repo has no object with that name. The nearest match is `docs/design/mockups.html`, whose 13 numbered sheets are listed in `docs/design/UI-UX-REDESIGN.md`. I read the scope as "every screen in the app", which covers any five sheets, and I did not pick a subset. Please confirm, or name the five sheets so the scope can be narrowed.
  - |
    "The one consistent icon set" is taken to be the existing hand-copied Lucide-style inline SVG set in `apps/web/src/auth/icons.tsx`. UI-UX-REDESIGN.md says to keep inline SVG with no icon CDN, and `designSystem.test.ts` forbids icon packages, so no new package is planned.
  - |
    The map pins and tiles in `PlacesMap.tsx` and the `BrandLogo` mark are treated as map or brand artwork, not UI icons, and are left as is. Place cover illustrations (`illustrations/art/*.svg`) are also out of scope.
  - |
    Which glyph goes with which element is a design choice. The plan follows the redesign's list (calendar, map pin, users, bed, plane, wallet, SIM, utensils, shield). A value no token covers, such as a specific icon size, is not added as a literal. The existing `.icon` sizing and `--size-*` / `--space-*` tokens are reused.
  - |
    The `files` lists are a starting point drawn from a grep of icon-less `.empty-state` / `.section-title` / meta usage. The audit test output is the authority, and the implementer should touch only the files it flags.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout
  None — front-end markup and CSS only. No stored data, schema, setting or env var changes, and nothing to provision. It is safe to roll back by reverting.

  Tokens: `apps/web/src/index.css` line 2 imports `../../../design-system/tokens.css` (the Tailwind-based stack is not involved in icon styling). The `.icon` rule is at `index.css:50`. New CSS rules use only `var(--space-*)`, `var(--color-*)` and `var(--size-control-*)`.

  Reuse: `OptionCard` (optional `icon` slot only if needed), `ImageFrame`, `FallbackNotice` (already uses `AlertIcon`) and `CompareTable` are unchanged unless the audit flags them. No new component is planned.

  Review history: the icon set arrived in STORY-116 (477d308) and `icons.tsx` was extended by STORY-112 and STORY-114. The header and `NotFoundPage` were last touched by STORY-117 (66a7eda).

  ```mermaid
  flowchart TD
    icons[auth/icons.tsx - add glyphs + IconName] --> header[AppHeader.tsx - nav icons]
    navs[navSections.ts - icon per section] --> header
    icons --> nf[NotFoundPage.tsx - drop hand-drawn svg]
    icons --> screens[trips / places / explore / saved / account screens - titles, meta, buttons, empty states]
    icons --> oc[components/OptionCard.tsx - optional icon slot]
    css[index.css - spacing rules for icons] --> header
    css --> screens
    audit[iconRollout.test.ts - source audit] -.guards.-> screens
    classDef touched fill:#f96,color:#000
    class icons,header,navs,nf,screens,oc,css,audit touched
  ```

review_focus: |
  IN scope is icon usage only, on navigation, section titles, meta rows, buttons and empty states, using the existing `icons.tsx` set. OUT of scope are new dependencies, any redesign of layout or colour, logo and map artwork, and place illustrations. The riskiest part is the broad sweep over about 30 screen files and what the "five sheets" meant, which is an open question in the plan. Check that the audit test has narrow, justified allow-lists rather than loose ones. Hand-written `<svg>` in `NotFoundPage` is removed on purpose, and `BrandLogo` and `PlacesMap` keep theirs on purpose.
