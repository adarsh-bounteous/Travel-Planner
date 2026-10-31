summary: |
  Resolve a Trip's destination (its country and place, else the typed destination) to a real location through a new
  `DestinationResolver` port with a Nominatim adapter. The result is stored on the Trip as one optional nested
  `location` (canonical name, ISO country code, lat/lng, IANA time zone, bounding box). A `CachedResolver` decorator
  gives a long-lived cache (30-day expiry, checked against a stored `resolved_at`, not DynamoDB TTL) and a
  one-request-per-second limiter that follows Nominatim's usage policy. Resolution runs when a trip is created or its
  destination is edited, and on the first open of an existing trip that has no `location`. Any failure (no match,
  network error, bad payload) leaves `location` unset and never blocks the save. The migration only adds an optional
  field: DynamoDB is schemaless, so no existing item is rewritten.
scope:
  - description: |
      Domain models and the port. New package `app/locations`.
      ```python
      class BoundingBox(BaseModel):
          south: float; north: float; west: float; east: float

      class ResolvedLocation(BaseModel):
          name: str            # canonical display name
          country_code: str    # ISO 3166-1 alpha-2, upper-case
          lat: float
          lng: float
          time_zone: str       # IANA, e.g. "Europe/Lisbon"
          bbox: BoundingBox

      class DestinationResolver(Protocol):
          def resolve(self, country: str | None, place: str | None, destination: str | None) -> ResolvedLocation | None: ...
      ```
      Contract: `resolve` never raises. No match or unreachable returns `None`.
    files:
      - services/api/app/locations/__init__.py
      - services/api/app/locations/resolver.py
    rationale: |
      Follows the existing port pattern (`PlaceSearch` Protocol in `app/places/search.py`, in-memory and real adapters).
      Later features depend only on the port.
  - description: |
      Nominatim adapter `NominatimResolver(base_url, user_agent, http_get, tz_lookup)`. It calls
      `GET {base_url}/search?format=jsonv2&limit=1&addressdetails=1&q=...`, sends the identifying `User-Agent`, and uses a
      10 s timeout (matching `cognito_identity.py`). It maps the first hit: `display_name` to `name`,
      `address.country_code` upper-cased, `lat` and `lon` as floats, and `boundingbox` (the
      `[south, north, west, east]` strings) to `BoundingBox`. Nominatim does not return a time zone, so it is derived
      offline from the coordinates through an injected `tz_lookup(lat, lng) -> str | None`, which wraps
      `timezonefinder.TimezoneFinder().timezone_at`. A hit with no country code or no time zone counts as unresolved,
      because the five fields are stored all-or-nothing. It catches `httpx.HTTPError`, `ValueError`, `KeyError`,
      `IndexError` and `TypeError`, logs a warning, and returns `None`. It uses `httpx`, which is already a dependency.
      The HTTP call is injected so tests never touch the network.
    files:
      - services/api/app/locations/nominatim.py
      - services/api/pyproject.toml
      - services/api/requirements.txt
    rationale: |
      Isolates the provider. `timezonefinder` is the only new package and is needed because Nominatim has no time zone
      (AC1 and AC2 require one).
  - description: |
      Cache, limiter and the decorator.
      ```python
      class LocationCache(Protocol):
          def get(self, key: str) -> tuple[ResolvedLocation, datetime] | None: ...   # (location, resolved_at)
          def put(self, key: str, location: ResolvedLocation, resolved_at: datetime) -> None: ...

      LOCATION_TTL = timedelta(days=30)

      class RateLimiter:
          def __init__(self, clock: Callable[[], float], sleep: Callable[[float], None], min_interval: float = 1.0): ...
          def wait(self) -> None: ...   # thread-safe; sleeps so two calls are never < min_interval apart

      class CachedResolver:
          def __init__(self, upstream: DestinationResolver, cache: LocationCache, limiter: RateLimiter,
                       now: Callable[[], datetime], ttl: timedelta = LOCATION_TTL): ...
      ```
      Cache key: `"|".join(part.strip().casefold() for part in (country, place, destination))`. `CachedResolver.resolve`
      returns a cached entry whose age is less than `ttl` without calling upstream. Otherwise it calls
      `limiter.wait()` and then upstream. On a result it calls `cache.put(key, result, now())` and returns it. On `None`
      it caches nothing. An expired entry that upstream cannot refresh returns `None`, not stale data.
      `InMemoryLocationCache` is used by tests and local mode. `DynamoLocationCache` writes items
      `{pk: "GEOCODE#<sha256(key)>", sk: "GEOCODE", location: {...}, resolved_at: iso}` into the trips table, as
      `save_invite` and `save_share_link` already do. Floats become `Decimal` on write because boto3 rejects floats
      (`DynamoTripStore.save_trip` has the same issue, see the store item below).
    files:
      - services/api/app/locations/resolver.py
      - services/api/app/locations/cache.py
    rationale: |
      Covers AC3, AC4, AC8 and AC9. The limiter takes an injected clock and sleep so the one-second gap is tested
      without real waiting.
  - description: |
      Trip fields, additive only. In `app/trips/store.py` import `ResolvedLocation` and add one field to `Trip`:
      `location: ResolvedLocation | None = None  # server-owned: set only by destination resolution, never read from a request body`.
      `TripFields` and `TripCreate` are untouched, so a client cannot supply it. `DynamoTripStore.save_trip` currently
      converts only `budget` to `Decimal`. Add `_decimals(value)`, which recursively converts floats to `Decimal` in the
      dumped item, so `lat`, `lng` and `bbox` can be written. `_to_trip` already validates floats from `Decimal`
      through pydantic. `None` is already dropped, so unresolved trips write no `location` attribute.
    files:
      - services/api/app/trips/store.py
    rationale: |
      This is the "migration that only adds the fields". No existing attribute is renamed, retyped or backfilled, so
      AC5 holds. `PersistentTripStore` (local mode) round-trips the field through `model_dump(mode="json")` with no
      code change.
  - description: |
      Router wiring in `app/routers/trips.py` and `app/routers/deps.py`.
      ```python
      # deps.py
      @lru_cache
      def _resolver() -> DestinationResolver:   # CachedResolver(NominatimResolver(...), DynamoLocationCache(trips_table_name), RateLimiter(...), now)
      def get_destination_resolver() -> DestinationResolver:  # local mode: NoResolver (returns None, no outside request)
      ```
      ```python
      # trips.py
      def _located(trip: Trip, resolver: DestinationResolver) -> Trip:
          """trip with `location` set from its destination; None when it cannot be resolved. Never raises."""
      ```
      - `create_trip` and `update_trip` take `resolver: DestinationResolver = Depends(get_destination_resolver)`.
      - `create_trip` resolves the new trip before `save_trip`.
      - `update_trip` re-resolves only when the destination, country or place differs from `existing`. If that
        resolution fails, `location` is cleared so a stale location is never kept for a new destination. Otherwise the
        stored `location` is kept. This runs after `_rematched`, so a matched country and place are used.
      - `get_trip` resolves when `trip.location is None` and the trip has a destination, then saves under `owner` without
        touching `updated_at` (as `_converted` does) and returns the result. It runs after `_load`'s conversion, so a
        converted country and place are used. An unresolved result is not saved.
      - `list_trips` does not resolve, because it would fan out Nominatim calls.
      - The resolver is wrapped in `try/except Exception` in `_located`, so no failure can fail the request.
    files:
      - services/api/app/routers/trips.py
      - services/api/app/routers/deps.py
    rationale: |
      AC1, AC2, AC6 and AC7. First open is the item's trigger for existing trips. Editors opening a trip also trigger
      it, saved under the owner id returned by `_load`.
  - description: |
      Settings, in `app/config.py` and `services/api/README.md`: `nominatim_base_url`
      (env `NOMINATIM_BASE_URL`, default `https://nominatim.openstreetmap.org`) and `nominatim_user_agent`
      (env `NOMINATIM_USER_AGENT`, default `trip-planner-api`). Document both in the README next to the table settings.
    files:
      - services/api/app/config.py
      - services/api/README.md
    rationale: |
      Nominatim policy requires an identifying User-Agent, and a self-hosted or commercial endpoint can replace the
      public one without a code change.
  - description: |
      Tests, written first (see `tests`). The autouse conftest must never reach the network. Add to `sign_in_as` in
      `services/api/tests/conftest.py` an override `deps.get_destination_resolver` returning a
      `FakeResolver`, exposed as `make.resolver`.
    files:
      - services/api/tests/conftest.py
      - services/api/tests/unit/test_nominatim_resolver.py
      - services/api/tests/unit/test_cached_resolver.py
      - services/api/tests/unit/test_rate_limiter.py
      - services/api/tests/unit/test_trip_location_router.py
      - services/api/tests/unit/test_trip_location_store.py
    rationale: |
      Matches the existing `tests/unit/test_*.py` layout and the `sign_in_as` fixture's dependency-override pattern.
