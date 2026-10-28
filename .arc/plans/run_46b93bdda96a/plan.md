summary: |
  Add the missing inputs to the existing insurance page (`InsuranceOptionsPage`, route `/trips/:tripId/insurance-options`): an Owner age field, a Companion ages field that turns into removable chips, and a Risky activities checkbox group, plus the "what's left" checklist and a Compare plans button from the approved prototype. Today the page only says "Add X to this trip" when `options.missing` is non-empty, and the web app has no way to set `owner_age`, `risky_activities` or a companion's age, so the already-built plan comparison cannot be reached. The API already stores `owner_age`, `risky_activities` and traveller `age` (`TripFields`, `TravellerFields`), so this is a web-only change: a new form component, three small `api.ts` additions, wiring into the page, and tokens-only CSS. When all three details are present, Compare plans saves them and the existing shortlist and comparison link are shown.
scope:
  - description: |
      Extend the web API client for the new inputs. Add `owner_age?: number | null` and `risky_activities?: boolean | null` to the `Trip` type. Add `saveInsuranceDetails(trip: Trip, ownerAge: number, risky: boolean)`, which does `PUT /trips/{id}` with the trip's existing name, destination, dates and budget plus `owner_age` and `risky_activities`. Both must be sent, because the API only keeps stored values for fields absent from `model_fields_set`. Change `addTraveller(tripId, name, age?)` so it sends `{ name, age }` when an age is given; the API's `TravellerFields` already accepts `age`.
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Reuses existing routes. No API change is needed. Note that the API clears a picked insurance plan when `owner_age` changes or a traveller is added (`routers/trips.py` update_trip and add_traveller), which is the correct behaviour for a re-quote.
  - description: |
      New `InsuranceDetailsForm` component following the prototype's "Insurance details" screen, inside the page's content (no new top-level page, no new route). It renders:
      - A `.card.stack` with an Owner age `.field` (`.field-label`, `.input` with `inputmode="numeric"`, `.field-hint` "Age in years, 18 to 99.", `.field-error` with `role="alert"` shown on blur).
      - A Companion ages `.field` with an "Add companion" `.btn-secondary`. Enter in the field also adds. The field accepts one age or several comma-separated ones (0 to 99). Valid ages become removable `.chip.is-selected` items in a `ul.cluster` labelled "Companions added", and the input is rewritten to the comma-joined ages so the field shows them (AC3).
      - A `fieldset` "Risky activities" with an `.activity-grid` of `.check` + `.checkbox` options (Skiing, Scuba diving, Motorcycling, Mountaineering). Selected options get the `--color-primary` border and `--color-primary-subtle` fill (AC2).
      - A live `aria-live="polite"` checklist ("N of 3 details done", then "All set. Your plans are ready.") and a `.btn-primary` "Compare plans" that stays disabled until owner age, at least one companion age and at least one activity are set.
      - A `.alert.alert-danger` "We couldn't save your details." when saving fails. A `.spinner` replaces the label while saving.
      Props: `{ initialOwnerAge: number | null; initialCompanionAges: number[]; initialRisky: boolean; busy: boolean; failed: boolean; onCompare(d: { ownerAge: number; companionAges: number[]; activities: string[] }): void }`. Validation messages follow the prototype: "Use whole numbers only, such as 34." and "Enter an age from 18 to 99.", with an inline `"x": ...` prefix for a bad companion entry.
    files:
      - apps/web/src/trips/InsuranceDetailsForm.tsx
      - apps/web/src/trips/InsuranceDetailsForm.test.tsx
    rationale: |
      Keeps parsing and state out of the already-long page component, and lets the AC1-AC4 behaviours be tested without stubbing the API.
  - description: |
      Wire the form into `InsuranceOptionsPage`. Render it above the existing result sections. `onCompare` calls, in order: `saveInsuranceDetails`, then `addTraveller(tripId, 'Companion N', age)` for each companion age not already stored (or `removeTraveller` for surplus ones), then `fetchInsuranceOptions` again, and sets the page's `result` state so the existing shortlist, disclaimer and "Compare plans" link to `/insurance-options/compare` appear (AC4). Keep the existing `missing` warning alert for destination and trip dates only. Seed the form from `fetchTrip` (`owner_age`, `risky_activities`, `travellers[].age`).
    files:
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/trips/InsuranceOptionsPage.test.tsx
    rationale: |
      The comparison (`InsuranceComparePage`, plan cards) is already built and is only gated by `options.missing`, so filling the stored details is all that is needed.
  - description: |
      Tokens-only styles for the form, added to the app stylesheet next to the existing `.field`, `.chip` and `.chipset` rules: `.fieldset`, `.activity-grid`, `.activity` (with `:has(.checkbox:checked)`), `.checklist`, `.input-row` and `.row-end`. Copy these from the prototype's own `<style>` block. They use only `--space-1`, `--space-2`, `--space-3`, `--font-size-sm`, `--size-control-md`, `--size-control-lg`, `--border-width`, `--radius-md`, `--color-border`, `--color-primary`, `--color-primary-subtle`, `--color-fg-muted`, `--color-success`. Check each class for an existing equivalent before adding it, and add `.checkbox` / `.check` only if they are absent.
    files:
      - apps/web/src/index.css
    rationale: |
      Tokens are already loaded: `apps/web/src/index.css` line 2 imports `../../../design-system/tokens.css` after `@import "tailwindcss"` on line 1, so no loader work is needed.
