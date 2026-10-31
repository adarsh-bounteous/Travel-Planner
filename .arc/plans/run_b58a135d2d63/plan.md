summary: |
  Add the micro-interactions from the approved prototype to the existing web app (comp_web_app, React + Vite + Tailwind entry stylesheet, vitest) as presentation-only changes: button hover and press, card lift, heart pop on save only, toast, drawer and modal enter and exit, skeleton shimmer, a progress bar when picking an option, a count-up on the trip total, a check animation on a picked flight and on a completed booking, and an animated route line on flight cards. Every keyframe touches only transform and opacity, every distance is a `--mi-*` custom property that collapses to 0 or 1 under `prefers-reduced-motion` so only opacity fades remain, focus rings are untouched, and no `data-testid`, `aria-label` or visible copy changes. No API, data or dependency changes.
scope:
  - description: |
      Motion variables and keyframes in the entry stylesheet. Add the `--mi-*` block from the prototype `:root` (`--mi-lift`, `--mi-press`, `--mi-hover-nudge`, `--mi-pop-peak`, `--mi-shift`, `--mi-drawer-from`, `--mi-modal-from`, `--mi-bar-from`, `--mi-route-from`, `--mi-route-line-from`, `--mi-shimmer-from`, `--mi-shimmer-to`, `--mi-check-from`), built from `--space-1` and `--motion-distance`. Add the `mi-*` keyframes and classes: `.lift` with the shadow on `::before` so only opacity animates, `.btn` hover and `:active` states, `.progress` and `.progress-fill`, `.route`, `.heart-pop`, `.check-badge`, `.skeleton::after` shimmer, `.is-entering` and `.is-leaving` for `.backdrop`, `.modal`, `.drawer` and `.toast`.
      Replace the `.btn` rule `transition: background var(--duration-fast)` with `transition: transform ..., opacity ...` (a background transition would break AC16; the hover fill still changes, instantly). Keep the `:focus-visible` selector list and add `.btn:focus-visible:hover, .btn:focus-visible:active` with the same outline so the ring is unchanged.
      Reduced motion: keep the single `@media (prefers-reduced-motion: reduce)` block (designSystem.test.ts asserts exactly one). Inside it set the `--mi-*` variables to the prototype's collapsed values (0px, 1, 0%) and replace the blanket `animation: none !important` with `animation-iteration-count: 1 !important` plus `.spinner, .skeleton::after { animation: none !important }`, so enter, exit, pop, check and route keyframes still run as pure opacity fades. Colours and sizes use tokens only (no hex, no raw px).
    files:
      - apps/web/src/index.css
    rationale: |
      index.css already imports `design-system/tokens.css` on line 2 and holds every component rule, so the new rules belong there. The existing blanket `animation: none` would delete the opacity fade AC1 requires, so that block has to change.
  - description: |
      Exit-transition helper. Add to `motion.ts` `export function useExit(onDone: () => void): { leaving: boolean; start: () => void; onAnimationEnd: () => void }`. `start()` sets `leaving` and `onAnimationEnd` calls `onDone`. A fallback timer of `--motion-duration-base` (read once as 220 via an exported `MOTION_MS` constant) guarantees `onDone` runs when no animation event fires (jsdom, `display:none`). Also add `useCountUp(target: number, durationMs = 900): number` (requestAnimationFrame, ease-out cubic, returns `target` at once when `prefersReducedMotion()` or when `matchMedia` or `requestAnimationFrame` is missing).
    files:
      - apps/web/src/motion.ts
    rationale: |
      motion.ts already holds `MOTION` and `prefersReducedMotion`, so the shared motion helpers live there.
  - description: |
      Overlay and Toast enter and exit. In `Overlay.tsx` add `is-entering` to the backdrop and panel on mount and route `onClose` (backdrop click, Escape, and the existing close buttons passed by callers) through `useExit` so `is-leaving` plays before the real `onClose` runs. The panel keeps its `ref`, `role`, `aria-*`, `inert` and focus-trap code unchanged. In `Toast.tsx` replace the immediate `setVisible(false)` with a leaving state so the toast plays `mi-toast-out` before unmounting (timeout, Undo, action and Dismiss paths). Give `GoogleNoAccountModal.tsx` the same entering and leaving classes on its backdrop and modal. The toast-slot toasts in `AccountPage.tsx` get `is-entering` only.
    files:
      - apps/web/src/trips/Overlay.tsx
      - apps/web/src/trips/Toast.tsx
      - apps/web/src/auth/GoogleNoAccountModal.tsx
      - apps/web/src/account/AccountPage.tsx
    rationale: |
      Overlay is the single drawer and modal wrapper (AddActivityDrawer, StayWarningModal and the other callers use it) and Toast is the single toast component, so two edits cover AC8 and AC9 for nearly every caller.
  - description: |
      Card lift, heart pop, route line, check, progress bar. Add the `lift` class to `OptionCard` (`card option-card lift`), to `PlaceCard`'s `li`, and to the trip cards in `MyTripsPage.tsx`. In `PlaceCard.tsx` the Save button is the heart: keep a `useRef` of the previous `saved` value and add the class `heart-pop` to the `HeartIcon` wrapper only on a false to true change after mount (never on first render with `saved` true, never when unsaving). `HeartIcon` gets an optional `className`. In `FlightShortlistCard.tsx` render a decorative `RouteLine` (new `apps/web/src/components/RouteLine.tsx`, `aria-hidden="true"`, a line span plus the existing arrow icon, no text) above the facts, and when `picked` becomes true wrap the existing `CheckIcon` in the `check-badge is-playing` class. New `apps/web/src/components/ProgressBar.tsx` (`aria-hidden`, props `running: boolean`) is rendered by `FlightShortlistPage.tsx` while `pick()` is awaiting `pickTransport`, with a visually hidden `role="status"` line is NOT added (the existing pick Toast already announces the result).
    files:
      - apps/web/src/components/OptionCard.tsx
      - apps/web/src/components/RouteLine.tsx
      - apps/web/src/components/ProgressBar.tsx
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/auth/icons.tsx
      - apps/web/src/trips/FlightShortlistCard.tsx
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/trips/MyTripsPage.tsx
    rationale: |
      OptionCard is the catalogued shared card, so lifting it covers every option list. RouteLine and ProgressBar are the two prototype components with no catalogue equivalent; both are tiny and presentational.
  - description: |
      Count-up and booked check. `TripTotalCard.tsx`: the `h2` keeps `aria-live="polite"` and the final `formatMoney(cost.total, currency)` text as the only text node once the count finishes. While counting it renders the animated value in an `aria-hidden` span and the final value in a `sr-only` span, then drops the animated span, so existing text queries still find exactly one match after completion and screen readers hear the final figure once. `StarterPlannerPage.tsx`: add the `check-badge is-big is-playing` circle (CheckIcon, `role="img"`, `aria-label="Booking complete"`) inside the existing `alert-success` block, leaving its text and the `Toast` untouched. Skeleton shimmer needs no component edits because every skeleton uses `.skeleton`.
    files:
      - apps/web/src/trips/TripTotalCard.tsx
      - apps/web/src/places/StarterPlannerPage.tsx
    rationale: |
      TripTotalCard is the one trip total component (CostsPage, TripDetailPage use it). StarterPlannerPage owns the only "Trip booked" completion today.
