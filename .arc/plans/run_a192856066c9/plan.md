summary: |
  Make the Account page's password and email change work end to end in local mode. Most of the
  surface already exists: `POST /auth/account/password` and `POST /auth/account/email` are guarded
  by the session, the Account page has both cards, and local sign-in already checks the stored
  email and password hash. The real gap is `LocalIdentityProvider.request_email_change`, which today
  only writes to an in-memory dict. It sends no link to the local inbox, survives no restart, and
  following a link can never change the email, because `confirm_email` only confirms sign-up tokens.
  The plan makes an email change a persisted, single-use, expiring confirmation token addressed to
  the new email. Opening it through the existing `POST /auth/confirm` moves the account to the new
  email. The old email keeps signing in until then. The web side adds the "Email changed" outcome on
  the confirmation-link page, labels email-change messages in the local inbox, and aligns the Account
  page with the approved prototype. The remaining acceptance criteria (wrong or previous password,
  weak password, signed out, email taken) are pinned with tests against behaviour that already exists.

scope:
  - description: |
      Local identity: persist a pending email change and apply it when its link is opened.
      Schema: add nullable columns `user_id TEXT` and `new_email TEXT` to `confirmation_tokens`
      (a row with `new_email` set is an email-change token; sign-up tokens leave them NULL).
      Because `CREATE TABLE IF NOT EXISTS` will not alter a table that already exists in a
      developer's `accounts.sqlite3`, add a guarded migration in `__init__`: read
      `PRAGMA table_info(confirmation_tokens)` and `ALTER TABLE ... ADD COLUMN` for each missing column.

      ```python
      def request_email_change(self, email: str, current_password: str, new_email: str) -> None:
          # check_password(email, current_password) -> WrongPassword
          # account_exists(new_email) -> EmailTaken (no token, no message)
          # insert token row (user_id, new_email) and send_confirmation(new_email, link)
      ```

      `confirm_email(token)` keeps its order of checks (LinkInvalid, LinkAlreadyUsed, LinkExpired). For
      an email-change token it also re-checks that `new_email` is still free (EmailTaken), then in one
      transaction marks the token used and runs `UPDATE users SET email = ? WHERE user_id = ?`.
      Requesting a new change supersedes any earlier unused change token for the same user, so only the
      newest link works (the older one answers LinkAlreadyUsed). Drop the `pending_email` dict and
      remove its use in `reset()`. Tokens are not created for sign-up when `new_email` is NULL, so the
      sign-up path is untouched.
    files:
      - services/api/app/auth/local_identity.py
    rationale: |
      AC 3, 4, 5, 12, 13, 14, 15. The change must be a stored token so an expired or used link is
      distinguishable and the old email keeps working until the link is followed.

  - description: |
      Auth router and local inbox: make `/auth/confirm` say what it confirmed, and mark email-change
      messages. `LocalIdentityProvider.confirm_email` returns `Literal["sign_up", "email_change"]`;
      `confirm()` in `auth.py` responds `{"status": "confirmed", "kind": kind}`. The existing
      sign-up response keeps `status: confirmed`, so the old web tests still pass. Email-change links
      are sent through the existing `send_confirmation` callable, so the inbox lists them with
      `kind: "confirmation"` today. Add an explicit `kind: "email_change"` so the inbox can title the
      row "Confirm your new email address" per the prototype: `InMemoryInviteSender.send_confirmation`
      gains an optional `kind` that is stored with the message, and `read_inbox` returns it.
      The `IdentityProvider` Protocol docstring for `request_email_change` is updated to say the new
      address receives the link. `FakeIdentityProvider` and `CognitoIdentityProvider` keep their
      behaviour; the `confirm_email` return type only applies to the local provider.
    files:
      - services/api/app/routers/auth.py
      - services/api/app/routers/local_inbox.py
      - services/api/app/trips/invites.py
      - services/api/app/auth/identity.py
    rationale: |
      AC 3 (link addressed to the new email is listed), AC 4 and 12 (the link outcome must be
      distinguishable from sign-up).

  - description: |
      Web: confirmation-link page and API client. `requestConfirmLink` returns the parsed body
      (`{ status, kind }`). `ConfirmLinkPage` renders the prototype's "Email changed" screen for
      `kind === 'email_change'`: `h1` "Email changed", `.alert.alert-success` with the check icon
      "Your email address has been changed.", muted text "Sign in with your new email address and your
      password. The previous address no longer works.", and a "Sign in" link. Sign-up links keep
      "Your email is confirmed". Failures keep the existing `.alert-danger` with the "Link not valid"
      outcome, and the message copy is extended to say the email is unchanged and the previous
      address still works (prototype "Link not valid"). `LocalInboxPage` titles rows with
      `kind === 'email_change'` "Confirm your new email address" and shows "To: <new email>" as
      `text-sm text-muted` in the prototype's order.
    files:
      - apps/web/src/auth/api.ts
      - apps/web/src/auth/ConfirmLinkPage.tsx
      - apps/web/src/auth/messages.ts
      - apps/web/src/local/LocalInboxPage.tsx
    rationale: |
      AC 4, 5, 12, 13. Prototype screens "Email changed", "Link not valid" and "Local inbox".

  - description: |
      Web: Account page, aligned with the approved prototype within the existing `ChangeCard`.
      Prototype elements applied: the page is a `.narrow.stack-lg` column with `h1` "Account"; card
      headings "Change password" and "Change email" (`h2`); the email card shows the current email as a
      disabled `.input` labelled "Current email"; the submit buttons are `.btn-primary` "Change
      password" and "Send confirmation link" (one primary per card, as the prototype does); errors
      render in an `.alert.alert-danger` with the title "Could not change password." or "Could not
      change email.", `role="alert"`, `tabindex="-1"`, and focus moves to it after submit while the
      typed input is kept; after a successful email request a `.pending-note` shows a
      `.badge.badge-warning` "Waiting for confirmation" and "We sent a link to <new email>. Until you
      follow it, <current email> stays your sign-in email."; successes use the existing `.toast`
      ("Password changed. Use it next time you sign in." and "Confirmation link sent to <new email>");
      a link "Open local inbox" to `/local/inbox` shows only in local mode (`fetchLocalMode`). The
      pending note reads from component state, so it is lost on reload (see open questions). Keep the
      existing 12-character client-side rule so the page agrees with the API. Keep the Traveller
      profile and Sign out blocks.
    files:
      - apps/web/src/account/AccountPage.tsx
    rationale: |
      AC 1, 3, 8, 10, 16 and the prototype's Account screen states (pending, wrong current password,
      weak password, email taken).

  - description: |
      Tests that pin the behaviour that already exists, so regressions are caught: signed-out
      submits (AC 6, 7), email taken (AC 8, 9), wrong current password (AC 10, 11), weak password
      (AC 16), new password signs in and the previous one fails (AC 1, 2). These go in a new local
      account-change test module plus one Playwright spec for the flow.
    files:
      - services/api/tests/unit/test_local_account_change.py
      - services/api/tests/unit/test_local_identity.py
      - apps/web/src/account/AccountPage.test.tsx
      - apps/web/src/auth/ConfirmLinkPage.test.tsx
      - apps/web/src/local/LocalInboxPage.test.tsx
      - apps/web/e2e/account.spec.ts
    rationale: |
      Test-first for every acceptance criterion; the e2e spec covers the whole user journey in a browser.