tests:
  - |
    AC1, in InsuranceDetailsForm.test.tsx. Written first, fails because the component does not exist.
    ```tsx
    render(<InsuranceDetailsForm {...props} />)
    fireEvent.change(screen.getByLabelText('Owner age'), { target: { value: '34' } })
    expect(screen.getByLabelText('Owner age')).toHaveValue('34')
    fireEvent.blur(screen.getByLabelText('Owner age'))
    expect(screen.queryByRole('alert')).toBeNull()
    // invalid value keeps what was typed and explains
    fireEvent.change(screen.getByLabelText('Owner age'), { target: { value: '12' } })
    fireEvent.blur(screen.getByLabelText('Owner age'))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an age from 18 to 99.')
    expect(screen.getByLabelText('Owner age')).toHaveValue('12')
    ```
  - |
    AC2, in InsuranceDetailsForm.test.tsx.
    ```tsx
    fireEvent.click(screen.getByRole('checkbox', { name: 'Skiing' }))
    expect(screen.getByRole('checkbox', { name: 'Skiing' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Scuba diving' })).not.toBeChecked()
    ```
  - |
    AC3, in InsuranceDetailsForm.test.tsx.
    ```tsx
    fireEvent.change(screen.getByLabelText('Companion ages'), { target: { value: '8, 12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add companion' }))
    expect(screen.getByLabelText('Companion ages')).toHaveValue('8, 12')
    expect(screen.getByText(/Companion 1: 8 years/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove companion 2, age 12' })).toBeInTheDocument()
    ```
    Also a bad entry test, where `'8, x'` shows an alert containing `Use whole numbers only` and adds no chips.
  - |
    AC4 (gating), in InsuranceDetailsForm.test.tsx.
    ```tsx
    const compare = screen.getByRole('button', { name: 'Compare plans' })
    expect(compare).toBeDisabled()
    // owner age and activity alone are not enough
    expect(screen.getByText('2 of 3 details done')).toBeInTheDocument()
    // add companion age, then:
    expect(compare).toBeEnabled()
    expect(screen.getByText('All set. Your plans are ready.')).toBeInTheDocument()
    ```
  - |
    AC4 (comparison reached), in InsuranceOptionsPage.test.tsx using the existing `stubApi` and `renderAt` helpers. The trip starts without details and the first `GET /trips/t1/insurance-options` returns `missing` with no plans. After the form is filled and Compare plans is clicked, the stub asserts the calls and the shortlist shows.
    ```tsx
    expect(calls(stub)).toEqual(expect.arrayContaining([
      'PUT /trips/t1', 'POST /trips/t1/travellers', 'GET /trips/t1/insurance-options',
    ]))
    const put = stub.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PUT')
    expect(JSON.parse((put?.[1] as RequestInit).body as string)).toMatchObject({ owner_age: 34, risky_activities: true })
    expect(await screen.findByRole('link', { name: 'Compare plans' })).toHaveAttribute('href', '/trips/t1/insurance-options/compare')
    ```
    Also a failure test: a 500 on the PUT shows "We couldn't save your details." and no plans.
  - |
    Existing InsuranceOptionsPage tests stay green. The one named 'asks for missing details instead of showing plans' is updated, because the page now shows the form for the age and activity items and keeps the alert only for destination and trip dates.
  - |
    Narrow run, derived from the project command: `(cd apps/web && pnpm run test -- src/trips/InsuranceDetailsForm.test.tsx src/trips/InsuranceOptionsPage.test.tsx)`. Run the full `(cd services/api && sh run-py.sh -m pytest -c pytest.ini) && (cd apps/web && pnpm run test)` last. No API tests change.
