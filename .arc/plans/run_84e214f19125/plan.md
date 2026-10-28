summary: |
  Convert existing trips that only have a typed `destination` into the structured country + place format, using the same best-match logic as the destination dropdown, and flag the ones that cannot be matched. The dropdown's logic today lives only in the web app (`evaluateDestination` in `apps/web/src/places/destinationMatch.ts`), so the plan ports it to Python (`app/trips/destination_match.py`) and pins both implementations to one shared fixture of cases so they cannot drift. The Trip gets three server-owned fields (`country`, `place`, `destination_unmatched`) plus a `destination_converted` marker. A one-off, idempotent conversion command walks every stored trip, skips trips that already have a country and place, assigns the match or sets the flag, and marks the trip converted. Trips created after the conversion are marked converted at creation, so neither a re-run nor typing ever assigns them a country and place. Editing a flagged trip's destination re-runs the match and clears the flag when it matches. The web app shows an Unmatched badge on the trip list and the trip detail page, taken from the approved prototype.
scope:
  - description: |
      Port the dropdown's best-match to Python as the single server-side entry point, and extend both implementations so "Place, Country" (the format `formatDestination` produces and the picker stores) matches the same place as the bare place name.

      ```python
      # services/api/app/trips/destination_match.py
      def best_match(query: str | None) -> tuple[str, str] | None:
          """(country, place) when the dropdown would pick a place outright, else None.

          Mirrors evaluateDestination: exact place, then exact "Place, Country".
          A country alone, a near miss ("Did you mean") and no match all return None.
          """
      ```

      The TypeScript side gets the same extra step in `evaluateDestination`, before the country and near-match steps: if the folded query equals the folded `formatDestination(choice)` of a catalogue choice, return `{ kind: 'place', choice }`.
    files:
      - services/api/app/trips/destination_match.py
      - apps/web/src/places/destinationMatch.ts
      - apps/web/src/places/destinationMatchCases.json
    rationale: |
      AC1 and AC3 say "the dropdown's best match". Today `evaluateDestination('Lisbon, Portugal')` returns `none` (edit distance to "Lisbon" is far above MAX_EDITS = 2), yet the prototype and AC3 expect "Lisbon, Portugal" and "Lisbon" to give the same result. The shared logic must change for AC3 to hold, and changing it in one place only would leave the dropdown and the conversion disagreeing. The fold (NFKD, casefold, strip accents) matches `_fold` in `starter_destinations.py`. The catalogue comes from `STARTER_DESTINATIONS`, the same source that serves `GET /starter-destinations`.
  - description: |
      Add structured destination fields to the Trip, all server-owned (never read from a request body, like `options` or `stays`):

      ```python
      class Trip(TripFields):
          ...
          country: str | None = None
          place: str | None = None
          destination_unmatched: bool = False   # set by the conversion; cleared when an edit matches
          destination_converted: bool = False   # False on trips stored before the conversion; True on trips created after
      ```

      `create_trip` builds the Trip with `destination_converted=True` and never calls `best_match` (AC4). `update_trip` keeps the stored values of the new fields, except that when `existing.destination_unmatched` is true and the destination changed it calls `best_match(body.destination)`: on a match it sets `country`, `place` and `destination_unmatched=False`; otherwise the trip stays flagged. Add `country`, `place` and `destination_unmatched` to the `TripView`/`TripListItem` output (they inherit from `Trip`, so only the model change is needed).
    files:
      - services/api/app/trips/store.py
      - services/api/app/routers/trips.py
    rationale: |
      Covers AC4 (new trips get nothing automatically) and AC7 (clearing the flag). `destination_converted` is what makes a second run of the conversion safe for trips created after the first run. Without it a re-run could not tell a post-conversion trip with only a typed destination from a legacy one. Old stored items lack the new keys, so Pydantic defaults make them readable unchanged (`DynamoTripStore._to_trip` already validates through `Trip`).
  - description: |
      Add a way to visit every stored trip, then the conversion itself and a command to run it.

      ```python
      # TripStore Protocol, InMemoryTripStore (PersistentTripStore inherits it), DynamoTripStore
      def all_trips(self) -> Iterator[tuple[str, Trip]]: ...   # (owner_id, trip)

      # services/api/app/trips/convert_destinations.py
      @dataclass(frozen=True)
      class ConversionReport:
          matched: int
          unmatched: int
          unchanged: int
          unmatched_trips: list[tuple[str, str, str | None]]   # owner_id, trip id, typed destination

      def convert_destinations(trips: TripStore) -> ConversionReport: ...
      ```

      For each trip: if `destination_converted` is true, count it as unchanged and skip it. Otherwise, if it already has both `country` and `place` (AC8), only set `destination_converted=True`. Otherwise call `best_match(trip.destination)`: a match sets `country` and `place`; no match (including an empty destination) sets `destination_unmatched=True`. Either way set `destination_converted=True` and `save_trip`. `DynamoTripStore.all_trips` pages through a table scan with `FilterExpression=begins_with(sk, :trip)` and `pk` beginning `USER#`, following `LastEvaluatedKey` like `list_trips`. A `__main__` block builds `get_trips()` from `app.routers.deps` and prints the report, including the unmatched trips for the quick check on real trips. It is run with `cd services/api && sh run-py.sh -m app.trips.convert_destinations`.
    files:
      - services/api/app/trips/store.py
      - services/api/app/trips/convert_destinations.py
      - services/api/README.md
    rationale: |
      Answers the deferred question: the conversion runs once as an explicit, idempotent command, not on each load. Running on each load would scan the whole table on every Lambda cold start, and it would contradict AC4 by converting newly typed trips. The command is safe to re-run because converted trips are skipped, and it prints the unmatched list so someone can check a few real trips (the item's "quick check"). The README gets a short "Destination conversion" section with the command and the rollback note.
  - description: |
      Show the Unmatched flag. Add `country?: string | null`, `place?: string | null` and `destination_unmatched?: boolean` to the `Trip` type in `apps/web/src/trips/api.ts`. In `MyTripsPage.tsx` `TripRow`, show `{trip.place}, {trip.country}` as the subline when both are set (otherwise the typed `destination`, as now), and render the flag inside `.trip-info` beside the title:

      ```tsx
      {trip.destination_unmatched && (
        <span className="badge badge-warning"><AlertIcon />Unmatched</span>
      )}
      ```

      In `TripDetailPage.tsx`, render the same badge inside the existing `.title-row` next to the `<h1>`, plus, under the title, the hint "We couldn't match this destination. Edit it to try again." as `.field-hint` text. "Edit it" is the existing Trip settings drawer (`TripSettingsDrawer` with `DestinationPicker`), which already saves the destination; no new screen is added. A small shared `UnmatchedBadge` component in `apps/web/src/trips/UnmatchedBadge.tsx` keeps list and detail identical.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/UnmatchedBadge.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: |
      Covers AC5, AC6 and (with the server change) AC7 in the UI: after the drawer saves, `onSaved` replaces the trip, so the badge disappears when the response has `destination_unmatched: false`. From the prototype: the badge is `.badge.badge-warning` with the alert icon (`#i-alert`) and the word "Unmatched", so it never relies on colour alone; it sits beside the title on the detail page (`data-wf-id="unmatched-flag"`) and in the trip row (`data-wf-id="trip-unmatched-flag"`); the hint text is the prototype's `#d-hint` copy. `.badge`, `.badge-warning` (`index.css:228-230`) and `.badge .icon` (`index.css:387`) already exist, so no new CSS is needed. Tokens used, all through those classes: `--color-warning`, `--color-warning-subtle`, `--space-1`, `--space-2`, `--font-size-sm`, `--radius-full`, `--border-width`. Tokens reach the app through `@import "../../../design-system/tokens.css"` at `apps/web/src/index.css:2`.
tests:
  - |
    AC1 — write first in `services/api/tests/unit/test_destination_conversion.py`, using an `InMemoryTripStore` with one legacy trip (`destination="Lisbon"`):

    ```python
    report = convert_destinations(store)
    trip = store.get_trip("owner", trip_id)
    assert (trip.country, trip.place) == best_match("Lisbon") == ("Portugal", "Lisbon")
    assert trip.destination_unmatched is False
    assert report.matched == 1
    ```
  - |
    AC2 — same file, a legacy trip with `destination="Sunny coast, somewhere"` and one with `destination=None`:

    ```python
    convert_destinations(store)
    for trip_id in (coast_id, empty_id):
        trip = store.get_trip("owner", trip_id)
        assert trip.destination_unmatched is True
        assert trip.country is None and trip.place is None
    ```

    Also assert a country-only ("Portugal") and a near miss ("Lisbn") are flagged, since only an outright place match is assigned.
  - |
    AC3 — `test_destination_match.py` for the Python port plus the shared fixture. The fixture `apps/web/src/places/destinationMatchCases.json` holds rows such as `{"query": "Lisbon, Portugal", "country": "Portugal", "place": "Lisbon"}`, `{"query": "  lisbon ", ...}`, `{"query": "Lisbon", ...}`, `{"query": "Portugal", "match": null}`, `{"query": "Lisbn", "match": null}`. Python and TypeScript both run every row:

    ```python
    @pytest.mark.parametrize("case", CASES)
    def test_best_match_agrees_with_the_dropdown_cases(case):
        assert best_match(case["query"]) == (tuple((case["country"], case["place"])) if "country" in case else None)
    ```

    ```ts
    it.each(cases)('evaluateDestination agrees on $query', ({ query, country, place }) => {
      const result = evaluateDestination(query, catalogue)
      expect(result.kind === 'place' ? [result.choice.country, result.choice.place] : null)
        .toEqual(country ? [country, place] : null)
    })
    ```

    plus, in the conversion test, `assert (trip.country, trip.place) == best_match("Lisbon, Portugal")` after converting a trip typed that way. In `destinationMatch.test.ts`, `expect(evaluateDestination('Lisbon, Portugal', catalogue)).toEqual({ kind: 'place', choice: { country: 'Portugal', place: 'Lisbon' } })` fails today (it returns `none`), so write it before the TypeScript change.
  - |
    AC4 — `services/api/tests/unit/test_trips_router.py` style router test (follow the existing router tests that use `tests/trip_body.py`): create a trip through `POST /trips` with `destination: "Lisbon"`, then run the conversion over the same store, then fetch it.

    ```python
    created = client.post("/trips", json=trip_body(destination="Lisbon")).json()
    assert created["country"] is None and created["place"] is None
    convert_destinations(store)
    after = client.get(f"/trips/{created['id']}").json()
    assert after["country"] is None and after["place"] is None
    assert after["destination_unmatched"] is False
    ```
  - |
    AC5 — `apps/web/src/trips/MyTripsPage.test.tsx`: mock `fetchTrips` to return one flagged trip and one normal trip.

    ```tsx
    const row = await screen.findByRole('listitem', { name: /coast trip/i })
    expect(within(row).getByText('Unmatched')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: /lisbon/i })).queryByText('Unmatched')).not.toBeInTheDocument()
    ```

    If the existing row has no accessible name, use the row's `Open <name>` link to find it, as the current tests do. Also assert a converted trip shows `Lisbon, Portugal`... in the list subline as `country, place` order of the prototype ("Portugal, Lisbon").
  - |
    AC6 — a `TripDetailPage` test (add to the existing detail-page tests or a new `TripDetailUnmatched.test.tsx` that follows their fetch mocks):

    ```tsx
    expect(await screen.findByText('Unmatched')).toBeInTheDocument()
    expect(screen.getByText("We couldn't match this destination. Edit it to try again.")).toBeInTheDocument()
    ```

    and with `destination_unmatched: false`, `expect(screen.queryByText('Unmatched')).not.toBeInTheDocument()`.
  - |
    AC7 — router test: store a converted, flagged trip, then `PUT /trips/{id}` with a destination that matches.

    ```python
    resp = client.put(f"/trips/{trip_id}", json=trip_body(destination="Lisbon, Portugal"))
    assert resp.json()["destination_unmatched"] is False
    assert (resp.json()["country"], resp.json()["place"]) == ("Portugal", "Lisbon")
    ```

    and a second case: `destination="nowhere at all"` leaves `destination_unmatched` true. Also a settings-drawer test in `TripSettingsDrawer`'s existing test file (or `DestinationPicker.test.tsx`): after `onSaved` receives a trip with `destination_unmatched: false`, the detail page no longer shows "Unmatched".
  - |
    AC8 — conversion test: a legacy trip stored with `destination="Lisbon"`, `country="Japan"`, `place="Kyoto"`.

    ```python
    before = store.get_trip("owner", trip_id).model_copy()
    report = convert_destinations(store)
    after = store.get_trip("owner", trip_id)
    assert (after.country, after.place) == ("Japan", "Kyoto")
    assert after.destination_unmatched is False
    assert after.model_dump(exclude={"destination_converted"}) == before.model_dump(exclude={"destination_converted"})
    ```
  - |
    Data and idempotency — existing rows stay readable. In `services/api/tests/unit/store_contract/` style, build a Dynamo-shaped item without the new keys and read it back:

    ```python
    trip = DynamoTripStore._to_trip({"pk": "USER#o", "sk": "TRIP#1", "id": "1", "name": "Old", "destination": "Lisbon"})
    assert (trip.country, trip.place, trip.destination_unmatched, trip.destination_converted) == (None, None, False, False)
    ```

    Running `convert_destinations` twice gives the same stored trips, and the second `ConversionReport` counts every trip as `unchanged`. A trip created after the first run (`destination_converted=True`, typed only) is untouched by a second run. Also test `all_trips` on `InMemoryTripStore` across two owners, and `DynamoTripStore.all_trips` with a fake table that returns two pages.
assumptions_or_open_questions:
  - |
    Deferred question "once as a migration or on each load?" is answered as a one-off idempotent command (`python -m app.trips.convert_destinations`), run once per environment after deploy. Please confirm the operator who deploys is happy to run a command, because there is no migration tool in `services/api` today (I searched the API's README, `run-py.sh`, `pyproject.toml` and `app/` for migration or backfill code and found none).
  - |
    Which matches count as "matched"? The plan assigns only an outright place match (exact place, or exact "Place, Country"). A country alone ("Portugal") and a near miss ("Lisbn", which the dropdown only offers as "Did you mean Lisbon?") are flagged Unmatched, because assigning a guess silently to existing data is risky and the dropdown itself asks for confirmation. If the reviewer wants near matches converted, it is a one-line change in `best_match`, but the flag would then hide wrong guesses.
  - |
    AC3 needs a change to the dropdown's own logic. The shared logic as it stands returns no match for "Lisbon, Portugal". The plan extends `evaluateDestination` so both forms give the same place, which also changes the live dropdown search slightly (typing "Lisbon, Portugal" now selects Lisbon instead of showing "No match").
  - |
    The prototype's detail page shows read-only typed, Country and Place fields, and its Edit screen has a live "Best match" line. The existing app edits the destination in the Trip settings drawer through `DestinationPicker` (with its own "Did you mean" suggestion), so the plan reuses that and does not build the standalone Edit destination screen. The detail page therefore shows the badge and hint, but not a read-only country/place card. If the reviewer wants that card or screen, it is extra scope.
  - |
    The prototype's New trip screen (typed "Lisbon" does not fill country or place) matches the existing `NewTripSetupPage`, which stores only `destination`. Nothing there changes. Nothing in this item makes the picker store `country` and `place` on new or edited trips, only the conversion and the flagged-trip edit do, so a later item must decide when the structured fields are written for trips created through the picker.
  - |
    The starter list is settled as seven countries (Japan, Portugal, India, Thailand, Mexico, Morocco, Peru), and `STARTER_DESTINATIONS` already names three places in each. Real trips with a destination outside that list (for example "Seville") will be flagged Unmatched, which is the intended outcome for AC2.
  - |
    The shared fixture lives in the web app (`apps/web/src/places/destinationMatchCases.json`) and the pytest file reads it by relative path from the repo root, which couples the two components' tests. The alternative is to duplicate the cases in both test files and accept possible drift. The plan prefers the shared file.
  - |
    The conversion's quick check on real trips is the printed report (matched, unmatched, and the typed text of each unmatched trip). I cannot run it against real data from here, so a person has to run it and look at a few results.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: no table or key schema change (DynamoDB is schemaless here). Four optional keys are added to the trip item: `country`, `place`, `destination_unmatched`, `destination_converted`. Existing items lack them and read back through the Pydantic defaults (`None`, `None`, `False`, `False`), so every stored trip stays readable and usable before the conversion runs. Until it runs, no trip shows a flag.
  - **Backfill / seed**: yes, the conversion command `cd services/api && sh run-py.sh -m app.trips.convert_destinations` is the backfill. It is idempotent: a trip with `destination_converted=True` is skipped, a trip that already has `country` and `place` only gets the marker, and re-running changes nothing. It scans the table once and writes one item per unconverted trip (single-item `put_item`, no table lock). It prints a report with the unmatched trips for the quick check. In local mode it runs against `PersistentTripStore`; the local seed trips ("Lisbon", "Kyoto") convert to a match.
  - **Settings**: none new. The command reuses `TRIPS_TABLE_NAME` (default `trip-planner-trips`, `app/config.py:56`) and `LOCAL_MODE` / `LOCAL_DATA_DIR` through `get_trips()`.
  - **Provisioning**: nothing to create. The identity that runs the command needs DynamoDB `Scan` on the trips table, in addition to the `Query`/`GetItem`/`PutItem` the API already has. This is a human step to confirm. The plan does not change any IAM or infrastructure files.
  - **Order and rollback**: deploy the API and web app first (they read the new fields with defaults), then run the command once. Rollback of the code is safe to leave the data in place: the extra keys are ignored by older code (`Trip` ignores unknown keys by default, so confirm that with the old model in the data test). To undo the data, a re-run is not needed; the fields can simply stay.

  ### Shape of the change

  ```mermaid
  flowchart TD
    cli["convert_destinations.py (new: one-off command)"]:::touched
    match["destination_match.py (new: Python best_match)"]:::touched
    starter["starter_destinations.py (catalogue source)"]
    store["trips/store.py (Trip fields, all_trips)"]:::touched
    router["routers/trips.py (create keeps fields, update clears flag)"]:::touched
    deps["routers/deps.py get_trips"]
    tsmatch["places/destinationMatch.ts (add Place, Country step)"]:::touched
    picker["trips/DestinationPicker.tsx (uses evaluateDestination)"]
    list["trips/MyTripsPage.tsx (badge on row)"]:::touched
    detail["trips/TripDetailPage.tsx (badge and hint)"]:::touched
    badge["trips/UnmatchedBadge.tsx (new, shared)"]:::touched
    drawer["trips/TripSettingsDrawer.tsx (saves destination, unchanged)"]
    cli --> match
    cli --> store
    cli --> deps
    match --> starter
    router --> match
    router --> store
    picker --> tsmatch
    list --> badge
    detail --> badge
    drawer --> router
    classDef touched fill:#f96,color:#000
  ```

  ### Other notes

  - Deployment is serverless (ADR-0006, API on Lambda via Mangum), which is why the conversion is not tied to startup: `lifespan` in `app/main.py` runs per cold start, and a table scan there would run on every one.
  - `all_trips` is a new method on the `TripStore` Protocol. `PersistentTripStore` (`app/trips/local_store.py`) extends `InMemoryTripStore`, so it inherits it. The store-contract suite under `services/api/tests/unit/store_contract/` is keyed to stories 068-072 in `criteria.py` (`test_every_story_068_to_072_is_covered`), so the new store tests go in a plain unit file, not in `CRITERIA`.
  - No new third-party package is needed: `unicodedata` is already used in `starter_destinations.py`, and the web side reuses `AlertIcon` from `apps/web/src/auth/icons`.
  - Narrow test commands: `cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_destination_conversion.py tests/unit/test_destination_match.py`, and `cd apps/web && pnpm run test -- src/places/destinationMatch.test.ts src/trips/MyTripsPage.test.tsx`.
review_focus: |
  IN: the Python port of the best match, the "Place, Country" extension (shared by the dropdown and the conversion, pinned by one fixture file), the four new server-owned Trip fields, the one-off idempotent conversion command, clearing the flag on a matching edit, and the Unmatched badge on the list and detail pages. OUT: the prototype's standalone Edit destination screen and live "Best match" line (the existing drawer and `DestinationPicker` are reused), and making the picker store country and place on new trips. Riskiest parts are the idempotency and AC4 guard (`destination_converted` must be true on newly created trips and must stop a re-run converting them) and keeping the TypeScript and Python matchers identical. Deliberate: only an outright place match is converted; country-only and near-miss destinations are flagged, and the conversion is a command, not a startup hook.
