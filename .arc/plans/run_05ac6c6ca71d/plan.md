summary: |
  Restyle the trip page (`TripDetailPage`, Overview and Itinerary tabs) and the Book trip drawer so a planned trip reads as a hero, the existing tab bar, detail cards and a cost summary. The hero is a new text-only block (trip name, dates, destination) on a token gradient with `--color-on-primary` text, so it meets 4.5:1. Below the tabs, a two-zone layout puts the detail cards and tab panel in the main column and the existing `TripTotalCard` cost summary in a right-hand column at 48rem and up, stacking below the cards on phones. Each itinerary day is already a `.card` holding its activities, so the Itinerary work is a layout and overflow guard plus tests that pin it. The Book trip drawer already uses the shared `.drawer` overlay like the style-guide sample; tests pin that and the card list is hardened against overflow. No new interactive control is added and no behaviour changes. This is markup, CSS and tests only.
scope:
  - description: |
      Hero. In `TripDetailPage`, replace the plain `<h1>` title block with a `<header className="trip-hero">` holding the trip name `<h1>`, the date range (reuse `formatRange` from `./stays`) and the destination text, with no buttons or links inside it. The `UnmatchedBadge` and the `.title-actions` row (Book trip, SIM options, Add reminder, Share trip, Edit trip) stay as they are, directly below the hero, so no coloured-background control is introduced. The hero text uses only `--color-on-primary` on a `linear-gradient(var(--color-primary), var(--color-primary-hover))` background, the same token pair already used by `.auth-brand`. Padding uses `--space-4` and `--space-5`, the radius is `--radius-lg`, and the heading size is `--font-size-xl`.

      ```tsx
      <header className="trip-hero" aria-label="Trip">
        <h1>{trip.name}</h1>
        <p>{formatRange(trip.start_date, trip.end_date)}</p>
        {trip.destination && <p>{trip.destination}</p>}
      </header>
      ```

      One `<h1>` rule: `TripTotalCard` renders its own `<h1>` for the total. Change that element to `<h2 aria-live="polite">` only if the existing tests allow it; otherwise leave it. This is flagged in the open questions.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/index.css
    rationale: AC1 and AC11. The hero is the first thing on the page and its text must have enough contrast.
  - description: |
      Page layout. After the hero and the existing `.tabs` bar, wrap the body in `<div className="trip-layout">` with two children, in this DOM order. The first child is `.trip-main`, a stack holding the insurance row, the `VisaSummaryCard`, the tab panel and the Destination card. The second is `<aside className="trip-aside" aria-label="Cost summary">` holding the existing `TripTotalCard`. Because the aside comes after the main column in the DOM, it falls below the cards on phones with no extra rule.

      The insurance row becomes a `.card` (class change only). The Destination card is already a `.card`. The tab bar moves from below the visa card to directly below the hero and action row. Everything stays visible on every tab, as it is today, so existing tests that read these elements without switching tabs keep working.

      CSS, tokens only:

      ```css
      .trip-hero { background: linear-gradient(var(--color-primary), var(--color-primary-hover)); color: var(--color-on-primary); border-radius: var(--radius-lg); padding: var(--space-5) var(--space-4); display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; overflow-wrap: anywhere; }
      .trip-hero h1 { color: var(--color-on-primary); }
      .trip-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
      .trip-layout > * { min-width: 0; }
      @media (min-width: 48rem) { .trip-layout { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; } }
      ```
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/index.css
    rationale: |
      AC2 to AC5, AC8, AC9. The `.tabs` bar sits below the hero, the details are cards, and the cost summary is a right-hand column on desktop and below the cards on phones. Using `minmax(0, …)` and `min-width: 0` stops long names from forcing horizontal scroll. The 48rem breakpoint is the design system's `--breakpoint-md`, which media queries cannot read, so the literal is used as the existing rules in `index.css` do.
  - description: |
      Itinerary tab. `ItineraryTab` already renders each day as `<section className="card …">` inside `.grid`, with activities in an `ul.options` inside that card. Keep the markup. Wrap the `.grid` so that it works in the narrower main column (`.grid` already uses `minmax(min(var(--size-grid-min), 100%), 1fr)`). Add `min-width: 0` and `overflow-wrap: anywhere` to the day-card children where needed (`.option-head`, `.options`) so no day card overflows at 375px. Fix the mis-indented `<div className="grid">` block only if the code is touched anyway. No new controls.
    files:
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/index.css
    rationale: AC6 to AC9. Pin day-as-card and activity-inside-day-card, and guard against overflow in the narrower column.
  - description: |
      Book trip drawer. `BookTripDrawer` already renders through `Overlay kind="drawer"`, which produces `<div class="drawer" role="dialog" aria-modal>` with a backdrop and a `.stack` child holding an `<h2>`. That is the structure of the style-guide sample drawer (`design-system/style-guide.html`, "Drawer" frame, lines 222 to 228). Keep the structure, and add `min-width: 0` to `.link-list > li` and `overflow-wrap: anywhere` on the booking-card text so the drawer cards never overflow at 360px width on a phone. Change nothing else, and keep the existing Close button.
    files:
      - apps/web/src/trips/BookTripDrawer.tsx
      - apps/web/src/index.css
    rationale: AC10. The drawer must read as the sample drawer design, and a test pins it so later restyling cannot drift.
  - description: |
      Design-system stylesheet tests. Extend `designSystem.test.ts`: add `['color-on-primary', 'color-primary']` and `['color-on-primary', 'color-primary-hover']` to the contrast `pairs`, and a rule test that `.trip-hero` uses those tokens. The existing "no colour literals" and "no raw px" tests already cover the new CSS.
    files:
      - apps/web/src/designSystem.test.ts
    rationale: AC11, and it keeps the new CSS inside the token rules.
