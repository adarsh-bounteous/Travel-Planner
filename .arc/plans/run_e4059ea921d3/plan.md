summary: |
  Existing trips only hold a typed `destination` string; the new destination format is a country and a place from the starter catalogue (the destination dropdown). This plan adds server-owned `country`, `place`, `destination_unmatched` and `destination_converted` fields to the Trip, a Python port of the dropdown's best-match logic (`evaluateDestination` / `parseDestination` in `apps/web/src/places/destinationMatch.ts`) run over `STARTER_DESTINATIONS`, and a one-time-per-trip, idempotent conversion that runs when a traveller first loads an unconverted trip (list or detail). A trip that cannot be matched is flagged; a trip that already has a country and place is left alone; trips created after the change are stamped as converted at create, so they are never auto-assigned. The web app shows an "Unmatched" warning badge on the trip list and detail page, and a flagged trip loses its flag when its destination is edited to one that matches.
scope:
  - description: |
      Python port of the dropdown's best-match lookup, built on the starter catalogue (the same source the dropdown loads from `GET /starter-destinations`).
      ```python
      # services/api/app/trips/destination_match.py
      def best_match(typed: str | None) -> tuple[str, str] | None:
          """(country, place) the dropdown would pick for this text, else None."""
      ```
      Rules, mirroring the web file exactly: fold = NFD, strip combining marks, trim, lower-case (reuse `_fold` from `app/trips/starter_destinations.py`, renaming it public as `fold` or importing it). First try the stored "Place, Country" format (what `parseDestination` does when the dropdown loads a stored value, so 'Lisbon, Portugal' resolves). Then `evaluateDestination`: exact place gives a match. A country-only text, a near (within 2 edits) suggestion, empty text and no match all return None, because the dropdown needs the traveller to confirm or pick for those.
    files:
      - services/api/app/trips/destination_match.py
      - services/api/app/trips/starter_destinations.py
    rationale: |
      One matching rule for the dropdown and the conversion (AC1, AC3, scope: "same best-match logic"). The server owns the conversion because the trips live in the Trip Database, so the rule is ported rather than imported from TypeScript; a shared table of cases in both test suites guards against drift.
  - description: |
      Trip model fields (server-owned, so `TripFields` / the PUT body cannot set them) and the pure conversion.
      ```python
      # services/api/app/trips/store.py, class Trip
      country: str | None = None
      place: str | None = None
      destination_unmatched: bool = False
      destination_converted: bool = False  # False only on trips saved before the conversion existed

      # services/api/app/trips/destination_conversion.py
      def convert_trip(trip: Trip) -> Trip:
          """Returns the trip unchanged when destination_converted; else stamps it converted and fills or flags."""
      ```
      `convert_trip` rules: already converted → return as is. Has both `country` and `place` → only stamp `destination_converted=True` (AC8, country and place untouched). No typed destination → stamp only (nothing to match, no flag). `best_match(trip.destination)` found → set country and place, `destination_unmatched=False`. Not found → `destination_unmatched=True`, country and place stay None. `updated_at` is never touched, so list order does not change.
    files:
      - services/api/app/trips/store.py
      - services/api/app/trips/destination_conversion.py
    rationale: |
      AC1, AC2, AC3, AC8. `destination_converted` is the marker that makes the conversion run once per trip, safe to re-run, and keeps trips created later out of it (AC4). Old stored rows lack the new keys; pydantic defaults make them readable unchanged.
  - description: |
      Wire the conversion into the routes. Add a helper in `app/routers/trips.py`:
      ```python
      def _converted(trips: TripStore, owner_id: str, trip: Trip) -> Trip:
          done = convert_trip(trip)
          if done is not trip:
              trips.save_trip(owner_id, done)
          return done
      ```
      Call it in `list_trips` for the traveller's own trips and for shared trips (owner id is known there), and in `_load` for both branches (own trip, and the editor path with the owner's id). `create_trip` builds `Trip(..., destination_converted=True, ...)` so a new trip typed 'Lisbon' gets no country or place (AC4). In `update_trip`: when the existing trip has `destination_unmatched` and the new destination matches (`best_match(body.destination)`), set `country`, `place` and clear the flag (AC7); when it still does not match, the flag stays. Trips that are not flagged are not given a country and place on edit (out of scope).
    files:
      - services/api/app/routers/trips.py
    rationale: |
      Answers the deferred question: the conversion is not a global one-off migration (the Trip Database has no all-owners listing in the `TripStore` protocol, and adding one would ripple through the store contract tests and mutants). It runs once per trip, lazily, on first load after deploy, and is persisted by the marker. AC1-3, 4, 5-7 (API side), 8.
  - description: |
      Web: Trip type and the "Unmatched" badge. Add to `Trip` in `api.ts`: `country?: string | null`, `place?: string | null`, `destination_unmatched?: boolean`. Create a small shared `UnmatchedBadge` component from the prototype: `<span className="badge badge-warning"><AlertIcon />Unmatched</span>` (icon plus text, never colour alone; `AlertIcon` is in `apps/web/src/auth/icons.tsx`; `.badge` and `.badge-warning` already exist in `apps/web/src/index.css`, tokens come from `design-system/tokens.css` imported at `index.css` line 2).
      Trip list (`MyTripsPage.tsx` `TripRow`): the sub-line under the name shows `${country}, ${place}` when both are set, else the typed destination as today; the badge sits in the `.trip-title` row next to the existing "Shared" badge (prototype: `.trip-row-main` with badge between name and View). Tokens: `--space-1`, `--space-2`, `--color-warning`, `--color-warning-subtle`, `--font-size-sm`.
      Trip detail (`TripDetailPage.tsx`, `title-row` next to the `<h1>`): badge when `trip.destination_unmatched` (prototype `unmatched-flag`). Add a read-only "Destination" card from the prototype (`destination-section`, `.card .stack`, fields Destination (typed), Country, Place, with the `.field-hint` "We couldn't match this destination. Edit it to try again." under Place when unmatched). It uses `.card`, `.field`, `.field-label`, `.input`/`.select` disabled, tokens `--space-2`, `--space-3`.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/UnmatchedBadge.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: |
      AC5, AC6 and the visible result of AC1, 3, 8. Taken from the list and detail screens of the approved prototype.
  - description: |
      Edit flow (AC7). Reuse the existing `TripSettingsDrawer` with its `DestinationPicker` (which already runs `evaluateDestination`, shows "Did you mean", and writes "Place, Country"), rather than adding the prototype's separate Edit destination page. After save the page already receives the updated Trip from `PUT /trips/{id}`, so the badge disappears when the API cleared the flag. Show the toast copy from the prototype: 'Destination saved. Unmatched flag removed.' when the flag went from true to false, else 'Destination saved. Still unmatched.' (use the existing `Toast` in `apps/web/src/trips/Toast.tsx`; `onSaved` handler is in `TripDetailPage.tsx`).
    files:
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: |
      Avoids a second copy of the best-match UI. This deviates from the prototype, which draws a dedicated Edit destination screen with a live "Best match" line; flagged for the reviewer in the open questions.
  - description: |
      Quick check on real trips (scope item). After implementation, in local mode (`app/local_seed.py` sample trips plus two or three hand-made legacy trips) load the list and record in the PR description what each typed destination became (matched, flagged). This is a manual check, no code and no data is written outside the worktree's local data.
    files: []
    rationale: |
      The item's scope includes "a quick check of results on a few real trips".
