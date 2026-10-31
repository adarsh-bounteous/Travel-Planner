summary: |
  The starter destinations fail to load because `/starter-destinations` is missing from `API_PREFIXES` in `apps/web/src/devProxy.ts`. The Vite dev server therefore answers the client's fetch with `index.html`, the JSON parse fails, and `StarterPlannerPage` shows "We couldn't load the starter destinations." This plan (1) adds the prefix, (2) adds a guard test that scans the web app's API client modules for every path they call and fails if the first path segment is not forwarded, (3) adds a minimal production-routing check that fails and names any client path the API does not route, and (4) closes the two starter-flow gaps found in the code: no empty-state message for a country with no places (AC4) and no test that Back to trip returns to the planner (AC6). Test-first throughout.
scope:
  - description: |
      Add the missing prefix to `API_PREFIXES` (root cause, AC1-AC3):
      ```ts
      export const API_PREFIXES = [ /* ...existing... */ '/starter-destinations' ]
      ```
      Also extend the existing prefix list assertion in `devProxy.test.ts`.
    files:
      - apps/web/src/devProxy.ts
    rationale: Same class of fault as the earlier `/rates` bug; `apiProxy()` builds the Vite proxy from this list (`vite.config.ts:37`).
  - description: |
      Guard test (AC7, and the deferred question on how to enumerate client paths). Add a small helper `clientApiPaths(srcDir: string): { path: string; file: string }[]` in a test-support module `apps/web/src/clientPaths.ts`. It walks `apps/web/src` with `node:fs`, skips `*.test.*` and `node_modules`, and regex-extracts the first path segment of every string/template literal passed to `call(`, `call<...>(`, `fetch(`, `post(` or `window.location.assign(` that starts with `/`:
      ```ts
      const CALL = /\b(?:call(?:<[^(]*?>)?|fetch|post|assign)\(\s*[`'"](\/[^/?`'"$]*)/g
      ```
      The guard test in `devProxy.test.ts` compares each first segment with `Object.keys(apiProxy('http://x'))` and fails with a message that names the path and file:
      ```ts
      const missing = clientApiPaths(srcDir).filter(({ path }) => !(path in proxy))
      expect(missing, `client paths not forwarded by the dev server: ${JSON.stringify(missing)}`).toEqual([])
      ```
      It must also include a sanity assertion that the scan finds a non-trivial set (for example it includes `/starter-destinations` and `/trips`), so a broken regex cannot pass vacuously.
    files:
      - apps/web/src/clientPaths.ts
      - apps/web/src/devProxy.test.ts
    rationale: Static source scan avoids mocking every client; it runs in the existing vitest suite and fails when a new client path is added without a prefix. `clientPaths.ts` is not imported by app code, so the bundle is unaffected.
  - description: |
      Minimal production-routing check (AC8). The repo holds no CDN/gateway config (searched for CloudFront, API Gateway, rewrites, _redirects, vercel, netlify, tf/SAM/serverless files: only prose in ADR-0002 and the Mangum note in `.arc/config/components.yaml`). Production is "one API behind API Gateway" fronting the FastAPI app, so the only routing the repo defines is the routes the app mounts. Add a pytest in `services/api/tests/unit/test_client_paths_routed.py` that reads the web client sources under `apps/web/src` (same regex as above, ported to Python), takes each first path segment and asserts the FastAPI `app` has at least one route whose path starts with it:
      ```python
      def test_every_web_client_path_is_routed():
          routed = {"/" + r.path.lstrip("/").split("/")[0] for r in app.routes if hasattr(r, "path")}
          missing = sorted(p for p in client_paths() if p not in routed)
          assert not missing, f"web client paths not routed in production: {missing}"
      ```
      Also add a tiny self-test that feeds a fake path through the comparison helper and asserts the failure message names it (proves AC8's "names the missing path").
    files:
      - services/api/tests/unit/test_client_paths_routed.py
    rationale: Keeps the check in the pytest half of the project test command, with no new dependency. It catches a client path the API never serves; it cannot see an actual gateway config, which does not exist in the repo (see open questions).
  - description: |
      Starter flow gaps. (a) AC4: when a country is chosen and `country.places.length === 0`, `StarterPlannerPage` shows an empty-state message `No starter places are available for {country.name}.` in the Place field in place of the "0 places in X." hint, using the existing `field-hint` class. (b) AC5/AC6 need no code change if the tests below pass (the `View place content` link and the `Back to trip` link, which returns to `STARTER_PLAN_PATH` with `state={{ country, place }}`, already exist at `StarterPlannerPage.tsx:122` and `StarterPlaceContentPage.tsx:45`). If the Back to trip test fails, fix in those two files.
    files:
      - apps/web/src/places/StarterPlannerPage.tsx
    rationale: AC4 is not implemented today. No new component and no new styles, so no design-token work is needed.
  - description: |
      Extend the existing playwright spec so the production-like flow clicks Back to trip and sees the planner with the picks restored (the spec already stubs the API at the network edge). Not part of the command's verification step, since playwright is run separately.
    files:
      - apps/web/e2e/starter-destinations.spec.ts
    rationale: End-to-end evidence for AC5-AC6.
tests:
  - |
    AC1/AC2 (`apps/web/src/devProxy.test.ts`, write first, fails today): the list assertion gains `'/starter-destinations'` and `expect(proxy['/starter-destinations'].target).toBe('http://127.0.0.1:9100')`. Also `expect(pageRequestBypass({ url: '/starter-destinations', headers: { accept: '*/*' } })).toBeUndefined()` so data requests are forwarded. The existing `StarterPlannerPage.test.tsx` cases ("lists exactly the seven countries") and the `failed` case remain; add `expect(screen.queryByText(/We couldn't load the starter destinations/)).not.toBeInTheDocument()` to the loaded case.
  - |
    AC3 (`StarterPlannerPage.test.tsx`): choose Japan from the mocked catalogue, then `expect(await screen.findByRole('option', { name: 'Tokyo' })).toBeInTheDocument()` after opening the Place list (the existing "lists three places" test already covers this; confirm it asserts the places).
  - |
    AC4 (`StarterPlannerPage.test.tsx`, fails today): mock the catalogue with `{ name: 'Atlantis', places: [] }`, choose it, then `expect(screen.getByText('No starter places are available for Atlantis.')).toBeInTheDocument()`.
  - |
    AC5 (`StarterPlannerPage.test.tsx`, in a `MemoryRouter` with a `/trips/plan/:country/:place` route): pick Japan and Tokyo, click the `View place content` link, then `expect(await screen.findByRole('heading', { name: 'Tokyo' })).toBeInTheDocument()`.
  - |
    AC6 (`StarterPlaceContentPage.test.tsx`, new case): render at `/trips/plan/Japan/Tokyo` with the planner routed at `/trips/plan`, click `Back to trip`, then `expect(await screen.findByRole('heading', { name: 'Plan a trip' })).toBeInTheDocument()` and assert the Japan and Tokyo picks are shown.
  - |
    AC7 (`devProxy.test.ts` guard): `expect(missing, ...).toEqual([])` over `clientApiPaths(...)`. Verify the guard really fails by running it once with `'/starter-destinations'` temporarily removed from `API_PREFIXES` and confirming the failure names the path (red before the prefix is added, in TDD order). Plus `expect(found).toContain('/starter-destinations')`.
  - |
    AC8 (`services/api/tests/unit/test_client_paths_routed.py`): `assert not missing, f"web client paths not routed in production: {missing}"` and the self-test `assert "/nope" in format_missing(["/nope"])`. Narrow command: `cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_client_paths_routed.py`. Web: `cd apps/web && pnpm run test -- src/devProxy.test.ts src/places`.
assumptions_or_open_questions:
  - |
    Deferred question answered: enumerate client paths by a static regex scan of the non-test `.ts/.tsx` sources in `apps/web/src` for string and template literals passed to `call`, `fetch`, `post` and `assign` (first path segment only), compared with `Object.keys(apiProxy(...))`. Dynamic paths built from variables would not be seen; none exist today (all calls use literals).
  - |
    Production routing: no CDN or gateway configuration exists in the repo (I searched for CloudFront, API Gateway, rewrites, _redirects, vercel, netlify, Terraform, SAM and serverless files). AC8's check therefore compares client paths with the routes the FastAPI app mounts, which is what the single API Gateway in ADR-0002 forwards to. If a real gateway or CDN route table lives outside this repo, a human should say where, so the check can read it.
  - |
    AC6 reads "the traveller's trip is shown". The code has no saved trip in the starter flow, so I take it as the starter planner at `/trips/plan` with the traveller's country and place picks restored. Please confirm.
  - |
    AC4 wording: the message text `No starter places are available for {country}.` is my choice; the item only fixes its meaning. The API's seeded catalogue has no country without places today, so this state is reachable only with a different catalogue.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout
  None — dev-server proxy list, UI copy and tests only; no stored data, schema, seed or setting changes. Safe to leave in place; roll back by reverting the commit.

  Design tokens: no new UI component or style is added (the empty state reuses the existing `field-hint` class), so no token work is planned.

  Root cause evidence: `apps/web/src/places/starterApi.ts:15` calls `call('/starter-destinations')`, `devProxy.ts` lists 14 prefixes and not this one, and `vite.config.ts:37` builds the proxy from it. The router (`services/api/app/routers/starter_destinations.py`, included at `app/main.py:79`) already works.

  ```mermaid
  flowchart TD
    A[starterApi.ts call /starter-destinations] --> B[trips/api.ts call fetch]
    V[vite.config.ts server.proxy] --> D[devProxy.ts API_PREFIXES]
    D --> R[FastAPI app main.py routers]
    G[devProxy.test.ts guard] --> C[clientPaths.ts scan]
    C --> A
    G --> D
    P[test_client_paths_routed.py] --> C2[web client sources]
    P --> R
    S[StarterPlannerPage.tsx empty state] --> A
    classDef touched fill:#f96,color:#000
    class D,G,C,P,S touched
  ```
  Touched nodes: `devProxy.ts` (missing prefix), `devProxy.test.ts` and `clientPaths.ts` (dev-server guard), `test_client_paths_routed.py` (production routing check), `StarterPlannerPage.tsx` (AC4 empty state).
review_focus: |
  IN: the one-line prefix fix, the two path-scan guards, the AC4 empty state, and tests for AC5/AC6. OUT: other pages and any real gateway config (none exists in the repo). Riskiest part is the regex scan, which could pass vacuously or miss a call style, so the sanity assertion that it finds `/starter-destinations` is deliberate. The production check compares against FastAPI's mounted routes because no gateway/CDN config is in the repo; that is a stated assumption, not an oversight.
