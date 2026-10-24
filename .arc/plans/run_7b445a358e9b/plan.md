summary: |
  Let a trip's owner create and turn off a read-only share link. The API gains an unguessable share token stored on the Trip item (with a `SHARE#<token>` index record, mirroring how editor invites are looked up), owner-only create/revoke routes, and one public, unauthenticated `GET /shared/{token}` that returns an itinerary-only view (no editors, reminders, travellers, budget, cost or booking URLs) and answers the same 404 for an unknown or turned-off token. The web app gains a Share trip modal for the owner (no link / link created states), a public `/trips/read-only/:token` viewer page (Read-only badge, day cards, no controls, polls so a live viewer sees "Access removed" when the owner turns the link off), and a "Link no longer available" page. Share is only offered to the owner, so a signed-in non-owner never sees it. Built to the approved prototype; TDD order, API first.
scope:
  - description: |
      Store: add the share token to the Trip and an index record to find a trip from a token, mirroring Invite.

      ```python
      class Trip(TripFields):
          ...
          share_token: str | None = None  # server-owned: changed only through the share-link routes

      class ShareLink(BaseModel):
          """Index record that finds the trip behind a read-only link."""
          token: str
          owner_id: str
          trip_id: str

      # TripStore protocol, InMemoryTripStore and DynamoTripStore (pk "SHARE#<token>", sk "SHARE")
      def save_share_link(self, link: ShareLink) -> None: ...
      def get_share_link(self, token: str) -> ShareLink | None: ...
      def delete_share_link(self, token: str) -> None: ...
      ```
    files:
      - services/api/app/trips/store.py
      - services/api/tests/unit/test_trip_store.py
    rationale: |
      The Trip item stays the authority on access (as with editors); the index only locates it. DynamoTripStore.save_trip already drops None values, so a revoked token removes the attribute, and old Trip items without it still validate (default None).
  - description: |
      Routes in the trips router, owner only through `_owned_trip` (404 stranger, 403 editor, like the editor routes), plus a new public router.

      ```python
      @router.post("/{trip_id}/share-link", status_code=201)
      def create_share_link(trip_id: str, ...) -> TripView: ...   # idempotent: reuses an existing token
      @router.delete("/{trip_id}/share-link")
      def revoke_share_link(trip_id: str, ...) -> TripView: ...   # save Trip first, then delete the index
      ```

      `TripView` gains `share_url: str | None = None` (relative, `/trips/read-only/<token>`, owner only) and `_view` blanks `share_token` for everyone, so editors and the list endpoint never carry the token (also set `share_token=None` in the `list_trips` shared-trip copy). `delete_trip` also deletes the share index.

      New `services/api/app/routers/shared.py`, registered in `main.py`:

      ```python
      router = APIRouter(prefix="/shared")
      class SharedOption(BaseModel):  # title, category, date, price, currency  (no booking_url)
      class SharedTrip(BaseModel):    # name, destination, start_date, end_date, currency, days, options, activities, is_owner=False, can_edit=False
      @router.get("/{token}")
      def read_shared_trip(token: str, response: Response, trips: TripStore = Depends(get_trips)) -> SharedTrip: ...
      ```

      No `get_current_user`. 404 `{"code": "not_found"}` when the index is missing, the trip is gone, or `trip.share_token != token`. Sets `Cache-Control: no-store`.
    files:
      - services/api/app/routers/trips.py
      - services/api/app/routers/shared.py
      - services/api/app/main.py
      - services/api/tests/unit/test_share_link_router.py
      - services/api/tests/e2e/test_share_link_e2e.py
    rationale: |
      The public view is a separate allow-list model rather than `TripView`, so a field added to Trip later is private by default. Reminders, travellers, budget, cost and booking URLs are left out: the design's viewer shows only title and day cards with option name, category and price.
  - description: |
      Web API client: types and calls. `Trip` gains `share_url?: string | null`. New `SharedTrip` type and calls.

      ```ts
      export const createShareLink = (tripId: string) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/share-link`, 'POST')
      export const revokeShareLink = (tripId: string) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/share-link`, 'DELETE')
      export const fetchSharedTrip = (token: string) =>
        call<Trip>(`/shared/${encodeURIComponent(token)}`)
      ```
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      `fetchSharedTrip` returns the `Trip` shape (is_owner and can_edit both false) so the existing ItineraryTab renders it without a second component. The existing TRIP_WRITE_REFUSED dispatch only fires for non-GET calls on `/trips/`, so a revoke 404 is unaffected for the viewer.
  - description: |
      Share trip modal for the owner (prototype screens "Share trip (no link)" and "Share trip (link created)"). Built on the existing `Overlay` (`kind="modal"`, `role="dialog"`, `labelledBy`), heading `h2` "Share trip" with a ghost icon Close button (`XIcon`, aria-label "Close").

      - No link: text "Anyone with a read-only link can view the itinerary. They cannot change it." and one `btn btn-primary` "Create read-only link"; pending label "Creating link".
      - Link created: `.field` with label "Read-only link", readonly `.input` showing `window.location.origin + trip.share_url`, `.field-hint` "Viewers can see the itinerary but cannot change it."; `btn btn-secondary` "Copy link" (clipboard, then toast "Link copied."); `.field-hint` "Turning the link off stops it working straight away, including for anyone who has the trip open."; `btn btn-secondary` "Turn off link" (pending "Turning off link"), then back to the no-link state with toast "Link turned off.". Create success toast "Read-only link created.". Failures show `.field-error` role alert, for example "We couldn't create that link. Try again."

      `TripDetailPage` gets a `{ id: 'share' }` panel and an owner-only `btn btn-secondary` "Share trip" in the title row beside "Edit trip" (`trip.is_owner &&`), and the modal is rendered only when `trip.is_owner`.
    files:
      - apps/web/src/trips/ShareTripModal.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/ShareTripModal.test.tsx
      - apps/web/src/trips/TripDetailPage.test.tsx
    rationale: |
      Prototype conflict, stated plainly: the design puts the Share button "in the shell header, which the shell has no place for" and stands in a prototype-only button. The real shell (AppHeader) has no trip actions either, so the button goes in the trip title row next to Edit trip, which is where owner-only actions already live. "Turn off link" is `btn-secondary` as drawn (not `btn-danger`), because the guideline reserves danger for irreversible actions and a new link can be created.
  - description: |
      Public viewer page and unavailable page, routed outside `RequireAuth`.

      `SharedTripPage` (route `/trips/read-only/:token`):
      - Loading: `.skeleton` lines.
      - Ready: `.badge badge-neutral` with `EyeIcon` and text "Read-only" as the first element, `h1` trip name, then `ItineraryTab` with no-op callbacks. No tabs, no Book trip, no Share, no add/move/remove/rename/reminder controls (ItineraryTab already hides them when `can_edit` is falsy).
      - Re-fetch on window focus and every 30 s (same REFRESH_MS pattern as TripDetailPage). A 404 after a successful load shows `AccessRemovedModal` with the viewer text "The owner has turned off this read-only link." and button "Close"; Close switches the page to the unavailable view.
      - A 404 on first load renders `LinkUnavailable` and never the itinerary or trip name.

      `LinkUnavailable`: `role="alert"` block, centred (`.stack stack-sm`, max-width 36rem), `AlertIcon`, `h1` "Link no longer available", text "This read-only link is no longer available. Ask the trip owner for a new link."

      `AccessRemovedModal` gains optional props, defaulting to today's copy so the editor tests are unchanged:

      ```tsx
      { onOk: () => void; text?: string; action?: string }  // defaults: editor text, "OK"
      ```
      `App.tsx` adds `<Route path="/trips/read-only/:token" element={<SharedTripPage />} />` with no RequireAuth, and the comment above the routes is updated to name it as the second exemption.
    files:
      - apps/web/src/trips/SharedTripPage.tsx
      - apps/web/src/trips/LinkUnavailable.tsx
      - apps/web/src/trips/AccessRemovedModal.tsx
      - apps/web/src/App.tsx
      - apps/web/src/trips/SharedTripPage.test.tsx
      - apps/web/e2e/share-link.spec.ts
    rationale: |
      React Router ranks the static `read-only` segment above `/trips/:tripId`, and the path has three segments, so the two routes cannot clash. Reusing ItineraryTab keeps the viewer identical to what the owner sees, as the design marks the day stacks "reused from 060". The 404 on a turned-off link carries no trip data, which is what AC5 needs.
