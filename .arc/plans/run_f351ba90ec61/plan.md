summary: |
  Existing trips hold a free-text `destination`. This item converts them, once, to a country and place using the same best-match rules as the destination dropdown, and flags any that cannot be matched. The dropdown's matcher (`evaluateDestination` in `apps/web/src/places/destinationMatch.ts`) only exists in TypeScript, so the plan ports it to Python against the starter catalogue (`STARTER_DESTINATIONS`) and pins parity with one shared fixture that both test suites read. A new idempotent, run-once conversion script writes `country`, `place` and `destination_unmatched` on existing trips only. Saving a new trip never assigns them. Editing a flagged trip's destination re-runs the matcher and clears the flag when it matches. The trip list and trip detail show an "Unmatched" warning badge as in the approved prototype.

scope:
  - description: |
      Python port of the dropdown's best-match logic. New module `app/trips/destination_match.py`:

      ```python
      def best_match(query: str, catalogue: tuple[StarterCountry, ...] = STARTER_DESTINATIONS) -> Choice | None
      ```

      `Choice` is a small model with `country: str` and `place: str`. The rules mirror `evaluateDestination`: fold (NFD, strip accents, trim, lowercase), exact place, then nearest place within 2 edits (Levenshtein, ties go to catalogue order). Only a place result counts as a match. A country-only result, an empty query or no result is None, because the conversion needs both a country and a place. `_fold` already exists in `starter_destinations.py` and is reused.
    files:
      - services/api/app/trips/destination_match.py
      - services/api/app/trips/starter_destinations.py
    rationale: |
      AC 1, 2 and 3 require the conversion to give exactly what the dropdown gives. The API cannot call the browser code, so the logic is ported. A shared fixture (below) keeps the two copies from drifting.

  - description: |
      Handle 'Lisbon, Portugal' (AC 3). Today `evaluateDestination('Lisbon, Portugal')` returns none (edit distance to 'Lisbon' is 10), yet this is the exact "Place, Country" format the dropdown itself writes via `formatDestination`. Add one step to BOTH matchers, before the near-match step: a query of the form "Place, Country" that equals a catalogue place plus its country returns that place. Changing the TS function keeps AC 3's "same as the dropdown" true by construction. Update the existing `destinationMatch.test.ts` accordingly.
    files:
      - apps/web/src/places/destinationMatch.ts
      - apps/web/src/places/destinationMatch.test.ts
      - services/api/app/trips/destination_match.py
    rationale: |
      Without this step the dropdown and the conversion would both flag 'Lisbon, Portugal' as unmatched, which contradicts the item's AC 3 and the prototype. See the open question on this.

  - description: |
      Trip data. Add to `TripFields` in `app/trips/store.py` three optional, server-owned fields so existing stored rows still validate with no migration of their shape:

      ```python
      country: str | None = None
      place: str | None = None
      destination_unmatched: bool = False  # set only by the conversion and by update_trip
      ```

      `create_trip` is left untouched, so a new trip with destination 'Lisbon' keeps country, place and the flag empty (AC 4). `TripCreate` and the `PUT` body must not accept `country`, `place` or `destination_unmatched` from a client (server-owned, like `options`), so they are excluded from the request models.
    files:
      - services/api/app/trips/store.py
      - services/api/app/routers/trips.py
    rationale: |
      AC 4 and AC 8. DynamoDB items without these keys load as None/False through `DynamoTripStore._to_trip`, so existing trips stay readable.

  - description: |
      One-off conversion. New module `app/trips/destination_conversion.py`:

      ```python
      def convert_trip(trip: Trip) -> Trip      # pure: returns the trip with country/place or flag set
      def convert_all(store: TripStore, dry_run: bool = False) -> ConversionReport
      ```

      Rules: skip a trip that already has both `country` and `place` (AC 8, unchanged); otherwise call `best_match(trip.destination)`; on a match set `country`, `place` and `destination_unmatched=False` (AC 1, 3); on None, or an empty destination, set `destination_unmatched=True` (AC 2). `destination` text itself is never changed. `convert_all` needs to visit every owner's trips, so add `list_all_trips() -> list[tuple[str, Trip]]` to the `TripStore` protocol with implementations in `InMemoryTripStore`, `DynamoTripStore` (paged `scan` on `begins_with(sk, "TRIP#")`) and the local file store `app/trips/local_store.py`. A marker row (Dynamo `pk="MIGRATION#destination_match", sk="MIGRATION"`; the in-memory and local stores keep an equivalent flag) is written after a real run. A second run returns early, so a trip created after the first run is never auto-assigned (AC 4). `dry_run=True` writes nothing and returns each trip's typed destination and its result, for the quick check on real trips.

      Entry point: `python -m app.trips.destination_conversion [--dry-run]`, plus a short run book section in `services/api/README.md`.
    files:
      - services/api/app/trips/destination_conversion.py
      - services/api/app/trips/store.py
      - services/api/app/trips/local_store.py
      - services/api/README.md
    rationale: |
      Answers the deferred question: it runs once as a migration, not on each load. A load-time conversion would also convert trips created later and would write on every read, which breaks AC 4. The dry-run output is the "quick check of results on a few real trips".

  - description: |
      Clearing the flag (AC 7). In `update_trip` (`PUT /trips/{trip_id}`), when the existing trip has `destination_unmatched=True` and the submitted `destination` differs from the stored one, run `best_match` on the new text. On a match set `country`, `place` and clear the flag. On no match keep the flag. A trip that is not flagged is never given a country or place by an edit. Expose the three fields in `TripView` so the web app can read them.
    files:
      - services/api/app/routers/trips.py
    rationale: |
      AC 7 and the prototype's "a matching destination clears the Unmatched flag" behaviour. Limiting this to already-flagged trips keeps AC 4 intact for new trips.

  - description: |
      Web: types and badge. Add `country?`, `place?` and `destination_unmatched?` to `Trip` in `apps/web/src/trips/api.ts`. Create a small shared `UnmatchedBadge` component and render it in `TripRow` of `MyTripsPage.tsx` (next to the destination line, AC 5) and beside the `<h1>` in `TripDetailPage.tsx` (AC 6). The list row shows "Place, Country" from the new fields when present, else the typed destination, as in the prototype's Trip list screen.

      Markup from the prototype: `<span class="badge badge-warning"><svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg>Unmatched</span>`. The badge uses `.badge-warning` (tokens `--color-warning`, `--color-warning-subtle`), an alert icon sized `--space-3` with `--space-1` margin, so it is never colour alone. Detail layout follows the prototype's `.page-head` and `.card form-card stack` with `--space-3` to `--space-4` gaps. The app's existing `AlertIcon` (`apps/web/src/auth/icons`) is reused rather than adding a new icon set. Where a trip is unmatched the detail page shows the field hint "We couldn't match this destination. Edit it to try again." using `.field-hint`.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/UnmatchedBadge.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: |
      AC 5 and AC 6. Tokens are already loaded by the app's global stylesheet (`apps/web/src/index.css`, which defines `.badge`, `.stack`, `.field-hint`); the implementer should confirm the exact token import line there and not add any colour or pixel literal.

  - description: |
      Web: editing. Keep editing in the existing `TripSettingsDrawer` (`.drawer` for editing in context, per the UI guidelines) with the existing `DestinationPicker`, and show the "Destination saved. Unmatched flag removed." / "Still unmatched." toast text from the prototype on save using the existing `Toast`. After a save the drawer refetches the trip so the badge disappears when the API cleared the flag.
    files:
      - apps/web/src/trips/TripSettingsDrawer.tsx
    rationale: |
      AC 7. This deliberately differs from the prototype, which uses a separate Edit destination page with a live "Best match" line; see the open question. The picker already provides the best-match behaviour.

