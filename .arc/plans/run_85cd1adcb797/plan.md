summary: |
  Add sign-up, sign-in and sign-out for travellers with Google or email and password. The Trip Planner API gets an `/auth` router backed by an `IdentityProvider` port (ADR-0009, email delivery per ADR-0010) and a Trip Database (DynamoDB) account-link record. It issues an HttpOnly session cookie that slides on use and expires after 7 days of inactivity. The Web App gets the approved screens: Sign in, Sign up, Confirm your email, the error states, the "No account yet" modal for an unlinked Google account, and a signed-in Home with Sign out. Excluded: account settings and the signed-out redirect (separate stories in the epic), and the header sign-in entry point.
scope:
  - description: |
      API password policy and session token (pure logic, written test-first).
      ```python
      # app/auth/password.py
      def validate_password(password: str) -> bool: ...   # len >= 12, >=1 letter, >=1 digit
      # app/auth/session.py
      SESSION_IDLE_LIMIT = timedelta(days=7)
      def issue_session(user_id: str, now: datetime) -> str: ...        # HMAC-signed, carries last_active
      def read_session(token: str, now: datetime) -> str | None: ...    # None if bad signature or now - last_active >= 7 days
      ```
    files:
      - services/api/app/auth/__init__.py
      - services/api/app/auth/password.py
      - services/api/app/auth/session.py
      - services/api/app/config.py
      - services/api/tests/unit/test_password.py
      - services/api/tests/unit/test_session.py
    rationale: |
      Covers AC 6, 7, 8 and 15-18. The cookie is re-issued on every authenticated request, so the 7 days are measured from last use, not from sign-in. The signing key comes from a setting, never a literal.
  - description: |
      IdentityProvider port with an in-memory fake (tests) and a Cognito adapter via boto3 (production), plus an account store for Google-to-account links.
      ```python
      class IdentityProvider(Protocol):
          def sign_up_email(self, email: str, password: str) -> None: ...   # unconfirmed account; sends the confirmation email
          def sign_in_email(self, email: str, password: str) -> str: ...    # user_id; raises WrongPassword, NoAccount, EmailNotConfirmed
          def resend_confirmation(self, email: str) -> None: ...
          def google_authorize_url(self, state: str) -> str: ...
          def complete_google(self, code: str) -> str: ...                  # user_id; raises GoogleCancelled, GoogleNotLinked
      ```
    files:
      - services/api/app/auth/identity.py
      - services/api/app/auth/fake_identity.py
      - services/api/app/auth/cognito_identity.py
      - services/api/app/auth/accounts.py
    rationale: |
      ADR-0009 requires an Identity Provider but does not name one; the port keeps the router testable and the vendor swappable. Cognito is assumed because the target is AWS serverless (ADR-0006). Email confirmation delivery (ADR-0010) is performed by the provider.
  - description: |
      `/auth` router, registered in `app/main.py`:
      POST /auth/sign-up, POST /auth/sign-in, POST /auth/sign-out, POST /auth/resend-confirmation, GET /auth/google/start?mode=in|up, GET /auth/google/callback, GET /auth/me.
      Sign-up never signs the traveller in (no cookie set) and returns 202. A duplicate email returns the same 202/generic body as success, or a generic 400 `could_not_create`, and never says an account exists.
      Sign-in errors use stable codes: `wrong_password`, `no_account`, `email_not_confirmed`, `google_cancelled`, `google_not_linked`.
      Sign-out clears the cookie. `/auth/me` returns 401 without a valid session and re-issues the cookie when valid.
    files:
      - services/api/app/routers/auth.py
      - services/api/app/main.py
      - services/api/tests/unit/test_auth_router.py
      - services/api/tests/e2e/test_auth_e2e.py
    rationale: |
      Covers AC 1-5, 9-14 and 19-22 at the API boundary. Existing e2e style is httpx ASGITransport plus anyio.run (see test_health_e2e.py).
  - description: |
      Web: tokens and component classes, API client and auth context, routing.
      Add `react-router`. `AuthProvider` exposes `{ status: 'loading' | 'signedIn' | 'signedOut', signIn, signUp, signOut }` and calls `GET /auth/me` on load, which gives the persisted session (AC 6-8).
      Routes: `/sign-in`, `/sign-up`, `/confirm-email`, `/` (signed-in Home). After sign-out, navigate to `/sign-in` (AC 9).
      index.css imports `design-system/tokens.css` and maps the prototype's `.btn`, `.card`, `.field`, `.input`, `.alert`, `.modal`, `.backdrop`, `.spinner`, `.stack` and `.cluster` classes onto it, built from tokens only.
    files:
      - apps/web/package.json
      - apps/web/src/index.css
      - apps/web/src/main.tsx
      - apps/web/src/App.tsx
      - apps/web/src/auth/api.ts
      - apps/web/src/auth/AuthProvider.tsx
      - apps/web/src/auth/messages.ts
      - apps/web/vite.config.ts
    rationale: |
      The shell has no router and no styling beyond the tailwind import, so this is the minimum wiring the screens need. `messages.ts` holds the exact approved copy keyed by API error code.
  - description: |
      Web screens built from the approved prototype (TRAVEL-PLANNER-APP-STORY-029-design.html).
      Shared layout: `.auth.stack` is one centred column with max width `--size-modal-width`, holding a `.card.stack` form (`h1`, `.field` with `.field-label` and `.input`, one `.btn-primary.fill`, "or", `.btn-secondary.fill` with the "G" mark, then a link row). A problem shows as an `.alert` ABOVE the card (`role="alert"`, icon, copy), the typed email is kept, and the invalid field gets `.is-invalid` plus `aria-invalid` and `aria-describedby` pointing at the alert.
      Password field: `.pwrow` with a `.btn-ghost.btn-icon` eye toggle (aria-label "Show password" / "Hide password") and `autocomplete` `current-password` on sign-in, `new-password` on sign-up. Sign-up has a `.field-hint` "At least 12 characters, with a letter and a number."; errors appear only after submit.
      Submit button swaps its label for a `.spinner` and "Please wait" while pending. The Google button shows a spinner and "Waiting for Google".
      Screens and copy:
        Sign in (primary "Sign in", secondary "Continue with Google", "No account? Sign up").
        Sign up (title "Create account", primary "Create account", secondary "Sign up with Google", "Already have an account? Sign in").
        Wrong password: danger alert "Password did not match. Try again."
        No account: danger alert "No account exists for that email. Sign up." with Sign up as a link.
        Not confirmed: warning alert "Confirm your email address before signing in." with a `.btn-ghost.btn-sm` "Resend email".
        Google cancelled: warning alert "Sign-in with Google was cancelled. Try again or sign in with email and password."
        Google not linked: `.modal` (role=dialog, aria-modal, labelled by "No account yet", with `.backdrop`), text "No account is linked to this Google account.", hint "Sign up to create one, then you can sign in with Google.", `.btn-primary` "Sign up" and `.btn-ghost` "Cancel" back to sign in. Focus moves into the modal, Esc closes, focus is returned.
        Password rule: danger alert "Password needs at least 12 characters, with a letter and a number."
        Email taken: danger alert "We could not create an account with that email. Try signing in." (generic by design).
        Confirm your email: centred `.card` with a mail mark, "Confirm your email", "Open the link we sent to your email address, then sign in.", `.btn-secondary` "Back to sign in".
        Signed-in Home: `h1` "Your trips" with a welcome line and the note "You'll stay signed in on this device until you sign out or go 7 days without opening Travel Planner."
      The shell header, nav and Sign out placement belong to the shell and the header-entry-point story. This story adds only a "Sign out" `.btn-ghost` on Home, wired to `signOut`.
      Responsiveness: single column at 375px; card width capped at `--size-modal-width`; shell padding steps up at 48rem. Inputs and buttons use `--size-control-md` or larger for touch.
    files:
      - apps/web/src/auth/SignInPage.tsx
      - apps/web/src/auth/SignUpPage.tsx
      - apps/web/src/auth/ConfirmEmailPage.tsx
      - apps/web/src/auth/GoogleNoAccountModal.tsx
      - apps/web/src/auth/PasswordField.tsx
      - apps/web/src/auth/HomePage.tsx
      - apps/web/src/auth/SignInPage.test.tsx
      - apps/web/src/auth/SignUpPage.test.tsx
      - apps/web/src/auth/AuthProvider.test.tsx
      - apps/web/e2e/auth.spec.ts
    rationale: |
      Implements the approved screens: sign-in, sign-up, the five error or recovery states, and the confirm-email and signed-in screens. Tabs, drawers and toasts are not used.
  - description: |
      Config and docs: new settings (SESSION_SECRET, IDENTITY_USER_POOL_ID, IDENTITY_CLIENT_ID, GOOGLE_REDIRECT_URI, WEB_ORIGIN, ACCOUNTS_TABLE_NAME) with safe defaults, documented in the API README. Add `boto3` and `mangum` if the Lambda handler is not present yet.
    files:
      - services/api/README.md
      - services/api/pyproject.toml
      - services/api/requirements.txt
      - services/api/app/config.py
    rationale: |
      A missing `SESSION_SECRET` must fail closed (the app refuses to start outside tests) instead of silently signing sessions with a default.