tests:
  - |
    AC1 (API, written first, fails with 404 route missing). File services/api/tests/unit/test_share_link_router.py.

    ```python
    def test_owner_creates_a_read_only_link(sign_in_as):
        owner = sign_in_as("o@example.com")
        tid = owner.post("/trips", json={"name": "Lisbon"}).json()["id"]
        r = owner.post(f"/trips/{tid}/share-link")
        assert r.status_code == 201
        assert r.json()["share_url"].startswith("/trips/read-only/")
        assert owner.post(f"/trips/{tid}/share-link").json()["share_url"] == r.json()["share_url"]
    ```
  - |
    AC1 (web). ShareTripModal.test.tsx, using `stubApi` and `renderAt('/trips/t1')`: click "Share trip", click "Create read-only link", then

    ```ts
    expect(await screen.findByLabelText('Read-only link')).toHaveValue(`${window.location.origin}/trips/read-only/k7Qm2xVd9`)
    expect(screen.getByRole('button', { name: 'Turn off link' })).toBeInTheDocument()
    ```
  - |
    AC2 (API). A visitor with no cookie reads the itinerary.

    ```python
    def test_visitor_without_an_account_reads_the_itinerary(sign_in_as):
        ...
        visitor = TestClient(app)  # no session cookie
        r = visitor.get(share_url.replace("/trips/read-only/", "/shared/"))
        assert r.status_code == 200
        assert r.json()["name"] == "Lisbon" and len(r.json()["days"]) == 2
        assert r.headers["cache-control"] == "no-store"
    ```
  - |
    AC2 (web). SharedTripPage.test.tsx with `stubApi({...}, { signedOut: true })` and `renderAt('/trips/read-only/k7Qm2xVd9')`:

    ```ts
    expect(await screen.findByRole('heading', { level: 1, name: 'Lisbon trip' })).toBeInTheDocument()
    expect(screen.getByText('Hotel Avenida, 2 nights')).toBeInTheDocument()
    ```
    Also an assertion that the page does not redirect to `/sign-in`.
  - |
    AC3 (API privacy). The public body is an allow-list.

    ```python
    body = visitor.get(f"/shared/{token}").json()
    assert not {"editors", "reminders", "travellers", "budget", "cost", "share_token", "share_url"} & body.keys()
    assert all("booking_url" not in o for o in body["options"])
    ```
  - |
    AC3 (web). On the viewer page no control to change the plan is shown:

    ```ts
    expect(screen.getByText('Read-only')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    ```
    The only buttons allowed are none; if the shell adds a Menu or Sign in control, scope the query to `main`.
  - |
    AC3 (API, no write access through the link). The token is not a credential on any trip route.

    ```python
    assert visitor.post(f"/trips/{tid}/activities", json={"name": "x", "date": "2027-03-04"}).status_code == 401
    assert visitor.get(f"/trips/{tid}").status_code == 401
    ```
  - |
    AC4 and AC5 (API). After "Turn off link" the old URL answers the same 404 as a token that never existed, with no trip data.

    ```python
    assert owner.delete(f"/trips/{tid}/share-link").status_code == 200
    r = visitor.get(f"/shared/{token}")
    assert (r.status_code, r.json()) == (404, {"code": "not_found"})
    assert visitor.get("/shared/never-issued").json() == r.json()
    ```
    Plus: a new link after revoking has a different token and the old one stays dead; deleting the trip kills the link.
  - |
    AC4 and AC5 (web). `stubApi({'GET /shared/dead': { status: 404 }}, { signedOut: true })`, `renderAt('/trips/read-only/dead')`:

    ```ts
    expect(await screen.findByRole('heading', { name: 'Link no longer available' })).toBeInTheDocument()
    expect(screen.getByText(/no longer available\. Ask the trip owner for a new link/)).toBeInTheDocument()
    expect(screen.queryByText('Lisbon trip')).not.toBeInTheDocument()
    expect(screen.queryByText('Hotel Avenida, 2 nights')).not.toBeInTheDocument()
    ```
  - |
    AC6 (web, fake timers as in AccessRemoved.test.tsx). First GET answers the trip, later GETs 404:

    ```ts
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderAt('/trips/read-only/k7Qm2xVd9')
    await screen.findByRole('heading', { name: 'Lisbon trip' })
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    const dialog = await screen.findByRole('alertdialog', { name: 'Access removed' })
    expect(dialog).toHaveTextContent('The owner has turned off this read-only link.')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(await screen.findByRole('heading', { name: 'Link no longer available' })).toBeInTheDocument()
    ```
    The existing editor test in AccessRemoved.test.tsx must still pass unchanged (default text and "OK").
  - |
    AC6 (Playwright, apps/web/e2e/share-link.spec.ts). Route-stub `**/shared/*` to answer 200 then 404 and assert the Access removed dialog appears on the open trip without a reload (use `page.clock` to advance 30 s).
  - |
    AC7 (API). Only the owner manages the link; an editor or stranger cannot, and neither gets the URL.

    ```python
    assert ana.post(f"/trips/{tid}/share-link").status_code == 403   # accepted editor
    assert ana.delete(f"/trips/{tid}/share-link").status_code == 403
    assert ben.post(f"/trips/{tid}/share-link").status_code == 404   # stranger
    body = ana.get(f"/trips/{tid}").json()
    assert body["share_url"] is None and body["share_token"] is None
    assert all(t["share_token"] is None for t in ana.get("/trips").json() if t["id"] == tid)
    ```
  - |
    AC7 (web). TripDetailPage.test.tsx: a signed-in non-owner (`is_owner: false, can_edit: true`) sees no share control; the owner does.

    ```ts
    expect(screen.queryByRole('button', { name: 'Share trip' })).not.toBeInTheDocument()   // non-owner
    expect(await screen.findByRole('button', { name: 'Share trip' })).toBeInTheDocument()  // owner
    ```
  - |
    Store tests (test_trip_store.py): the in-memory store round-trips a ShareLink; a Trip saved without `share_token` (an existing row) loads with `share_token is None`; for DynamoTripStore (stubbed table as in the existing tests) `save_trip` omits the attribute when it is None and `save_share_link` writes `pk="SHARE#<token>", sk="SHARE"`.
  - |
    Existing data is still readable: a Trip item stored before this change (no `share_token`) still loads via `DynamoTripStore._to_trip`, shows no `share_url`, and `GET /shared/<anything>` answers 404 for it.
