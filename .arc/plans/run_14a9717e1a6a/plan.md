summary: |
  Make navigation feel smooth in the web app (apps/web only, no API change). Route changes fade and slide the page content over 250 ms, using the View Transitions API where `document.startViewTransition` exists and a CSS animation fallback otherwise; under reduced motion the slide distance is zero so it is a fade only. Inside a trip (TripDetailPage tabs) the selected-tab underline slides to the new tab and only the tab panel cross-fades while the page stays still. Neither transition moves keyboard focus or adds live regions, so focus position and screen-reader output are unchanged. This builds the approved prototype's "Trip - Itinerary", "Trip - Stays" and "My trips" screens (motion only, no new visuals).
scope:
  - description: |
      Add a route-transition module. `RouteTransition` wraps the `<Routes>` in App.tsx: it keeps `displayedLocation` state and renders `<Routes location={displayedLocation}>`. When the router location changes (pathname change only; search/hash-only changes and the first render do nothing) it:
      - sets `--route-dir` on `<main>`: `-1` for a POP navigation (`useNavigationType() === 'POP'`), else `1` (prototype: forward slides in from the right, back from the left);
      - if `supportsViewTransitions()` (`'startViewTransition' in document`): adds class `vt-active` on `document.documentElement`, calls `document.startViewTransition(() => flushSync(() => setDisplayed(location)))` and removes `vt-active` in `.finished.finally`;
      - else: `setDisplayed(location)` and adds class `route-anim` to the `<main>` content wrapper, removed on `animationend`.
      It never calls `.focus()`, never adds `aria-live`/`role=status`, and does not touch scroll or document title, so behaviour stays as today (AC7).
      Signatures:
      ```ts
      // apps/web/src/routeTransition.ts
      export const ROUTE_DURATION_MS = 250
      export function supportsViewTransitions(): boolean
      export function routeDirection(navType: NavigationType): 1 | -1
      // apps/web/src/RouteTransition.tsx
      export function RouteTransition({ children }: { children: (location: Location) => ReactNode }): JSX.Element
      ```
      App.tsx: replace the bare `<Routes>` with `<RouteTransition>{(location) => <Routes location={location}>...</Routes>}</RouteTransition>`; the Route list is unchanged. The `<main className="shell-main">` stays in App and gets `view-transition-name: route` through a class on an inner wrapper so the header does not animate (prototype: `.screen { view-transition-name: route }`, header and footer are outside it).
    files:
      - apps/web/src/routeTransition.ts
      - apps/web/src/RouteTransition.tsx
      - apps/web/src/App.tsx
    rationale: |
      Routes live in one place (App.tsx, BrowserRouter in main.tsx), so one wrapper covers every route change without editing each Link or navigate call. Matching `Routes location={displayedLocation}` is what lets the old page stay on screen until `startViewTransition` snapshots it. Only `flushSync` inside the callback makes the new DOM exist when the browser takes the "new" snapshot.
  - description: |
      Route-transition CSS in apps/web/src/index.css, taken from the prototype's `<style>` block: local `--route-duration: 250ms` (token gap: tokens.css has `--motion-duration-base` 220 ms and no 250 ms token; prototype defines it locally), `--route-shift: var(--space-4)`; `@keyframes route-in` / `route-out` with `translateX(calc(var(--route-shift) * var(--route-dir, 1)))`; `.route-anim { animation: route-in var(--route-duration) var(--motion-ease-out) both }`; `html.vt-active::view-transition-old(route)` / `::view-transition-new(route)` using those keyframes, `::view-transition-group(*)` duration `var(--route-duration)`, and `::view-transition-old(root)` / `new(root)` `animation: none` so only the content wrapper animates. Reduced motion: `@media (prefers-reduced-motion: reduce) { :root { --route-shift: 0px } }` gives fade only.
      IMPORTANT interaction: the existing blanket rule at index.css:154-157 sets `animation: none !important` on `*`, which would kill `.route-anim` and `.panel-in` under reduced motion and so remove even the fade. Change that rule to exclude the new classes (for example `*:not(.route-anim):not(.panel-in):not(.panel-ghost)`) so reduced motion keeps the fade (AC6); `::view-transition-*` pseudo-elements are not matched by `*` and need no exclusion.
      Tokens used: `--motion-ease-out`, `--space-4`; no colour or raw pixel literals except the local `--route-duration` (open question 1).
    files:
      - apps/web/src/index.css
    rationale: |
      index.css already imports design-system/tokens.css (line 2) and holds all app CSS, so motion styles go there next to the existing `.motion-move` rules (lines 143-144). Tests read the 250 ms value from this file, so the value cannot drift from AC5.
  - description: |
      Trip tabs: animated underline and panel cross-fade in TripDetailPage (the `.tabs` at TripDetailPage.tsx:246 and the `role="tabpanel"` at line 278). Extract a small `TabUnderline` hook/component and a `PanelFade` wrapper:
      ```ts
      // apps/web/src/trips/useTabIndicator.ts
      export function useTabIndicator(tablistRef: RefObject<HTMLElement | null>, selectedId: string):
        { left: number; width: number; moving: boolean }
      // apps/web/src/trips/PanelFade.tsx
      export function PanelFade({ tabKey, children }: { tabKey: string; children: ReactNode }): JSX.Element
      ```
      - Underline: add `trip-tabs` (position: relative) to the tablist and render `<span className="tab-indicator" aria-hidden="true" style={{ left, width }}/>` as its last child. The selected `.tab` has its own `border-bottom-color` set to transparent inside `.trip-tabs` so the single indicator carries the colour (prototype). Position is measured from the selected tab's `offsetLeft`/`offsetWidth` in a layout effect and on window resize; first paint sets position with no transition, later changes add `.is-moving` (transition of `left`/`width`, `var(--motion-duration-base)` and `var(--motion-ease-in-out)`).
      - Panel: `PanelFade` keeps the outgoing panel's rendered HTML as a ghost (prototype's `.panel-ghost`: absolutely positioned, `aria-hidden="true"`, `inert`, no ids, `pointer-events: none`, fades out) while the new panel fades in with `.panel-in`; the ghost is removed on `animationend` (with a timeout fallback). The existing `role="tabpanel"`, `id`, `aria-labelledby` and the tab buttons' `onClick={() => setTab(id)}` stay exactly as they are, so focus stays on the tab the user pressed and nothing is announced (AC8). No `aria-live` is added.
      - The ghost is only created when the tab key changes after mount, never on first render or on data refresh (the 30 s refetch).
      Tokens: `--color-primary`, `--border-width-strong`, `--motion-duration-base`, `--motion-ease-in-out`, `--motion-ease-out`.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/useTabIndicator.ts
      - apps/web/src/trips/PanelFade.tsx
      - apps/web/src/index.css
    rationale: |
      TripDetailPage is the in-trip tab surface the story names (Overview, Itinerary and so on) and already owns `tab` state. The prototype's key idea is that the page does not move on a tab change, only the underline and the panel, so the work is scoped to the tablist and the panel, not a route change. Reduced motion: the indicator `transition: none` and panel fade stays (a fade is allowed).
  - description: |
      Tests (written first, see `tests`): `routeTransition.test.ts`, `RouteTransition.test.tsx`, `index.css` token assertions in `motion.test.ts`, and additions to `TripDetailPage.test.tsx`.
    files:
      - apps/web/src/routeTransition.test.ts
      - apps/web/src/RouteTransition.test.tsx
      - apps/web/src/motion.test.ts
      - apps/web/src/trips/TripDetailPage.test.tsx
    rationale: |
      Test-first order: write each failing test, then the minimal code above.
