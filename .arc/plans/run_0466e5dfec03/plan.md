summary: |
  When a traveller saves a trip date change, every existing Stay that is not fully inside the new dates (fully outside, or overlapping but extending beyond) is flagged "Outside trip"; stays fully inside are not. The flag is decided only on a trip date change: a Stay created afterwards is never flagged, even outside the dates. The API computes and persists a server-owned `outside_trip` boolean on each Stay in `update_trip`, and the web app shows it as a warning badge with a reason line on the Stays tab, plus a "Stays after date change" review drawer (Keep dates / Adjust dates / Done) that opens after a date save that flagged something. Nothing is moved automatically; "adjusting" is the traveller editing the stay through the existing change-stay route.
scope:
  - description: |
      API model and rule. Add `outside_trip: bool = False` to `Stay` (server-owned like `chosen`, so NOT on `StayFields`, and a client cannot set it). Add a pure helper in store.py:

      ```python
      def stay_outside_trip(stay: StayFields, start: date | None, end: date | None) -> bool:
          """True when any part of the stay lies outside the trip dates. A trip without both dates flags nothing."""
          if start is None or end is None:
              return False
          return stay.start_date < start or stay.end_date > end
      ```
    files:
      - services/api/app/trips/store.py
    rationale: |
      One boolean rule covers AC1 (fully outside), AC2 (inside, false) and AC4 (overlap beyond, true). Default False means stored Stays without the field stay valid.
  - description: |
      API routes in `services/api/app/routers/trips.py`.
      1. `update_trip`: when `(body.start_date, body.end_date) != (existing.start_date, existing.end_date)`, add `"stays": [s.model_copy(update={"outside_trip": stay_outside_trip(s, body.start_date, body.end_date)}) for s in existing.stays]` to the `model_copy` update. When the dates did not change (a name or budget edit), stays are left untouched, so flags neither appear nor clear.
      2. `add_stay`: unchanged on purpose; `Stay(id=..., **body.model_dump())` leaves `outside_trip` False (AC3). A test pins it.
      3. `change_stay` (the "Adjust dates" path): `revised` keeps `outside_trip` only for a stay that was already flagged, recomputed against the trip dates (`stay_outside_trip(...) if s.outside_trip else False`), so adjusting a flagged stay inside the trip clears the flag, while editing an unflagged stay never newly flags it.
    files:
      - services/api/app/routers/trips.py
    rationale: |
      Flags are decided at the one moment the item names, a trip date change. Persisting the flag, rather than recomputing on read, is what makes AC3 true: a later-added stay outside the dates stays unflagged.
  - description: |
      Web types and Stays tab. In api.ts add `outside_trip?: boolean` to `Stay` (the type at api.ts:120). In stays.ts add a pure `outsideReason(stay, tripStart, tripEnd): string` giving the prototype's reasons: "Entirely outside your trip.", "Starts N day(s) before your trip.", "Ends N day(s) after your trip." (reuse `daysBetween`). In StaysSection.tsx (needs new props `tripStart`/`tripEnd`) render, for `stay.outside_trip`, a second `badge badge-warning` with `AlertIcon` and the text "Outside trip" next to the existing overlap/gap badge in `.stay-flags`, a `text-sm text-muted` reason line, and a `stay-flagged` modifier on the card. Text plus icon, never colour alone, as the prototype's "Stays" screen does.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/stays.ts
      - apps/web/src/trips/StaysSection.tsx
      - apps/web/src/index.css
    rationale: |
      Matches the prototype's Stays screen (flagged card with warning badge and reason line). index.css already imports design-system/tokens.css at line 2 and already defines `.badge-warning`, `.stay-flags`, `.stay-place`. Add only `.stay-flagged { border-color: var(--color-warning); border-left-width: var(--space-1); }`, copied from the prototype, using tokens only.
  - description: |
      Review drawer after a date save. New `StaysReviewDrawer.tsx`, built on the existing `Overlay` with `kind="drawer"` (prototype: right drawer, `aria-labelledby="review-title"`, h2 "Stays after date change"). Content: intro "Your trip now runs {start} to {end}. Stays marked Outside trip are not fully within these dates."; a `.stack` of cards, flagged ones with badge, reason, and `btn btn-secondary` "Keep dates" (shows the note "Dates kept. This stay stays marked Outside trip.") and "Adjust dates" (inline check-in/check-out `.field` inputs and a `btn btn-primary btn-sm` "Apply dates" calling the existing `changeStay`); unflagged cards say "Inside your trip."; a `btn btn-primary` "Done". Validation error "Check-out must be on or after check-in." uses `.field-error`. In TripDetailPage.tsx, `TripSettingsDrawer`'s `onSaved` (line 309) opens this drawer when the saved trip has any `outside_trip` stay, otherwise it keeps the existing "Trip saved" toast (prototype: "Dates saved. All your stays still fit."). Add a `'stays-review'` panel id.
    files:
      - apps/web/src/trips/StaysReviewDrawer.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: |
      Builds the approved "Stays after date change" screen. Keep dates is deliberately client-only; the flag already persists.
  - description: |
      Tests, written first (see `tests`). API: add cases to services/api/tests/unit/test_stays_router.py (the `_trip`/`_add` helpers there already exist) and a pure-rule test in a new services/api/tests/unit/test_stay_outside_trip.py. Web: stays.test.ts (reason text), Stays.test.tsx (badge render and no badge for unflagged), new StaysReviewDrawer.test.tsx, and a TripDetailPage-level case that saving changed dates with a flagged stay opens the drawer.
    files:
      - services/api/tests/unit/test_stays_router.py
      - services/api/tests/unit/test_stay_outside_trip.py
      - apps/web/src/trips/stays.test.ts
      - apps/web/src/trips/Stays.test.tsx
      - apps/web/src/trips/StaysReviewDrawer.test.tsx
    rationale: ""