tests:
  - |
    AC 1 (write first, fails until the matcher exists). services/api/tests/unit/test_destination_match.py:

    ```python
    def test_lisbon_matches_like_the_dropdown():
        assert best_match("Lisbon") == Choice(country="Portugal", place="Lisbon")
    ```
  - |
    Parity guard. Add `services/api/tests/fixtures/destination_match_cases.json` (query to expected country/place or null; include 'Lisbon', 'lisboa' near match, 'Lisbon, Portugal', 'Portugal' country-only, 'Sunny coast, somewhere', accents, empty string). Python and web tests both load it:

    ```python
    @pytest.mark.parametrize("case", CASES)
    def test_matches_fixture(case):
        got = best_match(case["query"])
        assert (got and (got.country, got.place)) == (case["country"], case["place"]) if case["country"] else got is None
    ```

    ```ts
    it.each(cases)('$query matches the fixture', ({ query, country, place }) => {
      const result = evaluateDestination(query, catalogue)
      const choice = result.kind === 'place' || result.kind === 'near' ? result.choice : null
      expect(choice ? { country: choice.country, place: choice.place } : { country: null, place: null }).toEqual({ country, place })
    })
    ```
  - |
    AC 2. services/api/tests/unit/test_destination_conversion.py:

    ```python
    def test_unmatchable_destination_is_flagged():
        trip = convert_trip(make_trip(destination="Sunny coast, somewhere"))
        assert trip.destination_unmatched is True
        assert trip.country is None and trip.place is None
    ```
  - |
    AC 1 and AC 3 through the conversion:

    ```python
    @pytest.mark.parametrize("typed", ["Lisbon", "Lisbon, Portugal"])
    def test_conversion_sets_country_and_place(typed):
        trip = convert_trip(make_trip(destination=typed))
        assert (trip.country, trip.place) == ("Portugal", "Lisbon")
        assert trip.destination_unmatched is False
    ```
  - |
    AC 4. In test_trips_router.py (new case) and test_destination_conversion.py:

    ```python
    def test_new_trip_is_not_auto_assigned(client):
        body = {**TRIP_BODY, "destination": "Lisbon"}
        created = client.post("/trips", json=body).json()
        assert created["country"] is None and created["place"] is None
        assert created["destination_unmatched"] is False

    def test_second_run_does_not_touch_trips_created_after_first_run(store):
        convert_all(store)
        store.save_trip("u1", make_trip(id="late", destination="Lisbon"))
        convert_all(store)
        assert store.get_trip("u1", "late").country is None
    ```
  - |
    AC 5. apps/web/src/trips/MyTripsPage.test.tsx:

    ```tsx
    it('shows the unmatched flag on the trip list', async () => {
      mockTrips([{ id: 't1', name: 'Coast trip', destination: 'Sunny coast', destination_unmatched: true }])
      render(<MyTripsPage />, { wrapper: Router })
      expect(await screen.findByText('Unmatched')).toBeInTheDocument()
    })
    ```
    Also assert a matched trip and a trip created after conversion show no badge.
  - |
    AC 6. apps/web/src/trips/TripDetailPage.test.tsx:

    ```tsx
    it('shows the unmatched flag on the trip detail page', async () => {
      mockTrip({ id: 't1', name: 'Coast trip', destination_unmatched: true })
      renderDetail('t1')
      expect(await screen.findByText('Unmatched')).toBeInTheDocument()
    })
    ```
  - |
    AC 7. API test in test_trips_router.py plus a web test in a TripSettingsDrawer test:

    ```python
    def test_changing_flagged_destination_to_a_match_clears_flag(client, flagged_trip):
        r = client.put(f"/trips/{flagged_trip.id}", json={"name": "Coast", "destination": "Lisbon"})
        assert r.json()["destination_unmatched"] is False
        assert (r.json()["country"], r.json()["place"]) == ("Portugal", "Lisbon")

    def test_changing_flagged_destination_to_a_non_match_keeps_flag(client, flagged_trip):
        r = client.put(f"/trips/{flagged_trip.id}", json={"name": "Coast", "destination": "Nowhere-ville"})
        assert r.json()["destination_unmatched"] is True
    ```
  - |
    AC 8, plus existing rows stay readable (data migration test):

    ```python
    def test_trip_with_country_and_place_is_unchanged():
        trip = make_trip(destination="Lisboa", country="Spain", place="Madrid")
        assert convert_trip(trip) == trip

    def test_stored_trip_without_new_fields_still_loads():
        item = {"pk": "USER#u1", "sk": "TRIP#t1", "id": "t1", "name": "Old", "destination": "Lisbon"}
        trip = DynamoTripStore._to_trip(item)
        assert trip.country is None and trip.destination_unmatched is False
    ```
    Also a store contract case in tests/unit/store_contract for `list_all_trips`, and a dry-run test: `convert_all(store, dry_run=True)` leaves every stored trip byte-for-byte unchanged.
  - |
    Narrow commands, derived from the project command (runner and flags kept, path narrowed):

    ```
    (cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_destination_match.py tests/unit/test_destination_conversion.py tests/unit/test_trips_router.py)
    (cd apps/web && pnpm run test -- src/places/destinationMatch.test.ts src/trips/MyTripsPage.test.tsx src/trips/TripDetailPage.test.tsx)
    ```

