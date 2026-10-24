summary: |
  Let a Trip have several travellers and let its owner invite signed-in companions to edit it. The owner adds
  travellers by name (no account needed) and invites editors by email from a Travelers tab. An editor opens an
  invite link, signs in with the invited email (no sign-up offered anywhere on that path), and then sees the trip
  with the same activity add / move / remove controls as the owner but none of the owner-only controls (trip
  settings, rename day, delete, invite, revoke, add traveller). Revoking removes the trip from that editor, and an
  editor who still has the trip open is told "Access removed" and nothing they try afterwards is saved.
  Today every trip route is keyed by the signed-in user id as owner and `can_edit_trip` is a stub that returns
  `user_id == owner_id` (services/api/app/trips/store.py), so the work is: (1) model travellers/editors on the
  Trip, (2) add an editor lookup so a non-owner can resolve a trip, (3) route the plan-editing endpoints through one
  access rule while keeping owner-only endpoints owner-only, (4) the web Travelers tab, invite page and the
  access-removed handling. Read-only link and sign-up from an invite are out of scope.
scope:
  - description: |
      Trip model and store: add `Traveller`, `Editor` and `Invite` models, new Trip fields, a real `can_edit_trip`,
      and editor/invite index methods on the store (in-memory and DynamoDB).

      ```python
      class Traveller(BaseModel):
          id: str
          name: TrimmedName            # strips; "" and "   " fail validation (422)

      class TravellerFields(BaseModel):
          name: TrimmedName

      class Editor(BaseModel):
          email: str                   # lower-cased
          token: str                   # unguessable invite token, never sent to editors
          accepted: bool = False

      class Invite(BaseModel):
          token: str
          owner_id: str
          trip_id: str
          email: str

      class Trip(TripFields):
          ...
          travellers: list[Traveller] = []   # server-owned
          editors: list[Editor] = []         # server-owned

      def can_edit_trip(trip: Trip, user_id: str, owner_id: str, email: str | None = None) -> bool:
          """Owner, or an editor whose accepted email is on the trip."""
      ```

      New `TripStore` methods (Protocol, `InMemoryTripStore`, `DynamoTripStore`). Index items live in the same
      trips table, so no new table and no new IAM action (Get/Put/Query/Delete already needed):

      ```python
      def save_invite(self, invite: Invite) -> None: ...        # pk INVITE#<token>, sk INVITE
      def get_invite(self, token: str) -> Invite | None: ...
      def delete_invite(self, token: str) -> None: ...
      def link_editor(self, email: str, owner_id: str, trip_id: str) -> None: ...   # pk EDITOR#<email>, sk TRIP#<trip id>, attr owner_id
      def unlink_editor(self, email: str, trip_id: str) -> None: ...
      def shared_trips(self, email: str) -> list[tuple[str, str]]: ...             # (owner_id, trip_id) pairs
      ```

      The Trip item's own `editors` list is the source of truth for authorisation; the EDITOR# item only locates
      the owner's partition, so a stale index item can never grant access on its own.
    files:
      - services/api/app/trips/store.py
    rationale: |
      The store is keyed by owner, so an editor has no way to reach a trip today. A lookup by (email, trip id) is the
      smallest change that fits the existing single-table layout (ADR-0003 asks for access patterns designed up
      front). Existing Trip items have no `travellers`/`editors`, which default to `[]`, so they stay readable.
  - description: |
      Trips router: one access helper used by every plan-editing route, owner-only guard for the rest, and the new
      routes.

      ```python
      def _load(trips, identity, user_id: str, trip_id: str) -> tuple[Trip, str, bool]:
          """(trip, owner_id, is_owner). Own trip first; else the EDITOR# index, then require the caller's
          email in trip.editors with accepted=True. Anything else raises NOT_FOUND (404) - same answer as
          a trip that never existed."""
      def _owned_trip(...) -> Trip     # owner only: 404 if not found, 403 "forbidden" for an editor
      def _editable_trip(...) -> tuple[Trip, str]   # owner or accepted editor
      ```

      - Switch to `_editable_trip` (owner id used for `save_trip`): `add_activity`, `move_activity`,
        `remove_activity`, `day_recommendations`, `add_reminder`, `update_reminder`, `delete_reminder`.
      - Switch to `_owned_trip`: `update_trip`, `rename_day`, `delete_trip`, plus the new routes below.
      - `get_trip` resolves via `_load`; `_view` sets `is_owner` and `can_edit` for the caller and, for a non-owner,
        returns `editors=[]` (editors do not see the access list or tokens). `list_trips` also appends trips from
        `shared_trips(email)` where the email is still an accepted editor (stale index rows are skipped).
      - New routes:
        - `POST /trips/{id}/travellers` body `{name}` -> 201 TripView; 422 `invalid_traveller` is not needed for
          blank (pydantic 422), cap `MAX_TRAVELLERS = 50`.
        - `POST /trips/{id}/editors` body `{email}` -> 201 TripView; 422 `invalid_email` (same regex as
          auth.py `_EMAIL`), 409 `already_editor`; creates `Editor` + `Invite`, calls the invite sender.
        - `DELETE /trips/{id}/editors/{email}` -> TripView; removes the Editor, the Invite and the EDITOR# item.
        - `GET /invites/{token}` (no session needed) -> `{email, trip_name}`; 404 for unknown/revoked token.
        - `POST /invites/{token}/accept` (session required): session email == invite email -> marks
          `accepted=True`, `link_editor`, returns `{trip_id}`; other email -> 403 `wrong_account`; 401 when signed out.
      - Caller email comes from `identity.email_for(user_id)` (already on `IdentityProvider`), looked up lazily,
        only when the caller is not the owner.
    files:
      - services/api/app/routers/trips.py
      - services/api/app/routers/invites.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      `_editable_trip` already exists for reminders/activities and is the single choke point, so widening it to
      editors gives AC4-6 for free once the lookup exists, while owner-only routes stay behind `_owned_trip`
      (AC7/8 server side). A revoked editor's write resolves to 404 and `save_trip` is never reached (AC14).
  - description: |
      Invite delivery seam. `InviteSender` Protocol with `send(email: str, trip_name: str, link: str) -> None`,
      an in-memory recorder for tests, and a production sender that uses the existing boto3 dependency (SES)
      only when `INVITE_FROM_ADDRESS` is set; when it is empty nothing is sent and the owner's Access list shows the
      invite link for pending editors to copy. `get_invite_sender` dependency in deps.py.
    files:
      - services/api/app/trips/invites.py
      - services/api/app/config.py
      - services/api/README.md
    rationale: |
      ADR-0010 (Email Delivery, outbound) applies to the API, but no sender exists yet. A Protocol keeps tests
      free of AWS and keeps the feature working before SES is provisioned.
  - description: |
      Web API client and types: `Traveller`, `Editor`, `Invite` types; `Trip` gains `travellers?`, `editors?`;
      functions `addTraveller`, `inviteEditor`, `revokeEditor`, `fetchInvite`, `acceptInvite`; a
      `AccessRemovedError` raised by mutating calls when a trip that was loaded as editor now answers 404.

      ```ts
      export type Traveller = { id: string; name: string }
      export type Editor = { email: string; accepted: boolean; invite_url?: string }
      export const addTraveller = (tripId: string, name: string) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/travellers`, 'POST', { name })
      export const inviteEditor = (tripId: string, email: string) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/editors`, 'POST', { email })
      export const revokeEditor = (tripId: string, email: string) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/editors/${encodeURIComponent(email)}`, 'DELETE')
      ```
    files:
      - apps/web/src/trips/api.ts
    rationale: Same `call` wrapper and error classes as the existing activity/reminder calls.
  - description: |
      Travelers tab in the trip page, built from the approved prototype screens "Travelers (owner)",
      "Travelers (owner, blank name refused)", "Travelers (editor)" and "Access (owner)".

      - Tab strip: `TripDetailPage` adds a `travelers` entry to `TABS` (existing `.tabs`/`.tab` markup, UI guidelines
        list Travelers as an in-trip tab).
      - Heading `h3.text-lg` "Travelers" with a `.text-muted` line ("Everyone going on this trip. Travellers don't need
        an account." for the owner; "...The trip owner manages this list." for an editor).
      - Traveller list: `ul.person-list`, each `li.person` with an `.avatar` (initial) and the name
        (`.option-title`); empty state is an `.empty-state` row "No travellers yet. Add the first one below."
      - Owner only: `.form-row` with `.field` (label "Traveller name", `.input`, `.field-hint` "Add someone by name,
        for example Ana.") and the single `.btn-primary` "Add traveller". Blank/whitespace name: no request is sent;
        `.input.is-invalid` + `aria-invalid` + `.field-error` (role=alert) "Enter a traveller name to add them to this
        trip."; the list is unchanged. Error is shown after submit, not while typing. Success: `.toast`
        "<name> added to the trip." and the field clears. Button shows "Adding…" while pending.
      - Owner only, below the travellers (the Access page of the prototype, placed inside this tab because the
        scope names the Travelers tab and the UI guidelines have no separate Access tab): `h3.text-lg` "Editors", muted
        line "Editors can change the plan. They can't invite people or manage access.", `.form-row` with email
        `.field` (type=email, hint "They need to sign in with this email to open the trip.") and `.btn-primary`
        "Invite editor" (one primary per section; the traveller button is secondary-weighted in this tab by being in its
        own section, as in the prototype). Validation messages exactly as the prototype: "Enter an email address to
        send the invite.", "Enter a valid email address, like ana@example.com.", "<email> is already an editor on this
        trip." Editor rows: `.editor-row` with the email, a `.badge-success` "Editor" or `.badge-warning` "Invited",
        and `.btn-ghost` "Revoke access" (aria-label "Revoke access for <email>"). Revoke is one tap with a toast
        "Access revoked for <email>. The trip is no longer shown to them." and an Undo that re-invites.
        Empty: `.empty-state` "No editors yet. Invite a companion by email to plan together."
      - Editors: render the traveller list only. No name field, no Add traveller button, no Editors section, no Edit
        trip / Rename / Delete (the existing `trip.is_owner` / `can_edit` gates already hide the settings ones).
      - Layout follows the prototype: `.stack stack-lg`, `.person-list` gap `--space-2`, rows min-height 44px,
        `.form-row` wraps (`flex: 1 1 14rem` field), single column at 375px. New CSS only for `.person-list`,
        `.person`, `.editor-row`, `.editor-who`, `.form-row` classes in index.css using tokens (copy values from
        the prototype's inline style block; `.pick`/`.pick-list` already exist).
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/TravelersTab.tsx
      - apps/web/src/trips/AccessSection.tsx
      - apps/web/src/index.css
    rationale: |
      Reuses the existing tabs, Toast and overlay patterns. Splitting AccessSection from TravelersTab keeps the
      owner-only controls in one component that is simply not rendered for editors (AC7, AC8).
  - description: |
      Access-removed handling (prototype screen "Access removed"). When the viewer is an editor (`!trip.is_owner`) and
      a mutation (add/move/remove activity, reminder calls) or a background refetch of the trip answers 404/403, show a
      `.modal` with `role="alertdialog"`, `h2` "Access removed", text "Your access to this trip was removed. Changes were
      not saved." and one `.btn-primary` "OK" that navigates to `/` (Trips). Editors re-fetch the trip on window focus
      and every 30 seconds so the message appears without a click (AC13); the server refusal is what guarantees AC14.
      `Overlay` (existing) provides focus handling.
    files:
      - apps/web/src/trips/AccessRemovedModal.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: The 30 s refresh is the only way to satisfy "open trip shows an access-removed message" without a push channel; it is editor-only and cheap.
  - description: |
      Invite page and sign-in without sign-up. New public route `/invite/:token` (NOT wrapped in `RequireAuth`; App.tsx
      comment says every non-auth page must be, so the comment is updated to list this exception). The page, from the
      prototype screens "Editor invite (signed out)", "(signed in as ana@example.com)" and "(different account)":
      - Narrow centred stack (`.narrow`, max-width 32rem), `h2` "Trip invite", `.card.stack-sm`.
      - Signed out: "Sign in with **ana@example.com** to open this trip." + "You've been invited to edit <trip>." and a
        single `.btn-primary` "Sign in" that calls `rememberReturnTo('/invite/<token>')` and navigates to `/sign-in`.
        No sign-up link or button (AC11, AC15).
      - Signed in as the invited email: "You are invited to edit this trip." / "Signed in as <email>. You'll be able to
        change the plan, not who has access." and `.btn-primary` "Open trip" -> `acceptInvite` then `/trips/<id>` (AC2).
      - Signed in as another email: `.empty-state` role=alert "Access refused" / "You're signed in as <x>, but this
        invite is for <y>." / "Switch to the invited account to open the trip." and `.btn-secondary` "Switch account"
        (sign out, then back to sign-in). No sign-up option (AC12, AC15).
      - Unknown/revoked token: `.empty-state` "This invite is no longer valid" with a link to Trips (when signed in).
      `SignInPage` / `AuthForm`: when `peekReturnTo()` starts with `/invite/`, `footer` becomes optional and is
      omitted, and the Google button is hidden (an unlinked Google sign-in leads to a sign-up modal), so the whole
      sign-in path from an invite offers no sign-up. `returnTo.ts` `pageLabel` gets an `/invite/` label ("your invite").
    files:
      - apps/web/src/trips/InvitePage.tsx
      - apps/web/src/App.tsx
      - apps/web/src/auth/SignInPage.tsx
      - apps/web/src/auth/AuthForm.tsx
      - apps/web/src/auth/returnTo.ts
    rationale: |
      The invite must be readable while signed out (to name the email to sign in with) but acceptance requires a session
      whose email matches, enforced server side in `POST /invites/{token}/accept`, never in the UI alone.
tests:
  - |
    AC1 (api, services/api/tests/unit/test_travellers_router.py) - written first, fails until the route exists:
    ```python
    def test_owner_adds_a_traveller_without_an_account(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = a.post("/trips", json={"name": "Lisbon"}).json()["id"]
        r = a.post(f"/trips/{tid}/travellers", json={"name": "Ana"})
        assert r.status_code == 201
        assert [t["name"] for t in r.json()["travellers"]] == ["Ana"]
    ```
    Web (TravelersTab.test.tsx): type "Ana", click "Add traveller", `expect(await screen.findByText('Ana')).toBeInTheDocument()`.
  - |
    AC2 (api, test_editor_access_router.py): owner invites, a second signed-in account with that email accepts, then reads the trip.
    ```python
    def test_invited_editor_opens_the_trip_with_editor_access(sign_in_as):
        owner, ana = sign_in_as("o@example.com"), sign_in_as("ana@example.com")
        tid = owner.post("/trips", json={"name": "Lisbon"}).json()["id"]
        token = _invite(owner, tid, "ana@example.com")        # reads the in-memory sender
        assert ana.post(f"/invites/{token}/accept").json() == {"trip_id": tid}
        body = ana.get(f"/trips/{tid}").json()
        assert (body["is_owner"], body["can_edit"]) == (False, True)
    ```
    Web (InvitePage.test.tsx): signed in as ana@example.com, click "Open trip", `expect(fetchMock).toHaveBeenCalledWith('/invites/tok1/accept', ...)` and the trip route renders.
  - |
    AC3 (api): revoked editor no longer sees the trip, in `GET /trips/{id}` or in `GET /trips`.
    ```python
    owner.delete(f"/trips/{tid}/editors/ana@example.com")
    assert ana.get(f"/trips/{tid}").status_code == 404
    assert tid not in [t["id"] for t in ana.get("/trips").json()]
    ```
    Web (TravelersTab.test.tsx): click "Revoke access for ana@example.com", `expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument()` and the toast text "Access revoked for ana@example.com. The trip is no longer shown to them."
  - |
    AC4 (api and web): editor adds an activity.
    ```python
    r = ana.post(f"/trips/{tid}/activities", json={"name": "Cooking class", "date": "2027-03-04"})
    assert r.status_code == 201
    assert [a["name"] for a in ana.get(f"/trips/{tid}").json()["activities"]] == ["Cooking class"]
    ```
    Web (extend Activities.test.tsx with `trip({ is_owner: false, can_edit: true })`): the "Add activity to Day 2" button exists and after adding, `findByText('Tile Museum')` is in Day 2's section.
  - |
    AC5 (api and web): editor moves an activity; it appears on the new day only.
    ```python
    r = ana.put(f"/trips/{tid}/activities/{aid}", json={"date": "2027-03-05"})
    assert [a["date"] for a in r.json()["activities"] if a["id"] == aid] == ["2027-03-05"]
    assert len([a for a in r.json()["activities"] if a["id"] == aid]) == 1
    ```
  - |
    AC6 (api and web): editor removes an activity.
    ```python
    r = ana.delete(f"/trips/{tid}/activities/{aid}")
    assert r.status_code == 200 and r.json()["activities"] == []
    ```
  - |
    AC7 (api and web): editors get no invite/revoke control and the API refuses the calls.
    ```python
    assert ana.post(f"/trips/{tid}/editors", json={"email": "x@example.com"}).status_code == 403
    assert ana.delete(f"/trips/{tid}/editors/ben@example.com").status_code == 403
    assert ana.get(f"/trips/{tid}").json()["editors"] == []
    ```
    Web: with `is_owner: false`, `expect(screen.queryByRole('button', { name: 'Invite editor' })).toBeNull()` and `queryByRole('button', { name: /Revoke access/ })` is null, on both the Itinerary and Travelers tabs; also no "Edit trip" / "Rename" buttons. API also pins that an editor cannot `PUT /trips/{id}`, `PUT /trips/{id}/days/{date}` or `DELETE /trips/{id}` (403) - "editors change the plan only".
  - |
    AC8 (api and web): editor cannot add a traveller.
    ```python
    assert ana.post(f"/trips/{tid}/travellers", json={"name": "Zed"}).status_code == 403
    ```
    Web: `expect(screen.queryByRole('button', { name: 'Add traveller' })).toBeNull()` and `queryByLabelText('Traveller name')` is null; the traveller list is still shown.
  - |
    AC9 (api and web): exactly Ana and Ben, in the order added.
    ```python
    for n in ("Ana", "Ben"):
        owner.post(f"/trips/{tid}/travellers", json={"name": n})
    assert [t["name"] for t in owner.get(f"/trips/{tid}").json()["travellers"]] == ["Ana", "Ben"]
    ```
    Web: `expect(within(screen.getByRole('list', { name: 'Travellers on this trip' })).getAllByRole('listitem').map(li => li.textContent)).toEqual(['AAna', 'BBen'])` (avatar initial + name; adjust to `getAllByText` on the name span if the avatar is `aria-hidden`).
  - |
    AC10 (api): revoking Ana leaves Ben's access intact.
    ```python
    owner.delete(f"/trips/{tid}/editors/ana@example.com")
    assert ben.get(f"/trips/{tid}").status_code == 200
    assert tid in [t["id"] for t in ben.get("/trips").json()]
    ```
  - |
    AC11 (web, InvitePage.test.tsx): signed out, `GET /invites/tok1` returns `{ email: 'ana@example.com', trip_name: 'Lisbon' }`, `/auth/me` returns 401.
    ```ts
    expect(await screen.findByText(/Sign in with/)).toHaveTextContent('Sign in with ana@example.com to open this trip.')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    ```
    The test needs a `stubApi` option for a signed-out `/auth/me` (test-api.tsx currently always answers signed in), so add `signedOut?: boolean`.
    API: `GET /invites/{token}` works with no cookie and returns the email; `POST /invites/{token}/accept` without a session returns 401.
  - |
    AC12 (api and web): a different signed-in account is refused.
    ```python
    assert ben.post(f"/invites/{token}/accept").status_code == 403
    assert ben.get(f"/trips/{tid}").status_code == 404      # nothing was granted
    ```
    Web: signed in as ben@example.com, `expect(await screen.findByRole('alert')).toHaveTextContent('Access refused')` and no "Open trip" button.
  - |
    AC13 (web, TripDetailPage / AccessRemoved.test.tsx): editor has the trip open, the next background refetch answers 404.
    ```ts
    vi.useFakeTimers(); /* GET /trips/t1 -> 200 first, then 404 */
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await screen.findByRole('alertdialog', { name: 'Access removed' })).toHaveTextContent('Your access to this trip was removed. Changes were not saved.')
    ```
    Owner view never polls (assert `fetch` called once for GET /trips/t1 after 60 s).
  - |
    AC14 (api and web): a revoked editor's change is not saved.
    ```python
    owner.delete(f"/trips/{tid}/editors/ana@example.com")
    r = ana.post(f"/trips/{tid}/activities", json={"name": "Late", "date": "2027-03-04"})
    assert r.status_code == 404
    assert owner.get(f"/trips/{tid}").json()["activities"] == []
    ```
    Same for move and delete. Web: the POST answers 404 -> the access-removed modal shows and the activity is not rendered.
  - |
    AC15 (web): no sign-up option on the invite path.
    ```ts
    expect(screen.queryByRole('link', { name: /sign up/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /sign up/i })).toBeNull()
    ```
    on the signed-out invite page, the wrong-account page, and `/sign-in` when `sessionStorage.returnTo` is `/invite/tok1` (also no "Continue with Google" there). Control: plain `/sign-in` still shows "Sign up" (existing SignInPage tests must stay green).
  - |
    AC16 (api and web): blank or whitespace-only traveller names are refused with a message.
    ```python
    for name in ("", "   "):
        assert owner.post(f"/trips/{tid}/travellers", json={"name": name}).status_code == 422
    ```
    Web: `fireEvent.change(input, { target: { value: '   ' } }); fireEvent.click(addButton)` then
    `expect(await screen.findByRole('alert')).toHaveTextContent('Enter a traveller name to add them to this trip.')` and `expect(input).toHaveAttribute('aria-invalid', 'true')`.
  - |
    AC17 (api and web): the list is unchanged after a refused save.
    ```python
    before = owner.get(f"/trips/{tid}").json()["travellers"]
    owner.post(f"/trips/{tid}/travellers", json={"name": "  "})
    assert owner.get(f"/trips/{tid}").json()["travellers"] == before
    ```
    Web: `expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0)` and the rendered names are unchanged.
  - |
    Existing data (services/api/tests/unit/test_trip_store.py): a stored item with no `travellers`/`editors` loads.
    ```python
    t = Trip.model_validate({"id": "t1", "name": "Old"})
    assert (t.travellers, t.editors) == ([], [])
    ```
    Plus a `DynamoTripStore` round trip against a stubbed boto3 table for `save_invite`/`get_invite`/`link_editor`/`shared_trips`/`unlink_editor` key shapes, and an e2e (tests/e2e/test_ownership_e2e.py style, httpx + ASGITransport) of invite -> accept -> edit -> revoke -> 404 across two clients.
  - |
    Regression: a trip id belonging to another traveller who is NOT an editor still answers 404 for every route (extend test_trips_router.py / test_activities_router.py), and the existing owner tests keep passing unchanged.
assumptions_or_open_questions:
  - |
    Design vs guidelines: the prototype shows Travelers and Access as two pages, but the UI guidelines list exactly Overview, Itinerary, Bookings, Budget, Travelers as in-trip tabs and the scope says "Travelers tab ... owner invites editors by email". I plan the Editors section inside the Travelers tab (owner only). If the reviewer prefers a separate Access tab, only TripDetailPage and AccessSection placement change.
  - |
    The prototype's Travelers tab shows an "Add traveller" `.btn-primary` and the Access section also has an `.btn-primary` "Invite editor". Guidelines say one `.btn-primary` per screen section; they are separate sections (Travelers, Editors) with their own headings, so I keep the prototype's styling.
  - |
    Email delivery: no sender exists yet (ADR-0010 only records the decision). I assume a Protocol plus an SES sender enabled by `INVITE_FROM_ADDRESS`, falling back to showing the copyable invite link to the owner when it is unset. Question for the reviewer: is SES provisioning in scope here, or is link-only acceptable for this item?
  - |
    Invite links are unguessable per-editor tokens (`/invite/<token>`), so a signed-out visitor can be told which email to sign in with (AC11) without the email being in the URL. Anyone holding the link can see the invited email and trip name, but acceptance is gated by the session email matching.
  - |
    Revoke Undo in the prototype restores the editor. I implement Undo as a fresh invite for the same email (new token, status "Invited"); an editor who had accepted must open the new link again. Say so if exact restoration is wanted.
  - |
    AC13 needs a way for an open trip to learn it was revoked. Without a push channel I use an editor-only refetch on window focus plus every 30 s, and any rejected mutation also shows the modal. Revocation therefore appears within about 30 s, not instantly.
  - |
    Editors may also add/edit/delete reminders (they are plan content and `can_edit_trip` was documented as the single rule for the itinerary). Rename day, trip settings, delete trip, invite, revoke and add traveller stay owner-only, matching the prototype (editor Itinerary has no Rename day or trip settings).
  - |
    Editor emails are compared lower-cased and trimmed, the same as `_normalise` in auth.py. If an editor later changes their account email, their access follows the invited address, not the account; out of scope.
  - |
    Removing a traveller is not in the acceptance criteria or prototype, so it is not planned. Duplicate traveller names are allowed; a cap of 50 travellers and 50 editors keeps the Trip item well under DynamoDB's 400 KB limit, like the existing activity and reminder caps.
  - |
    Out of scope per the item: the read-only link, and sign-up from an invite (the sign-up route itself is untouched and "left open").
estimated_points: 8
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: no migration. `Trip.travellers` and `Trip.editors` default to `[]`, so every stored Trip item
    still validates in `DynamoTripStore._to_trip` and keeps its owner-only behaviour. New index items use their own
    key prefixes in the same table (`INVITE#<token>` / `EDITOR#<email>`), which the owner query
    (`pk = USER#<id>` and `begins_with(sk, "TRIP#")`) never matches, so `list_trips` is unaffected.
  - **Backfill / seed**: none needed - no trip has editors before this ships, so there is nothing to index. Index
    writes happen only at invite/accept/revoke time and are idempotent puts/deletes.
  - **Settings**: `INVITE_FROM_ADDRESS` (default empty = do not send email; the owner sees the invite link instead).
    Documented in services/api/README.md next to the other env vars; add the `Settings.invite_from_address` field in
    config.py. `WEB_ORIGIN` (existing) is used to build the invite link.
  - **Provisioning**: the trips table must allow `GetItem`, `PutItem`, `Query` and `DeleteItem` (already needed
    today; the README line is updated to list DeleteItem). If email sending is wanted, SES needs a verified sender
    for `INVITE_FROM_ADDRESS` and `ses:SendEmail` on the Lambda role - provisioned outside this repo.
  - **Order and rollback**: deploy API before web (the web tolerates missing `travellers`/`editors`). Rolling back the
    code leaves harmless extra attributes/items; old code ignores unknown Trip fields? `Trip` is a pydantic model with
    default config, which ignores extra fields, so older code still loads items that have `editors`. Leftover EDITOR#
    and INVITE# items are inert once the routes are gone.

  ### Approach notes

  - The authorisation rule lives in one place (`_load` / `_editable_trip` / `_owned_trip` in routers/trips.py). Trip
    ids are never trusted: an editor must be in the Trip item's own `editors` list with `accepted=True`; the EDITOR#
    index only finds the owner partition. 404 for "not yours" and "never existed" is kept, matching the existing
    behaviour in `get_trip`.
  - Session identity is a user id; the email needed for editor matching comes from `IdentityProvider.email_for`.
  - Dates, copy and button wording follow the UI guidelines (verb-first buttons, second person, errors say what
    happened and what to do next).

  ```mermaid
  flowchart TD
    web[TripDetailPage.tsx] --> tabs[TravelersTab.tsx / AccessSection.tsx]
    web --> arm[AccessRemovedModal.tsx]
    tabs --> wapi[trips/api.ts]
    inv[InvitePage.tsx] --> wapi
    app[App.tsx] --> inv
    app --> signin[SignInPage.tsx / AuthForm.tsx]
    wapi --> router[routers/trips.py]
    inv --> invr[routers/invites.py]
    router --> store[trips/store.py]
    invr --> store
    router --> deps[routers/deps.py]
    invr --> deps
    deps --> store
    router --> ident[auth/identity.py email_for]
    classDef touched fill:#f96,color:#000
    class web,tabs,arm,wapi,inv,app,signin,router,invr,store,deps touched
  ```
  Touched: TripDetailPage (new tab, access-removed handling), trips.py (access rule and routes), store.py (models plus
  editor/invite index), deps.py (invite sender dependency), App.tsx (public invite route), SignInPage/AuthForm (hide sign-up
  on the invite path). `identity.py` is read only.
review_focus: |
  IN: travellers (add by name, blank refused), owner-only editor invite/revoke, editor access limited to plan editing
  (activities, reminders), invite page without any sign-up option, access-removed message. OUT: read-only link,
  sign-up from an invite, removing travellers. Riskiest area is the authorisation path in routers/trips.py: every
  route must resolve through `_owned_trip` or `_editable_trip`, a revoked editor must never reach `save_trip`, and
  "not yours" must stay 404. Deliberate choices: Editors section lives inside the Travelers tab (guidelines have no
  Access tab), index items share the trips table, and revocation reaches an open trip via a 30 s editor-only refetch.
