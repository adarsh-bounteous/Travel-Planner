# Phase 2 closing check: evidence

Before ref: `2b1c9e9`, the commit just before phase 2 started (the plan commit of the first phase 2 story, parent `2efd6b9`). Both sides are fresh builds; `apps/web/bundle-baseline.json` is not used.

Regenerate from `apps/web` (needs network for `pnpm install` in the before worktree, and Playwright's Chromium):

| Command | Writes |
|---|---|
| `pnpm run phase2:bundle` | `bundle-report.md`, `bundle-report.json`. Exits 1 when main or largest route grows more than 10%. The illustration set is its own row. |
| `pnpm run phase2:lighthouse` | `lighthouse.md`, `lighthouse.json`. Median of 3 runs per page; exits 1 when any performance or accessibility score is lower after. |
| `pnpm run phase2:screenshots` | `{home,my-trips,trip-planner}-{before,after}-{390,1280}.png` |

Pages: Home is `/` signed in with no trips, My trips is `/` signed in with trips, Trip planner is `/trips/t1`. Both builds are served by the same static server with the same mocked API (`scripts/phase2-harness.mjs`), since the app has no `/trips` list route.

Contrast (light theme, every palette in `trips/tripPalettes.ts`, and hero text over the art under its scrim) is checked by `src/themeContrast.test.ts`, which runs with `pnpm run test`. It is computed from the palette values, SVG fills and scrim stops, not by sampling rendered pixels.

`src/phase2Evidence.test.ts` fails until the 12 screenshots and the reports exist here.
