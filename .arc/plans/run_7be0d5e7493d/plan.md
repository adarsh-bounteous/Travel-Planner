summary: |
  Give every list of choices in the web app one shared option-card look and every comparison one shared compare-table look. Today each list rolls its own markup and CSS (`.property`, `.transport-option`, `.travel-option`, `.option`, `.plan-card`, `.restaurant`, `.stack` cards, `.flight-option`) and each comparison differs too: `.compare-grid` cards for stays, a `.grid` of `.compare-card` for restaurants, a `.cmp` table for insurance. We add two shared pieces, an `OptionCard` component with `.option-card*` classes and a `CompareTable` component with `.compare-table*` classes. The compare table is a real table at desktop width (48rem and up) and collapses to stacked option cards on phones. We then move every option list and comparison onto them. Each option's title and badges stay visible. This is a UI-only change with no API or data changes.
scope:
  - description: |
      Add the shared `OptionCard` component. Signature:

      ```tsx
      type OptionCardProps = {
        title: ReactNode            // rendered as <h3 className="option-card-title">
        badges?: ReactNode          // rendered in <div className="badges option-card-badges">
        meta?: ReactNode            // muted facts line(s)
        price?: ReactNode           // right-hand price block (stacks under the body on phones)
        actions?: ReactNode         // footer row of buttons or links
        picked?: boolean            // adds .is-picked
        ariaLabel?: string          // <article aria-label>; falls back to a string title
        as?: 'article' | 'li'
        children?: ReactNode        // extra body, e.g. provider offers
      }
      export function OptionCard(props: OptionCardProps): JSX.Element
      ```

      The layout is the stay card sample layout, built from the existing PropertyCard / StayShortlistCard structure: a head row (title plus badges), then meta, then a body with price, then an actions footer. On phones it is one column. At 48rem and up the body is two columns (facts, then price), reusing the `.option-body` pattern already in `index.css`. Do not reuse the bare `.option` class, because it is defined three times with conflicting rules.
    files:
      - apps/web/src/components/OptionCard.tsx
      - apps/web/src/components/OptionCard.test.tsx
    rationale: |
      One component is the only way to guarantee the "same layout as the stay card sample" for AC1, AC3 and AC5. Title and badges are required slots, so AC5 holds by construction.
  - description: |
      Add the shared `CompareTable` component. Signature:

      ```tsx
      type CompareColumn<T> = { key: string; header: string; render: (row: T) => ReactNode }
      type CompareTableProps<T> = {
        caption: string
        rows: T[]
        rowKey: (row: T) => string
        title: (row: T) => ReactNode        // first column, also the stacked card heading
        badges?: (row: T) => ReactNode      // shown under the title in both modes
        columns: CompareColumn<T>[]         // remaining columns; each cell gets data-label={header}
      }
      export function CompareTable<T>(props: CompareTableProps<T>): JSX.Element
      ```

      It renders `<table className="compare-table">` with a visually hidden caption, `<th scope="col">` headers, and `data-label` on every `<td>`. The phone CSS media query (`max-width: 47.99rem`) turns each `<tr>` into a stacked option card by reusing `.option-card` tokens, copying the existing `.cmp` and `.req` phone patterns. Header cells are visually hidden, and `td::before` shows the data-label.
    files:
      - apps/web/src/components/CompareTable.tsx
      - apps/web/src/components/CompareTable.test.tsx
    rationale: |
      One compare implementation covers AC2 (table on desktop) and AC4 (stacked cards on phone). It replaces three divergent comparison layouts.
  - description: |
      Add the CSS to `apps/web/src/index.css`. It is already wired to the tokens (`@import "../../../design-system/tokens.css"` at line 2, with Tailwind imported at line 1). Append an "Option cards and compare table" block with `.option-card`, `.option-card-head`, `.option-card-title`, `.option-card-badges`, `.option-card-meta`, `.option-card-body`, `.option-card-price`, `.option-card-actions`, `.option-card.is-picked`, `.compare-table` and its phone block. Use tokens only:

      - Card surface: `--card-default-background`, `--card-default-border`, `--card-default-radius`, `--card-default-padding`, `--border-width`, `--border-width-strong`.
      - Spacing: `--space-1` to `--space-4`.
      - Colours: `--color-surface`, `--color-border`, `--color-fg-muted`, `--color-primary`, `--color-primary-subtle` (picked state).
      - Type: `--font-size-sm`, `--font-size-lg`, `--font-size-xl`, `--font-weight-bold`.
      - Shape: `--radius-md`, `--radius-lg`.

      Use `48rem` for the desktop breakpoint, as the existing rules do. The `designSystem.test.ts` guards still apply: no colour literals and no raw px. Remove the now-unused per-list classes (`.property`, `.transport-option*`, `.travel-option*`, `.plan-card`, `.plan-body`, `.cmp`, `.compare-grid`, `.compare-card`, `.restaurant`, `.flight-option` styles) once their users are migrated. Grep before deleting each one.
    files:
      - apps/web/src/index.css
      - apps/web/src/designSystem.test.ts
    rationale: |
      Keeps styling in the app's one global stylesheet using the loaded tokens. `designSystem.test.ts` gets a new case asserting the new classes exist and the phone block stacks rows.
  - description: |
      Migrate the stay option lists to `OptionCard`: `PropertyCard` (per-provider offers stay inside as children, with the "Offered by N providers" badge in `badges`) and `StayShortlistCard` (rank, fit and budget badges in `badges`). `StayOptionsPage` and `StayShortlistPage` keep their loading, error and empty states.
    files:
      - apps/web/src/trips/PropertyCard.tsx
      - apps/web/src/trips/StayShortlistCard.tsx
      - apps/web/src/trips/StayOptionsPage.tsx
      - apps/web/src/trips/StayShortlistPage.tsx
    rationale: |
      Stays are the reference sample (07). Everything else matches this layout.
  - description: |
      Migrate flights and transport (sample 09) to `OptionCard`: `FlightShortlistCard` (provider, fare, details and picked state), `TravelSearchPage` (the `.card.travel-option` flight and hotel results), and `TransportSearchPage` (the `li.transport-option`, which keeps its `ul` semantics via `as="li"`).
    files:
      - apps/web/src/trips/FlightShortlistCard.tsx
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/travel/TravelSearchPage.tsx
      - apps/web/src/transport/TransportSearchPage.tsx
    rationale: |
      Covers the flights and transport lists in AC1 and AC3.
  - description: |
      Migrate the remaining option lists to `OptionCard`: `SimOptionCard` (SIMs), `ActivityOptionsPage` (activities), `RestaurantOptionsPage` (restaurants; keep the photo placeholder as a child) and `InsurancePlanCard` (insurance; keep the price table as a child). Keep all existing buttons, links, `aria-label`s and picked states.
    files:
      - apps/web/src/trips/SimOptionCard.tsx
      - apps/web/src/trips/ActivityOptionsPage.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/InsurancePlanCard.tsx
    rationale: |
      Completes "every option list in the app" for AC1, AC3 and AC5.
  - description: |
      Migrate the three comparisons to `CompareTable`.

      - `StayComparison`: columns for total price, fit and offers. The "Lowest price", "Best fit" and "Most offers" marks, and the Rank, Within budget and Over budget badges, go in the `badges` slot or the cell.
      - `RestaurantCompare`: columns for cuisine, dining style and typical price. The "Nothing to compare" empty state is unchanged.
      - `InsuranceComparePage`: replaces the `.cmp` table, keeping its five columns and the "Go to provider site" handler.
    files:
      - apps/web/src/trips/StayComparison.tsx
      - apps/web/src/trips/RestaurantCompare.tsx
      - apps/web/src/trips/InsuranceComparePage.tsx
    rationale: |
      Delivers AC2 and AC4 for every comparison, replacing `.compare-grid`, the `.grid` of `.compare-card`, and `.cmp`.
  - description: |
      Update the existing component tests that assert the old class names or structure. Keep their behavioural assertions. Add Playwright coverage for phone (375px wide) and desktop (1280px wide) viewports.
    files:
      - apps/web/src/trips/StayOptionsPage.test.tsx
      - apps/web/src/trips/StayShortlistPage.test.tsx
      - apps/web/src/trips/InsuranceComparePage.test.tsx
      - apps/web/src/trips/RestaurantShortlistPage.test.tsx
      - apps/web/src/trips/SimOptionsPage.test.tsx
      - apps/web/src/trips/ActivityOptionsPage.test.tsx
      - apps/web/src/transport/TransportSearchPage.test.tsx
      - apps/web/src/travel/TravelSearchPage.test.tsx
      - apps/web/e2e/options-cards.spec.ts
    rationale: |
      Keeps the suite green and checks both widths, as the scope asks. jsdom cannot evaluate media queries, so the layout check at each width lives in Playwright.
