summary: |
  Make the Compare entry point on the insurance options page honest. Today `InsuranceOptionsPage` only renders a "Compare plans" link when 2+ plans exist (nothing at all otherwise, no explanation), and `InsuranceComparePage` silently `<Navigate>`s back to the shortlist when fewer than 2 plans exist. This plan adds one shared rule, "Compare works only with 2 or more plans AND every traveller has an age", used by both pages. The options page shows a Compare button that is disabled with a visible, `aria-describedby`-linked reason (too few plans, or a traveller's age is missing, with an "Add traveller details" link). The Compare page stays put and renders an `.empty-state` (too few plans, or missing age with a link to add details). Web-only change; the API already returns `travellers[].age` and `missing`.
scope:
  - description: |
      New pure helper deciding whether Compare can work, shared by both pages.
      ```ts
      export type CompareState =
        | { kind: 'ready' }
        | { kind: 'too-few'; count: number }
        | { kind: 'missing-age'; names: string[] }
      export const compareState = (options: InsuranceOptions): CompareState
      ```
      Order of precedence: any traveller with `age === null` gives `missing-age` (names are the traveller labels, "You" becomes "You"), then `plans.length < 2` gives `too-few`, else `ready`. The missing-age check comes first so AC9 holds even when 3 plans are present. Also exports `plainCount(n)` style copy only if needed; otherwise copy lives in the pages.
    files:
      - apps/web/src/trips/insuranceCompare.ts
      - apps/web/src/trips/insuranceCompare.test.ts
    rationale: |
      One rule in one place guarantees the button state (AC1, 2, 9) and the Compare page state (AC6 to 8) cannot disagree.
  - description: |
      Options page (design screens "Insurance options - enough plans", "- 0 or 1 plan", "- a traveller has no age"). Replace the `plans.length >= 2 && <Link>Compare plans</Link>` block (InsuranceOptionsPage.tsx ~177-183) with a `.compare-bar` row rendered whenever `options` is ready, `missing` has no trip-level blockers aside from age, and the page shows the shortlist area: plan count text (`3 plans for your trip`, `1 plan for your trip`, `0 plans for your trip`, in `.text-bold`) plus the Compare control.
      - ready: a `Link` with `className="btn btn-secondary"` to `${tripHref}/insurance-options/compare`, text "Compare".
      - not ready: `<button className="btn btn-secondary" type="button" disabled aria-describedby="compare-reason">Compare</button>` (the `.btn:disabled` style from the design system already gives the disabled look).
      - too-few: `.alert.alert-info` with `role="status"` containing an info icon and `<p id="compare-reason">Compare needs at least 2 plans. Change your trip dates or travellers to see more plans.</p>`, placed between the bar and the list.
      - missing-age: `.alert.alert-warning` with `role="alert"`, `<p id="compare-reason">Add the missing traveller details to compare plans. {names} has no age yet.</p>` plus `<a class="text-bold">Add traveller details</a>`, placed above the bar (as in the design). The link points at the existing InsuranceDetailsForm on the same page (`#owner-age` when the owner is missing, otherwise `#companion-ages`); the form already renders there, so no new route is needed.
      Layout uses the existing classes `.alert`, `.stack`, `.cluster`, `.btn-secondary`; the prototype's `.compare-bar` (flex, wrap, space-between, gap `--space-3`) is added to `apps/web/src/index.css` using only tokens. Use the existing `AlertIcon` and add an `InfoIcon` to `../auth/icons` only if one does not already exist (check first).
    files:
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/index.css
    rationale: |
      Covers AC1, 2, 3, 4, 9. The reason is tied to the disabled button with `aria-describedby` (the design's stated "memorable" decision). `--color-primary` stays reserved for actions: Compare is a `.btn-secondary` because the form's "Compare plans" `.btn-primary` is the one primary action on the page (UI guidelines: one primary per section).
  - description: |
      Compare page (design screens "Compare - enough plans", "- 0 or 1 plan", "- a traveller has no age"). Remove `<Navigate to={shortlistHref} replace />` and the `Navigate` import. Keep the `Load` state but store the whole `InsuranceOptions` (`{ state: 'ready'; options }`) so `compareState(options)` can be used. When `ready`: render the existing `CompareTable` (plans straight from `options.plans`, same source as the options page, AC5). When `too-few`: `.empty-state` with info icon, `<h2>Nothing to compare yet</h2>`, "You need at least 2 plans to compare. Change your trip dates or travellers to see more plans." and one `.btn-primary` Link "Back to insurance options". When `missing-age`: `.empty-state` with user icon, `<h2>We need a traveller's age</h2>`, "Add the missing traveller details to compare plans. {names} has no age yet." and a `.btn-primary` Link "Add traveller details" to the options page form anchor. Add a `.btn-secondary` "Back to insurance options" under the table in the ready state as in the design. Keep the page `<h1>Compare plans</h1>`, the breadcrumb/back link and `InsuranceDisclaimer`.
    files:
      - apps/web/src/trips/InsuranceComparePage.tsx
    rationale: |
      Covers AC5 to 8. The user is no longer redirected, so the failure is explained where they landed.
  - description: |
      Update the existing tests that assert the old behaviour: the options page "Compare plans" link tests (lines ~46-57, ~168) become tests for the "Compare" link/button, and the Compare page test "goes back to the shortlist when fewer than two plans exist" is replaced by the stay-and-explain tests below. The form's own `Compare plans` button (InsuranceDetailsForm) is unchanged; "Compare" does not collide with it because Testing Library matches the full accessible name.
    files:
      - apps/web/src/trips/InsuranceOptionsPage.test.tsx
      - apps/web/src/trips/InsuranceComparePage.test.tsx
    rationale: Keeps the suite green for the intended behaviour change.
tests:
  - |
    Write first, in `insuranceCompare.test.ts` (run with `cd apps/web && pnpm run test -- insuranceCompare`). Fails until the helper exists. Covers the rule behind AC1, 2, 9.
    ```ts
    expect(compareState(options(PLANS))).toEqual({ kind: 'ready' })
    expect(compareState(options(PLANS.slice(0, 2)))).toEqual({ kind: 'ready' })
    expect(compareState(options(PLANS.slice(0, 1)))).toEqual({ kind: 'too-few', count: 1 })
    expect(compareState(options([]))).toEqual({ kind: 'too-few', count: 0 })
    expect(compareState(options(PLANS, { travellers: [{ label: 'Maya Chen', age: null }] })))
      .toEqual({ kind: 'missing-age', names: ['Maya Chen'] })
    ```
  - |
    AC1, in `InsuranceOptionsPage.test.tsx` (`pnpm run test -- InsuranceOptionsPage`): with 2 plans, then 3 plans, all travellers aged.
    ```ts
    const compare = await screen.findByRole('link', { name: 'Compare' })
    expect(compare).toHaveAttribute('href', '/trips/t1/insurance-options/compare')
    ```
  - |
    AC2, same file: with 0 plans and with 1 plan the button is disabled.
    ```ts
    expect(await screen.findByRole('button', { name: 'Compare' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Compare' })).toBeNull()
    ```
  - |
    AC3, same file: with 1 plan (and with 0) a message is shown and linked to the button.
    ```ts
    const button = await screen.findByRole('button', { name: 'Compare' })
    expect(button).toHaveAccessibleDescription(/at least 2 plans.*change your trip dates or travellers/i)
    ```
  - |
    AC4, same file: a traveller has no age (`travellers: [{ label: 'You', age: 34 }, { label: 'Maya Chen', age: null }]`).
    ```ts
    expect(await screen.findByText(/Add the missing traveller details to compare plans\. Maya Chen has no age yet\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add traveller details' })).toBeInTheDocument()
    ```
  - |
    AC9, same file: missing age with `PLANS` (3 plans) still disables Compare.
    ```ts
    expect(await screen.findByRole('button', { name: 'Compare' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Compare' })).toBeNull()
    ```
  - |
    AC5, in `InsuranceComparePage.test.tsx`: the compare table shows exactly the plans the options page gets from the same response.
    ```ts
    const rows = within(await screen.findByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(1 + PLANS.length)
    PLANS.forEach((p, i) => expect(rows[i + 1]).toHaveTextContent(p.name))
    ```
    Also run with `PLANS.slice(0, 2)` and expect 2 data rows.
  - |
    AC6, same file: with 1 plan and with 0 plans the user stays on Compare (replaces the old redirect test).
    ```ts
    expect(await screen.findByRole('heading', { name: 'Compare plans' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Insurance options' })).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    ```
  - |
    AC7, same file: the empty state explains why.
    ```ts
    expect(await screen.findByRole('heading', { name: 'Nothing to compare yet' })).toBeInTheDocument()
    expect(screen.getByText(/You need at least 2 plans to compare/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to insurance options' })).toHaveAttribute('href', '/trips/t1/insurance-options')
    ```
  - |
    AC8, same file: a traveller has no age (any plan count).
    ```ts
    expect(await screen.findByRole('heading', { name: "We need a traveller's age" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add traveller details' })).toHaveAttribute('href', expect.stringContaining('/trips/t1/insurance-options'))
    ```
assumptions_or_open_questions:
  - |
    The API (`services/api/app/insurance/options.py` ~156) already returns `plans: []` whenever `missing` is non-empty, so "traveller has no age and 2 or 3 plans shown" (AC9) cannot occur from the current backend. The frontend rule still applies the age check first so AC9 holds if the API ever returns both; no API change is planned (excluded by scope). Confirm this is acceptable.
  - |
    Where "Add traveller details" should lead: the story names no route. The plan links to the existing InsuranceDetailsForm on the options page (`#owner-age` or `#companion-ages`; needs the options page to scroll/focus that anchor). If a Travelers tab on the trip page is the intended target, say so and the link target changes only.
  - |
    Design vs existing UI: the prototype labels the control "Compare"; the code uses "Compare plans" (link on the options page and also the details form's submit button). The plan follows the prototype for the new control only and leaves the form button untouched; existing tests that look up the link as "Compare plans" are updated.
  - |
    Prototype wording "Change your trip dates or travellers to see more plans" is used verbatim for both pages (AC3, AC7). When the real cause is a missing destination or trip dates, the existing "We need a few more details" alert already covers it; the Compare button then shows the too-few reason. Flagging in case a different message is wanted.
  - |
    The prototype shows only 0 plans as an empty list with "0 plans for your trip"; the existing "No plans suit this trip" empty state on the options page is kept and the disabled Compare bar is shown above it.
  - |
    Prototype tokens file has `--duration-fast: [object Object]` (a generation artefact); not relevant here, and no new motion is planned.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout
  None — front-end UI behaviour and copy only; no stored data, schema, settings or provisioning. Safe to roll back by reverting the commit.

  ### Design and token notes
  Read in full: the prototype `TRAVEL-PLANNER-APP-STORY-109-design.html` (six screens: options ready, options 0 or 1 plan, options missing age, compare ready, compare empty, compare missing age). It uses the existing classes `.card`, `.btn-secondary`, `.btn-ghost`, `.btn-primary`, `.alert-info`, `.alert-warning`, `.empty-state`, `.text-muted`, `.text-bold`, plus CompareTable and OptionCard/InsurancePlanCard; it explicitly adds no new components. Tokens used only by name: `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--color-fg-muted`, `--color-info`, `--color-info-subtle`, `--color-warning`, `--color-warning-subtle`, `--size-control-lg`, `--opacity-disabled`, `--border-width`. The only new CSS is the `.compare-bar` layout rule (flex, wrap, `justify-content: space-between`, `gap: var(--space-3)`, `.btn` `min-width: var(--size-control-lg)`), which belongs in `apps/web/src/index.css`. The implementer must open `design-system/` and `apps/web/src/index.css` to confirm how tokens are loaded there (not re-verified in this plan) and name the import line in the PR; if tokens are not loaded, add the single import in `index.css`. No hex or raw pixel literals.

  CompareTable (apps/web/src/components/CompareTable.tsx) is reused unchanged. Prototype columns (Plan, Price, Cover, Excess) differ from the shipped columns (Reason, Traveller prices, Group total, Provider site); the shipped columns are kept because the API has no excess/cover fields and the story excludes new plan data.

  ```mermaid
  flowchart TD
    A[App.tsx routes] --> O[InsuranceOptionsPage.tsx]
    A --> C[InsuranceComparePage.tsx]
    O --> H[insuranceCompare.ts compareState]
    C --> H
    O --> F[InsuranceDetailsForm]
    C --> T[CompareTable]
    O --> API[api.ts fetchInsuranceOptions]
    C --> API
    O --> CSS[index.css compare-bar]
    classDef touched fill:#f96,color:#000
    class O,C,H,CSS touched
  ```
  O: new Compare bar, reason messages. C: stays and shows empty states instead of redirecting. H: new shared rule. CSS: `.compare-bar` layout.
review_focus: |
  IN: the shared `compareState` rule, the options page Compare button plus reasons, and the Compare page empty states (replacing the redirect). OUT: API changes, new providers or plans, new routes and new components. Riskiest part is the options page rework: keep the existing details form, "No plans suit this trip" state and picked-plan flow behaving as before, and the existing tests that name "Compare plans" were deliberately renamed to "Compare" to follow the prototype. The missing-age check deliberately precedes the plan-count check (AC9), even though the current API never returns plans alongside missing details.
