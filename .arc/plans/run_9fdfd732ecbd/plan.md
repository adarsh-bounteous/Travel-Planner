summary: |
  Most of local trip storage already exists: `PersistentTripStore` (services/api/app/trips/local_store.py) persists trips (with days, activities, stays, transport picks, travellers, reminders), invites, share links and editor links to the local data file; `deps.get_trips` and `deps.get_invite_sender` already switch to the local store and the in-memory inbox in local mode; sample trips are seeded by `local_seed`. The one behavioural gap against the ACs is AC18/AC19: `POST /invites/{token}/accept` on an already-accepted invite succeeds again (200), because `_live_invite` only checks that the editor row still exists. This plan (1) makes re-accepting an accepted invite answer a 409 `invite_used` error without touching the editors list, (2) shows a clear message for it on the web invite page, and (3) adds local-mode API tests (real `PersistentTripStore`, restart simulated by clearing the `lru_cache`d stores, as `test_local_storage_startup.py` does) that pin every other AC so the local path is proven end to end, not just the in-memory store.
scope:
  - description: |
      Reject accepting an invite that has already been accepted. Revoked invites already 404 (revoking removes the editor row and the invite record). Change in `accept_invite`, before mutating anything:

      ```python
      editor = next(e for e in trip.editors if e.token == token)
      if editor.accepted:
          raise ApiError(409, "invite_used")
      ```
      No save_trip or link_editor happens on that path, so the editors list is unchanged (AC19).
    files:
      - services/api/app/routers/invites.py
    rationale: AC18 and AC19. The only API behaviour change in this item.
  - description: |
      Web: surface the already-used error on the invite page. In `call`, map `409` on a path ending `/accept` to a new `export class InviteUsedError extends Error {}`; in `InvitePage.open`, catch it and show a `role="alert"` message "This invite has already been used." in place of the generic "We couldn't open the trip. Try again." (which stays for other failures).
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/InvitePage.tsx
      - apps/web/src/trips/InvitePage.test.tsx
    rationale: AC18 asks that an error message is shown; a retry hint would be wrong for a spent invite.
  - description: |
      New local-mode API test module exercising the real `PersistentTripStore` through the app: fixture sets `LOCAL_MODE=true`, `APP_ENV=local`, `COOKIE_SECURE=false`, clears `deps._local_trips` / `auth._local_identity` caches to simulate a restart (same approach as test_local_storage_startup.py), signs in as the seeded demo account, and covers the ACs listed in `tests`. No production code beyond the invite fix is expected; if a test exposes a gap in the local path, fix it minimally in the file it points at.
    files:
      - services/api/tests/unit/test_local_trips_invites_share.py
    rationale: The ACs are stated for local storage; existing tests cover the store and the in-memory path but not the full set through local mode.
  - description: |
      Add an already-accepted case to the existing editor-access tests using the in-memory fixture (accept twice, second is 409, editors unchanged).
    files:
      - services/api/tests/unit/test_editor_access_router.py
    rationale: Fast unit-level regression guard for AC18/AC19 next to the existing invite tests.
