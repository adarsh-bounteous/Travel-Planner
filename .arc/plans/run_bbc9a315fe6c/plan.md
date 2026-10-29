summary: |
  Most of the shared look is already in `apps/web/src/index.css` (tokens imported, `.btn`, `.badge`, `.input`, `.alert`, `.toast`, `.card`, `.empty-state`, `.skeleton`, `.nf`, `.shell-*`). This story closes the gaps against the design system sample (`design-system/style-guide.html`, `app-shell.html`, `prototype-utils.css`) and the cross-cutting ACs. The header pill row must scroll horizontally at 375px with no Menu button. Touch targets must reach 44px on phones. Focus rings must cover every control. Reduced motion must switch off every animation and transition. No third-party font or image may be requested. Each gap is pinned by a test before the CSS changes. State wording (404, empty, loading, error, local inbox) is not touched, and tests pin it.
scope:
  - description: |
      Header on phones. Under 48rem, make `.shell-nav` a single horizontally scrolling pill row.
      Use `flex-wrap: nowrap; overflow-x: auto`, `flex: none` on the links, and `--space-1`/`--space-2` gaps.
      Both `ul` groups (main and `.shell-nav-utility`) stay in one row. The brand sits above the row (`flex-basis: 100%` on the nav).
      Keep `.shell-link` pill-shaped with `--radius-full`.
      `[aria-current]` uses `--color-primary` on `--color-primary-subtle`.
      From 48rem up, keep the current single-line desktop layout.
      Do NOT add a Menu button. `AppHeader.tsx` stays markup-identical unless the e2e test needs a hook. The UI guideline "below 48rem collapses behind a menu button" is overridden by AC5.
    files:
      - apps/web/src/index.css
      - apps/web/src/AppHeader.tsx
    rationale: |
      AC3, AC4, AC5. The current `.shell-nav` wraps instead of scrolling.
      Tokens used: --space-1, --space-2, --space-3, --radius-full, --color-primary, --color-primary-subtle, --color-surface, --color-border, --size-control-lg, --size-content-max, --border-width.
  - description: |
      Touch targets. Add a phone block (`@media (max-width: 47.99rem)`).
      In it, `.btn`, `.btn-sm`, `.btn-icon`, `.input`, `.select`, `.shell-link`, `.tab`, `.chip`, `.answer-link`, `.back`, `.toast-close` and `.crumbs a` get `min-height: var(--size-control-lg)`.
      Icon-only buttons also get `min-width: var(--size-control-lg)`. Bare in-text links get `display: inline-flex; align-items: center`.
      Replace the raw `44px` in `.pick`, `.person` and `.identity` with `var(--size-control-lg)`. No token equals 44px, and 48px is the nearest token above it.
      Also fix the `.chip-remove` and `.radio`/`.check` targets (`.check` min-height is --size-control-lg on phones).
    files:
      - apps/web/src/index.css
    rationale: |
      AC10. Tokens used: --size-control-lg, --size-check, --space-2.
  - description: |
      Focus and motion.
      Extend the `:focus-visible` rule to `.select`, `.textarea`, `button`, `[role="tab"]`, `.checkbox`, `.radio`, `.shell-link`, `.tab`, `.answer-link`, `.chip-remove`, `.toast-close` and the `input` element. Use `--border-width-strong solid var(--color-focus)`.
      Add one global `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }`.
      Remove the now-redundant per-class reduced-motion rules.
      `.spinner` stays visible as a static ring.
    files:
      - apps/web/src/index.css
    rationale: |
      AC9 and AC11. Tokens used: --border-width-strong, --color-focus.
  - description: |
      Component fidelity. Diff `.btn-lg`, `.card-interactive`, `.alert-info`, `.input:disabled`, `.select.is-invalid` and the other classes in `design-system/prototype-utils.css` that `index.css` lacks.
      Port each missing one using the same tokens. Port the `.alert`, `.toast` and `.badge` variants as in `style-guide.html`.
      Tidy duplicate rules (`.note`, `.row-end`, `.confirm`) so one rule wins.
      Replace raw literals (`border: 2px solid` in `.flight-option.is-picked`, `280px` in `.options-body`) with tokens where a token covers them.
      Keep the `--duration-fast`/`--duration-spin` override block, because `tokens.css` exports `[object Object]` for both.
    files:
      - apps/web/src/index.css
    rationale: |
      AC1 and AC2. Tokens used: --button-*, --card-default-*, --color-*-subtle, --radius-*, --font-size-*, --font-weight-*, --opacity-disabled.
  - description: |
      States sheet (13). Align `.empty-state`, `.skeleton`/`.sk-card`/`.skel-card`, `.alert-danger` (error), `.nf` (404) and `.inbox-col`/`.mail-*` (local inbox) with the states sheet. This is CSS only.
      Open the states sheet markup in `design-system/style-guide.html` to confirm the spacing, border style, icon size and heading levels before editing.
      Do NOT edit any JSX text. Where a component's class names must change to match the sheet, change only `className` attributes. Touch `NotFoundPage.tsx`, `local/LocalInboxPage.tsx` and the empty/loading/error call sites only if the sheet needs a different class.
    files:
      - apps/web/src/index.css
      - apps/web/src/NotFoundPage.tsx
      - apps/web/src/local/LocalInboxPage.tsx
    rationale: |
      AC6 and AC7. Tokens used: --space-5, --space-6, --radius-lg, --color-border-strong, --color-skeleton, --size-skeleton-line, --size-control-lg.
  - description: |
      No third-party requests. The font stack in `tokens.css` names `Inter` with system fallbacks. Keep it that way and add no `@font-face`, `<link>` or `@import url(http...)`. Self-host only if the sample requires it.
      Add a guard test that scans `index.html` and `src/**/*.css` for external origins, and an e2e check that records requests.
    files:
      - apps/web/index.html
      - apps/web/src/designSystem.test.ts
    rationale: |
      AC12. Today `index.html` and `index.css` hold no external URL, so this is a regression guard. I read both files.
  - description: |
      Tests. Add `apps/web/src/designSystem.test.ts`. It is a vitest file that reads `index.css` with `node:fs` and asserts on the rules.
      Add `apps/web/e2e/foundations.spec.ts`. It is a Playwright file that checks computed styles, rects, contrast and requests at 375px and 1280px, with the API stubbed as in `e2e/app-shell.spec.ts`.
      Extend `apps/web/e2e/app-shell.spec.ts`. Existing wording tests (`NotFoundPage.test.tsx`, `LocalInboxPage.test.tsx`) must stay green unchanged.
    files:
      - apps/web/src/designSystem.test.ts
      - apps/web/e2e/foundations.spec.ts
      - apps/web/e2e/app-shell.spec.ts
    rationale: |
      jsdom does not apply the stylesheet or media queries, so layout ACs need Playwright. Static CSS assertions give fast TDD feedback.
