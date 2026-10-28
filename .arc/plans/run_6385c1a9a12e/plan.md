summary: |
  Add an "Insurance details" page at `/trips/:tripId/insurance-details` where the owner enters their age, adds companion ages and ticks risky activities, so the already-built plan comparison (`InsuranceComparePage`) becomes reachable. The API already stores everything needed (`owner_age` and `risky_activities` on the trip via `PUT /trips/{id}`, companions as `travellers` with an `age` via `POST /trips/{id}/travellers`), and `gather_insurance` already reports `missing` until they are set. So this is a web-only change: a new page that follows the approved prototype (one centred card, live "what's left" checklist, disabled-until-complete Compare plans button), small additions to `api.ts`, a route, an entry link from the "We need a few more details" alert on the options page, and a few token-only CSS rules.
scope:
  - description: |
      Pure validation helpers, written first with their own tests. Mirror the prototype's `parseAge`:
      ```ts
      export type AgeResult = { empty: true } | { error: string } | { value: number }
      export function parseAge(text: string, min: number, max: number): AgeResult
      export const OWNER_AGE = { min: 18, max: 99 }       // hint "Age in years, 18 to 99."
      export const COMPANION_AGE = { min: 0, max: 99 }
      export function parseCompanionAges(text: string): { ages: number[] } | { error: string }
      export const RISKY_ACTIVITIES = ['Skiing', 'Scuba diving', 'Motorcycling', 'Mountaineering'] as const
      ```
      Messages are the prototype's: "Use whole numbers only, such as 34.", "Enter an age from 18 to 99.", "Enter an age to add a companion." and the `"x": ...` prefix for a bad item in a comma list.
    files:
      - apps/web/src/trips/insuranceDetails.ts
      - apps/web/src/trips/insuranceDetails.test.ts
    rationale: Keeps the page component thin and the rules testable without rendering.
  - description: |
      Web API client. `Trip` gains `owner_age?: number | null` and `risky_activities?: boolean | null` (the API already returns them; `api.ts` does not type them today). `addTraveller` gains an optional age (the API's `TravellerFields` already accepts `age`):
      ```ts
      // before
      export const addTraveller = (tripId: string, name: string) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/travellers`, 'POST', { name })
      // after
      export const addTraveller = (tripId: string, name: string, age?: number) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/travellers`, 'POST', age === undefined ? { name } : { name, age })
      ```
      Add a helper that saves the two trip fields without wiping the rest. `PUT /trips/{id}` replaces name, destination, dates and budget with the body, so the helper must resend them from the loaded trip:
      ```ts
      export const saveInsuranceAnswers = (trip: Trip, a: { owner_age?: number; risky_activities?: boolean }) =>
        call<Trip>(`/trips/${encodeURIComponent(trip.id)}`, 'PUT', {
          name: trip.name, destination: trip.destination ?? null, start_date: trip.start_date ?? null,
          end_date: trip.end_date ?? null, budget: trip.budget ?? null, ...a,
        })
      ```
      Existing callers of `addTraveller` keep working (age is optional).
    files:
      - apps/web/src/trips/api.ts
    rationale: No new API route is needed; the existing routes accept these fields. Resending the other fields avoids the PUT overwriting them with null.
  - description: |
      New `InsuranceDetailsPage` (route `/trips/:tripId/insurance-details`, wrapped in `RequireAuth` like its siblings). It follows the prototype screen "Insurance details" (data-ac 1 2 3 4):
      - `h1` "Insurance details" and the muted line "Tell us who is travelling and what you plan to do. We'll show plans that fit." inside `.page` (max 40rem, centred) with `.stack stack-lg`; one `.card stack stack-lg`.
      - Owner age: `.field` with `label.field-label` "Owner age", `.input` (`inputMode="numeric"`, placeholder "Enter age", max-width 10rem), `.field-hint` "Age in years, 18 to 99.", `.field-error` `role="alert"` shown on blur (keeps the typed value), `aria-invalid`. A valid age is saved on blur through `saveInsuranceAnswers`.
      - Companion ages: `.input-row` with `.field` "Companion ages" (hint "One age, or several separated by commas, such as 8, 12.") and a `.btn btn-secondary` "Add companion"; Enter in the input also adds. Each parsed age is added with `addTraveller(tripId, 'Companion N', age)`. Added companions render as a `ul.cluster` of `.chip is-selected` ("Companion 1: 8 years") each with a remove button (`aria-label="Remove companion 1, age 8"`, calls `removeTraveller`). Empty line "No companions yet. Add at least one age." Companion chips are built from `trip.travellers`, so they survive a reload.
      - Risky activities: `fieldset.fieldset` with `legend.field-label`, hint "Choose every activity you plan to do on this trip.", and `.activity-grid` of `.activity > label.check > input.checkbox`. Ticking one calls `saveInsuranceAnswers(trip, { risky_activities: selected.size > 0 })`.
      - "What's left" checklist in `aria-live="polite"`: title "N of 3 details done" or "All set. Your plans are ready."; items "Owner age entered", "At least one companion age added", "At least one risky activity selected" with `CheckIcon` when done, a minus mark and " (needed)" otherwise (`.checklist li.is-done` uses `--color-success`).
      - Actions row (`.row-end`): hint "Add the missing details to compare plans." / "Everything we need is in." and one `.btn btn-primary` "Compare plans", `disabled` until owner age, one companion and one activity are set; click navigates to `/trips/:tripId/insurance-options/compare`.
      - States: `.skeleton` card while the trip loads; `.alert alert-danger` "We couldn't load this trip. Check your connection and try again." on load failure; a save failure shows a `Toast` "We couldn't save that change. Try again." (the existing `Toast`), and the entry stays as typed. A "Back to trip" `Link` like the sibling pages.
      Tokens used (all already in `design-system/tokens.css` and loaded the same way as the other pages): `--space-1/2/3/4`, `--color-fg-muted`, `--color-success`, `--color-border`, `--color-primary`, `--color-primary-subtle`, `--radius-md`, `--size-control-md/lg`, `--font-size-sm`, `--border-width`.
    files:
      - apps/web/src/trips/InsuranceDetailsPage.tsx
      - apps/web/src/trips/InsuranceDetailsPage.test.tsx
    rationale: This is the missing UI. The checklist and the disabled button follow the prototype's "memorable" element, which explains why Compare plans is unavailable.
  - description: |
      Route and entry point. Register the route in `App.tsx` next to `insurance-options`. In `InsuranceOptionsPage`, add a `Link` "Add insurance details" (`.btn btn-primary`, to `${tripHref}/insurance-details`) inside the existing `options.missing.length > 0` alert, so a traveller who lands on the options page with `missing` set can reach the form.
    files:
      - apps/web/src/App.tsx
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/trips/InsuranceOptionsPage.test.tsx
    rationale: Without an entry point the new page would itself be unreachable.
  - description: |
      Token-only CSS in the app stylesheet, only the rules missing today. `.field`, `.field-label`, `.field-hint`, `.field-error`, `.chip`, `.chip.is-selected`, `.check`, `.row-end` and `.card` already exist in `index.css`. Add `.page` (max 40rem, centred), `.input-row`, `.fieldset`, `.activity-grid` (auto-fit, minmax 12rem), `.activity` with `:has(.checkbox:checked)` using `--color-primary` / `--color-primary-subtle`, and `.checklist`. Copy values from the prototype's `<style>` block and replace nothing with literals. Confirm with a grep before adding that `.checkbox` and `.activity*` do not already exist.
    files:
      - apps/web/src/index.css
    rationale: |
      Phone-first at 375px, so the grid collapses to one column and the input row wraps.
