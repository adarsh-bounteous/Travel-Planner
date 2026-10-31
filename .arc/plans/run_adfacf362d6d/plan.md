summary: |
  Roll the single inline-SVG icon set (`apps/web/src/auth/icons.tsx`, exported as named components and the `ICONS` map, added in STORY-116) across the web app so every navigation item, section title, meta row, button and empty state shows an icon from that set, and none shows a stray glyph, hand-written `<svg>` or other mixed source. Work is test-first: a static audit test fails on any icon that is not from the set, and per-screen render tests fail on any of the five element kinds that has no icon. Then the set is extended with the few missing icons and the screens are updated. No new package is added. The `design system test` already forbids icon fonts and icon packages, so the set stays inline SVG.
scope:
  - description: |
      Extend the one icon set with the icons the screens still lack, in the same `Icon` wrapper (24x24 viewBox, `className="icon"`, `aria-hidden`), and register every icon in `ICONS`. Candidates, to confirm from the audit: `bed` (stays), `plane` (flights), `fork` (restaurants), `shield` (insurance), `stethoscope` or `heart-pulse` (medical), `phone`/`sim` (SIM), `passport` or `globe` (visa, explore), `receipt` or `wallet` (costs), `cloud-sun` (weather), `coins` (currency), `users` (travellers), `compass` (explore), `bookmark` (saved), `list` (shortlists), `inbox` (local inbox), `share`, `lock` (access). Names are only added when a screen needs one.
      Also add a `NavIcon` lookup: `ICONS` keys for the main sections. Signature, unchanged style:
      ```ts
      export const SomeNewIcon = () => (<Icon><path d="..." /></Icon>)
      export const ICONS = { ...existing, bed: BedIcon /* ... */ } as const
      ```
    files:
      - apps/web/src/auth/icons.tsx
      - apps/web/src/auth/icons.test.tsx
    rationale: |
      One set, one place. `icons.tsx` already holds 25 icons and the `ICONS` map; new icons follow the same shape rather than a second file or a package.
  - description: |
      Navigation. Add an `icon: keyof typeof ICONS` field to `MAIN_SECTIONS` (Trips -> `trips`, Explore -> `explore` or `search`) and render the icon before the label in `AppHeader` for the main links and for the Saved (`heart`) and Account (`user`) utility links, and the Sign in button. Keep the link text and `aria-current` unchanged, so existing accessible names still match.
      ```ts
      export const MAIN_SECTIONS: { id: MainSection; label: string; to: string; icon: keyof typeof ICONS }[]
      ```
    files:
      - apps/web/src/navSections.ts
      - apps/web/src/AppHeader.tsx
      - apps/web/src/AppHeader.test.tsx
      - apps/web/src/navSections.test.ts
      - apps/web/src/index.css
    rationale: |
      AC1 and AC2 for navigation items. `.shell-link` needs a flex row with `gap: var(--space-1)` so the icon sits beside the label.
  - description: |
      Replace every non-set icon. `NotFoundPage.tsx` hand-draws a search svg: use `SearchIcon`. `TransportPreferencesPage.tsx` line 323 uses a text `×`: use `XIcon`. Check `PlacesMap.tsx`, `PlaceCover.tsx`, `StarterSelect.tsx`, `useSavedPlaces.tsx` and `GoogleConsentPage.tsx` for inline `<svg>` or glyphs: map markers and Google's brand mark are content, not UI icons, so keep them only if the audit test's allow-list names them with a reason. `illustrations/art/*.svg` are cover art, not icons, and are out of scope.
    files:
      - apps/web/src/NotFoundPage.tsx
      - apps/web/src/profile/TransportPreferencesPage.tsx
      - apps/web/src/places/PlacesMap.tsx
      - apps/web/src/places/PlaceCover.tsx
      - apps/web/src/places/StarterSelect.tsx
      - apps/web/src/auth/GoogleConsentPage.tsx
    rationale: |
      AC1. These are the only mixed-source icons found by grepping `<svg` and glyph characters in non-test `.tsx` files.
  - description: |
      Add icons where one is missing, by element kind, reusing existing markup and classes (`.icon`, `.empty-state`, `.back`, `.btn`, `.badge`, `.option-card-meta`, `.cover-meta`, `.mail-meta`). Work screen by screen, starting from the audit list.
      - Section titles: put the icon inside the existing `h2`/`h3` (the pattern in `.modal-title .icon`), for example on the trip tabs, Costs, Visa, Medical, Weather, Currency, Shortlists, Travellers, Access, Itinerary and Insurance headings.
      - Meta rows: `OptionCard` meta line, `PlaceCard`/`PlaceCover` meta (`MapPinIcon`, `ClockIcon`, `CalendarIcon`), trip cards on `MyTripsPage`, `InvitePage`, `.mail-meta` rows in `LocalInboxPage`.
      - Buttons: icon plus text on primary actions (Add, Edit, Delete, Share, Search, Book, Save) using `PlusIcon`, `EditIcon`, `TrashIcon`, `SearchIcon` and new icons. Icon-only buttons keep their `aria-label`.
      - Empty states: every `.empty-state` block gets a leading icon in a `span` with `aria-hidden`, as `NotFoundPage` does, on My trips, Saved, Explore, Shortlists, Itinerary, Travellers, Local inbox and the Options pages.
      Do not change any visible copy.
    files:
      - apps/web/src/components/OptionCard.tsx
      - apps/web/src/components/OptionCard.test.tsx
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/places/PlaceCover.tsx
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/local/LocalInboxPage.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/trips/ShortlistsPage.tsx
      - apps/web/src/trips/TravelersTab.tsx
      - apps/web/src/trips/CostsPage.tsx
      - apps/web/src/trips/StayOptionsPage.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/trips/SimOptionsPage.tsx
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/trips/VisaRequirementsPage.tsx
      - apps/web/src/trips/MedicalGuidancePage.tsx
      - apps/web/src/trips/WeatherHelperPage.tsx
      - apps/web/src/trips/CurrencyHelperPage.tsx
      - apps/web/src/index.css
    rationale: |
      AC2. The list is the screens with `h2/h3` headings, empty states or meta lines found by grep; the final set is whatever the failing tests in the audit flag. `OptionCard` is an existing catalogue component, so its meta line gets an optional `icon` prop instead of a new component.
  - description: |
      Styling for the new icon slots goes in `apps/web/src/index.css` only, using tokens already loaded there (`@import "../../../design-system/tokens.css"` near line 2): `--space-1`, `--space-2` for gaps, `--color-fg-muted` for meta icons, `--color-primary` for section-title icons, `--size-control-md` for empty-state icons. No colour literal or raw px (enforced by `designSystem.test.ts`).
    files:
      - apps/web/src/index.css
      - apps/web/src/designSystem.test.ts
    rationale: |
      Keep token-only styling; the existing stylesheet tests guard it.