tests:
  - |
    AC1 (sign-up then confirm then sign in), unit and e2e with the fake provider.
    ```python
    r = client.post("/auth/sign-up", json={"email": "maya@example.com", "password": "abcdefghij12"})
    assert r.status_code == 202
    fake.confirm("maya@example.com")
    r = client.post("/auth/sign-in", json={"email": "maya@example.com", "password": "abcdefghij12"})
    assert r.status_code == 200
    ```
  - |
    AC2 and AC4 (Google sign-up creates the account, Google sign-in signs in). The callback with mode up links the Google identity; the callback with mode in then sets the cookie.
    ```python
    r = client.get("/auth/google/callback", params={"code": "ok-new", "state": state_up}, follow_redirects=False)
    assert r.status_code == 303
    r = client.get("/auth/google/callback", params={"code": "ok-new", "state": state_in}, follow_redirects=False)
    assert "session=" in r.headers["set-cookie"]
    ```
  - |
    AC3 (email sign-in succeeds, the traveller can use the app).
    ```python
    assert client.get("/auth/me").json() == {"email": "maya@example.com"}
    ```
  - |
    AC5 and AC9 (sign-out). API test below; the Playwright test asserts the sign-in heading after clicking "Sign out".
    ```python
    client.post("/auth/sign-out")
    assert client.get("/auth/me").status_code == 401
    ```
    ```ts
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    ```
  - |
    AC6 (session persists across visits). Playwright reloads the page and stays signed in; the unit test covers the token.
    ```ts
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your trips' })).toBeVisible()
    ```
  - |
    AC7 and AC8 (7-day boundary), against `read_session` with a fixed clock.
    ```python
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    tok = issue_session("u1", t0)
    assert read_session(tok, t0 + timedelta(days=7)) is None
    assert read_session(tok, t0 + timedelta(days=6)) == "u1"
    ```
    The sliding behaviour is also asserted: an authenticated request at day 6 re-issues the cookie, and a read at day 12 (6 days after) is still valid.
  - |
    AC10 (wrong password). The API returns `wrong_password` and the UI shows the approved copy.
    ```tsx
    expect(await screen.findByRole('alert')).toHaveTextContent('Password did not match. Try again.')
    expect(screen.getByLabelText('Email')).toHaveValue('maya@example.com')
    ```
  - |
    AC11 (no account for email).
    ```tsx
    expect(await screen.findByRole('alert')).toHaveTextContent('No account exists for that email.')
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/sign-up')
    ```
  - |
    AC12 (Google cancelled). The callback with `error=access_denied` redirects to `/sign-in?error=google_cancelled`.
    ```tsx
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in with Google was cancelled. Try again or sign in with email and password.')
    ```
  - |
    AC13 (unconfirmed email cannot sign in).
    ```python
    r = client.post("/auth/sign-in", json={"email": "pending@example.com", "password": "abcdefghij12"})
    assert r.status_code == 403 and r.json()["code"] == "email_not_confirmed"
    assert "set-cookie" not in r.headers
    ```
  - |
    AC14 (sign-up does not sign in).
    ```python
    r = client.post("/auth/sign-up", json={"email": "new@example.com", "password": "abcdefghij12"})
    assert "set-cookie" not in r.headers
    assert client.get("/auth/me").status_code == 401
    ```
    UI: after submit the page shows the "Confirm your email" heading.
  - |
    AC15-AC18 (password boundaries), a parametrised unit test on `validate_password`, plus a router test that an invalid password returns 422 `password_rule` and creates no account.
    ```python
    assert validate_password("abcdefghij12") is True       # 12 chars, letter + number
    assert validate_password("abcdefghi12") is False       # 11 chars
    assert validate_password("abcdefghijkl") is False      # 12 chars, no number
    assert validate_password("123456789012") is False      # 12 chars, no letter
    ```
  - |
    AC19 and AC20 (Google not linked: not signed in, directed to sign up).
    ```python
    r = client.get("/auth/google/callback", params={"code": "ok-unlinked", "state": state_in}, follow_redirects=False)
    assert "set-cookie" not in r.headers
    assert r.headers["location"].endswith("/sign-in?error=google_not_linked")
    ```
    ```tsx
    const dialog = await screen.findByRole('dialog', { name: 'No account yet' })
    expect(within(dialog).getByRole('button', { name: 'Sign up' })).toBeInTheDocument()
    ```
  - |
    AC21 and AC22 (duplicate email is refused and the message does not reveal it). The response for an existing email is indistinguishable from any other generic failure, and no new account is created.
    ```python
    dup = client.post("/auth/sign-up", json={"email": "taken@example.com", "password": "abcdefghij12"})
    assert dup.status_code in (202, 400)
    assert "exists" not in dup.text.lower() and "already" not in dup.text.lower()
    assert fake.account_count("taken@example.com") == 1
    ```
    ```tsx
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not create an account with that email. Try signing in.')
    ```
