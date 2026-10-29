summary: |
  Restyle the trip page (`TripDetailPage`) so a planned trip reads as a hero, the existing `.tabs`, and cards. On the Overview tab the cost summary (`TripTotalCard`) sits in a right-hand column beside the cards at desktop width (48rem and up) and below them on phones. Each Itinerary day is already a `.card`, and its activities already sit inside it. Those get a regression test, plus a light restyle so it stays tidy. The Book trip drawer keeps the sample `.drawer` design from `design-system/style-guide.html` and gets a test. This is a presentation-only change: it reuses existing elements and styles with tokens only, and adds no new interactive control.
scope:
  - description: |
      Add a non-interactive hero at the top of the trip page. It replaces the bare title row's role as the page's visual header. It shows the trip name (the existing `h1`), the destination and the date range, and the `UnmatchedBadge` when it applies. Existing buttons (Book trip, SIM options, Add reminder, Share trip, Edit trip) are kept as they are and only moved inside the hero's action area. No button is added, removed or renamed (AC12).
      Hero markup: `<header className="hero stack stack-sm">`. Date range comes from `formatRange(trip.start_date, trip.end_date)` when both dates exist.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: |
      AC1, AC2, AC12. The tabs stay a `role="tablist"` `.tabs` row directly below the hero, and no tab is added.
  - description: |
      Overview layout. Wrap the Overview panel in `<div className="trip-layout">` with a main column and an `<aside className="trip-aside" aria-label="Cost summary">`.
      Move `TripTotalCard` out of the page header and into the aside, shown on the Overview tab. Overview details (insurance row, `VisaSummaryCard`, `TravelHelpersCard`, destination section) become `.card`s in the main column.
      Because the Overview tab is not the default, add `Overview` as a selectable tab as it is today and keep `useState<Tab>('itinerary')` unchanged so existing tests still pass.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: AC3, AC4, AC5. Source order is cards first, then cost summary, so phones show the summary below the cards without any extra code. `.trip-layout` switches to two columns at 48rem.
  - description: |
      Add presentation-only rules to the global stylesheet, using tokens only (no hex/rgb literals, no raw px; `designSystem.test.ts` enforces this):
      - `.hero { padding: var(--space-4); background: var(--color-primary-hover); color: var(--color-on-primary); border-radius: var(--radius-lg); }`
      - `.hero h1, .hero .text-muted { color: var(--color-on-primary); }`
      - `.hero .btn-secondary` keeps the existing token-based button colours. Hero buttons keep the existing `.btn` classes, so there is no new control styling.
      - `.trip-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); align-items: start; }` and `@media (min-width: 48rem) { .trip-layout { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); } }`
      - `.trip-main { min-width: 0; }`
      - `.trip-aside { min-width: 0; }`
      - Make the page container not overflow: `.tabs` already has `overflow-x: auto`, and `min-width: 0` on grid children stops cards forcing horizontal scroll (AC8, AC9).
      Tokens used: --space-2, --space-3, --space-4, --color-primary-hover, --color-on-primary, --radius-lg.
      Loading: tokens are already imported at `apps/web/src/index.css` line 2 (`@import "../../../design-system/tokens.css"`), so no loader change is needed.
    files:
      - apps/web/src/index.css
    rationale: AC1, AC4, AC5, AC8, AC9, AC11. The hero uses `--color-primary-hover` (#155e75) with `--color-on-primary` (#ffffff), a ratio of about 7:1, comfortably above 4.5:1. The `.hero` text must not use `--color-fg-muted`, which has lower contrast on this background.
  - description: |
      Itinerary tab. Each day is already `<section className="card stack stack-sm">` inside a `.grid`, and its activities are `<li className="option">` inside that same section. Keep that structure (AC6, AC7). Change only what the page layout needs: let the day cards go single column on phones and flow in `.grid` on desktop with no horizontal overflow, and add `overflow-wrap: anywhere` where long names could overflow. Do not add or change any button.
    files:
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/index.css
    rationale: AC6 to AC9. Mostly already in place, so the failing test is first a regression guard, and code changes only if a test shows a gap.
  - description: |
      Book trip drawer. `BookTripDrawer` already renders `Overlay kind="drawer"` which produces the `.drawer` panel plus `.backdrop`, the same classes as the sample drawer in `design-system/style-guide.html` (lines 222 to 228). Keep it. Change only what is needed to match the sample: a `h2` title in a `.stack`, cards for links, and a Close button at the end. No new control.
    files:
      - apps/web/src/trips/BookTripDrawer.tsx
    rationale: AC10. Drawer design is verified by test, with the code changed only if the test shows a difference.
  - description: |
      Extend the contrast test to cover the hero pair so a later token change that breaks AC11 fails.
    files:
      - apps/web/src/designSystem.test.ts
    rationale: AC11.
tests:
  - |
    AC1 in `apps/web/src/trips/TripDetailPage.test.tsx` (write first, fails until the hero exists):
    ```ts
    const hero = await screen.findByRole('banner', { name: /Lisbon/ })
    expect(within(hero).getByRole('heading', { level: 1, name: 'Lisbon' })).toBeInTheDocument()
    ```
    The hero is a `header` with `aria-label` of the trip name. Because `header` inside the page `main` has no implicit banner role, set `role="region"` and `aria-label` instead, and query `getByRole('region', { name: /Lisbon/ })`. Decide at implementation and keep the test and markup consistent.
  - |
    AC2, hero above tabs:
    ```ts
    const hero = await screen.findByTestId('trip-hero')
    const tabs = screen.getByRole('tablist', { name: 'Trip sections' })
    expect(hero.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    ```
  - |
    AC3, Overview shows details as cards:
    ```ts
    fireEvent.click(await screen.findByRole('tab', { name: 'Overview' }))
    const panel = screen.getByRole('tabpanel')
    expect(panel.querySelectorAll('.card').length).toBeGreaterThan(0)
    ```
  - |
    AC4 and AC5, cost summary placement. jsdom has no layout, so assert the DOM structure that the CSS depends on, and assert the CSS rule in `designSystem.test.ts`:
    ```ts
    const layout = screen.getByTestId('trip-layout')
    const aside = within(layout).getByLabelText('Cost summary')
    const main = layout.querySelector('.trip-main')!
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // in designSystem.test.ts
    expect(css).toMatch(/@media \(min-width: 48rem\) \{ \.trip-layout \{ grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\); \} \}/)
    expect(body).toMatch(/\.trip-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\)/)
    ```
    Source order is cards then cost summary (phone: below), and the desktop media rule puts it in the right-hand column.
  - |
    AC6 and AC7, itinerary day cards (regression guard, probably passes already):
    ```ts
    const day4 = within(screen.getByRole('region', { name: /4 March/ }))
    expect(screen.getByRole('region', { name: /4 March/ })).toHaveClass('card')
    expect(day4.getByText('Walking tour')).toBeInTheDocument()
    ```
    Use an activity name already in the test fixture in `TripDetailPage.test.tsx`.
  - |
    AC8 and AC9, no horizontal scroll. jsdom cannot measure layout, so assert the CSS guards in `designSystem.test.ts` and verify the real widths in a Playwright check at 375px and at desktop width:
    ```ts
    expect(css).toMatch(/\.tabs \{[^}]*overflow-x: auto/)
    expect(body).toMatch(/\.trip-main \{[^}]*min-width: 0/)
    // Playwright, at 375 wide and at 1280 wide
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    ```
  - |
    AC10, in `BookTripDrawer.test.tsx` and `TripDetailPage.test.tsx`:
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Book trip' }))
    const drawer = await screen.findByRole('dialog', { name: 'Book trip' })
    expect(drawer).toHaveClass('drawer')
    expect(document.querySelector('.backdrop')).toBeInTheDocument()
    ```
  - |
    AC11, in `designSystem.test.ts`, add to the `pairs` list:
    ```ts
    ['color-on-primary', 'color-primary-hover'],
    ```
    The existing `it.each` asserts `ratio(...)` is at least 4.5. Also assert the CSS uses that pair:
    ```ts
    expect(body).toMatch(/\.hero \{[^}]*background: var\(--color-primary-hover\)[^}]*color: var\(--color-on-primary\)/)
    ```
  - |
    AC12, no new interactive control. Snapshot the control names from the existing fixture and compare with the list that exists today:
    ```ts
    const names = screen.getAllByRole('button').concat(screen.getAllByRole('link')).map((e) => e.textContent?.trim()).sort()
    expect(names).toEqual(EXPECTED_CONTROLS)
    ```
    `EXPECTED_CONTROLS` is captured from the current page before the change, so the test is written against the pre-change list.
  - |
    Existing tests stay green. The narrow run for this item is:
    `cd apps/web && pnpm run test -- src/trips/TripDetailPage.test.tsx src/trips/BookTripDrawer.test.tsx src/designSystem.test.ts`
assumptions_or_open_questions:
  - |
    The work item names "the sample drawer design" and the hero but no hero exists in `design-system/`. I took the sample drawer as the `.drawer` example in `design-system/style-guide.html` (lines 222 to 228). I took the hero as a new `.hero` class built only from existing tokens. Please confirm.
  - |
    The design system has no hero token or class. The hero uses `--color-primary-hover` as its fill and `--color-on-primary` for text. If a different look is wanted, a token must be added to `design-system/tokens.css`.
  - |
    "Planned trip" is read as any trip with days. Trips with no days keep the existing empty state on the Itinerary tab.
  - |
    The default tab remains Itinerary, as existing tests expect it. The Overview tab holds the two-column layout, so the cost summary moves off the top of every tab and into Overview. Please confirm that the cost summary no longer showing on the Itinerary tab is acceptable.
  - |
    AC8 and AC9 cannot be proven in jsdom. I plan CSS-level assertions plus a Playwright check at 375px and desktop width. The raw `375` and desktop width values live only in the test, not in CSS.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — presentation only (markup and CSS), no stored data, settings or migrations.

  ### Findings

  - Tokens load at `apps/web/src/index.css` line 2 via `@import "../../../design-system/tokens.css"`, after `@import "tailwindcss"`. The project's classes in `index.css` use `var(--token)` directly, and `designSystem.test.ts` forbids colour literals and raw px, so new rules must follow that.
  - `TripDetailPage.tsx` already has `.tabs` (line 262) and the Book trip button (line 187) that opens `BookTripDrawer`, which uses `Overlay kind="drawer"`.
  - The itinerary day cards and the activities inside them already exist in `ItineraryTab.tsx`.

  ```mermaid
  flowchart TD
    Page[TripDetailPage.tsx]:::touched
    Itin[ItineraryTab.tsx]:::touched
    Drawer[BookTripDrawer.tsx]:::touched
    Css[index.css]:::touched
    DsTest[designSystem.test.ts]:::touched
    Total[TripTotalCard.tsx]
    Overlay[Overlay.tsx]
    Tokens[design-system/tokens.css]
    Page -->|hero, layout, aside| Total
    Page --> Itin
    Page --> Drawer
    Drawer --> Overlay
    Page -.classes.-> Css
    Css -->|imports| Tokens
    DsTest -->|guards| Css
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN scope: the hero, the Overview two-column layout, a regression check on itinerary day cards and the Book trip drawer, and CSS built from tokens only. OUT: new controls, new tabs, API or data changes, and any change to `TripTotalCard` content. Riskiest part is moving `TripTotalCard` into the Overview aside, since existing tests may look for it above the tabs. The deliberate choice is that the default tab stays Itinerary.