tests:
  - |
    AC1 (write first, fails until best_match exists) in services/api/tests/unit/test_destination_match.py
    ```python
    def test_lisbon_matches_the_dropdown_best_match():
        assert best_match("Lisbon") == ("Portugal", "Lisbon")
        assert best_match("  lisbon ") == ("Portugal", "Lisbon")  # folded like the web matcher
    ```
    and in services/api/tests/unit/test_destination_conversion.py
    ```python
    def test_existing_trip_with_lisbon_gets_country_and_place():
        trip = Trip(id="t1", name="Spring", destination="Lisbon")
        done = convert_trip(trip)
        assert (done.country, done.place) == ("Portugal", "Lisbon")
        assert done.destination_unmatched is False and done.destination_converted is True
        assert done.updated_at == trip.updated_at
    ```
  - |
    AC2 in test_destination_conversion.py
    ```python
    @pytest.mark.parametrize("typed", ["Atlantis", "Portugal", "Lisbn", "Sunny coast, somewhere"])
    def test_unmatchable_destination_is_flagged(typed):
        done = convert_trip(Trip(id="t2", name="X", destination=typed))
        assert done.destination_unmatched is True
        assert done.country is None and done.place is None
    ```
    (a country alone and a near-miss are unmatched because the dropdown only asks the traveller to confirm them)
  - |
    AC3 in test_destination_match.py and test_destination_conversion.py
    ```python
    def test_lisbon_portugal_matches():
        assert best_match("Lisbon, Portugal") == ("Portugal", "Lisbon")
        done = convert_trip(Trip(id="t3", name="X", destination="Lisbon, Portugal"))
        assert (done.country, done.place) == ("Portugal", "Lisbon")
    ```
    Plus a vitest guard in apps/web/src/places/destinationMatch.test.ts that the web side agrees on the same table (parseDestination('Lisbon, Portugal') gives Portugal/Lisbon, evaluateDestination('Lisbon') gives kind place, evaluateDestination('Lisbn') gives kind near), so the two ports cannot drift silently.
  - |
    AC4 in services/api/tests/unit/test_trips_conversion_router.py
    ```python
    def test_trip_created_after_conversion_gets_no_country_or_place(client):
        created = client.post("/trips", json=trip_body(destination="Lisbon")).json()
        fetched = client.get(f"/trips/{created['id']}").json()
        assert fetched["country"] is None and fetched["place"] is None
        assert fetched["destination_unmatched"] is False
        assert client.get("/trips").json()[0]["country"] is None  # a later list load does not convert it
    ```
  - |
    AC5 (API) and web in apps/web/src/trips/MyTripsPage.test.tsx
    ```tsx
    it('shows the Unmatched flag on a flagged trip in the list', async () => {
      // fetchTrips mocked to return { id: 't', name: 'Coast', destination: 'Sunny coast', destination_unmatched: true }
      expect(await screen.findByText('Unmatched')).toBeInTheDocument()
    })
    it('shows Country, Place for a converted trip and no flag', async () => {
      expect(await screen.findByText('Portugal, Lisbon')).toBeInTheDocument()
      expect(screen.queryByText('Unmatched')).not.toBeInTheDocument()
    })
    ```
    Router test: a stored legacy trip (saved straight into the store with destination_converted=False and destination 'Sunny coast') comes back from GET /trips with `destination_unmatched` true.
  - |
    AC6 in apps/web/src/trips/TripDetailPage.test.tsx
    ```tsx
    it('shows the Unmatched flag and the hint on the detail page', async () => {
      // fetchTrip mocked with destination_unmatched: true
      expect(await screen.findByText('Unmatched')).toBeInTheDocument()
      expect(screen.getByText("We couldn't match this destination. Edit it to try again.")).toBeInTheDocument()
    })
    ```
    Router test: GET /trips/{id} on a legacy 'Atlantis' trip returns `destination_unmatched` true.
  - |
    AC7 in test_trips_conversion_router.py and TripDetailPage.test.tsx
    ```python
    def test_editing_a_flagged_trip_to_a_match_clears_the_flag(client, store):
        store.save_trip(OWNER, Trip(id="t7", name="X", destination="Atlantis"))
        client.get("/trips/t7")  # converts and flags
        body = {"name": "X", "destination": "Lisbon, Portugal"}
        saved = client.put("/trips/t7", json=body).json()
        assert saved["destination_unmatched"] is False
        assert (saved["country"], saved["place"]) == ("Portugal", "Lisbon")

    def test_editing_to_another_non_match_keeps_the_flag(client, store):
        ...  # put destination "Narnia" → destination_unmatched is True
    ```
    Web: after a save whose response has `destination_unmatched: false`, `expect(screen.queryByText('Unmatched')).not.toBeInTheDocument()` and the toast 'Destination saved. Unmatched flag removed.' is shown.
  - |
    AC8 in test_destination_conversion.py
    ```python
    def test_trip_with_country_and_place_is_unchanged():
        trip = Trip(id="t8", name="Kyoto in spring", destination="Lisbon", country="Japan", place="Kyoto")
        done = convert_trip(trip)
        assert (done.country, done.place) == ("Japan", "Kyoto")
        assert done.destination_unmatched is False
    ```
  - |
    Data and idempotence (required for a data change) in test_destination_conversion.py and test_persistent_trip_store.py / store_contract
    ```python
    def test_conversion_runs_once_and_is_safe_to_repeat():
        once = convert_trip(Trip(id="t9", name="X", destination="Lisbon"))
        assert convert_trip(once) is once

    def test_trip_stored_before_the_new_fields_still_loads():
        item = {"id": "t10", "name": "Old", "destination": "Lisbon"}  # a row with none of the new keys
        trip = DynamoTripStore._to_trip(item)
        assert trip.destination_converted is False and trip.country is None
    ```
    Also a local PersistentTripStore round trip with a pre-change data file (no new keys) to prove old rows stay readable.