tests:
  - |
    AC1, audit (write first, fails today because of `NotFoundPage` and the `×`). New file `apps/web/src/iconAudit.test.ts` reads every non-test `.tsx` under `src` with `readdirSync` and asserts the only inline svg and glyph icons are in the allow-list:
    ```ts
    const offenders = files.filter((f) => /<svg/.test(src(f)) && !ALLOWED_SVG.includes(f))
    expect(offenders).toEqual([])
    const glyphs = files.filter((f) => /[×✓✕★♥→←›▾]/.test(src(f)))
    expect(glyphs).toEqual([])
    ```
    `ALLOWED_SVG` holds `auth/icons.tsx` and any content-not-icon file, each with a comment.
  - |
    AC1, navigation. In `AppHeader.test.tsx` render signed in and assert each link holds a set icon:
    ```ts
    for (const name of ['Trips', 'Explore', 'Saved', 'Account']) {
      expect(within(screen.getByRole('link', { name })).getByTestId('icon')).toBeInTheDocument()
    }
    ```
    (or `container.querySelector('svg.icon')` if the set keeps no test id). In `navSections.test.ts`: `expect(MAIN_SECTIONS.every((s) => s.icon in ICONS)).toBe(true)`.
  - |
    AC2, empty states. In the page tests for My trips, Saved, Explore, Shortlists and Local inbox, render the empty case and assert:
    ```ts
    expect(container.querySelector('.empty-state svg.icon')).not.toBeNull()
    ```
    plus `NotFoundPage.test.tsx` asserting the svg is the `SearchIcon` output (`path[d="m21 21-4.3-4.3"]`).
  - |
    AC2, section titles and meta rows. A shared table-driven test `apps/web/src/iconCoverage.test.tsx` renders each screen with the existing test providers (`test-api.tsx`) and asserts every `h1`/`h2`/`h3` flagged as a section title, every `.option-card-meta`, `.cover-meta` and `.mail-meta` row contains `svg.icon`:
    ```ts
    expect(container.querySelectorAll('.option-card-meta:not(:has(svg.icon))')).toHaveLength(0)
    ```
  - |
    AC2, buttons. In the same coverage test, for the named action buttons (Add, Edit, Delete, Share, Search, Book) assert `within(button).getByRole('img', { hidden: true })` or `button.querySelector('svg.icon')` is not null, and that its accessible name is unchanged.
  - |
    Icon set. Extend `icons.test.tsx` `it.each` list with every new name so each renders an inline svg with `aria-hidden="true"`. Existing tests, including `designSystem.test.ts` (no colour literals, no icon package, no third-party origins), must still pass. Narrow command: `(cd apps/web && pnpm run test -- src/iconAudit.test.ts src/iconCoverage.test.tsx src/auth/icons.test.tsx src/AppHeader.test.tsx)`.
