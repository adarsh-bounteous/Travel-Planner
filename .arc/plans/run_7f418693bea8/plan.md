summary: |
  Add a "Local inbox" link to the two places a tester already is when they need it: the Menu drawer (`LocalMenu`) and the confirm-email page (`ConfirmEmailPage`). Both are plain react-router `<Link to="/local/inbox">` links to the existing `/local/inbox` route (`LocalInboxPage`), which is untouched, so the inbox lists exactly the same messages whichever way it is opened. Web-only change; no API, data or settings change. Built test-first with vitest + Testing Library, following the approved prototype (Menu row with a neutral "Testing" badge; "Testing locally? Local inbox" line on the confirm-email page).
scope:
  - description: |
      Menu drawer: add a "Local inbox" menu item to the `ul.menu` list in `LocalMenu`, between Account and Sign out, shown only while local mode is on (the existing `localMode` state from `fetchLocalMode()`). Prototype row `menu-local-inbox`: label "Local inbox" plus a `badge badge-neutral` reading "Testing".

      ```tsx
      {localMode && (
        <li>
          <Link className="menu-item" to="/local/inbox" onClick={onClose}>
            Local inbox <span className="badge badge-neutral">Testing</span>
          </Link>
        </li>
      )}
      ```

      `onClose` is called on click so the drawer does not stay open over the inbox page (the drawer is rendered by `HomePage`, not by a route, so navigation alone would not unmount it). Existing items (Trips, Account) navigate the same way today; check whether they already rely on `Overlay` closing on navigation and match that behaviour rather than duplicating it.
    files:
      - apps/web/src/local/LocalMenu.tsx
    rationale: |
      AC 1 and 2. Reuses `.menu`/`.menu-item` and `.badge-neutral`, already defined in `apps/web/src/index.css` (tokens loaded by `@import "../../../design-system/tokens.css"` at index.css line 2). No new CSS: tokens used are those behind those classes (`--space-2`, `--font-size-sm`, `--radius-full`, `--color-surface`, `--color-fg`, `--color-border`).
  - description: |
      Confirm-email page: below the existing "Back to sign in" button add a small muted line, shown only while local mode is on, with the link (prototype `confirm-local-inbox`):

      ```tsx
      const [localMode, setLocalMode] = useState(false)
      useEffect(() => {
        let current = true
        void fetchLocalMode().then((on) => current && setLocalMode(on))
        return () => { current = false }
      }, [])
      ...
      {localMode && (
        <p className="text-sm text-muted">
          Testing locally? <Link to="/local/inbox">Local inbox</Link>
        </p>
      )}
      ```

      `fetchLocalMode` (`apps/web/src/auth/api.ts:82`) hits the public `/startup-status`, so it works signed out, which is the state on this page. It resolves false on any failure, so the page never breaks.
    files:
      - apps/web/src/auth/ConfirmEmailPage.tsx
    rationale: |
      AC 3 and 4. Same gating and same fetch helper as the Menu, so the link appears exactly where the inbox route would answer (the API returns 404 for `/local/inbox` unless local mode is on). `.text-sm` and `.text-muted` are used elsewhere in the app (`LocalMenu`).
  - description: |
      New tests (written first): `LocalMenu.test.tsx` gets link-shown, link-navigates, link-hidden-when-off and same-messages cases; a new `ConfirmEmailPage.test.tsx` covers the confirm-email page. `LocalInboxPage.tsx` and the API are not modified.
    files:
      - apps/web/src/local/LocalMenu.test.tsx
      - apps/web/src/auth/ConfirmEmailPage.test.tsx
    rationale: AC 1 to 5, TDD order.
