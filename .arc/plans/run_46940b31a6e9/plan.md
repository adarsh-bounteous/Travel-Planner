summary: |
  Local mode already signs a developer in against an in-memory `FakeIdentityProvider` (sign-up, sign-in, sign-out routes exist in `services/api/app/routers/auth.py`), but it cannot yet do the confirmation journey: sign-up puts nothing in the local inbox, there is no confirmation link or confirm route, no expiry or single-use rule, and accounts vanish on API restart (AC 6). This plan adds a durable `LocalIdentityProvider` (stdlib SQLite file, scrypt-hashed passwords, confirmation tokens with expiry and single use) that is wired in as local mode's Identity Provider, delivers a confirmation link to the existing local inbox, adds a local-only `POST /auth/confirm` route, and adds a web confirmation-link page plus the three new error messages. Cloud mode (Cognito) is untouched. Password/email change and Google stay in their own stories; the new provider only carries them over unchanged so local mode does not regress.
scope:
  - description: |
      New `LocalIdentityProvider` implementing the `IdentityProvider` protocol, backed by a SQLite file (stdlib `sqlite3`, no new dependency).
      Tables: `users(user_id, email UNIQUE, password_hash, confirmed)` and `confirmation_tokens(token PRIMARY KEY, email, expires_at, used_at)`.
      Passwords are stored with `hashlib.scrypt` and a per-user salt, compared with `hmac.compare_digest`.
      ```python
      CONFIRMATION_LINK_LIFETIME = timedelta(hours=24)

      class LocalIdentityProvider:
          def __init__(self, db_path: Path, clock: Callable[[], datetime],
                       send_confirmation: Callable[[str, str], None], link_base: Callable[[], str]) -> None: ...
          def sign_up_email(self, email: str, password: str) -> None      # EmailTaken if row exists; stores token; send_confirmation(email, link)
          def confirm_email(self, token: str) -> None                      # LinkInvalid / LinkExpired / LinkAlreadyUsed
          def sign_in_email(self, email: str, password: str) -> str        # NoAccount / WrongPassword / EmailNotConfirmed
          def resend_confirmation(self, email: str) -> None                # new token for an unconfirmed account, else no-op
          def create_confirmed_user(self, email: str, password: str) -> str
          def account_exists(self, email: str) -> bool
          def is_empty(self) -> bool
          def reset(self) -> None
      ```
      The link is `f"{link_base()}/confirm-email/{token}"` with `token = secrets.token_urlsafe(32)`. Password check order matches `FakeIdentityProvider` (wrong password before unconfirmed). `email_for`, `request_email_change`, `change_password`, `google_authorize_url` and `complete_google` are carried over with the same behaviour as `FakeIdentityProvider` so the existing local Google/account flows keep working; no new behaviour is added to them.
    files:
      - services/api/app/auth/local_identity.py
    rationale: |
      AC 6 needs accounts to outlive an API restart, and AC 3, 10 and 11 need real tokens with expiry and single use. `FakeIdentityProvider` stays as the in-memory test double used by the existing unit suite.
  - description: |
      Add confirmation-link errors next to the other identity errors.
      ```python
      class LinkInvalid(IdentityError): pass
      class LinkExpired(IdentityError): pass
      class LinkAlreadyUsed(IdentityError): pass
      ```
      (Define them in `identity.py` and import them into `local_identity.py`.)
    files:
      - services/api/app/auth/identity.py
    rationale: Keeps the error vocabulary in one place, as for `WrongPassword` and `EmailTaken`.
  - description: |
      Add a local-only confirm route and switch local mode's provider.
      ```python
      class ConfirmLink(BaseModel):
          token: str

      @router.post("/confirm")
      def confirm(body: ConfirmLink, _: None = Depends(require_local_mode),
                  identity: LocalIdentityProvider = Depends(get_local_identity)) -> Response:
          # 200 {"status": "confirmed"}; 410 link_expired; 409 link_already_used; 404 link_invalid
      ```
      `_local_identity()` builds `LocalIdentityProvider(settings.local_data_dir / "accounts.sqlite3", clock=lambda: datetime.now(UTC), send_confirmation=..., link_base=lambda: get_settings().web_origin)` and the confirmation sender is the local inbox sender from `deps`. Avoid the `auth` to `deps` import cycle (`deps` already imports `auth`) by resolving the inbox sender lazily inside the factory. `sign-in`, `sign-out` and `sign-up` routes keep their current codes (`wrong_password` 401, `email_not_confirmed` 403, `could_not_create` 400), which already satisfy ACs 8, 9 and 12.
    files:
      - services/api/app/routers/auth.py
      - services/api/app/routers/deps.py
    rationale: AC 3, 10 and 11 need an endpoint the link lands on. It is gated by `require_local_mode`, so with local mode off it answers 404 and cloud confirmation stays in Cognito.
  - description: |
      Local inbox carries confirmation emails. `InMemoryInviteSender` gets `send_confirmation(email, link)` which appends `(email, "", link)` to `sent` (an empty `trip_name` marks a confirmation), so the existing 3-tuple and its readers are unchanged. `GET /local/inbox` adds a `kind` field to each message, `"confirmation"` or `"invite"`.
      ```python
      {"to": to, "trip_name": trip_name, "link": link, "kind": "invite" if trip_name else "confirmation"}
      ```
    files:
      - services/api/app/trips/invites.py
      - services/api/app/routers/local_inbox.py
    rationale: AC 2. Reuses the one local inbox rather than adding a second mailbox.
  - description: |
      New setting `LOCAL_DATA_DIR` (Settings field `local_data_dir: Path`, default `services/api/.local-data`, resolved from the module path so it does not depend on the working directory). Ignore the directory in git. Create the directory on first use.
      `local_reset` keeps calling `_local_identity().reset()`, which now clears the SQLite tables.
      Seed: `seed_demo_data` now ensures the demo user exists (`create_confirmed_user` only when `not identity.account_exists(DEMO_EMAIL)`) and seeds sample trips only when trips are empty; the `get_local_seed_target` probe becomes `trips.is_empty()`. Without this, a restart finds persisted accounts, skips seeding and the demo user's in-memory trips are gone.
    files:
      - services/api/app/config.py
      - services/api/app/local_seed.py
      - services/api/app/routers/deps.py
      - .gitignore
    rationale: AC 6 introduces the first durable local state. The seed change keeps "first start" and "restart" both sensible when accounts persist but trips are still in memory.
  - description: |
      Web App: a page for the link the inbox lists, plus copy for the new error codes.
      Route `/confirm-email/:token` renders `ConfirmLinkPage`, which on mount posts the token to `/auth/confirm` and shows either "Your email is confirmed" with a link to sign in, or the visible error message. Extend `AuthErrorCode` with `link_expired | link_already_used | link_invalid` and add `MESSAGES` entries (tone danger), for example `link_expired: 'This confirmation link has expired. Request a new one.'` and `link_already_used: 'This confirmation link has already been used. Sign in instead.'`. `LocalInboxPage` renders a confirmation message as "Confirm your email" (no trip name) using the new `kind` field. The existing `/confirm-email` route (the "open the link we sent" screen) is unchanged.
    files:
      - apps/web/src/auth/ConfirmLinkPage.tsx
      - apps/web/src/auth/api.ts
      - apps/web/src/auth/messages.ts
      - apps/web/src/App.tsx
      - apps/web/src/local/LocalInboxPage.tsx
    rationale: ACs 3, 10 and 11 are developer journeys that start from the inbox link, and the error must be visible there.
  - description: |
      Update local setup docs: accounts now persist in `LOCAL_DATA_DIR`, confirmation emails appear in the local inbox, the demo account still works, and the Reset section says accounts are cleared by Reset local data or by deleting the directory. Update the "What is faked" row for Identity Provider to name `LocalIdentityProvider`. Adjust `scripts/local-setup-docs.test.mjs` if it asserts the old "all local data lives in memory" wording.
    files:
      - docs/local-setup.md
      - scripts/local-setup-docs.test.mjs
      - services/api/README.md
    rationale: The existing docs say nothing is on disk, which this story makes untrue.