tests:
  - |
    AC1 (unit, written first) in insuranceDetails.test.ts:
    ```ts
    expect(parseAge('34', 18, 99)).toEqual({ value: 34 })
    expect(parseAge('12', 18, 99)).toEqual({ error: 'Enter an age from 18 to 99.' })
    expect(parseAge('3x', 18, 99)).toEqual({ error: 'Use whole numbers only, such as 34.' })
    ```
    AC1 (component) in InsuranceDetailsPage.test.tsx, using `stubApi` and `renderAt('/trips/t1/insurance-details')` like InsuranceOptionsPage.test.tsx:
    ```ts
    const owner = await screen.findByLabelText('Owner age')
    fireEvent.change(owner, { target: { value: '34' } })
    expect(owner).toHaveValue('34')
    fireEvent.blur(owner)
    expect(stub).toHaveBeenCalledWith('/trips/t1', expect.objectContaining({ method: 'PUT' }))
    ```
    Also an invalid age shows its `.field-error` after blur and keeps the typed value, and the PUT body still carries the trip's name, destination, dates and budget.
  - |
    AC2 in InsuranceDetailsPage.test.tsx:
    ```ts
    const skiing = await screen.findByRole('checkbox', { name: 'Skiing' })
    fireEvent.click(skiing)
    expect(skiing).toBeChecked()
    ```
    and the PUT sends `risky_activities: true`; unticking the last one sends `false`.
  - |
    AC3 in InsuranceDetailsPage.test.tsx:
    ```ts
    const ages = await screen.findByLabelText('Companion ages')
    fireEvent.change(ages, { target: { value: '8, 12' } })
    expect(ages).toHaveValue('8, 12')
    fireEvent.click(screen.getByRole('button', { name: 'Add companion' }))
    expect(stub).toHaveBeenCalledWith('/trips/t1/travellers', expect.objectContaining({ method: 'POST' }))
    expect(await screen.findByText('Companion 2: 12 years')).toBeInTheDocument()
    ```
    plus a bad item (`"x"`) shows the error and sends no request, and the remove button calls `DELETE /trips/t1/travellers/:id`.
  - |
    AC4 in InsuranceDetailsPage.test.tsx. With nothing entered:
    ```ts
    expect(await screen.findByRole('button', { name: 'Compare plans' })).toBeDisabled()
    expect(screen.getByText('0 of 3 details done')).toBeInTheDocument()
    ```
    After owner age, one companion and one activity are entered the button is enabled, "All set. Your plans are ready." shows, and clicking it lands on the compare route (assert the "Compare plans" heading of `InsuranceComparePage` from the stubbed `GET /trips/t1/insurance-options`). Also cover a trip already holding `owner_age`, `travellers` and `risky_activities: true`: the button is enabled on load.
  - |
    Entry point in InsuranceOptionsPage.test.tsx, with `options({ ...base, missing: ['your age'] })`:
    ```ts
    expect(await screen.findByRole('link', { name: 'Add insurance details' })).toHaveAttribute('href', '/trips/t1/insurance-details')
    ```
  - |
    Narrow runs (keeps the runner from the project command, swaps the suite path for the files):
    `cd apps/web && pnpm run test -- src/trips/insuranceDetails.test.ts src/trips/InsuranceDetailsPage.test.tsx src/trips/InsuranceOptionsPage.test.tsx`
