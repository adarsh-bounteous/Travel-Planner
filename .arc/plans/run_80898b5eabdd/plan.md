summary: |
  Closing check for phase 2 polish: prove it did not bloat or degrade the app. Add (1) a bundle comparison that builds the pre-phase-2 commit and the current commit fresh and reports main-bundle and largest-route growth against a 10% ceiling, with the illustration set's total size as a separate figure; (2) a Lighthouse before/after run (performance and accessibility) on Home, My trips and the trip planner page, failing if any after-score is lower; (3) vitest contrast tests over the light theme and every per-trip accent palette, including text over illustrations; (4) before/after screenshots at 390px and 1280px saved to docs/design/after/phase-2/. Reports are committed as evidence. No product UI is changed unless a check fails, in which case the fix is a separate, minimal change.
scope:
  - description: |
      Extend the bundle script so it compares two fresh builds. New signature of the pure part, exported for testing:
      `export function compareBundles(before: BundleStats, after: BundleStats, ceilingPct = 10): BundleReport`
      where BundleStats = { main: {bytes, gzipBytes}, largestRoute: {bytes, gzipBytes}, illustrations: {bytes, gzipBytes, count} }.
      Illustration set size = sum of the emitted dist/assets/*.svg (the lazy `./art/*.svg` glob in illustrations/registry.ts) plus any small-asset chunk that wraps them; reported as its own figure, never added into main or largest route. The CLI builds the before ref in a git worktree inside the repo's gitignored scratch dir (never outside the worktree), runs `pnpm install --frozen-lockfile && pnpm run build` there, measures, then measures the current build, and writes docs/design/after/phase-2/bundle-report.json and .md. Exits non-zero when either growth is above 10%.
    files:
      - apps/web/scripts/measure-bundle.mjs
      - apps/web/scripts/bundle-compare.mjs
      - apps/web/scripts/bundle-compare.test.ts
      - apps/web/package.json
      - docs/design/after/phase-2/bundle-report.md
    rationale: |
      measure-bundle.mjs already finds the entry chunk and the largest non-entry chunk from dist/index.html; reuse that logic by moving the size helpers into bundle-compare.mjs. Today the app has one entry chunk, so main and largest route are the same file; the report states that explicitly if still true.
  - description: |
      Lighthouse harness: a script that serves a fresh build with `vite preview` for the before ref and the current ref, and runs Lighthouse (performance and accessibility categories only) against /, /trips (My trips) and one trip planner URL, using the Playwright-installed Chromium and the same mocked API seeding the existing e2e specs use. Median of 3 runs per page. Pure helper `assertNoRegression(before: Scores, after: Scores): string[]` returns the list of pages where either score dropped. Output docs/design/after/phase-2/lighthouse.json and .md.
    files:
      - apps/web/scripts/lighthouse-compare.mjs
      - apps/web/scripts/lighthouse-compare.test.ts
      - apps/web/package.json
      - docs/design/after/phase-2/lighthouse.md
    rationale: |
      Lighthouse is the measurement tool the story names. Scores are noisy, so use the median of runs and the same machine and throttling for both sides.
  - description: |
      Contrast tests. Reuse `lum`/`ratio` already in designSystem.test.ts by extracting them to a shared test helper, then add tests iterating `PALETTES` from trips/tripPalettes.ts (lisbon, kyoto, marrakech, paris, neutral) plus the light theme tokens. Pairs: white on hero (hero text), ink on white, ink on subtle, fg on subtle. For text over illustrations: for each palette composite the text's real scrim/overlay over the illustration's sky/sun/deep fills (and the destination SVG fills read from art/*.svg) and assert each text-over-image pair is at least 4.5:1. Neutral palette values are CSS vars, so resolve them from design-system/tokens.css.
    files:
      - apps/web/src/test/contrast.ts
      - apps/web/src/themeContrast.test.ts
      - apps/web/src/designSystem.test.ts
    rationale: |
      Palette literals live in tripPalettes.ts (index.css is tokens only), so the test reads that module directly and cannot drift from what ships. Any failing pair is fixed by changing only that palette value, as its own follow-up commit, and noted in the report.
  - description: |
      Screenshots: a Playwright script (not part of the default `pnpm run e2e` suite) that captures Home, My trips and trip planner at 390px and 1280px widths for the before ref and the current build, saved as before-390.png style names under docs/design/after/phase-2/ (home-before-390.png, home-after-390.png, home-before-1280.png, home-after-1280.png, and likewise for my-trips and trip-planner). A vitest check asserts all 12 files exist and are non-empty PNGs of the right width.
    files:
      - apps/web/scripts/capture-phase2.mjs
      - apps/web/src/phase2Evidence.test.ts
      - docs/design/after/phase-2/README.md
    rationale: |
      The evidence folder is an acceptance criterion; the existence test keeps it from silently going missing.
tests:
  - |
    AC1 — apps/web/scripts/bundle-compare.test.ts, written first and failing because compareBundles does not exist:
    ```ts
    const r = compareBundles(stats({ main: 1000 }), stats({ main: 1100 }))
    expect(r.main.growthPct).toBeCloseTo(10)
    expect(r.main.withinCeiling).toBe(true)
    expect(compareBundles(stats({ main: 1000 }), stats({ main: 1101 })).main.withinCeiling).toBe(false)
    ```
  - |
    AC2 — same file, largest route compared independently of main:
    ```ts
    const r = compareBundles(stats({ route: 500 }), stats({ route: 551 }))
    expect(r.largestRoute.withinCeiling).toBe(false)
    expect(r.main.withinCeiling).toBe(true)
    ```
    Final gate is running the CLI: `cd apps/web && node scripts/bundle-compare.mjs --before <ref>` exits 0.
  - |
    AC3 — illustration bytes are their own figure and excluded from main and route:
    ```ts
    const r = compareBundles(stats({ main: 1000, illustrations: 4000 }), stats({ main: 1000, illustrations: 9000 }))
    expect(r.illustrations.afterBytes).toBe(9000)
    expect(r.main.afterBytes).toBe(1000)
    expect(renderReport(r)).toMatch(/Illustration set.*9000/)
    ```
  - |
    AC4 — apps/web/scripts/lighthouse-compare.test.ts:
    ```ts
    expect(assertNoRegression({ home: { perf: 90, a11y: 100 } }, { home: { perf: 89, a11y: 100 } })).toEqual(['home performance 90 -> 89'])
    expect(assertNoRegression({ home: { perf: 90, a11y: 100 } }, { home: { perf: 91, a11y: 100 } })).toEqual([])
    ```
    Also asserts the report names all three pages (home, my-trips, trip-planner). Final gate is the real run on the two builds.
  - |
    AC5 — same file, accessibility drop is flagged:
    ```ts
    expect(assertNoRegression({ trip: { perf: 80, a11y: 100 } }, { trip: { perf: 80, a11y: 96 } })).toEqual(['trip accessibility 100 -> 96'])
    ```
  - |
    AC6 — apps/web/src/themeContrast.test.ts:
    ```ts
    describe.each(Object.values(PALETTES))('$name palette text', (p) => {
      it('hero text, ink on white and ink on subtle are at least 4.5:1', () => {
        expect(ratio('#ffffff', resolve(p.hero))).toBeGreaterThanOrEqual(4.5)
        expect(ratio(resolve(p.ink), '#ffffff')).toBeGreaterThanOrEqual(4.5)
        expect(ratio(resolve(p.ink), resolve(p.subtle))).toBeGreaterThanOrEqual(4.5)
      })
    })
    ```
    The test also asserts the palette list has 5 entries, so a new accent theme is covered automatically. The light-theme token pairs already in designSystem.test.ts keep passing.
  - |
    AC7 — same file, text over illustration, per palette:
    ```ts
    it.each(Object.values(PALETTES))('$name: hero text over the lightest illustration fill is at least 4.5:1', (p) => {
      for (const bg of illustrationBackdrops(p)) expect(ratio(heroTextColour, bg)).toBeGreaterThanOrEqual(4.5)
    })
    ```
    illustrationBackdrops returns hero/sky/sun/deep with any scrim composited on top, matching how ImageHero and EmptyStateArt layer text.
  - |
    AC8 and AC9 — apps/web/src/phase2Evidence.test.ts, failing until screenshots are captured:
    ```ts
    it.each(['home', 'my-trips', 'trip-planner'].flatMap((p) => ['390', '1280'].flatMap((w) => ['before', 'after'].map((s) => `${p}-${s}-${w}.png`))))(
      '%s exists', (f) => expect(statSync(resolve(dir, f)).size).toBeGreaterThan(0))
    ```
    The test also reads the PNG IHDR width and expects 390 or 1280 to match the file name.
assumptions_or_open_questions:
  - |
    The before ref is the commit immediately before phase 2 work began. apps/web/bundle-baseline.json records commit 2b1c9e9 and I could not confirm from git (no shell this session) that this is that commit, so the script takes `--before <ref>` and the reviewer must confirm the ref. Phase 2 starts at the Micro-interactions / Icon / Per-trip theme stories (STORY-121 onward in recent history), so the true pre-phase-2 commit may be earlier.
  - |
    Lighthouse is not currently a dependency. Plan adds `lighthouse` as a web devDependency; it needs a Chrome binary, taken from the already-installed Playwright Chromium (`chromium.executablePath()`). If the reviewer would rather run Lighthouse via CI or `npx`, drop the dependency and keep the scripts.
  - |
    "Trip planner page" is taken to be the trip overview route for a seeded trip. The exact route is read from apps/web/src/App.tsx when implementing, and the page needs an authenticated, API-mocked state like the existing e2e specs use.
  - |
    Only 4 per-trip accent palettes plus neutral exist today (lisbon, kyoto, marrakech, paris, neutral); the story's "every per-trip accent theme" is read as PALETTES in trips/tripPalettes.ts. Any pair under 4.5:1 means editing that palette literal, which is a product change beyond a pure check; flagged in the report rather than silently tuned.
  - |
    Contrast over images is computed analytically from palette fills and SVG fill colours plus the scrim, not by pixel sampling a rendered page. Gradients are tested at their lightest stop. If the reviewer wants rendered-pixel sampling, add a Playwright step.
  - |
    If the 10% bundle ceiling or a Lighthouse score fails, this item reports the failure and does not weaken the check; a fix would be a separate decision.
estimated_points: 5
package_dependencies:
  - name: lighthouse
    version: ^12.0.0
    ecosystem: npm
    rationale: Produces the performance and accessibility scores required for the before/after comparison on the three pages.
    component_id: comp_web_app
notes: |
  ### Data & rollout

  None — measurement scripts, tests and committed report/screenshot files only; no stored data, schema, runtime settings or env vars.

  Design tokens: no new UI is added. The app loads design-system/tokens.css through apps/web/src/index.css (verified that index.css is held to tokens only, per the comment in trips/tripPalettes.ts and the checks in designSystem.test.ts). Palette colour literals stay in trips/tripPalettes.ts; this plan adds none. The only colours in the new tests are '#ffffff' for white hero text, a test-only value.

  Reuse: the existing components (ImageHero, EmptyStateArt, ImageFrame, WelcomeHeader) are inspected for text-over-image layering but not modified.

  Scripts that build the before ref use a git worktree under a gitignored directory inside this worktree; nothing is written outside it, and nothing is pushed.

  ```mermaid
  flowchart TD
    A[scripts/measure-bundle.mjs] --> B[scripts/bundle-compare.mjs]
    B --> C[docs/design/after/phase-2/bundle-report]
    D[scripts/lighthouse-compare.mjs] --> E[docs/design/after/phase-2/lighthouse]
    F[trips/tripPalettes.ts PALETTES] --> G[themeContrast.test.ts]
    H[design-system/tokens.css] --> G
    I[illustrations/art svg] --> B
    I --> G
    J[scripts/capture-phase2.mjs] --> K[docs/design/after/phase-2 png]
    classDef touched fill:#f96,color:#000
    class A,B,D,G,J touched
  ```
review_focus: |
  IN scope: measurement scripts, their unit tests, contrast tests over PALETTES, and the evidence folder docs/design/after/phase-2/. OUT: any product UI or palette change, which only happens if a check fails and then as a separate decision. Riskiest areas are the before-ref (must be a fresh build of the true pre-phase-2 commit, not the stored bundle-baseline.json) and Lighthouse noise, handled with median-of-3 on identical settings. Illustration size is deliberately reported separately and excluded from main and route figures.
