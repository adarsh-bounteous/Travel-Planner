summary: |
  Add to trip already shows a "Place added" success toast on a successful add (apps/web/src/places/AddToTrip.tsx renders the shared Toast with message="Place added", covered by AddToTrip.test.tsx). The gap against the item and its approved prototype is the failure path: today a failed add (or an already-on-trip refusal) renders an inline .alert, not an error toast (AC3). This plan keeps the success toast as is (AC1, AC2), adds an error variant to the shared Toast (role=alert, danger left edge, alert icon, dismiss button, 6s timeout) as the prototype shows, and routes add failures through it (AC3) while guaranteeing the success toast is never rendered on failure (AC4). Test first, web app only.
scope:
  - description: |
      Extend the shared Toast with an error tone and a dismiss button, backwards compatible so every other Toast caller renders exactly as before.

      ```tsx
      type ToastProps = {
        message: string | null
        undo?: () => void
        action?: { label: string; onAction: () => void }
        /** 'error' = role="alert", alert icon, danger left edge. Default is the success confirmation. */
        tone?: 'success' | 'error'
        /** Shows a Dismiss button (X icon) that hides the toast at once. */
        dismissible?: boolean
        /** Auto-hide delay in ms; defaults to TOAST_MS (4000). */
        ms?: number
      }
      ```

      Outer wrapper gets `role={tone === 'error' ? 'alert' : 'status'}`; the inner div adds class `toast-error` for the error tone; icon is AlertIcon for error, CheckIcon otherwise; message goes in `<span className="toast-message">`; dismiss is `<button className="toast-close" type="button" aria-label="Dismiss">` with XIcon (all from ../auth/icons).
    files:
      - apps/web/src/trips/Toast.tsx
    rationale: |
      The prototype's two toasts (place-added-toast role=status, place-error-toast role=alert with a danger edge and close button) are one component in two tones; extending the existing Toast avoids a second toast implementation. Defaults keep the existing callers unchanged.
  - description: |
      Replace the inline `.alert` messages in useAddToTrip with toasts. Merge the `message` state and the success `toast` state into one `toast` state, so a failure and a success can never both show:

      ```tsx
      type AddToast =
        | { key: number; kind: 'added'; tripId: string }
        | { key: number; kind: 'failed' | 'already' }
      ```

      - success: `<Toast key message="Place added" dismissible action={{ label: 'Open trip', ... }} />` (text and Open trip action unchanged).
      - failed: `<Toast key tone="error" dismissible ms={6000} message="We couldn't add that place. Try again." />`.
      - already on trip: same error tone, message "That place is already on this trip."
      - `onAdd` still clears the toast first, so a retry replaces the previous one.
      - `fetchTrips` failure and `addPlaceToTrip` failure both go to the 'failed' toast. Remove the two `<p role="alert" className="alert ...">` blocks.
    files:
      - apps/web/src/places/AddToTrip.tsx
    rationale: |
      AC3 and AC4: a failed add shows an error toast and never "Place added". One state value makes the exclusion structural.
  - description: |
      Add the toast variants from the prototype to the app stylesheet, tokens only. The app loads tokens through `@import "../../../design-system/tokens.css"` at apps/web/src/index.css:2, and `.toast` / `.toast.is-open` already live at index.css:98-99.

      ```css
      .toast-error { border-left: var(--space-1) solid var(--color-danger); }
      .toast-message { flex: 1; font-weight: var(--font-weight-medium); }
      .toast-close { flex: none; display: inline-flex; align-items: center; justify-content: center; min-width: var(--size-control-md); min-height: var(--size-control-md); background: transparent; border: 0; color: inherit; cursor: pointer; border-radius: var(--radius-sm); }
      .toast-close:focus-visible { outline: var(--border-width) solid var(--color-bg); outline-offset: calc(var(--border-width) * -2); }
      ```

      Tokens used: --space-1, --color-danger, --font-weight-medium, --size-control-md, --radius-sm, --border-width, --color-bg. The prototype's 200ms slide-in animation is not planned (polish outside the ACs).
    files:
      - apps/web/src/index.css
    rationale: |
      Gives the error toast its danger edge and the close button its tap target (--size-control-md) per the prototype and the UI guidelines.