assumptions_or_open_questions:
  - |
    "The five sheets" is not defined in the item or anywhere I searched (grep for "five sheets" and "sheet" across the worktree found only the design-system `style-guide.html` sections and earlier plans that mention a "states sheet"). I assumed it means all screens of the web app, so the plan covers every screen under `apps/web/src`. Please confirm which five sheets are meant, as that may narrow the file list.
  - |
    "The one consistent icon set" is taken to be `apps/web/src/auth/icons.tsx` (inline SVG, 24px stroke style, from STORY-116). `designSystem.test.ts` forbids icon fonts and icon packages, so no package is added.
  - |
    Map markers in `PlacesMap.tsx`, the Google brand mark and `illustrations/art/*.svg` cover art are treated as content, not UI icons, and are left alone. Confirm.
  - |
    The new icon shapes are drawn to match the existing stroke style; the design system has no icon artwork to copy (no icon entries found in `design-system/`), so a designer should check the new glyphs.
  - |
    Icons are decorative (`aria-hidden`) and sit beside visible text, so accessible names and visible copy do not change. Icon-only buttons keep their `aria-label`.
estimated_points: 8
package_dependencies: []
notes: |
  ### Data & rollout

  None — front-end markup and CSS only, no stored data, migration, setting or env var. Safe to roll back by reverting the commit.

  Token loading: `apps/web/src/index.css` imports `../../../design-system/tokens.css` near the top (after the Tailwind import) and `main.tsx` imports the stylesheet. The `.icon` base rule is at `index.css` line 34. I did not open `vite.config.ts` or `main.tsx` this session, so the implementer should confirm the import line before editing.

  Order: (1) audit test, red; (2) icon set additions; (3) nav; (4) replace non-set icons; (5) section titles, meta rows, buttons, empty states screen by screen, with each screen's test going green; (6) CSS.

  ```mermaid
  flowchart TD
    icons[auth/icons.tsx - add icons, ICONS map]
    nav[navSections.ts - icon per section]
    header[AppHeader.tsx - render nav icons]
    nf[NotFoundPage.tsx - replace hand-drawn svg]
    tp[TransportPreferencesPage.tsx - replace x glyph]
    oc[components/OptionCard.tsx - meta icon]
    pages[trips, places, saved, explore, local pages - titles, meta, buttons, empty states]
    css[index.css - icon slot layout]
    audit[iconAudit.test.ts - new]
    nav --> header
    icons --> header
    icons --> nf
    icons --> tp
    icons --> oc
    icons --> pages
    oc --> pages
    css --> header
    css --> pages
    audit -.guards.-> icons
    classDef touched fill:#f96,color:#000
    class icons,nav,header,nf,tp,oc,pages,css,audit touched
  ```
review_focus: |
  IN scope: icons on navigation, section titles, meta rows, buttons and empty states, all from `auth/icons.tsx`, plus the tests and CSS for them; OUT: visible copy, layout redesign, new packages, cover art and map markers. Riskiest areas are the breadth of the edit (about 25 screens, so regressions in accessible names that existing tests query by role and text) and the audit test's allow-list, which must not hide real offenders. The meaning of "five sheets" is unconfirmed and the plan covers all screens until the reviewer says otherwise.
