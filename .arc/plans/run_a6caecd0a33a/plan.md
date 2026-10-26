summary: |
  Most of "local sign-in" already exists from the earlier local-mode stories. `LOCAL_MODE` plus `APP_ENV` is the explicit switch (`app/local_mode.py`), `get_settings()` refuses it outside the local environment, `get_identity()` and `get_accounts()` pick `FakeIdentityProvider` and `InMemoryAccountStore` when it is on, and `/auth/sign-in` issues the same signed `session` cookie every protected endpoint reads through `get_current_user`. The demo user is seeded on first start.

  What is missing is the "reset local data" action (AC5, AC6) and tests that pin AC1 to AC4 explicitly. This plan adds (1) a local-only `POST /local/reset` endpoint that wipes the in-memory identity, account, trip and inbox stores and re-seeds the demo user, (2) a Menu drawer and confirmation modal in the web app, shown only while local mode is on, and (3) API tests that lock down AC1 to AC4 so a future refactor cannot loosen the production block or the cloud default.

scope:
  - description: |
      Add `reset()` to every in-memory local store so one call returns it to empty.
      Signatures: `FakeIdentityProvider.reset(self) -> None` (clears `_users`, `resent`, `pending_email`),
      `InMemoryAccountStore.reset(self) -> None` (clears `_google`),
      `InMemoryTripStore.reset(self) -> None` (clears `_trips`, `_invites`, `_share_links`, `_editors`),
      `InMemoryInviteSender.reset(self) -> None` (clears `sent`).
    files:
      - services/api/app/auth/fake_identity.py
      - services/api/app/auth/accounts.py
      - services/api/app/trips/store.py
      - services/api/app/trips/invites.py
    rationale: |
      Reset has to empty the very instances sign-in and trips serve from (the `lru_cache`d singletons in `auth.py` and `deps.py`). Clearing in place keeps every existing reference valid. Emptying them also makes `is_empty()` true, so the existing `run_first_start_seed` re-seeds the demo user and sample trips with no new seeding code.
  - description: |
      New router `app/routers/local_reset.py`:

      ```python
      router = APIRouter(prefix="/local")

      @router.post("/reset", status_code=204)
      def reset_local_data(_: None = Depends(require_local_mode)) -> Response:
          ...  # reset identity, accounts, trips, inbox; run_first_start_seed(deps.get_local_seed_target(), date.today()); delete the session cookie
      ```

      `require_local_mode` is a small dependency in `deps.py` that raises `ApiError(404, "not_found")` unless `get_settings().local_mode`, the same way `get_local_inbox` does. Register the router in `main.py`. The response deletes the `session` cookie so the calling browser is signed out.
    files:
      - services/api/app/routers/local_reset.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      Reuses the local-mode 404 pattern from `/local/inbox`, so the endpoint does not exist outside local mode and cannot touch the Dynamo or Cognito stores. `get_settings()` already refuses local mode in production, so the production block covers this endpoint too. No path touches the cloud stores.
  - description: |
      Web API client: in `auth/api.ts` add `fetchLocalMode(): Promise<boolean>` (reads `local_mode` from `/startup-status`, false on any failure) and `requestResetLocalData = () => post('/local/reset')`. `/local` and `/startup-status` are already in `API_PREFIXES` in `devProxy.ts`, so no proxy change is needed.
    files:
      - apps/web/src/auth/api.ts
    rationale: |
      Smallest client surface for the menu to know whether to show the developer tools, and to call reset.
  - description: |
      New `local/LocalMenu.tsx` built on the existing `trips/Overlay.tsx`, matching the prototype's "Menu open" and "Reset local data confirmation" screens.

      Menu drawer (`.drawer`, `aria-label="Menu"`): title "Menu" with a ghost icon close button ("Close menu"); a `.menu` list with Trips (link to `/`), Account (link to `/account`) and Sign out (calls `signOut`, then goes to `/sign-in`); a `.divider`; the text "Developer tools. Visible only while local sign-in is on."; and a `.btn btn-secondary` "Reset local data". The whole drawer button and tools block render only when `fetchLocalMode()` is true.

      Confirmation `.modal` (`role="alertdialog"`, title "Reset local data", text "All local accounts and sessions will be deleted. Sample data will be restored."), Cancel as `.btn-ghost`, and a confirm "Reset" button. On success: call `signOut()`, navigate to `/sign-in` with `state: { localReset: true }`. On failure show an `.alert alert-danger` in the modal ("Could not reset local data. Try again.").

      `HomePage.tsx` gets the prototype's page-header row: `My trips` heading area with a `.btn btn-ghost` "Menu" button (menu icon) that opens `LocalMenu`. `SignInPage.tsx` reads `location.state.localReset` and shows a `.toast` with role="status" and the text "Local data reset. Sign in with the demo user." The existing "Demo account is ready" alert and "Fill in demo details" button already cover the demo sign-in.
    files:
      - apps/web/src/local/LocalMenu.tsx
      - apps/web/src/auth/HomePage.tsx
      - apps/web/src/auth/SignInPage.tsx
    rationale: |
      Prototype screens "Home (signed in)", "Menu open", "Reset local data confirmation" and "Local data reset" are the approved design; this reuses `Overlay` for focus trap, Escape and backdrop, and uses only tokens and classes already in the stylesheet (`.drawer`, `.modal`, `.menu`, `.toast`, `.btn-*`, `.alert`). Verb-first buttons and plain copy follow the voice guidelines.
  - description: |
      Local setup docs: extend the "Reset" section of `docs/local-setup.md` with one sentence that "Reset local data" in the web Menu does the same without a restart. Keep it prose only: `scripts/local-setup-docs.test.mjs` asserts exactly one reset step (a numbered or indented command line), so add no new numbered step or command block.
    files:
      - docs/local-setup.md
    rationale: |
      The doc lists what is faked and how to reset; the new action should be findable there.

