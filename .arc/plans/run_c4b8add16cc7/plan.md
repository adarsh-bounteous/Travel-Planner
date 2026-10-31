summary: |
  Two pieces, both in the web app plus one small API gate. (1) A reusable `FallbackNotice` component that renders the
  `.alert .alert-warning` bar "Live data unavailable, showing saved data" with `role="status"` only when a result's
  `source` is `"fallback"` (the API already returns `Sourced.source: "live" | "fallback"` from
  `services/api/app/integrations/fallback.py`). No screen is wired to real data in this item. (2) The existing
  `/account/local-mode` page (`LocalModePage`) gains a provider list fed by the existing `GET /providers/status`:
  each provider is a `.card` row with its name, kind, and health as a coloured dot + text label inside a `.badge`;
  an `.empty-state` when none are registered; and a refusal view for a signed-in non-developer. Because the repo has
  no developer role today, the API endpoint gets a developer gate that answers 403 `forbidden`.
scope:
  - description: |
      Reusable notice. New component, following the prototype's "Result (saved data)" screen:
      `<div class="alert alert-warning cluster" role="status"><AlertIcon/> <span>Live data unavailable, showing saved data</span></div>`.
      Renders `null` for `source === 'live'`.

      ```tsx
      export type DataSource = 'live' | 'fallback'
      export function FallbackNotice({ source }: { source: DataSource }): JSX.Element | null
      ```
      Reuse, do not re-create: `.alert`, `.alert-warning`, `.alert.cluster` and `.alert .icon` already exist in
      `apps/web/src/index.css` (lines 68-72), and `AlertIcon` in `apps/web/src/auth/icons.tsx:11`. The prototype's
      `.fallback-notice` rule only adds flex layout and a bottom margin, which `.alert.cluster` and the parent
      `.stack` gap already provide, so no new CSS. The existing components (OptionCard, CompareTable, ImageFrame)
      do not cover this.
    files:
      - apps/web/src/components/FallbackNotice.tsx
      - apps/web/src/components/FallbackNotice.test.tsx
    rationale: |
      AC1, AC2, AC3, AC5. "Later screens show it when source is a fallback", so it takes the `source` value and
      decides itself, which keeps every later screen to one line.
  - description: |
      Provider list on `LocalModePage`. Add `fetchProviderStatus()` to `apps/web/src/travel/api.ts` (next to
      `fetchLocalMode`/`setLocalMode`) returning a discriminated result, because the page must tell 403 from 404:

      ```ts
      export type ProviderStatus = { name: string; kind: string; health: string }
      export type ProviderLoad =
        | { state: 'ready'; providers: ProviderStatus[] }
        | { state: 'refused' }      // 403 forbidden: signed in, not a developer
        | { state: 'unavailable' }  // 404 (not local mode) or any other failure
      export async function fetchProviderStatus(): Promise<ProviderLoad>
      ```
      Implement with a plain `fetch('/providers/status', { credentials: 'same-origin' })`, like `setLocalMode`.

      New `ProviderList` component in `apps/web/src/account/ProviderList.tsx`, built from the prototype "Local mode"
      screen: a `div.stack.stack-sm` with `role="list"` and `aria-label="Registered providers"`; each provider a
      `div.card.provider-row` with `role="listitem"`, left `div.provider-name` (`<strong>name</strong>` and
      `span.provider-kind` with the kind), right `span.badge.<class>.provider-health` holding
      `<span class="dot" aria-hidden="true">` followed by the text label. Empty list renders the prototype's
      `.empty-state` with the info icon (`InfoIcon`, `auth/icons.tsx:26`), `<h2>No providers are registered.</h2>` and
      `<p>Register a provider in your local configuration, then reload this page.</p>`.

      Health mapping (API states come from `HealthState` in `services/api/app/providers/registry.py`):
      healthy to `badge-success` "Healthy"; configured to `badge-neutral` "Configured"; degraded to `badge-warning`
      "Degraded"; open circuit to `badge-danger` "Down (circuit open)"; not configured to `badge-neutral` "Not configured".
      The dot takes the badge's text colour via `background: currentColor`, and the label always carries the meaning (AC8).

      `LocalModePage` edits: load providers in a second `useEffect`; show 3 `.card` + `.skeleton` placeholders with
      `aria-busy="true"` on the list while loading; render `ProviderList` under the switch only for `ready`; hide the
      section silently for `unavailable` (so the existing switch tests, whose stub answers 404, are unchanged); for
      `refused` return early with the prototype's refusal view: `<h1>Access refused</h1>` plus
      `<div className="alert alert-danger" role="alert"><p>This page is for developers only.</p></div>`, and render
      no provider or switch data. Include the prototype's "Refresh health" `.btn.btn-secondary` that re-runs the
      fetch, with a `role="status"` note ("Checking providers…" then "Health refreshed").

      CSS: append to `apps/web/src/index.css` only `.provider-row`, `.provider-name`, `.provider-kind`,
      `.provider-health` and `.dot`, copied from the prototype and using only tokens: `--space-2`, `--space-1`,
      `--size-control-lg`, `--size-control-sm`, `--radius-full`, `--color-fg-muted`, `--font-size-sm`,
      `--font-weight-bold`. `.badge`, `.badge-*`, `.card`, `.stack`, `.empty-state`, `.skeleton` exist already.
    files:
      - apps/web/src/travel/api.ts
      - apps/web/src/account/ProviderList.tsx
      - apps/web/src/account/LocalModePage.tsx
      - apps/web/src/account/LocalModePage.test.tsx
      - apps/web/src/index.css
    rationale: |
      AC4, AC6, AC7, AC8. The list lives on the existing page and reuses the existing endpoint; only the dot and row
      layout are new CSS.
  - description: |
      Let the browser reach the endpoint. `/providers` is not in `API_PREFIXES`, so the dev server would serve
      `index.html` instead of proxying the call. Add `'/providers'` to the list in `apps/web/src/devProxy.ts`.
      `pageRequestBypass` already serves the SPA for HTML navigations, and `/providers` is not a client route.
      Check what `apps/web/src/devProxy.test.ts` (or the nearest test over `API_PREFIXES`/`clientApiPaths`) asserts
      and keep it green; `clientApiPaths` in `clientPaths.ts` will now see `/providers` from `travel/api.ts`.
    files:
      - apps/web/src/devProxy.ts
    rationale: |
      Without it the page works in tests (fetch is stubbed) but not in `pnpm dev`. The deployed API Gateway routing
      for `/providers` is outside this repo's web app and is checked in assumptions.
  - description: |
      Developer gate on `GET /providers/status`. Today the route has only `require_local_mode` (404 outside local
      mode) and no sign-in at all. Add `require_developer` and put it after `require_local_mode`:

      ```python
      @router.get("/providers/status", dependencies=[Depends(require_local_mode), Depends(require_developer)])
      ```
      `require_developer(user_id=Depends(get_current_user), identity=Depends(get_identity), settings=Depends(get_settings))`
      raises `ApiError(401, "not_signed_in")` via `get_current_user`, `ApiError(403, "forbidden")` when the user's
      email (`identity.email_for(user_id)`, as in `routers/auth.py:214`) is not a developer, else returns None.
      Developer rule: `settings.developer_emails` (new `frozenset[str]`, lowercase) contains the email; when that set
      is empty AND `settings.local_mode` is true, every signed-in user counts as a developer so local setup needs no
      config. New setting `developer_emails` read from env `DEVELOPER_EMAILS` (comma separated, trimmed, lowercased,
      default empty) in `services/api/app/config.py`, documented in `services/api/README.md`.
      Existing tests in `services/api/tests/unit/test_providers_status.py` call `/providers/status` with no cookie
      (lines 79-85), so they must be updated to sign in first; the `/startup-status` tests are untouched.
    files:
      - services/api/app/routers/providers_status.py
      - services/api/app/routers/deps.py
      - services/api/app/config.py
      - services/api/README.md
      - services/api/tests/unit/test_providers_status.py
    rationale: |
      AC7 needs a real refusal, and a front-end-only check would still leak provider data. No developer concept exists
      in the repo (searched `developer` across the repo, only a "Developer tools" comment in `LocalMenu.tsx`), so
      this is the smallest rule that works; it is the main open question below.
