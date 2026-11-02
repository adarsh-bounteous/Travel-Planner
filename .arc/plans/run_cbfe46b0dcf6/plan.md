summary: |
  Older trips (a country and place, no stored `location`) already get a location on first open, but `GET /trips/{trip_id}` resolves it inline (`services/api/app/routers/trips.py:335`), so the page waits on the lookup, and with the places provider off the `NoResolver` means a cached result is never used. This change moves the backfill off the request path (a FastAPI `BackgroundTasks` task that runs after the response is sent), adds a cache-only resolver used when the provider is off so a cached result still backfills, and makes the stored write safe against a concurrent open or edit by re-reading the trip and writing only if `location` is still empty. The visible destination (country, place, destination, `chosen_destination`) is never touched. List, create and update behaviour is unchanged.
scope:
  - description: |
      Add a cache-only resolver next to `DestinationResolver`/`CachedResolver`. It reads `LocationCache` with the existing `cache_key(country, place, destination)` and never calls an upstream or the rate limiter.

      ```python
      class CacheOnlyResolver:
          """Provider off: serves a result already in the cache, whatever its age; a miss is None. Makes no outside request."""

          def __init__(self, cache: LocationCache) -> None: ...

          def resolve(self, country, place, destination) -> ResolvedLocation | None:
              hit = self._cache.get(cache_key(country, place, destination))
              return hit[0] if hit else None
      ```
    files:
      - services/api/app/locations/resolver.py
    rationale: |
      AC3/AC4: with the provider off a cached result must still backfill and no cached result must leave the trip unresolved, with no outside request.
  - description: |
      Add a dependency `get_backfill_resolver() -> DestinationResolver`: `_resolver()` when `get_settings().is_live("places")`, else `CacheOnlyResolver(_location_cache())`. `_location_cache()` is an `lru_cache` helper returning `DynamoLocationCache(trips_table_name)` outside local mode and one shared `InMemoryLocationCache` in local mode; `_osm_places` in local mode switches from its private `InMemoryLocationCache()` to that shared instance so the two agree. `get_destination_resolver` (used by create and update) is left as is.
    files:
      - services/api/app/routers/deps.py
    rationale: |
      Keeps create/update on `NoResolver` when off (unchanged behaviour) while giving open its own provider-on / cache-only choice.
  - description: |
      Move the backfill off the request path in `get_trip`. Replace the inline block at line 335 with a background task, and add the task function.

      ```python
      def get_trip(..., background: BackgroundTasks,
                   resolver: DestinationResolver = Depends(get_backfill_resolver)) -> TripView:
          trip, owner, is_owner = _load(...)
          if trip.location is None and (trip.country and trip.place):
              background.add_task(_backfill_location, trips, owner, trip.id, resolver)
          ...  # rest unchanged; the response carries whatever is stored right now

      def _backfill_location(trips: TripStore, owner_id: str, trip_id: str, resolver: DestinationResolver) -> None:
          """Resolve once and store it. Never raises; never changes the destination or updated_at."""
          try:
              current = trips.get_trip(owner_id, trip_id)
              if current is None or current.location is not None:  # deleted, or another open got there first
                  return
              location = _located(current, resolver).location  # _located already swallows resolver errors
              if location is None:
                  return  # no match stays unstored, so a later open tries again (AC8)
              fresh = trips.get_trip(owner_id, trip_id)  # re-read just before writing so a concurrent edit is not overwritten
              if fresh is not None and fresh.location is None:
                  trips.save_trip(owner_id, fresh.model_copy(update={"location": location}))
          except Exception:
              logger.warning("Location backfill failed for trip %s", trip_id, exc_info=True)
      ```
      Only `location` is set, so `updated_at`, `country`, `place` and `destination` are exactly as before. An earlier no-match is never cached or stored, so every open with nothing stored retries (AC8) and the stored-once guard (AC5) is the `current.location is not None` check. The AC scope is a country AND a place, so a trip with neither is not backfilled here (the old inline code also tried a bare destination; that case is left to create/update).
    files:
      - services/api/app/routers/trips.py
    rationale: |
      AC1, 2, 5, 6, 7, 8 and the deferred two-tab question. Background tasks run after the response is sent, so the page never waits (AC6).
  - description: |
      Tests: add the router tests below to `test_trip_location_router.py` (rewriting `test_first_open_resolves_an_existing_trip`, which asserted the old inline behaviour), a `CacheOnlyResolver` unit test, and register the new `get_backfill_resolver` override in the shared `sign_in_as` fixture beside `get_destination_resolver` (same `FakeResolver`).
    files:
      - services/api/tests/unit/test_trip_location_router.py
      - services/api/tests/unit/test_cached_resolver.py
      - services/api/tests/conftest.py
    rationale: |
      TDD: these are written first and fail against the current inline code.