tests:
  - |
    AC 1, in `apps/web/src/local/LocalMenu.test.tsx` (reuses its `stub`/`renderHome`; extend the fetch stub to answer `/local/inbox`). Fails first because the link does not exist.
    ```tsx
    it('shows a Local inbox link in the Menu while local mode is on', async () => {
      stub(true)
      renderHome()
      fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
      const link = await screen.findByRole('link', { name: /Local inbox/ })
      expect(link).toHaveAttribute('href', '/local/inbox')
    })
    ```
  - |
    AC 2, same file: activating the link displays the local inbox.
    ```tsx
    it('opens the local inbox from the Menu link', async () => {
      stub(true)
      renderHome()
      fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
      fireEvent.click(await screen.findByRole('link', { name: /Local inbox/ }))
      expect(await screen.findByRole('heading', { name: 'Local inbox' })).toBeInTheDocument()
    })
    ```
    (Confirm the heading text against `LocalInboxPage.tsx` before writing; use whatever its `h1` actually says.)
  - |
    Local mode off, same file: the link is absent, matching the Reset local data behaviour.
    ```tsx
    it('hides the Local inbox link when local mode is off', async () => {
      stub(false)
      renderHome()
      fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/startup-status', expect.anything()))
      await act(async () => {})
      expect(screen.queryByRole('link', { name: /Local inbox/ })).not.toBeInTheDocument()
    })
    ```
  - |
    AC 3, new `apps/web/src/auth/ConfirmEmailPage.test.tsx`, rendering `<MemoryRouter initialEntries={['/confirm-email']}><AuthProvider><App /></AuthProvider></MemoryRouter>` with `/startup-status` stubbed to `{ local_mode: true }` and `/auth/me` signed out (copy the stub shape from `LocalInboxPage.test.tsx`'s `stubApi(..., { signedOut: true })`).
    ```tsx
    const link = await screen.findByRole('link', { name: 'Local inbox' })
    expect(link).toHaveAttribute('href', '/local/inbox')
    ```
  - |
    AC 4, same new file: clicking the link on the confirm-email page displays the inbox.
    ```tsx
    fireEvent.click(await screen.findByRole('link', { name: 'Local inbox' }))
    expect(await screen.findByRole('heading', { name: 'Local inbox' })).toBeInTheDocument()
    ```
  - |
    AC 5: with `GET /local/inbox` stubbed to a fixed list, the messages rendered after opening via the Menu link equal those rendered when rendering at `/local/inbox` directly. Put in `LocalMenu.test.tsx`:
    ```tsx
    const direct = await listedSubjects('/local/inbox')   // render at the route, read the list items' text
    const viaMenu = await listedSubjectsViaMenuLink()      // open Menu, click link, read the list items' text
    expect(viaMenu).toEqual(direct)
    expect(viaMenu.length).toBeGreaterThan(0)
    ```
    Use the same `invite` and `confirmation` fixtures as `LocalInboxPage.test.tsx`. Regression guard: the existing `LocalInboxPage.test.tsx` must pass unchanged.
  - |
    Narrow run command (derived from the project command, web half only, since no API code changes):
    `cd apps/web && pnpm run test -- src/local/LocalMenu.test.tsx src/auth/ConfirmEmailPage.test.tsx src/local/LocalInboxPage.test.tsx`
assumptions_or_open_questions:
  - |
    The ACs say the link is "shown" without mentioning local mode. I gated it on local mode (`fetchLocalMode()`), because `/local/inbox` answers 404 unless local mode is on (see the comment in `App.tsx`) and the Menu already hides its other developer tool (Reset local data) the same way. If the link should show in every environment, drop the `localMode &&` guard in both files. Please confirm.
  - |
    The prototype shows the Menu as a full page listing "My trips / Profile / Local inbox" and a confirm-email page with a "Resend email" button and toast. The real Menu is the `LocalMenu` drawer (Trips, Account, Sign out) and the real confirm-email page has no resend. I add only the inbox link in the existing structure and do not add Resend or change existing copy ("Open the link we sent to your email address, then sign in."), since the scope is "Link only".
  - |
    The prototype's confirm-email text puts the link under a Resend button; with no Resend button, it goes under "Back to sign in" inside the existing card.
  - |
    The deferred decision about starter countries and places (settled on STORY-102) does not affect this item and is not used.
estimated_points: 2
package_dependencies: []
notes: |
  ### Data & rollout
  None — front-end links only; no stored data, migration, seed, setting or env var. Safe to roll back by reverting the commit.

  ### Design notes
  Read from `TRAVEL-PLANNER-APP-STORY-093-design.html`: Menu row `menu-local-inbox` (`.menu-row` with a `badge badge-neutral` "Testing" and chevron), confirm-email line `confirm-local-inbox` (`p.text-sm.text-muted` "Testing locally? " + link "Local inbox"), and the Local inbox screen as a plain list of message cards (unchanged). Tokens are loaded by `apps/web/src/index.css` line 2 (`@import "../../../design-system/tokens.css"`). The plan adds no CSS, reusing `.menu-item`, `.badge-neutral`, `.text-sm`, `.text-muted`. The prototype's `.menu-row` style is a prototype-only class; the app's existing `.menu-item` is used so the new row matches Trips and Account. The prototype's chevron icon is skipped for the same reason (the existing rows have none).

  ```mermaid
  flowchart TD
    HomePage[auth/HomePage.tsx] --> LocalMenu[local/LocalMenu.tsx]
    SignUpPage[auth/SignUpPage.tsx] -->|navigate| ConfirmEmail[auth/ConfirmEmailPage.tsx]
    LocalMenu -->|fetchLocalMode| Api[auth/api.ts]
    ConfirmEmail -->|fetchLocalMode| Api
    LocalMenu -->|Link /local/inbox| Route[App.tsx route /local/inbox]
    ConfirmEmail -->|Link /local/inbox| Route
    Route --> Inbox[local/LocalInboxPage.tsx]
    classDef touched fill:#f96,color:#000
    class LocalMenu,ConfirmEmail touched
  ```
  LocalMenu and ConfirmEmailPage get the link. The route, `LocalInboxPage` and `fetchLocalMode` are reused as is.
review_focus: |
  IN: one link each in `LocalMenu.tsx` and `ConfirmEmailPage.tsx` to the existing `/local/inbox` route, plus tests. OUT: any change to `LocalInboxPage`, the API, routing, Resend email, or CSS. Deliberate decision to review: the link is shown only while local mode is on (matching Reset local data and the API's 404); the ACs do not say so, so confirm. Riskiest part: the Menu drawer must close on navigation so it does not overlay the inbox.
