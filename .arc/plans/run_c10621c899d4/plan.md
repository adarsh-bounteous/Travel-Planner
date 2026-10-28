summary: |
  In local mode the stay, flight and transport providers (app/travel/local.py) generate booking links of the form `local://booking/...`. When a pick is saved, `ChosenStay.url` and `TransportPick.url` in services/api/app/trips/store.py are typed `HttpUrl`, which rejects the `local://` scheme, so the PUT fails validation and the traveller sees an error and no chosen option. This plan adds one shared booking-link type that accepts http(s) URLs (as today) or a `local://booking/` reference, and uses it on both models, so stays, flights and transport are fixed together. Separately, the web Trip detail page enables Book trip only when `trip.options`, `trip.sim` or `trip.insurance` is set (TripDetailPage.tsx:126) and ignores chosen stays and transport picks, so AC3 also needs `bookable` to count them.
scope:
  - description: |
      Add a shared booking-link type to store.py and use it for the two pick models that local mode saves.

      ```python
      LOCAL_BOOKING_PREFIX = "local://booking/"
      _HTTP_URL = TypeAdapter(HttpUrl)

      def _booking_url(value: str) -> str:
          """An http(s) page as before, or a local-mode booking reference. Anything else is refused."""
          if value.startswith(LOCAL_BOOKING_PREFIX):
              return value
          return str(_HTTP_URL.validate_python(value))

      BookingUrl = Annotated[str, AfterValidator(_booking_url)]
      ```

      Then change `ChosenStay.url: HttpUrl` and `TransportPick.url: HttpUrl` to `BookingUrl`. `ChosenSim`, `InsurancePick` and `ChosenOption.booking_url` stay `HttpUrl` (not in the ACs). Stored values stay plain strings, so rows already saved with http(s) URLs load unchanged.
    files:
      - services/api/app/trips/store.py
    rationale: |
      Root cause shared by all three kinds: pydantic HttpUrl only allows http/https. Validating a str keeps http(s) behaviour identical, still refuses junk such as `javascript:` or `ftp:`, and admits only the local booking prefix.
  - description: |
      Make local.py reuse the prefix constant instead of defining a second copy: `BOOKING_PREFIX = LOCAL_BOOKING_PREFIX` imported from app.trips.store (store.py imports only profile_store, so no cycle; confirm when implementing).
    files:
      - services/api/app/travel/local.py
    rationale: One source of truth for the prefix, so the generator and the validator cannot drift.
  - description: |
      Count chosen stays and transport picks when deciding whether Book trip is enabled:

      ```tsx
      const bookable =
        options.length > 0 ||
        Boolean(trip.sim) ||
        Boolean(trip.insurance) ||
        (trip.stays ?? []).some((s) => s.chosen) ||
        (trip.transport ?? []).length > 0
      ```
    files:
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: AC3. Today a trip whose only pick is a stay, flight or transport leg leaves Book trip disabled even after a successful save. The drawer itself is not changed (see open questions).
  - description: |
      Failing tests first (see `tests`): API model/router tests for local URLs, and a web test for the enabled button.
    files:
      - services/api/tests/unit/test_chosen_stay_router.py
      - services/api/tests/unit/test_transport_picks_router.py
      - services/api/tests/unit/test_trip_pick_booking_url.py
      - apps/web/src/trips/TripDetailPage.test.tsx
    rationale: TDD order. Each acceptance criterion maps to one or more failing tests.
tests:
  - |
    AC1 and AC2, stay. New file services/api/tests/unit/test_trip_pick_booking_url.py, a model-level test that fails today with a ValidationError:

    ```python
    def test_chosen_stay_accepts_a_local_booking_reference():
        url = "local://booking/stay-lisbon-1?start=2027-03-12&end=2027-03-15"
        chosen = ChosenStay(property_id="p", name="n", provider="Local stays", url=url, total=Decimal(100), currency="EUR")
        assert chosen.url == url

    @pytest.mark.parametrize("bad", ["javascript:alert(1)", "ftp://example.com/x", "local://other/x", "not a url"])
    def test_pick_urls_still_refuse_other_schemes(bad):
        with pytest.raises(ValidationError):
            ChosenStay(property_id="p", name="n", provider="x", url=bad, total=Decimal(1), currency="EUR")

    def test_http_urls_are_unchanged():
        chosen = ChosenStay(property_id="p", name="n", provider="x", url="https://example.com/stays/a", total=Decimal(1), currency="EUR")
        assert chosen.url == "https://example.com/stays/a"
    ```
  - |
    AC1 and AC2, stay through the router with the real local providers. In test_chosen_stay_router.py override `deps.get_stay_providers` with `[LocalStayProvider()]`, build the shortlist for Lisbon and assert:

    ```python
    r = a.put(_url(tid, sid), json={"property_id": ranked[0]["property"]["id"]})
    assert r.status_code == 200
    assert r.json()["stays"][0]["chosen"]["url"].startswith("local://booking/")
    assert a.get(f"/trips/{tid}").json()["stays"][0]["chosen"]["property_id"] == ranked[0]["property"]["id"]
    ```
  - |
    AC1 and AC2, flight and transport. In test_transport_picks_router.py add a Local provider case, using `deps.get_flight_providers` overridden with `[LocalFlightProvider()]`. Take an option id from `LocalFlightProvider().fetch("Porto", "Lisbon", date(2027, 11, 18))` and assert:

    ```python
    r = a.put(f"/trips/{tid}/transport/destination", json={"origin": "Porto", "destination": "Lisbon", "date": "2027-11-18", "option_id": option.id})
    assert r.status_code == 200
    assert r.json()["transport"][0]["url"].startswith("local://booking/")
    assert a.get(f"/trips/{tid}").json()["transport"][0]["option_id"] == option.id
    ```
    The router only reads flight providers, so confirm when implementing whether `LocalTransportProvider` options can reach `pick_transport` and record the answer (see open questions).
  - |
    AC3, web. In TripDetailPage.test.tsx, in the 'TripDetailPage book trip' describe, add one test per case that fails today. Each opens a trip with `options: []` and no sim or insurance:

    ```tsx
    open(trip({ options: [], stays: [stayWith({ chosen: localChosenStay })] }))
    expect(await bookButton()).toBeEnabled()

    open(trip({ options: [], transport: [localTransportPick] }))
    expect(await bookButton()).toBeEnabled()
    ```
    Keep the existing 'disables Book trip when nothing is chosen (AC1)' test green: a trip with `stays` but no `chosen` and `transport: []` stays disabled.
  - |
    Regression. The existing http(s) tests in test_chosen_stay_router.py and test_transport_picks_router.py (for example `assert "evil" not in chosen["url"]`) must pass unchanged.