tests:
  - |
    AC1 (View Transitions path): apps/web/src/RouteTransition.test.tsx. Stub `document.startViewTransition = vi.fn((cb) => { cb(); return { finished: Promise.resolve() } })`, render `<MemoryRouter initialEntries={['/saved']}><RouteTransition>{(l) => <Routes location={l}>...</Routes>}</RouteTransition></MemoryRouter>`, navigate to `/account` via a Link click, then:
    ```ts
    expect(document.startViewTransition).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Account page')).toBeInTheDocument()
    ```
    Also: the first render and a search-only change do not call it.
  - |
    AC2 (fallback path): same test with `startViewTransition` deleted from `document`:
    ```ts
    expect(supportsViewTransitions()).toBe(false)
    expect(container.querySelector('.route-anim')).not.toBeNull()
    ```
    then `fireEvent.animationEnd(...)` and `expect(container.querySelector('.route-anim')).toBeNull()`. Also assert the CSS has the keyframes: `expect(css).toMatch(/@keyframes route-in/)` and that `.route-anim` uses `route-in`.
  - |
    AC5 (250 ms): in motion.test.ts read `src/index.css` and assert:
    ```ts
    expect(css).toMatch(/--route-duration:\s*250ms/)
    expect(css).toMatch(/\.route-anim\s*\{[^}]*animation:\s*route-in var\(--route-duration\)/)
    expect(css).toMatch(/view-transition-new\(route\)[^}]*var\(--route-duration\)/)
    ```
    and in routeTransition.test.ts `expect(ROUTE_DURATION_MS).toBe(250)`. (jsdom does not run animations, so duration is asserted on the source.)
  - |
    Direction: routeTransition.test.ts
    ```ts
    expect(routeDirection('PUSH')).toBe(1)
    expect(routeDirection('POP')).toBe(-1)
    ```
  - |
    AC6 (reduced motion = fade only): in motion.test.ts assert the reduced-motion block sets the shift to zero and does not remove the fade:
    ```ts
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--route-shift:\s*0px/)
    expect(css).not.toMatch(/\*,\s*\*::before,\s*\*::after\s*\{\s*animation:\s*none !important/)
    ```
    (the blanket rule must exclude `.route-anim`, `.panel-in`, `.panel-ghost`).
  - |
    AC3 (underline): TripDetailPage.test.tsx, stub `HTMLElement.prototype.offsetLeft/offsetWidth` per tab via `Object.defineProperty`, render a loaded trip, click the Stays tab:
    ```ts
    const indicator = container.querySelector('.tab-indicator') as HTMLElement
    await user.click(screen.getByRole('tab', { name: 'Stays' }))
    expect(indicator.style.left).toBe('120px')
    expect(indicator).toHaveClass('is-moving')
    expect(indicator).toHaveAttribute('aria-hidden', 'true')
    ```
    The first render has no `is-moving` class.
  - |
    AC4 (panel cross-fade): same file, after clicking a different tab:
    ```ts
    expect(container.querySelector('.panel-ghost')).not.toBeNull()
    expect(container.querySelector('.panel-ghost')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.panel-ghost')).toHaveAttribute('inert')
    expect(screen.getByRole('tabpanel')).toHaveClass('panel-in')
    fireEvent.animationEnd(screen.getByRole('tabpanel'))
    expect(container.querySelector('.panel-ghost')).toBeNull()
    ```
    and the ghost has no `id` attributes (no duplicate ids).
  - |
    AC7 (route focus and announcements unchanged): RouteTransition.test.tsx. Focus a nav Link, navigate, then
    ```ts
    expect(document.activeElement).toBe(linkBeforeNavigation)
    expect(container.querySelector('[aria-live],[role="status"],[role="alert"]')).toBeNull()
    ```
    Both with and without `startViewTransition`. (Keyboard activation of a Link is the same click handler, so the same path.)
  - |
    AC8 (tab focus and announcements unchanged): TripDetailPage.test.tsx. Focus the Stays tab, press Enter via `user.keyboard('{Enter}')`, then:
    ```ts
    expect(screen.getByRole('tab', { name: 'Stays' })).toHaveFocus()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-stays')
    expect(container.querySelectorAll('.tab-indicator [aria-live], .panel-ghost [role="tabpanel"]')).toHaveLength(0)
    ```
    plus: the number of `aria-live` regions before and after a tab switch is equal.
  - |
    Regression: existing AppHeader.test.tsx, TripDetailPage.test.tsx and all route tests still pass with `RouteTransition` in place (jsdom has no `startViewTransition`, so they take the fallback path). Narrow command:
    `(cd apps/web && pnpm exec vitest run src/RouteTransition.test.tsx src/routeTransition.test.ts src/motion.test.ts src/trips/TripDetailPage.test.tsx)`
