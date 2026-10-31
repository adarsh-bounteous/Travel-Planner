summary: |
  Add the micro-interactions from the approved prototype (Flights, Trip summary drawer, Confirm booking modal, Saved toast and Booked screens) to the existing web app, without changing any visible copy or test id. Most of the work is CSS in apps/web/src/index.css, built on the motion tokens already loaded from design-system/tokens.css and the reduced-motion block added by STORY-120. The prototype's --mi-* variables collapse to no movement under prefers-reduced-motion, so only opacity fades remain. A few small React changes are needed: Overlay and Toast get an exit phase, the save control gets a pop only when saving, a CountUp for the trip total, an animated route line and check on flight cards, and a progress bar shown while a pick is saved.
scope:
  - description: |
      Motion variables and button/card feedback in CSS. Add the prototype's --mi-* block in a :root rule (--mi-lift, --mi-press, --mi-hover-nudge, --mi-pop-peak, --mi-shift, --mi-drawer-from, --mi-modal-from, --mi-bar-from, --mi-route-from, --mi-route-line-from, --mi-shimmer-from/to, --mi-check-from) and the same values zeroed in the existing prefers-reduced-motion block. Replace `.btn` transition with transform and opacity only; add `.btn:hover` (translateY --mi-hover-nudge) and `.btn:active` (scale --mi-press, opacity 0.85 as in prototype); keep the explicit focus-visible rule so the ring is identical on hover/active. Add `.lift` hover rule with the shadow on a ::before pseudo-element (opacity only) and apply `lift` to `.option-card` and PlaceCard's `.card`.
      Tokens: --motion-duration-fast/base, --motion-ease-out, --space-1, --space-2, --space-3, --color-overlay, --color-focus, --border-width-strong.
    files:
      - apps/web/src/index.css
    rationale: |
      Covers AC1-5, 16, 17. Reuses the motion tokens and keeps the single reduced-motion block from STORY-120. The existing reduced-motion rule forces transition-property to opacity for everything, which already satisfies AC1 for transitions; the --mi-* zeroing covers keyframes that are exempt or re-enabled.
  - description: |
      Save pop. Wrap the HeartIcon in PlaceCard in a span that gets class `pop` only on the false-to-true transition of `saved` (track the previous value in a ref; unsaving and first render never pop). Add `.pop .icon` with a `mi-pop` keyframe (scale and opacity only). Button label, aria-pressed and aria-label stay exactly as they are.
    files:
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/index.css
    rationale: |
      AC6, AC7. The prototype's heart is an icon button, but the app's Save control is a labelled button with a HeartIcon; the pop goes on the icon so copy and ids are untouched.
  - description: |
      Overlay and toast enter/exit. In Overlay.tsx add an exit phase: `onClose` is deferred until the leave animation ends (animationend, with a timeout fallback of --motion-duration-fast and immediate close when prefersReducedMotion() is true and no animation runs). Add classes `is-entering` / `is-leaving` on backdrop and panel, with the prototype's mi-scrim, mi-drawer and mi-modal keyframes (transform and opacity only). Toast.tsx: keep the 4000 ms timer, but set a `leaving` state first, then hide on animationend; add mi-toast-in/out. Focus return in Overlay's cleanup must still run on unmount.
      Signature change in Overlay: unchanged props; internally `const [leaving, setLeaving] = useState(false); const close = () => setLeaving(true)`; on animationend of the panel call the original onClose.
    files:
      - apps/web/src/trips/Overlay.tsx
      - apps/web/src/trips/Toast.tsx
      - apps/web/src/index.css
    rationale: |
      AC8, AC9. Every drawer and modal in the app goes through Overlay, so one change covers them all. Existing tests that click Close and expect the dialog gone immediately need an animationend or fake-timer step; reduced-motion path closes at once.
  - description: |
      Skeleton shimmer. Add `position: relative; overflow: hidden` to `.skeleton` and a `::after` sweep (mi-shimmer keyframe, translateX plus opacity). Remove the old opacity pulse animation so there is one animation per skeleton. Applies to every existing `.skeleton` usage with no markup change.
    files:
      - apps/web/src/index.css
    rationale: |
      AC10, AC16. Pure CSS; skeletons stay `span.skeleton` so existing queries still match.
  - description: |
      Pick progress and check. New small components: ProgressBar (a decorative `.progress` + `.progress-fill`, aria-hidden, with `is-running` class replayed per pick) and CheckPop (wraps the existing CheckIcon with `check-badge is-playing`). In FlightShortlistPage render ProgressBar above the list and run it from the moment `pick` starts until it resolves (pending state); keep the existing status text. In FlightShortlistCard the Picked state already shows CheckIcon, so wrap it in CheckPop so it plays when picked flips to true. Reuse OptionCard (add a `lift` class there) rather than a new card.
    files:
      - apps/web/src/components/ProgressBar.tsx
      - apps/web/src/components/CheckPop.tsx
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/trips/FlightShortlistCard.tsx
      - apps/web/src/components/OptionCard.tsx
      - apps/web/src/index.css
    rationale: |
      AC11, AC13, AC4/5 on flight cards. The prototype puts the bar under the title and fills it for about 400 ms (mi-bar).
  - description: |
      Trip total count-up. New hook/component CountUp in apps/web/src/components/CountUp.tsx: `CountUp({ value, format }: { value: number; format: (n: number) => string })` renders `format(shown)`; ease-out cubic over 900 ms with requestAnimationFrame from 0 to `value` on first load and when `value` changes; under prefersReducedMotion() it renders the final value at once and fades with opacity. Use it for the h2 in TripTotalCard with `formatMoney`. The h2 keeps aria-live=polite but announces only the final value (set aria-label or render the final text in an sr-only span with the animated one aria-hidden) so existing text queries see the final total.
    files:
      - apps/web/src/components/CountUp.tsx
      - apps/web/src/trips/TripTotalCard.tsx
    rationale: |
      AC12, AC1. Count-up changes text, not CSS properties, so AC16 is unaffected. Final value must be in the DOM synchronously for existing tests.
  - description: |
      Animated route line. New RouteLine component (decorative, aria-hidden) with `.route-line` drawing via mi-line (scaleX) and a plane glyph via mi-plane (translateX and opacity). Render it inside FlightShortlistCard through OptionCard's `children` slot so it plays when the card renders. No airport code text is added.
    files:
      - apps/web/src/components/RouteLine.tsx
      - apps/web/src/trips/FlightShortlistCard.tsx
      - apps/web/src/index.css
    rationale: |
      AC15. The prototype shows origin and destination codes beside the line; those would be new visible copy and conflict with AC19, so only the line and plane are built (see open questions).
  - description: |
      Guard tests for the cross-cutting ACs: a CSS test that parses index.css keyframes and transition declarations for allowed properties, and a test that every existing data-testid is still present (snapshot of the id list taken from the current source).
    files:
      - apps/web/src/microInteractions.test.ts
    rationale: |
      AC16, AC17, AC18, AC19. Follows the existing designSystem.test.ts style of asserting against index.css text.