assumptions_or_open_questions:
  - |
    ADR-0009 requires an Identity Provider but does not name one. I assumed Amazon Cognito (user pool plus Google federation) because the project targets AWS serverless (ADR-0006) and Cognito can send the confirmation email (ADR-0010). Please confirm, or name the provider; the `IdentityProvider` port isolates the choice.
  - |
    Duplicate-email sign-up (AC 21-22): the design shows a visible generic error ("We could not create an account with that email. Try signing in."), so the API returns a generic 400 that is identical to other non-rule failures, and the UI shows that copy. A strictly enumeration-proof flow (always show "Confirm your email") would conflict with the approved screen, so I followed the design. Please confirm.
  - |
    The prototype sign-in error alert "No account exists for that email. Sign up." reveals account existence on sign-in. AC 11 requires this message, so it is kept; AC 22 applies to sign-up only.
  - |
    Session is an HMAC-signed, HttpOnly, SameSite=Lax, Secure cookie that is re-issued on each authenticated request (sliding 7-day idle window). It is stateless, so sign-out clears the cookie on that device but cannot revoke a copied token before it expires. Server-side revocation would need a DynamoDB session table and is not planned.
  - |
    Google sign-in uses a server-side authorization-code redirect through the API (`/auth/google/start`, `/auth/google/callback`) and needs the Google client credentials configured in the identity provider. Sign-up and sign-in with Google are distinguished by a signed `state` value carrying the mode.
  - |
    The prototype's tokens.css contains `--duration-fast: [object Object]` (a token export bug). The web CSS must not copy those two lines; use literal durations (for example 150ms and 600ms) or omit transitions, and flag the token bug to the design-system owner.
  - |
    The header sign-in entry point, the redirect for signed-out visitors and account settings are separate epic stories. Until the redirect story lands, `/` shows the sign-in page when signed out, which is implemented only as the minimum needed for AC 5 and AC 9.
