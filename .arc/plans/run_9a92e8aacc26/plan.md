summary: |
  Add a "Local inbox" link to the two places a tester needs it: the Menu drawer (LocalMenu) and the confirm-email page (ConfirmEmailPage). Both link to the existing public route /local/inbox (LocalInboxPage), whose contents and data loading are not touched. The links appear only while local sign-in is on (using the existing fetchLocalMode / /startup-status check LocalMenu already makes), because the inbox page itself says it only exists in local mode. Web-app only; no API, data or config change.
scope:
  - description: |
      LocalMenu: add a "Local inbox" Link to /local/inbox inside the existing ul.menu, rendered only when localMode is true, between Account and Sign out. Per the prototype's Menu screen (menu-local-inbox row) the row carries a neutral "Testing" badge: className "badge badge-neutral". Clicking it should also close the drawer so the page is visible: onClick={onClose}.

      ```tsx
      {localMode && (
        <li>
          <Link className="menu-item between" to="/local/inbox" onClick={onClose}>
            Local inbox <span className="badge badge-neutral">Testing</span>
          </Link>
        </li>
      )}
      ```
      The "between" class already exists in the app (used in LocalMenu header); the implementer confirms in index.css that it spreads label and badge, else uses cluster. Tokens come through the existing .menu-item, .badge and .badge-neutral classes (design-system tokens already loaded by the app); no new CSS and no literal colours or pixels.
    files:
      - apps/web/src/local/LocalMenu.tsx
      - apps/web/src/local/LocalMenu.test.tsx
    rationale: |
      AC 1, 2, 5. The prototype's Menu screen shows the link among the Menu items with a "Testing" badge. The prototype's items (My trips, Profile) differ from the real drawer (Trips, Account, Sign out); the real items are kept, only the inbox row is added.
  - description: |
      ConfirmEmailPage: add the hint line from the prototype's Confirm email screen (confirm-local-inbox) under the existing "Back to sign in" button: "Testing locally? Local inbox", with "Local inbox" a Link to /local/inbox, styled with the existing text-sm text-muted classes. Rendered only when local mode is on. The page is public and has no state today, so add a small useEffect + useState using fetchLocalMode from ../auth/api (same pattern as LocalMenu, with the same unmount guard).

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
      Prototype divergence, stated plainly: the prototype puts the hint under a "Resend email" button with a resend toast; the real page has no Resend button and the story scope is link only, so Resend is NOT built. The real copy and "Back to sign in" button stay.
    files:
      - apps/web/src/auth/ConfirmEmailPage.tsx
      - apps/web/src/auth/ConfirmEmailPage.test.tsx
    rationale: |
      AC 3, 4. The existing test file does not exist for this page (Glob of apps/web/src/auth/ConfirmEmail* found only the component), so a new test file is added.
  - description: |
      No change to LocalInboxPage.tsx, App.tsx routes or the API. The link targets the already-registered route /local/inbox (App.tsx line 314), which is also in routePatterns.ts line 39.
    files: []
    rationale: |
      Scope says link only, inbox contents unchanged (AC 5 holds because both links navigate to the same unchanged component and endpoint).