tests:
  - |
    AC1, API: stay fully outside after a date change is flagged (add to test_stays_router.py; the trip starts 2027-01-01 to 2027-01-12).
    ```python
    def test_date_change_flags_stay_entirely_outside(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = _trip(a)
        _add(a, tid, "Lisbon", "2027-01-02", "2027-01-04")
        body = trip_body(name="Trip", start_date="2027-01-08", end_date="2027-01-12", destination="Lisbon")
        r = a.put(f"/trips/{tid}", json=body)
        assert r.json()["stays"][0]["outside_trip"] is True
        assert a.get(f"/trips/{tid}").json()["stays"][0]["outside_trip"] is True
    ```
  - |
    AC2, API: stay fully inside the new dates is not flagged.
    ```python
    def test_date_change_leaves_inside_stay_unflagged(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = _trip(a)
        _add(a, tid, "Lisbon", "2027-01-03", "2027-01-05")
        body = trip_body(name="Trip", start_date="2027-01-02", end_date="2027-01-10", destination="Lisbon")
        assert a.put(f"/trips/{tid}", json=body).json()["stays"][0]["outside_trip"] is False
    ```
  - |
    AC3, API: a stay created after the date change, outside the dates, is not flagged; an earlier flagged stay stays flagged.
    ```python
    def test_stay_added_after_date_change_is_not_flagged(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = _trip(a)
        a.put(f"/trips/{tid}", json=trip_body(name="Trip", start_date="2027-01-01", end_date="2027-01-05", destination="Lisbon"))
        stays = _add(a, tid, "Porto", "2027-02-01", "2027-02-03").json()["stays"]
        assert stays[0]["outside_trip"] is False
    ```
  - |
    AC4, API: a stay that overlaps the new dates but extends beyond them is flagged; the pure rule is also covered in test_stay_outside_trip.py.
    ```python
    def test_date_change_flags_stay_extending_beyond(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = _trip(a)
        _add(a, tid, "Lisbon", "2027-01-04", "2027-01-10")
        body = trip_body(name="Trip", start_date="2027-01-01", end_date="2027-01-06", destination="Lisbon")
        assert a.put(f"/trips/{tid}", json=body).json()["stays"][0]["outside_trip"] is True

    def test_rule():
        s = StayFields(place="x", start_date=date(2027, 1, 4), end_date=date(2027, 1, 10))
        assert stay_outside_trip(s, date(2027, 1, 1), date(2027, 1, 6)) is True
        assert stay_outside_trip(s, date(2027, 1, 4), date(2027, 1, 10)) is False
        assert stay_outside_trip(s, None, None) is False
    ```
  - |
    Existing data and edge cases (API): a stored Stay without the field loads as unflagged, a name-only edit does not change flags, a client cannot set the flag, and adjusting a flagged stay inside the trip clears it.
    ```python
    def test_stored_stay_without_flag_loads_unflagged():
        trip = Trip.model_validate({"id": "t1", "name": "Old", "stays": [{"id": "s", "place": "x", "start_date": "2027-01-01", "end_date": "2027-01-02"}]})
        assert trip.stays[0].outside_trip is False

    def test_adjusting_flagged_stay_inside_clears_flag(sign_in_as):
        ...  # flag via date change, PUT /stays/{id} with dates inside, assert outside_trip is False
    ```
  - |
    Web, Stays tab (Stays.test.tsx): a stay with `outside_trip: true` shows the badge and reason, a plain one does not.
    ```tsx
    expect(screen.getByText('Outside trip')).toBeInTheDocument()
    expect(screen.getByText('Ends 2 days after your trip.')).toBeInTheDocument()
    expect(within(insideCard).queryByText('Outside trip')).not.toBeInTheDocument()
    ```
    And in stays.test.ts: `expect(outsideReason(stay, '2027-03-10', '2027-03-20')).toBe('Starts 6 days before your trip.')` for a stay starting 2027-03-04 (also check the singular "1 day" wording).
  - |
    Web, review drawer (StaysReviewDrawer.test.tsx): flagged stays offer Keep dates and Adjust dates, unflagged show "Inside your trip.", Keep dates shows the note, Apply dates calls `changeStay` with the new dates, and Done closes. A TripDetailPage case checks that saving changed dates which return a flagged stay opens the "Stays after date change" dialog, and that no flagged stay gives the "Trip saved" toast instead.