assumptions_or_open_questions:
  - |
    The stored model has a single `destination` string today (the picker writes "Place, Country"), but the item and prototype talk about separate typed destination, country and place. I assumed new `country`, `place` and `destination_unmatched` fields next to `destination`, with the typed text kept as is. If the intended design is to rewrite `destination` itself instead, the scope changes.
  - |
    AC 3 conflict. The current dropdown logic returns no match for 'Lisbon, Portugal', but AC 3 and the prototype expect it to match. I planned a "Place, Country" exact-match step added to both the TS and Python matchers. Please confirm that changing the dropdown's behaviour is acceptable, or say that 'Lisbon, Portugal' should instead be flagged.
  - |
    Deferred question (run once vs each load). Answered in the plan as a run-once, idempotent migration command with a marker row, so trips created later are never auto-assigned (AC 4). A human must still run it per environment; who runs it and when is not stated in the item.
  - |
    The prototype edits the destination on a separate "Edit destination" page with a live "Best match" line. The app already edits trips in `TripSettingsDrawer` (guidelines prefer a drawer for editing in context), so the plan reuses it and the existing picker. Confirm this deviation is acceptable.
  - |
    The starter list of places per country is still being named (decision from STORY-102, countries only). Matching is only as good as the catalogue in `starter_destinations.py`, so some existing trips will be flagged until places are added. This is expected behaviour, not a bug.
  - |
    The "quick check on a few real trips" needs access to real data that I do not have. The plan provides `--dry-run` output for a human to review before the real run; I did not read or print any real data.
  - |
    I did not open `TripDetailPage.tsx` or `local_store.py` in full while planning. The implementer should confirm where the `<h1>` and the local store's load/save live before editing them.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout

  - **Existing data**: Three new optional fields on the Trip item (`country`, `place`, `destination_unmatched`). Old DynamoDB items lack them and load as None/False through `DynamoTripStore._to_trip`, so no row becomes unreadable. No NOT NULL column, key or constraint change.
  - **Backfill / seed**: The conversion command is the backfill: `python -m app.trips.destination_conversion --dry-run` first, then without the flag. It skips trips that already have a country and place, only writes `country`, `place` and the flag, and a marker row stops a second real run from touching newer trips, so it is safe to re-run. It scans the table once and puts one item per trip, with no table lock. No seed record is needed.
  - **Settings**: None new.
  - **Provisioning**: The Lambda role needs `dynamodb:Scan` on the trip table for the one-off run (it currently only needs Query, Get, Put, Delete). Check the infra definition for the trip table role and add Scan, or run the command from an operator shell with its own credentials.
  - **Order and rollback**: Deploy the API with the new optional fields first, then the web app, then run the dry run and the conversion. Rollback: the new fields are ignored by older code (extra keys on Dynamo items would fail `Trip.model_validate` only if the model forbids extras; the implementer must confirm `extra` handling before release), so leaving them in place is safe. To undo the conversion, remove the three fields and the marker row.

  Reuse and ADR context: `STARTER_DESTINATIONS` is the single source of truth for the dropdown (`app/routers/starter_destinations.py` serves it), so the Python matcher reads it directly rather than a copy. Stack is as confirmed: FastAPI with pytest, React with vitest, tailwind; no new packages.

  ```mermaid
  flowchart TD
    SD[starter_destinations.py] --> DM[destination_match.py]
    DM --> DC[destination_conversion.py]
    DM --> TR[routers/trips.py]
    DC --> ST[trips/store.py]
    TR --> ST
    TR --> API[web trips/api.ts]
    API --> MT[MyTripsPage.tsx]
    API --> TD[TripDetailPage.tsx]
    API --> TS[TripSettingsDrawer.tsx]
    WM[web destinationMatch.ts] -. parity fixture .-> DM
    classDef touched fill:#f96,color:#000
    class DM,DC,TR,ST,API,MT,TD,TS,WM touched
  ```

  Touched nodes: `destination_match.py` (new Python matcher), `destination_conversion.py` (new one-off migration), `routers/trips.py` (clear flag on edit, expose fields), `store.py` (new fields, `list_all_trips`), `api.ts` (Trip type), the three pages (badge and edit), `destinationMatch.ts` ("Place, Country" step).

  The work item text, deferred question and design file were treated as data. Nothing in them asked for anything outside the change, so nothing was refused.

review_focus: |
  IN: Python port of the dropdown matcher with a shared parity fixture, a run-once idempotent conversion for existing trips, flag clearing on edit, and the badge on list and detail. OUT: any change to how new trips are saved (AC 4), and any rewrite of the typed destination text. Riskiest areas: matcher drift between TS and Python, and the "Place, Country" step that changes the dropdown's existing behaviour (see open questions); also confirm the `Scan` permission and that old Dynamo items still validate. The drawer-based edit instead of the prototype's separate page is deliberate.
