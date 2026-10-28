summary: |
  Add the missing inputs to the existing insurance page (`InsuranceOptionsPage`, route `/trips/:tripId/insurance-options`): an Owner age field, a Companion ages field that turns comma-separated ages into removable chips, and a Risky activities checkbox group, with the live "what's left" checklist and a Compare plans button that stays disabled until all three are set (approved design, screen "Insurance details"). The backend already stores everything needed (`Trip.owner_age`, `Trip.risky_activities`, `Trip.travellers[].age`) and the comparison page (`InsuranceComparePage`) already exists, so this is a web-only change: wire the form to the existing `PUT /trips/{id}`, `POST/DELETE /trips/{id}/travellers` routes, then send the traveller to the existing comparison once the entries are complete.
scope:
  - description: |
      Pure validation helpers, written test-first. `parseAge(text, min, max)` returns `{ empty: true } | { value: number } | { error: string }`, mirroring the design's `parseAge`. `parseAges(text)` splits on commas and returns the ages or the first error. Owner range is 18 to 99, companion range 0 to 99 (the design's ranges; the API accepts 0 to 120, so it is never stricter than the client). Error copy comes from the design: "Use whole numbers only, such as 34." and "Enter an age from 18 to 99."
      ```ts
      export type AgeParse = { empty: true } | { value: number } | { error: string }
      export const parseAge = (text: string, min: number, max: number): AgeParse
      export const parseAges = (text: string): { ages: number[] } | { error: string }
      export const RISKY_ACTIVITIES = ['Skiing', 'Scuba diving', 'Motorcycling', 'Mountaineering'] as const
      ```
    files:
      - apps/web/src/trips/insuranceDetails.ts
      - apps/web/src/trips/insuranceDetails.test.ts
    rationale: |
      Keeps validation out of the component and unit-testable. The four activity names are the design's list.
  - description: |
      New `InsuranceDetailsForm` component, built from the prototype's screen 1. Props: `trip: Trip`, `onTripChange(trip: Trip)`, `onCompare()`. Layout is one `.card.stack.stack-lg` inside the page's `.stack`. Contents, in order: (1) `.field` Owner age, `.input` with `inputmode="numeric"`, placeholder "Enter age", `.field-hint` "Age in years, 18 to 99.", `.field-error` with `role="alert"` shown on blur only (not while typing), the typed value kept; (2) `.field` Companion ages with an "Add companion" `.btn-secondary` beside it (Enter in the field also adds), hint "One age, or several separated by commas, such as 8, 12."; added companions render as `.chip.is-selected` list items "Companion 1: 8 years" each with a `.btn-ghost.btn-icon.btn-sm` remove button labelled "Remove companion 1, age 8", plus the muted line "No companions yet. Add at least one age." when empty; (3) `fieldset` "Risky activities" with the hint "Choose every activity you plan to do on this trip." and an `.activity-grid` of `.check` + `.checkbox` boxes, a selected box tinted with `--color-primary-subtle` and `--color-primary` border; (4) `.divider`, then an `aria-live="polite"` progress block ("N of 3 details done" / "All set. Your plans are ready.") and the `.checklist` of "Owner age entered", "At least one companion age added", "At least one risky activity selected (needed)". Below the card, a `.row-end` with the muted hint ("Add the missing details to compare plans." / "Everything we need is in.") and one `.btn-primary` "Compare plans", `disabled` until complete. Copy is second person and warm, as in the design.
      Persistence uses existing routes only. Add companion calls `addTraveller(tripId, 'Companion N', age)` once per age and shows the toast "N companions added"; remove calls `removeTraveller`. Compare plans first saves owner age and risky answer with `updateTrip` (see api.ts item), shows the button spinner ("Comparing…") while saving, then calls `onCompare`. A failed save shows the design's `.alert.alert-danger` "We couldn't save your details. Check your connection and select Compare plans again." and stays on the page.
      Tokens used (all from design-system/tokens.css, already loaded): `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--color-fg-muted`, `--color-success`, `--color-danger`, `--color-primary`, `--color-primary-subtle`, `--color-border`, `--radius-md`, `--border-width`, `--size-control-md`, `--size-control-lg`, `--font-size-sm`, `--size-content-max` (page width stays the shell's; the card caps at 40rem as in the prototype's `.page`).
    files:
      - apps/web/src/trips/InsuranceDetailsForm.tsx
      - apps/web/src/trips/InsuranceDetailsForm.test.tsx
    rationale: |
      The page-level change the story asks for. Reuses `.card`, `.field`, `.input`, `.chip`, `.checkbox`, `.btn-*`, `.alert`, `Toast` that already exist in this app.
  - description: |
      Wire the form into `InsuranceOptionsPage`. Render `<InsuranceDetailsForm>` above the shortlist, prefilled from `fetchTrip` (already called in the page's `useEffect`; keep the whole trip in state instead of only `pickedId`). When the form saves, refetch `fetchInsuranceOptions`, so the existing "We need a few more details" alert and shortlist reflect the new entries. `onCompare` navigates with `useNavigate` to the existing `${tripHref}/insurance-options/compare` route. Keep the existing "Compare plans" link and everything else on the page unchanged. Keep the form's primary button and the shortlist's secondary link distinct: the form button is a `button`, the existing one stays a `link`.
    files:
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/trips/InsuranceOptionsPage.test.tsx
    rationale: |
      The insurance page is this file; it already owns the trip and options loading.
  - description: |
      api.ts: add the fields the server already returns to the `Trip` type, and widen two calls.
      ```ts
      // Trip gains:
      owner_age?: number | null
      risky_activities?: boolean | null
      // Traveller gains:
      age?: number | null
      // before
      export const addTraveller = (tripId: string, name: string) => ...  { name }
      // after
      export const addTraveller = (tripId: string, name: string, age?: number) => ...  age === undefined ? { name } : { name, age }
      // TripInput gains the two optional fields
      export type TripInput = Pick<Trip, 'name' | 'destination' | 'start_date' | 'end_date' | 'budget' | 'owner_age' | 'risky_activities'>
      ```
      IMPORTANT: `PUT /trips/{id}` takes the full `TripFields` and overwrites destination, dates and budget with null when they are absent from the body (services/api/app/routers/trips.py, `update_trip`). The form must therefore send the stored `name`, `destination`, `start_date`, `end_date` and `budget` from the fetched trip along with `owner_age` and `risky_activities`. Omit `interests` (the route keeps the stored ones when it is absent).
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      `addTraveller` today sends no age, so companion ages could not be stored; the backend `TravellerFields` already accepts `age`. Existing callers pass two arguments and are unaffected.
  - description: |
      Styles for the new elements, in the app's global stylesheet, using only tokens: `.checklist` (+ `.is-done`), `.fieldset`, `.activity-grid`, `.activity` (with `:has(.checkbox:checked)` tint), `.input-row`, `.row-end`, matching the prototype's rules and token names. Before adding, grep index.css for existing `.checkbox`, `.check`, `.chip` and `.field` rules and reuse them; only add what is missing. Tokens are loaded once already by `@import "../../../design-system/tokens.css";` at apps/web/src/index.css:2, so no loader work is needed.
    files:
      - apps/web/src/index.css
    rationale: |
      The prototype's page-specific classes have no production equivalent yet; no hex or raw px literals.
tests:
  - |
    AC1, owner age (insuranceDetails.test.ts and InsuranceDetailsForm.test.tsx). Write first, they fail because neither file exists:
    ```ts
    expect(parseAge('34', 18, 99)).toEqual({ value: 34 })
    expect(parseAge('abc', 18, 99)).toEqual({ error: 'Use whole numbers only, such as 34.' })
    expect(parseAge('12', 18, 99)).toEqual({ error: 'Enter an age from 18 to 99.' })
    // component
    await userEvent.type(screen.getByLabelText('Owner age'), '34')
    expect(screen.getByLabelText('Owner age')).toHaveValue('34')
    await userEvent.type(screen.getByLabelText('Owner age'), '{backspace}{backspace}5')
    await userEvent.tab()
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an age from 18 to 99.')
    ```
  - |
    AC2, risky activity (InsuranceDetailsForm.test.tsx):
    ```ts
    await userEvent.click(screen.getByRole('checkbox', { name: 'Skiing' }))
    expect(screen.getByRole('checkbox', { name: 'Skiing' })).toBeChecked()
    expect(screen.getByText('1 of 3 details done')).toBeInTheDocument()
    ```
  - |
    AC3, companion age (InsuranceDetailsForm.test.tsx, `stubApi` with `'POST /trips/t1/travellers'` returning a trip whose `travellers` holds `{ id: 'c1', name: 'Companion 1', age: 8 }`):
    ```ts
    await userEvent.type(screen.getByLabelText('Companion ages'), '8')
    await userEvent.click(screen.getByRole('button', { name: 'Add companion' }))
    expect(await screen.findByText('Companion 1: 8 years')).toBeInTheDocument()
    expect(screen.getByLabelText('Companion ages')).toHaveValue('8')
    // body sent
    expect(JSON.parse(String((stub.mock.calls[0][1] as RequestInit).body))).toEqual({ name: 'Companion 1', age: 8 })
    ```
    Also: "8, x" shows `"x": Use whole numbers only, such as 34.` and sends nothing; Remove companion 1 sends `DELETE /trips/t1/travellers/c1`.
  - |
    AC4, comparison reached (InsuranceDetailsForm.test.tsx and InsuranceOptionsPage.test.tsx). Disabled until all three are set, then Compare plans saves and opens the existing comparison:
    ```ts
    expect(screen.getByRole('button', { name: 'Compare plans' })).toBeDisabled()
    // enter owner age, add a companion age, tick Skiing
    expect(screen.getByRole('button', { name: 'Compare plans' })).toBeEnabled()
    expect(screen.getByText('All set. Your plans are ready.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Compare plans' }))
    expect(calls(stub)).toContain('PUT /trips/t1')
    expect(JSON.parse(String(putInit.body))).toMatchObject({ name: 'Japan', destination: 'Tokyo', owner_age: 34, risky_activities: true })
    expect(await screen.findByRole('heading', { name: 'Compare plans' })).toBeInTheDocument()
    ```
    Page-level: the form is prefilled from a trip with `owner_age: 41` and `risky_activities: true`; a failed `PUT` shows "We couldn't save your details" and stays on the page. The existing InsuranceOptionsPage and InsuranceComparePage tests must still pass unchanged.
  - |
    Narrow run commands (derived from the project test command): `(cd apps/web && pnpm run test -- src/trips/insuranceDetails.test.ts src/trips/InsuranceDetailsForm.test.tsx src/trips/InsuranceOptionsPage.test.tsx)`. No API tests are added because the API is not changed.
assumptions_or_open_questions:
  - |
    CONFLICT between the design and the story. The prototype's Compare plans button opens a drawer with a fixture table (Plan, Cover, Price) and a made-up price formula. The story says the comparison is already built, and `InsuranceComparePage` is the real one (server-priced, per traveller). I plan to build the form from the design but send the traveller to the existing comparison page instead of building the drawer or the fixture table. Please confirm; the alternative is a drawer that renders the existing comparison.
  - |
    The design lists four specific risky activities, but the API stores only one boolean, `risky_activities`. I plan to save `true` when at least one is ticked and not change the API. The specific ticks are not stored, so after a reload the form shows no boxes ticked even when `risky_activities` is true. Should the API store the activity names (a data change plus a backend task)? If not, should a stored `true` show a note such as "Activities saved" on reload?
  - |
    The API requires a name for each traveller, and the design collects ages only. I plan to name them "Companion 1", "Companion 2" and so on. The existing traveller screens let the owner rename or detail them elsewhere; this plan adds no name field.
  - |
    `Trip.traveller_count` (set at New trip set-up) drives the "details of N more travellers" missing item. If the trip says 3 travellers and the traveller enters one companion, the comparison still reports missing details and shows no plans. This plan does not change `traveller_count` because `PUT /trips/{id}` does not accept it. Should the form show a warning when companions plus the owner are fewer than `traveller_count`?
  - |
    Companions already on the trip with no age (added by name before this change) are shown as chips reading "Name: age needed" and do not count toward "at least one companion age". The design does not cover this state.
  - |
    Both adding and removing a companion clear a picked insurance plan on the server (`trip.insurance = None`), as does changing the owner age. The form says nothing about this beyond the existing "Pick removed" behaviour on the shortlist; confirm that is acceptable.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  None — web UI only. It reads and writes fields the API already stores (`owner_age`, `risky_activities`, `travellers[].age`) through existing routes; there is no migration, setting, seed or new API behaviour. Rollback is reverting the web change.

  ### Design (read in full)
  Source: the approved prototype, screen "Insurance details" (acceptance criteria 1 to 4) and the static "Plan comparison" screen. UI guidelines applied: one `.field` per input with a `.field-hint`, `.field-error` with `.is-invalid` after blur/submit and not while typing; one `.btn-primary` per section; `.chip` for the added companions; `.toast` to confirm an added companion; `.alert` for the save failure; `.skeleton` already covers loading in the page; phone first, single column, no fixed column counts (the activity grid uses `auto-fit`). Light theme only, `--color-primary` only on the action and the selection.
  Tokens load through `apps/web/src/index.css:2` (`@import "../../../design-system/tokens.css";`) after `@import "tailwindcss";` at line 1; the existing app already styles with these `var(--token)` names. Note tokens.css exports `--duration-fast` and `--duration-spin` as "[object Object]"; index.css already overrides them (comment at index.css:4), so do not use them in new rules beyond what exists.

  ### Existing code this builds on
  - `apps/web/src/trips/InsuranceOptionsPage.tsx` already loads the trip and options, shows the "We need a few more details" alert from `options.missing`, and links to the comparison.
  - `apps/web/src/trips/InsuranceComparePage.tsx` is the finished comparison; it redirects back to the shortlist when fewer than two plans match.
  - `services/api/app/insurance/options.py` `_missing` lists what blocks plans: destination, dates, risky answer, each traveller's age, and `traveller_count` shortfall.
  - Routes are registered in `apps/web/src/App.tsx` (insurance-options at line 254, compare at line 262); no new route is needed.

  ```mermaid
  flowchart TD
    A[App.tsx routes] --> B[InsuranceOptionsPage]
    B --> F[InsuranceDetailsForm NEW]
    F --> V[insuranceDetails.ts NEW]
    F --> P[api.ts]
    B --> P
    B -->|Compare plans navigates| C[InsuranceComparePage]
    P --> R[routers/trips.py PUT trip, POST and DELETE travellers]
    P --> O[insurance/options.py gather_insurance]
    classDef touched fill:#f96,color:#000
    class B,F,V,P touched
  ```
  `InsuranceOptionsPage` is touched to host the form, `InsuranceDetailsForm` and `insuranceDetails.ts` are new, and `api.ts` is touched for the new fields and the `addTraveller` age argument. The API files are read-only context.

  ### Project-wide decision
  The starter-countries decision (Japan, Portugal, India, Thailand, Mexico, Morocco, Peru) does not affect this item; no destination data is touched. No untrusted text asked for anything outside the change.
review_focus: |
  IN scope: the insurance page inputs (owner age, companion ages, risky activities), their validation and checklist, and sending the traveller to the existing comparison; OUT: any change to the API, the comparison page, or a drawer with prices. The riskiest part is the `PUT /trips/{id}` call, which nulls destination, dates and budget unless the form resends the stored values, so check that the body carries them. Two deliberate choices to keep: the design's fixture comparison drawer is replaced by the existing comparison page, and the four named activities collapse to the API's single `risky_activities` boolean (see open questions).