tests:
  - |
    AC1 and AC2, regression guard (already green, keep it): tighten the existing 'adds straight away with one trip and confirms' test in apps/web/src/places/AddToTrip.test.tsx to pin the text inside the status region:

    ```tsx
    const toast = await screen.findByRole('status')
    expect(within(toast).getByText('Place added')).toBeInTheDocument()
    ```
  - |
    AC3 (write first, fails today because the failure is an inline alert, not a toast). New test in AddToTrip.test.tsx, POST returns 500 with one trip:

    ```tsx
    stubApi({ ...base, 'GET /trips': { status: 200, body: [lisbonTrip] }, 'POST /trips/t1/places': { status: 500 } })
    renderAt('/destinations?q=Lisbon')
    fireEvent.click(await screen.findByRole('button', { name: 'Add Alfama to trip' }))
    const toast = await screen.findByRole('alert')
    expect(toast.querySelector('.toast-error')).not.toBeNull()
    expect(toast).toHaveTextContent("We couldn't add that place. Try again.")
    expect(within(toast).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    ```
  - |
    AC4 (new test, same file): on the same failing POST, the success toast is not shown.

    ```tsx
    await screen.findByRole('alert')
    expect(screen.queryByText('Place added')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open trip' })).not.toBeInTheDocument()
    ```

    The existing 'says so when the place is already on the trip' and 'shows an error when the trips cannot be loaded' tests keep passing unchanged (they use findByRole('alert') and the same copy) and cover the 409 and GET /trips failure paths for AC3 and AC4.
  - |
    Toast unit tests, new file apps/web/src/trips/Toast.test.tsx (write first):

    ```tsx
    render(<Toast message="Boom" tone="error" dismissible />)
    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Boom')).not.toBeInTheDocument()
    ```

    plus a default-tone test (`getByRole('status')` has the message, no Dismiss button) and a fake-timers test that an error toast with `ms={6000}` is still visible at 4000ms and gone at 6000ms.
  - |
    Narrow run commands (derived from the project test command), then the full web suite as the guard that other Toast callers are unchanged:

    ```
    cd apps/web && pnpm run test -- src/trips/Toast.test.tsx src/places/AddToTrip.test.tsx
    cd apps/web && pnpm run test
    ```
assumptions_or_open_questions:
  - |
    The success path already works in the current code (Toast with message "Place added" after a successful add, tested). I found no defect that hides the message, so AC1 and AC2 get a regression-tightening test only. If the toast was seen without its text in a real browser, tell me the page and trip count, because that would be a bug I did not find.
  - |
    The prototype's error copy is "Couldn't add this place. Check your connection and try again."; the app and its tests use "We couldn't add that place. Try again." I kept the existing copy to avoid churn in passing tests. Say so if you want the prototype copy.
  - |
    The prototype also shows an "Adding…" disabled state and an "Added to trip" button label on the place page. PlaceCard already has a pending flag but the ACs cover only the toast, so I left button labels alone.
  - |
    The prototype's success toast has no "Open trip" action; the app's does, and AddToTrip.test.tsx (AC11) tests it. I kept it.
  - |
    The 409 "already on this trip" refusal is treated as "cannot be added" and becomes an error toast too (text unchanged). It was an inline warning alert before.
  - |
    The deferred decision about starter countries and places (settled on STORY-102) has no bearing on this change.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — UI feedback only, no stored data, schema, settings or provisioning. Safe to roll back by reverting the commit.

  ### Design read

  Read the approved prototype (TRAVEL-PLANNER-APP-STORY-100-design.html). Screen 1 "Place detail" (AC 1, 2): a dark `.toast` (role=status) with check icon, message "Place added" and a Dismiss X button, auto-dismiss after 4s. Screen 2 "Place detail, add failed" (AC 3, 4): `.toast.toast-error` (role=alert) with alert icon, a danger-coloured left edge of `var(--space-1)`, a Dismiss button, 6s timeout; "Place added" is never shown. Tokens load via index.css:2 (`@import "../../../design-system/tokens.css"`).

  ### Flow

  ```mermaid
  flowchart TD
    DRP[DestinationResultsPage.tsx] -->|calls hook, renders panel| ATT[AddToTrip.tsx]
    ATT -->|addPlaceToTrip, fetchTrips| API[trips/api.ts]
    ATT -->|renders success and error toast| TOAST[trips/Toast.tsx]
    TOAST -->|icons| ICONS[auth/icons.tsx]
    CSS[index.css] -.->|toast-error, toast-close styles| TOAST
    classDef touched fill:#f96,color:#000
    class ATT,TOAST,CSS touched
  ```

  AddToTrip.tsx: failures go through one toast state. Toast.tsx: new error tone and dismiss. index.css: styles for the new classes. Other Toast users (SignInPage, ProfilePage, SavedPage, TripDetailPage and more) are untouched and rely on the defaults.
review_focus: |
  IN scope: the add-to-trip toast on the places results page only (Toast.tsx error tone and dismiss, AddToTrip.tsx failure routing, index.css classes). OUT: button "Adding…"/"Added to trip" labels, slide-in animation, and any other page's toast. Riskiest part is the shared Toast: every other caller must render exactly as before, so new props are all optional and default to the old behaviour. Deliberate: the success toast path is already implemented and only gets a tighter test; the 409 already-on-trip case also becomes an error toast, and existing copy was kept over the prototype's wording.
