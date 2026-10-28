summary: |
  Add a not-found page for web URLs that match no route. Today `apps/web/src/App.tsx` ends its `<Routes>` with no catch-all, so an unknown URL renders the header and an empty `<main>` (a blank page), and the server answers 200 because Vite serves `index.html` for every path. The plan adds (1) a `NotFoundPage` component built from the approved prototype (404 badge, "Page not found" heading, "The page you requested could not be found.", the requested path echoed in a mono block, one primary "Go to Trips" link) behind a `path="*"` route, and (2) a small server-side piece so the HTTP status for an unknown page load is 404 Not Found: a single route-pattern list plus a Vite dev/preview middleware that returns `index.html` with status 404 when the path matches no known route. Work is test-first, one failing test per acceptance criterion.

scope:
  - description: |
      Create `NotFoundPage` in `apps/web/src/NotFoundPage.tsx`, following the prototype screen "Page not found".
      Markup (copy from prototype lines 771-781, with a `div` instead of the prototype's inner `main`, because `App.tsx` already wraps routes in `<main className="shell-main">` and a nested main is invalid):

      ```tsx
      export function NotFoundPage() {
        const { pathname, search } = useLocation()
        const heading = useRef<HTMLHeadingElement>(null)
        useEffect(() => heading.current?.focus(), [])
        return (
          <div className="nf">
            <div className="empty-state">
              <span className="nf-icon" aria-hidden="true">{/* search icon, svg.icon */}</span>
              <span className="badge badge-neutral">404 Not Found</span>
              <h1 ref={heading} tabIndex={-1}>Page not found</h1>
              <p>The page you requested could not be found.</p>
              <code className="nf-path text-muted" aria-label="Requested address">{pathname + search}</code>
              <Link className="btn btn-primary" to="/">Go to Trips</Link>
            </div>
          </div>
        )
      }
      ```

      Add `<Route path="*" element={<NotFoundPage />} />` as the last route in `apps/web/src/App.tsx`. It is deliberately NOT wrapped in `RequireAuth`, so a signed-out visitor sees the message instead of being redirected to sign in (add it to the list of exceptions in the comment above `App`). "Go to Trips" links to `/` because `MAIN_SECTIONS` in `apps/web/src/navSections.ts` maps Trips to `/` (the home section; the same link text is already used by `LocalInboxPage.tsx` line 106).
    files:
      - apps/web/src/NotFoundPage.tsx
      - apps/web/src/NotFoundPage.test.tsx
      - apps/web/src/App.tsx
    rationale: |
      AC1-4. React Router's `*` route is the idiomatic catch-all and the app already uses react-router v7 `Routes`.

  - description: |
      Styles for the page, appended to `apps/web/src/index.css` (the app's global stylesheet; tokens are already loaded there by line 2, `@import "../../../design-system/tokens.css"`, so no new token loading is needed). Reuse existing `.empty-state`, `.badge`, `.badge-neutral`, `.btn`, `.btn-primary`, `.text-muted`. Add only what the prototype's `<style>` block defines, token-only:

      ```css
      .nf { max-width: var(--size-content-max); margin: 0 auto; padding: var(--space-5) var(--space-3); }
      .nf .empty-state { max-width: 36rem; margin: 0 auto; padding: var(--space-6) var(--space-3); border-style: solid; border-color: var(--color-border); }
      .nf-icon { display: inline-flex; align-items: center; justify-content: center; width: var(--size-control-lg); height: var(--size-control-lg); border-radius: var(--radius-full); background: var(--color-surface); color: var(--color-fg-muted); }
      .nf-icon .icon { width: var(--size-check); height: var(--size-check); }
      .nf-path { max-width: 100%; padding: var(--space-1) var(--space-2); background: var(--color-surface); border-radius: var(--radius-sm); overflow-wrap: anywhere; font-family: var(--font-family-mono); font-size: var(--font-size-sm); }
      .nf .btn { min-height: var(--size-control-lg); }
      ```

      `.nf-path` also sets the mono font and size explicitly because `index.css` has no global `code` rule (the prototype's `prototype-utils.css` has one). The "long path" prototype state (360px) relies on `overflow-wrap: anywhere`.
    files:
      - apps/web/src/index.css
    rationale: |
      Matches the approved design (spacing, radius, size and colour tokens by name). Phone-first single column; no breakpoint rules needed.

  - description: |
      HTTP 404 for unknown page loads (AC5). React Router cannot set a status in a client-rendered app, and the web app has no server of its own: `apps/web/playwright.config.ts` serves the build with `vite preview`, and dev uses `vite`; both answer 200 with `index.html` for any path. Add:

      1. `apps/web/src/routePatterns.ts` exporting `APP_ROUTE_PATTERNS: string[]` (every `path` currently in `App.tsx`, e.g. `/`, `/trips/:tripId`, `/trips/plan/:country/:place`, `/invite/:token`, ...) and
         `export function isKnownAppPath(pathname: string): boolean` using `matchPath` from `react-router`.
      2. `apps/web/src/notFoundStatus.ts` exporting a Connect-style middleware factory:

      ```ts
      export function notFoundStatusMiddleware(
        loadIndexHtml: (url: string) => Promise<string>,
      ): (req: IncomingMessage, res: ServerResponse, next: () => void) => void
      ```

      It acts only when the request is GET or HEAD, `Accept` includes `text/html`, the last path segment has no file extension, the path is not under `/auth` (same exclusion as `pageRequestBypass` in `apps/web/src/devProxy.ts`, the Google sign-in redirect is a real API navigation) and `isKnownAppPath(pathname)` is false. Then it answers `res.statusCode = 404`, `Content-Type: text/html`, body `await loadIndexHtml(req.url)`, so the browser still loads the SPA, which renders `NotFoundPage` via the `*` route. Otherwise it calls `next()`.
      3. In `apps/web/vite.config.ts` add a small inline plugin `{ name: 'not-found-status', configureServer, configurePreviewServer }` that registers the middleware (before the proxy) for both dev (`loadIndexHtml` = `server.transformIndexHtml(url, readFile('index.html'))`) and preview (`loadIndexHtml` = read `dist/index.html`, i.e. `config.build.outDir`).
    files:
      - apps/web/src/routePatterns.ts
      - apps/web/src/routePatterns.test.ts
      - apps/web/src/notFoundStatus.ts
      - apps/web/src/notFoundStatus.test.ts
      - apps/web/vite.config.ts
    rationale: |
      Keeps AC5 true in every environment this repository can run (dev, preview, Playwright). A drift test (below) stops the route list going stale when someone adds a route. Production hosting is not defined in this repository (see open questions).

  - description: |
      Playwright e2e `apps/web/e2e/not-found.spec.ts`, in the style of `e2e/redirect.spec.ts` (API stubbed at the network edge with `page.route`). It runs against `vite preview`, so it exercises the real middleware and the real SPA together.
    files:
      - apps/web/e2e/not-found.spec.ts
    rationale: |
      Only a real browser plus server proves AC3 (not blank) and AC5 (status) together.

tests:
  - |
    AC1 (vitest, `apps/web/src/NotFoundPage.test.tsx`, renders `<App />` in `MemoryRouter initialEntries={['/no/such/page']}` with the `mockMe(200, ...)` helper pattern from `AppHeader.test.tsx`). Write first; fails today because no route renders anything:

    ```tsx
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'My trips' })).not.toBeInTheDocument()
    ```
  - |
    AC2 (same file):

    ```tsx
    expect(await screen.findByText('The page you requested could not be found.')).toBeVisible()
    expect(screen.getByLabelText('Requested address')).toHaveTextContent('/no/such/page?x=1') // render at '/no/such/page?x=1'
    expect(screen.getByText('404 Not Found')).toBeInTheDocument()
    ```
  - |
    AC3 (same file; also runs signed out with `mockMe(401)` to prove the page is not redirected to sign in or left blank):

    ```tsx
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.getByRole('main')).not.toBeEmptyDOMElement()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Page not found' }))
    ```
  - |
    AC4 (same file):

    ```tsx
    const link = await screen.findByRole('link', { name: 'Go to Trips' })
    expect(link).toHaveAttribute('href', '/')
    fireEvent.click(link)
    expect(await screen.findByRole('heading', { name: 'My trips' })).toBeInTheDocument()
    ```
    Also assert known routes still win over `*` (`/saved` renders the Saved page, not the not-found heading).
  - |
    AC5 unit (`apps/web/src/notFoundStatus.test.ts`): call the middleware with fake req/res.

    ```ts
    // unknown page load
    mw({ method: 'GET', url: '/no/such/page', headers: { accept: 'text/html' } }, res, next)
    expect(res.statusCode).toBe(404)
    expect(next).not.toHaveBeenCalled()
    // known route, API call, asset, auth redirect all pass through
    for (const [url, accept] of [['/trips/abc', 'text/html'], ['/trips', 'application/json'], ['/assets/app.js', '*/*'], ['/auth/google', 'text/html']])
      expect(passesThrough(url, accept)).toBe(true)
    ```
  - |
    AC5 route list (`apps/web/src/routePatterns.test.ts`): `isKnownAppPath('/trips/plan/japan/kyoto')` is true, `isKnownAppPath('/trips/summer-2027/hotels')` is false, and a drift guard reads `src/App.tsx` as text, extracts every `path="..."` and asserts the set equals `APP_ROUTE_PATTERNS` (excluding the `*` route):

    ```ts
    expect([...appTsxPaths].sort()).toEqual([...APP_ROUTE_PATTERNS].sort())
    ```
  - |
    AC1-5 e2e (`apps/web/e2e/not-found.spec.ts`, runs the real build under `vite preview`):

    ```ts
    const response = await page.goto('/trips/summer-2027/hotels')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.getByText('The page you requested could not be found.')).toBeVisible()
    await page.getByRole('link', { name: 'Go to Trips' }).click()
    await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
    // a known route is still 200
    expect((await page.goto('/saved'))?.status()).toBe(200)
    // 360px long path does not overflow horizontally
    await page.setViewportSize({ width: 360, height: 800 })
    ```
    Narrow commands: `cd apps/web && pnpm exec vitest run src/NotFoundPage.test.tsx src/notFoundStatus.test.ts src/routePatterns.test.ts` and `cd apps/web && pnpm exec playwright test e2e/not-found.spec.ts`. The configured full command stays `(cd services/api && sh run-py.sh -m pytest -c pytest.ini) && (cd apps/web && pnpm run test)`; the API suite is unaffected.

assumptions_or_open_questions:
  - |
    Production hosting of the web build is not defined anywhere I looked (Grep for index.html / fallback / CloudFront / historyApiFallback across scripts, config, docs and the web config found nothing; ADR-0006 only says AWS serverless). The 404 status is therefore implemented for dev, `vite preview` and Playwright only. Whatever serves the built files in deployment (for example S3 behind CloudFront) must be configured to return `index.html` with status 404 for paths outside the route list, or AC5 will not hold there. Please confirm who owns that, or whether a follow-up item is wanted. The plan does not add infrastructure.
  - |
    "Go to Trips" links to `/`, because `MAIN_SECTIONS` in `navSections.ts` defines Trips as `/` and `/trips` itself is not a route (it would hit the new catch-all, or match nothing in `APP_ROUTE_PATTERNS`).
  - |
    The prototype shows a "Menu" button and a footer in its shell; the real app shell (`AppHeader.tsx`) deliberately never collapses and has no footer, so only the prototype's content area (the `.nf` block) is built. This follows the existing app-shell decision, not a new one.
  - |
    The prototype nests a `<main class="nf">` inside the shell's `<main>`; the plan uses a `div.nf` to avoid two `main` landmarks. Visual result is identical.
  - |
    The echoed requested path is rendered as React text (escaped), never as HTML, so a crafted URL cannot inject markup. It includes the query string, as in the prototype's long-path state.
  - |
    Unknown paths that start with an API prefix such as `/trips/...` are treated by route pattern, not by prefix: `/trips/:tripId` matches any single segment, so `/trips/does-not-exist` still shows the Trip page's own missing-trip handling, not this page. Only URLs that match no pattern get the 404 page.
  - |
    The deferred question about starter-list places (Thailand, Mexico, ...) is unrelated to this item and not planned here.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout
  None — UI route, CSS and dev/preview server middleware only; no stored data, migration, seed, setting or env var. Rollback is reverting the commit. Deployment of the 404 status in production depends on hosting configuration outside this repository (first open question).

  Design source read: `designs/TRAVEL-PLANNER-APP-STORY-099/TRAVEL-PLANNER-APP-STORY-099-design.html` (screens "Page not found" and "Page not found — long path", both tagged AC 1-5). Elements used: `.empty-state` containing a 48px circular icon, `.badge.badge-neutral` "404 Not Found", `h1` "Page not found" (tabindex -1, focused on load), the message paragraph, `code.nf-path.text-muted` (aria-label "Requested address", wraps), and the single `.btn.btn-primary` "Go to Trips". No conflict with the acceptance criteria. Tokens used by name: `--size-content-max`, `--space-1`, `--space-2`, `--space-3`, `--space-5`, `--space-6`, `--color-border`, `--color-surface`, `--color-fg-muted`, `--radius-full`, `--radius-sm`, `--size-control-lg`, `--size-check`, `--font-family-mono`, `--font-size-sm`. Token loading: `apps/web/src/index.css` line 2 imports `design-system/tokens.css`; `index.css` is imported by `apps/web/src/main.tsx` line 6. `tokens.css` exports `--duration-*` as "[object Object]", which `index.css` already overrides; this plan does not use them.

  Guideline conformance: warm concise copy with an action that says what to do next, one `.btn-primary` for the section, `.empty-state` pattern, light theme, phone-first single column, visible focus ring comes from the existing `a:focus-visible` rule.

  ```mermaid
  flowchart TD
    main[main.tsx BrowserRouter] --> App[App.tsx Routes]
    App --> NF[NotFoundPage.tsx new catch-all route]
    App --> Known[existing pages in RequireAuth]
    NF --> CSS[index.css add .nf styles]
    NF --> Link[react-router Link to /]
    Vite[vite.config.ts add not-found-status plugin] --> MW[notFoundStatus.ts new middleware]
    MW --> RP[routePatterns.ts new route list]
    RP -. drift test reads .-> App
    Vite --> Proxy[devProxy.ts apiProxy, unchanged]
    classDef touched fill:#f96,color:#000
    class App,NF,CSS,Vite,MW,RP touched
  ```
  Touched nodes (orange): `App.tsx` gets the `*` route; `NotFoundPage.tsx` and `index.css` are the page; `vite.config.ts`, `notFoundStatus.ts` and `routePatterns.ts` give the 404 status. `devProxy.ts` is only read for the `/auth` exclusion.

review_focus: |
  IN scope: the `*` route, `NotFoundPage` with its styles, and a 404 status for unknown page loads in dev/preview/Playwright. OUT: production hosting or infrastructure changes, new nav items, and any change to how existing pages handle missing data (for example an unknown trip id). Riskiest part is the middleware in `notFoundStatus.ts`: it must never turn a known route, an API fetch (`Accept` not html), an asset or the `/auth` redirect into a 404, and `APP_ROUTE_PATTERNS` must stay in sync with `App.tsx` (drift test). Deliberate choices: the catch-all is not behind `RequireAuth`, "Go to Trips" points to `/`, and the page uses `div.nf` rather than the prototype's nested `main`.