tests:
  - |
    AC1 (write first, fails until FallbackNotice exists), `apps/web/src/components/FallbackNotice.test.tsx`:
    ```tsx
    render(<FallbackNotice source="fallback" />)
    expect(screen.getByText('Live data unavailable, showing saved data')).toBeInTheDocument()
    ```
  - |
    AC2, same file:
    ```tsx
    const { container } = render(<FallbackNotice source="live" />)
    expect(screen.queryByText('Live data unavailable, showing saved data')).toBeNull()
    expect(container).toBeEmptyDOMElement()
    ```
  - |
    AC3, same file:
    ```tsx
    render(<FallbackNotice source="fallback" />)
    expect(screen.getByRole('status')).toHaveClass('alert')
    ```
  - |
    AC5, same file (a `status` role is announced politely by screen readers):
    ```tsx
    render(<FallbackNotice source="fallback" />)
    expect(screen.getByRole('status')).toHaveTextContent('Live data unavailable, showing saved data')
    ```
  - |
    AC4, `apps/web/src/account/LocalModePage.test.tsx`, stub `'GET /providers/status'` with
    `{ providers: [{ name: 'places', kind: 'maps and places', health: 'healthy' }, { name: 'flights', kind: 'flight search', health: 'degraded' }] }`:
    ```tsx
    renderAt('/account/local-mode')
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('places')).toBeInTheDocument()
    expect(within(rows[0]).getByText('maps and places')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Degraded')).toBeInTheDocument()
    ```
  - |
    AC8, same file:
    ```tsx
    const label = within((await screen.findAllByRole('listitem'))[0]).getByText('Healthy')
    expect(label).toHaveClass('badge-success')
    expect(label.querySelector('.dot')).toHaveAttribute('aria-hidden', 'true')
    ```
    plus an `it.each` over `healthy`, `configured`, `degraded`, `open circuit`, `not configured` checking the label text and badge class.
  - |
    AC6, same file, stub `'GET /providers/status'` with `{ providers: [] }`:
    ```tsx
    expect(await screen.findByText('No providers are registered.')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    ```
  - |
    AC7 web, same file, stub `'GET /providers/status': { status: 403, body: { code: 'forbidden' } }`:
    ```tsx
    expect(await screen.findByRole('alert')).toHaveTextContent('This page is for developers only.')
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(screen.queryByLabelText('On')).toBeNull()
    ```
  - |
    AC7 API, `services/api/tests/unit/test_providers_status.py`: sign in as a user whose email is not in `DEVELOPER_EMAILS`:
    ```python
    monkeypatch.setenv("DEVELOPER_EMAILS", "dev@example.com")
    r = client.get("/providers/status")  # cookie for another@example.com
    assert (r.status_code, r.json()) == (403, {"code": "forbidden"})
    ```
    and the matching 200 for `dev@example.com`, 401 `{"code": "not_signed_in"}` with no cookie, and
    ```python
    assert client.get("/providers/status").json()["providers"][0].keys() == {"name", "kind", "health"}  # empty allowlist + local mode
    ```
    The existing `test_providers_status_is_404_outside_local_mode` keeps asserting `(404, {"code": "not_found"})`.
  - |
    Regression: the two existing `LocalModePage` tests stay green with no change (their stub answers 404 for
    `/providers/status`, which must render no list and no `alert`). Add one test that the 404 case shows no
    provider section and no refusal. Add a test that "Refresh health" calls `/providers/status` a second time.
    Run the narrow form, for example
    `(cd apps/web && pnpm run test -- src/components/FallbackNotice.test.tsx src/account/LocalModePage.test.tsx)` and
    `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_providers_status.py)`.