tests:
  - |
    AC1 (create, `test_trip_location_router.py`) — fails first because `Trip` has no `location`.
    ```python
    def test_creating_a_trip_stores_the_resolved_location(sign_in_as):
        client = sign_in_as("a@example.com")
        created = client.post("/trips", json=trip_body(destination="Lisbon")).json()
        loc = client.get(f"/trips/{created['id']}").json()["location"]
        assert loc["name"] == "Lisbon, Portugal" and loc["country_code"] == "PT"
        assert loc["time_zone"] == "Europe/Lisbon"
        assert (loc["lat"], loc["lng"]) == (38.7167, -9.1333)
        assert set(loc["bbox"]) == {"south", "north", "west", "east"}
    ```
    A second test: `PUT` with a changed destination stores the new location.
  - |
    AC2 (first open, `test_trip_location_router.py`):
    ```python
    def test_first_open_resolves_an_existing_trip(legacy):   # store.save_trip(owner, Trip(id="t1", name="X", destination="Lisbon"))
        client, save = legacy
        save("t1", "Lisbon")
        assert client.get("/trips/t1").json()["location"]["country_code"] == "PT"
        assert store.get_trip(owner, "t1").location is not None            # saved, not only returned
        assert store.get_trip(owner, "t1").updated_at is None              # open does not touch updated_at
    ```
    Also: the second open makes no resolver call, and `GET /trips` (list) makes none.
  - |
    AC3 and AC8 (cache, `test_cached_resolver.py`). The clock is injected, and the upstream is a spy counting calls.
    ```python
    def test_cached_destination_is_not_requested_again():
        upstream = SpyResolver(LISBON)
        resolver = CachedResolver(upstream, InMemoryLocationCache(), no_wait_limiter(), now=clock)
        resolver.resolve("Portugal", "Lisbon", None)
        assert resolver.resolve("Portugal", "Lisbon", None) == LISBON
        assert upstream.calls == 1

    def test_destination_resolved_29_days_ago_is_served_from_cache():
        resolver.resolve("Portugal", "Lisbon", None); clock.advance(days=29)
        assert resolver.resolve("Portugal", "Lisbon", None) == LISBON
        assert upstream.calls == 1
    ```
    The key is case and whitespace insensitive: `" lisbon "` hits the entry stored for `"Lisbon"`.
  - |
    AC9 (expiry, `test_cached_resolver.py`):
    ```python
    def test_destination_resolved_31_days_ago_is_requested_again_and_stored():
        resolver.resolve("Portugal", "Lisbon", None); clock.advance(days=31)
        upstream.result = LISBON_REFRESHED
        assert resolver.resolve("Portugal", "Lisbon", None) == LISBON_REFRESHED
        assert upstream.calls == 2
        assert cache.get(KEY)[0] == LISBON_REFRESHED and cache.get(KEY)[1] == clock()
    ```
    Also: an expired entry with a failing upstream returns `None`.
  - |
    AC4 (limiter, `test_rate_limiter.py` and `test_cached_resolver.py`), with a fake clock and a recording `sleep`:
    ```python
    def test_back_to_back_waits_are_at_least_one_second_apart():
        clock = FakeClock(); limiter = RateLimiter(clock.now, clock.sleep, 1.0)
        stamps = []
        for _ in range(3):
            limiter.wait(); stamps.append(clock.now())
        assert all(b - a >= 1.0 for a, b in zip(stamps, stamps[1:]))
    ```
    Plus a `CachedResolver` test: three distinct destinations give three upstream timestamps, each at least 1 s after
    the previous. A cache hit calls `limiter.wait` zero times.
  - |
    AC5 (migration, `test_trip_location_store.py`). Existing rows stay readable and unchanged:
    ```python
    def test_trip_saved_before_location_existed_loads_unchanged():
        item = {"pk": "USER#u", "sk": "TRIP#t1", "id": "t1", "name": "Old", "destination": "Lisbon",
                "budget": Decimal("500"), "currency": "USD", "days": [], "destination_converted": True}
        trip = DynamoTripStore._to_trip(item)
        assert (trip.name, trip.destination, trip.budget, trip.currency) == ("Old", "Lisbon", 500.0, "USD")
        assert trip.location is None
    ```
    Also in `PersistentTripStore`: a data file written before the field loads and round-trips with every value equal.
    `DynamoTripStore.save_trip` with a located trip passes no `float` anywhere in the item (a fake table asserts
    this), and an unresolved trip's item has no `location` key. Add a rule to
    `tests/unit/store_contract/rules_trips.py` that a located trip round-trips on local and cloud stores.
  - |
    AC6 and AC7 (failure, `test_trip_location_router.py` and `test_nominatim_resolver.py`):
    ```python
    @pytest.mark.parametrize("failure", ["no_match", "unreachable", "garbage_payload", "no_time_zone"])
    def test_unresolved_destination_saves_without_location(sign_in_as, failure):
        make.resolver.fail_with(failure)
        response = client.post("/trips", json=trip_body(destination="Atlantis"))
        assert response.status_code == 201
        assert response.json()["location"] is None
        assert client.get(f"/trips/{response.json()['id']}").json()["location"] is None
    ```
    The same through `PUT`, which also asserts a previously stored `location` is cleared when the destination changes
    and the new one cannot be resolved. A resolver that raises `RuntimeError` still gives a 2xx. The adapter tests use
    an `http_get` stub: `[]` returns `None`, `httpx.ConnectError` returns `None` and does not raise, a 503 returns
    `None`, and a hit with no `address.country_code` returns `None`.
  - |
    Adapter mapping (`test_nominatim_resolver.py`), a canned jsonv2 hit for Lisbon:
    ```python
    assert resolver.resolve("Portugal", "Lisbon", None) == ResolvedLocation(
        name="Lisbon, Portugal", country_code="PT", lat=38.7167, lng=-9.1333, time_zone="Europe/Lisbon",
        bbox=BoundingBox(south=38.69, north=38.80, west=-9.23, east=-9.09))
    ```
    The request carries the `User-Agent`, `format=jsonv2` and `limit=1`.