tests:
  - |
    AC1 and AC2, `designSystem.test.ts`. The rules use only tokens (no hex/rgb literals and no raw px outside `@media` conditions).
    ```ts
    const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
    const body = css.replace(/@media[^{]*\{/g, '{')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
    expect(body).not.toMatch(/:\s*[^;{}]*\b\d+px\b/)
    ```
    Playwright check at 1280px that `.btn-primary` has `getComputedStyle(...).backgroundColor === 'rgb(14, 116, 144)'`, the `--color-primary` value. Do the same for the badge, alert, input and card radius and border.
  - |
    AC3, Playwright at 1280px. The header is one row.
    ```ts
    const bar = await page.locator('.shell-bar').boundingBox()
    expect(bar!.height).toBeLessThan(80)
    await expect(page.locator('.shell-link[aria-current="page"]')).toHaveCSS('background-color', 'rgb(236, 254, 255)')
    ```
  - |
    AC4, Playwright at 375px.
    ```ts
    const nav = page.getByRole('navigation', { name: 'Main' })
    expect(await nav.evaluate(e => e.scrollWidth > e.clientWidth)).toBe(true)
    await expect(nav).toHaveCSS('overflow-x', 'auto')
    ```
    The page must not scroll sideways: `document.documentElement.scrollWidth <= 375`.
  - |
    AC5, extend the existing e2e and unit tests at 375px.
    ```ts
    await expect(header.getByRole('button', { name: 'Menu' })).toHaveCount(0)
    ```
    The existing `AppHeader.test.tsx` "has no menu button" test stays.
  - |
    AC6, Playwright. Visit an unknown path (404), the local inbox, an empty trips list and a loading skeleton with a delayed route. Assert the computed style of the state container, e.g. `.nf .empty-state` has `border-radius: 12px` and the `--color-border` colour. A `designSystem.test.ts` assertion checks the `.empty-state` and `.skeleton` rules match the sheet's declarations.
  - |
    AC7, the existing tests (`NotFoundPage.test.tsx`, `LocalInboxPage.test.tsx`, `ExplorePage.test.tsx`) must still pass unchanged. Add a pinning assertion in `NotFoundPage.test.tsx`.
    ```ts
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText('The page you requested could not be found.')).toBeInTheDocument()
    ```
  - |
    AC8, Playwright. For each text element on the home, 404, sign-in and inbox pages, compute the ratio from the computed `color` and the nearest opaque `background-color`. Assert `ratio >= 4.5`, or `>= 3` when font-size is at least 24px, or at least 18.66px and bold. Also a vitest check that every token pair used (`--color-fg-muted` on `--color-bg` and on `--color-surface`, `--color-primary` on `--color-primary-subtle`, `--color-warning` on `--color-warning-subtle`, `--color-bg` on `--color-fg` for the toast) is at least 4.5.
  - |
    AC9, Playwright. Tab to a link, a button and an input, and assert the outline.
    ```ts
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus-visible')).toHaveCSS('outline-style', 'solid')
    await expect(page.locator(':focus-visible')).toHaveCSS('outline-width', '2px')
    ```
    Plus `designSystem.test.ts` asserting the focus selector list includes `.select`, `.textarea` and `button`.
  - |
    AC10, Playwright at 375px.
    ```ts
    for (const el of await page.locator('a, button, input, select').all()) {
      if (!(await el.isVisible())) continue
      const box = (await el.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
    ```
    Run it on the header, sign-in, trips list, 404 and local inbox. In-paragraph links are covered by the `display: inline-flex` rule.
  - |
    AC11, Playwright with `page.emulateMedia({ reducedMotion: 'reduce' })`. Evaluate over `document.querySelectorAll('*')` that `getComputedStyle(el).animationName === 'none'` and that `transitionDuration` is `0s` on every element. Also a static assertion that `index.css` holds a global `prefers-reduced-motion` block.
  - |
    AC12, Playwright, plus a static check in `designSystem.test.ts`.
    ```ts
    const external: string[] = []
    page.on('request', r => { if (new URL(r.url()).origin !== new URL(page.url()).origin) external.push(r.url()) })
    await page.goto('/'); await page.goto('/no-such-page')
    expect(external).toEqual([])
    ```
    ```ts
    expect(readFileSync('index.html', 'utf8')).not.toMatch(/https?:\/\//)
    ```