assumptions_or_open_questions:
  - |
    The design conflicts with the code on two points. (1) The prototype shows a standalone details form that opens the comparison in a right-hand `.drawer` with a Plan, Cover and Price table built from a fixture. The scope says the comparison is already built (shortlist cards and `InsuranceComparePage`), so this plan reuses that and does not build the drawer or table. Say if you want the drawer. (2) The prototype's price shown in the drawer is a client-side fixture formula, which the plan does not copy, because real prices come from `gather_insurance`.
  - |
    The API stores only a boolean `risky_activities`, not which activities. The plan sends `true` when at least one activity is ticked, and the individual selections are not persisted, so they reset to unticked on reload (the boolean seeds the form as nothing ticked, which would show Compare plans disabled until one is re-ticked). Persisting named activities needs an API and model change that is outside this item. Please confirm that is acceptable.
  - |
    A companion needs a name on the API (`TravellerFields.name` is required) but the UI collects only ages. The plan names them "Companion 1", "Companion 2" and so on. These names appear in the insurance price rows and on the Travelers tab. Please confirm, or say if the name should be collected.
  - |
    Saving changes `owner_age` or adds travellers, and the API then clears an already-picked insurance plan (`insurance = None`). The plan accepts that as correct re-quoting and does not add a confirmation. The existing `InsurancePickClearedModal` exists for a similar case, so say if it should be used here.
  - The prototype's owner age range is 18 to 99 and companion ages are 0 to 99, which is tighter than the API's 0 to 120. The plan follows the prototype.
  - The settled starter-country decision from STORY-102 does not affect this item.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  None — web UI only. It uses existing API fields and routes (`owner_age`, `risky_activities`, traveller `age`) with no schema, stored-data, setting or seed change.

  Design source: the approved prototype's "Insurance details" screen (`.page` max 40rem, `.card.stack-lg`, `.field` inputs, `.activity-grid` checkboxes, `.checklist`, `.row-end` with the `.btn-primary` Compare plans) and its "Plan comparison" screen (drawer, not built here). Per the UI guidelines there is one `.btn-primary` per section, errors say what happened and what to do next, and validation errors show on blur or Add, not while typing.

  Tokens are loaded in `apps/web/src/index.css` line 2 (`@import "../../../design-system/tokens.css"`). The page's existing `.field`, `.field-error`, `.chip`, `.chip.is-selected`, `.alert` and `.skeleton` classes are reused.

  ```mermaid
  flowchart TD
    App[App.tsx route insurance-options] --> Page[InsuranceOptionsPage.tsx]
    Page --> Form[InsuranceDetailsForm.tsx new]
    Page --> Api[trips/api.ts]
    Form --> Css[index.css]
    Page --> Plans[InsurancePlanCard.tsx]
    Page --> Compare[InsuranceComparePage.tsx]
    Api --> Routes[services/api routers/trips.py]
    classDef touched fill:#f96,color:#000
    class Page,Form,Api,Css touched
  ```
  The page is touched to host the form and refetch options. The form is new. `api.ts` gets the owner-details save and the companion age. `index.css` gets the form styles. The API router is untouched.
review_focus: |
  IN: the form, its client-side validation and `api.ts` calls. OUT: any API or data-model change, the prototype's comparison drawer and fixture pricing, and persisting named activities. Riskiest part: the save sequence in `InsuranceOptionsPage` (PUT trip, then companion create or remove, then refetch), because `PUT /trips/{id}` needs the full trip fields and silently resets a picked plan. Deliberate: activities are sent as a boolean and companions get placeholder names, both flagged in the open questions.