assumptions_or_open_questions:
  - |
    Time zone source. Nominatim returns no time zone, so the plan adds `timezonefinder` (offline lookup from
    coordinates, no extra request or rate limit). It adds package weight to the Lambda bundle (`build.sh`). If the
    team prefers another approach (a separate tz API, or a bundled shapefile), the `tz_lookup` seam in
    `NominatimResolver` is the only place that changes. Needs a human decision before code starts.
  - |
    Rate limiting is per process only. The API runs on Lambda, where concurrent containers each hold their own
    limiter, so the one-request-per-second guarantee (AC4) holds within one container, not across all of them.
    A global guarantee would need a shared lock (a DynamoDB conditional write) or reserved concurrency of 1 on the
    resolving path. This plan implements the in-process limiter only and treats AC4 as met at that level. Please
    confirm that is enough.
  - |
    The cache is kept in the trips DynamoDB table (items `GEOCODE#<hash>`) so no new table has to be provisioned.
    If the team wants a separate table, `DynamoLocationCache` takes the table name from settings.
  - |
    Resolution runs inside the request that creates, edits or first opens a trip, so a cache miss adds up to about
    1 s of limiter wait plus the Nominatim round trip (10 s timeout) to that request. Resolving in the background
    would avoid this, but the item asks for it at set or open time. Failed resolutions are not cached, so an
    unresolved trip retries on each open.
  - |
    Public Nominatim terms: a valid identifying User-Agent is required (`NOMINATIM_USER_AGENT`, default
    `trip-planner-api` is a placeholder; production should set an app and contact string), results must be cached
    (done), and heavy use is not allowed (10,000 users may need a self-hosted instance via `NOMINATIM_BASE_URL`).
    OSM attribution may be needed wherever the location is later displayed. That is out of scope here.
  - |
    Deferred project-wide question (monitoring of OSM provider availability and rate-limit errors): not in this
    item's acceptance criteria, so no metrics or alarms are planned. The adapter logs a warning on every failure,
    including 429 and 503 responses, so later monitoring has a signal to hook onto. Needs an owner decision.
  - |
    Local mode (`get_settings().local_mode`) uses a resolver that returns `None`, in line with the convention that
    local mode makes no outside request. Trips therefore stay unresolved locally. A deterministic local stub could be
    added if the web needs locations in local mode.
  - |
    The location is a single nested optional field (`location`), not five flat columns, so "no resolved location
    fields" is one `None`. All five parts are stored together or not at all. The web app does not display it in this
    item, so no UI or design-token work is planned.