assumptions_or_open_questions:
  - |
    The item says "flagging (or adjusting)". I flag only and let the traveller adjust through the existing change-stay route. Stays are never moved automatically; the prototype's intro line also says "Changing dates won't move your stays".
  - |
    A flag is only recomputed when the start or end date actually changes. A name or budget edit through Trip settings leaves flags as they are. Please confirm.
  - |
    Editing a stay later (change_stay) recomputes the flag only for a stay that was already flagged, so editing an unflagged stay outside the dates never flags it. This follows AC3 and the prototype's Apply dates behaviour.
  - |
    Prototype conflict. The prototype has a standalone "Edit trip dates" screen with DD/MM/YYYY text inputs. The app already edits dates in `TripSettingsDrawer` with native date inputs and the app's date format, so I keep that form and only add the review step after it. The prototype's "Add stay" hint ("These dates are after your trip ends...") is not planned, because no AC needs it. Say if you want it added to the stay drawer.
  - |
    The prototype flags on load from its fixture without any date change. In the real app flags exist only after a date change, which matches AC3. Trips whose dates changed before this ships get no retroactive flags.
  - |
    Trip with only one date, or none, flags nothing. Editors can add and change stays but only the owner can change trip dates, so only the owner sees the review drawer; editors still see the badges on the Stays tab.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: no migration. The DynamoDB Trip item embeds stays as JSON; `outside_trip` is a new optional field with default `False`, so every stored stay still validates and reads as unflagged. A test pins this.
  - **Backfill / seed**: none. Old date changes are not retroactively flagged; flags are set on the next date change. Nothing to re-run.
  - **Settings**: none.
  - **Provisioning**: none.
  - **Order and rollback**: deploy API and web together or API first; the web treats a missing `outside_trip` as false. Rollback is safe: the old API ignores the extra stored field on read, though a stay rewritten by the old code drops it.

  ### Design source
  Read the prototype's four screens: "Edit trip dates", "Stays after date change", "Stays" and "Add stay". The tokens come from design-system/tokens.css, imported at apps/web/src/index.css:2. Tokens used: `--color-warning`, `--color-warning-subtle`, `--space-1` to `--space-3`, `--border-width`. The classes `.card`, `.badge-warning`, `.btn-primary`, `.btn-secondary`, `.field-error` and `.alert-success` follow the UI guidelines: one `btn-primary` per section, a drawer for editing in context, and a warm second-person tone. The prototype's "All your stays fit." `alert-success` is shown only if the drawer opens with nothing flagged; the normal path shows the existing toast instead.

  ```mermaid
  flowchart TD
    TSD[TripSettingsDrawer.tsx] -->|updateTrip PUT| UT[routers/trips.py update_trip]
    UT --> ST[trips/store.py Stay + stay_outside_trip]
    AS[routers/trips.py add_stay] --> ST
    CS[routers/trips.py change_stay] --> ST
    TDP[TripDetailPage.tsx] --> TSD
    TDP -->|opens when any outside_trip| SRD[StaysReviewDrawer.tsx]
    TDP --> SS[StaysSection.tsx]
    SRD -->|Apply dates: changeStay| CS
    SS --> SH[stays.ts outsideReason]
    classDef touched fill:#f96,color:#000
    class UT,ST,AS,CS,TDP,SRD,SS,SH touched
  ```
  Only `update_trip`, `change_stay`, `Stay`/`stay_outside_trip`, `TripDetailPage`, `StaysSection`, `stays.ts` and the new drawer change. `add_stay` is touched by a test only.
review_focus: |
  IN scope: a persisted, server-owned `outside_trip` flag set only in `update_trip` when the dates change, its badge and reason on the Stays tab, and the review drawer. OUT: auto-moving stays, retroactive flagging of old trips, and any change to the trip settings form fields. The riskiest part is the flag lifecycle: `add_stay` must never set it (AC3), `change_stay` may only clear or recompute it for an already-flagged stay, and a name-only trip edit must not reset flags. Persisting rather than recomputing on read is deliberate, so do not flag it as redundant state.