tests:
  - |
    AC1-3 (test_local_trips_invites_share.py): create, edit, delete a trip in local mode.
    ```python
    tid = client.post("/trips", json=BODY).json()["id"]
    assert tid in [t["id"] for t in client.get("/trips").json()]
    client.put(f"/trips/{tid}", json={"name": "Renamed"})
    assert client.get(f"/trips/{tid}").json()["name"] == "Renamed"
    client.delete(f"/trips/{tid}")
    assert tid not in [t["id"] for t in client.get("/trips").json()]
    ```
  - |
    AC4: build a trip with a day name, activity, stay, transport pick, traveller and reminder, restart, and assert all are still listed.
    ```python
    before = client.get(f"/trips/{tid}").json()
    restart()
    after = fresh_signed_in_client().get(f"/trips/{tid}").json()
    for key in ("days", "activities", "stays", "transport", "travellers", "reminders"):
        assert after[key] == before[key] and after[key]
    ```
    The transport pick is added through the existing transport-picks route with the seeded provider catalogue.
  - |
    AC5-6: add each item type to the trip, assert it appears, delete it, assert it is gone (days are removed by changing the trip dates; the others via their DELETE routes).
    ```python
    r = client.post(f"/trips/{tid}/activities", json={"name": "Tour", "date": "2026-06-01"})
    aid = r.json()["activities"][0]["id"]
    assert client.delete(f"/trips/{tid}/activities/{aid}").json()["activities"] == []
    ```
  - |
    AC7, AC10: invite an editor; it is pending on the trip and the email is in the local inbox.
    ```python
    r = client.post(f"/trips/{tid}/editors", json={"email": "ana@example.com"})
    assert [(e["email"], e["accepted"]) for e in r.json()["editors"]] == [("ana@example.com", False)]
    assert client.get("/local/inbox").json()[0]["to"] == "ana@example.com"
    ```
  - |
    AC8: invitee signs up and signs in locally, accepts, and is an editor (also after a restart).
    ```python
    assert ana.post(f"/invites/{token}/accept").status_code == 200
    editors = owner.get(f"/trips/{tid}").json()["editors"]
    assert [(e["email"], e["accepted"]) for e in editors] == [("ana@example.com", True)]
    ```
  - |
    AC9: revoking removes the pending invite.
    ```python
    owner.delete(f"/trips/{tid}/editors/ana@example.com")
    assert owner.get(f"/trips/{tid}").json()["editors"] == []
    assert ana.get(f"/invites/{token}").status_code == 404
    ```
  - |
    AC11-13, AC15-17: share link lifecycle in local mode, including a restart while active.
    ```python
    url = client.post(f"/trips/{tid}/share-link").json()["share_url"]
    token = url.rsplit("/", 1)[1]
    restart()
    assert anon.get(f"/shared/{token}").json()["name"] == "Rome"   # AC12, AC17
    client.delete(f"/trips/{tid}/share-link")
    r = anon.get(f"/shared/{token}")
    assert r.status_code == 404 and "name" not in r.json()          # AC15 (API), AC16
    ```
    The "this link is no longer available" text is already rendered by apps/web/src/trips/LinkUnavailable.tsx and covered by SharedTripPage.test.tsx; no change needed, the test run just confirms it still passes.
  - |
    AC14: a seeded account lists its sample trips alongside a trip it creates.
    ```python
    client.post("/trips", json=BODY)
    assert {"Summer in Kyoto", "Weekend in Lisbon", "Rome"} <= {t["name"] for t in client.get("/trips").json()}
    ```
  - |
    AC18/AC19 (API, in test_editor_access_router.py and the local module): accepting an accepted or revoked invite errors and editors are unchanged.
    ```python
    assert ana.post(f"/invites/{token}/accept").status_code == 200
    before = owner.get(f"/trips/{tid}").json()["editors"]
    r = ana.post(f"/invites/{token}/accept")
    assert (r.status_code, r.json()["code"]) == (409, "invite_used")
    assert owner.get(f"/trips/{tid}").json()["editors"] == before
    # revoked
    owner.delete(f"/trips/{tid}/editors/ana@example.com")
    assert ana.post(f"/invites/{token}/accept").status_code == 404
    ```
  - |
    AC18 (web, InvitePage.test.tsx): the page shows an error for a spent invite.
    ```tsx
    stubApi({ 'GET /invites/tok1': invite, 'POST /invites/tok1/accept': { status: 409, body: { code: 'invite_used' } } }, { email: 'ana@example.com' })
    renderAt('/invite/tok1')
    fireEvent.click(await screen.findByRole('button', { name: 'Open trip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This invite has already been used.')
    ```
assumptions_or_open_questions:
  - |
    Assumed already-accepted invites answer 409 with code `invite_used`, while revoked ones keep the existing 404. Both are errors per AC18; a reviewer may prefer 404 for both (then InviteUsedError and the web message change are dropped and the existing "couldn't open the trip" alert is the message).
  - |
    The local inbox is in memory (existing `InMemoryInviteSender`), so invite emails do not survive an API restart. AC10 only needs them to appear after sending, and the inbox page is owned by the stand-ins epic, so persistence is left out.
  - |
    Share links have no expiry, so AC17 holds by construction; the test confirms a link still works after a restart. No time-based expiry is added.
  - |
    Day, activity, stay, transport, traveller and reminder routes already exist and persist through `save_trip`; I am not changing them. Exact request bodies for the stay and transport-pick routes will be copied from the existing router unit tests when writing the test.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout
  None — no schema, stored-data shape, seed, setting or env var changes. The local data file format (`FORMAT_VERSION = 1`) and the `Invite`/`Editor` models are untouched; the invite fix is a pure request-time check, so existing stored invites and trips stay readable and a deploy needs no ordering or rollback beyond reverting the commit.

  ### Findings
  - Local store, inbox and seeding are already merged from stories 064-068 and 082; this item verifies and closes the invite gap instead of rebuilding them.
  - Share-link revocation already answers a uniform 404 (no trip data) and the web already shows "Link no longer available".

  ```mermaid
  flowchart TD
    Web[InvitePage.tsx / api.ts] -->|POST /invites/token/accept| InvR[routers/invites.py]
    InvR --> Deps[routers/deps.py get_trips]
    Deps --> PS[trips/local_store.py PersistentTripStore]
    PS --> LDF[local_data.py LocalDataFile]
    Trips[routers/trips.py invite_editor] --> Sender[trips/invites.py InMemoryInviteSender]
    Inbox[routers/local_inbox.py] --> Sender
    classDef touched fill:#f96,color:#000
    class InvR,Web touched
  ```
  Touched: invites.py (reject re-accept), InvitePage.tsx and api.ts (message). The rest is context that the new tests exercise.
review_focus: |
  IN scope: the 409 `invite_used` check on accept, its web message, and new local-mode tests covering the remaining ACs. OUT: new storage code, inbox persistence, share-link expiry. Riskiest part is the accept change: it must not mutate or save the trip on the rejected path, and must keep the 404 for revoked invites and 403 `wrong_account` ordering intact. Most ACs are deliberately test-only because the local store already implements them.
