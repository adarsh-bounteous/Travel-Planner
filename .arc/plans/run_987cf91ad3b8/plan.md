summary: |
  Add a Book trip action to the trip page (beside the title, as in the approved prototype) that is disabled until the trip has at least one chosen option, and opens a right-hand drawer listing one card per chosen option. Each card has an "Open booking page" link that opens the provider's page in a new tab (target=_blank, rel="noopener noreferrer"); a chosen option with no booking link shows a "No booking link is available for this option." note instead. The drawer ends with a plain note that booking and payment happen on the provider's site; there is no form, payment step or confirmation. The action does not depend on is_owner, so a read-only link viewer gets the same enabled action and list. To carry the link, ChosenOption gains an optional booking_url in the API model and the web type.
scope:
  - description: |
      API: add an optional booking link to a chosen option, validated as an http(s) URL.
      Before → after in services/api/app/trips/store.py:
      ```python
      class ChosenOption(BaseModel):
          id: str
          title: str
          category: str
          date: date
          booking_url: HttpUrl | None = None   # new; None = provider gave no link
      ```
      (If HttpUrl's serialisation to a Url object upsets the Dynamo model_dump(mode="json") path, use `Annotated[str, AfterValidator(...)]` that only accepts http/https instead; json-mode dump already yields str.)
      Default None keeps every stored trip valid. No router change: GET /trips/{id} already returns trip.options.
    files:
      - services/api/app/trips/store.py
      - services/api/tests/unit/test_trips_router.py
    rationale: |
      The category epics that will populate options are not built; 061 only needs the field to exist and round-trip so the UI has something to render.
  - description: |
      Web type: `ChosenOption = { id; title; category; date; booking_url?: string | null }` in apps/web/src/trips/api.ts.
    files:
      - apps/web/src/trips/api.ts
    rationale: Mirrors the API model.
  - description: |
      New BookTripDrawer component built on the existing Overlay (kind="drawer", labelledBy="book-title"), matching the prototype screens "Book trip list", "Book trip list, option without a link" and the read-only list.
      ```tsx
      export function BookTripDrawer({ options, onClose }: { options: ChosenOption[]; onClose: () => void })
      ```
      Layout (from the prototype): `stack stack-lg` holding (1) h2 "Book trip" plus muted line "2 chosen options. Each link opens the provider's site in a new tab." (singular "1 chosen option." when one); (2) `ul.link-list` of `li.card.stack.stack-sm`, each with `.option-title` and `text-sm text-muted` "{category}, {formatDay(date)}" (formatDay is exported from ItineraryTab.tsx); (3) either `<a className="btn btn-secondary" href={booking_url} target="_blank" rel="noopener noreferrer">Open booking page<span className="text-sm"> (opens in a new tab)</span></a>` or `<p className="text-sm"><InfoIcon /> No booking link is available for this option.</p>`; (4) `text-sm text-muted` note "You book and pay on the provider's site. Travel planner doesn't take payment or confirm bookings."; (5) `.overlay-actions.end` with a `btn btn-ghost` Close button. No form, input, payment or confirmation element anywhere.
      Safety: render the link only when the URL parses with protocol http: or https:; otherwise treat as no link (prevents javascript: hrefs).
      Options are sorted by date (then listed order) to match the itinerary. Add InfoIcon to apps/web/src/auth/icons.tsx if no equivalent exists.
    files:
      - apps/web/src/trips/BookTripDrawer.tsx
      - apps/web/src/trips/BookTripDrawer.test.tsx
      - apps/web/src/auth/icons.tsx
    rationale: |
      A drawer (not a modal) per the UI guidelines and prototype, so the itinerary stays visible. Reuses Overlay for focus trap, Escape and backdrop.
  - description: |
      TripDetailPage: add `{ id: 'book' }` to the Panel union and a Book trip button in the `.title-row`, shown to everyone (NOT gated on trip.is_owner). It is `btn btn-primary`, `disabled={options.length === 0}`, with `aria-describedby="book-hint"` pointing at a `text-sm text-muted` hint "Choose an option to enable booking." rendered only when disabled. Wrap the button and hint in a `.title-actions` column as in the prototype. Edit trip (owner only) stays but becomes the secondary button, so there is one primary per section. Render `<BookTripDrawer>` when panel.id === 'book'.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/TripDetailPage.test.tsx
    rationale: Entry point for AC1, AC2 and AC7. Removing the owner gate is what makes the read-only viewer work.
  - description: |
      CSS: add `.link-list` and `.title-actions` (copied from the prototype style block, token-only) to apps/web/src/index.css. `.title-row`, `.option-title`, `.drawer`, `.overlay-actions` already exist there.
    files:
      - apps/web/src/index.css
    rationale: Styles used by the new drawer and title area.
tests:
  - |
    AC1 (TripDetailPage.test.tsx, written first, fails because no button exists):
    ```tsx
    open(trip({ options: [] }))
    const book = await screen.findByRole('button', { name: 'Book trip' })
    expect(book).toBeDisabled()
    expect(book).toHaveAccessibleDescription('Choose an option to enable booking.')
    ```
  - |
    AC2:
    ```tsx
    open(trip({ options: [trip().options![0]] }))
    expect(await screen.findByRole('button', { name: 'Book trip' })).toBeEnabled()
    ```
  - |
    AC3 (trip with two chosen options with booking_url, the trip's "not chosen" option is simply absent from trip.options; the fixture also defines a not-chosen title that is passed nowhere):
    ```tsx
    fireEvent.click(await screen.findByRole('button', { name: 'Book trip' }))
    const list = within(await screen.findByRole('dialog', { name: 'Book trip' }))
    expect(list.getAllByRole('link', { name: /Open booking page/ })).toHaveLength(2)
    expect(list.getByText('Tram pass')).toBeInTheDocument()
    expect(list.queryByText('Time Out Market lunch')).not.toBeInTheDocument()
    ```
  - |
    AC4 (BookTripDrawer.test.tsx): the link opens outside the app.
    ```tsx
    const link = screen.getByRole('link', { name: /Open booking page/ })
    expect(link).toHaveAttribute('href', 'https://example.com/hotel-alfama')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    ```
    Plus a case where booking_url is "javascript:alert(1)" and the drawer shows the no-link note and no link.
  - |
    AC5 (BookTripDrawer.test.tsx): no in-app booking.
    ```tsx
    const dialog = within(screen.getByRole('dialog', { name: 'Book trip' }))
    expect(dialog.queryByRole('textbox')).not.toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: /pay|confirm|reserve/i })).not.toBeInTheDocument()
    expect(dialog.getByText(/You book and pay on the provider's site/)).toBeInTheDocument()
    ```
  - |
    AC6: one chosen option with booking_url null or absent.
    ```tsx
    expect(screen.getByText('No booking link is available for this option.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open booking page/ })).not.toBeInTheDocument()
    expect(screen.getByText('Tram pass')).toBeInTheDocument()
    ```
  - |
    AC7: `open(trip({ is_owner: false, options: [one] }))`, then `expect(await screen.findByRole('button', { name: 'Book trip' })).toBeEnabled()`; also assert Edit trip is absent.
  - |
    AC8: same non-owner trip, click Book trip, then assert the dialog's link has `target="_blank"` and the booking href, as in AC4.
  - |
    API (services/api/tests/unit/test_trips_router.py): booking_url round-trips and old rows still load.
    ```python
    trip.options = [ChosenOption(id="o1", title="Tram pass", category="Conveyance", date="2027-03-04", booking_url="https://example.com/tram")]
    assert client.get(f"/trips/{trip.id}").json()["options"][0]["booking_url"] == "https://example.com/tram"
    # option stored without the field (existing data)
    assert ChosenOption(id="o2", title="Walk", category="Attractions", date="2027-03-04").booking_url is None
    # non-http scheme is refused
    with pytest.raises(ValidationError): ChosenOption(id="o3", title="x", category="y", date="2027-03-04", booking_url="javascript:alert(1)")
    ```
  - |
    Accessibility and states: Escape closes the drawer and focus returns to the Book trip button (existing Overlay behaviour); verify with `fireEvent.keyDown(dialog, { key: 'Escape' })` and `expect(book).toHaveFocus()`.
assumptions_or_open_questions:
  - |
    The data model has no "not chosen" option: ChosenOption records and trip.options hold chosen options only (the category epics that create options are not built). So AC3's unchosen option is covered by asserting a non-chosen title never appears in the list, which holds because the list is built only from trip.options. The prototype's dashed "Not chosen" row on a day is NOT rendered, because the 058 itinerary shows chosen options only and adding an unchosen state would be speculative. Reviewer: say so if you want a `chosen` flag added instead.
  - |
    There is no sharing or read-only link yet: GET /trips/{id} is owner-scoped (get_current_user) and TripView.is_owner is always true. This plan makes the web UI independent of is_owner so AC7 and AC8 pass for a non-owner Trip, and tests them with is_owner false. Backend access for a read-only link viewer belongs to the sharing story and is out of scope; the prototype's "View only" badge is likewise left to that story.
  - |
    The prototype's tabs are Itinerary and Travellers, while the live page has Overview and Itinerary; the plan keeps the live tabs (the prototype notes it kept the wireframe tabs). The prototype's toast standing in for the external tab is prototype-only; production uses a real anchor with target=_blank.
  - |
    The prototype's "preview the no-link list" link is prototype-only and is not built. The drawer's 46px top offset in the prototype is the reviewer bar, not part of the design.
  - |
    Who supplies booking_url (category epics) is out of scope; here it is optional and null by default.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: ChosenOption gains one optional field, `booking_url`, default None. No migration: DynamoDB items are schemaless, and `DynamoTripStore._to_trip` validates through `Trip.model_validate`, so options saved without the field load with booking_url None. Their Book trip entry shows the "no booking link" note.
  - **Backfill / seed**: None needed.
  - **Settings**: None.
  - **Provisioning**: None.
  - **Order and rollback**: Deploy API and web in any order (web treats a missing field as no link). Rollback is safe: old code ignores or drops the extra field on next save.

  ### Shape
  ```mermaid
  flowchart TD
    Page[TripDetailPage.tsx] -->|Book trip button, panel state| Drawer[BookTripDrawer.tsx]
    Drawer --> Overlay[Overlay.tsx]
    Drawer -->|formatDay| Itin[ItineraryTab.tsx]
    Page --> Itin
    Page -->|fetchTrip| Api[trips/api.ts]
    Api -->|GET /trips/id| Router[routers/trips.py]
    Router --> Store[trips/store.py]
    classDef touched fill:#f96,color:#000
    class Page,Drawer,Api,Store touched
  ```
  Touched: TripDetailPage (entry point), BookTripDrawer (new list), api.ts (type), store.py (optional field). Also touched but not drawn: index.css, icons.tsx and the two test files.

  UI conformance: one btn-primary per section (Book trip; Edit trip is secondary), drawer rather than modal, token-only CSS, buttons begin with a verb, phone-first single column (the drawer is full width below its max width). The links say the currency-free copy from the prototype; no money is shown.
review_focus: |
  IN: the Book trip button (disabled when options is empty), the drawer listing chosen options only, the no-link note, and an optional validated booking_url on ChosenOption. OUT: sharing and read-only access on the API, anything that sets booking_url, and any in-app booking UI. Riskiest parts are the URL scheme check (no javascript: hrefs) and keeping the button free of the is_owner gate; "not chosen" is deliberately modelled as absence from trip.options (see the open questions).