tests:
  - |
    AC1 (apps/web/src/microInteractions.test.ts) - the reduced-motion block zeroes every movement variable:
    ```ts
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)![0]
    for (const v of ['--mi-lift: 0px', '--mi-press: 1', '--mi-pop-peak: 1', '--mi-shift: 0px', '--mi-drawer-from: 0%', '--mi-modal-from: 1', '--mi-check-from: 1'])
      expect(block).toContain(v)
    ```
  - |
    AC2/AC3 (same file) - buttons have hover and press rules:
    ```ts
    expect(css).toMatch(/\.btn:hover\s*\{[^}]*transform:\s*translateY\(var\(--mi-hover-nudge\)\)/)
    expect(css).toMatch(/\.btn:active\s*\{[^}]*transform:\s*scale\(var\(--mi-press\)\)/)
    ```
  - |
    AC4/AC5 (same file) - cards lift on hover and rest without it:
    ```ts
    expect(css).toMatch(/\.lift:hover\s*\{[^}]*translateY\(var\(--mi-lift\)\)/)
    expect(css).not.toMatch(/\.lift\s*\{[^}]*transform:\s*translateY/)
    ```
    plus OptionCard.test.tsx: `expect(screen.getByRole('article')).toHaveClass('lift')`.
  - |
    AC6/AC7 (PlaceCard.test.tsx) - pop only when saving:
    ```tsx
    const { container, rerender } = render(<PlaceCard place={p} saved={false} onToggleSave={fn} />)
    rerender(<PlaceCard place={p} saved onToggleSave={fn} />)
    expect(container.querySelector('.pop')).not.toBeNull()
    rerender(<PlaceCard place={p} saved={false} onToggleSave={fn} />)
    expect(container.querySelector('.pop')).toBeNull()
    ```
    and a first render with saved=true has no `.pop`.
  - |
    AC8 (new Overlay.test.tsx, Toast.test.tsx) - entering class on open:
    ```tsx
    render(<Overlay kind="drawer" labelledBy="t" onClose={fn}><h2 id="t">x</h2></Overlay>)
    expect(screen.getByRole('dialog')).toHaveClass('is-entering')
    ```
  - |
    AC9 (same files) - exit plays before onClose runs:
    ```tsx
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toHaveClass('is-leaving')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.animationEnd(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
    ```
    Toast: after the dismiss click the toast has `is-leaving`, then is removed on animationEnd.
  - |
    AC10 (microInteractions.test.ts) - skeleton has a shimmer:
    ```ts
    expect(css).toMatch(/\.skeleton::after\s*\{[^}]*animation:\s*mi-shimmer/)
    ```
  - |
    AC11 (FlightShortlistPage.test.tsx) - progress shows while a pick is pending and the pick still works:
    ```tsx
    await user.click(screen.getByRole('button', { name: 'Pick' }))
    expect(container.querySelector('.progress-fill')).toHaveClass('is-running')
    ```
  - |
    AC12 (CountUp.test.tsx, TripTotalCard.test.tsx) - counts up with fake timers, final value rendered, and immediate under reduced motion:
    ```tsx
    vi.useFakeTimers()
    render(<CountUp value={1240} format={(n) => `${n}`} />)
    expect(Number(screen.getByTestId('count').textContent)).toBeLessThan(1240)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.getByTestId('count')).toHaveTextContent('1240')
    ```
    The testid here belongs to the test's own wrapper, not to production markup. Reduced motion: stub matchMedia as motion.test.ts does and assert the final value on first render.
  - |
    AC13 (FlightShortlistCard.test.tsx) - check animation on the chosen option only:
    ```tsx
    render(<FlightShortlistCard item={item} tripCurrency="GBP" picked onPick={fn} />)
    expect(container.querySelector('.check-badge.is-playing')).not.toBeNull()
    ```
    and picked=false renders none.
  - |
    AC14 (CheckPop.test.tsx) - the CheckPop used for a booked item carries the playing class; the wiring point is an open question below.
    ```tsx
    expect(render(<CheckPop />).container.firstChild).toHaveClass('check-badge', 'is-playing')
    ```
  - |
    AC15 (FlightShortlistCard.test.tsx) - route line rendered on the card:
    ```tsx
    expect(container.querySelector('.route .route-line')).not.toBeNull()
    expect(container.querySelector('.route')).toHaveAttribute('aria-hidden', 'true')
    ```
  - |
    AC16 (microInteractions.test.ts) - every mi-* keyframe and every `transition-property` or `transition:` in the new rules uses only transform and opacity:
    ```ts
    for (const body of keyframeBodies(css, /^mi-/)) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
      expect(props.every((p) => ['transform', 'opacity'].includes(p))).toBe(true)
    }
    ```
    keyframeBodies is a small local helper in the test.
  - |
    AC17 (microInteractions.test.ts) - the focus ring rule is not overridden in hover or active states:
    ```ts
    expect(css).toMatch(/\.btn:focus-visible[^{]*\{[^}]*outline:\s*var\(--border-width-strong\) solid var\(--color-focus\)/)
    expect(css).not.toMatch(/:focus-visible:(hover|active)\s*\{[^}]*outline:\s*none/)
    ```
  - |
    AC18 (microInteractions.test.ts plus the whole existing suite) - the existing component and page tests are the regression net, and a fixed list of the ids found today (git grep of data-testid in apps/web/src, excluding tests) is asserted against the source:
    ```ts
    for (const id of EXISTING_TEST_IDS) expect(sourceText).toContain(`data-testid="${id}"`)
    ```
    Run narrowly: `cd apps/web && pnpm run test src/microInteractions.test.ts`.
  - |
    AC19 - existing page tests that assert visible copy (FlightShortlistPage, TripTotalCard, PlaceCard, Toast users) must pass unchanged; new tests assert the new decorative elements have no text:
    ```tsx
    expect(container.querySelector('.route')).toHaveTextContent('')
    ```
