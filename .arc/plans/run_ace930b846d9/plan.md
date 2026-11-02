summary: |
  Let a traveller search any city or town wherever a destination is chosen. The API gets a destination search endpoint (`GET /places/search?q=`) that returns starter places first (marked Full guide) and then live places from Nominatim, each live match carrying a signed token. `POST /trips` accepts only a starter place or a live place with a valid token, so a typed or tampered place is rejected with 422 and nothing is saved. A saved live trip stores a server-owned `live_place`, and a new `GET /trips/{id}/data-status` reports available or limited for Recommendations, Visa and Itinerary. The web app gets one shared searchable picker. It replaces the destination controls in New trip, Trip settings, the Starter planner and Explore (Change destination). The existing `/destinations?q=` page, still reached from the unchanged home search box, becomes a starter-then-live results list with Start trip, a No places match state and a search box that stays on screen. Trip pages for a live place show a limited-data message per feature while the other pages keep working. Local mode (live places off) searches starter places only, with the hint from the design. Old trips whose destination matches no current place are re-matched to a live place the traveller picked before.

scope:
  - description: |
      API: destination search domain. New module `app/places/destination_search.py` holds the models and the starter search.
      ```python
      class DestinationMatch(BaseModel):
          id: str            # "starter:India/Jaipur" or "osm:node/123"
          name: str
          region: str        # starter: the country; live: "Uttar Pradesh, India"
          kind: Literal["starter", "live"]
          full_guide: bool = Field(serialization_alias="fullGuide")
          token: str | None = None   # live only; signed, see place_token

      class DestinationSearchResponse(BaseModel):
          live: bool          # live places are on
          unavailable: bool   # live is on but the lookup failed
          matches: list[DestinationMatch]   # starter first, then live

      def search_starter(q: str) -> list[DestinationMatch]   # fold() substring on place or country, via STARTER_DESTINATIONS
      ```
      Starter places have no region in the catalogue, so `region` is the country only. The design's Jaipur row shows "Rajasthan, India".
    files:
      - services/api/app/places/destination_search.py
    rationale: |
      Starter matching reuses `fold` and `STARTER_DESTINATIONS` from `app/trips/starter_destinations.py`, so the picker only offers places that have content (AC1, 6, 7, 12, 18).

  - description: |
      API: live destination lookup, throttled, cached and signed.
      - `app/locations/destination_lookup.py`: `NominatimDestinationSearch.search(q) -> list[LiveCandidate]`. It calls Nominatim `/search` with `featuretype=settlement`, `limit=8` and `addressdetails=1` through the existing `IntegrationClient`, using a new `nominatim_destinations_settings(base_url)` built like `nominatim_places_settings`. That gives a 1-hour cache, retries and a circuit breaker. Upstream calls also pass the existing `RateLimiter` (1 request per second). Any `IntegrationError` or bad JSON raises `LiveSearchUnavailable`.
      - `app/places/place_token.py`: `sign_place(c: LiveCandidate, now) -> str` and `verify_place(token, now) -> LiveCandidate | None`. It reuses `sign_value` and `verify_value` from `app/auth/session.py` (HMAC with SESSION_SECRET). The payload is compact JSON of id, name, region, country, country_code, lat, lng and bbox, plus an expiry of 1 hour.
      - New dependency `get_destination_search()` in `app/routers/deps.py`. It returns a no-op when `not get_settings().is_live("places")`, so local mode makes no outside request. Otherwise it returns a cached singleton.
      - New router `app/routers/destination_search.py` with `GET /places/search?q=`. `q` is stripped, 2-80 characters, and is not logged. Public like the places router. Register it in `app/main.py` next to `places.router`.
      The deferred question on throttling and caching is answered by the web debounce (see the picker item), the server upstream limiter, the IntegrationClient cache and the breaker.
    files:
      - services/api/app/locations/destination_lookup.py
      - services/api/app/places/place_token.py
      - services/api/app/routers/destination_search.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      AC13 (Agra in the response), AC12 (live off gives starter only), AC20 (lookup failure gives starter matches plus `unavailable: true`). Signing the match is the stateless answer to "how is a chosen live place validated": a Lambda has no shared memory between calls, and re-querying Nominatim on save would double provider traffic.

  - description: |
      API: save a trip to a live place. In `app/trips/store.py` add
      ```python
      class LivePlace(BaseModel):
          id: str; name: str; region: str; country: str; country_code: str
      ```
      `TripCreate` gains `place_token: str | None = None` and `TripFields` gains the same optional field for PUT. `Trip` gains the server-owned `live_place: LivePlace | None = None`.
      New `app/trips/destination_choice.py` holds `resolve_choice(destination: str, token: str | None, now) -> Choice`. It does one of three things:
      - A valid token whose label matches `destination` gives a live choice. `country`, `place`, `live_place` and `location` (built from the token's lat, lng, bbox and country_code, with `time_zone` from `timezone_at`) are set.
      - No token, with a `destination` that `best_match` (`app/trips/destination_match.py`) matches to a starter place, gives a starter choice.
      - Anything else (typed, forged, expired or mismatched) raises `INVALID_PLACE`, which is `ApiError(422, "invalid_place")` and already exists in `app/routers/trips.py`.
      `create_trip` calls `resolve_choice` before building the Trip, so a rejection saves nothing. `update_trip` runs it only when a `place_token` is sent; typed PUT destinations behave as today (see open questions). `_located` is skipped for a live choice because the location is already known.
    files:
      - services/api/app/trips/store.py
      - services/api/app/trips/destination_choice.py
      - services/api/app/routers/trips.py
    rationale: |
      AC2 (saved with Agra), AC22 and AC23 (same rule for typed and tampered; no trip saved). Using `country` and `place` for a live trip lets every existing status machine (`chosen_destination`, `destination_status`, visa `has_guidance`, recommendations) work unchanged for live places.

  - description: |
      API: per-feature data status and failure handling.
      New `app/trips/data_status.py`:
      ```python
      FeatureStatus = Literal["available", "limited"]
      class TripDataStatus(BaseModel):
          recommendations: FeatureStatus
          visa: FeatureStatus
          itinerary: FeatureStatus

      def data_status(trip, rec_source: RecommendationSource, visa_rules: VisaRuleSource) -> TripDataStatus
      ```
      Rules:
      - recommendations is `available` when `rec_source.for_destination(place)` is non-empty. An exception counts as `limited`.
      - visa is `available` when `has_guidance(country)`.
      - itinerary is `available` unless the trip has dates but no `location` (no time zone or bbox), when it is `limited`.
      Add `GET /trips/{trip_id}/data-status` in `app/routers/trips.py` using `_editable_trip` and the existing `get_recommendations` and `get_visa_rules` dependencies. Wrap the source call in `trip_recommendations` so a failing live source returns `status: "no_place_data"` instead of a 500.
    files:
      - services/api/app/trips/data_status.py
      - services/api/app/routers/trips.py
    rationale: |
      AC26, and the server half of AC9, 10, 16 and 17: a feature whose data is missing or failed reports `limited`, and the others stay `available`.

  - description: |
      API: re-match old trips (AC24, 25). New `rematch_live(destination: str | None, known: list[LivePlace]) -> LivePlace | None` in `app/trips/destination_choice.py`. It matches when the first comma segment of the old destination, folded, equals a known place's folded name and exactly one distinct known place qualifies. "Known" places are the `live_place` values on the owner's other trips (no new store). Add `_reopened(trips, owner_id, trip, known)` in `app/routers/trips.py`, used by `get_trip` and `list_trips` next to `_converted`. It applies only to a trip with `destination_unmatched` and no `live_place`. It sets `live_place`, `country`, `place`, `destination_unmatched=False` and a `rematched_from` string, saves once, and never touches `updated_at`. A trip that still matches nothing is returned unchanged.
    files:
      - services/api/app/trips/destination_choice.py
      - services/api/app/trips/store.py
      - services/api/app/routers/trips.py
    rationale: |
      The design's "Old trips reopened" screen shows an info alert for the re-matched trip ("Saved as Agra, UP. We matched it to Agra, Uttar Pradesh") and a plain card for the unmatched one.

  - description: |
      Web: API client. Add to `apps/web/src/places/api.ts`:
      ```ts
      export type DestinationMatch = { id: string; name: string; region: string; kind: 'starter' | 'live'; fullGuide: boolean; token?: string }
      export type DestinationSearch = { live: boolean; unavailable: boolean; matches: DestinationMatch[] }
      export const searchDestinations = (q: string, signal?: AbortSignal) =>
        call<DestinationSearch>(`/places/search?q=${encodeURIComponent(q)}`, 'GET', undefined, signal)
      ```
      Check how `call` in `apps/web/src/places/api.ts` takes a signal and add that parameter if it lacks one. In `apps/web/src/trips/api.ts` add `live_place` and `rematched_from` to `Trip`, `place_token?: string` to `TripCreateInput` and `TripInput`, and `fetchTripDataStatus(tripId)`.
    files:
      - apps/web/src/places/api.ts
      - apps/web/src/trips/api.ts
    rationale: |
      One typed boundary for the new endpoint and fields.

  - description: |
      Web: shared searchable picker `DestinationSearchPicker`, built from the "Destination picker" screens of the design.
      ```tsx
      type Props = {
        idPrefix: string
        label: string
        value: DestinationMatch | null
        onPick: (m: DestinationMatch) => void
        error?: string
        initialQuery?: string
      }
      ```
      - Layout: `.field` with `.field-label`, `.input` (type=search) and `.field-hint`. Below it a `.pick-list` inside `aria-live="polite"`, with the starter group first and then a "Live places" `.group-label`. Rows are whole-row buttons with `aria-pressed`. A starter row carries `.badge .badge-success` "Full guide" with a check icon; a live row carries no such badge. The chosen row gets the `--color-primary-subtle` background and `--border-width-strong` border in `--color-primary`.
      - Searching: 400 ms debounce, at least 2 characters, an AbortController for the stale request, and `.skeleton` lines while searching. A last-query cache in a ref avoids repeat calls. No result list is shown for an empty query.
      - Messages: a hint line when `live` is false, and a note line when `unavailable` is true (the exact copy from AC19 and AC21). Both reuse `FallbackNotice`, extended with an optional `message` prop and a `tone` prop so the existing `source="fallback"` callers do not change. A zero-match search shows an inline "No places match" line.
      - Save error: `.field-error` with `.is-invalid` after submit, using the existing `FieldError`.
      Tokens used: `--space-1/2/3`, `--radius-md`, `--size-control-lg`, `--color-border-strong`, `--color-primary`, `--color-primary-subtle`, `--color-surface`, `--color-focus`, `--border-width`, `--border-width-strong`, `--font-weight-bold`, `--font-size-sm`, `--color-fg-muted`. The `.pick*` classes are added to `apps/web/src/index.css` below the `@import "../../../design-system/tokens.css"` on line 2, with no colour or pixel literals.
      Reuse note: picker rows are single selectable buttons, which `OptionCard` (an article with a separate actions row) does not model. Results-page rows use `OptionCard`.
    files:
      - apps/web/src/places/DestinationSearchPicker.tsx
      - apps/web/src/components/FallbackNotice.tsx
      - apps/web/src/index.css
    rationale: |
      AC1, 6, 7, 12, 18, 19, 20, 21 in one component, so the four choice points cannot drift apart.

  - description: |
      Web: wire the picker into the four destination choice points.
      - New trip: replace `DestinationPicker` in `NewTripSetupPage.tsx`. State holds the chosen `DestinationMatch`. `createTrip` sends `destination` as "Place, Country" for starter and "Name, Region" for live, plus `place_token` for live. Create errors with `code: "invalid_place"` show the design's message: "That place wasn't returned by search, so no trip was saved. Choose a place from the list." The picker never offers free text; a typed value with no pick is rejected on Save (AC22, 23).
      - Trip settings: replace `DestinationPicker` in `TripSettingsDrawer.tsx` and send `place_token` on PUT.
      - Starter planner: replace the two `StarterSelect` controls in `StarterPlannerPage.tsx` with the picker. A Full guide pick keeps today's View place content and Book trip flow. A live pick shows a `FallbackNotice` saying starter content is not available for it, and a "Start trip" link to `/trips/new` carrying `{ destination: match }` in router state.
      - Explore: replace the "Change destination" link to `/` in `ExplorePage.tsx` with the picker (design "Explore, change destination"). A pick sets `?destination=<name>` and keeps the page; the picker label reads "Exploring {destination}. Change destination".
      `NewTripSetupPage` reads `location.state.destination` to pre-select the picker.
      `StarterSelect.tsx` and `DestinationPicker.tsx` are deleted if nothing else imports them after this change (check with grep), otherwise left alone.
    files:
      - apps/web/src/trips/NewTripSetupPage.tsx
      - apps/web/src/trips/TripSettingsDrawer.tsx
      - apps/web/src/places/StarterPlannerPage.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/trips/DestinationPicker.tsx
      - apps/web/src/places/StarterSelect.tsx
    rationale: |
      AC1 at every choice point, AC2 and AC22 and AC23 in the new-trip flow.

  - description: |
      Web: destination results page. In `DestinationResultsPage.tsx`, when the URL has only `q` (no `destination`, no `trip`), render a new `DestinationMatchesPage` and leave the existing places-in-area view for the `destination` and `trip` params, which Explore and AddToTrip use. The home search box (`DestinationSearch.tsx`) is not touched.
      `DestinationMatchesPage` follows the design's "Destination results" screens:
      - A `role="search"` form (`.input` plus `.btn-primary` Search) that stays on screen in every state and re-submits to `/destinations?q=` (AC15).
      - `<h2>` "Results for “q”".
      - A "Starter destinations" group and then a "Live places" group, as `OptionCard as="li"` rows with name as title, region as meta and `actions` holding a Start trip button. Starter rows carry the `badge-success` "Full guide" badge, live rows `badge-neutral` "Live place" (AC5, 6, 7).
      - Start trip navigates to `/trips/new` with `{ destination: match }` in router state (AC8).
      - No match: `.empty-state` with `EmptyStateArt`, the "No places match" heading and "Try another search above." (AC14). Loading uses `.skeleton` rows. A failed search shows an `.alert-danger` with the starter matches still listed.
      Tokens: `--space-3/4`, `--size-grid-min` (via `.grid`), `--color-success*`, `--color-fg-muted`.
    files:
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/places/DestinationMatchesPage.tsx
    rationale: |
      AC4, 5, 6, 7, 8, 14, 15. Splitting by URL params keeps the existing places view and its tests working.

  - description: |
      Web: limited-data messages on trip pages. Extend `DestinationGate` (`trips/DestinationGate.tsx`) with an optional `live` prop. For a live trip, a `no_country_data` or `no_place_data` status renders the design's limited-data `.empty-state` ("Limited data for {place}. Visa and Itinerary still work. Try again in a moment.", with a Try again `.btn-secondary`) instead of the plain "No information available…" line. Starter trips keep today's messages. In the Recommendations tab (`TripRecommendationsTab.tsx`) and the Visa page (`VisaRequirementsPage.tsx`), a failed fetch for a live trip renders the same limited state, and each page fetches independently so a failure on one never blocks another (AC16, 17). The trip overview (`TripDetailPage.tsx` or `TripPage.tsx`, whichever renders the tabs; confirm by reading both) gets the design's "Data for {place}" card: three `status-row`s with `.badge-success` Available or `.badge-warning` Limited, from `fetchTripDataStatus`. Itinerary entries already show "Not yet planned" (`ItineraryDocument.tsx` lines 60 and 84); only a test is added (AC11).
    files:
      - apps/web/src/trips/DestinationGate.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/trips/VisaRequirementsPage.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/ItineraryDocument.tsx
    rationale: |
      AC3, 9, 10, 11, 16, 17. The existing `DestinationGate` is already the single place all trip pages use for missing destination data.

  - description: |
      Web: old-trip re-match notice (AC24, 25). In `MyTripsPage.tsx` and the trip header, when `trip.rematched_from` is set, show the design's `.alert .alert-info` ("Saved as “{rematched_from}”. We matched it to {name}, {region}, which you picked before.") and a neutral "Live place" badge. A trip without it renders as it does today.
    files:
      - apps/web/src/trips/MyTripsPage.tsx
    rationale: |
      Matches the "Old trips reopened" screen of the design.

tests:
  - |
    AC13, API search finds Agra. File services/api/tests/unit/test_destination_search.py, with a fake `DestinationSearch` returning Agra and live on:
    ```python
    r = client.get("/places/search", params={"q": "Agra"})
    assert r.status_code == 200
    assert any(m["name"] == "Agra" and m["kind"] == "live" and m["fullGuide"] is False for m in r.json()["matches"])
    ```
  - |
    AC5, AC6, AC7, AC18, starter first and badge rule (same file), query "Ja" with Jaipur (starter) and Jakarta (live):
    ```python
    kinds = [m["kind"] for m in r.json()["matches"]]
    assert kinds == sorted(kinds, key=lambda k: k != "starter")
    assert all(m["fullGuide"] == (m["kind"] == "starter") for m in r.json()["matches"])
    ```
  - |
    AC12, live off, local mode with no opted-in places provider:
    ```python
    body = client.get("/places/search", params={"q": "Agra"}).json()
    assert body["live"] is False and all(m["kind"] == "starter" for m in body["matches"])
    assert fake_live.calls == 0
    ```
  - |
    AC20, live lookup failure (fake raises `LiveSearchUnavailable`) and query "Jai":
    ```python
    body = client.get("/places/search", params={"q": "Jai"}).json()
    assert body["unavailable"] is True and [m["name"] for m in body["matches"]] == ["Jaipur"]
    ```
  - |
    Throttle and cache (deferred question), file services/api/tests/unit/test_destination_lookup.py: two identical searches hit the fake `http_get` once, 1-character and 81-character queries answer 422, and the limiter's `sleep` is called between two different queries inside one second.
  - |
    AC2, create with a live token saves Agra, file services/api/tests/unit/test_trip_live_place.py:
    ```python
    token = next(m["token"] for m in search("Agra") if m["name"] == "Agra")
    r = client.post("/trips", json={**TRIP_BODY, "destination": "Agra, Uttar Pradesh, India", "place_token": token})
    assert r.status_code == 201
    assert r.json()["live_place"]["name"] == "Agra" and r.json()["place"] == "Agra"
    assert len(trips.list_trips(USER)) == 1
    ```
  - |
    AC22 and AC23, typed place and tampered token are rejected and nothing is saved (same assertions for both, parametrized):
    ```python
    @pytest.mark.parametrize("extra", [{}, {"place_token": "forged.deadbeef"}, {"place_token": expired_token}, {"place_token": agra_token, "destination": "Paris, France"}])
    def test_rejected(extra):
        r = client.post("/trips", json={**TRIP_BODY, "destination": "Xyzzy", **extra})
        assert r.status_code == 422 and r.json()["code"] == "invalid_place"
        assert trips.list_trips(USER) == []
    ```
  - |
    Starter create still works, so the validator does not lock out the existing path:
    ```python
    r = client.post("/trips", json={**TRIP_BODY, "destination": "Jaipur, India"})
    assert r.status_code == 201 and r.json()["country"] == "India"
    ```
    The 44 `"destination":` fixtures across 18 files in services/api/tests are checked, and any that post free text through `POST /trips` are changed to a starter destination or a signed token (shared helper in tests/trip_body.py).
  - |
    AC26, data-status endpoint, file services/api/tests/unit/test_trip_data_status.py:
    ```python
    body = client.get(f"/trips/{live_trip_id}/data-status").json()
    assert set(body) == {"recommendations", "visa", "itinerary"}
    assert all(v in {"available", "limited"} for v in body.values())
    ```
  - |
    AC9, AC10, AC16, AC17 (API half), same file. With recommendations empty and visa guidance present, `recommendations == "limited"` and `visa == "available"`. When the recommendation source raises, `GET /trips/{id}/recommendations` answers 200 with `status == "no_place_data"` and `data-status` reports `recommendations == "limited"` while `visa == "available"`.
  - |
    AC24 and AC25, file services/api/tests/unit/test_trip_rematch_live.py. Seed trip A with `live_place` Agra, and trip B with `destination="Agra, UP"` and `destination_unmatched=True`:
    ```python
    b = client.get(f"/trips/{b_id}").json()
    assert b["live_place"]["name"] == "Agra" and b["destination_unmatched"] is False
    c = client.get(f"/trips/{c_id}").json()   # "Hidden Valley Retreat"
    assert c["live_place"] is None and c["destination"] == "Hidden Valley Retreat" and c["destination_unmatched"] is True
    ```
    Also assert that two different known places for the same name give no re-match, and that `updated_at` is unchanged.
  - |
    Existing rows still readable (Data & rollout), file services/api/tests/unit/test_trip_live_place.py: a stored trip item written without `live_place` or `place_token` loads through `DynamoTripStore` and `PersistentTripStore` with `live_place is None`, and `GET /trips/{id}` returns 200.
  - |
    AC1, AC6, AC7, AC12, AC18, AC19, AC20, AC21, picker, file apps/web/src/places/DestinationSearchPicker.test.tsx (vitest, fake timers for the debounce):
    ```tsx
    await user.type(screen.getByRole('searchbox', { name: /destination/i }), 'Agra')
    await act(() => vi.advanceTimersByTimeAsync(400))
    expect(await screen.findByRole('button', { name: /Agra/ })).toBeInTheDocument()
    expect(within(jaipurRow).getByText('Full guide')).toBeInTheDocument()
    expect(within(agraRow).queryByText('Full guide')).toBeNull()
    expect(rows[0]).toHaveTextContent('Jaipur')   // starter before live
    expect(screen.getByText('Live places are off. Only starter destinations are searched.')).toBeInTheDocument()
    expect(screen.getByText('Live results are unavailable right now; showing starter destinations only.')).toBeInTheDocument()
    ```
    Also assert that one search request is sent for rapid typing, and that an older response never replaces a newer one.
  - |
    AC1 at the four choice points, one test per host: NewTripSetupPage.test.tsx, TripSettingsDrawer (add to TripDetailPage.test.tsx or a new TripSettingsDrawer.test.tsx), StarterPlannerPage.test.tsx and ExplorePage.test.tsx each type "Agra" with the mocked `searchDestinations` and assert `screen.getByRole('button', { name: /Agra/ })`. Explore also asserts that picking sets `destination=Agra` in the URL.
  - |
    AC2, AC22, AC23 (web), NewTripSetupPage.test.tsx. Picking Agra and saving calls `createTrip` with `expect.objectContaining({ destination: 'Agra, Uttar Pradesh, India', place_token: 'tok' })`. Saving with only typed text calls `createTrip` zero times and shows "Choose a place from the list". A 422 `invalid_place` from the mock shows the "wasn't returned by search" error.
  - |
    AC4, AC5, AC6, AC7, AC8, AC14, AC15, file apps/web/src/places/DestinationResultsPage.test.tsx (existing q-only places-view tests are rewritten to the new behaviour; `destination` and `trip` param tests stay):
    ```tsx
    renderAt('/destinations?q=Agra')
    expect(await screen.findByRole('heading', { name: 'Agra' })).toBeInTheDocument()
    expect(starterHeadingIndex).toBeLessThan(liveHeadingIndex)
    await user.click(within(agraCard).getByRole('button', { name: 'Start trip' }))
    expect(navigate).toHaveBeenCalledWith('/trips/new', expect.objectContaining({ state: { destination: expect.objectContaining({ name: 'Agra' }) } }))
    // no match
    renderAt('/destinations?q=Xyzzy')
    expect(await screen.findByText('No places match')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toBeEnabled()
    ```
  - |
    AC3, AC9, AC10, AC16, AC17 (web), DestinationGate.test.tsx, TripRecommendationsTab.test.tsx, VisaRequirementsPage tests and TripDetailPage.test.tsx. For a live trip with `no_place_data`, `screen.getByText(/Limited data for Agra/)` is shown. With `ready`, `screen.queryByText(/Limited data/)` is null and the content renders. When the recommendations fetch rejects, the Recommendations tab shows the limited state while the Visa page for the same trip still renders its accordion. A starter trip with `no_place_data` still shows "No information available for this place". The overview card shows Available or Limited badges from `fetchTripDataStatus`.
  - |
    AC11, apps/web/src/trips/ItineraryPage.test.tsx: for a live trip with two empty days, `expect(screen.getAllByText('Not yet planned')).toHaveLength(2)`.
  - |
    AC24 and AC25 (web), MyTripsPage.test.tsx. A trip with `rematched_from: 'Agra, UP'` shows the "We matched it to Agra, Uttar Pradesh" alert, and a trip without it renders exactly as before (snapshot-free: `queryByRole('status')` is null).
  - |
    Narrow commands for the implementer (derived from the project command):
    `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_destination_search.py tests/unit/test_trip_live_place.py tests/unit/test_trip_data_status.py tests/unit/test_trip_rematch_live.py)` and `(cd apps/web && pnpm run test -- src/places src/trips src/explore)`. The full command runs once at the end.

assumptions_or_open_questions:
  - |
    Nominatim public-instance policy discourages autocomplete-style search. This plan limits the load with a 400 ms debounce, a 2-character minimum, a 1-hour cache, a 1 request per second limiter and a circuit breaker, but a public Nominatim instance is still a risk at ~10,000 users (ADR-0004). Should production point `NOMINATIM_BASE_URL` at a hosted or self-hosted geocoder? Nothing in the plan changes except that setting.
  - |
    Server-side validation of a chosen live place uses an HMAC-signed token (reusing `sign_value` and `verify_value` in `app/auth/session.py`, keyed by SESSION_SECRET) with a 1-hour expiry. Rotating SESSION_SECRET invalidates tokens issued before the rotation, so a traveller who had a picker open then must search again. Is that acceptable? The alternative is re-querying the provider by OSM id on save.
  - |
    Breaking change to be confirmed: `POST /trips` now rejects any destination that is not a starter place or a signed live place (AC22, 23 read "typed" as rejected). Today it accepts free text and sets `destination_unmatched`. PUT keeps accepting typed text unless a `place_token` is sent. Should PUT also reject unlisted places?
  - |
    The `/destinations?q=` page is currently a places-in-area (attractions) list. This plan makes the q-only form the destination matches page and keeps `?destination=` and `?trip=` as the places view. Existing q-only tests are rewritten. Confirm that home search should no longer land on places-in-area.
  - |
    "Start trip" (results page, starter planner live pick) opens `/trips/new` with the destination pre-selected rather than creating a trip at once, because New trip needs dates, budget, currency and travellers. The design toast says "Trip to Agra started", which implies an immediate create. Which is intended?
  - |
    The itinerary data-status rule (limited only when the trip has dates but no resolved location) is my assumption. The story gives no definition of limited for Itinerary.
  - |
    A "previously resolved place" for the re-match (AC24) is taken to be a `live_place` on another of the same traveller's trips. A server-wide list of resolved places would be a bigger change. A name with two different known places is not re-matched.
  - |
    The design shows the search response with camelCase `fullGuide`, while the rest of the API is snake_case. The plan follows the design for this endpoint only (serialization alias). The design's Jaipur row shows a region ("Rajasthan, India") that the starter catalogue does not hold, so starter rows show the country only.
  - |
    Project-wide open question carried from TRAVEL-PLANNER-APP-CHORE-139: how long resolved live place data is kept, and how provider availability and usage are monitored. This plan keeps the picked place on the trip for the trip's life, keeps the existing 30-day `LOCATION_TTL` on the location cache, caches search responses for 1 hour in memory, and does not log query text (ADR-0011). Monitoring beyond the existing `app/integrations/logging.py` and `/providers/status` is not planned.
  - |
    The Trip overview file that renders the Recommendations, Visa and Itinerary tabs (`TripDetailPage.tsx` or `TripPage.tsx`) was not opened while planning. The implementer should confirm which one before adding the Data card.

estimated_points: 8

package_dependencies: []

notes: |
  ### Data & rollout
  - **Existing data**: `Trip` gains optional `live_place` and `rematched_from`, and `TripFields` an optional request-only `place_token`. All default to `None`, DynamoDB items are schemaless documents, and there is no migration. Old items load with `live_place=None`, and the Trip pydantic model ignores nothing it needs to. The test "stored item written without live_place still loads" covers `DynamoTripStore` and `PersistentTripStore`.
  - **Backfill / seed**: none. Re-matching (AC24) happens lazily when an old trip is opened, saves once, is idempotent (the flag `destination_unmatched` is cleared) and never changes `updated_at`.
  - **Settings**: no new env var. Tokens are signed with the existing SESSION_SECRET. `NOMINATIM_BASE_URL` and `NOMINATIM_USER_AGENT` already exist in `app/config.py`. Live search follows the existing `is_live("places")` switch, so local mode searches starter places only unless `LOCAL_LIVE_PROVIDERS` opts in places.
  - **Provisioning**: nothing new to create.
  - **Order and rollback**: deploy API first, then web. An old web build keeps sending free-text destinations and will get 422 `invalid_place` from the new API, so deploy both together or release the web build first behind the same deploy. Rollback is safe: the extra fields are ignored by the old code, and trips already saved to a live place keep their `country` and `place`.

  ### Design source
  Read in full: the prototype's screens Home, Destination results, Destination results (no match), New trip, Destination picker (live places off), Destination picker (live search unavailable), Trip settings, Trip overview, Recommendations (and its limited-data state), Visa, Itinerary, Starter planner, Explore (change destination), Old trips reopened and Search endpoint response. The prototype-only "Prototype controls" boxes are not product UI and are not built. Tokens come from `design-system/tokens.css`, loaded in `apps/web/src/index.css` line 2 (`@import "../../../design-system/tokens.css"`, after `@import "tailwindcss"` on line 1). Every new style uses those variables only.
  The design has no conflict with an acceptance criterion. One difference: the design's search response example id is "osm:agra-in", and the real id is "osm:<type>/<osm_id>".

  ### Reuse
  Reused: `OptionCard` (results rows), `FallbackNotice` (extended with `message` and `tone`), `EmptyStateArt` (no match), `DestinationGate` (limited-data state), `FieldError`, `Toast`, and on the API `IntegrationClient`, `RateLimiter`, `sign_value`/`verify_value`, `best_match`, `fold`, `destination_status` and the existing status machines. `ImageHero` and `ProgressBar` are not needed.

  ```mermaid
  flowchart TD
    Web[DestinationSearchPicker] -->|GET /places/search| SR[routers/destination_search.py]
    Results[DestinationMatchesPage] --> SR
    SR --> DL[locations/destination_lookup.py]
    SR --> SD[places/destination_search.py]
    SR --> PT[places/place_token.py]
    DL --> IC[integrations/client.py]
    PT --> SS[auth/session.py sign_value]
    NewTrip[NewTripSetupPage] -->|POST /trips with place_token| TR[routers/trips.py]
    Settings[TripSettingsDrawer] -->|PUT /trips| TR
    TR --> DC[trips/destination_choice.py]
    DC --> PT
    DC --> DM[trips/destination_match.py best_match]
    TR --> ST[trips/store.py Trip.live_place]
    TR --> DS[trips/data_status.py]
    Gate[DestinationGate] -->|limited-data state| Pages[Recommendations and Visa pages]
    Pages -->|GET data-status| DS
    classDef touched fill:#f96,color:#000
    class Web,Results,SR,DL,SD,PT,NewTrip,Settings,TR,DC,ST,DS,Gate,Pages touched
  ```
  Orange nodes are changed or new. `integrations/client.py`, `auth/session.py` and `destination_match.py` are reused as they are.

  ### Prompt-injection check
  The work item, intake questions, current plan and feedback contained no instructions beyond the change itself, so nothing was refused or left out.

review_focus: |
  IN scope: the search endpoint, signed-token validation on trip create, `live_place` on the Trip, data-status, the shared picker at four choice points, the `/destinations?q=` results page, limited-data states and old-trip re-match. OUT: starter content, photos, ratings, real visa or rates providers, AI, and any change to the home search box. The riskiest areas are the new rejection rule on `POST /trips`, because free-text destinations were accepted before and about 18 test files post them, and the Nominatim usage policy against autocomplete. Deliberate choices: `country` and `place` are set for live trips so the existing status machines work unchanged, tokens are stateless HMAC instead of a store, and PUT only validates a destination when a token is sent. Several behaviours (Start trip going to New trip, itinerary limited rule) are open questions for a human.