tests:
  - |
    AC1, in `apps/web/src/trips/TripDetailPage.test.tsx`. Written first, fails until the hero exists:
    ```ts
    it('shows a hero with the trip name, dates and destination at the top', async () => {
      open()
      const hero = (await screen.findByRole('banner', { name: 'Trip' }).catch(() => null)) ?? document.querySelector('.trip-hero')!
      expect(hero).toBeInTheDocument()
      expect(within(hero as HTMLElement).getByRole('heading', { level: 1, name: 'Lisbon' })).toBeInTheDocument()
      expect(hero).toHaveTextContent('Lisbon, Portugal')
      expect(within(hero as HTMLElement).queryAllByRole('button')).toHaveLength(0)
      expect(within(hero as HTMLElement).queryAllByRole('link')).toHaveLength(0)
    })
    ```
    The implementer should simplify the lookup to `document.querySelector('.trip-hero')` if the `header` landmark role is not exposed by the testing library in the repo's version.
  - |
    AC2, in `TripDetailPage.test.tsx`. The tablist comes after the hero in the DOM:
    ```ts
    const tabs = await screen.findByRole('tablist', { name: 'Trip sections' })
    const hero = document.querySelector('.trip-hero')!
    expect(hero.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toContain('Overview')
    ```
  - |
    AC3, in `TripDetailPage.test.tsx`. Open the Overview tab and check that the details are cards:
    ```ts
    fireEvent.click(await screen.findByRole('tab', { name: 'Overview' }))
    const layout = document.querySelector('.trip-layout')!
    expect(layout.querySelectorAll('.trip-main .card').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/Insurance: not yet picked/).closest('.card')).not.toBeNull()
    ```
  - |
    AC4 and AC5, in `TripDetailPage.test.tsx`. jsdom does no layout, so the test pins DOM order (below the cards on phones) and the CSS rule (right-hand column on desktop):
    ```ts
    const main = document.querySelector('.trip-main')!
    const aside = document.querySelector('.trip-aside')!
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(aside as HTMLElement).getByLabelText('Trip total')).toBeInTheDocument()
    ```
    In `designSystem.test.ts`:
    ```ts
    it('puts the cost summary in a right-hand column from 48rem', () => {
      expect(css).toMatch(/\.trip-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/)
      expect(css).toMatch(/@media \(min-width: 48rem\)\s*\{\s*\.trip-layout\s*\{[^}]*grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\)/)
    })
    ```
  - |
    AC6 and AC7, in `Activities.test.tsx` or `TripDetailPage.test.tsx`. Each day is a card and each activity is inside its own day card:
    ```ts
    const day = screen.getByRole('region', { name: /3 March/ })
    expect(day).toHaveClass('card')
    expect(within(day).getByText('Oceanarium')).toBeInTheDocument()
    expect(screen.getAllByRole('region').filter((r) => r.classList.contains('card') && /March/.test(r.textContent ?? '')).length).toBeGreaterThanOrEqual(3)
    ```
    The test uses a trip with an activity such as `{ id: 'a1', name: 'Oceanarium', date: '2027-03-03' }`, following the fixture style already in that file.
  - |
    AC8 and AC9, in `designSystem.test.ts`. jsdom cannot measure scroll width, so the test pins the rules that prevent horizontal overflow. Real-width checks at 375px and 1280px belong in a Playwright pass if one exists (see the open questions).
    ```ts
    it('keeps the trip page from scrolling sideways', () => {
      expect(css).toMatch(/\.trip-layout > \*\s*\{[^}]*min-width: 0/)
      expect(css).toMatch(/\.trip-hero\s*\{[^}]*overflow-wrap: anywhere/)
      expect(css).toMatch(/\.tabs\s*\{[^}]*overflow-x: auto/)
      expect(css).toMatch(/\.link-list > li\s*\{[^}]*min-width: 0/)
    })
    ```
  - |
    AC10, in `BookTripDrawer.test.tsx`. Pressing Book trip shows the drawer in the sample drawer structure:
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Book trip' }))
    const drawer = await screen.findByRole('dialog', { name: 'Book trip' })
    expect(drawer).toHaveClass('drawer')
    expect(drawer.querySelector(':scope > .stack h2')).toHaveTextContent('Book trip')
    expect(document.querySelector('.backdrop')).toBeInTheDocument()
    ```
  - |
    AC11, in `designSystem.test.ts`. Extend the existing contrast table, then check that the hero CSS uses those tokens:
    ```ts
    ['color-on-primary', 'color-primary'],
    ['color-on-primary', 'color-primary-hover'],
    // ...
    expect(css).toMatch(/\.trip-hero\s*\{[^}]*linear-gradient\(var\(--color-primary\), var\(--color-primary-hover\)\)[^}]*color: var\(--color-on-primary\)/)
    ```
    The hero DOM test from AC1 also asserts that no element inside it sets its own colour (the hero holds only `h1` and `p`).
  - |
    AC12, in `TripDetailPage.test.tsx`. The set of interactive controls is unchanged from before the restyle. The expected list is recorded from the pre-change page by writing this test first and running it against the current code:
    ```ts
    const names = (c: HTMLElement) =>
      within(c).queryAllByRole('button').concat(within(c).queryAllByRole('link')).map((e) => e.textContent?.trim()).sort()
    expect(names(document.body)).toEqual(EXPECTED_CONTROLS_BEFORE)
    ```
    `EXPECTED_CONTROLS_BEFORE` is captured on the unmodified page for an owner and for a non-owner viewer. Because the test passes before and after, it runs as a regression guard rather than a failing-first test.
assumptions_or_open_questions:
  - |
    Design tokens load through `apps/web/src/index.css` line 2, `@import "../../../design-system/tokens.css"`, after `@import "tailwindcss"` on line 1. `index.css` is imported by the app entry. No new loading is needed. Styling is plain CSS classes written with `var(--token)`, matching the rest of `index.css`, not Tailwind utilities. The tokens used are `--color-primary`, `--color-primary-hover`, `--color-on-primary`, `--radius-lg`, `--font-size-xl`, `--space-1`, `--space-4` and `--space-5`.
  - |
    The Overview tab today only renders `TravelHelpersCard`, and the page defaults to the Itinerary tab. I did not change the default tab or move the insurance, visa and destination cards into the Overview panel, because six existing test files read them without switching tabs. They stay visible on every tab inside the main column. If the reviewer wants them only on Overview, the existing tests would need updating, which is a bigger change.
  - |
    The cost summary column spans every tab, not only Overview, for the same reason: `TripTotalCard` is shown on every tab today. The 2fr / 1fr column split is my choice. No token covers a column ratio, and `--size-drawer-width` (360px) is a drawer width, not a column width, so I did not use it.
  - |
    `TripTotalCard` renders its own `<h1>` for the total, which would give the page two `<h1>` elements next to the new hero. Demoting it to `<h2>` may break `TripTotalCard.test.tsx` and other tests that look up the heading by level. Decision for review: demote it and update those queries, or leave the duplicate `<h1>`. The plan assumes the implementer checks the tests first and demotes it only if the change is small.
  - |
    The Book trip drawer already uses `Overlay kind="drawer"`, which matches the style-guide sample drawer (`aside.drawer` holding a `.stack` with an `h2`). I expect the visible change to be small (overflow safety) and the main value to be the pinning test. If the reviewer expects a different look, the sample design needs to be named.
  - |
    The 48rem breakpoint is written as a literal in the media query, as `index.css` already does for `.shell-main` and `.auth-split`. `designSystem.test.ts` forbids raw px values, so only rem is used.
  - |
    The AC8 and AC9 checks in jsdom can only pin the CSS rules. Real 375px and 1280px width checks need a browser. I did not find or open a Playwright setup for `apps/web` this session, so a Playwright check is left to the implementer to add only if a config already exists.
  - |
    The item text contains no instructions outside the change itself, so nothing was left out of the plan for that reason.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — markup, CSS and tests only. No stored data, schema, settings or env vars. Safe to roll back by reverting.

  ```mermaid
  flowchart TD
    TDP[TripDetailPage.tsx<br/>hero + layout wrapper] --> IT[ItineraryTab.tsx<br/>day cards, overflow guard]
    TDP --> BTD[BookTripDrawer.tsx<br/>drawer overflow guard]
    TDP --> TTC[TripTotalCard.tsx<br/>cost summary, moved to aside]
    BTD --> OV[Overlay.tsx<br/>drawer + backdrop]
    CSS[index.css<br/>trip-hero, trip-layout] --> TDP
    TOK[design-system/tokens.css] --> CSS
    DST[designSystem.test.ts<br/>contrast + layout rules] --> CSS
    classDef touched fill:#f96,color:#000
    class TDP,IT,BTD,CSS,DST touched
  ```

  Touched nodes are orange. `TripTotalCard`, `Overlay` and the tokens file are read-only context, apart from the optional `<h1>` demotion in `TripTotalCard` described in the open questions.

  Recent history on these files, from the path-history source: `TripDetailPage.tsx` was last changed in #85, #83 and #81 (destination and stay work). `index.css` was last changed by #87, #88 and #86. Rebase carefully because it is the hottest file. `designSystem.test.ts` was changed in #86 and #88.

  Test command, narrow form: `(cd apps/web && pnpm exec vitest run src/trips/TripDetailPage.test.tsx src/trips/BookTripDrawer.test.tsx src/designSystem.test.ts)`.
review_focus: |
  IN scope: the trip page hero, the layout wrapper with the cost summary aside, the cards, and overflow guards for the itinerary and the Book trip drawer, all with existing tokens and elements. OUT: any new control, any behaviour change, moving cards between tabs, changing the default tab, and API or data changes. The riskiest part is `index.css`, a hot file, and the reordering of `TripDetailPage` JSX, which must keep every existing control and test query working. Deliberate choices: the cost summary stays on every tab, the hero holds no controls so its contrast only depends on `--color-on-primary` over the primary gradient, and the AC12 test is a regression guard captured from the unmodified page.