tests:
  - |
    AC1 (test_trip_location_router.py): an older trip with a country and place and no location, provider on, is opened, then it has a stored location.
    ```python
    def _older_trip(sign_in_as, client):
        store = sign_in_as.trips
        trip_id = client.post("/trips", json=body(country="Portugal", place="Lisbon")).json()["id"]
        (owner,) = {o for o, _ in store._trips}
        store.save_trip(owner, store.get_trip(owner, trip_id).model_copy(update={"location": None}))
        return store, owner, trip_id

    def test_opening_an_older_trip_stores_its_location(sign_in_as):
        client = sign_in_as("a@example.com")
        store, owner, trip_id = _older_trip(sign_in_as, client)
        client.get(f"/trips/{trip_id}")
        assert store.get_trip(owner, trip_id).location == LISBON
    ```
  - |
    AC2: not opened, so nothing is stored.
    ```python
    def test_an_unopened_older_trip_has_no_location(sign_in_as):
        client = sign_in_as("a@example.com")
        store, owner, trip_id = _older_trip(sign_in_as, client)
        client.get("/trips")  # listing does not backfill
        assert store.get_trip(owner, trip_id).location is None
    ```
  - |
    AC3 (test_cached_resolver.py plus a router test overriding get_backfill_resolver): provider off, a cached result exists, so the open stores it.
    ```python
    def test_cache_only_resolver_serves_a_cached_result():
        cache = InMemoryLocationCache()
        cache.put(cache_key("Portugal", "Lisbon", None), LISBON, datetime(2020, 1, 1, tzinfo=UTC))  # old age still served
        assert CacheOnlyResolver(cache).resolve("Portugal", "Lisbon", None) == LISBON
    ```
    Router test: override `deps.get_backfill_resolver` with `CacheOnlyResolver(cache)` holding that entry (the stored trip's `destination` is None for the key, so build the trip with `destination` matching the cache key), open the trip, `assert store.get_trip(owner, trip_id).location == LISBON`.
  - |
    AC4: provider off, empty cache, so no stored location and no outside call.
    ```python
    def test_cache_only_resolver_misses_without_a_cached_result():
        assert CacheOnlyResolver(InMemoryLocationCache()).resolve("Portugal", "Lisbon", None) is None
    ```
    Router test with `CacheOnlyResolver(InMemoryLocationCache())` override: after `client.get(...)`, `assert store.get_trip(owner, trip_id).location is None`, and the response is still 200.
  - |
    AC5: a stored location is left unchanged and not looked up again.
    ```python
    def test_a_stored_location_is_not_resolved_again(sign_in_as):
        client = sign_in_as("a@example.com")
        store, owner, trip_id = _older_trip(sign_in_as, client)
        client.get(f"/trips/{trip_id}")
        stored, calls = store.get_trip(owner, trip_id).location, sign_in_as.resolver.calls
        sign_in_as.resolver.failure = "no_match"  # a second lookup would now find nothing
        client.get(f"/trips/{trip_id}")
        assert store.get_trip(owner, trip_id).location == stored
        assert sign_in_as.resolver.calls == calls
    ```
    Also two opens racing: a resolver that, inside `resolve`, saves a different location onto the trip (simulating the other tab) leaves that other location in place, `assert store.get_trip(owner, trip_id).location == OTHER`.
  - |
    AC6: the response does not wait for the lookup. The first open's body carries no location although the resolver would have found one, and the lookup runs only after the response is built.
    ```python
    def test_open_shows_the_page_before_the_lookup(sign_in_as):
        client = sign_in_as("a@example.com")
        store, owner, trip_id = _older_trip(sign_in_as, client)
        sign_in_as.resolver.calls = 0
        background = BackgroundTasks()
        view = get_trip(trip_id, background=background, user=owner, trips=store, ..., resolver=sign_in_as.resolver)
        assert view.location is None and sign_in_as.resolver.calls == 0  # nothing resolved yet
        assert len(background.tasks) == 1
    ```
    (The implementer may build the direct call from the route's real parameters, or instead assert `response.json()["location"] is None` on the first HTTP open and `LISBON` on the second.)
  - |
    AC7: the visible destination is the same before and after the location is stored.
    ```python
    def test_backfill_leaves_the_destination_alone(sign_in_as):
        client = sign_in_as("a@example.com")
        store, owner, trip_id = _older_trip(sign_in_as, client)
        before = store.get_trip(owner, trip_id)
        client.get(f"/trips/{trip_id}")
        after = store.get_trip(owner, trip_id)
        assert (after.destination, after.country, after.place) == (before.destination, before.country, before.place)
        assert after.updated_at == before.updated_at and after.location == LISBON
        assert chosen_destination(after) == chosen_destination(before)
    ```
  - |
    AC8: an earlier lookup found no match, the provider now matches, so the next open stores it.
    ```python
    def test_a_trip_with_an_earlier_no_match_is_retried(sign_in_as):
        client = sign_in_as("a@example.com")
        store, owner, trip_id = _older_trip(sign_in_as, client)
        sign_in_as.resolver.fail_with("no_match")
        client.get(f"/trips/{trip_id}")
        assert store.get_trip(owner, trip_id).location is None
        sign_in_as.resolver.failure = None
        client.get(f"/trips/{trip_id}")
        assert store.get_trip(owner, trip_id).location == LISBON
    ```
  - |
    Regression: a resolver that raises leaves the open at 200 and no stored location (`sign_in_as.resolver.fail_with("raises")`, `assert client.get(...).status_code == 200`). The existing `test_list_does_not_resolve`, `test_unchanged_destination_is_not_resolved_again` and create/update tests must still pass unchanged.
assumptions_or_open_questions:
  - |
    Deferred question (two tabs): answered by `_backfill_location` re-reading the trip and writing only when `location` is still None, and writing a fresh copy so it cannot overwrite an edit from the other tab. This is check-then-write, not atomic: two opens within the same few milliseconds can both write, but both would store the same cached result, and only `location` changes. A truly atomic write (a DynamoDB conditional `UpdateItem` with `attribute_not_exists(location)`) would add a new `TripStore` method and touch the store contract suite (`tests/unit/store_contract`); I judged that out of proportion. Reviewer: say if you want it.
  - |
    Behaviour change to confirm: on the very first open the response now carries `location: null` and the location appears from the next open (it is stored right after the response). The web app does not read `location` today (the matches for `location` under apps/web/src are `window.location` / router location), so no web change is planned.
  - |
    A cached result is served with the provider off whatever its age (the 30-day `LOCATION_TTL` is not applied); AC3 says only that a cached result exists. Say if an expired entry should count as a miss.
  - |
    Scope is a trip with a country AND a place (as in the ACs). A trip with only a free-text destination is no longer backfilled on open (the old inline code tried it); create and update still resolve those.
  - |
    In local mode the only cache an off provider can read is the in-memory one shared with `_osm_places`; nothing writes it while the places provider is off, so local-mode off always misses (AC4), which matches the story.
  - |
    Background tasks on AWS Lambda behind Mangum: the work runs after the response is produced inside the same invocation; the plan assumes it completes before the invocation freezes (it is a single cache read, or one rate-limited Nominatim call when the provider is on). If it is cut off, the next open simply retries.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — no schema, migration, setting or env var change. The `location` field and the `GEOCODE#` cache items already exist; the only stored-data effect is that existing trips lacking `location` gain one the first time they are opened, through the existing `save_trip`. The backfill is idempotent (it writes only when `location` is empty) and safe to re-run; rollback is to revert the code, and a location already stored is a valid field that older code reads. Test `test_trip_saved_before_location_existed_loads_unchanged` (`tests/unit/test_trip_location_store.py`) already covers old rows loading.

  ### Findings

  - `get_trip` (`services/api/app/routers/trips.py:323`) already resolves on open, synchronously and only through `get_destination_resolver`, which returns `NoResolver` when `is_live("places")` is false (`deps.py:116`). So AC1, 5 and 8 mostly hold today; the real gaps are AC3 (cache use when off) and AC6 (not blocking).
  - `DynamoTripStore.save_trip` is a whole-item `put_item`, so a background write of a stale copy could clobber a concurrent edit. That is why the task re-reads the trip right before saving.
  - `chosen_destination` and the other `app/trips` modules never read `location`, so setting it cannot change the visible destination; AC7 is a guard test.

  ```mermaid
  flowchart TD
    GT[routers/trips.py get_trip] -->|adds background task| BL[routers/trips.py _backfill_location]
    GT -->|new dependency| GB[routers/deps.py get_backfill_resolver]
    GB -->|provider on| CR[locations/resolver.py CachedResolver]
    GB -->|provider off| CO[locations/resolver.py CacheOnlyResolver]
    CO --> LC[locations/cache.py LocationCache]
    CR --> LC
    BL --> TS[trips/store.py TripStore get_trip and save_trip]
    classDef touched fill:#f96,color:#000
    class GT,BL,GB,CO touched
  ```
  Touched: `get_trip` and `_backfill_location` (move the lookup off the request path), `get_backfill_resolver` (provider on or off choice), `CacheOnlyResolver` (new). The cache, `CachedResolver` and `TripStore` are unchanged context.

  No UI step, so the design-system and component-catalogue rules do not apply.
review_focus: |
  IN: `get_trip` backfill only, via the new `get_backfill_resolver`, `CacheOnlyResolver` and a background `_backfill_location`. OUT: create/update/list behaviour, the web app, store schema and any new `TripStore` method. Riskiest part is the write path: it must set only `location` on a freshly re-read trip (no `updated_at` change, no overwrite of concurrent edits) and must never raise into the response. Deliberate: the first open returns `location: null` and the stored value shows from the next open; the two-tab guard is check-then-write rather than a conditional DynamoDB write (listed as an open question).
