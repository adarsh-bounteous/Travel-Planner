summary: |
  Add an Account page (`/account`, behind `RequireAuth`) where a signed-in traveller signs out, opens their saved traveller profile, and — only if they signed up with email and password — changes their email (confirmed from a link sent to the new address; the old address stays until then) or password (12+ characters with a letter and a number). Both changes require the current password. A signed-in-only Account link is added to the header. On the API, `GET /auth/me` also reports how the account signs in, and two new session-guarded endpoints `POST /auth/account/email` and `POST /auth/account/password` re-verify the current password through the Identity Provider (ADR-0009) and apply the change; the Identity Provider (not us) sends the confirmation email (ADR-0010). Built test-first: pytest unit/e2e for the API, vitest for the page and header, Playwright for the happy path.
scope:
  - description: |
      Extend the `IdentityProvider` Protocol with two methods and add the matching errors.
      ```python
      class IdentityProvider(Protocol):
          def request_email_change(self, email: str, current_password: str, new_email: str) -> None:
              """Verify current_password, then start a verified change to new_email. The old
              email stays active until the link is opened. Raises WrongPassword, EmailTaken."""

          def change_password(self, email: str, current_password: str, new_password: str) -> None:
              """Raises WrongPassword."""
      ```
      `FakeIdentityProvider` gets the same two methods, a `pending_email: dict[str, str]` and a test helper `confirm_email_change(new_email)` that stands in for opening the link (moves the user to the new email). `email_for(user_id)` keeps returning the current (old) email until then.
      `CognitoIdentityProvider`: both methods first call `initiate_auth(USER_PASSWORD_AUTH)` with the current password to get an access token (NotAuthorizedException maps to WrongPassword). `change_password` then calls `change_password(PreviousPassword, ProposedPassword, AccessToken)`. `request_email_change` first checks `list_users(Filter='email = "<new>"')` and raises EmailTaken if anyone has it, then calls `update_user_attributes(UserAttributes=[{"Name": "email", "Value": new}], AccessToken=...)`. The user pool must be set to keep the original email active until verification (`UserAttributeUpdateSettings.AttributesRequireVerificationBeforeUpdate = ["email"]`) so Cognito sends the verification message to the new address and `email_for` still returns the old one.
    files:
      - services/api/app/auth/identity.py
      - services/api/app/auth/fake_identity.py
      - services/api/app/auth/cognito_identity.py
    rationale: |
      Keeps the Identity Provider seam (ADR-0009) as the only place that knows about Cognito, and keeps email delivery with the provider (ADR-0010).
  - description: |
      Add `method` to `/auth/me` and two new endpoints in the existing auth router. All use the session cookie, return 401 `not_signed_in` otherwise, and slide the session like `/auth/me` does.
      ```python
      # GET /auth/me  ->  {"email": "...", "method": "email" | "google"}   (method from accounts.is_google_linked(user_id))

      class EmailChange(BaseModel):
          current_password: str
          new_email: str

      class PasswordChange(BaseModel):
          current_password: str
          new_password: str

      @router.post("/account/email", status_code=202)      # {"status": "confirmation_sent"}
      @router.post("/account/password", status_code=204)
      ```
      Error codes (all `{"code": ...}` via `_error`): Google account on either endpoint, 403 `not_available`; empty or wrong current password, 403 `wrong_password` (not 401, so the web client does not read it as signed out); new password failing `validate_password`, 422 `password_rule`; malformed new email, 422 `invalid_email`; new email already in use, 409 `email_unavailable`. One code and no other detail for the in-use case, so the response never says whether that address has an account. The new email is normalised with `_normalise`.
    files:
      - services/api/app/routers/auth.py
    rationale: |
      The router already owns sign-in/out/me, the session cookie and dependency injection of identity/accounts/clock, so the new endpoints follow the same pattern. Server side enforces every rule the page shows, so the rules do not depend on the browser.
  - description: |
      Web API client and messages. In `api.ts` add `'not_available' | 'invalid_email' | 'email_unavailable'` to `AuthErrorCode` and `KNOWN_CODES`, change `fetchMe` to return `{ email: string; method: 'email' | 'google' }`, and add
      ```ts
      export const requestEmailChange = (currentPassword: string, newEmail: string) =>
        post('/auth/account/email', { current_password: currentPassword, new_email: newEmail })
      export const requestPasswordChange = (currentPassword: string, newPassword: string) =>
        post('/auth/account/password', { current_password: currentPassword, new_password: newPassword })
      ```
      `AuthProvider` exposes `method` (and a `refresh`-backed `reloadAccount`) next to `email`. `messages.ts` gets the Account copy from the design: password_rule on this page is "Password is too short. Use at least 12 characters, with a letter and a number." (design `.field-error` in screen "Account, new password too short"; the "needs a letter and a number" variant when length is fine), email_unavailable is "This email address can't be used. Enter a different email address.", wrong/missing current password is "Enter your current password to make this change." / "That password didn't match. Try again.".
    files:
      - apps/web/src/auth/api.ts
      - apps/web/src/auth/AuthProvider.tsx
      - apps/web/src/auth/messages.ts
    rationale: |
      Reuses the existing `post` helper and error-code pattern so new errors are typed and unknown codes still fall back to a generic message.
  - description: |
      New `AccountPage` built to the approved prototype (screens "Account (email and password account)", "Account, new email already in use", "Account, new password too short", "Account, change saved", "Account (signed up with Google)"). One `.col.stack` column (max 40rem): `<h1>Account</h1>`; a `.card` holding the link "View your traveller profile" (to `/profile`, a page owned by the Traveller profile epic); an Email `<form class="card stack" noValidate>` with `<h3>Email</h3>`, "Your email is **{email}**" (muted lead-in, bold address), `.field` "Current password" (type password, autocomplete current-password), `.field` "New email address" (type email) with `.field-hint` "We'll send a link to this address. Your email changes once you open it.", and a `.btn.btn-primary` "Save email"; a Password form card with the same shape ("Current password", "New password" with `.field-hint` "At least 12 characters, with a letter and a number.", `.btn-primary` "Save password"); `<hr class="divider">`; right-aligned `.btn.btn-secondary` "Sign out" (which calls `signOut` then navigates to `/sign-in`, same as `HomePage`). For a Google account the two form cards are not rendered; the page shows `<p>You sign in with Google.</p>` between the profile card and the divider; the profile card and Sign out stay.
      Behaviour from the prototype: errors appear only after submit and keep what was typed; an inline `.field-error.cluster` with the alert icon and `role="alert"` is placed in the field's `.field` (beside it), the input gets `.is-invalid`, `aria-invalid` and `aria-describedby`, and focus moves to it; the submit button shows `.spinner` + "Saving" and is disabled while pending. Empty current password shows the error on the current-password field and sends nothing. On email success: a `.toast` (role status, aria-live polite, check icon) in a static `.toast-slot` reads "Changes saved. Confirm a new email from the link we sent to it." and the shown email is left unchanged. On password success: toast "Password changed. Use it the next time you sign in." and both password inputs clear. Only the primary buttons use `.btn-primary`, one per card section, per the UI guidelines.
      Prototype note: the prototype's "Open confirmation link" button is a stand-in for the email link and is not built; the real link is the Identity Provider's. The saved state is shown on the Account page itself (the prototype's separate saved screen only exists to demo the toast).
      Wire it up: `App.tsx` adds `<Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />`. `AppHeader.tsx` renders `<Link className="shell-link" to="/account">Account</Link>` (with `aria-current="page"` on that route via `NavLink`) only when `status === 'signedIn'`; the rest of the prototype's top bar (Trips, Explore, Bookings, Budget, Saved, menu button) belongs to the App shell story and is not built here. `index.css` gets any of `.col`, `.signout-row`, `.toast-slot .toast` and `.field-error.cluster` rules not already present, copied from the prototype's page style block using tokens only.
    files:
      - apps/web/src/account/AccountPage.tsx
      - apps/web/src/App.tsx
      - apps/web/src/AppHeader.tsx
      - apps/web/src/index.css
    rationale: |
      Delivers the page and header link exactly as designed, reusing the existing `.field`, `.card`, `.stack`, `.btn-*` classes from the design system and the existing `RequireAuth` guard so the page is signed-in-only by construction.
  - description: |
      Tests, written first and failing before the code above (see `tests`).
    files:
      - services/api/tests/unit/test_account_router.py
      - services/api/tests/unit/test_cognito_identity.py
      - services/api/tests/e2e/test_account_e2e.py
      - apps/web/src/account/AccountPage.test.tsx
      - apps/web/src/AppHeader.test.tsx
      - apps/web/e2e/account.spec.ts
    rationale: |
      Mirrors the existing split: pytest unit with `FakeIdentityProvider` and dependency overrides, pytest + httpx e2e, vitest with a stubbed `fetch`, Playwright with routes stubbed at the network edge.
tests:
  - |
    AC1 sign out (vitest, AccountPage.test.tsx and Playwright). Fails first because the page does not exist.
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/auth/sign-out', expect.objectContaining({ method: 'POST' }))
    ```
  - |
    AC2 email change shown after confirming the link (pytest, test_account_router.py).
    ```python
    r = client.post("/auth/account/email", json={"current_password": PASSWORD, "new_email": "new@example.com"})
    assert r.status_code == 202
    fake.confirm_email_change("new@example.com")   # stands in for opening the link
    assert client.get("/auth/me").json()["email"] == "new@example.com"
    ```
  - |
    AC3 new 12-character password lets them sign in (pytest).
    ```python
    r = client.post("/auth/account/password", json={"current_password": PASSWORD, "new_password": "newpassword12"})
    assert r.status_code == 204
    assert client.post("/auth/sign-in", json={"email": "maya@example.com", "password": "newpassword12"}).status_code == 200
    ```
  - |
    AC4 confirmation message after an email change (vitest). Stubs `/auth/account/email` with 202.
    ```ts
    await user.type(screen.getByLabelText('Current password', { selector: '#current-password-email' }), 'abcdefghij12')
    await user.type(screen.getByLabelText('New email address'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: 'Save email' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Changes saved. Confirm a new email from the link we sent to it.')
    ```
  - |
    AC5 confirmation message after a password change (vitest). Stubs `/auth/account/password` with 204.
    ```ts
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed. Use it the next time you sign in.')
    ```
  - |
    AC6 profile link (vitest).
    ```ts
    expect(await screen.findByRole('link', { name: 'View your traveller profile' })).toHaveAttribute('href', '/profile')
    ```
  - |
    AC7 Google account sees no email or password change (pytest for the API and vitest for the page).
    ```python
    assert client.get("/auth/me").json()["method"] == "google"
    r = client.post("/auth/account/password", json={"current_password": "x", "new_password": "newpassword12"})
    assert r.status_code == 403 and r.json() == {"code": "not_available"}
    ```
    ```ts
    // /auth/me stubbed with method: 'google'
    expect(screen.queryByRole('button', { name: 'Save email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save password' })).not.toBeInTheDocument()
    expect(screen.getByText('You sign in with Google.')).toBeInTheDocument()
    ```
  - |
    AC8 Account link in the header on any signed-in page, and absent when signed out (vitest, AppHeader.test.tsx).
    ```ts
    const header = await screen.findByRole('banner')
    expect(await within(header).findByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
    ```
  - |
    AC9 choosing the header link shows the Account page (vitest, AppHeader.test.tsx).
    ```ts
    fireEvent.click(await within(await screen.findByRole('banner')).findByRole('link', { name: 'Account' }))
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
    ```
  - |
    AC10 an unconfirmed email change leaves the previous email (pytest).
    ```python
    client.post("/auth/account/email", json={"current_password": PASSWORD, "new_email": "new@example.com"})
    assert client.get("/auth/me").json()["email"] == "maya@example.com"
    ```
  - |
    AC11 11-character password rejected and old password still works (pytest).
    ```python
    r = client.post("/auth/account/password", json={"current_password": PASSWORD, "new_password": "abcdefghi12"})
    assert r.status_code == 422 and r.json()["code"] == "password_rule"
    assert client.post("/auth/sign-in", json={"email": "maya@example.com", "password": PASSWORD}).status_code == 200
    ```
  - |
    AC12 12 characters with no number rejected and old password still works (pytest).
    ```python
    r = client.post("/auth/account/password", json={"current_password": PASSWORD, "new_password": "abcdefghijkl"})
    assert r.status_code == 422 and r.json()["code"] == "password_rule"
    assert client.post("/auth/sign-in", json={"email": "maya@example.com", "password": PASSWORD}).status_code == 200
    ```
  - |
    AC13 new email that belongs to another account leaves the previous email (pytest). A second user is signed up and confirmed first.
    ```python
    r = client.post("/auth/account/email", json={"current_password": PASSWORD, "new_email": "taken@example.com"})
    assert r.status_code == 409
    assert client.get("/auth/me").json()["email"] == "maya@example.com"
    ```
  - |
    AC14 the in-use response does not reveal whether the address has an account (pytest and vitest).
    ```python
    taken = client.post("/auth/account/email", json={"current_password": PASSWORD, "new_email": "taken@example.com"})
    assert taken.json() == {"code": "email_unavailable"}   # no email address and no "already has an account" wording
    ```
    ```ts
    expect(await screen.findByRole('alert')).not.toHaveTextContent(/already|exists|account/i)
    ```
  - |
    AC15 email change without the current password changes nothing (pytest and vitest).
    ```python
    r = client.post("/auth/account/email", json={"current_password": "", "new_email": "new@example.com"})
    assert r.status_code == 403 and r.json()["code"] == "wrong_password"
    assert fake.pending_email == {}
    assert client.get("/auth/me").json()["email"] == "maya@example.com"
    ```
    ```ts
    // empty current password: error on that field, and no request is sent
    expect(await screen.findByText('Enter your current password to make this change.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/auth/account/email', expect.anything())
    ```
  - |
    AC16 password change without the current password changes nothing (pytest).
    ```python
    r = client.post("/auth/account/password", json={"current_password": "", "new_password": "newpassword12"})
    assert r.status_code == 403
    assert client.post("/auth/sign-in", json={"email": "maya@example.com", "password": PASSWORD}).status_code == 200
    ```
  - |
    AC17 inline message beside the email field for an address that cannot be used (vitest). Stubs 409 `email_unavailable`.
    ```ts
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("This email address can't be used. Enter a different email address.")
    expect(screen.getByLabelText('New email address')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('New email address').closest('.field')).toContainElement(alert)
    ```
  - |
    AC18 inline message beside the password field for an 11-character password (vitest). Stubs 422 `password_rule`, or is raised client-side before sending.
    ```ts
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Password is too short. Use at least 12 characters, with a letter and a number.')
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
    ```
  - |
    Extra API guards (pytest). Signed-out calls are refused, wrong current password changes nothing, and the Cognito adapter maps errors correctly (test_cognito_identity.py with a stub boto client).
    ```python
    assert client.post("/auth/account/email", json={"current_password": PASSWORD, "new_email": "a@b.co"}).status_code == 401
    with pytest.raises(WrongPassword):  # NotAuthorizedException -> WrongPassword
        adapter.change_password("maya@example.com", "wrong", "newpassword12")
    ```
  - |
    Playwright happy path (account.spec.ts, API stubbed at the network edge): open Account from the header, change the password and see the toast, submit a new email and see the toast with the shown email unchanged, then sign out and land on Sign in.
    ```ts
    await page.getByRole('banner').getByRole('link', { name: 'Account' }).click()
    await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()
    ```
assumptions_or_open_questions:
  - |
    Which link confirms the new email? The plan relies on the Identity Provider (Cognito) sending the verification message to the new address when the email attribute is updated with `AttributesRequireVerificationBeforeUpdate`. By default Cognito sends a code; a clickable link needs the user pool's verification message template set to link style and a landing page. Please confirm this is acceptable, or say if the app should own the link (a signed token and a `/confirm-email-change` page, which this plan does not include).
  - |
    I assumed the traveller profile lives at `/profile` and is built by the Traveller profile epic. Until it exists the link leads to an unmatched route, because the app has no catch-all route. Is a placeholder route wanted here?
  - |
    "Signed up with Google" is read from `AccountStore.is_google_linked(user_id)`, which is how the existing Google callback marks accounts. An account is treated as email-and-password only when that is false.
  - |
    Prototype and codebase differ on the header. The prototype shows the full top bar (Trips, Explore, Bookings, Budget, Saved, Account, menu button below 48rem), but the existing `AppHeader` is a stub that says the App shell story owns the full navigation. This plan adds only the signed-in Account link and does not build the other links or the menu button.
  - |
    AC18 says the 11-character message is inline beside the password field. I enforce the rule on the server and also in the page before sending, so the message appears immediately. The "needs a letter and a number" wording for a 12-character password with no number comes from the prototype and is an addition to the AC text.
  - |
    A wrong current password returns 403 `wrong_password` (not 401), so the web client does not mistake it for a signed-out session. Copy "That password didn't match. Try again." is mine, not from the prototype.
  - |
    Rate limiting of repeated wrong current-password attempts is left to Cognito's own throttling and is not added here.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: None changed. No table, column or stored item shape changes; the Account page reads and writes only Cognito user attributes and the existing `google_linked` flag on the accounts table (read only).
  - **Backfill / seed**: None needed.
  - **Settings**: No new environment variable. The deployed Cognito user pool needs `UserAttributeUpdateSettings.AttributesRequireVerificationBeforeUpdate = ["email"]` so the old email stays active until the new one is verified (an infrastructure setting, not read by the code). If unset, Cognito switches the email at once, which breaks AC10.
  - **Provisioning**: The API's role needs `cognito-idp:ListUsers` (already used by `email_for`) and the public app-client calls (`InitiateAuth`, `ChangePassword`, `UpdateUserAttributes`) that the existing app client already allows for sign-in. If the pool uses link-style verification messages, the message template must be set there.
  - **Order and rollback**: Deploy the pool setting first (harmless without the new code), then the API, then the web app. Rollback is just redeploying the previous API and web; nothing stored needs undoing. Email changes already started stay pending in Cognito and can still be confirmed.

  ### Shape

  ```mermaid
  flowchart TD
    App[App.tsx] --> Header[AppHeader.tsx]
    App --> Account[AccountPage.tsx]
    App --> RequireAuth[RequireAuth.tsx]
    Account --> Provider[AuthProvider.tsx]
    Account --> WebApi[auth/api.ts]
    Header --> Provider
    WebApi -->|HTTP| Router[routers/auth.py]
    Router --> Identity[identity.py Protocol]
    Router --> Accounts[accounts.py AccountStore]
    Identity --> Cognito[cognito_identity.py]
    Identity --> Fake[fake_identity.py]
    classDef touched fill:#f96,color:#000
    class App,Header,Account,Provider,WebApi,Router,Identity,Cognito,Fake touched
  ```

  Touched nodes (orange): `App.tsx` for the `/account` route; `AppHeader.tsx` for the signed-in Account link; `AccountPage.tsx` is the new page; `AuthProvider.tsx` and `auth/api.ts` for `method` and the two new requests; `routers/auth.py` for the new endpoints and `method` on `/me`; `identity.py`, `cognito_identity.py` and `fake_identity.py` for the two new provider operations. `RequireAuth.tsx` and `accounts.py` are used unchanged.

  ### Why it is shaped this way

  - Re-checking the current password goes through `initiate_auth` with the traveller's own password, so a stolen session cookie alone cannot change the email or password.
  - The old email stays active until the link is opened because the pool setting above keeps it; the API never writes the new email into the shown account itself.
  - Existing `HomePage` Sign out stays; this story does not change it.
review_focus: |
  IN: the Account page, the signed-in Account header link, `/auth/me` `method`, and the two account-change endpoints with their Identity Provider methods. OUT: the rest of the top-bar navigation (App shell story), the traveller profile page (only linked), account deletion, and any app-owned email-confirmation link. Riskiest: the Cognito adapter (current-password check, "old email stays until confirmed" depending on a user pool setting, and the in-use pre-check) and keeping the in-use response free of any account-existence hint. The 403 `wrong_password` (not 401) and the Account page showing the saved state on the same page rather than the prototype's separate saved screen are deliberate.
