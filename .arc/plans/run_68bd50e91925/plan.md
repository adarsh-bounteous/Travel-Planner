summary: |
  Give every trip a finished, printable itinerary document. The API builds the document server-side (new `GET /trips/{trip_id}/itinerary`, owner or accepted editor only, 404 for everyone else so no trip name, date or destination leaks). The document model is deliberately a separate, money-free shape (cover, at-a-glance booked/unbooked counts, one entry per trip day, still-to-schedule), so AC12 holds structurally rather than by filtering a TripView. The web app gets a new `ItineraryPage` at `/trips/:tripId/itinerary` that follows the approved prototype: a sticky "On this page" section list beside a single document column (a sticky scrolling row on phones), day cards with type-labelled item rows, "Not yet planned" empty states, a Print button, and a real `@page` A4 print stylesheet (nav and section list hidden, each day on its own page, link URLs printed after link text).
scope:
  - description: |
      Pure itinerary builder, no I/O. Signature:

      ```python
      def build_itinerary(trip: Trip) -> Itinerary: ...
      ```

      Models (pydantic): `ItineraryItem(kind: Literal["stay","check_in","check_out","transport","activity","meal","reminder"], title: str, detail: str | None, status: Literal["booked","unbooked"] | None, link_text: str | None, link_url: str | None)`, `ItineraryDay(number: int, date: date, items: list[ItineraryItem])`, `Glance(booked: int, unbooked: int)`, `Cover(name: str, start_date: date | None, end_date: date | None, destinations: list[str])`, `Itinerary(cover, glance, days, still_to_schedule)`. There is NO price, total, fare, currency, budget, editors, share or traveller field anywhere in these models (AC12).

      Rules: days come from `trip.days` (already one per date, ordered) or `reconcile_days(start, end, [])` when empty and both dates exist; no dates gives no days. Per day, items come from stays (Stay on start_date, Check-in on start_date, Check-out on end_date), transport picks (by date), activities (by date), restaurant picks with a date (Meal, titled with the meal name), and `visible_reminders(trip)` (Reminder, no status). Status: a stay, check-in/out and transport are `booked` when the stay has `chosen` or the item is a transport pick, else `unbooked`; activities and meals are `unbooked`; reminders have none. Booked and unbooked counts are over every item with a status, dated or not. Still to schedule: restaurant picks with no date, `trip.places` (no date), and any dated item whose date is not one of the trip days. Links: only http(s) URLs (skip `local://booking/` references). Items inside a day are ordered by the kind order stay, check-in, check-out, transport, activity, meal, reminder, then title.
    files:
      - services/api/app/trips/itinerary.py
    rationale: |
      Keeps the document rules testable without HTTP, and keeps the money fields (`ChosenStay.total`, `TransportPick.fare`, `ChosenOption.price`) out of the output by construction. Mirrors how `app/trips/cost.py` is a pure module beside `routers/trips.py`.
  - description: |
      New router exposing the builder. Access reuses the existing loader so the rule is identical to the rest of the app:

      ```python
      @router.get("/{trip_id}/itinerary")
      def get_itinerary(
          trip_id: str,
          user: str = Depends(get_current_user),
          trips: TripStore = Depends(get_trips),
          identity: IdentityProvider = Depends(get_identity),
      ) -> Itinerary:
          trip, _, _ = _load(trips, identity, user, trip_id)  # owner, or accepted editor; else 404 not_found
          return build_itinerary(trip)
      ```

      Register it in `main.py` next to `trip_helpers.router`. Use `router = APIRouter(prefix="/trips")`. Like `trip_helpers.py`, it imports `_load` from `app.routers.trips` (the one in-app precedent is `_owned_trip`). Nothing is written: no `save_trip`, no `updated_at` change.
    files:
      - services/api/app/routers/itinerary.py
      - services/api/app/main.py
    rationale: |
      `_load` already returns 404 for strangers and for missing trips (same answer, AC3/AC19) and accepts owners and accepted editors (AC2). Reusing it avoids a second access rule.
  - description: |
      Web API client and route. In `trips/api.ts` add the `Itinerary`, `ItineraryDay`, `ItineraryItem` types mirroring the API and `export const fetchItinerary = (tripId: string) => call<Itinerary>(`/trips/${encodeURIComponent(tripId)}/itinerary`)` (it reuses `call`, which already throws `NotFoundError` on 404). In `App.tsx` add `<Route path="/trips/:tripId/itinerary" element={<RequireAuth><ItineraryPage /></RequireAuth>} />` and add `'/trips/:tripId/itinerary'` to `APP_ROUTE_PATTERNS` (the existing routePatterns test requires the two lists to match). `navSections.ts` already maps `/trips/...` to the Trips section, so no change there.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/App.tsx
      - apps/web/src/routePatterns.ts
    rationale: |
      Follows how CostsPage and the other `/trips/:tripId/...` pages are wired.
  - description: |
      `ItineraryPage` (React, TypeScript) built from the prototype's "Itinerary" screen. Structure, with the prototype's class names:
      - `<div class="itin-body">` containing `<nav class="section-list" aria-label="On this page">` (title "On this page" plus links Cover, At a glance, Day by day, Still to schedule, each `href="#cover"`, `#at-a-glance`, `#day-by-day`, `#still-to-schedule`; clicking calls `scrollIntoView` (behaviour `auto` under `prefers-reduced-motion`) and sets `aria-current="true"` on the chosen link) and `<div class="document">`.
      - Cover: `<section class="cover" id="cover">` with `.cover-art` (image icon), `h1` trip name, dates line with calendar icon, destinations line (joined with ", "). Dates are formatted in the traveller's locale with `Intl.DateTimeFormat`, as in the prototype ("Sat 14 Nov – Mon 16 Nov 2026").
      - At a glance: `<section class="card glance" id="at-a-glance">`, `h2`, `.badge.badge-success` "Booked: N" with check icon, `.badge.badge-warning` "Unbooked: N" with alert icon (icon plus word, not colour alone). When both are 0 the section shows "Not yet planned" in an `.empty-state` (AC7).
      - Day by day: `<div class="stack" id="day-by-day">` with `h2` and one `<article class="card day-card">` per day: `.day-head` ("Day N" `h3` and the formatted date) then `ul.it-list` of `li.it` rows (`.it-icon`, `.it-type` label, `.badge` Booked or Unbooked when set, `.it-detail` with title, detail and `<a>` link when present). Icons per kind: stay home, check-in check, check-out arrow-left, transport arrow-right, activity star, meal bag, reminder bell. A day with no items shows `<div class="empty-state"><p>Not yet planned</p></div>`. No days at all shows the same empty state under the Day by day heading.
      - Still to schedule: `<section class="card" id="still-to-schedule">` with `h2`, the same item rows, or "Not yet planned".
      - A `.btn.btn-secondary.print-fab` "Print" button (sticky bottom, eye icon in the prototype) that calls `window.print()`.
      - Loading uses `.skeleton` lines (as CostsPage does). A `NotFoundError` renders the prototype's "Itinerary not found" `.empty-state` (`role="alert"`, search icon, `h1` "Itinerary not found", the prototype copy, and one `.btn-primary` "Go to your trips" linking to `/`), and renders no trip name, date or destination (AC3/AC19). Any other error shows an `.alert.alert-danger` "We couldn't load your itinerary. Try again."
      - Icons: reuse `apps/web/src/auth/icons.tsx` where an icon exists, add the missing ones there in the same style (the prototype's symbols are Lucide-style 24px strokes).
    files:
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/auth/icons.tsx
    rationale: |
      The prototype is the only design record; this is its planned-trip, nothing-planned and not-found states. No existing catalogue component (CompareTable, OptionCard) covers a document or day card, so the page composes the existing `.card`, `.badge`, `.empty-state`, `.stack`, `.btn-*` and `.alert` classes already in `index.css`, and adds only itinerary-specific classes.
  - description: |
      Styles in `index.css` (already imports `design-system/tokens.css` at line 2, after Tailwind at line 1). Port the prototype's itinerary rules, using tokens only: `.itin-body`, `.section-list` (sticky, `top` below the header, `z-index: var(--z-dropdown)`, background `var(--color-bg)`, border `var(--color-border)`; row on phones, column at 48rem), `.section-link` (hover `var(--color-surface)`, current `var(--color-primary)` on `var(--color-primary-subtle)`), `.document` (max width `calc(var(--size-modal-width) * 1.5)`), `.cover`, `.cover-art`, `.cover-body`, `.glance`, `.day-head`, `.it-list`, `.it`, `.it-icon`, `.it-type`, `.it-top`, `.it-detail`, `.print-fab`, plus `.card`, `.badge`, `.badge-success`, `.badge-warning` and `.empty-state` if `index.css` does not already define them (check before adding). Spacing uses `--space-*`, radii `--radius-*`, type `--font-size-*`. The prototype hardcodes `46px` for the reviewer bar offset; do NOT copy it. The sticky offset should use the app header height via `top: 0` on the section list inside `.shell-main`, with `scroll-margin-top: var(--space-6)` on sections. The `48rem` media query value is the documented `--breakpoint-md`.

      Print rules, as in the prototype:
      ```css
      @page { size: A4; margin: 15mm; }
      @media print {
        .shell-header, .section-list, .print-fab { display: none !important; }
        .itin-body { display: block; }
        .document { max-width: none; }
        .day-card, #still-to-schedule { break-before: page; }
        .day-card, .it { break-inside: avoid; }
        .document a[href]::after { content: " (" attr(href) ")"; overflow-wrap: anywhere; }
      }
      ```
      Print is scoped to the itinerary (the `@page` rule is global in CSS, so the first-day break and nav hiding apply only to the itinerary classes; other pages are unaffected by `.section-list` and `.print-fab`). The first day-card must break after the cover and at-a-glance page, matching the prototype's page 1 of cover plus glance.
    files:
      - apps/web/src/index.css
    rationale: |
      AC8 to AC11, AC17 and AC18. Tokens already load through `index.css` line 2, so no new loading is needed.
tests:
  - |
    AC1/AC2 (api, owner and editor). In `services/api/tests/unit/test_itinerary_router.py`, create a trip with `trip_body(...)` as owner, GET it, then invite and accept an editor and GET as the editor:
    ```python
    r = client.get(f"/trips/{tid}/itinerary")
    assert r.status_code == 200
    assert set(r.json()) == {"cover", "glance", "days", "still_to_schedule"}
    assert editor_client.get(f"/trips/{tid}/itinerary").status_code == 200
    ```
    Then add the route and builder.
  - |
    AC3/AC19 (api, stranger). A second signed-in user gets the same answer as for a missing trip, and the body carries no trip data:
    ```python
    r = stranger.get(f"/trips/{tid}/itinerary")
    assert r.status_code == 404 and r.json() == stranger.get("/trips/nope/itinerary").json()
    assert "Lisbon" not in r.text and "2026-11-14" not in r.text
    ```
    Also an unaccepted editor invite gets 404.
  - |
    AC4 (builder). `test_itinerary.py`: a trip 2026-11-14 to 2026-11-16:
    ```python
    assert [d.date for d in build_itinerary(trip).days] == [date(2026,11,14), date(2026,11,15), date(2026,11,16)]
    assert [d.number for d in it.days] == [1, 2, 3]
    ```
    Also a trip with `days=[]` stored still yields three days.
  - |
    AC5/AC7 (builder and web). `assert all(d.items == [] for d in build_itinerary(empty_trip).days)`. In `ItineraryPage.test.tsx`, with an itinerary of three empty days, `expect(screen.getAllByText('Not yet planned').length).toBeGreaterThanOrEqual(5)` (3 days, Still to schedule, At a glance), and the page still shows the cover heading and all four section names.
  - |
    AC6 (builder and web). A dated-nowhere restaurant pick, a trip place, and an activity dated outside the trip all land in `still_to_schedule`:
    ```python
    assert {i.title for i in build_itinerary(trip).still_to_schedule} == {"Cervejaria", "Tram 28", "Late walk"}
    ```
    Web: `within(screen.getByRole('region', { name: 'Still to schedule' })).getByText(/Tram 28/)`.
  - |
    AC8 (web, source check, since jsdom has no layout). In `ItineraryPage.test.tsx` read `src/index.css` and assert the section list rule is sticky:
    ```ts
    expect(rule('.section-list')).toMatch(/position:\s*sticky/)
    ```
    Also assert the nav is rendered before the document in the DOM, outside the scrolling `.document`.
  - |
    AC9 (web). Mock `Element.prototype.scrollIntoView = vi.fn()`, click the link, then:
    ```ts
    fireEvent.click(screen.getByRole('link', { name: 'Day by day' }))
    expect(scrollIntoView).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Day by day' })).toHaveAttribute('aria-current', 'true')
    expect(document.getElementById('day-by-day')).not.toBeNull()
    ```
    Every link's `href` fragment must match an element id.
  - |
    AC10/AC11/AC17/AC18 (web, print stylesheet source checks). `routePatterns.test.ts` already reads source files with `readFileSync`; do the same for `src/index.css`:
    ```ts
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4/)
    const print = css.slice(css.indexOf('@media print'))
    expect(print).toMatch(/\.shell-header[^{]*\.section-list[^{]*\{[^}]*display:\s*none/)
    expect(print).toMatch(/\.day-card[^{]*\{[^}]*break-before:\s*page/)
    expect(print).toMatch(/a\[href\]::after\s*\{[^}]*attr\(href\)/)
    ```
    Plus a render test that the section list and Print button carry the classes the print rule hides, and that `AppHeader` renders `.shell-header`. Print button: `fireEvent.click(print); expect(window.print).toHaveBeenCalled()`.
  - |
    AC12 (api, structural and by content). Build a trip with a budget, a chosen stay with a total, a transport pick with a fare, a SIM, insurance, an editor and a share link, then:
    ```python
    text = client.get(f"/trips/{tid}/itinerary").text.lower()
    for word in ("price", "total", "fare", "currency", "budget", "editors", "share", "insurance", "sim", "essential", "visa"):
        assert word not in text
    ```
    Also `assert set(Itinerary.model_fields) == {"cover","glance","days","still_to_schedule"}` and the same for `ItineraryItem.model_fields`. Web: no "Share", "Edit", "Budget" or "Add" button or link on the page, only Print and section links.
  - |
    AC13 (builder and web). `cover.name == "Lisbon & Porto in November"`, `cover.destinations == ["Lisbon, Portugal"]`, both dates set; web renders `screen.getByRole('heading', { level: 1, name: 'Lisbon & Porto in November' })`, the formatted date range and the destinations text inside the cover section.
  - |
    AC14/AC15 (builder and web). A trip with a chosen stay (with its check-in/out) and one transport pick, and an activity and a meal:
    ```python
    assert it.glance.booked == 4 and it.glance.unbooked == 2
    ```
    Web: `expect(screen.getByText('Booked: 4')).toBeInTheDocument()` and `Unbooked: 2`.
  - |
    AC16 (builder and web). One day carrying all seven kinds (the item names "six types" but lists seven: stay, check-in, check-out, transport, activity, meal, reminder):
    ```python
    assert [i.kind for i in it.days[0].items] == ["stay","check_in","check_out","transport","activity","meal","reminder"]
    ```
    Web: the day card contains the labels Stay, Check-in, Check-out, Transport, Activity, Meal, Reminder.
  - |
    Links (builder). A chosen stay with an https url yields `link_url == "https://stays.example.com/x"` and a `local://booking/...` url yields `link_url is None`. Web: the rendered `<a>` has the `href`, which the print rule exposes (AC18).
  - |
    Unchanged behaviour. `routePatterns.test.ts` ('lists every route declared in App.tsx') passes with the new route, and `test_client_paths_routed.py` still passes (`/trips` is already routed). A read-only GET: the stored trip's `updated_at` is unchanged after the call.
assumptions_or_open_questions:
  - |
    Prototype versus AC: the prototype's Print button opens an in-app "Print preview" screen made of mock A4 sheets. The ACs (10, 11, 17, 18) are about real browser printing, so the plan implements `window.print()` plus the real print stylesheet and does NOT build the mock preview screen (it is a prototype device).
  - |
    The prototype's Trip page has an "Itinerary" button that opens this page, but scope excludes trip-page actions. The plan adds the route only; there is no link to it from `TripPage`. Confirm whether a link is wanted in this item or in a later one.
  - |
    The item lists "six types" in AC16 but names seven (stay, check-in, check-out, transport, activity, meal, reminder), and the prototype shows seven. The plan renders all seven.
  - |
    "Booked" has no field in the data model. The plan treats a stay with a chosen offer, and every transport pick, as booked, and activities and meals as unbooked, with check-in and check-out following their stay (this matches the prototype's Booked 4 / Unbooked 3 sample). A stay with no chosen offer is unbooked. Please confirm this rule.
  - |
    Check-in is placed on a stay's start date and check-out on its end date (Stay has only dates, no times, so the prototype's "From 15:00" detail cannot be shown). `ChosenOption` items (the older trip options with category and price) are not part of the seven types and are left out.
  - |
    Cover "destinations" (plural): the model holds one `destination` string. The plan shows that string only. Splitting it by comma or adding stay places is not done. Confirm if more is wanted.
  - |
    Dated items whose date is outside the trip's days (for example after a date change) are shown under Still to schedule rather than dropped. A trip with no dates has no days, so Day by day shows "Not yet planned".
  - |
    Local mode: transport and stay bookings may carry `local://booking/` references; these are not shown as links.
  - |
    Deferred project question (sizing for itinerary builds and emails, and failure monitoring) is not answered by this item. The itinerary is built per request from one DynamoDB item read, sends no email, and adds no queue or job, so no sizing or monitoring work is planned here. A human should decide this before the later email and sharing work.
  - |
    The prototype hardcodes a 46px offset for the reviewer bar and a few widths from tokens (for example `calc(var(--size-modal-width) * 1.5)` for the document column). Reusing token expressions is planned; the A4 preview sheet sizes are not needed. If the sticky list needs an offset beyond `top: 0` once measured against the real header, that value has no token and should be raised rather than hardcoded.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — read-only endpoint and UI. No schema, stored data shape, migration, seed or setting changes; it reads existing Trip items through `TripStore`. Safe to deploy API and web in either order (the web page 404s until the API is live); rollback is removing the route.

  ### Context read

  - Stack: FastAPI on Lambda (pytest, `sh run-py.sh -m pytest -c pytest.ini`), React + Vite with Tailwind and vitest. Tokens load via `apps/web/src/index.css` line 2 (`@import "../../../design-system/tokens.css";`), and `index.css` overrides `--duration-fast` and `--duration-spin` (lines 5-8) because tokens.css exports them as `[object Object]`.
  - Access: `routers/trips.py` `_load` (line 198) is owner first, then an accepted editor via `can_edit_trip`, else `NOT_FOUND`. `GET /trips/{trip_id}` returns a `TripView` that includes costs, editors and share_url, which is why the itinerary has its own model.
  - Data: `Trip` (store.py line 310) holds days, stays (with `chosen`), transport, activities, restaurants (date and meal, or undated), reminders (`visible_reminders` drops stale ones), places (undated).
  - Web: `trips/api.ts` `call()` throws `NotFoundError` on 404; `CostsPage.tsx` shows the fetch, skeleton and failure pattern. `AppHeader.tsx` renders `.shell-header`, which the print rule hides. `test-api.tsx` provides `renderAt` and `stubApi` for page tests.
  - Prototype (read in full): screens "Trip page", "Itinerary", "Itinerary, printed (A4)", "Itinerary not found". Layout, classes and print rules above are copied from it. Colours come only from tokens (`--color-primary`, `--color-primary-subtle`, `--color-success`, `--color-warning`, `--color-border`, `--color-surface`).

  ```mermaid
  flowchart TD
    web[ItineraryPage.tsx] -->|fetchItinerary| api[trips/api.ts call]
    app[App.tsx and routePatterns.ts] --> web
    css[index.css print and layout] --> web
    api -->|GET /trips/id/itinerary| rt[routers/itinerary.py]
    rt -->|_load access| trips[routers/trips.py]
    rt --> bld[trips/itinerary.py build_itinerary]
    bld --> store[trips/store.py Trip]
    main[main.py include_router] --> rt
    classDef touched fill:#f96,color:#000
    class web,api,app,css,rt,bld,main touched
  ```

  Order of work (TDD): builder tests, builder, router tests, router and registration, web api and route tests, page tests, page, CSS and print-source tests.
review_focus: |
  IN: read-only itinerary endpoint plus the page, section list and print stylesheet. OUT: money, essentials, trip-page actions (no link from TripPage), sharing, emails, and the prototype's mock A4 preview screen. Riskiest parts are the booked/unbooked rule (no data field exists, so it is an assumption to confirm) and the money-free guarantee (AC12), which depends on the separate `Itinerary` model never gaining price, fare or share fields. Access deliberately reuses `_load` so strangers and unaccepted editors get 404 with no trip data. Print behaviour is verified by reading the CSS source, since jsdom does no print layout.