assumptions_or_open_questions:
  - |
    `design-system/tokens.css` has no shadow tokens, and `index.css` uses none. I read both and found no `shadow` anywhere in `design-system/`. AC1 mentions shadows. I plan no `box-shadow` literal. Please confirm that the sample is flat, or add a shadow token.
  - |
    No token equals 44px. On phones I use `--size-control-lg` (48px), which meets AC10. The desktop control height stays at `--size-control-md` (40px).
  - |
    `UI-GUIDELINES.md` line 9 says the nav collapses behind a menu button under 48rem. AC4 and AC5 override it with a scrolling pill row and no Menu button. I read `design-system/app-shell.html`, which still shows the toggle. I follow the ACs and the existing `AppHeader.tsx`. Should the guideline be updated? It is outside this story.
  - |
    `tokens.css` exports `--duration-fast` and `--duration-spin` as `[object Object]`. `index.css` overrides both, with raw `150ms` and `600ms` literals that no token covers. I keep the override as is, and the token export bug is out of scope.
  - |
    I did not open the states sheet markup in `style-guide.html` in detail, only `prototype-utils.css`. The implementer must diff `.empty-state`, loading, error, 404 and inbox against the sheet before editing. If the sheet needs different copy, keep the current wording (AC7).
  - |
    Contrast. The tokens say they are AA, but I did not compute every pair. The AC8 test computes them. If a pair fails, such as `--color-fg-muted` on `--color-skeleton`, the fix is to switch the text token. No new colour literal.
  - |
    The e2e tests assume the Playwright config can run at both viewport widths and that `page.route` stubs cover each page. I did not read `playwright.config.ts`.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — CSS and markup-class changes only, with no stored data, settings or env vars.

  Token loading: `apps/web/src/index.css` line 2 does `@import "../../../design-system/tokens.css";` after `@import "tailwindcss";` on line 1. Lines 5-8 override the two broken duration tokens. `main.tsx` imports the stylesheet. I did not read `main.tsx` or `vite.config.ts` in detail. Every rule in this plan uses `var(--token)` and adds no new global.

  ```mermaid
  flowchart TD
    main[main.tsx] --> css[index.css]
    tokens[design-system/tokens.css] --> css
    app[App.tsx] --> header[AppHeader.tsx]
    header --> css
    app --> nf[NotFoundPage.tsx]
    app --> inbox[local/LocalInboxPage.tsx]
    nf --> css
    inbox --> css
    css --> dstest[designSystem.test.ts]
    css --> e2e[e2e/foundations.spec.ts]
    classDef touched fill:#f96,color:#000
    class css,header,nf,inbox,dstest,e2e touched
  ```
  `index.css` carries all the visual changes. `AppHeader.tsx`, `NotFoundPage.tsx` and `LocalInboxPage.tsx` change only if a class hook is needed. The two test files are new.
review_focus: |
  IN: the shared stylesheet, the header pill row, touch targets, focus, reduced motion, the states styling, the no-third-party guard and the tests. OUT: individual screen layouts, any copy change, and any new dependency. Riskiest area: the phone media block in `index.css`. Raising min-height to 48px and making the nav scroll can regress other layouts, so check the e2e at 375px. Deliberate: no Menu button, despite UI-GUIDELINES.md, because AC5 says so. No shadow is added, because no shadow token exists.
