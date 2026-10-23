summary: |
  Make the web app sign-in-only. Add a `RequireAuth` route guard that sends signed-out visitors from every protected page to `/sign-in` without rendering any protected content (the "Sign in to continue" screen from the approved design: info alert, spinner line, fallback "Continue to sign in" link). The page they asked for is remembered in `sessionStorage` (so it survives the Google round-trip through the API) and used after email/password or Google sign-in. Signed-in travellers who open `/sign-in` or `/` never see the sign-in page. A minimal header with the "Sign in" entry point is shown to signed-out visitors on every page. All work is in `apps/web`; no API change.
scope:
  - description: |
      Return-path helper. Pure functions, no React.
      ```ts
      export function safeReturnPath(raw: string | null): string | null   // "/x" only; rejects "//x", "http:", "/sign-in", "/sign-up", "/confirm-email"
      export function rememberReturnTo(path: string): void                // sessionStorage 'returnTo'
      export function peekReturnTo(): string | null
      export function takeReturnTo(): string | null                       // read + clear
      export function pageLabel(path: string): string                     // "/" -> "Trips", fallback "that page"
      ```
    files:
      - apps/web/src/auth/returnTo.ts
      - apps/web/src/auth/returnTo.test.ts
    rationale: |
      Isolates the open-redirect guard (only same-origin absolute paths) and the label shown in the design's "You'll go to Trips after signing in." note. sessionStorage rather than a query param because Google sign-in leaves the SPA (API redirects back to `${WEB_ORIGIN}/`), so router state would be lost.
  - description: |
      `RequireAuth` guard. `loading` renders the existing `.spinner` (role=status, aria-label "Loading") and no children. `signedOut` calls `rememberReturnTo(location.pathname + search)`, then renders the design screen "Protected page, signed out": `.auth.stack` with `.alert.alert-info.cluster` (role=status, InfoIcon, "Sign in to continue. We'll bring you back to {label} afterwards."), a `.cluster.center` row with `.spinner` + `.text-muted` "Taking you to sign in…", and a centred link "Continue to sign in" to `/sign-in`; an effect also navigates to `/sign-in` with `replace`. `signedIn` renders `children`, but first, if a pending return path exists and differs from the current path (landing back from Google), `<Navigate to={takeReturnTo()} replace />`.
      ```tsx
      export function RequireAuth({ children }: { children: ReactNode }): JSX.Element
      ```
    files:
      - apps/web/src/auth/RequireAuth.tsx
      - apps/web/src/auth/RequireAuth.test.tsx
    rationale: AC1 and AC4 (no protected content), AC2 for the Google path. The visible fallback link covers a failed redirect, as the design notes say.
  - description: |
      Wire routing. Remove the interim `Home` component (signed-out `/` currently renders SignInPage). `/` becomes `<RequireAuth><HomePage /></RequireAuth>`; `/sign-in`, `/sign-up`, `/confirm-email` stay public. Render the new `AppHeader` above `<main className="shell-main">` on every route.
    files:
      - apps/web/src/App.tsx
    rationale: Every page other than the auth pages is protected; today that is only `/`, and new pages must be wrapped the same way.
  - description: |
      SignInPage: when `peekReturnTo()` is set, render the design's `.alert.alert-info.cluster` (role=status, InfoIcon) "You'll go to <strong>{pageLabel}</strong> after signing in." above the form (pass as a new optional `notice?: ReactNode` prop on AuthForm, rendered at the top of `.auth.stack`). On `status === 'signedIn'` and after a successful `signIn`, navigate to `takeReturnTo() ?? '/'` (replace) instead of the hard-coded `/`. Signed-in visitors never see the form (existing Navigate kept, now return-aware).
    files:
      - apps/web/src/auth/SignInPage.tsx
      - apps/web/src/auth/AuthForm.tsx
    rationale: AC2, AC3 and AC5. The note is the design's only addition to the 029 sign-in screen; its error states and sign-up are unchanged.
  - description: |
      `AppHeader`: `<header className="shell-header">` with `.shell-bar` containing the brand link "Travel Planner" (to `/`). When `status === 'signedOut'`, a `.btn.btn-secondary` link "Sign in" (to `/sign-in`; `Link` styled as button, hidden on `/sign-in` itself is NOT done — keep it simple and always shown when signed out). Nothing is rendered in the nav slot for signed-in travellers (the Trips/Explore/Account nav and signed-in display belong to the App shell and navigation story). Styles `.shell-header`, `.shell-bar`, `.shell-brand` copied from the prototype's shell CSS into index.css using only tokens, with `.shell-bar` capped at `--size-content-max` and wrapping at 375px.
    files:
      - apps/web/src/AppHeader.tsx
      - apps/web/src/AppHeader.test.tsx
      - apps/web/src/index.css
    rationale: AC6. The prototype says the shell draws the header and Sign in button, but no shell exists in the repo yet, so this is the smallest header that satisfies AC6; it must be folded into the shell story's header rather than duplicated.
  - description: |
      Playwright e2e covering the redirect flow with the API stubbed at the network edge (same style as the existing spec), plus update the existing spec only if the new header changes its locators (the "Sign in" button locator must stay unambiguous: header entry is a link, form submit is a button).
    files:
      - apps/web/e2e/redirect.spec.ts
      - apps/web/e2e/auth.spec.ts
    rationale: Proves AC1, 2, 3, 5 in a real browser including reload and the sessionStorage hand-off.
