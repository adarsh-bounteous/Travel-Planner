summary: |
  Make every icon on the five design sheets' screens come from the single inline-SVG set in `apps/web/src/auth/icons.tsx` (AC1), and give every navigation item, section title, meta row, button and empty state that currently has no icon one from that set (AC2). Today the set exists (story 116) and is used in some places (ItineraryTab, TripDetailPage, FallbackNotice, RouteLine), but the header nav links, most `h2` section titles, option-card meta rows, many buttons and the empty states carry no icon, and one stray text glyph (`×` in TransportPreferencesPage) stands in for an icon. The plan extends the set with the few missing glyphs, adds one tiny shared wrapper for "icon + label" so usage is uniform, then rolls it out screen group by screen group, guarded by a source-scanning conformance test so mixed icons cannot come back.
scope:
  - description: |
      Extend the single icon set with the glyphs the rollout needs that are not yet in it, using the same 24x24 stroke style as the existing `Icon` wrapper (no new package, no icon font, no CDN). Candidates, added only if a screen needs them: `CompassIcon` (Explore), `BookmarkIcon`/reuse `HeartIcon` (Saved), `PlaneIcon` (flights), `BedIcon` (stays), `ForkIcon` (restaurants), `ShieldIcon` (insurance), `SimIcon`, `ListIcon` (itinerary/section), `ShareIcon`, `SettingsIcon`, `UsersIcon` (travellers), `GlobeIcon`. Register each in `ICONS` under a design name, and export a `NavIconName`-style key type so call sites cannot reference an icon outside the set.
    files:
      - apps/web/src/auth/icons.tsx
      - apps/web/src/auth/icons.test.tsx
    rationale: |
      One set, one stroke style (`.icon` in index.css line 53). Keeping additions in this file is what makes "from the one consistent set" checkable.
  - description: |
      Add a small `IconLabel` helper exported from `icons.tsx` (not a new component file; the catalogue has no icon+label component) that renders `<span class="icon-label"><Icon/> {children}</span>`, used for section titles, meta rows and buttons. Add the matching `.icon-label` rule (inline-flex, `gap: var(--space-2)`, `align-items: center`) in index.css using tokens only.
    files:
      - apps/web/src/auth/icons.tsx
      - apps/web/src/index.css
    rationale: |
      Avoids hand-rolled flex spacing per call site. Styled only with existing spacing tokens from `design-system/tokens.css` (loaded at `apps/web/src/index.css:2` via `@import`). `designSystem.test.ts` already forbids colour literals and raw px, so the rule must pass it.
  - description: |
      Navigation: add an icon to each item in the header. Extend `MAIN_SECTIONS` in navSections.ts with an `icon` key (`trips` -> suitcase, `explore` -> compass) and render it in AppHeader.tsx for the main links plus Saved (heart) and Account (user), and the signed-out "Sign in" button. The phone pill row (`.shell-link { flex: none }`) must keep working.
    files:
      - apps/web/src/navSections.ts
      - apps/web/src/AppHeader.tsx
      - apps/web/src/index.css
    rationale: Covers the "navigation" element on every screen (header is on all screens).
  - description: |
      Section titles and tabs: put an icon in the `h2`/`h3` section titles and trip tabs that have none: MyTripsPage ("My trips"), TripDetailPage ("Destination" and the tab labels), OptionCard title row, ItineraryTab day headings, Insurance/Stay/Restaurant/Sim/Activity/Flight option pages, ExplorePage, DestinationResultsPage, TripRecommendationsTab, Account and Profile pages. Wrap with `IconLabel`.
    files:
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/components/OptionCard.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/account/AccountPage.tsx
    rationale: |
      These are the screens in sheets 2 to 5 (my trips, trip overview, itinerary, option cards, explore). The implementer must grep each file's headings (`<h2`, `<h3`) and cover every one on those screens; the list above is the minimum from what was read.
  - description: |
      Meta rows: give each meta row (dates, route, price, rating, location, duration) a leading icon: calendar for dates, map-pin for place, clock for duration/time, star for rating. Files: OptionCard `meta` consumers (StayShortlistCard, FlightShortlistCard, SimOptionCard, InsurancePlanCard, PlaceCard, RestaurantsCard, ChosenStayCard, PropertyCard), MyTripsPage trip rows (dates, destination), ItineraryDocument meta lines. Replace the `&nbsp;` spacing hacks in ItineraryTab.tsx:32 and RestaurantsCard.tsx:39 with `IconLabel`.
    files:
      - apps/web/src/trips/StayShortlistCard.tsx
      - apps/web/src/trips/FlightShortlistCard.tsx
      - apps/web/src/trips/SimOptionCard.tsx
      - apps/web/src/trips/InsurancePlanCard.tsx
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/trips/RestaurantsCard.tsx
      - apps/web/src/trips/ChosenStayCard.tsx
      - apps/web/src/trips/PropertyCard.tsx
      - apps/web/src/trips/ItineraryDocument.tsx
    rationale: Meta rows are the element most often icon-less today.
  - description: |
      Buttons and mixed icons: add a leading or trailing icon to icon-less primary/secondary buttons on the sheet screens (Add, Compare, Share, Book trip, Save, Remove, Back, Search), and replace the text glyph `×` at TransportPreferencesPage.tsx:323 with `XIcon` (given an accessible name on the button via `aria-label`, since the icon is `aria-hidden`). Icon-only buttons must keep or gain an `aria-label`.
    files:
      - apps/web/src/profile/TransportPreferencesPage.tsx
      - apps/web/src/trips/ItineraryActions.tsx
      - apps/web/src/trips/BookTripDrawer.tsx
      - apps/web/src/trips/ShareTripModal.tsx
      - apps/web/src/trips/StayShortlistPage.tsx
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/trips/InsuranceComparePage.tsx
      - apps/web/src/auth/SignInPage.tsx
    rationale: Covers the "buttons" element and the one non-set icon (a text glyph) found.
  - description: |
      Empty states: every empty state (NotFoundPage, SavedPage, MyTripsPage "No trips yet", AddPlaceNoTripsPage, LocalInboxPage, StayShortlistPage, RestaurantShortlistPage, InsuranceComparePage, ActivityOptionsPage, DestinationResultsPage, TripRecommendationsTab) shows a set icon beside its heading. The decorative `EmptyStateArt` stays as is. SavedPage already uses `HeartIcon`; the rest are checked and filled in.
    files:
      - apps/web/src/NotFoundPage.tsx
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/places/AddPlaceNoTripsPage.tsx
      - apps/web/src/local/LocalInboxPage.tsx
      - apps/web/src/trips/RestaurantShortlistPage.tsx
      - apps/web/src/trips/ActivityOptionsPage.tsx
    rationale: Covers the "empty states" element in sheet 1 (13-states).
  - description: |
      Conformance guard: a vitest file that scans every non-test `.tsx` under `apps/web/src` and fails on (a) any inline `<svg` outside `auth/icons.tsx` and the brand/illustration components, (b) any import from a third-party icon package, (c) text glyph/emoji icons (`×`, arrows, symbols) in JSX text. Extends the existing "no icon font, icon package or external icon request" check in designSystem.test.ts.
    files:
      - apps/web/src/iconRollout.test.ts
    rationale: Makes AC1 enforceable across all screens rather than only the ones edited.