tests:
  - |
    AC1, reduced motion (apps/web/src/designSystem.test.ts, extend). Failing first because the block today says `animation: none !important`.
    ```ts
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(css.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1)
    expect(rm).toMatch(/--mi-lift:\s*0px/)
    expect(rm).toMatch(/--mi-press:\s*1\b/)
    expect(rm).toMatch(/--mi-shift:\s*0px/)
    expect(rm).toMatch(/--mi-pop-peak:\s*1\b/)
    expect(rm).not.toMatch(/animation: none !important;[^}]*\*, \*::before/)
    ```
    The existing assertion `expect(rm).toMatch(/animation: none !important/)` is rewritten to the new rule (`animation-iteration-count: 1`), since the blanket none removed the required fade.
  - |
    AC16, only transform and opacity (new apps/web/src/microInteractions.test.ts). Parse every `@keyframes mi-*` block and every `transition:` that mentions `.btn`, `.lift`.
    ```ts
    const frames = [...css.matchAll(/@keyframes (mi-[\w-]+)\s*\{([\s\S]*?\}\s*)\}/g)]
    expect(frames.length).toBeGreaterThanOrEqual(12)
    for (const [, name, body] of frames) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      expect(props.filter((p) => !['transform', 'opacity'].includes(p)), name).toEqual([])
    }
    expect(css).not.toMatch(/\.btn\s*\{[^}]*transition:[^;]*background/)
    ```
  - |
    AC2 and AC3, button press and hover (microInteractions.test.ts).
    ```ts
    expect(css).toMatch(/\.btn:hover\s*\{[^}]*transform: translateY\(var\(--mi-hover-nudge\)\)/)
    expect(css).toMatch(/\.btn:active\s*\{[^}]*transform: scale\(var\(--mi-press\)\)/)
    ```
  - |
    AC4 and AC5, card lift and return (microInteractions.test.ts and OptionCard.test.tsx).
    ```ts
    expect(css).toMatch(/\.lift:hover\s*\{[^}]*transform: translateY\(var\(--mi-lift\)\)/)
    expect(css).toMatch(/\.lift\s*\{[^}]*transition: transform/)   // the transition back to rest is the return
    render(<OptionCard title="Skyline" />)
    expect(screen.getByRole('article', { name: 'Skyline' })).toHaveClass('lift')
    ```
  - |
    AC6 and AC7, heart pop on save only (PlaceCard.test.tsx).
    ```tsx
    const { rerender, container } = render(<PlaceCard place={p} saved={false} onToggleSave={fn} />)
    expect(container.querySelector('.heart-pop')).toBeNull()
    rerender(<PlaceCard place={p} saved onToggleSave={fn} />)
    expect(container.querySelector('.heart-pop')).not.toBeNull()
    rerender(<PlaceCard place={p} saved={false} onToggleSave={fn} />)
    expect(container.querySelector('.heart-pop')).toBeNull()
    ```
    Also `render(<PlaceCard saved .../>)` on first render has no `.heart-pop`.
  - |
    AC8 and AC9, overlay and toast enter and exit (new Overlay.test.tsx, Toast.test.tsx).
    ```tsx
    render(<Overlay kind="drawer" labelledBy="t" onClose={onClose}><h2 id="t">T</h2></Overlay>)
    expect(screen.getByRole('dialog')).toHaveClass('is-entering')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('dialog')).toHaveClass('is-leaving')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.animationEnd(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledOnce()
    ```
    Same for `kind="modal"`. Toast: `render(<Toast message="Saved" dismissible />)`, assert `.toast` has `is-entering`, click Dismiss, assert `is-leaving`, `fireEvent.animationEnd`, assert `queryByText('Saved')` is null. A fake-timer case proves the fallback timer calls `onClose` without an animation event.
  - |
    AC10, skeleton shimmer (microInteractions.test.ts).
    ```ts
    expect(css).toMatch(/\.skeleton::after\s*\{[^}]*animation: mi-shimmer/)
    expect(css).toMatch(/@keyframes mi-shimmer[\s\S]*translateX\(var\(--mi-shimmer-from\)\)/)
    ```
  - |
    AC11, progress animation on picking (FlightShortlistPage.test.tsx, extend). Hold `pickTransport` pending with a deferred promise.
    ```tsx
    await user.click(screen.getByRole('button', { name: 'Pick' }))
    expect(container.querySelector('.progress-fill.is-running')).not.toBeNull()
    resolvePick(updatedTrip)
    await waitFor(() => expect(screen.getByText(/Picked .* Added to your trip total/)).toBeInTheDocument())
    ```
  - |
    AC12, count-up on the trip total (TripTotalCard.test.tsx and motion.test.ts). With a stubbed `requestAnimationFrame` and `performance.now`:
    ```ts
    const { result } = renderHook(() => useCountUp(1240))
    expect(result.current).toBeLessThan(1240)         // starts below the final value
    advance(1000)
    expect(result.current).toBe(1240)                 // ends exactly on it
    ```
    Under `vi.stubGlobal('matchMedia', () => ({ matches: true }))` the hook returns 1240 immediately. TripTotalCard: after the count, `expect(screen.getAllByText('1,240 EUR')).toHaveLength(1)`.
  - |
    AC13, check on the chosen flight (FlightShortlistCard.test.tsx).
    ```tsx
    render(<FlightShortlistCard item={item} tripCurrency="EUR" picked onPick={fn} />)
    expect(container.querySelector('.check-badge.is-playing')).not.toBeNull()
    ```
    and with `picked={false}` it is null.
  - |
    AC14, check on the booked item (StarterPlannerPage.test.tsx, extend). After the existing booking flow:
    ```tsx
    expect(await screen.findByRole('img', { name: 'Booking complete' })).toHaveClass('is-playing')
    ```
  - |
    AC15, route line on flight cards (FlightShortlistCard.test.tsx).
    ```tsx
    const line = container.querySelector('.route')
    expect(line).not.toBeNull()
    expect(line).toHaveAttribute('aria-hidden', 'true')
    expect(line).toHaveTextContent('')
    ```
    plus `expect(css).toMatch(/\.route\.is-playing \.route-line\s*\{[^}]*animation: mi-line/)`.
  - |
    AC17, focus ring unchanged on hover and press (microInteractions.test.ts).
    ```ts
    const ring = 'outline: var(--border-width-strong) solid var(--color-focus); outline-offset: var(--border-width-strong)'
    expect(css).toMatch(new RegExp(`\\.btn:focus-visible:hover[^{]*\\{[^}]*${escape(ring)}`))
    expect(css).toMatch(new RegExp(`\\.btn:focus-visible:active[^{]*\\{[^}]*${escape(ring)}`))
    ```
  - |
    AC18, test ids preserved (microInteractions.test.ts). A snapshot of the five existing ids, written before any change so it is green first and guards the diff.
    ```ts
    const ids = execSync(`grep -rhoE 'data-testid="[^"]+"' src --include=*.tsx --exclude=*.test.tsx`).toString().split('\n').filter(Boolean).sort()
    expect(ids).toEqual(EXPECTED_IDS)   // EXPECTED_IDS captured from the current tree
    ```
    Existing page tests (FlightShortlistPage, PlaceCard, AddActivityDrawer, Toast users) must pass unchanged.
  - |
    AC19, copy unchanged (existing tests plus RouteLine.test.tsx). The whole existing suite passes with its text queries untouched (`getByText('Picked')`, `getByText('Trip booked')`, `getByText('Saved')`). New components add no text: `expect(render(<RouteLine />).container).toHaveTextContent('')` and `ProgressBar` the same. Narrow command for each file: `cd apps/web && pnpm run test -- src/designSystem.test.ts src/microInteractions.test.ts src/motion.test.ts`, then the component test files.
assumptions_or_open_questions:
  - |
    Conflict with the prototype, route line: the prototype card shows the codes (JFK, MIA) beside the line. AC19 says visible copy must not change and the app's flight card has no such text, so the plan builds only the animated line and plane icon, decorative and aria-hidden, and leaves out the codes.
  - |
    Conflict with the prototype, "Choose", "Flight saved" and a standalone Flights screen with a heart: the app's flight control is "Pick" and flights have no heart. The plan applies the same motion to the existing "Pick" button, and the heart pop to the Save button on PlaceCard (the only save control, using HeartIcon). Nothing renames a button or adds a toast message.
  - |
    The prototype's reduced-motion switch and replay buttons are review helpers, not product UI, and are not built. The prototype's `.drawer { top: 46px }` is an artifact of its review bar and is ignored.
  - |
    The existing global reduced-motion block (`animation: none !important`) and its assertion in designSystem.test.ts are changed on purpose: they would remove the opacity fade AC1 requires. The rewritten block still keeps one `@media` block, still sets `transition-property: opacity`, and still stops the spinner and shimmer.
  - |
    Press scales the button to 0.96, so its focus outline scales with it. The outline declaration itself is identical in rest, hover and active, which is how AC17 is tested; say so if you want a stricter reading that the ring must not scale at all.
  - |
    Count-up changes the first-paint text of the trip total. The plan keeps the final figure in an sr-only span so existing queries and screen readers see it at once. Confirm that screen readers hearing only the final figure is the wanted behaviour.
  - |
    The count-up runs where TripTotalCard is used (trip Overview). The inline "Trip total" lines in TransportTab and ItineraryTab are plain text and are left alone as out of scope.
  - |
    Only 5 `data-testid` attributes exist in the app source today (PlacesMap, PlaceCover, ImageFrame, RestaurantCompare, ActivityOptionsPage), counted with Grep. The AC18 test captures them from the tree rather than hard-coding a guess.
  - |
    Playwright e2e is not extended. CSS behaviour (hover, keyframes) cannot be computed in vitest and is checked as stylesheet text, the same way designSystem.test.ts checks the current rules. A visual check against the prototype is left to the reviewer.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — presentation only (CSS and React components); no schema, stored data, seed, setting or env var changes. Rollback is a revert.

  Tokens: `apps/web/src/index.css` line 2 does `@import "../../../design-system/tokens.css"`, and lines 5 to 8 override the two `[object Object]` durations. Tokens used by name: `--motion-duration-fast`, `--motion-duration-base`, `--motion-duration-slow`, `--motion-ease-out`, `--motion-ease-in-out`, `--motion-distance`, `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--color-primary`, `--color-surface`, `--color-success`, `--color-on-primary`, `--color-focus`, `--color-bg`, `--color-overlay`, `--color-border-strong`, `--opacity-overlay`, `--border-width-strong`, `--radius-full`, `--size-control-sm`, `--size-control-lg`, `--duration-spin`. A value no token covers is the `0.85` press opacity and the `0.15` lift shadow opacity (unitless, not px or colour).

  Prototype elements read: `.lift` (card, shadow on `::before`), `.btn:hover/:active`, `.progress-fill` with `mi-bar`, `.route` with `mi-line` and `mi-plane`, `.heart.pop` with `mi-pop`, `.check-badge` with `mi-check`, `.skeleton::after` with `mi-shimmer`, `.scrim/.drawer/.modal/.toast` `is-entering` and `is-leaving`, `[data-countup]` and the `countUp()` easing, and the `:root` and `html.rm` variable blocks.

  ```mermaid
  flowchart TD
    CSS[index.css]:::touched
    MOT[motion.ts]:::touched
    OV[trips/Overlay.tsx]:::touched
    TOAST[trips/Toast.tsx]:::touched
    OC[components/OptionCard.tsx]:::touched
    PC[places/PlaceCard.tsx]:::touched
    FSC[trips/FlightShortlistCard.tsx]:::touched
    FSP[trips/FlightShortlistPage.tsx]:::touched
    TTC[trips/TripTotalCard.tsx]:::touched
    SPP[places/StarterPlannerPage.tsx]:::touched
    RL[components/RouteLine.tsx]:::touched
    PB[components/ProgressBar.tsx]:::touched
    ADD[trips/AddActivityDrawer.tsx]
    TOK[design-system/tokens.css]
    TOK --> CSS
    MOT -->|useExit, useCountUp| OV
    MOT -->|useExit| TOAST
    MOT -->|useCountUp| TTC
    OV --> ADD
    OC --> FSC
    RL --> FSC
    FSC --> FSP
    PB --> FSP
    TOAST --> FSP
    TOAST --> SPP
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN: the listed micro-interactions on existing screens only, in the web app only. OUT: new screens, copy changes, test-id changes, the prototype's review controls, API or data work. Riskiest areas are the exit animations in Overlay and Toast (the unmount must still happen when no animation event fires, and focus return plus the focus trap must not change) and the reduced-motion block rewrite, which deliberately replaces the blanket `animation: none` and changes an existing designSystem.test.ts assertion. The route line has no codes and the heart is the Save button on PlaceCard on purpose; both differ from the prototype because of AC19 and the real screens.