tests:
  - |
    AC1 (RequireAuth.test.tsx, written first, fails because `/` currently renders SignInPage in place):
    ```tsx
    mockApi({ '/auth/me': { status: 401 } })
    renderAt('/')
    expect(await screen.findByRole('link', { name: 'Continue to sign in' })).toHaveAttribute('href', '/sign-in')
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/sign-in'))
    ```
  - |
    AC4 (RequireAuth.test.tsx): while loading and while signed out no protected content renders.
    ```tsx
    renderAt('/')
    expect(screen.queryByRole('heading', { name: 'Your trips' })).not.toBeInTheDocument()   // during loading
    await screen.findByText(/Sign in to continue/)
    expect(screen.queryByRole('heading', { name: 'Your trips' })).not.toBeInTheDocument()
    ```
  - |
    AC2 (SignInPage.test.tsx, RequireAuth.test.tsx, returnTo.test.ts): the asked-for page is remembered and used.
    ```tsx
    // signed out at '/', then sign in
    expect(sessionStorage.getItem('returnTo')).toBe('/')
    expect(await screen.findByText(/You'll go to/)).toHaveTextContent("You'll go to Trips after signing in.")
    // after submit with /auth/me now 200:
    expect(await screen.findByRole('heading', { name: 'Your trips' })).toBeInTheDocument()
    expect(sessionStorage.getItem('returnTo')).toBeNull()
    ```
    Plus unit tests for the open-redirect guard:
    ```ts
    expect(safeReturnPath('//evil.example')).toBeNull()
    expect(safeReturnPath('https://evil.example')).toBeNull()
    expect(safeReturnPath('/sign-in')).toBeNull()
    expect(safeReturnPath('/trips?x=1')).toBe('/trips?x=1')
    ```
    Google return path: with sessionStorage 'returnTo' = '/trips' and `/auth/me` 200, rendering `RequireAuth` at '/' navigates to '/trips'.
  - |
    AC3 (SignInPage.test.tsx): signed-in traveller never sees the form.
    ```tsx
    mockApi({ '/auth/me': { status: 200, body: { email: 'maya@example.com' } } })
    renderAt('/sign-in')
    expect(await screen.findByRole('heading', { name: 'Your trips' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
    ```
    and the same for `renderAt('/')`.
  - |
    AC5 (AppHeader.test.tsx plus e2e): choosing the entry point shows the sign-in page.
    ```tsx
    mockApi({ '/auth/me': { status: 401 } })
    renderAt('/sign-up')
    fireEvent.click(await screen.findByRole('link', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    ```
  - |
    AC6 (AppHeader.test.tsx): signed-out visitors see the entry point on a public page, signed-in travellers do not.
    ```tsx
    mockApi({ '/auth/me': { status: 401 } })
    renderAt('/sign-up')
    expect(within(await screen.findByRole('banner')).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    ```
  - |
    E2E (redirect.spec.ts): signed-out `page.goto('/')` ends at `/sign-in` with the "You'll go to Trips" note and no "Your trips" heading; after filling the form the URL is `/` and the heading is visible; a signed-in `page.goto('/sign-in')` lands on `/`.