assumptions_or_open_questions:
  - |
    Answer to the deferred question: the conversion is neither a global one-off migration nor repeated on every load. It runs once per trip, lazily, the first time a trip is loaded (list or detail) after deploy, and is recorded by `destination_converted`. If the team would rather have an explicit one-off script that scans the whole Trip Database, say so; it needs an all-owners listing added to `TripStore`, which also touches the store contract tests.
  - |
    AC3 conflict to confirm: the dropdown's `evaluateDestination('Lisbon, Portugal')` alone returns `none` (it is 10 edits from 'Lisbon'). It only resolves through `parseDestination`, which the dropdown uses when it loads a stored value. The plan counts that as the dropdown's best match, as the prototype's lookup table does. If the reviewer reads AC3 as `evaluateDestination` only, 'Lisbon, Portugal' would be flagged unmatched.
  - |
    Only an exact place (or the stored "Place, Country" form) counts as matched. A "near" suggestion such as 'Lisbn' and a country alone such as 'Portugal' are flagged, because the dropdown asks the traveller to confirm or pick for them. Confirm this is wanted rather than auto-accepting near matches.
  - |
    The starter catalogue is still the seeded list (Japan, Portugal, India, Thailand, Mexico, Morocco, Peru, each with three places in `starter_destinations.py`). A legacy destination in a city outside it (for example Paris) will be flagged. Settled project decision: the country list is fixed; the place list is whatever the catalogue holds when the conversion runs.
  - |
    A trip with no typed destination at all is marked converted and not flagged, since there is nothing to match. Confirm.
  - |
    Design deviation: the prototype shows a separate Edit destination screen with a live "Best match" line and a Save destination button. The plan reuses the existing Trip settings drawer and DestinationPicker for the edit instead of duplicating that matching UI. Confirm, or ask for the dedicated page (an extra scope item).
  - |
    The existing picker writes "Place, Country" into `destination`, so after an edit `destination` and `country`/`place` can disagree with the prototype's "typed" notion. The plan leaves other consumers of `trip.destination` (visa, weather, currency) unchanged and does not make them read the new fields.
  - |
    Lazy conversion saves a trip on a GET with a whole-item put. A write made at the same moment by another request could be overwritten; the window is a single first load per trip. Accepted as low risk; a conditional write would need store changes.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: no migration file and no schema change (DynamoDB items are schemaless; local mode reads a JSON file). New `Trip` fields all have defaults (`country`/`place` None, flags False), so every stored row still validates in `DynamoTripStore._to_trip` and `PersistentTripStore._load` (`FORMAT_VERSION` stays 1). Rows lacking `destination_converted` read as unconverted, which is what triggers the conversion.
  - **Backfill / seed**: the backfill is the lazy conversion in `convert_trip`, run from `list_trips` and `_load` in `services/api/app/routers/trips.py`. Idempotent (marker), skips trips with a country and place, never changes `updated_at`. Local sample trips from `app/local_seed.py` are unconverted when seeded and convert on first load.
  - **Settings**: none.
  - **Provisioning**: none; the starter catalogue ships in code.
  - **Order and rollback**: deploy the API first (it reads old rows fine), then the web app (new fields are optional in the `Trip` type). Rollback: redeploy the old code; the extra attributes on stored items are ignored by the old model if it ignores extras (pydantic default), so leaving the converted data in place is safe.

  Tokens: the app loads them at `apps/web/src/index.css` line 2 (`@import "../../../design-system/tokens.css"`), so no loading step is needed. The new UI uses only existing classes (`.badge`, `.badge-warning`, `.card`, `.field`, `.field-hint`, `.stack`) and token names (`--color-warning`, `--color-warning-subtle`, `--space-1`..`--space-3`, `--font-size-sm`); no new literal values. Note the prototype's inline CSS copy of `tokens.css` has `--duration-*` as "[object Object]"; `index.css` already overrides these, and this plan does not touch it.

  Prototype read: `TRAVEL-PLANNER-APP-STORY-101-design.html` screens Trip list, Trip detail, Edit destination and New trip (all four read in full). The New trip screen (AC4) needs no UI change: typing alone never fills country or place, and the existing `NewTripSetupPage` already creates with the dropdown.

  ```mermaid
  flowchart TD
    R[routers/trips.py list_trips, _load, create_trip, update_trip]:::touched --> C[trips/destination_conversion.py convert_trip]:::touched
    C --> M[trips/destination_match.py best_match]:::touched
    M --> S[trips/starter_destinations.py STARTER_DESTINATIONS]:::touched
    R --> T[trips/store.py Trip model]:::touched
    R --> ST[TripStore: Dynamo and Persistent]
    W1[web MyTripsPage.tsx]:::touched --> B[web UnmatchedBadge.tsx]:::touched
    W2[web TripDetailPage.tsx]:::touched --> B
    W2 --> D[web TripSettingsDrawer.tsx and DestinationPicker.tsx]
    D --> DM[web places/destinationMatch.ts, the logic being mirrored]
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN: server-side conversion of existing trips (matcher port, Trip fields, lazy once-per-trip run), the Unmatched badge on list and detail, and clearing the flag on a matching edit. OUT: changing how other features read `trip.destination`, a global migration script, a dedicated Edit destination page, any auto-assignment for new trips. Riskiest: the Python matcher drifting from `destinationMatch.ts` (guarded by shared cases in both suites), and the whole-item save on a GET. Deliberate: only exact-place and "Place, Country" count as matched, near and country-only are flagged.
