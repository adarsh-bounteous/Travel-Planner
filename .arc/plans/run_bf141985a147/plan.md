summary: |
  In local mode, "Continue with Google" currently redirects to the dead URL https://google.example/authorize. This plan makes
  LocalIdentityProvider send the browser to a local mock consent page in the web app (/local/google-consent) instead. The page lists
  known identities (each tagged "Has account" or "No account yet"), has a typed-email field, and offers Cancel and Allow.
  Allow and Cancel finish through the EXISTING /auth/google/callback, so state/nonce checks, session cookie, the
  ?error=google_cancelled notice and the ?error=google_not_linked "No account yet" modal are all reused. API changes are small: the
  local authorize URL, a local complete_google that resolves an email to its account, a "may sign in" rule for local accounts, and
  one local-only endpoint that lists known identities. Web work is the new consent page, built from the approved prototype.
scope:
  - description: |
      LocalIdentityProvider changes (existing file).
      - google_authorize_url(state) returns f"{self._link_base()}/local/google-consent?" + urlencode({"state": state}) instead of the dead google.example URL.
      - complete_google(code): code is now the email the developer chose. "cancelled" still raises GoogleCancelled. If an account exists for code.lower() return its user_id, otherwise keep returning f"google-{code}" (an unlinked identity).
      - new user_exists(user_id: str) -> bool and known_emails() -> list[str] (all account emails, ordered) helpers.
    files:
      - services/api/app/auth/local_identity.py
    rationale: |
      Local accounts live in the SQLite users table, so "linked to an account" means a users row for that email, as the prototype states ("Any email linked to an account signs you in as that account").
  - description: |
      Callback rule in the auth router. In google_callback, mode "in" currently requires accounts.is_google_linked(user_id). Allow it also when
      isinstance(identity, LocalIdentityProvider) and identity.user_exists(user_id). Do NOT link the store, so /auth/me still reports method "email" for these
      accounts and story 066's password/email change stays available to them. Cognito behaviour is unchanged.
    files:
      - services/api/app/routers/auth.py
    rationale: Without it a local account that was never Google-linked would be sent to google_not_linked, failing AC1/AC2.
  - description: |
      New local-only router GET /local/google-identities returning {"identities": [{"email": str, "has_account": bool}]}.
      Uses get_local_identity (404 with local mode off, as local_reset does). List = every existing account email, plus the fixed sample
      new.user@example.com with has_account false when no account uses it. Register it in main.py next to local_reset.
    files:
      - services/api/app/routers/local_google.py
      - services/api/app/main.py
    rationale: Gives the consent screen its "list of known identities" (AC8) and the per-row account tag the prototype shows. Same 404 guard pattern as the other /local routes.
  - description: |
      Web API helpers in auth/api.ts: fetchGoogleIdentities(): Promise<GoogleIdentity[]> (type GoogleIdentity = { email: string; has_account: boolean }, returns [] on failure),
      finishGoogle(state: string, outcome: { email: string } | 'cancel'), which calls window.location.assign to
      `/auth/google/callback?state=...&code=<email>` or `/auth/google/callback?state=...&error=access_denied`.
    files:
      - apps/web/src/auth/api.ts
    rationale: Keeps the full-page navigation (needed so the google_state cookie and the Set-Cookie session work) in the api module, as startGoogle already does.
  - description: |
      New GoogleConsentPage (route /local/google-consent, public like /local/inbox, added to App.tsx and to the comment listing the unguarded pages).
      Built from the prototype screens "Mock consent screen" and "Mock consent screen, invalid email":
      - Narrow centred column (max-width var(--size-modal-width)), .card with dashed warning border and a "Local only" .badge-warning with alert icon, .stack layout.
      - h2 "Choose an account" and the intro line "Travel Planner wants to sign you in with Google. Pick an identity or type an email address."
      - fieldset "Known identities" with one label.identity per row (radio .radio, email, then .badge-success "Has account" with check icon, or .badge-neutral "No account yet"). Selected row gets primary border, min height 44px.
      - .field with label "Or type an email address", .input type=email placeholder name@example.com, .field-hint "Any email linked to an account signs you in as that account.", .field-error.
      - Actions right aligned: .btn-secondary "Cancel" and the single .btn-primary "Allow" (submit); pending shows "Working…" and disables Allow.
      - Typing clears the selected radio, choosing a radio clears the typed text and the error.
      - Allow with empty or malformed email (same /^\S+@\S+\.\S+$/ as the prototype): no navigation, input gets .is-invalid + aria-invalid, .field-error "Enter a valid email address." (empty text uses "Choose an identity or enter an email address."), plus a role="alert" .alert-danger "You're not signed in." summary that takes focus, typed text kept. Errors show after submit only.
      - Allow with valid email calls finishGoogle(state, {email}); Cancel calls finishGoogle(state, 'cancel'). Missing state param shows an alert and disables Allow.
      - Phone first: single column, 375px, no fixed columns.
    files:
      - apps/web/src/auth/GoogleConsentPage.tsx
      - apps/web/src/App.tsx
    rationale: The consent screen is the story's core UI; the sign-in-page "Continue with Google" button and the existing GoogleNoAccountModal and cancel alert are reused unchanged.
  - description: |
      Docs: one short note in the API README local-mode section that Google sign-in is simulated by the consent page and which identities it lists.
    files:
      - services/api/README.md
    rationale: Developers need to know how to exercise the flow locally.