estimated_points: 8
package_dependencies:
  - name: boto3
    version: ">=1.35,<2"
    ecosystem: pip
    component_id: comp_trip_planner_api
    rationale: Cognito identity-provider adapter and DynamoDB account-link store.
  - name: react-router
    version: ^7.1.0
    ecosystem: npm
    component_id: comp_web_app
    rationale: The app has no router; sign-in, sign-up, confirm-email and home need real routes, including the post-sign-out navigation.
notes: |
  ### Data & rollout
  - **Existing data**: the Trip Database has no tables yet (the API is a health-check skeleton), so no existing rows are affected. One new `accounts` table is added; nothing is migrated and no existing item shape changes.
  - **Backfill / seed**: none. A provider user (email or Google) gets its account-link item on first confirmed sign-in or Google sign-up (`PutItem` with a condition expression, so it is idempotent). Items are keyed `pk = USER#<sub>`; a Google identity link is keyed `pk = GOOGLE#<google sub>` and points at the user.
  - **Settings**: `SESSION_SECRET` (no default; startup fails closed outside tests), `IDENTITY_USER_POOL_ID`, `IDENTITY_CLIENT_ID`, `GOOGLE_REDIRECT_URI`, `WEB_ORIGIN`, `ACCOUNTS_TABLE_NAME` (default `trip-planner-accounts`). Documented in `services/api/README.md`.
  - **Provisioning**: before the feature works once deployed, a Cognito user pool with a Google federated identity provider, SES-based confirmation email, and the DynamoDB `accounts` table must exist. No infrastructure code exists in this repo, so provisioning is a deployment prerequisite outside this plan.
  - **Order and rollback**: provision the pool and table, set the settings, deploy the API, then deploy the Web App. Rollback is redeploying the previous Web App and API; the new table and pool are additive and safe to leave in place. The personal data (email) is GDPR-scoped (ADR-0011), so no email or password is written to logs.

  ### Shape of the change
  ```mermaid
  flowchart TD
    Main[services/api/app/main.py] --> AuthRouter[app/routers/auth.py]
    AuthRouter --> Session[app/auth/session.py]
    AuthRouter --> Password[app/auth/password.py]
    AuthRouter --> IdP[app/auth/identity.py port]
    IdP --> Cognito[app/auth/cognito_identity.py]
    AuthRouter --> Accounts[app/auth/accounts.py]
    Accounts --> DDB[(Trip Database - DynamoDB)]
    Health[app/routers/health.py] --> Main
    WebMain[apps/web/src/main.tsx] --> AuthProv[auth/AuthProvider.tsx]
    AuthProv --> Pages[SignIn / SignUp / ConfirmEmail / Home pages]
    AuthProv -->|fetch /auth/*| AuthRouter
    classDef touched fill:#f96,color:#000
    class Main,AuthRouter,Session,Password,IdP,Cognito,Accounts,WebMain,AuthProv,Pages touched
  ```
  Touched nodes: `main.py` registers the router; `auth.py` is the HTTP boundary; `session.py` and `password.py` are pure logic for AC 6-8 and 15-18; the identity port isolates the unnamed provider; `AuthProvider` owns session state in the browser. `health.py` is the existing router (untouched).

  ### Conventions
  - Test style follows the repo: pytest unit tests in `services/api/tests/unit`, httpx ASGITransport e2e in `tests/e2e`, vitest with Testing Library plus Playwright for the web. Tailwind is the styling stack; the design tokens are consumed through CSS custom properties, with no hard-coded colours or spacing.
  - Copy follows the UI guidelines: warm, second person, errors say what happened and what to do next, with one `.btn-primary` per card.
  - The prototype's toast-style messages are drawn as inline `.alert` (guidelines: `.alert` for problems that stay on the page); the prototype states the same deviation. No conflict between the prototype and any AC was found.
review_focus: |
  IN scope: the API `/auth` router, the identity port with a Cognito adapter, the account-link record, the sliding 7-day session cookie, and the approved Web screens (sign in, sign up, confirm email, error states, Google not-linked modal, signed-in Home with Sign out). OUT: account settings, the header entry point and the signed-out redirect. Riskiest areas are the session expiry boundary (exactly 7 days must expire, 6 days must not, and the cookie must slide) and the enumeration-proof sign-up error (AC 22), which deliberately differs from the sign-in "no account" message (AC 11). The Cognito choice and the generic-400 design for duplicate emails are assumptions awaiting reviewer confirmation.
