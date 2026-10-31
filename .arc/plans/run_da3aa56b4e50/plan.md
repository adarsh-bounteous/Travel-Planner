summary: |
  Give Travel Planner one visual identity. Ship the brand assets as static files in `apps/web/public` (logo SVG with mark plus wordmark, SVG favicon, 192 and 512 PNG app icons, 1200x630 PNG social preview), link them from `apps/web/index.html` (icons plus Open Graph / Twitter preview metadata), add a `BrandLogo` component (route-line mark plus "Travel Planner" wordmark, exactly as in the approved prototype) and use it in the header, the sign-in page, the 404 page and the itinerary document, and add one page-title pattern, `Page name - Travel Planner`, falling back to `Travel Planner` when a page has no name. Today no code sets `document.title` (grep of `apps/web` found only the static `<title>` in `index.html`), so every page shows the bare app name.
scope:
  - description: |
      Brand assets as static files. Create, under `apps/web/public`: `brand/logo.svg` (mark + wordmark lockup, a real `<svg>` whose text/shape colours equal the token values), `favicon.svg` (the mark alone, 48x48 viewBox), `icons/icon-192.png` (192x192), `icons/icon-512.png` (512x512) and `social-preview.png` (1200x630). The PNGs are generated, then committed, by a small Playwright script `apps/web/scripts/build-brand-assets.ts` (Playwright is already a dependency, so no new package): it renders an HTML page that inlines `design-system/tokens.css` and screenshots it at the exact pixel sizes, so the PNG styling uses the tokens by name. The social preview follows the prototype Brand kit screen (`.social-img`): `--color-primary` background, inverse lockup (`.brand-logo-inv`), the line "Plan the trip. Keep every day in one place." in `--font-size-xl` / `--font-weight-bold` on `--color-on-primary`, and the faint route line bottom right at `--opacity-disabled`. Add a package script `"brand:assets": "tsx scripts/build-brand-assets.ts"` only if `tsx` is already available; otherwise run it through `playwright test`-style invocation the implementer finds already used in the repo.
    files:
      - apps/web/public/brand/logo.svg
      - apps/web/public/favicon.svg
      - apps/web/public/icons/icon-192.png
      - apps/web/public/icons/icon-512.png
      - apps/web/public/social-preview.png
      - apps/web/scripts/build-brand-assets.ts
    rationale: |
      AC2-AC7. Vite serves `public/` at the site root in dev, preview and build, so the URLs match the prototype's file names (`/brand/logo.svg`, `/favicon.svg`, `/icons/icon-192.png`, `/icons/icon-512.png`, `/social-preview.png`). Generating the PNGs from the same markup as the SVG keeps the three in step.
  - description: |
      Page head. In `apps/web/index.html` keep `<title>Travel Planner</title>` and add
      `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
      `<link rel="apple-touch-icon" href="/icons/icon-192.png" />`,
      `og:title`, `og:type`, `og:image` (`/social-preview.png`), `og:image:width` 1200, `og:image:height` 630, `og:image:type` image/png, and `twitter:card` = `summary_large_image` with `twitter:image`. The prototype says the preview is "set as og:image on every page", which for a single-page app means the one static head.
    files:
      - apps/web/index.html
    rationale: |
      AC4, AC7. Platforms read the raw HTML, not React-rendered tags, so static tags in `index.html` are the only reliable place.
  - description: |
      `BrandLogo` component, new because the catalogue (CompareTable, ImageFrame, OptionCard) has nothing for it; the prototype itself marks it "NEW (not in repo): BrandLogo". Signature:

      ```tsx
      export const MARK_PATH = 'M12 34 C 18 14, 26 40, 35 15'
      export function BrandLogo(props: {
        size?: 'md' | 'lg'        // md: header and document, lg: sign-in and 404
        inverse?: boolean         // for the teal sign-in panel
        label?: string            // default 'Travel Planner'
      }): JSX.Element
      ```

      Renders `<span class="brand-logo [brand-logo-lg] [brand-logo-inv]" role="img" aria-label="Travel Planner">` containing an inline 48x48 `<svg class="brand-mark" aria-hidden>` (rect rx 12 `.m-bg`, route path `.m-line`, dots `.m-dot` at (12,34) r3.5 and (35,15) r4.5) and `<span class="brand-word">Travel <b>Planner</b></span>`. Callers wrap it in a `Link` where it must navigate. Add the prototype's `.brand-logo`, `.brand-mark`, `.m-bg`, `.m-line`, `.m-dot`, `.brand-word`, `.brand-logo-lg`, `.brand-logo-inv` rules to `apps/web/src/index.css` (it already imports `../../../design-system/tokens.css` at line 2, and the `.shell-*` and `.auth-brand` rules live there). Tokens used: `--space-2` (gap), `--size-control-lg` (mark size; `lg` = `calc(var(--size-control-lg) + var(--space-3))`), `--color-primary` (mark fill, "Planner"), `--color-on-primary` (route line and dots; inverse fill), `--color-fg` (wordmark), `--font-size-lg` (`--font-size-xl` for `lg`), `--font-weight-bold`. The prototype's raw `stroke-width: 3` and `letter-spacing: -0.01em` have no token; keep them as SVG geometry and a typographic literal and list them in open questions.
    files:
      - apps/web/src/components/BrandLogo.tsx
      - apps/web/src/index.css
    rationale: |
      AC1, AC3. One component keeps all four surfaces identical. It is styled only with tokens, matching the prototype's `<style>` block.
  - description: |
      Place the logo on the four surfaces.
      (1) Header: in `apps/web/src/AppHeader.tsx` replace the text inside `<Link className="shell-brand" to="/">` with `<BrandLogo />`; the accessible name stays "Travel Planner" so the existing AppHeader tests keep passing. Drop the `.shell-brand` colour rule in `index.css` only if nothing else uses it.
      (2) Sign-in: in `apps/web/src/auth/SignInPage.tsx` render `<BrandLogo size="lg" inverse />` inside the existing `<aside className="auth-brand">` and remove its `aria-hidden` (the aside sits on a teal `--color-primary` gradient, so the prototype's inverse variant is the legible one).
      (3) 404: in `apps/web/src/NotFoundPage.tsx` put a `<Link to="/" aria-label="Travel Planner"><BrandLogo size="lg" /></Link>` above the `.empty-state`, as the prototype's Page not found screen does ("Lockup above the message").
      (4) Itinerary document: in `Document` in `apps/web/src/trips/ItineraryPage.tsx` add a `.doc-brand` row above the cover section holding `<BrandLogo />` (non-link, like the prototype's `.paper-head`) so it prints with the document; add the small `.doc-brand` rule (`padding-bottom: var(--space-3)`, `border-bottom: var(--border-width-strong) solid var(--color-primary)`) to `index.css` and check it in the existing print rules there.
    files:
      - apps/web/src/AppHeader.tsx
      - apps/web/src/auth/SignInPage.tsx
      - apps/web/src/NotFoundPage.tsx
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/index.css
    rationale: |
      AC1. The scope names exactly these four places.
  - description: |
      Title pattern. New `apps/web/src/pageTitle.ts`:

      ```ts
      export const APP_NAME = 'Travel Planner'
      export function formatTitle(pageName?: string | null): string {
        const name = pageName?.trim()
        return name ? `${name} - ${APP_NAME}` : APP_NAME
      }
      export const PAGE_NAMES: { pattern: string; name?: string }[]   // one per route in App.tsx
      export function usePageName(name?: string | null): void          // useEffect: document.title = formatTitle(name)
      export function TitleManager(): null                              // useLayoutEffect on pathname: matchPath over PAGE_NAMES
      ```

      `TitleManager` is mounted once in `App.tsx` next to `<AppHeader />`. It sets the static title for the current route from `PAGE_NAMES`, using each page's existing `<h1>` text as its name (for example `/` is "My trips", `/explore` is "Explore", `/saved` "Saved", `/account` "Account", `/sign-in` "Sign in", `/sign-up` "Sign up"). The catch-all `*` route has no name, so it gets the bare "Travel Planner". The itinerary page calls `usePageName(itinerary.cover.name)` once loaded, so the tab reads "Lisbon week - Travel Planner" as in the prototype; because layout effects run before passive effects, the page's value wins over the static fallback ("Itinerary") for the same render. The implementer must read `apps/web/src/routePatterns.ts` (used by `notFoundStatus.ts`) and build `PAGE_NAMES` from the same route list so no route is missed; a test enforces this.
    files:
      - apps/web/src/pageTitle.ts
      - apps/web/src/App.tsx
      - apps/web/src/trips/ItineraryPage.tsx
    rationale: |
      AC8, AC9. One central table avoids editing 30+ page components and makes "every page has a name or deliberately none" checkable.
tests:
  - |
    AC2 and AC3 (write first), `apps/web/src/brand/brandAssets.test.ts`. The logo file is SVG and holds both the mark and the wordmark, and `BrandLogo` draws the same mark path:
    ```ts
    const svg = readFileSync(resolve(__dirname, '../../public/brand/logo.svg'), 'utf8')
    expect(svg).toMatch(/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain(MARK_PATH)                 // the mark
    expect(svg).toMatch(/Travel/)                    // the wordmark
    expect(svg).toMatch(/Planner/)
    ```
  - |
    AC4, same file. The favicon is an SVG: `expect(readFileSync(favicon, 'utf8')).toMatch(/<svg[\s>]/)` and `expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg"')` where `html` is `apps/web/index.html`. Also, against a built or preview server in `apps/web/e2e/brand.spec.ts`: `const res = await request.get('/favicon.svg'); expect(res.headers()['content-type']).toContain('image/svg+xml')`.
  - |
    AC5 and AC6, same file, a PNG size helper that reads the IHDR chunk (signature then width at byte 16, height at byte 20):
    ```ts
    function pngSize(file: string) {
      const b = readFileSync(file)
      expect(b.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
    }
    expect(pngSize('public/icons/icon-192.png')).toEqual({ w: 192, h: 192 })
    expect(pngSize('public/icons/icon-512.png')).toEqual({ w: 512, h: 512 })
    ```
    The e2e spec also requests `/icons/icon-192.png` and `/icons/icon-512.png` and expects `image/png`.
  - |
    AC7, same file. The social preview is 1200x630 and the head advertises it:
    ```ts
    expect(pngSize('public/social-preview.png')).toEqual({ w: 1200, h: 630 })
    expect(html).toContain('<meta property="og:image" content="/social-preview.png"')
    expect(html).toContain('<meta property="og:image:width" content="1200"')
    expect(html).toContain('<meta property="og:image:height" content="630"')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"')
    ```
  - |
    AC1 and AC3, `apps/web/src/components/BrandLogo.test.tsx` and additions to existing tests. The component shows mark and wordmark together:
    ```tsx
    render(<BrandLogo />)
    const logo = screen.getByRole('img', { name: 'Travel Planner' })
    expect(logo.querySelector('svg.brand-mark')).not.toBeNull()
    expect(logo).toHaveTextContent('Travel Planner')
    ```
    Then, one assertion per surface: `AppHeader.test.tsx` `expect(within(header).getByRole('link', { name: 'Travel Planner' }).querySelector('svg.brand-mark')).not.toBeNull()`; `SignInPage.test.tsx` `expect(screen.getByRole('img', { name: 'Travel Planner' })).toBeInTheDocument()` at `/sign-in`; `NotFoundPage.test.tsx` the same on an unknown path; and for the itinerary document an `ItineraryPage` test (or a new `ItineraryPage.brand.test.tsx` if none exists) that `screen.getByRole('main')` contains `getByRole('img', { name: 'Travel Planner' })` after the itinerary loads. Header tests that read link `textContent` must still equal `'Travel Planner'`.
  - |
    AC8, `apps/web/src/pageTitle.test.tsx`. Pure format plus routed pages:
    ```ts
    expect(formatTitle('Sign in')).toBe('Sign in - Travel Planner')
    expect(formatTitle('Lisbon week')).toBe('Lisbon week - Travel Planner')
    ```
    Rendering `<App />` in a `MemoryRouter` at `/sign-in` (signed out) then `/explore` (signed in), `await waitFor(() => expect(document.title).toBe('Sign in - Travel Planner'))` and `'Explore - Travel Planner'`. At the itinerary route with a mocked itinerary named "Lisbon week": `expect(document.title).toBe('Lisbon week - Travel Planner')`. A coverage test iterates `PAGE_NAMES` and asserts every route pattern in `routePatterns.ts` is present, so a new route cannot ship without a decision on its name.
  - |
    AC9, same file. A page with no name reads as the app name:
    ```ts
    expect(formatTitle()).toBe('Travel Planner')
    expect(formatTitle('   ')).toBe('Travel Planner')
    ```
    and at an unknown path `/no/such/page`, `await waitFor(() => expect(document.title).toBe('Travel Planner'))`. After navigating from a named page to the 404 page the title drops the page name (no stale title).
assumptions_or_open_questions:
  - |
    Prototype conflicts and choices. (a) The prototype's sign-in screen centres a non-inverse lockup above the form card, but the real SignInPage uses a split layout with a teal `.auth-brand` aside, where a non-inverse lockup would be invisible. The plan puts the inverse lockup in that aside and leaves the layout alone. Say so if you want the centred layout instead. (b) The prototype's 404 reads "This page doesn't exist." with a "Back to itineraries" button, while the real page reads "Page not found" and "Go to Trips" and has existing tests. The plan changes only the logo, not that copy. (c) The prototype's "Itineraries" title for the trips list is not a real route name here; the list is the "My trips" page, so its title is "My trips - Travel Planner".
  - |
    `logo.svg` and `favicon.svg` are standalone files and cannot read page CSS custom properties, so they must carry literal colours. The plan uses the exact values from `design-system/tokens.css` (`--color-primary` #0e7490, `--color-on-primary` #ffffff, `--color-fg` #0f172a) and a test should assert they still match the tokens file. This is the one place hex literals are unavoidable. Please confirm that is acceptable.
  - |
    Values with no token: SVG `stroke-width: 3` (geometry inside the 48 viewBox) and the wordmark `letter-spacing: -0.01em`. Kept as in the prototype.
  - |
    The social preview needs an absolute URL for some platforms (Facebook and LinkedIn ignore a relative `og:image`). The production origin is not stated anywhere I read, so the plan uses the root-relative `/social-preview.png`. If a public origin exists, provide it (a build-time `VITE_PUBLIC_ORIGIN` would be the setting) and `og:image`/`og:url` can be made absolute. I did not read the deployment config (CDN or hosting, ADR-0006), so I have not confirmed it serves `public/` files ahead of the single-page fallback; the e2e check in the tests covers it against the preview server only.
  - |
    No web app manifest is planned. The acceptance criteria only require the 192 and 512 PNGs to be served, and a manifest would add `theme_color` and `background_color` hex values with no token. Say if an installable-app manifest is wanted.
  - |
    Assumed the header logo is visible to signed-out visitors as well (the header always renders the brand link). The prototype shows the shell header carrying the logo on the sign-in screen.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  None — static front-end assets, markup and a title hook; no stored data, migration, seed, API change, env var or setting. Rollback is a plain revert. Deploying only needs `public/` files to be published with the build (see the open question about hosting).

  Tokens load today through `apps/web/src/index.css` line 1 (`@import "tailwindcss"`) and line 2 (`@import "../../../design-system/tokens.css"`), imported once from `apps/web/src/main.tsx` line 6; Tailwind comes from the `@tailwindcss/vite` plugin in `apps/web/vite.config.ts`. No new loading is needed. Existing shell rules (`.shell-header`, `.shell-bar`, `.shell-brand`, `.auth-brand`) are in that same file; the new brand rules go next to them. Light theme only, per the UI guidelines. The prototype's `.brand-logo*` CSS and its Brand kit, Sign in, Page not found and Itinerary document screens were read in full.

  The dev and preview servers answer unknown HTML paths with 404 via `apps/web/src/notFoundStatus.ts`, which skips any last path segment containing a dot, so `/favicon.svg`, `/icons/icon-192.png` and the other assets pass through to static serving.

  `apps/web/src/bundleBaseline.test.ts` and `apps/web/bundle-baseline.json` exist; inline SVG in `BrandLogo` is small, but the implementer should run that test and not loosen it. Use the narrow form, for example `cd apps/web && pnpm exec vitest run src/pageTitle.test.tsx`, while iterating.

  ```mermaid
  flowchart TD
    index[index.html: icons and og tags]:::touched
    pub[public: logo, favicon, icons, social preview]:::touched
    gen[scripts/build-brand-assets.ts]:::touched
    logo[components/BrandLogo.tsx]:::touched
    css[index.css]:::touched
    app[App.tsx]:::touched
    title[pageTitle.ts]:::touched
    header[AppHeader.tsx]:::touched
    signin[auth/SignInPage.tsx]:::touched
    nf[NotFoundPage.tsx]:::touched
    itin[trips/ItineraryPage.tsx]:::touched
    routes[routePatterns.ts]
    tokens[design-system/tokens.css]
    gen -->|renders PNGs, uses tokens| pub
    gen --> tokens
    index -->|links| pub
    css -->|imports| tokens
    logo --> css
    header --> logo
    signin --> logo
    nf --> logo
    itin --> logo
    app -->|mounts TitleManager| title
    title -->|route list must match| routes
    itin -->|usePageName with trip name| title
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN scope: the five static assets, `index.html` head tags, `BrandLogo`, its placement in header, sign-in, 404 and itinerary document, and the `Page name - Travel Planner` title pattern. OUT: any redesign of the shell, sign-in layout, 404 copy, a web manifest, or per-page social metadata. Riskiest parts are the central `PAGE_NAMES` table (a missed route silently shows the wrong title, so the route-coverage test matters) and the layout-effect versus effect ordering that lets the itinerary page override its static title. Deliberate: `logo.svg` and `favicon.svg` carry literal colours because standalone SVG files cannot read CSS tokens; every in-app style uses tokens only.