tests:
  - |
    AC1 and AC3 (every option list uses the shared card). Write first in `OptionCard.test.tsx`, then one smoke assertion per list page (stays, flights, transport, SIMs, activities, restaurants, insurance):

    ```tsx
    render(<OptionCard title="Hotel Sol" badges={<span className="badge">Offered by 2 providers</span>} price="€120" actions={<button>Pick</button>} />)
    const card = screen.getByRole('article', { name: 'Hotel Sol' })
    expect(card).toHaveClass('option-card')
    expect(card.querySelector('.option-card-head')).not.toBeNull()
    expect(card.querySelector('.option-card-body')).not.toBeNull()
    ```

    Per-page, for example in `TransportSearchPage.test.tsx`: `expect(container.querySelectorAll('li.option-card')).toHaveLength(results.length)`.
  - |
    AC1 and AC3 at both widths, in `apps/web/e2e/options-cards.spec.ts` (Playwright). The viewports are 1280x800 and 375x800. For each option list route:

    ```ts
    await page.setViewportSize({ width: 375, height: 800 })
    const card = page.locator('.option-card').first()
    await expect(card).toBeVisible()
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true) // no horizontal overflow
    ```

    At 1280 wide, also assert `getComputedStyle(.option-card-body).gridTemplateColumns` has two tracks. At 375 wide, assert it has one.
  - |
    AC2 (compare table at desktop). Write first in `CompareTable.test.tsx`, then in `StayComparison`, `RestaurantCompare` and `InsuranceComparePage` tests:

    ```tsx
    render(<CompareTable caption="Plans" rows={rows} rowKey={(r) => r.id} title={(r) => r.name} columns={cols} />)
    expect(screen.getByRole('table', { name: 'Plans' })).toHaveClass('compare-table')
    expect(screen.getAllByRole('columnheader')).toHaveLength(cols.length + 1)
    expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1)
    ```

    Playwright at 1280 wide: `await expect(page.locator('table.compare-table')).toBeVisible()` on the stay, restaurant and insurance compare routes.
  - |
    AC4 (stacked option cards at phone). Unit test in `CompareTable.test.tsx` that every cell carries its label:

    ```tsx
    screen.getAllByRole('cell').forEach((td) => expect(td).toHaveAttribute('data-label'))
    ```

    `designSystem.test.ts` new case, using its existing `phone` slice:

    ```ts
    expect(phone).toMatch(/\.compare-table tr\s*\{[^}]*display: block/)
    expect(phone).toMatch(/\.compare-table td::before\s*\{[^}]*attr\(data-label\)/)
    ```

    Playwright at 375 wide: `expect(await page.locator('.compare-table tr').first().evaluate((el) => getComputedStyle(el).display)).toBe('block')`.
  - |
    AC5 (title and badges still shown). In `OptionCard.test.tsx` and in each migrated page test, keep the existing title and badge assertions. The key ones are `screen.getByText('Offered by 2 providers')` on stays, `Picked` on insurance, and `Lowest price` or `Best fit` in `StayComparison`:

    ```tsx
    expect(within(card).getByRole('heading', { level: 3, name: 'Hotel Sol' })).toBeInTheDocument()
    expect(within(card).getByText('Offered by 2 providers')).toBeInTheDocument()
    ```

    In `CompareTable.test.tsx`, assert the title and badges render in the first cell.
  - |
    Guard rails. `designSystem.test.ts` must still pass: no colour literals or raw px in the new CSS. Run the narrow commands first, e.g. `(cd apps/web && pnpm run test -- src/components src/designSystem.test.ts src/trips/StayOptionsPage.test.tsx)`, then the full configured command.