assumptions_or_open_questions:
  - |
    OPEN QUESTION, needs a reviewer decision. The repo has no "developer" role: sessions carry only a user id
    (`get_current_user` in `services/api/app/routers/deps.py:373`) and "developer tools" simply means local mode is on.
    I planned an allowlist `DEVELOPER_EMAILS`, with every signed-in user treated as a developer in local mode when
    it is empty. If you want a different rule (for example an account flag, or developer equals local mode on, which
    would make AC7 untestable), say so and I will change the gate. Under the proposed rule a non-developer can only
    ever see the refusal when an allowlist is set.
  - |
    Behaviour change to flag: `/providers/status` is currently unauthenticated in local mode. Adding sign-in plus the
    developer check changes existing API tests (listed in scope). `/startup-status` already returns the same provider list
    publicly and is not changed.
  - |
    Refusal scope. The page also holds the existing local-mode switch, which every signed-in user can use today. I
    refuse the whole page only on a 403 from the providers call, and hide just the provider section on a 404 (live
    deployment), so the existing switch behaviour and tests do not change. Say if non-developers should lose the switch too.
  - |
    Prototype vs the API. The prototype shows only healthy, degraded and down; the API's `HealthState` also has
    `configured` and `not configured` and calls the failing state `open circuit`. I added labels and badge classes for
    all five (mapping in scope) rather than changing the API. "Down (circuit open)" is my wording for `open circuit`.
  - |
    Prototype conflict with the tokens file: its inlined `tokens.css` has `--duration-fast: [object Object]`. The app
    already overrides these in `index.css` (line 4 comment), so no action here.
  - |
    Provider names in the prototype are friendly ("OpenStreetMap tiles"), whereas the API returns ids such as `places`.
    The page shows what the API sends; no display-name mapping is added.
  - |
    Not verified: how `/providers/*` is routed in the deployed API Gateway/CloudFront (not in this repo's web app). Only
    the Vite dev proxy is covered here (`apps/web/src/devProxy.ts`). Check infra if it lives elsewhere.
  - |
    Out of scope: wiring FallbackNotice into any real screen (the work item says no screens are wired yet), the
    "Refresh health" button beyond re-fetching, and any change to the `Sourced` model.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  One new optional setting, `DEVELOPER_EMAILS` (env var), default empty, which is safe when unset: in local mode every
  signed-in user is a developer, outside local mode the endpoint stays 404 anyway. Documented in `services/api/README.md`
  and read in `services/api/app/config.py`. No schema, migration, stored data, seed or provisioning change. Deploy API
  and web together; the new web page tolerates an old API (a 404 simply hides the list). Rollback is reverting the commit.

  ### Design references (read from the approved prototype)

  Screens "Result (live data)", "Result (saved data)", "Local mode", "Local mode (no providers)" and
  "Local mode (not a developer)". Single column inside the shell's `--size-content-max`; the notice sits above the result
  text in a `.stack`; providers are a `.stack.stack-sm` of `.card` rows; `.badge` plus `.dot` for health; `.empty-state`
  with the info icon; refusal is `.alert-danger` with `role="alert"`; loading is three `.skeleton` cards. Tokens are
  loaded already: `apps/web/src/index.css:2` runs `@import "../../../design-system/tokens.css"` right after
  `@import "tailwindcss"`. Other design-system tokens are used by name only, no colour or pixel literals.
  `FallbackNotice` replaces the prototype's `.fallback-notice` rule with `.alert.cluster`.

  ```mermaid
  flowchart TD
    App["App.tsx route /account/local-mode"] --> LMP["LocalModePage.tsx"]
    LMP --> PL["ProviderList.tsx (new)"]
    LMP --> API["travel/api.ts fetchProviderStatus"]
    API --> PROXY["devProxy.ts API_PREFIXES"]
    PROXY --> PS["routers/providers_status.py"]
    PS --> REG["providers/registry.py statuses()"]
    PS --> DEPS["routers/deps.py require_developer"]
    DEPS --> CFG["config.py developer_emails"]
    FN["components/FallbackNotice.tsx (new)"] --> ICONS["auth/icons.tsx AlertIcon"]
    LATER["later result screens (not wired)"] -.-> FN
    classDef touched fill:#f96,color:#000
    class LMP,PL,API,PROXY,PS,DEPS,CFG,FN touched
  ```
  Orange nodes are changed or new. LocalModePage and ProviderList render the list, `fetchProviderStatus` separates
  403 from 404, `devProxy.ts` lets the call through, and the API trio adds the developer gate. FallbackNotice is
  standalone for later screens.
review_focus: |
  IN: the reusable `FallbackNotice`, the provider list and refusal on `/account/local-mode`, the `/providers` dev-proxy
  entry, and a developer gate on `GET /providers/status`. OUT: wiring the notice into any real screen. Riskiest part is the
  developer rule: no developer role exists, so `DEVELOPER_EMAILS` plus "everyone in local mode when unset" is a stated
  assumption awaiting confirmation, and it changes existing `/providers/status` tests. Deliberate: a 404 hides the
  provider section instead of refusing, so the existing switch tests stay untouched; the label text, not the dot, carries health.