assumptions_or_open_questions:
  - |
    The read-only view shows the itinerary only: trip name, destination and dates, day cards, chosen options (name, category, price) and activities. Reminders (personal notes), travellers, budget, cost total and booking links are not shared, because the design leaves the total card out and a viewer is not a traveller. Say if you want any of them included.
  - |
    One link per trip. Creating again while a link exists returns the same link (no second token), and turning it off then creating makes a new token; the old one stays dead. Anyone with the URL can view, so the share panel text says "Anyone with a read-only link".
  - |
    The link is a bearer capability: `secrets.token_urlsafe(24)` (192 bits, same as editor invites), not tied to an account, never logged. The public response sends `Cache-Control: no-store` so a turned-off link is not served from a browser or proxy cache.
  - |
    AC6 is met by polling (focus plus every 30 s), the same mechanism the editor Access removed notice already uses, not a push channel. A viewer can therefore see the itinerary for up to 30 s after the link is turned off; the server refuses it immediately on the next request. A websocket or SSE channel would be a new component and is out of scope.
  - |
    The prototype's Share button lives in the shell header, which the real shell does not support, so the button goes in the trip title row beside Edit trip (see the ShareTripModal scope item). The prototype's "Travelers" tab pair is not changed here.
  - |
    The Vite dev proxy in apps/web/vite.config.ts only forwards `/auth`; `/trips` and `/invites` already rely on another route to the API in deployment. `/shared` is assumed to be routed the same way as `/trips` and `/invites`; no proxy change is planned. Confirm if the API Gateway has per-path routes that need `/shared` added.
  - |
    The 404 for a turned-off link reveals nothing about whether the token ever existed, which satisfies AC5; the unavailable page shows no trip name.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: Adds an optional `share_token` attribute to Trip items and a new item type `pk=SHARE#<token>, sk=SHARE` in the same Trip Database table (DynamoDB, schemaless, so there is no migration). Existing Trip items have no `share_token`; `Trip.share_token` defaults to None, so they load and behave as "no link". No narrowed enum, new constraint or required field.
  - **Backfill / seed**: None needed. Links exist only once an owner creates one. Create is idempotent and revoke is safe to repeat.
  - **Settings**: None. The link origin comes from the browser (`window.location.origin` plus the relative `share_url`), like editor invite links in AccessSection.
  - **Provisioning**: None. The table, its key schema (`pk`, `sk`) and the Lambda's read/write permission on it already exist. The only open point is that `/shared/*` must reach the API like `/trips/*` does (see the assumptions).
  - **Order and rollback**: Deploy the API before the web app (the web calls the new routes). Rolling back the API leaves the extra `share_token` attribute and `SHARE#` items unread and harmless, and old code that re-saves a Trip would drop the attribute through the model, which just turns the link off. Leaving the change in place is safe.

  ### Design source
  Read from the approved prototype `TRAVEL-PLANNER-APP-STORY-063-design.html`: screens "Trip (owner)", "Share trip (no link)", "Share trip (link created)", "Trip (read-only viewer, no account)", "Trip (read-only viewer, access removed)", "Link no longer available", "Trip (signed-in non-owner)". Components used: `.modal` + `.backdrop` (via the existing Overlay), `.field`/`.input`/`.field-hint`, `.badge` (neutral, with the eye icon), `.card` in `.stack` day lists, `.toast`, one `.btn-primary` per view. Copy strings in the scope items are taken verbatim from the prototype. The prototype's `badge-neutral` class is not in apps/web/src/index.css (only `.badge`, `-success`, `-warning`), but the base `.badge` already has the neutral look, so no CSS is added.

  The Overlay-based modal in the real app has no `.modal-head`/`.link-row` classes; use existing `.title-row` and `.form-row` utilities and add only what is missing to apps/web/src/index.css, built from tokens, as the design's inline styles do (`.link-row` wraps at 14rem; `.unavailable` is max-width 36rem, centred).

  ```mermaid
  flowchart TD
    Web[App.tsx routes] --> SharedPage[SharedTripPage]
    Web --> TripPage --> Detail[TripDetailPage]
    Detail --> ShareModal[ShareTripModal]
    SharedPage --> Itin[ItineraryTab]
    Detail --> Itin
    SharedPage --> Removed[AccessRemovedModal]
    SharedPage --> Unavail[LinkUnavailable]
    ShareModal --> Client[trips/api.ts]
    SharedPage --> Client
    Client --> TripsRouter[routers/trips.py]
    Client --> SharedRouter[routers/shared.py]
    TripsRouter --> Store[trips/store.py]
    SharedRouter --> Store
    Main[main.py] --> SharedRouter
    Store --> Dynamo[(Trip Database)]
    classDef touched fill:#f96,color:#000
    class Web,SharedPage,Detail,ShareModal,Removed,Unavail,Client,TripsRouter,SharedRouter,Store,Main touched
  ```
  Touched nodes: App.tsx (public route), SharedTripPage/LinkUnavailable/ShareTripModal (new UI), TripDetailPage (Share trip button and panel), AccessRemovedModal (optional text), api.ts (three calls), trips.py (create/revoke, view hides token), shared.py (public read), store.py (token plus index), main.py (register router). ItineraryTab is reused unchanged.
review_focus: |
  Hold the change to: create/revoke link, public read-only itinerary, unavailable page, live "Access removed" for an open viewer, and no Share control for non-owners. Out of scope: editor invites (already built), push updates, link expiry, per-viewer analytics, any change to the Travelers tab. Riskiest area is the public `GET /shared/{token}`: it must be unauthenticated yet leak nothing beyond the allow-list model (no editors or invite tokens, reminders, travellers, budget, booking URLs, share_token), and a turned-off token must give the same 404 as an unknown one; also check `_view` and the `list_trips` shared copy never expose the token to editors. Deliberate: viewer reuses ItineraryTab (controls hidden via can_edit false), the AC6 live update is polling at 30 s like the editor notice, and the Share button sits in the trip title row because the prototype's shell-header slot does not exist.