assumptions_or_open_questions:
  - |
    Token gap: the prototype itself notes tokens.css has no 250 ms route duration (`--motion-duration-base` is 220 ms), so `--route-duration: 250ms` is defined locally in index.css, as in the prototype. Should a `motion-duration-route` token be added to design-system/tokens.json instead? This plan does not edit design-system/.
  - |
    Prototype conflict: the prototype's tabs are Itinerary, Stays and Budget (with Budget unavailable) while the real TripDetailPage tabs come from the `TABS` list (Itinerary, Stays and others such as Recommendations). The plan animates whatever TABS holds and does not change tab names. The prototype's "Preview settings" card and its VT/CSS/slow-motion switches are a reviewer aid and are explicitly NOT built.
  - |
    Prototype detail not copied: the prototype's reduced-motion switch sets `data-reduced` on html; production uses the real `prefers-reduced-motion` media query only. Slow-motion x4 is also reviewer-only.
  - |
    Scope limit: only the trip page tabs (TripDetailPage) get the underline and panel cross-fade. Other tablists (ShortlistsPage, CostsPage, RestaurantShortlistPage, ViewToggle, TravelSearchPage, AddActivityDrawer) are not changed, since the story says "in a trip, tabs". If the reviewer wants them included, `useTabIndicator` and `PanelFade` are reusable.
  - |
    The `Routes location={displayedLocation}` pattern means components that call `useLocation()` below RouteTransition (RequireAuth, SignInPage, useSavedPlaces) still see the router's real location, while route matching lags by one view-transition callback. I believe this is harmless since it is the same tick, but it should be confirmed by the existing RequireAuth tests.
  - |
    The installed react-router is ^7.18.4 and BrowserRouter is used, not a data router. I did not rely on `viewTransition` props of Link/navigate (they depend on router mode); the wrapper approach is router-mode independent. I did not read the installed react-router source to verify this.
  - |
    Real-browser verification (Chromium view-transition snapshots, Firefox fallback) is not possible in vitest/jsdom. Optional: one Playwright e2e under the existing playwright setup, not scheduled here unless the reviewer asks.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  None — front-end motion and CSS only; no stored data, migrations, settings, env vars, or provisioning. Safe to roll back by reverting the commit.

  ### Design source
  Read from the approved prototype: `.screen { view-transition-name: route }`, `route-in`/`route-out` keyframes with `--route-shift: var(--space-4)` (0px under reduced motion), `--route-duration: 250ms`, `html.vt-active::view-transition-*` rules, `.trip-tabs` with a single `.tab-indicator` (height `--border-width-strong`, colour `--color-primary`, left/width transitioned with `--motion-ease-in-out`), `.panel-in` / `.panel-ghost` fade with `--tab-duration` = `--motion-duration-base`, ghost is `aria-hidden` and `inert`, and the note "Nothing moves focus or adds live regions (AC 7, 8)". Components reused by name: existing `.tabs`/`.tab` classes; ImageFrame and OptionCard are untouched.

  ### How tokens load
  apps/web/src/index.css line 2 `@import "../../../design-system/tokens.css";` (Tailwind v4 via line 1). main.tsx line 6 imports index.css. Existing motion tokens/helper: apps/web/src/motion.ts (`MOTION`, `prefersReducedMotion`) and `.motion-move` at index.css:143. Note tokens.css exports `--duration-fast` / `--duration-spin` as "[object Object]", already overridden at index.css:5-8.

  ### Shape
  ```mermaid
  flowchart TD
    Main[main.tsx BrowserRouter] --> App[App.tsx]
    App --> RT[RouteTransition.tsx]
    RT --> RTU[routeTransition.ts]
    RT --> Routes[react-router Routes]
    Routes --> TDP[TripDetailPage.tsx]
    TDP --> UTI[useTabIndicator.ts]
    TDP --> PF[PanelFade.tsx]
    CSS[index.css]
    RT -.styles.-> CSS
    TDP -.styles.-> CSS
    classDef touched fill:#f96,color:#000
    class App,RT,RTU,TDP,UTI,PF,CSS touched
  ```
  App.tsx: mounts the wrapper around its Routes. RouteTransition/routeTransition: new, the View Transitions vs CSS decision. TripDetailPage, useTabIndicator, PanelFade: trip tab underline and cross-fade. index.css: keyframes, view-transition pseudo rules, reduced-motion exemption.
review_focus: |
  IN: route fade+slide (250 ms, View Transitions with CSS fallback, fade-only under reduced motion) via one wrapper around App's Routes, and the underline plus panel cross-fade on TripDetailPage tabs only. OUT: other tablists, the prototype's reviewer-only "Preview settings" card, any new tokens in design-system/, API/data changes. Riskiest parts: the `Routes location={displayedLocation}` + `flushSync` pattern (stale-location bugs, double render) and the blanket reduced-motion rule at index.css:154 that would silently delete the fade unless the new classes are excluded. Deliberate: 250 ms is a local `--route-duration` because no token exists; focus and live regions are intentionally untouched (AC7/8), the panel ghost is `aria-hidden` and `inert` so it never reaches screen readers.