tests:
  - |
    AC1, written first in `apps/web/src/iconRollout.test.ts`, fails today on the `×` at TransportPreferencesPage.tsx:323:
    ```ts
    import { readFileSync, readdirSync, statSync } from 'node:fs'
    import { join } from 'node:path'
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]))
    const files = walk(__dirname).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
    it('uses no text glyph as an icon', () => {
      for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/>\s*[×✕✓✗→←↗•]\s*</)
    })
    it('draws svg only in the icon set, brand logo and image frame', () => {
      const allowed = ['auth/icons.tsx', 'components/BrandLogo.tsx', 'components/ImageFrame.tsx']
      for (const f of files.filter((f) => !allowed.some((a) => f.endsWith(a))))
        expect(readFileSync(f, 'utf8'), f).not.toContain('<svg')
    })
    ```
  - |
    AC1, set membership, in `auth/icons.test.tsx`: every new glyph renders through the shared wrapper.
    ```ts
    it.each(Object.keys(ICONS))('renders %s as svg.icon', (name) => {
      const Icon = ICONS[name as keyof typeof ICONS]
      expect(render(<Icon />).container.querySelector('svg.icon')).not.toBeNull()
    })
    ```
  - |
    AC2 navigation, in `AppHeader.test.tsx` (signed-in render): every nav link holds an icon.
    ```ts
    const links = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')
    for (const l of links) expect(l.querySelector('svg.icon')).not.toBeNull()
    ```
  - |
    AC2 section titles, in a MyTripsPage test and TripDetailPage test: the heading contains an icon.
    ```ts
    expect(screen.getByRole('heading', { name: 'My trips' }).querySelector('svg.icon')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Destination' }).querySelector('svg.icon')).not.toBeNull()
    ```
  - |
    AC2 meta rows, in OptionCard.test.tsx and PlaceCard.test.tsx plus the card tests for stays/flights/sims/insurance: each meta row has an icon.
    ```ts
    const rows = container.querySelectorAll('.option-card-meta .icon-label')
    expect(rows.length).toBeGreaterThan(0)
    rows.forEach((r) => expect(r.querySelector('svg.icon')).not.toBeNull())
    ```
  - |
    AC2 buttons, in ItineraryActions, BookTripDrawer and ShareTripModal tests, plus TransportPreferencesPage: every `.btn` holds an icon, and the former `×` button keeps its name.
    ```ts
    expect(screen.getByRole('button', { name: /share/i }).querySelector('svg.icon')).not.toBeNull()
    expect(screen.getByRole('button', { name: /remove/i }).querySelector('svg.icon')).not.toBeNull()
    ```
  - |
    AC2 empty states, in NotFoundPage, SavedPage, MyTripsPage (no trips), AddPlaceNoTripsPage and LocalInboxPage tests: the empty-state heading holds an icon.
    ```ts
    expect(screen.getByRole('heading', { name: 'No trips yet' }).querySelector('svg.icon')).not.toBeNull()
    ```
  - |
    Regression in `designSystem.test.ts`: the new `.icon-label` rule and any nav-icon rule pass the existing "no colour literals" and "no raw px" tests unchanged, and the phone `.shell-link` rule still has `flex: none`.