tests:
  - |
    AC1, local sign-in off means cloud handles sign-in and no local session is issued. New `services/api/tests/unit/test_local_sign_in.py`:
    ```python
    def test_off_uses_cloud_identity_and_issues_no_local_session(monkeypatch):
        monkeypatch.delenv("LOCAL_MODE", raising=False)
        auth._local_identity.cache_clear()
        class Cloud:
            def sign_in_email(self, email, password):
                raise WrongPassword
        monkeypatch.setattr(auth, "_cognito", lambda: Cloud())
        client = TestClient(app)
        response = client.post("/auth/sign-in", json={"email": "a@b.co", "password": "x"})
        assert response.status_code == 401
        assert "session" not in response.cookies
        assert auth._local_identity.cache_info().currsize == 0
    ```
  - |
    AC2, local on with no cloud settings starts cleanly:
    ```python
    def test_local_on_starts_without_cloud_settings(monkeypatch):
        for name in ("IDENTITY_USER_POOL_ID", "IDENTITY_CLIENT_ID", "IDENTITY_DOMAIN", "ACCOUNTS_TABLE_NAME", "TRIPS_TABLE_NAME"):
            monkeypatch.delenv(name, raising=False)
        monkeypatch.setenv("LOCAL_MODE", "true")
        monkeypatch.setenv("APP_ENV", "local")
        monkeypatch.setattr(auth, "CognitoIdentityProvider", lambda *_: pytest.fail("cloud client built"))
        with TestClient(app) as client:
            assert client.get("/health").status_code == 200
    ```
  - |
    AC3, production refuses local sign-in, both at settings and at API start:
    ```python
    @pytest.mark.parametrize("app_env", ["production", "staging", ""])
    def test_local_on_outside_local_refuses_to_start(monkeypatch, app_env):
        monkeypatch.setenv("LOCAL_MODE", "true")
        monkeypatch.setenv("APP_ENV", app_env)
        with pytest.raises(LocalModeRefusedError):
            with TestClient(app):
                pass
    ```
  - |
    AC4, the issued token is accepted by an existing protected endpoint (uses the real `real_local` style wiring from `test_local_seed_startup.py`):
    ```python
    def test_local_session_token_is_accepted_by_trips(real_local):
        with TestClient(app) as client:
            signed_in = sign_in_demo(client)
            assert signed_in.status_code == 200
            token = signed_in.cookies["session"]
            fresh = TestClient(app)  # no cookie jar carry-over: send only the token
            assert fresh.get("/trips", cookies={"session": token}).status_code == 200
    ```
  - |
    AC5, reset removes every earlier local account. New `services/api/tests/unit/test_local_reset_router.py`:
    ```python
    def test_reset_removes_previous_accounts(real_local):
        with TestClient(app) as client:
            auth._local_identity().create_confirmed_user("sam@example.com", "abcdefghij12")
            assert client.post("/local/reset").status_code == 204
            r = client.post("/auth/sign-in", json={"email": "sam@example.com", "password": "abcdefghij12"})
            assert r.status_code == 404  # no_account
            assert "session" not in client.cookies
    def test_reset_also_clears_trips_and_inbox(real_local): ...
    def test_reset_is_404_when_local_mode_off(monkeypatch):
        monkeypatch.delenv("LOCAL_MODE", raising=False)
        assert TestClient(app).post("/local/reset").status_code == 404
    ```
  - |
    AC6, demo user signs in after reset, with its sample trips restored:
    ```python
    def test_demo_user_signs_in_after_reset(real_local):
        with TestClient(app) as client:
            client.post("/local/reset")
            assert sign_in_demo(client).status_code == 200
            assert sorted(t["name"] for t in client.get("/trips").json()) == ["Summer in Kyoto", "Weekend in Lisbon"]
    ```
  - |
    Store `reset()` unit tests (extend `test_local_seed.py` or add a new file): after `reset()`, `FakeIdentityProvider().is_empty()` and `InMemoryTripStore().is_empty()` are `True`.
  - |
    Web, new `apps/web/src/local/LocalMenu.test.tsx` (vitest and Testing Library, `fetch` stubbed as in `AppHeader.test.tsx`):
    ```tsx
    it('hides Reset local data when local mode is off', async () => {
      stub({ local_mode: false })
      renderHome()
      fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
      expect(screen.queryByRole('button', { name: 'Reset local data' })).not.toBeInTheDocument()
    })
    it('asks before resetting, then posts and returns to sign-in with the toast', async () => {
      stub({ local_mode: true })
      renderHome()
      fireEvent.click(await screen.findByRole('button', { name: 'Menu' }))
      fireEvent.click(screen.getByRole('button', { name: 'Reset local data' }))
      expect(screen.getByRole('alertdialog')).toHaveTextContent('All local accounts and sessions will be deleted')
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      expect(await screen.findByRole('status')).toHaveTextContent('Local data reset. Sign in with the demo user.')
      expect(fetchMock).toHaveBeenCalledWith('/local/reset', expect.objectContaining({ method: 'POST' }))
    })
    it('cancel leaves data alone', ...)   // no POST to /local/reset
    it('shows an error and stays when reset fails', ...)
    ```
  - |
    Existing suites must stay green: `cd services/api && uv run pytest` and `cd apps/web && pnpm vitest run`, plus `node --test scripts/local-setup-docs.test.mjs` for the docs step-count test.