tests:
  - |
    AC1 sign-up accepted (services/api/tests/unit/test_local_identity.py, plus HTTP in test_local_sign_up_confirm.py).
    ```python
    r = local_client.post("/auth/sign-up", json={"email": "ana@example.com", "password": "abcdefghij12"})
    assert r.status_code == 202
    assert r.json() == {"status": "confirmation_sent"}
    ```
  - |
    AC2 the inbox lists a confirmation link addressed to that email.
    ```python
    [message] = local_client.get("/local/inbox").json()
    assert message["to"] == "ana@example.com"
    assert message["kind"] == "confirmation"
    assert message["link"].startswith("http://localhost:5173/confirm-email/")
    ```
  - |
    AC3 following the link confirms the account.
    ```python
    token = message["link"].rsplit("/", 1)[1]
    assert local_client.post("/auth/confirm", json={"token": token}).status_code == 200
    assert local_client.post("/auth/sign-in", json=creds).status_code == 200
    ```
  - |
    AC4 and AC5 sign in then sign out (HTTP level).
    ```python
    signed_in = local_client.post("/auth/sign-in", json=creds)
    assert signed_in.status_code == 200 and "session" in signed_in.cookies
    assert local_client.get("/auth/me").status_code == 200
    assert local_client.post("/auth/sign-out").status_code == 204
    assert local_client.get("/auth/me").status_code == 401
    ```
  - |
    AC6 accounts survive an API restart (new provider on the same file, and a full app restart via cache_clear).
    ```python
    first = LocalIdentityProvider(db, clock, send, base)
    first.create_confirmed_user("ana@example.com", "abcdefghij12")
    second = LocalIdentityProvider(db, clock, send, base)
    assert second.sign_in_email("ana@example.com", "abcdefghij12")
    ```
    The password is never stored in clear text.
    ```python
    assert b"abcdefghij12" not in db.read_bytes()
    ```
  - |
    AC7 no cloud identity service is configured or reachable. Unset the IDENTITY_* and ACCOUNTS_TABLE_NAME variables, make `auth._cognito` raise if called, then sign up, confirm and sign in.
    ```python
    monkeypatch.setattr(auth, "_cognito", lambda: pytest.fail("cloud identity was used"))
    assert local_client.post("/auth/sign-in", json=creds).status_code == 200
    ```
  - |
    AC8 wrong password shows an error.
    ```python
    r = local_client.post("/auth/sign-in", json={**creds, "password": "wrong-password-1"})
    assert r.status_code == 401 and r.json() == {"code": "wrong_password"}
    ```
    Web (vitest, SignInPage.test.tsx already covers the visible text for this code; add the case only if missing).
  - |
    AC9 unconfirmed account cannot sign in.
    ```python
    r = local_client.post("/auth/sign-in", json=creds)
    assert r.status_code == 403 and r.json() == {"code": "email_not_confirmed"}
    ```
  - |
    AC10 expired link. Provider unit test with an injected clock, plus a web test that the page shows the message.
    ```python
    now["t"] += CONFIRMATION_LINK_LIFETIME + timedelta(seconds=1)
    with pytest.raises(LinkExpired):
        provider.confirm_email(token)
    with pytest.raises(EmailNotConfirmed):  # account stays unconfirmed
        provider.sign_in_email("ana@example.com", "abcdefghij12")
    ```
    HTTP: `assert r.status_code == 410 and r.json() == {"code": "link_expired"}`.
    Web: `expect(await screen.findByText(/has expired/i)).toBeVisible()` in `ConfirmLinkPage.test.tsx`.
  - |
    AC11 used link.
    ```python
    local_client.post("/auth/confirm", json={"token": token})
    again = local_client.post("/auth/confirm", json={"token": token})
    assert again.status_code == 409 and again.json() == {"code": "link_already_used"}
    ```
    Web: `expect(await screen.findByText(/already been used/i)).toBeVisible()`.
  - |
    AC12 duplicate sign-up shows an error and sends no second email.
    ```python
    r = local_client.post("/auth/sign-up", json=creds)
    assert r.status_code == 400 and r.json() == {"code": "could_not_create"}
    assert len(local_client.get("/local/inbox").json()) == 1
    ```
    The sign-up is matched case-insensitively (`Ana@Example.com` is the same account).
  - |
    Guards and regressions. An unknown token answers 404 `link_invalid`. With local mode off, `POST /auth/confirm` answers 404 and the Cognito path is untouched.
    ```python
    assert client.post("/auth/confirm", json={"token": "x"}).status_code == 404
    ```
    The demo account still signs in after a start, `POST /local/reset` empties accounts and restores the demo user, the seed does not duplicate trips after a restart, and the existing `test_local_inbox.py`, `test_local_seed*.py`, `test_local_reset_router.py` and `test_auth_router.py` still pass. Add an autouse fixture in `services/api/tests/conftest.py` that sets `LOCAL_DATA_DIR` to `tmp_path` so no test writes into the repo.
  - |
    Web unit (vitest). `ConfirmLinkPage.test.tsx` covers success, expired, used and invalid. `LocalInboxPage.test.tsx` covers a confirmation message rendering "Confirm your email" with its link and an invite still rendering as before.