assumptions_or_open_questions:
  - |
    The Book trip drawer (BookTripDrawer.tsx) lists only `options`, restaurants, sim and insurance, and renders `safeHref` (http(s) only), so a trip with only a stay or transport pick will open a drawer with "0 chosen options" and no rows. The item excludes the drawer beyond confirming it enables, so this plan leaves it alone. Please confirm that is acceptable, or file a follow-up to list stays and transport picks (with local booking links) in the drawer.
  - |
    The new `BookingUrl` accepts `local://booking/` references regardless of mode, not only when local mode is on. Treated as acceptable because the web `safeHref` never turns a non-http(s) URL into a link and the real providers only emit https URLs. A mode-aware check would need the settings inside a model validator, which I judged not worth it.
  - |
    Flights and transport share `PUT /trips/{id}/transport/{leg}` and `get_flight_providers`. I saw only `LocalFlightProvider` wired there (deps.py lines 262-306); `get_transport_providers` is used by the transport search route. I did not verify whether a local transport option (bus, train) can be picked through this route. If it cannot, that is a separate gap from the URL rejection and needs a decision.
  - |
    SIM and insurance picks use the same `HttpUrl` typing and would fail the same way for `local://` links if local providers existed for them. They are not in this item's scope and are left unchanged.
  - |
    The settled decision about starter countries (Japan, Portugal, India, Thailand, Mexico, Morocco, Peru) does not affect this change; local-mode `PLACES` in travel/local.py is untouched.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — no schema, migration, seed, setting or env var changes. `ChosenStay.url` and `TransportPick.url` change from `HttpUrl` to a validated `str`; both serialise to plain strings, so picks already stored with http(s) URLs (local files or DynamoDB) read back unchanged. Rolling back leaves any `local://` picks saved meanwhile unreadable by the old `HttpUrl` model, but only local mode produces those, and local data is disposable (there is a local reset route).

  Findings from reading the code:
  - Root cause: services/api/app/trips/store.py lines 111 and 217 type the pick URLs as `HttpUrl`, while app/travel/local.py lines 17 and 83 generate `local://booking/...` links. The pick routes (stay_options.py line 128, transport_picks.py line 42) copy the provider URL into those models, so validation fails on save.
  - The web gate is at apps/web/src/trips/TripDetailPage.tsx lines 125-126. The Stays and Transport tabs already read `trip.stays` and `trip.transport`, so AC1 (shown as chosen) follows once the PUT returns 200.
  - This is a backend and logic change only. No UI styling is added, so no design tokens are used and the design-system step does not apply.

  ```mermaid
  flowchart TD
    SO[routers/stay_options.py choose_stay] --> CS[trips/store.py ChosenStay / TransportPick]
    TP[routers/transport_picks.py pick_transport] --> CS
    LOC[travel/local.py generates local:// links] -->|BOOKING_PREFIX reused| CS
    CS --> TDP[web TripDetailPage.tsx bookable]
    classDef touched fill:#f96,color:#000
    class CS,LOC,TDP touched
  ```
  store.py is touched to accept the local reference, local.py to share the prefix constant, and TripDetailPage.tsx so a stay or transport pick enables Book trip. The two routers are unchanged callers.
review_focus: |
  IN scope: one shared booking-URL type for ChosenStay and TransportPick, and the `bookable` condition in TripDetailPage.tsx. OUT: BookTripDrawer, SIM and insurance URL typing, and any local-mode provider changes. Riskiest part is the validator, which must keep refusing non-http(s) schemes and keep http(s) values byte-identical to what `HttpUrl` stored. Accepting `local://booking/` in any mode is deliberate (see open questions).
