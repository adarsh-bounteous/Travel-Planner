summary: |
  Replace the minimal placeholder header in `apps/web/src/AppHeader.tsx` with the approved top-bar shell: logo (opens My trips at `/`), main navigation Trips and Explore, then utility links Saved and Account, in that order, always visible at every width with no menu button. Bookings and Budget are not rendered (no screens yet). The current section's main link gets `aria-current="page"` with the primary highlight from the prototype; screens under no main section (Saved, Account, Profile) highlight no main link. The header stays on every screen via the existing `<AppHeader />` in `App.tsx`; the signed-out "Sign in" entry is kept untouched (owned by Accounts and sign-in). Explore has no screen of its own today, so a minimal `/explore` page reusing the existing `DestinationSearch` is added as the link target.
scope:
  - description: |
      Pure helper that maps a pathname to the main section it sits under, so highlighting is testable without rendering.
      ```ts
      export type MainSection = 'trips' | 'explore'
      export function mainSectionFor(pathname: string): MainSection | null
      // '/' and '/trips...'        -> 'trips'
      // '/explore', '/destinations' -> 'explore'
      // '/saved', '/account', '/profile', anything else -> null
      ```
      Also exports `MAIN_SECTIONS` (Trips `/`, Explore `/explore`). Bookings and Budget are deliberately absent, with a comment that they are added when their screens exist.
    files:
      - apps/web/src/navSections.ts
      - apps/web/src/navSections.test.ts
    rationale: |
      One place decides which section is current; keeps AppHeader declarative. Prototype: `data-nav-key` on each link, `aria-current="page"` on the current one.
  - description: |
      Rewrite `AppHeader` per the prototype header (`header.shell-header > .shell-bar`): brand link `Travel Planner` to `/`, then `<nav aria-label="Main">` with the main `<ul>` (Trips, Explore) and a utility `<ul class="shell-nav-utility">` (Saved, Account), `.shell-link` anchors. Signed in only; the signed-out `Sign in` button and the loading state are unchanged. Remove the Profile link (the AC order is Trips, Explore, Saved, Account; Profile stays reachable from the Account page button at AccountPage.tsx:210). No toggle button, no `hidden` attribute on the nav.
      ```tsx
      const { pathname } = useLocation()
      const current = mainSectionFor(pathname)
      <Link className="shell-link" to="/" aria-current={current === 'trips' ? 'page' : undefined}>Trips</Link>
      ```
      Saved and Account use `NavLink` (they self-highlight when current, as the prototype's Saved screen does).
    files:
      - apps/web/src/AppHeader.tsx
      - apps/web/src/AppHeader.test.tsx
    rationale: AC1-AC9. The nav never collapses, which is the AC10 deviation from the guideline (see notes).
  - description: |
      Header styles from the prototype's `data-arc-shell-style`, without the mobile collapse: `.shell-nav` always `display: flex; flex: 1; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2)`; `.shell-nav ul` row, `gap: var(--space-1)`, no list style; `.shell-link` min-height `--size-control-md`, padding `0 var(--space-2)`, `--color-fg`, medium weight, `--radius-md`, hover `--color-surface`; `.shell-link[aria-current="page"]` colour `--color-primary` on `--color-primary-subtle` (replaces the current underline rule at index.css:103). Remove the unused `.shell-toggle` / `.is-open` / `[hidden]` nav rules; they are not needed. At 375px the bar wraps (brand, then links) rather than hiding anything.
    files:
      - apps/web/src/index.css
    rationale: Tokens only (no hard-coded colours); `--color-primary` is used for the current selection, per the guidelines.
  - description: |
      Add the Explore target: `ExplorePage` renders `<h1>Explore</h1>` and the existing `<DestinationSearch />` (prompt "Where to next?"), and register `<Route path="/explore">` inside `<RequireAuth>` in `App.tsx`. The home page and `/destinations` are not changed.
    files:
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/explore/ExplorePage.test.tsx
      - apps/web/src/App.tsx
    rationale: AC7 needs a screen for the Explore section. The prototype's Explore screen (h1, search field with hint, interest chips) is richer; only heading plus the existing search is built here because Explore content is not part of this top-bar item.
  - description: |
      Playwright check at phone width (375px) and desktop that the header shows the four links in order and no Menu button, and that the logo and links navigate. Modelled on `account.spec.ts` (which already uses `getByRole('banner')`).
    files:
      - apps/web/e2e/app-shell.spec.ts
    rationale: jsdom cannot evaluate CSS, so AC10 at real widths needs a browser test.
tests:
  - |
    AC1, header on any screen (AppHeader.test.tsx). Check `/`, `/saved`, `/account`.
    ```tsx
    mockMe(200, { email: 'maya@example.com' })
    renderAt('/saved')
    const header = await screen.findByRole('banner')
    expect(within(header).getByRole('link', { name: 'Travel Planner' })).toBeInTheDocument()
    expect(within(header).getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    ```
  - |
    AC2, Trips and Explore shown.
    ```tsx
    const nav = within(await screen.findByRole('navigation', { name: 'Main' }))
    expect(nav.getByRole('link', { name: 'Trips' })).toHaveAttribute('href', '/')
    expect(nav.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/explore')
    ```
  - |
    AC3, Bookings and Budget not shown.
    ```tsx
    expect(screen.queryByRole('link', { name: 'Bookings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Budget' })).not.toBeInTheDocument()
    ```
  - |
    AC4, Saved and Account shown (the existing Account test stays; add Saved).
    ```tsx
    expect(within(header).getByRole('link', { name: 'Saved' })).toHaveAttribute('href', '/saved')
    expect(within(header).getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
    ```
  - |
    AC5, order, and Profile no longer in the header.
    ```tsx
    const names = within(header).getAllByRole('link').map((l) => l.textContent)
    expect(names).toEqual(['Travel Planner', 'Trips', 'Explore', 'Saved', 'Account'])
    ```
  - |
    AC6, logo opens My trips from another screen.
    ```tsx
    renderAt('/saved')
    fireEvent.click(await within(await screen.findByRole('banner')).findByRole('link', { name: 'Travel Planner' }))
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
    ```
  - |
    AC7, Trips and Explore links open their screens.
    ```tsx
    renderAt('/saved')
    fireEvent.click(await screen.findByRole('link', { name: 'Explore' }))
    expect(await screen.findByRole('heading', { name: 'Explore' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Trips' }))
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
    ```
  - |
    AC8, no main link highlighted on a screen under no main section (Saved, Account, Profile) plus the helper.
    ```tsx
    renderAt('/saved')
    const nav = within(await screen.findByRole('navigation', { name: 'Main' }))
    expect(nav.getByRole('link', { name: 'Trips' })).not.toHaveAttribute('aria-current')
    expect(nav.getByRole('link', { name: 'Explore' })).not.toHaveAttribute('aria-current')
    ```
    ```ts
    expect(mainSectionFor('/saved')).toBeNull()
    expect(mainSectionFor('/profile')).toBeNull()
    ```
  - |
    AC9, only the current section highlighted (navSections.test.ts and AppHeader.test.tsx).
    ```ts
    expect(mainSectionFor('/')).toBe('trips')
    expect(mainSectionFor('/trips/abc')).toBe('trips')
    expect(mainSectionFor('/destinations')).toBe('explore')
    expect(mainSectionFor('/explore')).toBe('explore')
    ```
    ```tsx
    renderAt('/destinations?q=Lisbon')
    expect(await screen.findByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Trips' })).not.toHaveAttribute('aria-current')
    ```
  - |
    AC10, no menu button and nothing hidden (vitest), then real widths (Playwright app-shell.spec.ts).
    ```tsx
    expect(within(header).queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
    expect(within(header).getByRole('navigation', { name: 'Main' })).toBeVisible()
    ```
    ```ts
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      const header = page.getByRole('banner')
      for (const name of ['Trips', 'Explore', 'Saved', 'Account']) {
        await expect(header.getByRole('link', { name })).toBeVisible()
      }
      await expect(header.getByRole('button', { name: 'Menu' })).toHaveCount(0)
    }
    ```
  - |
    Regression, signed-out header unchanged: the existing tests for the Sign in link, and for no Account link when signed out, must keep passing; add an assertion that a signed-out visitor sees no Main navigation.
    ```tsx
    mockMe(401)
    renderAt('/sign-up')
    await screen.findByRole('link', { name: 'Sign in' })
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    ```
  - |
    ExplorePage (ExplorePage.test.tsx): shows the heading and the destination search, and searching goes to results.
    ```tsx
    expect(await screen.findByRole('heading', { name: 'Explore' })).toBeInTheDocument()
    ```
assumptions_or_open_questions:
  - |
    PROTOTYPE CONFLICT: the prototype's header (and the design-system guideline "below 48rem the navigation collapses behind a menu button") includes a Menu button and a collapsed nav on phones, but its own comment says AC 3 and AC 10 need no menu button at any width. The plan follows the ACs: no toggle, links always visible and wrapping at 375px. The guideline in the design system for the collapse is deliberately not implemented for this item.
  - |
    Explore has no screen today: `/destinations` redirects to Home without a search term, and the only search lives on the home page. I assumed a minimal `/explore` page (heading plus the existing DestinationSearch) is acceptable as the target. The prototype's richer Explore screen (hint text, interest chips) is not built. Alternative if the reviewer prefers: point Explore at `/` and skip the new page, but then Trips and Explore would open the same screen.
  - |
    Trips (My trips) currently lives at `/` inside HomePage, so the logo and Trips link both go to `/`. No route change.
  - |
    Profile link removed from the header: AC5 fixes the visible links as Trips, Explore, Saved, Account. Profile remains reachable from the Account page. The e2e specs do not reference a header Profile link (checked by search); confirm during implementation.
  - |
    Saved and Account highlight themselves via NavLink when current, as the prototype's Saved screen does. AC8 and AC9 are only about main links.
  - |
    The prototype's footer and the reviewer bar are out of scope (top bar only); the brand text stays `Travel Planner` (the prototype's wordmark, no image logo).
  - Signed-in visitors on public pages (invite, read-only trip) also see the nav, since the header is gated only on auth status.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — front-end markup and CSS only. No stored data, migration, setting or env var, and the new route needs no provisioning. Safe to roll back by reverting the commit.

  ### Approach

  `AppHeader` is already rendered above `<main>` for every route in `apps/web/src/App.tsx`, so "on every screen" only needs the header itself to change. It currently renders a placeholder (Profile, Saved, Account) and a comment says this story owns the full navigation. Styling follows the prototype `.shell-*` rules, built from design tokens only. Voice: link labels are the section names from the UI guidelines.

  ```mermaid
  flowchart TD
    App[App.tsx routes]
    Header[AppHeader.tsx]
    Sections[navSections.ts]
    Explore[ExplorePage.tsx]
    Search[places/DestinationSearch.tsx]
    Css[index.css shell rules]
    Auth[auth/AuthProvider useAuth]
    Account[account/AccountPage.tsx]
    App -->|renders on every route, adds /explore route| Header
    App -->|new route| Explore
    Explore --> Search
    Header -->|current section| Sections
    Header --> Auth
    Header --> Css
    Header -.->|Profile now reached from here| Account
    classDef touched fill:#f96,color:#000
    class App,Header,Sections,Explore,Css touched
  ```

  Verification commands: `cd apps/web && pnpm vitest run src/AppHeader.test.tsx src/navSections.test.ts src/explore` and `pnpm playwright test e2e/app-shell.spec.ts`.
review_focus: |
  IN scope: the top bar only (logo, Trips, Explore, Saved, Account), current-section highlight, and the minimal `/explore` target page. OUT: Bookings and Budget links, in-trip tabs, sign-in and Account screens, footer. Deliberate decisions: no menu button or collapse at any width (the ACs override the prototype/guideline), Profile link dropped from the header, and Explore is a thin new page because none existed. Riskiest area is the CSS wrapping at 375px and keeping signed-out and loading header states unchanged.
