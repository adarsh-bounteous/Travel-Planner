summary: |
  Add a reusable `FallbackNotice` component (the `.alert` style, `role="status"`, text "Live data unavailable, showing saved data") that renders only when a result's `source` is `"fallback"`, and extend the existing `/account/local-mode` page (`LocalModePage`) with a provider list: each registered provider shown with its kind and its health as a coloured dot plus a text label, an empty-state message when none are registered, and a refusal when the signed-in user is not a developer. No screen is wired to real data yet, so the notice is only exercised by its own tests. The provider data comes from the existing `GET /providers/status` endpoint, so this is a web-only change.
scope:
  - description: |
      Reusable notice. New component `FallbackNotice` with the signature below. It renders nothing unless `source === 'fallback'`. Otherwise it renders the design's "Result (saved data)" markup: a `div` with classes `alert alert-warning cluster` (the existing `.alert.cluster` rule already sets nowrap and flex-start), `role="status"`, an `AlertIcon` from `auth/icons.tsx`, and the text span.

      ```tsx
      export function FallbackNotice({ source }: { source: string }): JSX.Element | null
      ```

      Source values follow the API's `Source = Literal["live", "fallback"]` in `services/api/app/integrations/fallback.py`. Any other value (including the current travel-search `'local' | 'provider'`) renders nothing.
    files:
      - apps/web/src/components/FallbackNotice.tsx
      - apps/web/src/components/FallbackNotice.test.tsx
    rationale: |
      Covers AC1, AC2, AC3, AC5. The catalogue (CompareTable, ImageFrame, OptionCard) has nothing equivalent; the design marks FallbackNotice as the new reusable piece (`data-arc-promote="fallback-notice"`). The design's `.fallback-notice` rule is mostly covered by `.alert.cluster` and `.alert .icon` already in `index.css`, so the only extra style is the warning icon colour (token `--color-warning`).
  - description: |
      Provider API call. Add to `travel/api.ts`, next to `fetchLocalMode`:

      ```ts
      export type ProviderStatus = { name: string; kind: string; health: string }
      export class ProvidersNotAllowedError extends Error {}
      export async function fetchProviderStatuses(): Promise<ProviderStatus[]>
      ```

      It calls `GET /providers/status` and returns `body.providers`. A 404 (the API's answer outside local mode, `require_local_mode` in `deps.py`) throws `ProvidersNotAllowedError`; any other failure throws a plain `Error`.
    files:
      - apps/web/src/travel/api.ts
    rationale: Needed by AC4, AC6, AC7. Reuses the endpoint added by STORY-126; no API change.
  - description: |
      Provider list on `LocalModePage`. Below the existing switch fieldset, add a "Registered providers" section following the design's "Local mode" screens:
      - loading: three `.card` rows holding a `.skeleton` line, with `aria-busy="true"` on the list;
      - providers: a `.stack.stack-sm` with `role="list"` and `aria-label="Registered providers"`; one `.card.provider-row` (`role="listitem"`) per provider, holding the name in `<strong>` with the kind beneath in `.provider-kind`, and on the right a `.badge` (modifier from the health mapping) containing `<span className="dot" aria-hidden="true" />` and the health text as its label, so colour never carries the meaning alone (AC8);
      - none registered: `.empty-state` with `InfoIcon`, `<h2>No providers are registered.</h2>` and the design's hint paragraph (AC6);
      - refused: `<h1>Access refused</h1>` plus `.alert.alert-danger` `role="alert"` with "This page is for developers only." and no provider data rendered (AC7).

      Health to badge mapping, a small pure function in the page file:

      ```ts
      healthBadge('healthy') // 'badge-success'
      healthBadge('configured') // 'badge-neutral'
      healthBadge('degraded') // 'badge-warning'
      healthBadge('open circuit') // 'badge-danger'
      healthBadge('not configured') // 'badge-danger'
      ```

      The label is the API's health string verbatim, capitalised for display. The design's "Refresh health" button is NOT planned (no AC asks for it).
    files:
      - apps/web/src/account/LocalModePage.tsx
      - apps/web/src/account/LocalModePage.test.tsx
    rationale: Covers AC4, AC6, AC7, AC8. Extends the existing page rather than adding a new one, because `/account/local-mode` already exists in `App.tsx` and `routePatterns.ts`.
  - description: |
      Styles. Append to `apps/web/src/index.css`, tokens only: `.fallback-notice .icon { color: var(--color-warning); }`, `.provider-row` (flex, wrap, `align-items: center`, `justify-content: space-between`, `gap: var(--space-2)`, `min-height: var(--size-control-lg)`), `.provider-name` (column, `overflow-wrap: anywhere`), `.provider-kind` (`color: var(--color-fg-muted)`, `font-size: var(--font-size-sm)`), `.provider-health` (`gap: var(--space-2)`, `min-height: var(--size-control-sm)`), and `.dot` (`width`/`height: var(--space-2)`, `border-radius: var(--radius-full)`, `background: currentColor`, `flex: none`). `.alert`, `.alert-warning`, `.alert-danger`, `.badge-success/-warning/-danger/-neutral`, `.empty-state` and `.skeleton` already exist in `index.css`, so they are reused as is.
    files:
      - apps/web/src/index.css
    rationale: The design's page-local `<style>` block rules have no equivalent in the app stylesheet yet. Layout is single column in the shell's content width, phone first, with rows wrapping at 375px.
tests:
  - |
    AC1, written first in `FallbackNotice.test.tsx`:
    ```tsx
    render(<FallbackNotice source="fallback" />)
    expect(screen.getByText('Live data unavailable, showing saved data')).toBeInTheDocument()
    ```
  - |
    AC2:
    ```tsx
    render(<FallbackNotice source="live" />)
    expect(screen.queryByText('Live data unavailable, showing saved data')).toBeNull()
    ```
  - |
    AC3:
    ```tsx
    render(<FallbackNotice source="fallback" />)
    expect(screen.getByRole('status')).toHaveClass('alert')
    ```
  - |
    AC5, same file:
    ```tsx
    render(<FallbackNotice source="fallback" />)
    expect(screen.getByRole('status')).toHaveTextContent('Live data unavailable, showing saved data')
    ```
    (the live case also asserts `screen.queryByRole('status')` is null)
  - |
    AC4, in `LocalModePage.test.tsx`, using `stubApi` with `'GET /providers/status': { status: 200, body: { providers: [{ name: 'places', kind: 'maps and places', health: 'healthy' }] } }`, plus the existing `GET /local/mode` stub:
    ```tsx
    renderAt('/account/local-mode')
    const row = await screen.findByRole('listitem')
    expect(within(row).getByText('places')).toBeInTheDocument()
    expect(within(row).getByText('maps and places')).toBeInTheDocument()
    expect(within(row).getByText('Healthy')).toBeInTheDocument()
    ```
  - |
    AC6, same stubs but `body: { providers: [] }`:
    ```tsx
    expect(await screen.findByText('No providers are registered.')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
    ```
  - |
    AC7, with `'GET /providers/status': { status: 404, body: { code: 'not_found' } }`:
    ```tsx
    expect(await screen.findByRole('alert')).toHaveTextContent('This page is for developers only.')
    expect(screen.queryByRole('list', { name: 'Registered providers' })).toBeNull()
    ```
  - |
    AC8, with one provider per health value (`healthy`, `degraded`, `open circuit`, `not configured`):
    ```tsx
    const badge = within(row).getByText('Degraded').closest('.badge')!
    expect(badge).toHaveClass('badge-warning')
    expect(badge.querySelector('.dot')).toHaveAttribute('aria-hidden', 'true')
    ```
    The text label is always present, so colour is never the only signal.
  - |
    Regression: the two existing `LocalModePage` tests (switch turns On; live deployment refuses On) must still pass. Their stubs get a `'GET /providers/status'` reply added, because an unstubbed path answers 404 in `stubApi` and would now trigger the refusal state.
assumptions_or_open_questions:
  - |
    OPEN QUESTION (needs a decision): the codebase has no "developer" role. I searched `services/api/app` for role/groups/admin and `apps/web/src` for developer; the only matches are `LocalMenu.tsx`, which calls local mode "Developer tools", and `require_local_mode` in `deps.py`, which makes `/providers/status` 404 when local mode is off. This plan therefore treats "developer" as "the API allows `/providers/status`" (local mode on) and shows the refusal state on a 404. The catch is that `LocalModePage` also holds the switch that turns local mode On, so with this rule the switch is unreachable while local mode is Off. Alternatives: (a) keep the switch visible and refuse only the provider section; (b) add a real developer flag to the API (`/auth/me`, a settings allow-list). The default here follows the story wording and refuses the whole page, but (a) may be what you want.
  - |
    The design shows health as Healthy / Degraded / Down, but the API's `HealthState` (`services/api/app/providers/registry.py`) is configured, healthy, degraded, open circuit, not configured. The plan shows the API's states and maps them to the design's badge colours as above. "Down" is not shown, since the API never returns it.
  - |
    Only the web app changes. The `Source` literal already exists on the API side, but no web result type carries `'fallback'` yet (`TravelSearchResult.source` is `'local' | 'provider'`), and the story says no screens are wired. `FallbackNotice` therefore takes a plain `source: string`.
  - |
    The design's "Refresh health" button and "Health refreshed" note are not covered by any AC, so they are left out.
  - |
    The design's `.dot` uses `var(--space-2)` (8px) for its size, which matches the token set; no value needs a literal.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout
  None — web UI only, reads the existing `GET /providers/status`; no stored data, migration, setting or env var changes.

  ### Design and tokens
  Read the approved prototype (screens "Result (live data)", "Result (saved data)", "Local mode", "Local mode (no providers)", "Local mode (not a developer)"). The app already carries the same tokens and the shared `.alert`, `.badge-*`, `.empty-state`, `.skeleton` and `.sr-only` rules in `apps/web/src/index.css` (alert rules around lines 68-72), so no token-loading step is needed. Tokens used: `--color-warning`, `--color-fg-muted`, `--font-size-sm`, `--space-2`, `--radius-full`, `--size-control-lg`, `--size-control-sm`. The notice is `.alert-warning` per the prototype; AC3 only requires the base `.alert` class, which it has.

  ```mermaid
  flowchart TD
    App[App.tsx route /account/local-mode] --> LMP[LocalModePage.tsx]
    LMP --> API[travel/api.ts fetchProviderStatuses]
    API --> EP[GET /providers/status providers_status.py]
    EP --> REG[ProviderRegistry.statuses]
    LMP --> CSS[index.css provider rows and dot]
    FN[components/FallbackNotice.tsx] --> CSS
    FN --> ICON[auth/icons.tsx AlertIcon]
    classDef touched fill:#f96,color:#000
    class LMP,API,CSS,FN touched
  ```
  `LocalModePage`, `travel/api.ts` and `index.css` are edited; `FallbackNotice` is new. The endpoint, registry, route and icons are unchanged context.
review_focus: |
  IN: the `FallbackNotice` component with its tests, and the provider list, empty state and refusal on the existing `LocalModePage`, web only. OUT: wiring the notice into any result screen, API changes, a "Refresh health" button, and any new developer role. Riskiest part: the meaning of "developer" (treated as local mode on, via the 404 from `/providers/status`), which makes the whole page refuse while local mode is Off and so hides the switch; see the open question. Deliberate: health labels use the API's real states rather than the prototype's Healthy/Degraded/Down.
