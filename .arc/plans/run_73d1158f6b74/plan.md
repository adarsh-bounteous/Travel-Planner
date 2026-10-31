summary: |
  Add three itinerary actions to the trip page (View itinerary, Print or Save as PDF, Email me a copy), let the owner switch the full itinerary on or off for the read-only share link (off by default), and make the shared page show the complete document with no edit links. The complete document already exists as `build_itinerary` on the API and `Document` in `ItineraryPage.tsx` (money and inclusions, travel essentials, before you go). This story reuses it in three places: the View itinerary page, the emailed HTML copy and the shared page. New work: a `share_itinerary` flag on the Trip, an owner route to set it, a gated `/shared/{token}` payload that carries the built itinerary, an HTML renderer plus a `send_html` path on the invite sender (local inbox in local mode, SES when live), and a web `ItineraryActions` row with a double-press guard and an error alert. Per AC11 an open shared page must not drop the itinerary when the owner switches it off, but it must still react to the link being revoked.
scope:
  - description: |
      Trip model: add `share_itinerary: bool = False` (server-owned, changed only through the share-link route).
      Before: no field. After, in `Trip`, next to `share_token`:
      ```python
      share_itinerary: bool = False  # server-owned: whether the read-only link shows the itinerary; off until the owner switches it on
      ```
      Add the route `PUT /trips/{trip_id}/share-link` with body `ShareItinerarySetting(show_itinerary: bool)`. It is owner only (`_owned_trip`: 404 stranger, 403 editor) and 404 when the trip has no share link. It sets `trip.share_itinerary`, bumps `updated_at`, saves, and returns `_view(...)`. `TripView` inherits the field, so the owner's web client reads `share_itinerary`. `revoke_share_link` also resets `share_itinerary = False`, so a new link later starts off.
    files:
      - services/api/app/trips/store.py
      - services/api/app/routers/trips.py
    rationale: |
      Reuses the existing share-link routes and owner checks. Trips are stored as whole documents (Dynamo `put_item` of `model_dump`, local `trips.json`), so no migration is needed and old items default to off.
  - description: |
      Itinerary HTML and redaction, a new module `app/trips/itinerary_html.py`:
      ```python
      def render_itinerary_html(itinerary: Itinerary) -> str: ...      # complete document: cover, glance, days, still to schedule, money and inclusions, travel essentials, before you go, notes
      def public_itinerary(itinerary: Itinerary) -> Itinerary: ...      # copy with every link_url/link_text/add_path set to None
      ```
      Everything is escaped with `html.escape`. Amounts are written "412.00 EUR" (amount plus currency code, per the UI guidelines). The email copy carries no app-relative links (add_path is never rendered). The HTML uses plain semantic elements only (h1/h2/dl/ul/table) and no colour or pixel literals.
    files:
      - services/api/app/trips/itinerary_html.py
    rationale: |
      One document builder (`build_itinerary`) feeds email and shared view, so both carry the same sections as the View itinerary page. The redaction mirrors the allow-list posture of `SharedOption` ("no booking link").
  - description: |
      Email me a copy: `POST /trips/{trip_id}/itinerary/email` in `routers/itinerary.py`, for the owner or an accepted editor (the same `_load` rule as GET itinerary). It builds the itinerary exactly as `get_itinerary` does (the owner's profile only for the owner), renders it, and calls `sender.send_html(to=identity.email_for(user), subject=f"Your itinerary: {name}", html=...)`. It returns `{"sent_to": email}` with 200. Any sender exception is logged with `logger.warning(..., exc_info=True)` and answered `ApiError(502, "email_failed")`.
      ```python
      # invites.py
      class InviteSender(Protocol):
          def send(self, email: str, trip_name: str, link: str) -> None: ...
          def send_html(self, email: str, subject: str, html: str) -> None: ...
      class EmailNotConfigured(Exception): ...
      ```
      `SesInviteSender.send_html` uses `Body={"Html": {"Data": html}}`. `NoInviteSender.send_html` raises `EmailNotConfigured` (it must NOT silently succeed, or the traveller is told a copy arrived when it did not). `InMemoryInviteSender.send_html` records the message (subject, html, a generated id used as `link`, kind "itinerary") and calls `_recorded()`.
    files:
      - services/api/app/routers/itinerary.py
      - services/api/app/trips/invites.py
    rationale: |
      ADR-0010 (Email Delivery, outbound) is the existing outbound path; local mode already swaps in the inbox stand-in through `get_invite_sender`.
  - description: |
      Local inbox: persist and list the HTML copy. `PersistentInviteSender` gains `html`/`subjects` per message in `inbox.json` (bump nothing: `INBOX_FORMAT_VERSION` stays 1, and the new keys are read with `.get`, so existing files load). `GET /local/inbox` adds `html: str | None` and a per-message `subject`. Kind "itinerary" is added to `SUBJECTS` handling; its `trip_name` is "" so it is never taken for an invite.
    files:
      - services/api/app/trips/local_inbox_store.py
      - services/api/app/routers/local_inbox.py
    rationale: |
      AC4 says the copy arrives in the local inbox in local mode. The inbox only stored (to, trip_name, link), so it cannot hold a document body yet.
  - description: |
      Shared view API: change `GET /shared/{token}` in `routers/shared.py`. New `SharedTrip`:
      ```python
      class SharedTrip(BaseModel):
          name: str
          destination: str | None = None
          start_date: date | None = None
          end_date: date | None = None
          show_itinerary: bool = False
          itinerary: Itinerary | None = None   # present only when show_itinerary
      ```
      The route needs `profiles/visa_rules/today/rates` dependencies. When `trip.share_itinerary` is true it returns `public_itinerary(build_itinerary(trip, None, visa_rules, today, rates))`. When false, no itinerary content leaves the server. A missing, revoked or orphaned token stays the same 404 and `Cache-Control: no-store` stays. The owner's profile is never used (editors already get `None`).
      The old `days/options/activities/restaurants/currency/is_owner/can_edit` fields and the `SharedOption/SharedRestaurant` models are removed, because the itinerary document replaces them.
    files:
      - services/api/app/routers/shared.py
    rationale: |
      AC7 to AC10. The default-off behaviour is a deliberate change: today every share link shows the plan, and after this story it shows only the name, destination and dates until the owner switches the itinerary on.
  - description: |
      Web API client in `trips/api.ts`: add `share_itinerary?: boolean` to `Trip`. Add `SharedTrip = { name; destination: string | null; start_date: string | null; end_date: string | null; show_itinerary: boolean; itinerary: Itinerary | null }` and make `fetchSharedTrip` return `call<SharedTrip>(...)`. Add:
      ```ts
      export const setShareItinerary = (tripId: string, show: boolean) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/share-link`, 'PUT', { show_itinerary: show })
      export const emailItinerary = (tripId: string) =>
        call<{ sent_to: string }>(`/trips/${encodeURIComponent(tripId)}/itinerary/email`, 'POST')
      ```
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      The existing `call` helper already turns non-2xx into thrown errors, which the email action maps to its error alert.
  - description: |
      Shared document component. Extract `Document` (and its private `MoneySections`, `FactCard`, `ItemRows`, `BookingsTable`, `NotYetPlanned` and format helpers) out of `ItineraryPage.tsx` into `trips/ItineraryDocument.tsx`, exported as `ItineraryDocument({ itinerary, readOnly })`. With `readOnly` it omits the "Add to plan" and "Explore options" links. `ItineraryPage` and the new shared view both use it. Styling stays on the existing classes (`.document`, `.card`, `.section`, `.line-list`, `.divider`, `.alert`) from `index.css`, which already use the tokens (`--space-*`, `--color-*`, `--border-width`).
    files:
      - apps/web/src/trips/ItineraryDocument.tsx
      - apps/web/src/trips/ItineraryPage.tsx
    rationale: |
      The prototype's "Memorable" note asks for one component set reused on the trip page, itinerary and shared page, with edit links only on the trip page. This keeps shared and emailed content from drifting from the View itinerary page.
  - description: |
      `ItineraryActions` component (new, the prototype's "ItineraryActions row"). Props: `{ tripId: string; showView?: boolean }`.
      Markup per the prototype's "Trip page" screen: `<div class="cluster actions" role="group" aria-label="Itinerary actions">` holding
      1. View itinerary: a router `Link` with `btn btn-primary` and `EyeIcon`, to `/trips/:id/itinerary`. It is rendered only when `showView`.
      2. Print or Save as PDF: `btn btn-secondary`. On the itinerary page it calls `window.print()`. On the trip page it navigates to `/trips/:id/itinerary?print=1`, and `ItineraryPage` calls `window.print()` once after it has loaded when that param is present.
      3. Email me a copy: `btn btn-secondary`.
      Email state machine: `idle | sending | failed`, with a `useRef` in-flight guard so a second press while `sending` returns before any request is made (AC6). While sending the button is `aria-disabled="true" aria-busy="true"`, shows `<span class="spinner">` and the label "Sending copy…", and a `role="status"` hint reads "Sending one copy to {address}. Pressing again won't send a second one." On success it shows the existing `Toast` "Copy sent to {sent_to}. Check your inbox." On failure it shows `<div class="alert alert-danger" role="alert">` with the title "The email could not be sent." and the text "Nothing arrived in your inbox. Try again in a moment.", and the button is available again as the retry. The idle hint is a `field-hint`: "The full itinerary arrives as HTML at your account email. In local mode it lands in the local inbox."
      Actions row spacing: `.actions .btn { flex: 1 1 auto }` on phones and `flex: 0 0 auto` from 48rem, added to `index.css` using the tokens already in use there.
      Placement: `TripDetailPage.tsx` renders it under the `trip-hero` header with `showView`. `ItineraryPage.tsx` renders it at the foot of the document without `showView` (as in the prototype's "Full itinerary" screen), adds a "Back to trip" link (`ArrowLeftIcon`, to `/trips/:id`) at the top, and drops the old sticky `.print-fab` Print button.
    files:
      - apps/web/src/trips/ItineraryActions.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/index.css
    rationale: |
      AC1 to AC6. The in-flight guard is a ref and not just component state, so two presses in one tick cannot both pass.
  - description: |
      Owner switch. In `ShareTripModal.tsx`, once a link exists, add the prototype's "Share settings" block as a `<fieldset>` with `<legend>Show itinerary on share link</legend>` and two `.check` radios (`.radio`): "On" ("Visitors see the full itinerary, including money, inclusions and travel essentials.") and "Off" ("Visitors see the trip name and summary only. This is the default."). Below it sits the `field-hint` "Switching off applies to new visits. Pages already open keep what they loaded until they reload." A Save button (`btn btn-primary`, label "Saving…" with `aria-disabled` while pending) calls `setShareItinerary`, then `onChanged(updated, "Saved. The share link now shows the full itinerary.")` or "Saved. The share link hides the itinerary." The initial radio comes from `trip.share_itinerary ?? false`. A failure shows the modal's existing `field-error` "We couldn't save that setting. Try again." The existing "Turn off link" action stays as `btn-secondary`.
    files:
      - apps/web/src/trips/ShareTripModal.tsx
    rationale: |
      AC7, AC9, AC10 on the owner side. Reuses the existing share surface, `Overlay`, `onChanged` toast and error pattern.
  - description: |
      Shared page. `SharedTripPage.tsx` renders from `SharedTrip`. With `show_itinerary && itinerary`: the "Read-only" badge, `<h1>`, and `<ItineraryDocument itinerary readOnly />`. This replaces the `ItineraryTab` render with `noop` handlers and the restaurants card. Otherwise: the `<h1>`, a `text-muted` summary line (destination and dates), and `<div class="alert alert-info"><span class="alert-title">The itinerary isn't shared.</span> Ask the trip owner if you'd like to see the day-by-day plan.</div>`.
      The 30 s and on-focus recheck keeps its 404 handling (link revoked, so show `AccessRemovedModal`). For AC11, the recheck result is merged with `setShared((prev) => (prev?.show_itinerary && !next.show_itinerary ? prev : next))`, so an open page that showed the itinerary keeps it when the owner switches it off, until the visitor reloads. A page that loaded as "off" may switch to showing it when the owner switches it on.
    files:
      - apps/web/src/trips/SharedTripPage.tsx
    rationale: |
      AC7 to AC11. The existing polling exists so a revoked link is noticed. Switching the itinerary off is not a revocation, so it must not clear the page.
  - description: |
      Local inbox page: `LocalInboxPage.tsx` gains kind "itinerary" (badge "Itinerary", neutral). Its opened email shows the HTML body inside `<iframe sandbox="" srcDoc={message.html} title="Itinerary email">` (never `dangerouslySetInnerHTML`), the subject from the API, and no action link. Add `html` and the "itinerary" kind to the `Message` type.
    files:
      - apps/web/src/local/LocalInboxPage.tsx
    rationale: |
      Lets a person in local mode actually see that the copy arrived (AC4). The sandboxed iframe stops the emailed markup running scripts in the app origin.
tests:
  - |
    AC1/AC2/AC3 (web, `ItineraryActions.test.tsx`) write first, expected to fail until the component exists:
    ```tsx
    renderAt('/trips/t1')
    const group = await screen.findByRole('group', { name: 'Itinerary actions' })
    expect(within(group).getByRole('link', { name: 'View itinerary' })).toHaveAttribute('href', '/trips/t1/itinerary')
    expect(within(group).getByRole('button', { name: 'Print or Save as PDF' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Email me a copy' })).toBeInTheDocument()
    ```
    Also in `ItineraryPage.test.tsx`: the foot of the page has Print and Email but no View itinerary, and "Back to trip" links to `/trips/t1`. Print on the trip page navigates to `?print=1`, and the itinerary page then calls a stubbed `window.print` once.
  - |
    AC4 (API unit, `test_itinerary_email.py`): the complete document goes to the traveller's own address.
    ```python
    resp = client.post(f"/trips/{tid}/itinerary/email")
    assert resp.status_code == 200 and resp.json() == {"sent_to": "maya@example.com"}
    to, subject, html = sender.html_sent[-1]
    assert to == "maya@example.com"
    assert "Money" in html or "Bookings and confirmations" in html   # money and inclusions
    assert "Included" in html and "Travel essentials" in html
    ```
    Plus: `render_itinerary_html` escapes `<script>` in a trip name (`assert "<script>" not in html`). An editor can send to their own address but a stranger gets 404. In local mode the message appears in `GET /local/inbox` with `kind == "itinerary"` and `html` containing "Travel essentials". `PersistentInviteSender` reloads an itinerary message from `inbox.json`, and an `inbox.json` written before this change (no html/subject keys) still loads.
  - |
    AC5 (API unit and web): a failing sender gives an error.
    ```python
    sender.fail = True
    resp = client.post(f"/trips/{tid}/itinerary/email")
    assert (resp.status_code, resp.json()) == (502, {"code": "email_failed"})
    ```
    `NoInviteSender().send_html(...)` raises `EmailNotConfigured`, and the route also answers 502. Web: with `stubApi` answering 502, after the press `expect(await screen.findByRole('alert')).toHaveTextContent('The email could not be sent.')`, and the button is enabled again with the label "Email me a copy".
  - |
    AC6 (web, `ItineraryActions.test.tsx`): a second press while sending is ignored.
    ```tsx
    await user.click(email); await user.click(email)
    expect(email).toHaveAttribute('aria-disabled', 'true')
    expect(email).toHaveTextContent('Sending copy…')
    expect(emailCalls()).toHaveLength(1)    // the stub holds the first request open
    ```
    After the stub resolves: `expect(await screen.findByText('Copy sent to maya@example.com. Check your inbox.')).toBeInTheDocument()` and the label is back to "Email me a copy".
  - |
    AC7 (API unit + e2e, extend `test_share_link_e2e.py`): the owner switches it on and the visitor sees the complete itinerary.
    ```python
    await owner.put(f"/trips/{tid}/share-link", json={"show_itinerary": True})
    body = (await visitor.get(path)).json()
    assert body["show_itinerary"] is True
    assert body["itinerary"]["money"] and body["itinerary"]["essentials"]
    ```
    Web (`SharedTripPage.test.tsx`): the money heading "Bookings and confirmations" or "Included", and "Travel essentials", are on the page.
  - |
    AC8 (API unit + web): no edit links on the shared page.
    ```python
    assert all(i["link_url"] is None for d in body["itinerary"]["days"] for i in d["items"])
    assert all(n["add_path"] is None for n in body["itinerary"]["money"]["not_included"])
    ```
    Web: `expect(main.queryByRole('link', { name: /Add to plan|Explore options|Edit/ })).not.toBeInTheDocument()` and `expect(main.queryByRole('button')).not.toBeInTheDocument()`. The existing "shows no control to change the plan" test is updated to run with the itinerary on.
  - |
    AC9 (API e2e + web): a link that has never had the itinerary switched on.
    ```python
    body = (await visitor.get(path)).json()
    assert body["show_itinerary"] is False and body["itinerary"] is None
    assert "days" not in body and "options" not in body
    ```
    Also a trip item stored before this change (share_token set, no `share_itinerary` key, via `InMemoryTripStore` and a `Trip.model_validate` of the old shape) answers off. Web: `expect(await screen.findByText("The itinerary isn't shared.")).toBeInTheDocument()` and the day-by-day content is absent.
  - |
    AC10 (API e2e + web): the owner switched it off. After `PUT {"show_itinerary": False}` the visitor's `GET` returns `itinerary is None` with status 200 (the link itself still works), and the shared page shows the not-shared alert. Also: revoking the link resets the flag, so `POST share-link` again starts with `share_itinerary is False`. Non-owner `PUT` gives 403 for an editor and 404 for a stranger, and a trip with no link gives 404.
  - |
    AC11 (web, `SharedTripPage.test.tsx`, fake timers like the existing revoke test): the first load has `show_itinerary: true`, the next poll returns `show_itinerary: false, itinerary: null`.
    ```tsx
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(screen.getByText('Travel essentials')).toBeInTheDocument()
    expect(screen.queryByText("The itinerary isn't shared.")).not.toBeInTheDocument()
    ```
    The existing "tells an open viewer when the owner turns the link off" test keeps passing: a 404 on recheck still shows the access-removed modal. A fresh page load after the switch-off shows the not-shared alert.
  - |
    Owner switch (web, `ShareTripModal.test.tsx`): Off is checked by default, choosing On and pressing Save calls `PUT /trips/t1/share-link` with `{ show_itinerary: true }`, `onChanged` receives the toast "Saved. The share link now shows the full itinerary.", and a failed save shows "We couldn't save that setting. Try again."
  - |
    Local inbox page (web): an itinerary message opens with a sandboxed iframe, `expect(frame).toHaveAttribute('sandbox', '')`, and its `srcdoc` contains "Travel essentials".
assumptions_or_open_questions:
  - |
    Prototype versus the UI guidelines. The prototype shows "Share settings" as its own screen with a radio group and Save, but the app's share surface is `ShareTripModal` and the guidelines say a `.modal` is only for confirmations. The plan puts the switch in the existing modal to avoid a new route (the prototype's own note says "Shares has no shell key"). A reviewer who prefers a drawer or a page should say so before code is written.
  - |
    The prototype's "Full itinerary" is a simplified three-section layout. The plan reuses the existing, richer `Document` from `ItineraryPage.tsx` (cover, at a glance, days, still to schedule, money and inclusions, essentials, before you go, notes) because the item says the shared and emailed copy carry the complete document. The prototype's trip page also puts View itinerary as `btn-primary` next to the existing "Book trip" `btn-primary`. The plan follows the prototype for the actions row (its own section), which gives two primaries on the page.
  - |
    The prototype's shared "off" page shows a trip summary, but a Trip has no summary field. The plan shows destination and dates instead. Say if a summary field should be added.
  - |
    Existing behaviour changes on purpose. Today every share link shows the plan, and after this story links start off (AC9). Existing links therefore show only the not-shared note until the owner switches it on. The old `SharedTrip` fields (`days`, `options`, `activities`, `restaurants`) are removed and the existing `SharedTripPage` and shared-route tests are rewritten for the new payload.
  - |
    The shared payload strips provider links (booking and restaurant pages) and `add_path`, in line with the existing "no booking link" rule. The emailed copy keeps provider links but has no app-relative links. Confirm that provider links should stay out of the shared page.
  - |
    Email HTML cannot use `var(--token)`, and the guidelines forbid colour literals. The emailed HTML is therefore plain semantic markup with the mail client's default styling and no colours. If branded styling is wanted in email, a token-to-inline-style export is needed and is not planned here.
  - |
    AC6 is enforced in the web client (an in-flight ref and aria-disabled). There is no server-side duplicate suppression, because Lambda instances share no memory and a second tab or device is a separate request. Say if a server-side guard is wanted (it would need a stored "last sent" marker).
  - |
    Deferred project question from TRAVEL-PLANNER-APP-CHORE-111, "how many itinerary builds and emails per trip or user, and should failures be monitored?", has no answer in the item or code. Planned stance: no new rate limit or sizing work in this story. Email failures are logged at warning level with the trip id (never the address or body). Someone needs to decide whether a per-user send limit and a failure alarm are wanted, and they would be a separate story.
  - |
    "A traveller" for Email me a copy is taken to be the signed-in owner or an accepted editor, and the address is their account email (`identity.email_for`). The shared page has no email action.
  - |
    Print or Save as PDF uses the browser print dialog (`window.print()` with the existing `@media print` rules in `index.css`) and no server-side PDF. On the trip page it goes through the itinerary page with `?print=1` so the whole trip page is not printed.
estimated_points: 8
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: one new optional field, `Trip.share_itinerary: bool = False`. There is no table or index change and no migration. Trips are stored as whole documents (`DynamoTripStore.save_trip` / `PersistentTripStore` `trips.json`), so existing items without the key load with the default `False` and stay readable. Behaviour for existing share links changes on purpose: they show only the not-shared note until the owner switches the itinerary on (AC9). `inbox.json` gains optional per-message `html`/`subject` keys read with `.get`, and `INBOX_FORMAT_VERSION` stays 1, so older files still load. A test covers the old trip shape and the old inbox file.
  - **Backfill / seed**: none needed. The default is the safe state, so nothing is backfilled and there is nothing to re-run.
  - **Settings**: no new setting or env var. Live email reuses `INVITE_FROM_ADDRESS` (when unset, `NoInviteSender` makes the copy fail with a visible error instead of pretending), and local mode reuses the local inbox.
  - **Provisioning**: the live SES identity behind `INVITE_FROM_ADDRESS` must be allowed to send HTML to the traveller's address. SES `send_email` with an `Html` body needs no new permission beyond the existing `ses:SendEmail` used for invites, which I did not verify against the infrastructure code (no IaC was read), so a deployer should confirm it.
  - **Order and rollback**: deploy API and web together. The web client tolerates an old API (`share_itinerary` optional), but an old web client against the new API would break the shared page, because the `/shared` payload shape changes. Roll back by redeploying the previous build. A stored `share_itinerary` key is harmless to older code, because `Trip` has no `extra=forbid` and pydantic ignores unknown keys.

  ### Design and token notes

  Tokens load through `apps/web/src/index.css:2` (`@import "../../../design-system/tokens.css"`). The token names used match those in the prototype's inlined `tokens.css`: `--space-1/2/3/4`, `--color-border`, `--color-fg-muted`, `--border-width`, `--radius-lg`, `--size-control-md`. They come in through the existing classes (`.btn`, `.card`, `.alert`, `.field-hint`, `.radio`, `.spinner`, `.cluster`, `.stack`), so the only new CSS is the `.actions` flex rule (tokens only). Components reused from the catalogue and codebase: `Toast`, `Overlay`, `AccessRemovedModal`, `LinkUnavailable` and the extracted `ItineraryDocument` (formerly the private `Document`). The catalogue components `FallbackNotice`, `CompareTable` and the rest are not needed, except that `BookingsTable` keeps using `CompareTable` unchanged. The prototype mentions `FallbackNotice` for the local-inbox note, but the hint text in `ItineraryActions` covers it. The prototype's `ItineraryDocument` and `ItineraryActions` are the only new components.

  ### Shape of the change

  ```mermaid
  flowchart TD
    TDP[TripDetailPage.tsx]:::touched -->|renders actions row| IA[ItineraryActions.tsx]:::touched
    IP[ItineraryPage.tsx]:::touched -->|foot actions, print=1| IA
    IP --> ID[ItineraryDocument.tsx]:::touched
    STP[SharedTripPage.tsx]:::touched -->|readOnly document| ID
    STM[ShareTripModal.tsx]:::touched -->|setShareItinerary PUT| API[trips/api.ts]:::touched
    IA -->|emailItinerary POST| API
    STP -->|fetchSharedTrip| API
    LIP[LocalInboxPage.tsx]:::touched -->|GET /local/inbox| LI[routers/local_inbox.py]:::touched
    API --> RT[routers/trips.py]:::touched
    API --> RI[routers/itinerary.py]:::touched
    API --> RS[routers/shared.py]:::touched
    RT -->|PUT share-link, reset on revoke| ST[trips/store.py Trip]:::touched
    RS -->|build + redact when on| BI[trips/itinerary.py build_itinerary]
    RI --> BI
    RI --> HTML[trips/itinerary_html.py]:::touched
    RS --> HTML
    RI -->|send_html| INV[trips/invites.py]:::touched
    INV --> PIS[trips/local_inbox_store.py]:::touched
    LI --> PIS
    classDef touched fill:#f96,color:#000
  ```

  Orange nodes are changed or new. `build_itinerary` is untouched context. `deps.get_invite_sender` already picks the SES sender or the local inbox and needs no change.

  ### Order of work (TDD)

  1. API: write the failing tests for the `share_itinerary` field and the PUT route, then `/shared` gating and redaction, then `render_itinerary_html` and the email route (AC4 to AC10), then make them pass.
  2. Web: write the failing tests for `ItineraryActions` (AC1 to AC6), `SharedTripPage` (AC7 to AC11), `ShareTripModal` and the inbox page. Extract `ItineraryDocument` first with the existing `ItineraryPage` tests as a safety net, then build the rest.
  3. Update the old `SharedTripPage` and shared-route tests, and the old `ItineraryPage` "Print" test, to the new behaviour.

  Narrow test commands (derived from the project command):
  `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_itinerary_email.py tests/unit/test_shared_itinerary.py tests/e2e/test_share_link_e2e.py)` and
  `(cd apps/web && pnpm run test -- src/trips/ItineraryActions.test.tsx src/trips/SharedTripPage.test.tsx src/trips/ShareTripModal.test.tsx src/trips/ItineraryPage.test.tsx src/local/LocalInboxPage.test.tsx)`.
review_focus: |
  IN: the three actions, the email route and HTML renderer, the owner on/off switch (default off), the gated `/shared` payload and the shared page. OUT: server-side PDF, rate limits, monitoring, and any change to how the money or essentials sections are built. Riskiest parts: the privacy of the shared payload (nothing from the itinerary may leave the server when off, and provider links and the owner's profile-based facts must stay out) and the AC11 merge in `SharedTripPage` (an open page keeps its itinerary on switch-off but still reacts to a revoked link). Deliberate choices: existing share links now start off, the old `SharedTrip` fields are removed, `NoInviteSender.send_html` raises so a copy is never reported as sent when it was not, the local inbox renders the HTML in a sandboxed iframe, and the prototype's share settings screen is built inside the existing `ShareTripModal`.