estimated_points: 5
package_dependencies:
  - name: timezonefinder
    version: ">=6.5"
    ecosystem: pip
    component_id: comp_trip_planner_api
    rationale: |
      Derives the IANA time zone offline from the coordinates Nominatim returns, since Nominatim itself has no time
      zone. Needed for the stored time zone (AC1, AC2).
notes: |
  ### Data & rollout
  - **Existing data**: The only schema change is a new optional `Trip.location` (default `None`). DynamoDB has no
    migration step: existing trip items lack the attribute and load with `location=None` through `Trip.model_validate`.
    No attribute is renamed, retyped, or rewritten, so every existing field value is unchanged (AC5). The local-mode data
    file (`FORMAT_VERSION` 1) needs no version bump, because the new field is optional.
  - **Backfill / seed**: No batch backfill. Existing trips resolve lazily on first open (`GET /trips/{id}`), saved once and
    idempotently (a trip that already has `location` is skipped). `updated_at` is not changed. No seed is needed.
  - **Settings**: `NOMINATIM_BASE_URL` (default `https://nominatim.openstreetmap.org`) and `NOMINATIM_USER_AGENT`
    (default `trip-planner-api`). Both are safe when unset, and both are documented in `services/api/README.md`.
  - **Provisioning**: Nothing new. The cache items live in the existing trips table (`TRIPS_TABLE_NAME`), so the Lambda
    role needs no new permission. It needs outbound HTTPS to Nominatim (check the Lambda is not VPC-isolated without a
    NAT). The `timezonefinder` package must be in the Lambda bundle (`services/api/build.sh`).
  - **Order and rollback**: Deploy the API only; there is no ordering constraint. Old code ignores unknown stored fields
    only if pydantic ignores extras (the default), so a rollback is safe. `location` and `GEOCODE#` items are left in place
    and harmlessly ignored.

  ### Design notes
  - New code lives in `app/locations/`, one level below the existing ports (`app/places/search.py` is the model).
  - Dependency direction: `trips.py` router -> `DestinationResolver` port -> `CachedResolver` -> `NominatimResolver`
    and `DynamoLocationCache`.
  - Current behaviour to preserve: `POST /trips` leaves `country` and `place` unset (see
    `test_trips_conversion_router.py`), so the resolver query falls back to `destination` text when country and
    place are missing, and uses place plus country when both are present.
  - `DynamoTripStore.save_trip` today converts only `budget` to `Decimal`, and boto3 rejects floats, so adding float
    coordinates to `Trip` would raise on every real save without the recursive `_decimals` change.

  ```mermaid
  flowchart TD
    R[routers/trips.py] -->|resolve on create, edit, first open| P[locations/resolver.py port + CachedResolver]
    D[routers/deps.py] -->|wires resolver, picks local stub| P
    P --> L[RateLimiter]
    P --> C[locations/cache.py]
    P --> N[locations/nominatim.py]
    R --> S[trips/store.py Trip.location + Decimal write]
    C -->|GEOCODE items| T[(Trips table)]
    S --> T
    CFG[config.py settings] --> D
    classDef touched fill:#f96,color:#000
    class R,D,P,C,N,S,CFG,L touched
  ```
review_focus: |
  IN scope: the resolver port, Nominatim adapter, cache with 30-day expiry, per-process one-second limiter, the
  additive `Trip.location` field, and resolve-on-create, edit and first-open wiring. OUT: any web UI, list-time
  resolution, background jobs, monitoring and alarms, a cross-container rate limit, and the places or forecast features
  that will use the data later. Riskiest areas: `DynamoTripStore.save_trip` float-to-Decimal handling (real saves break
  without it) and the guarantee that no resolver failure can fail or block a save. Deliberate choices: expiry is checked
  from a stored `resolved_at` rather than DynamoDB TTL, failures are not cached, and `timezonefinder` supplies the time
  zone because Nominatim does not.