assumptions_or_open_questions:
  - |
    The "stay card sample (07)", "compare table (08)" and "flights and transport (09)" samples are not in `design-system/`. I looked at `style-guide.html` (its sections are colours, type, buttons, forms, menus, tabs, surfaces, overlays, feedback and layout), `app-shell.html`, `UI-GUIDELINES.md`, and a filename glob for `*07*`, `*08*` and `*09*`. None of them holds an option card or compare table. I therefore take the "stay card layout" from the existing `PropertyCard` and `StayShortlistCard` structure (head with title and badges, meta, price, offers or actions) and the compare style from the existing `.cmp` and `.req` desktop-table and phone-stack pattern. Please confirm, or point me at the sample files, before implementation.
  - |
    I assume "every option list" means the seven named lists, in these files: stays (`PropertyCard`, `StayShortlistCard`), flights (`FlightShortlistCard`, `TravelSearchPage`), transport (`TransportSearchPage`), SIMs (`SimOptionCard`), activities (`ActivityOptionsPage`), restaurants (`RestaurantOptionsPage`) and insurance (`InsurancePlanCard`). Chosen-item cards (`ChosenStayCard`) and itinerary rows are not option lists and stay out of scope.
  - |
    I assume there are three comparisons (stays, restaurants, insurance). `StayComparison` and `RestaurantCompare` are card grids today and become tables on desktop, per AC2. That is a visible change for those two screens.
  - |
    The 48rem breakpoint and the 375px phone width come from `UI-GUIDELINES.md` and the existing `index.css` media queries. No token covers a breakpoint, so the media-query values stay as rem, as the existing code does.
  - |
    I read only the class usage in the option components, not every component in full. The implementer should re-read each file before migrating it, because other classes there (for example in `FlightShortlistCard` and `SimOptionCard`) may hold behaviour to preserve.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — UI markup and CSS only. No stored data, API, migration, seed, setting or env var changes.

  ### Token loading

  `apps/web/src/index.css` line 1 imports Tailwind and line 2 imports `../../../design-system/tokens.css`. The app already loads the tokens, so no loader step is needed. I confirmed that these token names exist in `tokens.css`: `--card-default-background`, `--card-default-border`, `--card-default-radius`, `--card-default-padding`, `--space-1` to `--space-6`, `--radius-md`, `--radius-lg`, `--color-surface`, `--color-border`, `--color-fg-muted`, `--color-primary-subtle` and `--size-grid-min`. The others used in the plan (`--color-primary`, `--border-width`, `--border-width-strong`, `--font-size-*`, `--font-weight-*`) are already used throughout `index.css`. New CSS follows the existing plain-CSS-class convention in `index.css`, not Tailwind utilities.

  ### Shape

  ```mermaid
  flowchart TD
    OC[components/OptionCard.tsx]:::touched
    CT[components/CompareTable.tsx]:::touched
    CSS[index.css]:::touched
    PC[PropertyCard / StayShortlistCard]:::touched
    FT[FlightShortlistCard / TravelSearchPage / TransportSearchPage]:::touched
    MISC[SimOptionCard / ActivityOptionsPage / RestaurantOptionsPage / InsurancePlanCard]:::touched
    CMP[StayComparison / RestaurantCompare / InsuranceComparePage]:::touched
    DST[designSystem.test.ts]:::touched
    TOK[design-system/tokens.css]
    PC -->|uses shared card| OC
    FT -->|uses shared card| OC
    MISC -->|uses shared card| OC
    CMP -->|uses shared table| CT
    OC --> CSS
    CT --> CSS
    CSS -->|imports tokens| TOK
    DST -->|reads CSS| CSS
    classDef touched fill:#f96,color:#000
  ```

  Migrate one list at a time, each starting with its failing test, so the suite stays green between commits. The existing `.option` rules in `index.css` (defined at lines 181, 438 and 439) are left alone unless a migrated file stops using them. The new `.option-card*` names avoid colliding with them.
review_focus: |
  IN scope: the two shared components (`OptionCard`, `CompareTable`), their CSS, and migrating the seven named option lists and the three comparisons onto them. OUT of scope: chosen-item cards, itinerary rows, any API or data change, and new tokens. The riskiest areas are behaviour lost in the migration (picked states, aria-labels, booking links, `li` semantics in transport) and deleting legacy CSS classes that something else still uses. The design samples 07, 08 and 09 were not found in `design-system/`, so the card layout is inferred from the existing stay components. That is deliberate and flagged as an open question.