tests:
  - |
    AC1 (LocalMenu.test.tsx, written first, fails until the link exists). With stub(true), open the Menu and expect the link with its target.

    ```tsx
    it('shows a Local inbox link in the Menu when local mode is on', async () => {
      stub(true)
      renderHome()
      fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
      const link = await screen.findByRole('link', { name: /Local inbox/ })
      expect(link).toHaveAttribute('href', '/local/inbox')
    })
    ```
  - |
    AC1 negative (LocalMenu.test.tsx). With stub(false), after the startup-status call settles, expect no link.

    ```tsx
    expect(screen.queryByRole('link', { name: /Local inbox/ })).not.toBeInTheDocument()
    ```
  - |
    AC2 (LocalMenu.test.tsx). Activating the Menu link shows the inbox page and closes the drawer. The stub returns '[]' for /local/inbox, so the empty state heading shows.

    ```tsx
    fireEvent.click(await screen.findByRole('link', { name: /Local inbox/ }))
    expect(await screen.findByRole('heading', { name: 'Emails' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    ```
  - |
    AC3 (new ConfirmEmailPage.test.tsx). Render in MemoryRouter at /confirm-email with fetch stubbed so /startup-status returns local_mode true; expect the link. Also a local_mode false case expects queryByRole('link', { name: 'Local inbox' }) to be null.

    ```tsx
    expect(await screen.findByRole('link', { name: 'Local inbox' })).toHaveAttribute('href', '/local/inbox')
    ```
  - |
    AC4 (ConfirmEmailPage.test.tsx). Render App via MemoryRouter initialEntries ['/confirm-email'] with AuthProvider, click the link, expect the inbox page.

    ```tsx
    fireEvent.click(await screen.findByRole('link', { name: 'Local inbox' }))
    expect(await screen.findByRole('heading', { name: 'Emails' })).toBeInTheDocument()
    ```
  - |
    AC5 (LocalMenu.test.tsx). Stub /local/inbox to return a fixed message list (shape per the Message type in LocalInboxPage.tsx). Render App at /local/inbox directly and record the listed titles; then render at / and open via the Menu link, and expect the same titles.

    ```tsx
    expect(viaMenuTitles).toEqual(directTitles)
    ```
    Run narrowly with: (cd apps/web && pnpm run test -- src/local/LocalMenu.test.tsx src/auth/ConfirmEmailPage.test.tsx). Existing LocalMenu tests must still pass unchanged.
assumptions_or_open_questions:
  - |
    The links are shown only while local sign-in is on (fetchLocalMode), not to every user. Reason: LocalInboxPage shows "This page is not available" when local mode is off, and the existing Menu already hides developer tools the same way. The ACs say "a tester" and do not mention local mode. If the reviewer wants the link always visible, drop the localMode condition and the negative test.
  - |
    The prototype's Confirm email screen has a "Resend email" button and toast, and the Menu has "My trips" and "Profile" rows. None of these exist in the app and are out of scope (link only), so they are not built.
  - |
    The Menu in the app is a drawer (Overlay kind="drawer"), not the page shown in the prototype. The link is added to the drawer's existing list; the Testing badge is kept from the prototype.
  - |
    The local inbox route is public (no RequireAuth), so the confirm-email link works for a signed-out tester.
  - |
    The deferred decision about starter countries (Japan, Portugal, India, Thailand, Mexico, Morocco, Peru) does not relate to this item and is not used.
estimated_points: 2
package_dependencies: []
notes: |
  ### Data & rollout
  None — UI links only; no stored data, migration, setting or env var. Safe to roll back by reverting the commit.

  Design context: the prototype's tokens.css is already used by the web app through its existing classes (.menu-item, .badge, .badge-neutral, .text-sm, .text-muted, .btn), so this change adds no CSS. Files read: LocalMenu.tsx, LocalMenu.test.tsx, ConfirmEmailPage.tsx, LocalInboxPage.tsx, App.tsx routes. The design-system token file was not opened because no new styling is planned; the implementer should confirm that .badge-neutral and .between exist in apps/web/src/index.css and, if either is missing, say so rather than add literals.

  ```mermaid
  flowchart TD
    App[App.tsx routes] --> LocalMenu[LocalMenu.tsx - add Local inbox link]
    App --> ConfirmEmail[ConfirmEmailPage.tsx - add Local inbox link]
    App --> Inbox[LocalInboxPage.tsx - unchanged target of /local/inbox]
    LocalMenu --> Api[auth/api fetchLocalMode]
    ConfirmEmail --> Api
    LocalMenu -.link.-> Inbox
    ConfirmEmail -.link.-> Inbox
    classDef touched fill:#f96,color:#000
    class LocalMenu,ConfirmEmail touched
  ```
review_focus: |
  IN: one Link in LocalMenu and one in ConfirmEmailPage, plus their tests. OUT: any change to LocalInboxPage, routes, API, Resend button or toast. Riskiest part is the local-mode gating on the confirm-email page (new fetch on a public page) and the choice to hide the links when local mode is off, which is deliberate and flagged as an open question. The prototype's Resend button and extra Menu rows are intentionally not built.
