summary: |
  The costs page's currency conversion calls `/rates/convert` and the availability call hits `/availability`, but the Vite dev proxy list (`API_PREFIXES` in `apps/web/src/devProxy.ts`) omits `/rates` and `/availability`. In local development those requests are served by the Vite dev server (SPA fallback HTML) instead of reaching the API, so the costs page errors when another currency is chosen. The fix is to add both prefixes to the proxy list, test-first. No currency logic or API code changes.
scope:
  - description: |
      Add `'/rates'` and `'/availability'` to `API_PREFIXES` so `apiProxy()` forwards them to the API origin. Neither is a client-side route, so the `pageRequestBypass` behaviour needs no change.
    files:
      - apps/web/src/devProxy.ts
      - apps/web/src/devProxy.test.ts
    rationale: |
      Matches AC3 and AC4 (calls reach the API locally) and so AC1 and AC2 (converted costs, no error). API routers `/rates` and `/availability` already exist in `services/api/app/main.py`.
tests:
  - |
    AC3 and AC4, written first in `apps/web/src/devProxy.test.ts`: extend the "proxies every path" list with `'/rates'` and `'/availability'`. It fails now because `proxy['/rates']` is undefined.
    ```ts
    expect(proxy['/rates'].target).toBe('http://127.0.0.1:9100')
    expect(proxy['/availability'].target).toBe('http://127.0.0.1:9100')
    ```
  - |
    AC3, data requests still proxied, page loads untouched:
    ```ts
    expect(pageRequestBypass({ url: '/rates/convert?amount=10&from=USD&to=EUR', headers: { accept: '*/*' } })).toBeUndefined()
    ```
  - |
    AC1 and AC2 are covered by the existing `apps/web/src/trips/CostsPage.test.tsx` conversion tests, which mock `convertCost`. The proxy test is the regression guard for the local-dev failure. Narrow command is `cd apps/web && pnpm run test -- src/devProxy.test.ts src/trips/CostsPage.test.tsx`.
assumptions_or_open_questions:
  - |
    Assumed the cause is the missing proxy entries. I confirmed `/rates` and `/availability` are absent from `API_PREFIXES` and that `convertApi.ts` calls a relative `/rates/convert`. I did not run the dev server to reproduce the error.
  - |
    The starter-country decision in the deferred questions (Japan, Portugal, India, etc.) is unrelated to this item and is not used.
estimated_points: 1
package_dependencies: []
notes: |
  ### Data & rollout

  None — dev-server proxy config only, no stored data, settings or migrations.

  `apps/web/vite.config.ts` already calls `apiProxy(process.env.API_ORIGIN ?? 'http://localhost:8000')`, so only the prefix list changes. No UI or styling is touched.
review_focus: |
  IN scope: the two proxy prefixes and their test. OUT: currency logic, API routers and the CostsPage UI. The risk is low. Check that neither prefix collides with a client-side route, since the page-load bypass serves index.html for HTML requests anyway.
