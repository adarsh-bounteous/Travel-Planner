summary: |
  Roll the single existing icon set (`apps/web/src/auth/icons.tsx`, `ICONS` map, `.icon` class in `index.css`) out across every screen so that navigation items, section titles, meta rows, buttons and empty states each show an icon from that set, and nothing else. Today the set is used unevenly: the header nav (`AppHeader`) has no icons, `NotFoundPage` and `PlacesMap` hand-draw inline `<svg>`s, and most `empty-state` blocks, `section-title` headings and `mail-meta` / `cover-meta` / `option-card-meta` rows carry no icon. The work is test-first: guard tests that fail on a non-set icon or an icon-less element come first, then the minimal edits that make them pass.

scope:
  - description: |
      Extend the icon set with the glyphs the rollout needs but the set lacks (for example compass/explore, bookmark/saved, flight, bed, utensils, receipt/costs, shield/insurance, inbox, mail, info). Add them to `icons.tsx` in the same `Icon` wrapper style and register them in `ICONS`. Export `export type IconName = keyof typeof ICONS` and a small `<IconByName name={IconName} />` helper so data-driven places (nav config, empty states) take a name.
    files:
      - apps/web/src/auth/icons.tsx
      - apps/web/src/auth/icons.test.tsx
    rationale: |
      One set, one registry. Adding to the existing registry (not a new package such as lucide) keeps the stack unchanged; the existing paths already follow the Lucide 24x24 stroke style.
  - description: |
      Navigation. Add an `icon: IconName` field to `MAIN_SECTIONS` (trips to suitcase, explore to a compass glyph) and render it in `AppHeader` before each label, including the utility links Saved and Account and the "Sign in" button. Icons are `aria-hidden`, so link names are unchanged.
    files:
      - apps/web/src/navSections.ts
      - apps/web/src/AppHeader.tsx
      - apps/web/src/AppHeader.test.tsx
      - apps/web/src/navSections.test.ts
    rationale: Covers AC1/AC2 for navigation items.
  - description: |
      Remove non-set icons. Replace the inline search `<svg>` in `NotFoundPage` with `SearchIcon`. Review the four `<svg>` uses in `PlacesMap.tsx` (marker pins and map controls): replace UI-control glyphs with set icons (MapPinIcon, PlusIcon and so on); the marker pin is a map graphic, not a nav/title/meta/button/empty-state icon, so decide per the open question below.
    files:
      - apps/web/src/NotFoundPage.tsx
      - apps/web/src/NotFoundPage.test.tsx
      - apps/web/src/places/PlacesMap.tsx
      - apps/web/src/places/PlacesMap.test.tsx
    rationale: AC1, no icon outside the set.
  - description: |
      Empty states. Add an icon to every `className="empty-state"` block that lacks one (about 35 sites across `trips/`, `places/`, `explore/`, `local/`, `travel/`, `saved/`). Reuse the `.nf-icon` wrapper pattern by promoting it to a shared `.empty-state-icon` rule in `index.css` (tokens only, using `--size-control-lg`, `--size-check`, `--radius-full`, `--color-surface`, `--color-fg-muted`, as `.nf-icon` already does). Pick an icon that matches the content (for example SuitcaseIcon for no trips, HeartIcon for no saved, SearchIcon for no results, BellIcon or InfoIcon for status).
    files:
      - apps/web/src/index.css
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/trips/TransportTab.tsx
      - apps/web/src/trips/TravelersTab.tsx
      - apps/web/src/trips/StaysSection.tsx
      - apps/web/src/trips/StayOptionsPage.tsx
      - apps/web/src/trips/StayShortlistPage.tsx
      - apps/web/src/trips/ChosenStayCard.tsx
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/trips/SimOptionsPage.tsx
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/trips/MedicalGuidancePage.tsx
      - apps/web/src/trips/RestaurantCompare.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/RestaurantShortlistPage.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/trips/AccessSection.tsx
      - apps/web/src/trips/InvitePage.tsx
      - apps/web/src/trips/DestinationGate.tsx
      - apps/web/src/trips/AddActivityDrawer.tsx
      - apps/web/src/places/AddPlaceNoTripsPage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/local/LocalInboxPage.tsx
      - apps/web/src/travel/TravelSearchPage.tsx
      - apps/web/src/travel/LocalBookingPage.tsx
    rationale: Covers AC2 for empty states. Also covers the two inline `dest-empty` and `empty-state` list-item variants if they count as empty states.
  - description: |
      Section titles, meta rows and buttons. Add a set icon to each `section-title` heading (`MedicalGuidancePage` and every other page heading used as a section title found by the audit), to meta rows (`mail-meta` in `LocalInboxPage` and `LocalBookingPage`, `cover-meta` in `ItineraryPage`, the `meta` slot passed to `OptionCard` by its callers, using CalendarIcon, MapPinIcon, ClockIcon and so on), and to text-only buttons (`.btn` without an icon, for example Add, Save, Share, Book, Back, Sign in/up). Icon-only buttons already have one. Extend `OptionCard`/`CompareTable` only if their meta/header slots need an icon prop; otherwise callers pass the icon in the existing `meta` node.
    files:
      - apps/web/src/trips/MedicalGuidancePage.tsx
      - apps/web/src/local/LocalInboxPage.tsx
      - apps/web/src/travel/LocalBookingPage.tsx
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/components/OptionCard.tsx
      - apps/web/src/components/CompareTable.tsx
    rationale: |
      Covers AC1/AC2 for section titles, meta rows and buttons. The exact file list for buttons is generated by the audit test (task 1 of the tests), so the implementer works from its failure output rather than a guessed list.