tests:
  - |
    API unit, test_local_identity.py (AC1, AC2 groundwork) written first:
    ```python
    def test_complete_google_resolves_an_existing_account_by_email(env):
        provider = env.provider
        user_id = provider.create_confirmed_user("Alex@Example.com", "pw-pw-pw-pw1")
        assert provider.complete_google("alex@example.com") == user_id
        assert provider.user_exists(user_id)

    def test_complete_google_for_unknown_email_is_not_an_account(env):
        uid = env.provider.complete_google("new.user@example.com")
        assert uid == "google-new.user@example.com" and not env.provider.user_exists(uid)

    def test_authorize_url_points_at_the_local_consent_page(env):
        url = env.provider.google_authorize_url("s1")
        assert url.startswith(f"{env.link_base}/local/google-consent?") and "state=s1" in url
    ```
  - |
    API router, test_auth_router.py with the local provider (AC1, AC2, AC5, AC7). Existing fake-based Google tests stay green:
    ```python
    def test_linked_email_signs_in_as_that_account(local_client):  # AC1, AC2
        local_client.provider.create_confirmed_user("alex@example.com", "pw-pw-pw-pw1")
        r = local_client.get("/auth/google/callback", params={"code": "alex@example.com", "state": _state(local_client, "in")})
        assert r.status_code == 303 and r.headers["location"].endswith("/")
        assert "session" in r.cookies
        assert local_client.get("/auth/me").json()["email"] == "alex@example.com"

    def test_email_without_account_gets_the_no_account_prompt(local_client):  # AC5, AC7
        r = local_client.get("/auth/google/callback", params={"code": "new.user@example.com", "state": _state(local_client, "in")})
        assert r.headers["location"].endswith("/sign-in?error=google_not_linked")
        assert "session" not in r.cookies
    ```
  - |
    API router, cancel (AC3, AC4 server side), already covered by test_google_cancelled; add a local-provider variant:
    ```python
    r = local_client.get("/auth/google/callback", params={"error": "access_denied", "state": _state(local_client, "in")})
    assert r.headers["location"].endswith("/sign-in?error=google_cancelled")
    assert "session" not in r.cookies
    ```
  - |
    API, new test_local_google_router.py (AC8):
    ```python
    def test_lists_accounts_and_the_sample_without_account(local_client):
        local_client.provider.create_confirmed_user("alex@example.com", "pw-pw-pw-pw1")
        body = local_client.get("/local/google-identities").json()
        assert {"email": "alex@example.com", "has_account": True} in body["identities"]
        assert {"email": "new.user@example.com", "has_account": False} in body["identities"]

    def test_404_with_local_mode_off(client):
        assert client.get("/local/google-identities").status_code == 404
    ```
  - |
    Web unit, GoogleConsentPage.test.tsx with vitest and Testing Library, finishGoogle mocked (AC6, AC8, AC9):
    ```tsx
    expect(await screen.findByRole('radio', { name: /alex@example.com/ })).toBeInTheDocument()
    expect(screen.getByText('Has account')).toBeInTheDocument()
    expect(screen.getByText('No account yet')).toBeInTheDocument()
    expect(screen.getByLabelText('Or type an email address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    ```
  - |
    Web unit, Allow and Cancel (AC1, AC2, AC3, AC4):
    ```tsx
    await user.click(screen.getByRole('radio', { name: /sam@example.com/ }))
    await user.click(screen.getByRole('button', { name: 'Allow' }))
    expect(finishGoogle).toHaveBeenCalledWith('abc', { email: 'sam@example.com' })

    await user.type(screen.getByLabelText('Or type an email address'), 'alex@example.com')
    await user.click(screen.getByRole('button', { name: 'Allow' }))
    expect(finishGoogle).toHaveBeenLastCalledWith('abc', { email: 'alex@example.com' })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(finishGoogle).toHaveBeenLastCalledWith('abc', 'cancel') // callback redirects to /sign-in, no session
    ```
  - |
    Web unit, invalid email (AC10, AC11):
    ```tsx
    await user.type(screen.getByLabelText('Or type an email address'), 'alex@example')
    await user.click(screen.getByRole('button', { name: 'Allow' }))
    expect(screen.getByText('Enter a valid email address.')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent("You're not signed in.")
    expect(finishGoogle).not.toHaveBeenCalled()
    // and with nothing selected or typed: same, with "Choose an identity or enter an email address."
    ```
  - |
    Web unit, SignInPage.test.tsx stays green for the existing google_cancelled notice and google_not_linked modal (AC3, AC5, AC7); add one case that ?error=google_not_linked still shows "No account yet" with a Sign up button.
  - |
    Playwright, e2e/google-consent.spec.ts against the local-mode stack, one spec per path (AC1-AC11): pick the demo identity then Allow lands signed in on "/"; type demo email then Allow signs in; Cancel returns to /sign-in with the cancelled alert and /auth/me is 401; new.user@example.com then Allow shows the "No account yet" modal; typed "bad@" then Allow shows the field error and stays on /local/google-consent.