tests:
  - |
    AC 1 (API, `test_local_account_change.py`): the new password signs in.
    ```python
    r = local_client.post("/auth/account/password", json={"current_password": PASSWORD, "new_password": NEW})
    assert r.status_code == 204
    assert local_client.post("/auth/sign-in", json={"email": EMAIL, "password": NEW}).status_code == 200
    ```
  - |
    AC 2: after the change, the previous password is refused.
    ```python
    r = local_client.post("/auth/sign-in", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 401 and r.json() == {"code": "wrong_password"}
    ```
    Web: a `SignInPage` test already shows the error alert for `wrong_password`; add an e2e step that signs in with the previous password and expects `getByRole('alert')` to be visible.
  - |
    AC 3: an email change lists a link addressed to the new email.
    ```python
    r = local_client.post("/auth/account/email", json={"current_password": PASSWORD, "new_email": "new@example.com"})
    assert r.status_code == 202
    [message] = [m for m in local_client.get("/local/inbox").json() if m["to"] == "new@example.com"]
    assert message["kind"] == "email_change"
    assert message["link"].startswith("http://localhost:5173/confirm-email/")
    ```
    Unit (`test_local_identity.py`): `provider.request_email_change(EMAIL, PASSWORD, "new@example.com")` then `assert env["sent"][-1][0] == "new@example.com"`.
  - |
    AC 4: following the link then signing in with the new email works.
    ```python
    token = token_for(local_client, "new@example.com")
    assert local_client.post("/auth/confirm", json={"token": token}).json() == {"status": "confirmed", "kind": "email_change"}
    assert local_client.post("/auth/sign-in", json={"email": "new@example.com", "password": PASSWORD}).status_code == 200
    ```
    Also `assert local_client.get("/auth/me").json()["email"] == "new@example.com"` for the still-signed-in session.
  - |
    AC 5: after the link, the previous email no longer signs in.
    ```python
    r = local_client.post("/auth/sign-in", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 404 and r.json() == {"code": "no_account"}
    ```
  - |
    AC 6: signed out, a password change is refused and nothing changes.
    ```python
    anon = TestClient(app)
    r = anon.post("/auth/account/password", json={"current_password": PASSWORD, "new_password": NEW})
    assert r.status_code == 401
    assert local_client.post("/auth/sign-in", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    ```
  - |
    AC 7: signed out, an email change lists nothing.
    ```python
    before = len(local_client.get("/local/inbox").json())
    r = anon.post("/auth/account/email", json={"current_password": PASSWORD, "new_email": "new@example.com"})
    assert r.status_code == 401
    assert len(local_client.get("/local/inbox").json()) == before
    ```
  - |
    AC 8 and 9: an email used by another account is refused and the email is unchanged.
    ```python
    r = local_client.post("/auth/account/email", json={"current_password": PASSWORD, "new_email": DEMO_EMAIL})
    assert r.status_code == 409 and r.json() == {"code": "email_unavailable"}
    assert local_client.get("/auth/me").json()["email"] == EMAIL
    assert not [m for m in local_client.get("/local/inbox").json() if m["to"] == DEMO_EMAIL]
    ```
    Web (`AccountPage.test.tsx`): a 409 `email_unavailable` renders `screen.getByRole('alert')` with the "Could not change email." title and keeps the typed value.
  - |
    AC 10 and 11: a wrong current password is an error and the previous password still signs in.
    ```python
    r = local_client.post("/auth/account/password", json={"current_password": "wrong-password-1", "new_password": NEW})
    assert r.status_code == 403 and r.json() == {"code": "wrong_password"}
    assert local_client.post("/auth/sign-in", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    ```
    Web: a 403 `wrong_password` shows `field-error` / alert text and focus moves to the current-password input.
  - |
    AC 12: an expired or already-used email-change link is an error and the page says so.
    ```python
    assert local_client.post("/auth/confirm", json={"token": token}).status_code == 200
    again = local_client.post("/auth/confirm", json={"token": token})
    assert again.status_code == 409 and again.json() == {"code": "link_already_used"}
    # expired: auth._local_identity()._clock = lambda: later  (later = now + CONFIRMATION_LINK_LIFETIME + 1 min)
    assert expired.status_code == 410 and expired.json() == {"code": "link_expired"}
    ```
    Web (`ConfirmLinkPage.test.tsx`): `expect(await screen.findByText(/has expired/i)).toBeVisible()` for 410, and the success case `findByText('Email changed')` for `{ status: 'confirmed', kind: 'email_change' }`.
  - |
    AC 13: after a failed link, the previous email still signs in.
    ```python
    assert local_client.post("/auth/sign-in", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    ```
    Also a unit test that an expired token leaves `users.email` unchanged: `assert provider.sign_in_email(EMAIL, PASSWORD)` after `pytest.raises(LinkExpired)`.
  - |
    AC 14 and 15: before the link is followed, the new email fails and the previous one signs in.
    ```python
    r = local_client.post("/auth/sign-in", json={"email": "new@example.com", "password": PASSWORD})
    assert r.status_code == 404 and r.json() == {"code": "no_account"}
    assert local_client.post("/auth/sign-in", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    ```
  - |
    AC 16: a password sign-up rejects is refused and the password is unchanged.
    ```python
    r = local_client.post("/auth/account/password", json={"current_password": PASSWORD, "new_password": "short1"})
    assert r.status_code == 422 and r.json() == {"code": "password_rule"}
    assert local_client.post("/auth/sign-in", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    ```
    Web: submitting "short1" shows "Password is too short. Use at least 12 characters, with a letter and a number." and does not call `POST /auth/account/password`.
  - |
    Existing data (Data and rollout): open a SQLite file created with the old two-column-less schema, build `LocalIdentityProvider(db, ...)`, and assert the old accounts still sign in and an old sign-up token still confirms.
    ```python
    old = sqlite3.connect(db); old.executescript(OLD_SCHEMA); old.execute("INSERT INTO users ..."); old.commit()
    provider = env["make"]()
    assert provider.sign_in_email(EMAIL, PASSWORD)
    ```
  - |
    Playwright (`apps/web/e2e/account.spec.ts`), local mode: sign in as the demo account, request an email change on Account, open the local inbox, follow the link, expect "Email changed", sign in with the new email, and then with the old email expect a visible alert.
    ```ts
    await page.getByRole('link', { name: /http:\/\/.*confirm-email\// }).first().click()
    await expect(page.getByRole('heading', { name: 'Email changed' })).toBeVisible()
    ```