assumptions_or_open_questions:
  - |
    CONFLICT, demo credentials. The prototype shows demo@travelplanner.local / demo-pass, but the shipped seed (`app/local_seed.py`), `docs/local-setup.md` and the `/startup-status` contract use demo@example.com / demo-password-1 (the password must satisfy `validate_password`, which `demo-pass` would not). I keep the existing values and treat the prototype's strings as placeholder copy; the web UI reads the credentials from `/startup-status`, so nothing is hard-coded.
  - |
    CONFLICT, "Developer settings" screen. The prototype has a runtime On/Off radio with a Save button and a "simulate deployment" chip. The scope text and AC3 describe an explicit setting plus a production block, which already exist as the `LOCAL_MODE` and `APP_ENV` environment variables, resolved once at API start (stories 079 to 082). A web page cannot change the API's environment, and a UI toggle would add a second path that could weaken the production block. This plan does not build that screen; the setting stays env-driven and the prototype's "simulate deployment" control is prototype-only per its own note. Please confirm.
  - |
    CONFLICT, button style. The prototype makes the confirm "Reset" a primary button. The UI guidelines reserve `.btn-danger` for irreversible actions behind a `.modal`, and this deletes all local accounts, so I use `.btn-danger` for Reset. Say if you prefer the prototype's primary style.
  - |
    Deviation from the "Local data reset" screen: instead of an in-place empty state on the home page, the web signs out and goes to `/sign-in` with a toast and the existing "Demo account is ready" alert. This is because `RequireAuth` redirects signed-out visitors to sign-in anyway, and that alert already offers "Fill in demo details".
  - |
    Not built: the prototype's "Sign in with cloud account" button on the off screen. With local mode off the existing sign-in page and Cognito-backed `/auth/sign-in` already handle sign-in (AC1 is pinned by a test, not new UI). Sign-up, Google and account changes are separate stories.
  - |
    Known limitation: sessions are stateless signed cookies and the fake identity numbers users `user-1`, `user-2`, ... so after a reset another browser still holding an old cookie for `user-1` would be treated as the re-seeded demo user. Sign-in by email and password (what AC5 and AC6 cover) is unaffected, and the resetting browser's cookie is deleted. A session epoch is out of scope.
  - |
    The traveller profile and saved places still use Dynamo stores in local mode (noted in `docs/local-setup.md`), so reset does not clear them; out of scope.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout
  - **Existing data**: None. No schema, migration or stored data shape changes. Everything reset lives in in-memory local stand-ins that already start empty on each API start.
  - **Backfill / seed**: No new seed. Reset empties the stores so the existing `run_first_start_seed` (idempotent, seeds only when `is_empty()`) recreates the demo user and two sample trips.
  - **Settings**: No new settings. Reuses `LOCAL_MODE` (default off when unset) and `APP_ENV` (default `production` when unset), documented in `docs/local-setup.md` and `services/api/README.md`.
  - **Provisioning**: Nothing to provision.
  - **Order and rollback**: Single deploy, no ordering. `/local/reset` returns 404 whenever local mode is off, so it is inert in any deployment; rollback is reverting the commit.

  ### Why this shape
  The AC1 to AC4 behaviour is implemented already (`config.get_settings` -> `resolve_local_mode`; `auth.get_identity`; `session.issue_session` / `deps.get_current_user`). Re-implementing would add a second path and risk the production block, so the plan only adds tests for those and builds the genuinely missing reset action. The session token "shape the API already accepts" is the signed `session` cookie, identical to the cloud path because the same `_set_session` issues it after either identity provider returns a user id.

  ```mermaid
  flowchart TD
    web[LocalMenu.tsx in HomePage] -->|POST /local/reset| reset[routers/local_reset.py]
    web -->|GET /startup-status| status[routers/startup_status.py]
    reset --> dep[deps.require_local_mode]
    dep --> cfg[config.get_settings / local_mode.resolve_local_mode]
    reset --> ident[auth.FakeIdentityProvider.reset]
    reset --> acc[auth.InMemoryAccountStore.reset]
    reset --> trips[trips.InMemoryTripStore.reset]
    reset --> inbox[trips.InMemoryInviteSender.reset]
    reset --> seed[local_seed.run_first_start_seed]
    main[main.py] --> reset
    classDef touched fill:#f96,color:#000
    class web,reset,dep,ident,acc,trips,inbox,main touched
  ```
  Touched nodes: `LocalMenu.tsx` (new UI), `local_reset.py` and `main.py` (new endpoint and registration), `deps.require_local_mode` (404 guard), and the four stores (a `reset()` each). The config, startup-status and seed modules are untouched context.

review_focus: |
  IN: a local-only `POST /local/reset`, `reset()` on four in-memory stores, the web Menu drawer and confirm modal, explicit tests for AC1 to AC4, and a one-sentence docs note. OUT: any change to how local mode is resolved, any Developer settings page or runtime toggle, sign-up, Google, account changes, and the Dynamo-backed profile and saved-place stores.
  Riskiest: the reset endpoint must be unreachable outside local mode (404 via `require_local_mode`) and must clear the same cached singletons sign-in uses, not new instances. Deliberate: demo credentials, the danger-style Reset button and the post-reset redirect to sign-in intentionally differ from the prototype (see the open questions).