assumptions_or_open_questions:
  - |
    "The five sheets" are the five PNGs from `docs/design/render-sheets.mjs` (foundations, entry, trip, options, explore/phone). I did not open the PNGs; I took the screens and routes from the SHEETS table (lines 12 to 36), which lists 13 screens. The scope file lists are the minimum from the files I read; the implementer should grep headings, `.btn` usage and empty states in the pages those routes render and cover them all.
  - |
    Which icon goes with which label is not specified by the story. I assumed the names already in `ICONS` (home, search, trips, profile, calendar, map-pin, clock, plus, arrow-right, close, suitcase) take priority, and the design mockups in `docs/design/mockups.html` are the tie-breaker for new glyphs. I did not read mockups.html in this pass.
  - |
    Decorative icons stay `aria-hidden`; a button that is icon-only must keep an `aria-label`. Assumed this matches the existing `Icon` wrapper behaviour.
  - |
    Brand logo, favicon and illustration art (`BrandLogo`, `ImageFrame`, `illustrations/art/*.svg`) are treated as imagery, not icons, and are out of scope.
  - |
    The guard test's glyph regex is a heuristic and may need tuning against real JSX (e.g. a legitimate "•" separator in running text). Open question whether bullet separators count as icons; the plan assumes they do not.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — front-end markup and CSS only; no stored data, migration, setting or env var. Safe to roll back by reverting.

  ### Findings

  - The set lives in `apps/web/src/auth/icons.tsx` (`ICONS` map, `Icon` wrapper using `.icon` at `apps/web/src/index.css:53`). It is already used by RouteLine, FallbackNotice, ItineraryTab, TripDetailPage and SavedPage.
  - `AppHeader.tsx` nav links, `MyTripsPage` / `TripDetailPage` headings, `OptionCard` title and meta have no icon today.
  - Design tokens are loaded once at `apps/web/src/index.css:2` (`@import "../../../design-system/tokens.css"`). All new CSS uses tokens such as `var(--space-2)`; no colour literal or raw px (enforced by `designSystem.test.ts` lines 22 to 29). Icons take colour from `currentColor`, so no colour token is needed.
  - No new UI component: reuse `OptionCard`, `EmptyStateArt`, `FallbackNotice`, `RouteLine` as they are, and add the `IconLabel` helper inside the existing icons module.
  - `designSystem.test.ts` line 54 forbids icon packages, so the set must stay inline SVG. No dependency is added.

  ```mermaid
  flowchart TD
    icons[auth/icons.tsx]:::touched
    css[index.css]:::touched
    nav[navSections.ts]:::touched
    header[AppHeader.tsx]:::touched
    card[components/OptionCard.tsx]:::touched
    trips[trips/* pages and cards]:::touched
    places[places/PlaceCard, DestinationResultsPage]:::touched
    guard[iconRollout.test.ts]:::touched
    app[App routes]
    app --> header
    header --> nav
    header -->|nav icons| icons
    app --> trips
    trips -->|titles, meta, buttons, empty states| icons
    trips --> card
    card -->|title and meta icons| icons
    places -->|meta, empty states| icons
    icons -->|.icon, .icon-label| css
    guard -.->|scans sources| icons
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN: icon changes on navigation, section titles, meta rows, buttons and empty states for the screens in the five sheets, plus the small icon-set additions and the `IconLabel` helper. OUT: logo, favicon, illustration art and any layout or copy change. Riskiest part is breadth: it is easy to miss a screen, so check the guard test and the per-element tests rather than the diff alone; also check the phone header pill row and `designSystem.test.ts` still pass. Reusing `icons.tsx` for the helper instead of a new component file is deliberate.