assumptions_or_open_questions:
  - |
    AC14 "booking completes" has no in-app event today. BookTripDrawer only lists links that open the provider's site, and its copy says the app does not confirm bookings. The plan builds CheckPop and the booked-status wiring point, but needs a decision: (a) animate the check on whichever booked-status element exists (please name it), or (b) treat AC14 as not yet reachable and cover it with the component test only.
  - |
    The prototype shows airport codes (JFK, MIA) on each side of the route line. ShortlistFlight has no per-card codes and adding visible text conflicts with AC19, so the route line is decorative with no codes. The prototype has a standalone heart icon button on flight cards, which the app does not have; the plan keeps PlaceCard's labelled Save button and pops its icon. Flag if the reviewer wants a new icon-only heart on flight cards (new copy and a new control).
  - |
    The prototype's Booked screen (big check plus 'Trip booked' toast), its Confirm booking modal and its Trip summary drawer have no counterpart pages in the app (the app has the Book trip drawer only). They are used as visual references for the animations, not built as new screens.
  - |
    The prototype skeleton shimmer replaces the existing opacity pulse. Elements that animate opacity from a shimmer pseudo-element keep the pulse off; confirm this is acceptable.
  - |
    Prototype values not covered by a token: opacity 0.85 on button press, 0.15 shadow opacity on lift, 0.8 shimmer peak, 900 ms count-up duration, 650 ms pick progress. They come from the prototype and are kept as local custom properties in the --mi-* block rather than new tokens.
  - |
    tokens.css exports --duration-fast and --duration-spin as "[object Object]"; index.css already overrides them at lines 4-8, so the new rules use --motion-duration-* only.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — front-end styling and component changes only, with no stored data, schema, settings or provisioning. Safe to roll back by reverting the commit.

  ### How the design tokens load

  apps/web/src/index.css line 2 imports `../../../design-system/tokens.css` after `@import "tailwindcss"` on line 1; main.tsx loads index.css. The motion tokens (--motion-duration-fast/base/slow, --motion-ease-out/in-out, --motion-distance) are defined in design-system/tokens.css and mirrored in apps/web/src/motion.ts. No new loading step is needed.

  ### What the design shows

  Read from the prototype: Flights screen (title, progress bar, `.card.lift` flight cards with route line, heart and Choose, skeleton card, Trip total tile), Trip summary drawer, Confirm booking modal, Saved toast, Booked screen. Motion rules: every keyframe touches only transform and opacity; distances live in --mi-* variables that collapse under prefers-reduced-motion. The prototype's review-only "Prototype controls" strip and `html.rm` switch are not built.

  ### Existing behaviour to preserve

  - index.css already has a reduced-motion block (STORY-120) that disables animations except `.route-anim`, `.panel-in` and `.panel-ghost`, and forces transitions to opacity. New keyframe classes must either rely on the zeroed --mi-* values or be added to that exemption list so the opacity fade still shows.
  - Overlay.tsx is the single drawer/modal implementation; Toast.tsx the single toast.

  ```mermaid
  flowchart TD
    css[index.css]:::touched
    ov[Overlay.tsx]:::touched
    toast[Toast.tsx]:::touched
    pc[PlaceCard.tsx]:::touched
    oc[OptionCard.tsx]:::touched
    fc[FlightShortlistCard.tsx]:::touched
    fp[FlightShortlistPage.tsx]:::touched
    tt[TripTotalCard.tsx]:::touched
    rl[RouteLine, CheckPop, ProgressBar, CountUp]:::touched
    btd[BookTripDrawer.tsx]
    fp --> fc --> oc
    fc --> rl
    fp --> rl
    tt --> rl
    btd --> ov
    css -. styles .-> ov
    css -. styles .-> toast
    css -. styles .-> pc
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN: CSS micro-interactions, Overlay/Toast exit phase, save pop, count-up, route line, check and pick progress on flight cards. OUT: new screens from the prototype (summary drawer, confirm modal, Booked page), any copy or test-id change, new tokens. Riskiest: the deferred onClose in Overlay (existing tests, focus return, double-close) and the count-up keeping the final total in the DOM for existing assertions. Deliberate: the route line carries no airport codes, and AC14 is pending a decision because the app has no in-app booking completion.