assumptions_or_open_questions:
  - |
    Prototype conflict, password rule. The prototype's hint and fixture say "at least 8 characters, the same rule as sign-up". Sign-up in the real code is 12 characters with a letter and a number (`app/auth/password.py`, `validate_password`), and the prototype itself says its rule only "stands in" for it. The plan keeps 12 so the Account page matches sign-up (AC 16), and the hint stays "At least 12 characters, with a letter and a number." Please confirm.
  - |
    Prototype conflict, current password on the email card. The prototype's email card has no current password field, but `POST /auth/account/email` requires `current_password` and the Cognito adapter verifies it too, so dropping it would weaken real behaviour ("matching what the real sign-in offers today"). The plan keeps the current-password field on both cards. Please confirm, or say if the backend check should be removed instead.
  - |
    Inbox status badges (Valid / Used / Expired) and the prototype-only session and link-age chips are not built. The badges need the inbox endpoint to look up token state, no AC needs it, and the chips are marked "Prototype only". Following an expired or used link already shows the error page. Say if the badges should be added.
  - |
    The pending-email note on the Account card is held in component state, so it disappears on reload. Persisting it would need a `GET /auth/me` field for the pending address, which no AC needs. Left out unless wanted.
  - |
    Requesting a second email change supersedes the first unused link (the older link then reports "already used"). The ACs do not say; this avoids two live links for one account.
  - |
    Local mode only. Cognito's email change (verification code) is untouched, and there is no forgotten-password reset, as the story scopes out.
  - |
    The security-sensitive existing limitation stays as is: sessions are stateless cookies, so changing the password does not sign out other browsers (see the comment in `change_password` in `auth.py`).

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout
  - **Existing data**: `accounts.sqlite3` under `LOCAL_DATA_DIR` already holds `users` and `confirmation_tokens` for developers who ran STORY-064/065. `confirmation_tokens` gains two nullable columns (`user_id`, `new_email`), added by a guarded `ALTER TABLE ... ADD COLUMN` at provider start-up (only when `PRAGMA table_info` lacks them). Old rows get NULL, which means "sign-up token", so unused sign-up links keep working and no user row changes.
  - **Backfill / seed**: none needed. The migration is idempotent and safe to re-run; the demo-user seed in `local_seed.py` is untouched.
  - **Settings**: none new. Links use the existing `WEB_ORIGIN` (documented in `docs/local-setup.md`); with it unset the link is relative, as for sign-up.
  - **Provisioning**: nothing to provision. Local mode only; the SQLite file is created on first start.
  - **Order and rollback**: the migration runs with the new code at start-up, so no separate step. Rolling back leaves two unused nullable columns, which the old code ignores. An email-change token left in the table would be read by the old `confirm_email` as a sign-up token and set `confirmed` on a row that already is confirmed, so it is harmless. `pnpm start`'s reset (`POST /local/reset`) also clears it.

  ### Shape of the change
  Email change reuses the sign-up confirmation machinery (token table, 24 hour lifetime, `/confirm-email/<token>` web page calling `POST /auth/confirm`, so a prefetcher cannot consume the link). The `docs/local-setup.md` paragraph on signing up gets one sentence on email change; it is the only doc change.

  ```mermaid
  flowchart TD
    Account[web AccountPage.tsx] -->|requestEmailChange / requestPasswordChange| AuthRouter[routers/auth.py]
    AuthRouter -->|request_email_change| LocalId[auth/local_identity.py]
    LocalId -->|send_confirmation new email| Invites[trips/invites.py InMemoryInviteSender]
    Inbox[routers/local_inbox.py] -->|reads sent| Invites
    InboxPage[web LocalInboxPage.tsx] -->|GET /local/inbox| Inbox
    ConfirmPage[web ConfirmLinkPage.tsx] -->|POST /auth/confirm| AuthRouter
    AuthRouter -->|confirm_email| LocalId
    LocalId --> Sqlite[(accounts.sqlite3)]
    Protocol[auth/identity.py] -.docstring.- LocalId
    classDef touched fill:#f96,color:#000
    class Account,AuthRouter,LocalId,Invites,Inbox,InboxPage,ConfirmPage,Protocol touched
  ```
  Touched nodes: AccountPage (prototype alignment), auth.py (confirm response carries the kind), local_identity.py (persisted email-change token, the core fix), invites.py and local_inbox.py (kind marker), LocalInboxPage and ConfirmLinkPage (email-change copy), identity.py (docstring only).

  Order of work (TDD): write the API tests first (they fail on AC 3, 4, 5, 12-15 because no link is issued), then `local_identity.py`, then router and inbox, then the web tests, then the web components, then the Playwright spec. Run `cd services/api && uv run pytest tests/unit` and `cd apps/web && pnpm vitest run && pnpm playwright test e2e/account.spec.ts`.

  Untrusted work item text was reviewed; it contained no instructions beyond the change itself.

review_focus: |
  Hold the change to local mode and the Account, confirmation-link and local-inbox surfaces: Cognito, forgotten-password reset and session revocation are out. The riskiest part is `local_identity.py`: the schema migration on an existing SQLite file, and that `confirm_email` applies the email change atomically, single-use, with a re-check that the new address is still free. Deliberate choices that differ from the prototype are the 12-character password rule and keeping the current-password field on the email card (both listed in the open questions), plus omitting the inbox status badges. Most acceptance criteria are tests over behaviour that already exists, so the real new behaviour is only AC 3, 4, 5 and 12-15.