assumptions_or_open_questions:
  - |
    The API stores only a boolean `risky_activities`, not which activities were chosen. The page keeps the chosen names in component state and saves `true` when at least one is ticked. After a reload the boxes start unticked even though the checklist counts the saved answer as done. If the traveller needs the names kept (for example to filter plans by activity), the API needs a new field. That is outside this item, so please confirm this is acceptable.
  - |
    The prototype lists four activities (Skiing, Scuba diving, Motorcycling, Mountaineering). The item does not give a list, so I used the prototype's. Please confirm.
  - |
    Prototype vs item. The prototype opens the comparison in a drawer with a fixture table (Plan, Cover, Price). The item says the comparison is already built, and it is a full page (`InsuranceComparePage`, route `/insurance-options/compare`, with its own data from the API). I link to that page rather than building the drawer. The compare page redirects back to the shortlist when fewer than two plans match, so a complete form can still end on the shortlist.
  - |
    Prototype vs the API for companions. The prototype turns the field into a comma list of ages and writes it back into the field after Add. Here each age becomes a stored traveller (the API needs a name, so it is "Companion N"), so the field is cleared after Add and the ages appear as chips. The age still shows in the field while typing (AC3) and as a chip after Add.
  - |
    Saving changes the stored trip. A changed owner age or a new or removed companion clears an existing insurance pick (existing API behaviour in update_trip, add_traveller and remove_traveller). The page does not warn about this. If a warning is wanted, that is a follow-up.
  - |
    Rule limits. Owner age 18 to 99 and companion age 0 to 99 follow the prototype; the API accepts 0 to 120. The stricter UI rule is deliberate.
  - |
    Not planned, as nothing in the item asks for it: a link to the new page from the trip page's insurance row (only the options page's missing alert links to it). Say if you want the trip page link too.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  None — web UI only. It reads and writes existing trip fields (`owner_age`, `risky_activities`, `travellers[].age`) through existing routes, with no schema change, migration, seed, setting or env var. Deploy order does not matter. Rollback is safe: the saved values are ordinary trip fields the old UI already tolerates.

  ### Design and tokens
  Built from `TRAVEL-PLANNER-APP-STORY-092-design.html`, screen "Insurance details" (the "Plan comparison" screen is the drawer view, not built here, see open questions). The prototype's tokens come from `design-system/tokens.css`. The app already styles with the same custom properties in `apps/web/src/index.css` (the `.field`, `.chip`, `.drawer`, `.row-end` rules use `var(--space-*)` and `var(--color-*)`), so no new token loading is needed. I read the prototype's CSS for the new classes and listed the tokens in the page task. A value the tokens do not cover would go in the open questions; none was found (the 12rem activity column and 40rem page width are rem values taken from the prototype, not pixel values).

  ```mermaid
  flowchart TD
    App[App.tsx routes]:::touched -->|new route| Details[InsuranceDetailsPage.tsx]:::touched
    Options[InsuranceOptionsPage.tsx]:::touched -->|Add insurance details link| Details
    Details -->|PUT trip, POST/DELETE travellers| Api[trips/api.ts]:::touched
    Details --> Rules[insuranceDetails.ts]:::touched
    Details -->|Compare plans| Compare[InsuranceComparePage.tsx]
    Api --> Routes[services/api routers/trips.py]
    Compare -->|GET insurance-options| Gather[insurance/options.py gather_insurance]
    Routes --> Gather
    classDef touched fill:#f96,color:#000
  ```

  The server side is unchanged: `gather_insurance` in `services/api/app/insurance/options.py` already lists "your age", "age of X" and "risky activities answer" in `missing` and returns no plans until they are filled, which is what makes the comparison reachable once this form saves them.
review_focus: |
  IN: the new Insurance details page, its validation helpers, the `api.ts` additions, the route, the options-page entry link and token-only CSS. OUT: any API change, persisting which activities were chosen, and the comparison itself. Riskiest area: `saveInsuranceAnswers`, because `PUT /trips/{id}` overwrites name, destination, dates and budget, so the body must resend the loaded trip's values. Deliberate deviations from the prototype (link to the existing compare page instead of a drawer, field cleared after Add companion) are listed in the open questions.