assumptions_or_open_questions:
  - |
    Protected pages today: only `/` (Trips home, `HomePage`). Other sections (Explore, Bookings, Budget, Saved, Account, trip pages) do not exist yet; they must be wrapped in `RequireAuth` when added. A route-level guard is used so the wrapper is applied once per route, not per page.
  - |
    The prototype says the shell draws the header and the "Sign in" button, and the scope says header display for signed-in travellers stays with App shell and navigation. No shell exists in the repo, so this plan adds a minimal `AppHeader` for AC6 only (brand plus the signed-out Sign in link, no nav). If the shell story has merged or lands first, reuse its header instead and drop `AppHeader.tsx`.
  - |
    The existing SignInPage/AuthForm (story 029) differs in detail from the prototype's sign-in card (Google button above the divider vs. below, "Create an account" vs. "Sign up" footer). The prototype marks that card as reused from 029, so it is NOT restyled here; only the return note is added.
  - |
    Design deviation kept from the prototype: the redirect screen is an inline `.alert` rather than a toast, as the design notes state. Header "Menu" toggle and main nav from the prototype are shell-owned and out of scope.
  - |
    The redirect happens client-side (SPA). A server-side 302 is not applicable because the web app is a static Vite build; "no protected content" is guaranteed because the guard renders nothing but the notice until `/auth/me` resolves.
  - |
    API change not needed: the Google callback already redirects to `${WEB_ORIGIN}/`, and the guard at `/` then forwards to the remembered path.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout
  None — front-end routing and UI only; no stored data, migration, setting or env var. Return path lives in the browser's `sessionStorage` and is cleared on use. Safe to roll back by reverting the web build.

  ```mermaid
  flowchart TD
    Main[main.tsx] --> Auth[AuthProvider.tsx]
    Main --> App[App.tsx]
    App --> Header[AppHeader.tsx]
    App --> Guard[RequireAuth.tsx]
    App --> SignIn[SignInPage.tsx]
    Guard --> Home[HomePage.tsx]
    Guard --> RT[returnTo.ts]
    SignIn --> RT
    SignIn --> Form[AuthForm.tsx]
    Header --> Auth
    Guard --> Auth
    classDef touched fill:#f96,color:#000
    class App,Header,Guard,SignIn,Form,RT touched
  ```
  App.tsx: remove interim `Home`, add guard and header. RequireAuth/returnTo: new. SignInPage/AuthForm: return-aware navigation and note. AppHeader: AC6.

  Tests follow the existing pattern in `apps/web/src/auth/SignInPage.test.tsx` (`mockApi` stubbing `fetch`, `MemoryRouter` + `AuthProvider` + `App`). The redirect tests need a small `data-testid="location"` probe or `useLocation` helper inside the test file, not in production code. Commands: `cd apps/web && pnpm vitest run` and `pnpm playwright test`.
review_focus: |
  IN: guard on `/`, remembered return path, sign-in note, minimal signed-out header link, tests. OUT: nav/shell, signed-in header display, account management, API changes. Riskiest: the return-path handling (open-redirect guard in `safeReturnPath`, and loops between `/sign-in` and the guard when `/auth/me` is slow or fails) and keeping the `loading` state from flashing protected content or the sign-in page. The header is deliberately minimal because the shell story owns the real one.
