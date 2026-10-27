summary: |
  Most of the local inbox already exists on this branch: `GET /local/inbox` (404 with local mode off, no sign-in), an in-memory `InMemoryInviteSender` that receives both invite and sign-up confirmation emails (nothing leaves the process), the `/local/inbox` web route, and the `/confirm-email/:token` and `/invite/:token` link targets. This plan closes the gaps between that code, the nine acceptance criteria and the approved prototype: the inbox API gains a subject and sent time per email; the web page is rebuilt to the prototype (info alert, "Emails" heading, a `.card` row per email with a type `.badge`, an "Open email" view showing From/To/Sent, the clickable link and a primary action button, the "No emails have been generated yet" empty state, and the "This page is not available" state with local mode off); and link-already-used / expired handling gets the single approved message for both confirmation and invite links, with nothing completed.
scope:
  - description: |
      API: record a send time and give every inbox entry a subject. Keep `InMemoryInviteSender.sent` as 3-tuples (`test_editor_access_router.py` and `test_local_reset_router.py` read it) and add a parallel `sent_at: list[datetime]` filled from an injectable clock; `reset()` clears both.

      ```python
      class InMemoryInviteSender:
          def __init__(self, clock: Callable[[], datetime] = lambda: datetime.now(UTC)) -> None:
              self.sent: list[tuple[str, str, str]] = []
              self.sent_at: list[datetime] = []
      ```

      `read_inbox` returns, newest first, `{to, trip_name, link, kind, subject, sent_at}` where `subject` is "Confirm your sign-in" for `confirmation` and "You are invited to a trip" for `invite`, and `sent_at` is ISO-8601 UTC. Existing keys stay, so the current page and tests keep working.
    files:
      - services/api/app/trips/invites.py
      - services/api/app/routers/local_inbox.py
      - services/api/tests/unit/test_local_inbox.py
    rationale: |
      AC1/AC2/AC6. The prototype's email sheet shows Sent and a subject, which the API does not provide today. Content is still only held in memory, never sent (the local sender is chosen in `get_invite_sender` and `_local_identity`).
  - description: |
      API: a used invite link reports as used, the same way a used confirmation link already does (409 `link_already_used` in `routers/auth.py`). `read_invite` currently returns a used invite as if it were open, so the page only learns it is used after the user clicks Open trip. Change `read_invite` to raise `ApiError(409, "invite_used")` when the matching editor is already `accepted`. Revoked or unknown tokens keep returning 404 `not_found` (the "expired" case for invites, since invites have no clock expiry).
    files:
      - services/api/app/routers/invites.py
      - services/api/tests/unit/test_local_trips_invites_share.py
    rationale: |
      AC7/AC8. Without it, following a used invite link shows an actionable page rather than a message.
  - description: |
      Web: rebuild `LocalInboxPage` to the prototype's screens. Keep the fetch of `/local/inbox` and the public route (no `RequireAuth`). The page holds `selected` state (the message key is its link) rather than adding a route.

      - Shared: a `.stack` column capped near 40rem (prototype `.inbox-col`), a `.alert alert-info` with role="status" reading "Local mode is on. These emails were not sent anywhere. Open one to follow its link." and an `h1` "Emails".
      - List (prototype screen "Local inbox"): inside a `.stack`, one `.card` per email with `h3` subject, `.badge badge-neutral` "Sign-in" or `.badge badge-success` "Invite", a `.text-muted .text-sm` line "To {to}", and a `.btn btn-secondary btn-sm` "Open email". No `.btn-primary` on this screen. Newest first as the API returns it.
      - Empty (prototype "Local inbox, no emails"): `.empty-state` with bell icon, `h2` "No emails have been generated yet" and the line "Sign in or invite someone to a trip and the email will show up here."
      - Local mode off (404 from the API; prototype "local mode off"): `.empty-state` with alert icon, `h2` "This page is not available", the line "The local inbox only exists when local mode is on. Head back to your trips." and a `.btn btn-primary` "Go to Trips" linking to `/`. Nothing of the inbox is rendered.
      - Email view (prototype "Email"): a "Back to inbox" button-link with the arrow-left icon, `h2` subject, `.alert alert-info` "Pretend email. Nothing was sent to {to}.", a bordered `.mail-sheet` with a `dl` for From / To / Sent (Sent formatted in the traveller's locale via `Intl.DateTimeFormat`) and a body with the intro line, the link as a real `<a href={link}>` in mono text, and "Each link works once and stops working after 7 days." Below the sheet, the single `.btn btn-primary` as an anchor to the same link, labelled "Complete sign-in" (confirmation) or "Accept invite" (invite).
      - Tailwind/CSS: the prototype's `.mail-sheet`, `.mail-meta`, `.mail-body`, `.mail-link`, `.inbox-col` rules are added to `index.css` using the existing tokens (`--space-*`, `--radius-lg`, `--color-border-strong`, `--color-surface`); no new colour values. Single column at 375px; the mail text wraps (`overflow-wrap: anywhere`) so long links do not overflow.
      - The "Reset demo" button in the prototype is explicitly excluded (labelled prototype only in the design); reset is a separate `/local` reset route.

      Component skeleton:

      ```tsx
      type Message = { to: string; trip_name: string; link: string; kind: 'confirmation' | 'invite'; subject: string; sent_at: string }
      type Load = { state: 'loading' } | { state: 'unavailable' } | { state: 'ready'; messages: Message[] }
      ```

      Note on the prototype text "stops working after 7 days": the real confirmation link lifetime is 24 hours (`CONFIRMATION_LINK_LIFETIME` in `local_identity.py`) and invites do not expire. The email sheet copy will say "Each link works once and can expire." so it does not state a wrong period (a deliberate deviation from the prototype text).
    files:
      - apps/web/src/local/LocalInboxPage.tsx
      - apps/web/src/local/LocalInboxPage.test.tsx
      - apps/web/src/index.css
    rationale: |
      AC1, AC2, AC4, AC5, AC9, built to the approved prototype. The existing page already covers fetching and the public route, so this is a rework of its markup and states.
  - description: |
      Web: one approved message for a used or expired link, on both link targets, with nothing completed.

      - `auth/messages.ts`: set `link_expired` and `link_already_used` to `'This link has already been used or has expired.'` (tone danger). Existing `ConfirmLinkPage.test.tsx` regexes (`/has expired/i`, `/already been used/i`) still match.
      - `ConfirmLinkPage.tsx`: for those two outcomes keep the alert and add the prototype's second line "Nothing was changed. Ask for a new email to try again." plus the existing Sign in link; confirmed outcome unchanged.
      - `trips/InvitePage.tsx` and `trips/api.ts`: `fetchInvite` surfaces the 409 `invite_used` (reuse `InviteUsedError`) as a `used` load state, and `invalid` and `used` both render `.empty-state` with `h3` "This link has already been used or has expired." and "Nothing was changed. Ask the trip owner to send a new invite." No Open trip button is offered in either state. The existing in-page "This invite has already been used." alert for a race on accept stays.
    files:
      - apps/web/src/auth/messages.ts
      - apps/web/src/auth/ConfirmLinkPage.tsx
      - apps/web/src/auth/ConfirmLinkPage.test.tsx
      - apps/web/src/trips/InvitePage.tsx
      - apps/web/src/trips/InvitePage.test.tsx
      - apps/web/src/trips/api.ts
    rationale: |
      AC7/AC8. The copy matches the prototype screen "Link already used or expired" (heading "Link expired", text "This link has already been used or has expired.").
tests:
  - |
    AC1 (API, write first, fails because `subject` and `sent_at` are missing). In `services/api/tests/unit/test_local_inbox.py`, after a sign-up in local mode plus an invite:
    ```python
    def test_inbox_lists_confirmation_and_invite_newest_first(local_client):
        local_client.post("/auth/sign-up", json={"email": "new@example.com", "password": "correct horse 42"})
        local_client.post("/auth/sign-in", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        trip = local_client.get("/trips").json()[0]
        local_client.post(f"/trips/{trip['id']}/editors", json={"email": "ana@example.com"})
        invite, confirmation = local_client.get("/local/inbox").json()
        assert (invite["kind"], invite["subject"]) == ("invite", "You are invited to a trip")
        assert (confirmation["kind"], confirmation["subject"]) == ("confirmation", "Confirm your sign-in")
        assert confirmation["to"] == "new@example.com"
        datetime.fromisoformat(invite["sent_at"])
    ```
  - |
    AC2/AC3 (API). The link in a listed confirmation email completes sign-in confirmation, and a listed invite link resolves:
    ```python
    def test_inbox_link_completes_the_confirmation(local_client):
        local_client.post("/auth/sign-up", json={"email": "new@example.com", "password": "correct horse 42"})
        [mail] = local_client.get("/local/inbox").json()
        token = mail["link"].rsplit("/", 1)[1]
        assert local_client.post("/auth/confirm", json={"token": token}).json() == {"status": "confirmed"}
        assert local_client.post("/auth/sign-in", json={"email": "new@example.com", "password": "correct horse 42"}).status_code == 200
    ```
  - |
    AC4 (API), already present and kept passing: `assert client.get("/local/inbox").status_code == 404` with `LOCAL_MODE` unset. AC5 (API): `test_inbox_starts_empty` calls `/local/inbox` with no session cookie and asserts `== []`, so no sign-in is needed.
  - |
    AC6 (API). With local mode on, a send must not reach SES. Patch `boto3.client` to raise and assert the invite and sign-up requests still return 201/202 and the mail appears in the inbox:
    ```python
    def test_local_mode_never_calls_ses(local_client, monkeypatch):
        monkeypatch.setattr("boto3.client", lambda *a, **k: (_ for _ in ()).throw(AssertionError("external call")))
        monkeypatch.setenv("INVITE_FROM_ADDRESS", "no-reply@example.com")
        local_client.post("/auth/sign-up", json={"email": "new@example.com", "password": "correct horse 42"})
        assert len(local_client.get("/local/inbox").json()) == 1
    ```
  - |
    AC7/AC8 (API, confirmation). Already covered by `test_local_sign_up_confirm.py` (409 `link_already_used`, 410 `link_expired`); extend the used case to assert the account stays as it was, for example the second confirm leaves sign-in outcomes unchanged.
  - |
    AC7/AC8 (API, invite). In `test_local_trips_invites_share.py`, after the invitee accepts, a second read of the link is refused and nothing changes:
    ```python
    r = invitee.get(f"/invites/{token}")
    assert (r.status_code, r.json()["code"]) == (409, "invite_used")
    ```
  - |
    AC1/AC2/AC5 (web, `LocalInboxPage.test.tsx`, signed out). The list shows a card per email with its type badge and an Open email control; opening it shows the From/To/Sent sheet, the clickable link and the primary action:
    ```tsx
    await userEvent.click(await screen.findByRole('button', { name: 'Open email' }))
    expect(screen.getByRole('link', { name: 'http://localhost:5173/confirm-email/tok2' })).toHaveAttribute('href', 'http://localhost:5173/confirm-email/tok2')
    expect(screen.getByRole('link', { name: 'Complete sign-in' })).toHaveAttribute('href', 'http://localhost:5173/confirm-email/tok2')
    expect(screen.getByText('Sign-in')).toHaveClass('badge')
    ```
  - |
    AC3 (web). An invite email's primary action reads "Accept invite" and points at the `/invite/...` link, and `ConfirmLinkPage` still renders "Your email is confirmed" on a 200 from `POST /auth/confirm` (existing test kept).
  - |
    AC4 (web). A 404 from `/local/inbox` shows the not-available state and no inbox content:
    ```tsx
    expect(await screen.findByRole('heading', { name: 'This page is not available' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Emails' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Trips' })).toHaveAttribute('href', '/')
    ```
  - |
    AC9 (web). An empty inbox replaces the old "No emails yet." text:
    ```tsx
    expect(await screen.findByRole('heading', { name: 'No emails have been generated yet' })).toBeInTheDocument()
    ```
  - |
    AC7/AC8 (web). `ConfirmLinkPage.test.tsx`: for 409 `link_already_used` and 410 `link_expired`, `expect(await screen.findByRole('alert')).toHaveTextContent('This link has already been used or has expired.')` and no "Your email is confirmed" heading. `InvitePage.test.tsx`: `GET /invites/tok1` answering 409 `invite_used` renders the same text and `expect(screen.queryByRole('button', { name: 'Open trip' })).not.toBeInTheDocument()`; 404 renders the same text.
assumptions_or_open_questions:
  - |
    AC3 for invites: the existing flow is link, sign in as the invited email, then Open trip (accept needs the invitee's identity: `accept_invite` returns 403 `wrong_account` otherwise). The prototype shows a one-click "Accept invite" that completes straight away. I kept the existing flow, so the email's "Accept invite" button opens the invite page and the invite is completed there. Say so if you want the link to accept the invite with no sign-in step; that would change the invite security rule and is not planned.
  - |
    The prototype says links stop working after 7 days. Confirmation links last 24 hours and invites never expire by time, so I plan to word the email text without a number. Say so if you want the number kept or the lifetime changed.
  - |
    The confirmation email subject is "Confirm your sign-in" per the prototype (the current page says "Confirm your email"). The from address shown is "Travel Planner <no-reply@local.travel-planner>" as a fixed display string, not read from a setting.
  - |
    Inbox contents are held in memory and cleared on API restart (as today, see `local_reset.py`). Persisting emails to the local data file is out of scope. A link already issued to the identity store survives a restart but would not appear in the inbox, so the user can use "resend confirmation" to get a new one.
  - |
    "Reset demo" in the prototype is prototype-only and is not built. The e2e suite under `services/api/tests/e2e` is not extended: unit tests with `TestClient` cover the API, and vitest covers the page. No Playwright suite exists in `apps/web` yet.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None. No schema, stored data shape, seed or setting changes. The inbox is in memory and its payload gains two additive keys (`subject`, `sent_at`), so the existing page and tests keep working. `LOCAL_MODE` already exists and gates the route; nothing new is provisioned, and rollback is a plain revert.

  ### Existing code this builds on

  Read while planning: `services/api/app/routers/local_inbox.py`, `routers/deps.py` (`get_local_inbox`, `_local_invite_sender`, `get_invite_sender`), `trips/invites.py`, `routers/invites.py`, `routers/auth.py` (`/auth/confirm`, 409/410 codes), `auth/local_identity.py` (single-use, 24 hour tokens), and in the web app `local/LocalInboxPage.tsx`, `auth/ConfirmLinkPage.tsx`, `trips/InvitePage.tsx`, `auth/messages.ts`, `App.tsx` routes.

  ```mermaid
  flowchart TD
    Inbox[LocalInboxPage.tsx - rebuilt to prototype]:::touched --> API[routers/local_inbox.py - add subject and sent_at]:::touched
    API --> Dep[routers/deps.py get_local_inbox]
    Dep --> Sender[trips/invites.py InMemoryInviteSender - record sent_at]:::touched
    Auth[routers/auth.py sign-up and resend] --> Sender
    Inv[routers/invites.py send invite] --> Sender
    Inbox -- link --> Confirm[ConfirmLinkPage.tsx - one used or expired message]:::touched
    Inbox -- link --> Invite[InvitePage.tsx - used or expired state]:::touched
    Invite --> InvAPI[routers/invites.py read_invite - 409 invite_used]:::touched
    Msgs[auth/messages.ts - shared copy]:::touched --> Confirm
    classDef touched fill:#f96,color:#000
  ```

  Order: API change first (additive), then web. Tests are written failing first in the order listed under `tests`.
review_focus: |
  IN scope: the inbox API's extra fields, the used-invite 409, the rebuilt inbox page and its four states, and the single used/expired message on the confirmation and invite pages. OUT: persisting emails, Reset demo, changing invite acceptance to skip sign-in, any real email delivery change. Riskiest part is `read_invite` now returning 409 for accepted invites, which must not break the owner's access flow or the invite page's signed-in paths. Deliberate deviations from the prototype: the "7 days" line is reworded because the real lifetimes differ, and invite completion still goes through sign-in.
