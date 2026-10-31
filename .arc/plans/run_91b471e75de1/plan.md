summary: |
  Add three itinerary actions to the trip page (View itinerary, Print or Save as PDF, Email me a copy), an owner-only
  on/off switch (off by default) for showing the complete itinerary on the read-only share link, and a shared view that
  renders that same document with no edit links. The emailed copy and the shared page carry the complete document,
  including the money and inclusions and travel essentials sections that stories 113 and 114 already put in
  `build_itinerary`. Backend: a new server-owned `share_itinerary` flag on the Trip, a route to set it, the shared
  endpoint returning a redacted `Itinerary` only when the flag is on, and an email-me-a-copy route that renders the
  itinerary to HTML and sends it through the existing email seam (SES live, local inbox in local mode). Web: extract the
  `Document` from `ItineraryPage` into a reusable read-only-capable component, add an `ItineraryActions` row, extend
  `ShareTripModal` with the On/Off setting, and change `SharedTripPage` to show the document or a "not shared" note.

scope:
  - description: |
      Server-owned `share_itinerary: bool = False` on `Trip`, and a new owner-only route
      `PUT /trips/{trip_id}/share-link/itinerary` with body `{"show": bool}` returning the `TripView`.
      It 404s with the missing-trip answer for non-owners (use `_owned_trip`), and 409 `no_share_link` when the trip has
      no share link yet. `revoke_share_link` also resets the flag to False so a re-created link starts Off again (AC 9).
      `TripView` exposes `share_itinerary` (owner only; editors always get False).
      ```python
      class ShowItinerary(BaseModel):
          show: bool

      @router.put("/{trip_id}/share-link/itinerary")
      def set_share_itinerary(trip_id: str, body: ShowItinerary, owner: str = Depends(get_current_user), ...) -> TripView: ...
      ```
    files:
      - services/api/app/trips/store.py
      - services/api/app/routers/trips.py
    rationale: |
      The flag lives on the Trip item beside `share_token` because the Trip item, not the index, decides access
      (see the comment in `read_shared_trip`). A default of False means every trip already stored loads unchanged.

  - description: |
      Shared endpoint returns the complete document only when the flag is on. `SharedTrip` gains
      `itinerary_shared: bool = False` and `itinerary: Itinerary | None = None`. When off, `itinerary` is None AND the
      day, option, activity and restaurant lists are returned empty, so nothing of the plan leaks (AC 9, 10). When on,
      build it with `build_itinerary(trip, None, visa_rules, today, rates)`: the owner's private profile is never
      passed, same rule the editor path in `routers/itinerary.py` follows. A new `redact_for_share(itinerary)` in
      `trips/itinerary.py` strips everything that links back into editing or booking: `NotIncludedItem.add_path`
      to None, `BookingRow.link_url` to None, booking `ItineraryItem.link_url`/`link_text` to None (the existing shared
      view already drops `booking_url`); the external visa source link on an `EssentialFact` is kept (AC 8).
      ```python
      def redact_for_share(itinerary: Itinerary) -> Itinerary: ...
      ```
    files:
      - services/api/app/routers/shared.py
      - services/api/app/trips/itinerary.py
    rationale: |
      Reuses `build_itinerary` so the shared page, trip page and email are the same document (the design's "one
      component set reused on all three surfaces"). The 404 for a revoked token is unchanged.

  - description: |
      Email me a copy. New `POST /trips/{trip_id}/itinerary/email` (owner or accepted editor, via `_load`) builds the
      itinerary exactly as `get_itinerary` does, renders it to a complete HTML document and sends it to
      `identity.email_for(user)`. Answers 204 on success and `ApiError(502, "email_failed")` when the sender raises or
      when no real sender is configured (never a silent success).
      - New `app/trips/itinerary_email.py` with `render_itinerary_html(itinerary: Itinerary) -> str`: server-rendered, inline
        styles only, HTML-escaped values, every section of the document (days, still to schedule, money and
        inclusions, travel essentials, before you go, notes). No edit or add links.
      - `InviteSender` protocol gains `send_itinerary(self, email: str, trip_name: str, html: str) -> None`.
        `SesInviteSender` sends it with `Message.Body.Html`; `NoInviteSender` raises; `InMemoryInviteSender` records it as
        kind `itinerary` with the HTML body under a unique pseudo link (`itinerary:<uuid>`).
      - `PersistentInviteSender` stores an optional `html` per message in `inbox.json`; loading a file without it still
        works (format version stays 1).
      - `local_inbox.py`: add `itinerary` subject and kind, check `kinds` before the `trip_name` test (an itinerary has
        a trip name but is not an invite), and return `html` for itinerary messages.
    files:
      - services/api/app/routers/itinerary.py
      - services/api/app/trips/itinerary_email.py
      - services/api/app/trips/invites.py
      - services/api/app/trips/local_inbox_store.py
      - services/api/app/routers/local_inbox.py
    rationale: |
      ADR-0010 makes email delivery an outbound integration; `get_invite_sender` already picks SES or the local inbox, so
      the new send goes through the same seam and local mode needs no new infrastructure.

  - description: |
      Web: extract `Document` (and `MoneySections`, `FactCard`, `ItemRows`) from `ItineraryPage.tsx` into
      `ItineraryDocument.tsx` with a `readOnly?: boolean` prop. When `readOnly`, the `Add to plan` link, the
      `Explore options` button in the empty bookings state and `Link`-based edit paths are not rendered. `ItineraryPage`
      imports it, shows a `Back to trip` link (ArrowLeftIcon, as in the prototype's Full itinerary screen) and replaces
      the floating `print-fab` with the `ItineraryActions` row at the foot. It also calls `window.print()` once when the
      URL has `?print=1`.
    files:
      - apps/web/src/trips/ItineraryDocument.tsx
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/trips/ItineraryPage.test.tsx
    rationale: |
      The prototype notes "ItineraryDocument (days + money and inclusions + travel essentials)" as one component reused
      on the trip, itinerary and shared surfaces. Extraction keeps the already-built sections (stories 112 to 114) in one place.

  - description: |
      New `ItineraryActions` component: a `.cluster.actions` group with `role="group"` and
      `aria-label="Itinerary actions"`. `View itinerary` is a `Link` styled `.btn.btn-primary` with `EyeIcon` (to
      `/trips/:id/itinerary`); `Print or Save as PDF` is `.btn-secondary` (on the trip page it links to
      `/trips/:id/itinerary?print=1`, on the itinerary page it calls `window.print()`); `Email me a copy` is
      `.btn-secondary`. Props let the itinerary page hide `View itinerary`.
      Email behaviour: a `useRef` in-flight flag makes a second press a no-op before any state update (AC 6). While
      sending the button is `aria-disabled="true"` `aria-busy="true"`, shows `.spinner` and reads `Sending copy…`
      (not the `disabled` attribute, matching the prototype). Success shows a `.toast`
      (`Copy sent to <email>. Check your inbox.`). Failure shows `.alert.alert-danger role="alert"` with
      `The email could not be sent.` and `Nothing arrived in your inbox. Try again in a moment.`; the button is usable again as the retry (AC 5).
      The hint under the row is a `.field-hint` (`The full itinerary arrives as HTML at <email>. In local mode it lands in the local inbox.`).
      A new `emailItinerary(tripId)` in `api.ts` does the POST.
    files:
      - apps/web/src/trips/ItineraryActions.tsx
      - apps/web/src/trips/ItineraryActions.test.tsx
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/index.css
    rationale: |
      Prototype screens "Trip page", "Trip page, email sending", "Trip page, email failed" and "Full itinerary" all use the
      same action row. Tokens used (already loaded via `@import "../../../design-system/tokens.css"`, apps/web/src/index.css:2):
      `--space-2`, `--space-3`, `--color-fg-muted`, `--color-danger`, `--color-danger-subtle`, `--size-control-md`,
      `--size-spinner`, `--font-size-sm`. Existing `.btn`, `.cluster`, `.alert`, `.spinner`, `.field-hint` and `.toast`
      classes are reused; on a phone each button grows to fill the row (`flex: 1 1 auto`) and from 48rem the
      buttons size to content, as in the prototype's `.actions` rule. In `TripDetailPage` the row goes under the title
      block, above the tabs; its `View itinerary` is the primary of that section while `Book trip` stays in the title block.

  - description: |
      Owner switch. `ShareTripModal` (when a link exists) gets a `fieldset` with legend `Show itinerary on share link`
      and two `.radio` options, `On` and `Off`, each with the prototype's hint text, plus the note `Switching off applies to new
      visits. Pages already open keep what they loaded until they reload.` and a `Save` `.btn-primary` that calls the new
      `setShareItinerary(tripId, show)` and reports through `onChanged(trip, message)` with the toast text
      `Saved. The share link now shows the full itinerary.` or `Saved. The share link hides the itinerary.`. The
      selection starts from `trip.share_itinerary` (false for a new link). `Trip` in `api.ts` gains `share_itinerary?: boolean`.
    files:
      - apps/web/src/trips/ShareTripModal.tsx
      - apps/web/src/trips/ShareTripModal.test.tsx
      - apps/web/src/trips/api.ts
    rationale: |
      Prototype screen "Share settings". Tokens: `--space-2`, `--size-check`, `--color-primary` (selection only),
      existing `.field`, `.radio`, `.check` and `.field-hint`.

  - description: |
      `SharedTripPage` renders by flag. On: `Read-only` badge, then `ItineraryDocument` with `readOnly` and the served
      `itinerary` (money and inclusions and travel essentials included), no edit links (AC 7, 8). Off or never on: the
      name and an `.alert.alert-info` with `The itinerary isn’t shared.` and `Ask the trip owner if you’d like to see the
      day-by-day plan.`, with `ItineraryTab` no longer rendered (AC 9, 10). The existing 30 s and on-focus recheck keeps
      detecting a revoked link (404 gives the existing `AccessRemovedModal`) but a recheck that comes back with the
      itinerary switched off must NOT replace what the visitor already has: keep the previous `trip` when
      `previous.itinerary_shared && !next.itinerary_shared` (AC 11). `fetchSharedTrip` returns `SharedTrip`
      (`Trip` fields plus `itinerary_shared`, `itinerary`).
    files:
      - apps/web/src/trips/SharedTripPage.tsx
      - apps/web/src/trips/SharedTripPage.test.tsx
      - apps/web/src/trips/api.ts
    rationale: |
      Prototype screens "Shared page, itinerary on", "itinerary off" and "open after owner switched off". This
      deliberately changes today's behaviour, where a share link always shows the day plan.

  - description: |
      Local inbox shows the emailed copy. `LocalInboxPage` adds the `itinerary` kind: badge `Itinerary`, and the opened
      email renders the HTML in a sandboxed `iframe` (`sandbox=""`, `srcDoc={message.html}`, `title`) inside the existing
      `mail-sheet`, keeping the existing `Pretend email` alert. The `Message` type gains `html?: string`.
    files:
      - apps/web/src/local/LocalInboxPage.tsx
      - apps/web/src/local/LocalInboxPage.test.tsx
    rationale: |
      AC 4 says the copy arrives in the local inbox in local mode, and that page only knows link-style messages.

tests:
  - |
    AC 1, 2, 3 (ItineraryActions.test.tsx and TripDetailPage): the three actions appear in one labelled group.
    ```tsx
    render(<ItineraryActions tripId="t1" email="maya@example.com" />)
    const group = screen.getByRole('group', { name: 'Itinerary actions' })
    expect(within(group).getByRole('link', { name: 'View itinerary' })).toHaveAttribute('href', '/trips/t1/itinerary')
    expect(within(group).getByRole('link', { name: 'Print or Save as PDF' })).toHaveAttribute('href', '/trips/t1/itinerary?print=1')
    expect(within(group).getByRole('button', { name: 'Email me a copy' })).toBeInTheDocument()
    ```
    Plus a TripDetailPage test that the same group renders for an owner and for an accepted editor.
  - |
    AC 4 (API, tests/unit/test_itinerary_email_router.py): pressing Email sends the complete HTML to the traveller.
    ```python
    r = client.post(f"/trips/{tid}/itinerary/email")
    assert r.status_code == 204
    to, trip_name, link = local_inbox.sent[-1]
    assert to == "owner@example.com"
    html = local_inbox.bodies[link]
    for heading in ("Cost summary", "Included", "Travel essentials", "Day by day"):
        assert heading in html
    ```
    Also `render_itinerary_html` unit test in tests/unit/test_itinerary_email.py: a trip name of `<script>` is escaped
    (`assert "<script>" not in html`) and `assert "href=" not in html` for the add-to-plan paths. And a LocalInboxPage
    test that an `itinerary` message opens an `iframe` with the HTML in `srcdoc`.
  - |
    AC 5 (API and web): a failing sender gives 502 and the page shows the alert.
    ```python
    app.dependency_overrides[get_invite_sender] = lambda: RaisingSender()
    assert client.post(f"/trips/{tid}/itinerary/email").status_code == 502
    ```
    ```tsx
    mockEmail.mockRejectedValue(new Error('x'))
    await user.click(screen.getByRole('button', { name: 'Email me a copy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The email could not be sent.')
    expect(screen.getByRole('button', { name: 'Email me a copy' })).not.toHaveAttribute('aria-disabled')
    ```
    Also `NoInviteSender` (no `INVITE_FROM_ADDRESS`) yields 502, not a false success.
  - |
    AC 6 (ItineraryActions.test.tsx): a second press during a pending send does not call the API.
    ```tsx
    let release!: () => void
    mockEmail.mockReturnValue(new Promise<void>((r) => (release = r)))
    const btn = screen.getByRole('button', { name: 'Email me a copy' })
    await user.click(btn)
    expect(btn).toHaveAttribute('aria-disabled', 'true')
    await user.click(btn)
    expect(mockEmail).toHaveBeenCalledTimes(1)
    release()
    ```
  - |
    AC 7 (API test_shared_itinerary.py and SharedTripPage.test.tsx): with the flag on, the shared payload carries the
    complete document.
    ```python
    owner.put(f"/trips/{tid}/share-link/itinerary", json={"show": True})
    body = anon.get(f"/shared/{token}").json()
    assert body["itinerary_shared"] is True
    assert body["itinerary"]["money"]["cost"]["total"] is not None
    assert body["itinerary"]["essentials"]
    ```
    ```tsx
    expect(await screen.findByRole('heading', { name: 'Travel essentials' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cost summary' })).toBeInTheDocument()
    ```
  - |
    AC 8 (API and web): the shared document has no edit or booking links and never uses the owner's private profile.
    ```python
    assert all(n["add_path"] is None for n in body["itinerary"]["money"]["not_included"])
    assert all(b["link_url"] is None for b in body["itinerary"]["money"]["bookings"])
    ```
    ```tsx
    expect(screen.queryByRole('link', { name: /Add to plan|Edit/ })).not.toBeInTheDocument()
    ```
    Existing `test_editor_never_sees_the_owners_private_profile_answers` is mirrored for the shared payload.
  - |
    AC 9 (API and web): a link that was never switched on shows no itinerary.
    ```python
    token = owner.post(f"/trips/{tid}/share-link").json()["share_url"].rsplit("/", 1)[1]
    body = anon.get(f"/shared/{token}").json()
    assert body["itinerary_shared"] is False and body["itinerary"] is None
    assert body["days"] == [] and body["activities"] == []
    ```
    ```tsx
    expect(await screen.findByText('The itinerary isn’t shared.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Day by day' })).not.toBeInTheDocument()
    ```
    Plus: a Trip stored before this change (no `share_itinerary` key) loads with `share_itinerary is False` in both the
    in-memory and local file stores, and the ShareTripModal shows `Off` checked for a new link.
  - |
    AC 10 (API and ShareTripModal.test.tsx): switching off hides it again, and revoking resets the switch.
    ```python
    owner.put(f"/trips/{tid}/share-link/itinerary", json={"show": False})
    assert anon.get(f"/shared/{token}").json()["itinerary"] is None
    owner.delete(f"/trips/{tid}/share-link"); owner.post(f"/trips/{tid}/share-link")
    assert owner.get(f"/trips/{tid}").json()["share_itinerary"] is False
    ```
    ```tsx
    await user.click(screen.getByRole('radio', { name: /Off/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(mockSetShareItinerary).toHaveBeenCalledWith('t1', false)
    ```
    Also: an editor or stranger calling the PUT gets the missing-trip 404, and PUT without a link gets 409.
  - |
    AC 11 (SharedTripPage.test.tsx, fake timers): an open page keeps the itinerary after the owner switches it off.
    ```tsx
    fetchShared.mockResolvedValueOnce(sharedOn).mockResolvedValue({ ...sharedOn, itinerary_shared: false, itinerary: null })
    render(<SharedTripPage />)
    await screen.findByRole('heading', { name: 'Travel essentials' })
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(screen.getByRole('heading', { name: 'Travel essentials' })).toBeInTheDocument()
    expect(screen.queryByText('The itinerary isn’t shared.')).not.toBeInTheDocument()
    ```
    The existing revoked-link test (404 shows `AccessRemovedModal`) must keep passing.
  - |
    Playwright (apps/web/e2e/share-link.spec.ts, extend): owner creates a link, itinerary Off, anonymous context sees
    `The itinerary isn’t shared.`; owner switches On and Saves, a fresh anonymous load shows `Cost summary` and no
    `Edit` link; owner presses `Email me a copy` and the local inbox page lists an `Itinerary` email.

assumptions_or_open_questions:
  - |
    The trip has no summary field (checked `TripFields` in store.py), so the prototype's trip summary paragraph is not built. The off-state shared page shows the name and the "isn't shared" alert only, and the trip page keeps its existing header.
  - |
    Design vs. code conflict: the prototype's "Share settings" is a full page with the link input, radios and Save. The real owner share UI is the `ShareTripModal` overlay opened from `Share trip`, so the switch is added there instead of a new route. UI guidelines say modals are for confirmations, so a reviewer may prefer a page; say so if so.
  - |
    Behaviour change: today every share link shows the day plan. After this story a link shows nothing of the plan until the owner switches it on, so existing links turn Off. This follows AC 9 ("never had the itinerary switched on") and the Off default. Owners who relied on the old behaviour must switch it on. Confirm this is intended.
  - |
    The shared document uses `build_itinerary` with no owner profile, so the shared essentials are the generic facts, not ones built from the owner's citizenship, vaccinations or pregnancy answers. Booking links and add-to-plan paths are also stripped on the shared view. This is my reading of "no edit links" plus the privacy rule already applied to editors. Confirm.
  - |
    AC 6 is enforced in the browser (an in-flight ref, `aria-disabled`). The server does not de-duplicate, so two tabs or a scripted client could still send two copies. A server-side guard would need shared state across Lambda instances; not planned.
  - |
    Email HTML cannot use CSS custom properties. The rendered email uses inline styles with the resolved values of the tokens in design-system/tokens.css, kept in one dict in `itinerary_email.py`. This is the only place raw colour values appear and they are copied from the token file. Confirm this is acceptable.
  - |
    With live email on but `INVITE_FROM_ADDRESS` unset, `NoInviteSender` would silently drop mail, so `send_itinerary` raises and the traveller sees the error alert. SES also needs a verified sender for HTML mail; this uses the existing invite sender address.
  - |
    Deferred project question (TRAVEL-PLANNER-APP-CHORE-111): how many itinerary builds and emails per trip or user the system should be sized for, and whether failures are monitored. Not answerable from the code. This plan builds on demand with no rate limit and logs a failed send with `logger.exception` as the invite path does. Rate limiting and failure monitoring are out of scope until that is answered.
  - |
    "Print or Save as PDF" on the trip page navigates to the itinerary with `?print=1` and opens the browser print dialog there (the prototype only shows a toast). The itinerary page has print styles from story 112; I did not re-check them beyond reading `ItineraryPage.tsx`.

estimated_points: 8

package_dependencies: []

notes: |
  ### Data & rollout

  - **Existing data**: no migration. `Trip` gains `share_itinerary: bool = False`; trips already stored without the key load with the default through pydantic in both the DynamoDB-backed and local file stores, so no row becomes unreadable. Existing share links are therefore Off, which hides the day plan on them (see the open question on this behaviour change). `inbox.json` gains an optional `html` per message; old files load because the field is read with a default, and `INBOX_FORMAT_VERSION` stays 1.
  - **Backfill / seed**: none needed.
  - **Settings**: no new setting or env var. Email reuses `INVITE_FROM_ADDRESS` and `get_settings().is_live("email")`.
  - **Provisioning**: live email needs the SES sender already used for invites to be allowed to send HTML mail; nothing new is created. Local mode needs nothing.
  - **Order and rollback**: deploy API first, then web. An old web build against the new API ignores the new fields (and its shared page would show an empty plan for Off links). Rolling back the API leaves a harmless extra `share_itinerary` attribute on stored trips that the old model ignores.

  ### Design and tokens
  Read in full: the approved prototype (screens Trip page, email sending, email failed, Full itinerary, Share settings, Shared page on/off/open-after-off). Tokens load once in apps/web/src/index.css:2 (`@import "../../../design-system/tokens.css"`); no new token loading is needed. The prototype's documents are simplified (Days, Money, Essentials); the real `Document` has more sections and is kept as is, since the ACs ask for the complete document. Components reused from the catalogue: `FallbackNotice` pattern is not needed; `ImageHero`, `BrandLogo` and `CompareTable` stay inside `ItineraryDocument`. New components: `ItineraryDocument` (an extraction) and `ItineraryActions`, both named in the prototype's design plan.

  ```mermaid
  flowchart TD
    TD[TripDetailPage.tsx] --> IA[ItineraryActions.tsx]
    IP[ItineraryPage.tsx] --> IA
    IP --> ID[ItineraryDocument.tsx]
    STP[SharedTripPage.tsx] --> ID
    STM[ShareTripModal.tsx] --> API[api.ts]
    IA --> API
    STP --> API
    API --> RI[routers/itinerary.py]
    API --> RS[routers/shared.py]
    API --> RT[routers/trips.py]
    RI --> BI[trips/itinerary.py build_itinerary]
    RS --> BI
    RI --> EM[trips/itinerary_email.py]
    RI --> INV[trips/invites.py]
    INV --> LIS[trips/local_inbox_store.py]
    LIS --> LIR[routers/local_inbox.py]
    LIR --> LIP[LocalInboxPage.tsx]
    RT --> ST[trips/store.py Trip]
    RS --> ST
    classDef touched fill:#f96,color:#000
    class TD,IA,IP,ID,STP,STM,API,RI,RS,RT,BI,EM,INV,LIS,LIR,LIP,ST touched
  ```
  Why touched: `store.py` and `routers/trips.py` hold the new flag and its route; `shared.py` and `trips/itinerary.py` serve and redact the document; `routers/itinerary.py`, `itinerary_email.py`, `invites.py`, `local_inbox_store.py` and `local_inbox.py` send and record the email; the web files show the actions, the switch and the shared view.

  TDD order: backend flag and route, shared payload, redaction, email renderer and sender, email route; then web `api.ts`, `ItineraryDocument` extraction (behaviour-preserving, existing ItineraryPage tests stay green), `ItineraryActions`, `ShareTripModal`, `SharedTripPage`, `LocalInboxPage`, then the e2e spec. Narrow test commands: `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_shared_itinerary.py)` and `(cd apps/web && pnpm run test -- src/trips/ItineraryActions.test.tsx)`.

review_focus: |
  IN: the flag and route, the redacted shared document, the email route and its local-inbox rendering, the actions row, the owner switch and the shared page states. OUT: rate limiting or monitoring of builds and emails (deferred question), server-side de-duplication of sends, any new page for share settings. Riskiest areas: the shared payload must leak nothing of the plan when Off, and must never use the owner's private profile or edit/booking links when On; and the AC 11 recheck logic in `SharedTripPage` must keep the open itinerary while still detecting a revoked link. Deliberate and easy to flag by mistake: existing share links now start Off, `NoInviteSender` raises for itinerary mail, and the email HTML uses resolved token values inline.