tests:
  - |
    Audit test, written first (new file `apps/web/src/iconRollout.test.ts`, run with `cd apps/web && pnpm exec vitest run src/iconRollout.test.ts`). It reads every `apps/web/src/**/*.tsx` (excluding tests and `auth/icons.tsx`) with `node:fs`. AC1 check:
    ```ts
    it('has no inline svg outside the icon set', () => {
      expect(filesContaining(/<svg\b/)).toEqual(allowedSvgFiles)
    })
    ```
    Fails now on `NotFoundPage.tsx` and `PlacesMap.tsx`.
  - |
    AC2 audit, same file. Every `className="empty-state"` JSX block must contain an `Icon` element, every `section-title` heading and every `mail-meta` / `cover-meta` row too:
    ```ts
    it.each(emptyStateBlocks)('%s shows an icon', (_where, block) => {
      expect(block).toMatch(/<\w*Icon\b|<IconByName\b/)
    })
    ```
    Fails now on about 35 empty states.
  - |
    Navigation (`AppHeader.test.tsx`), written first. Signed in, render the header and assert each main link, Saved and Account contain an `svg.icon`; link names are unchanged:
    ```ts
    const link = screen.getByRole('link', { name: 'Trips' })
    expect(link.querySelector('svg.icon')).not.toBeNull()
    ```
    And in `navSections.test.ts`: `expect(MAIN_SECTIONS.every((s) => s.icon in ICONS)).toBe(true)`.
  - |
    Icon set (`auth/icons.test.tsx`): extend the `it.each` name list with each new glyph, and add `expect(Object.keys(ICONS).length).toBeGreaterThan(11)`. Each new name renders `svg.icon[aria-hidden="true"]`.
  - |
    Per-screen render checks for `NotFoundPage`, `SavedPage`, `MyTripsPage`, `LocalInboxPage` and `ExplorePage` (their existing test files), for example:
    ```ts
    expect(container.querySelector('.empty-state svg.icon')).not.toBeNull()
    ```
    Also assert no `svg` inside nav, titles, meta rows, buttons or empty states lacks the `icon` class.
  - |
    Buttons (audit test): every `<button className="btn ...">` or `<Link className="btn ...">` whose children are text only has an `Icon` child, except an allow-list in the test of buttons deliberately left text-only (for example Cancel in modals), each with a reason.

assumptions_or_open_questions:
  - |
    "The five sheets" are not defined in the work item, the events source, or `design-system/` (I searched `design-system/UI-GUIDELINES.md` and the events file for "sheet" and "icon" and found nothing). I assumed this means all screens in the app, which is a superset. If it means five specific screens, please name them so scope can be cut.
  - |
    The "one consistent icon set" is taken to be the existing `ICONS` registry in `apps/web/src/auth/icons.tsx` (Lucide-style 24x24 stroke paths), extended in place. No new npm package is proposed. Confirm this is the intended set and not an external library.
  - |
    The `PlacesMap.tsx` marker pins are map graphics, not nav/title/meta/button/empty-state icons. I assumed they may stay as inline SVG, so the audit allow-lists them. Confirm.
  - |
    Which icon goes with which empty state, title and meta row is a design judgement. The design system has no icon mapping, so I assumed content-matching glyphs and will list the mapping in the PR for review.
  - |
    Inputs in `.icon` sizing: `.icon` is 1.25em with `currentColor` stroke, so no new colour or pixel values are needed. Any size no token covers gets raised as a question rather than a literal.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout

  None — front-end markup and CSS only; no stored data, migrations, settings or provisioning. Safe to roll back by reverting the change.

  Tokens: `apps/web/src/index.css:2` imports `../../../design-system/tokens.css`, and `main.tsx:6` imports `index.css`, so tokens are already loaded. New CSS (`.empty-state-icon`, nav icon spacing) uses only existing tokens by name, such as `var(--space-1)`, `var(--size-control-lg)`, `var(--size-check)`, `var(--radius-full)`, `var(--color-surface)`, `var(--color-fg-muted)`. Tailwind is the declared styling stack, but the app styles through `index.css` classes, and this plan follows that.

  Reuse: `OptionCard` and `CompareTable` are reused (meta slot, existing props); no new components are scheduled. `IconByName` is a helper inside the existing `icons.tsx`, not a new component file.

  ```mermaid
  flowchart TD
    icons[auth/icons.tsx ICONS registry]:::touched
    css[index.css .icon and empty-state-icon]:::touched
    nav[navSections.ts]:::touched
    header[AppHeader.tsx]:::touched
    nf[NotFoundPage.tsx]:::touched
    map[PlacesMap.tsx]:::touched
    pages[trips, places, local, travel, saved, explore pages]:::touched
    card[components/OptionCard.tsx]:::touched
    audit[iconRollout.test.ts]:::touched
    header -->|reads icon names| nav
    header --> icons
    nf -->|replace inline svg| icons
    map -->|replace control svgs| icons
    pages -->|empty states, titles, meta, buttons| icons
    pages --> card
    pages --> css
    audit -->|scans sources| pages
    classDef touched fill:#f96,color:#000
  ```

review_focus: |
  IN scope: icons on navigation, section titles, meta rows, buttons and empty states, using only the existing `ICONS` set (extended in place); OUT: new icon libraries, redesign, map marker artwork and any non-icon visual change. The riskiest part is breadth (about 35 empty-state sites plus buttons), so the source-scanning audit test is the real guard; check its allow-lists are small and justified. "Five sheets" is undefined in the item, so scope was taken as all screens pending the reviewer's answer.