assumptions_or_open_questions:
  - |
    Known identities are the existing local accounts (including the seeded demo@example.com) plus the fixed sample new.user@example.com with no account. The prototype's alex@ and sam@ are placeholder fixtures, not seeded accounts. Say if you want alex@ and sam@ seeded too (this would touch local_seed.py and the demo data).
  - |
    Conflict with prototype, "No account yet": the prototype shows a separate "No account yet" card page with Create account / Choose another identity. The story says to use the EXISTING prompt, so this plan reuses GoogleNoAccountModal on the sign-in page (its Sign up button goes to /sign-up) and builds no new page. Likewise the prototype's "Signed in" confirmation page is not built; sign-in lands on "/" like the email flow.
  - |
    Conflict with prototype, cancel copy: the prototype says "Google sign-in cancelled. You're still signed out." but the app already has approved copy in messages.ts (google_cancelled). The plan keeps the existing copy and alert.
  - |
    The prototype's separate "invalid" screen is the same form in an error state; the plan implements it as state of one page, not a second route.
  - |
    A signed-in-as toast is not added; the existing flow has none.
  - |
    Google sign-UP (mode "up") from the sign-up page also reaches the consent page, because the state carries the mode. An email with no account then links a google-<email> user as today. This is not tested further and is outside the ACs.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  None. There is no schema change, stored-data change or new setting. The new routes exist only in local mode (404 otherwise), and the Cognito/Dynamo path is untouched. Roll back by reverting the change.

  Why the existing callback is reused: it already verifies the signed state, the nonce cookie, expiry and single use, and it sets the session. The consent page therefore cannot forge a session, and only the chosen email travels in the `code` parameter. This follows ADR-0009 (the Identity Provider is bidirectional and swapped locally).

  The Vite dev proxy already forwards /local and /auth and serves index.html for HTML requests to /local/*, so /local/google-consent needs no devProxy change (checked in apps/web/src/devProxy.ts).

  ```mermaid
  flowchart TD
    SI[SignInPage / AuthForm] -->|startGoogle| GS[auth.py google_start]
    GS -->|identity.google_authorize_url| LI[local_identity.py]
    LI -->|303 to /local/google-consent| GC[GoogleConsentPage]
    GC -->|GET identities| LG[local_google.py]
    LG --> LI
    GC -->|finishGoogle| CB[auth.py google_callback]
    CB -->|complete_google, user_exists| LI
    CB -->|google_cancelled / google_not_linked| SI
    SI --> NM[GoogleNoAccountModal]
    classDef touched fill:#f96,color:#000
    class LI,GS,CB,GC,LG touched
  ```
  Touched: local_identity.py (authorize URL, email resolution, helpers), auth.py (local accounts may sign in; callback only), GoogleConsentPage (new UI), local_google.py (new list endpoint), plus api.ts, App.tsx, main.py, README.
review_focus: |
  Hold the change to the local-mode Google flow: no Cognito/Dynamo changes, no new "No account yet" page (the existing modal is reused on purpose) and no seeded alex/sam accounts unless the reviewer asks. The riskiest part is the callback rule in auth.py: local accounts must be allowed to sign in with Google without being written to the AccountStore, and the state/nonce checks must stay exactly as they are. Reusing the callback with `code=<email>` and `error=access_denied` is deliberate, so cancel and not-linked behave like the real flow.
