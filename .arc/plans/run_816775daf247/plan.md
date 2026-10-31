summary: |
  Make navigation feel smooth in the web app (comp_web_app, React 19 + react-router 7 + Tailwind/tokens). Route changes play a 250 ms fade and slide: through `document.startViewTransition` where the browser has it, through a CSS keyframe animation on the page wrapper where it does not, and fade only under `prefers-reduced-motion`. Inside a trip, the tab underline slides to the newly selected tab and the panel cross-fades (old content fades out as the new content fades in) while the page stays still. Nothing moves keyboard focus and no live region is added, so focus and screen-reader output stay as they are today (AC 7, 8). It builds the approved prototype (TRAVEL-PLANNER-APP-STORY-120-design.html) on the motion tokens that story 116 added.

scope:
  - description: |
      Add `RouteTransition`, a wrapper around `<Routes>` in App.tsx that animates every route change (all links, buttons, `navigate()` and browser back/forward) without touching individual links.

      It keeps a `shown` location in state and renders `<Routes location={shown}>`. When `useLocation()` changes it picks a direction (`POP` gives -1, otherwise 1, as in the prototype's data-dir) and then:
      - If `typeof document.startViewTransition === 'function'`: add `vt-active` to `<html>`, set `--dir`, call `document.startViewTransition(() => flushSync(() => setShown(location)))`, and remove `vt-active` in `.finished.finally`.
      - Otherwise: `setShown(location)` and re-key a plain wrapper `<div className="route-anim" style={{'--dir': dir}}>` so the CSS fallback keyframe plays. Remove the class on `animationend`.

      Signature: `export function RouteTransition({ children }: { children: (location: Location) => ReactNode }): JSX.Element` — or simply wrap `<Routes>` inside it. The implementer picks whichever keeps App.tsx smallest. The wrapper is a plain div with no role and no tabindex, and it never calls `.focus()`.
    files:
      - apps/web/src/RouteTransition.tsx
      - apps/web/src/RouteTransition.test.tsx
      - apps/web/src/App.tsx
    rationale: |
      A single seam covers all about 40 routes and every navigation source. Holding the old location until the transition callback runs is what lets View Transitions snapshot old and new DOM. `<Routes location>` feeds the held location to the matched elements through LocationContext, so RequireAuth and the pages see a consistent location.

  - description: |
      Route-transition CSS in index.css, ported from the prototype's `<style>` block (screen lines about 701-720), using tokens only:
      - Local custom properties, because no token covers 250 ms: `:root { --route-duration: 250ms; --route-shift: var(--space-4); }`, plus `@media (prefers-reduced-motion: reduce) { :root { --route-shift: 0px; } }`. Prototype distance is `--space-4` (24px), which equals `--motion-distance`. Prefer `--motion-distance` and zero it in the reduced-motion block if the implementer confirms the value matches.
      - `@keyframes route-in` (opacity 0 to 1, translateX(calc(var(--route-shift) * var(--dir, 1))) to none) and `@keyframes route-out`.
      - `.route-anim { animation: route-in var(--route-duration) var(--motion-ease-out) both; }` (the CSS fallback).
      - View Transitions: `html.vt-active ::view-transition-old(route|new(route))` run route-out and route-in. `html.vt-active::view-transition-old(root), ::view-transition-new(root) { animation: none }` so only the page content moves and the header stays still. `.route-vt { view-transition-name: route }` is applied to the wrapper only while `vt-active`.
      - Reduced motion: the existing block at about line 153 sets `animation: none !important` on `*`. That would kill the fade, which AC 6 requires to stay. Add `.route-anim, .panel-in, .panel-ghost { animation-duration: var(--route-duration) !important; animation-name: ... }`, or exclude those classes from the `*` rule with `:not()`. The result must be fade only with zero translate.
    files:
      - apps/web/src/index.css
    rationale: |
      Tokens used: --motion-ease-out, --motion-ease-in-out, --motion-duration-base, --space-4 (or --motion-distance), --border-width-strong, --color-primary. index.css is already where tokens load (line 2, `@import "../../../design-system/tokens.css"`, imported by main.tsx line 6). No new token file or import is needed.

  - description: |
      Extract the trip tab strip and panel from TripDetailPage.tsx (tablist at about lines 245-260, tabpanel at about 277-319) into `TripTabs`, which adds the underline and cross-fade. Behaviour and markup stay the same: same `role="tablist"`, `role="tab"`, ids `tab-${id}` and `panel-${id}`, `aria-selected`, `aria-controls`, `aria-labelledby`, `onClick`. The only additions are an `aria-hidden` underline span, a ghost panel and CSS classes.

      ```tsx
      export function TripTabs<T extends string>(props: {
        tabs: { id: T; label: string }[]
        active: T
        onSelect: (id: T) => void
        children: ReactNode   // the active panel's content
      }): JSX.Element
      ```

      Underline: a `<span className="tab-indicator" aria-hidden="true" />` inside the tablist. A layout effect keyed on `active` measures the selected tab's `offsetLeft` and `offsetWidth`, then sets `left` and `width`. A first render and a resize place it without a transition. A selection change adds `is-moving`, which transitions `left` and `width` over `--motion-duration-base` with `--motion-ease-in-out`. Hide the selected tab's own `border-bottom-color` (transparent) so there is one underline, as in the prototype. Under reduced motion the underline jumps (no transition), as in the prototype.

      Cross-fade: before the panel content changes, clone the current panel into a ghost (`aria-hidden="true"`, `inert`, ids and role stripped, class `panel-ghost`, positioned absolutely over the panel). The new content gets `panel-in` (fade-in). The ghost is removed on `animationend`, with a safety timeout. The page, the tablist and the focused tab are not re-mounted, so focus stays on the tab the user pressed.
    files:
      - apps/web/src/trips/TripTabs.tsx
      - apps/web/src/trips/TripTabs.test.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/index.css
    rationale: |
      TripDetailPage is the only trip page with the Overview/Itinerary/Stays/Transport/Travelers tabs. Extracting a small component gives the effect somewhere unit-testable instead of growing a very large page file. This is not a new design-system component: it holds the existing `.tabs`/`.tab` markup, and the catalogue (CompareTable, ImageFrame, OptionCard) has nothing for tabs. Tokens: --motion-duration-base, --motion-ease-in-out, --motion-ease-out, --border-width-strong, --color-primary, --space-*. The panel content for each tab (ItineraryTab, StaysSection and so on) is untouched.

tests:
  - |
    AC1, View Transitions supported (RouteTransition.test.tsx, written first, fails because the component does not exist). Stub `document.startViewTransition = vi.fn((cb) => { cb(); return { finished: Promise.resolve() } })`, render `<MemoryRouter initialEntries={['/a']}>` with RouteTransition and two routes, navigate to `/b`:
    ```ts
    expect(document.startViewTransition).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Page B')).toBeInTheDocument()
    expect(document.documentElement.classList.contains('vt-active')).toBe(false) // removed after finished
    ```
    Also assert `vt-active` is on `<html>` while the transition runs.
  - |
    AC2, fallback without View Transitions. With `startViewTransition` undefined (the jsdom default), navigating to `/b` shows Page B and the wrapper carries the animation class:
    ```ts
    expect(screen.getByText('Page B').closest('.route-anim')).not.toBeNull()
    ```
    Plus a CSS contract test in the style of designSystem.test.ts, which reads index.css:
    ```ts
    expect(css).toMatch(/\.route-anim\s*\{[^}]*animation:\s*route-in/)
    expect(css).toMatch(/@keyframes route-in[^}]*translateX/)
    ```
  - |
    AC3, underline moves (TripTabs.test.tsx). Render with 3 tabs. Stub `offsetLeft` and `offsetWidth` on HTMLElement.prototype with `vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get')`, keyed by element id. Click the second tab:
    ```ts
    const ind = container.querySelector('.tab-indicator') as HTMLElement
    expect(ind.style.left).toBe('120px')
    expect(ind.classList.contains('is-moving')).toBe(true)
    expect(ind).toHaveAttribute('aria-hidden', 'true')
    ```
  - |
    AC4, panel cross-fade. Click another tab. The old content is still in the DOM as an inert ghost while the new content is shown:
    ```ts
    const ghost = container.querySelector('.panel-ghost')!
    expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(ghost).toHaveAttribute('inert')
    expect(ghost.textContent).toContain('Itinerary content')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Stays content')
    expect(screen.getByRole('tabpanel')).toHaveClass('panel-in')
    fireEvent.animationEnd(screen.getByRole('tabpanel'))
    expect(container.querySelector('.panel-ghost')).toBeNull()
    ```
  - |
    AC5, 250 ms. A CSS contract test reads index.css and asserts `--route-duration: 250ms` (the prototype's local property, since no token covers 250 ms; see the open questions) and that `.route-anim` and the `::view-transition-*(route)` rules use `var(--route-duration)`:
    ```ts
    expect(css).toMatch(/--route-duration:\s*250ms/)
    expect(css).toMatch(/\.route-anim\s*\{[^}]*var\(--route-duration\)/)
    expect(css).toMatch(/view-transition-(old|new)\(route\)[^}]*var\(--route-duration\)/)
    ```
  - |
    AC6, reduced motion is fade only. CSS contract: inside `@media (prefers-reduced-motion: reduce)` the block sets `--route-shift: 0px` (or `--motion-distance: 0px`), and the existing `animation: none !important` on `*` does not reach `.route-anim`:
    ```ts
    expect(reducedBlock).toMatch(/--route-shift:\s*0px/)
    expect(reducedBlock).toMatch(/\.route-anim/)   // explicit exemption keeps the fade
    ```
    Also assert that the keyframes use opacity and `translateX(calc(var(--route-shift) * var(--dir, 1)))`, so a zero shift gives no slide. A browser check in Playwright (if an e2e project is configured) is optional.
  - |
    AC7, focus and announcements unchanged on route change. With `<a href>` focused or the Link clicked via keyboard, after navigation:
    ```ts
    const before = document.activeElement
    await user.keyboard('{Enter}')
    await screen.findByText('Page B')
    expect(document.activeElement).toBe(before === document.body ? document.body : document.activeElement)
    expect(document.querySelectorAll('[aria-live],[role="status"],[role="alert"]').length).toBe(liveRegionsBefore)
    expect(screen.getByText('Page B').closest('.route-anim')).not.toHaveAttribute('tabindex')
    ```
    Run it on both the fallback and the stubbed View Transitions paths. It asserts that the wrapper has no role, no tabindex and no aria-live, and that RouteTransition never calls `.focus()`.
  - |
    AC8, focus and announcements unchanged on keyboard tab change. Focus the selected tab, press ArrowRight or Tab then Enter or Space on the next tab (the existing click-activated behaviour is kept):
    ```ts
    const stays = screen.getByRole('tab', { name: 'Stays' })
    stays.focus(); await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(stays)
    expect(container.querySelectorAll('[aria-live],[role="status"]').length).toBe(liveBefore)
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1) // the ghost is aria-hidden and has no role
    expect(stays).toHaveAttribute('aria-selected', 'true')
    ```
  - |
    Regression. The existing TripDetailPage, App and AppHeader tests must pass unchanged. Narrow commands: `(cd apps/web && pnpm run test -- src/RouteTransition.test.tsx src/trips/TripTabs.test.tsx src/trips src/App)` and then the full `(cd services/api && sh run-py.sh -m pytest -c pytest.ini) && (cd apps/web && pnpm run test)`.

assumptions_or_open_questions:
  - |
    Token gap, as the prototype notes: there is no 250 ms token (`--motion-duration-base` is 220 ms and AC 5 says 250 ms). The plan adds a local `--route-duration: 250ms` in index.css, exactly like the prototype. Reviewer: do you want a `--motion-duration-route` token added to design-system/tokens.css and tokens.json instead? That is a design-system change outside this story.
  - |
    Prototype and existing CSS conflict. index.css (about line 153) sets `animation: none !important` on everything under reduced motion. Left alone, AC 6 would play no fade at all. The plan exempts the transition classes, which is the prototype's behaviour (fade only, no slide).
  - |
    Scope of tabs: the trip tabs are TripDetailPage's tablist (Overview, Itinerary, Stays, Transport, Travelers, Recommendations). The prototype shows Itinerary, Stays and a disabled Budget. The other `role="tab"` strips (CostsPage, ShortlistsPage, RestaurantShortlistPage, TravelSearchPage, ViewToggle, AddActivityDrawer) are left alone. They are not trip tabs and have no AC. Say so if any should be included.
  - |
    Routing approach: holding `shown` location and passing it to `<Routes location>` assumes children that call `useLocation()` still get a usable location. React Router's `useRoutes` wraps matched elements in a LocationContext for the passed location, so that should hold. The implementer should verify with RequireAuth, and if it misbehaves, fall back to a `navigate`/Link `viewTransition` wrapper.
  - |
    The prototype's reviewer-aid "Preview settings" card, the 4x slow-motion toggle and the screen-switching reviewer bar are prototype tooling, not product UI, and are not built.
  - |
    Not part of this plan: loading-skeleton or modal and drawer animations, page-specific entrance animations, and changes to routes or auth.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout
  None — front-end motion and CSS only, with no stored data, schema, setting, env var or provisioning. Rollback is a plain revert. Browsers without View Transitions, and older stored state, are unaffected because the CSS fallback applies.

  ### Design source and tokens
  Read the prototype (`TRAVEL-PLANNER-APP-STORY-120-design.html`): the screens are "My trips" (title, `.grid` of `.card.trip-card` with ImageFrame image and a `.btn-primary` "Open trip"), "Trip - Itinerary" (breadcrumbs, h1, `.tabs.trip-tabs` with a single sliding `.tab-indicator`, `.stack` of day `.card`s) and "Trip - Stays" (the same, with a `.grid` of stay `.card`s). The motion is the design: route 250 ms fade and slide with direction `--dir` (+1 forward, -1 back via breadcrumb), tab change underline slide plus panel-only cross-fade of `--motion-duration-base` using `--motion-ease-in-out` for the underline and `--motion-ease-out` for the fades. Colours and spacing are tokens only: the underline is `--color-primary` at `--border-width-strong`.

  Tokens load today through `apps/web/src/index.css` line 2 (`@import "../../../design-system/tokens.css"`), imported in `apps/web/src/main.tsx` line 6; `apps/web/src/motion.ts` already exposes `MOTION` and `prefersReducedMotion`. Nothing new to load. The existing `.tabs`, `.tab` and reduced-motion rules are in index.css (about lines 121-132, 152-156).

  ### Shape

  ```mermaid
  flowchart TD
    main[main.tsx BrowserRouter] --> App[App.tsx]
    App --> AppHeader[AppHeader.tsx]
    App --> RT[RouteTransition.tsx NEW]
    RT --> Routes[react-router Routes]
    Routes --> TDP[trips/TripDetailPage.tsx]
    TDP --> TT[trips/TripTabs.tsx NEW]
    TT --> Tabs[ItineraryTab, StaysSection, TravelersTab ...]
    CSS[index.css] -.-> RT
    CSS -.-> TT
    classDef touched fill:#f96,color:#000
    class App,RT,TDP,TT,CSS touched
  ```

  Touched nodes: App.tsx wraps Routes (the single seam for all route changes); RouteTransition and TripTabs are new; TripDetailPage swaps its inline tablist and tabpanel for TripTabs; index.css holds keyframes, VT pseudo-element rules and the reduced-motion exemption.

  ### Testing note
  jsdom has neither `startViewTransition` nor layout, so the tests stub `document.startViewTransition` and the `offsetLeft`/`offsetWidth` getters, and assert behaviour (calls, classes, focus, live regions) plus CSS-text contracts, in the style of the existing designSystem.test.ts and motion.test.ts.

review_focus: |
  IN: route fade and slide (View Transitions plus the CSS fallback) through one RouteTransition wrapper, and the trip tab underline and panel cross-fade in TripDetailPage via an extracted TripTabs. OUT: other `role="tab"` strips, new tokens, and any design-system change. Riskiest areas: the held-location approach with `<Routes location>` (it interacts with RequireAuth and with a browser back button during a transition), and the global `animation: none !important` reduced-motion rule, which must be exempted so the fade survives. Deliberate: the 250 ms value is a local custom property because no token covers it, and the old panel is shown as an `aria-hidden`, `inert` ghost so focus and announcements are unchanged (AC 7, 8).