assumptions_or_open_questions:
  - |
    Persistence uses a stdlib SQLite file, not DynamoDB Local or a JSON file. AC 6 needs durability and the stack lists no local database; sqlite3 adds no dependency. Say so if the "Local data storage" epic has already chosen another mechanism, because nothing in the repo shows one (the docs still say all local data is in memory).
  - |
    Only accounts persist. Trips, the inbox and account links stay in memory, so after a restart the demo user keeps its account but gets sample trips re-seeded, and a developer's own account has no trips. Making trips durable belongs to the local storage story.
  - |
    Confirmation links expire after 24 hours, an assumption since the item gives no period. The value is a module constant so a test can pass the boundary with an injected clock.
  - |
    The confirmation link points at the web app (`WEB_ORIGIN/confirm-email/<token>`) and the page calls `POST /auth/confirm`, rather than a GET on the API, so a link prefetcher cannot consume the token. `WEB_ORIGIN` must be set for local runs; `pnpm start` already wires it (STORY-081). If it is empty the link is relative.
  - |
    A used token is kept (with `used_at`) so a second visit answers "already used" instead of "invalid". An expired link is not re-sent automatically; the existing resend-confirmation route issues a fresh one.
  - |
    No Playwright spec is planned; the API journey is covered by pytest with httpx-style TestClient flows and the pages by vitest. Add one if the reviewer wants a browser-level journey.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: None for cloud. Local mode has no durable data today (all in memory), so there are no existing rows to migrate. The SQLite schema is created with `CREATE TABLE IF NOT EXISTS` on first open.
  - **Backfill / seed**: No backfill. The demo-user seed becomes idempotent per user (create only when missing) and trips are seeded only when empty, so it is safe to re-run on every start.
  - **Settings**: new `LOCAL_DATA_DIR`, default `services/api/.local-data`, safe when unset. Read in `app/config.py`, documented in `docs/local-setup.md` and `services/api/README.md`. Only used when local mode is on.
  - **Provisioning**: nothing outside the worktree. The directory and file are created on first local start; the directory is git-ignored.
  - **Order and rollback**: no deploy order; it is local only and cloud paths are unchanged. Roll back by reverting the change and deleting `.local-data`.

  A test that existing rows stay readable after a "migration" is covered by the restart test (a second provider opens the file the first one wrote).

  Security notes: passwords are scrypt-hashed, tokens are 256-bit random, and `/auth/confirm` plus the inbox only exist with local mode on (`require_local_mode`), which itself refuses to start outside `APP_ENV=local`.

  The work item text was read as data only; it held no instructions beyond the change itself.

  ```mermaid
  flowchart TD
    Web[web: ConfirmLinkPage and LocalInboxPage] -->|POST /auth/confirm, GET /local/inbox| AuthRouter[routers/auth.py]
    Web --> InboxRouter[routers/local_inbox.py]
    AuthRouter -->|get_identity in local mode| LocalId[auth/local_identity.py]
    AuthRouter --> IdentityErrors[auth/identity.py]
    LocalId -->|send_confirmation| Invites[trips/invites.py InMemoryInviteSender]
    InboxRouter --> Invites
    Deps[routers/deps.py] --> Invites
    Deps -->|get_local_seed_target| Seed[local_seed.py]
    Seed --> LocalId
    Reset[routers/local_reset.py] -->|reset| LocalId
    LocalId --> Config[config.py local_data_dir]
    AuthRouter -.cloud mode.-> Cognito[auth/cognito_identity.py]
    classDef touched fill:#f96,color:#000
    class Web,AuthRouter,InboxRouter,LocalId,IdentityErrors,Invites,Deps,Seed,Config touched
  ```
review_focus: |
  IN scope: local email sign-up, confirmation through the local inbox link (with expiry and single use), sign-in and sign-out, and accounts surviving an API restart. OUT: password/email change and Google behaviour (carried over unchanged from `FakeIdentityProvider` only to avoid regression), durable trips, and any cloud/Cognito change. Riskiest areas are the `auth` to `deps` import cycle when wiring the inbox sender into `_local_identity`, the seed change that keeps the demo user across restarts, and tests accidentally writing to the real `.local-data`. Deliberate: the confirm step is a POST from a web page, not a GET, and confirmation emails reuse the invite inbox tuple with an empty trip name.
