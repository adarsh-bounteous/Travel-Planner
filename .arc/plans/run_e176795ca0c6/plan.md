summary: |
  Let a traveller search any city or town wherever a destination is chosen. The API gains `GET /places/search?q=`, which returns starter matches (marked `fullGuide`) first and then live matches from Nominatim. Each live match carries a server-signed `id`. A trip can be created or re-pointed at a live place only by presenting that signed `id` as `place_ref`, or by naming a starter place. A typed or tampered place is rejected with 422 and nothing is saved. Trips to live places store `country`, `place`, `location` and a new `place_source="live"`. A new `limited_data` destination status and `GET /trips/{id}/data-status` (Recommendations, Visa and Itinerary each `available` or `limited`) make every trip page render a limited-data message instead of failing. The web app replaces the country/place selects in `DestinationPicker` with one searchable picker (debounced, starter group above live group, "Full guide" badge on starters only). That picker is reused in New trip, Trip settings, the Starter planner and Explore "Change destination". The existing `/destinations?q=` page, reached from the unchanged home search box, becomes a destination-results list with a "Start trip" action, a "No places match" state and a search box that stays available. Older trips whose destination matched nothing are re-matched, when reopened, to a live place the same traveller picked before. In local mode (live places off) only starter places are searched and a hint says so.
scope:
  - description: |
      Destination search domain (new module `app/places/destination_search.py`).
      - Models: `DestinationMatch(id, name, region, kind: Literal["starter","live"], full_guide: bool = Field(serialization_alias="fullGuide"))` and `DestinationSearchResult(live: bool, unavailable: bool, matches: list[DestinationMatch])`. The `fullGuide` key and the `{live, matches}` shape follow the prototype's "Search endpoint response" screen. `unavailable` is an addition needed for AC20/21.
      - Starter matches: fold-insensitive substring match of the query against the `STARTER_DESTINATIONS` place and country names (reuse `fold` from `app/trips/starter_destinations.py`). Starter `id` is `starter:<country>/<place>`.
      - Live matches: `NominatimDestinationSearch.search(q) -> list[LiveCandidate]` calls Nominatim `/search` with `format=jsonv2, addressdetails=1, accept-language=en, featuretype=city, limit=8`. It raises `LiveSearchUnavailable` on any HTTP/parse error; this is different from `NominatimResolver`, which swallows errors, so "no match" and "provider down" can be told apart. Reuse `timezone_at` and `BoundingBox` and `ResolvedLocation` from `app/locations/`.
      - Signed `id` (answers deferred question "how is a chosen live place validated server-side"): `live:<b64url(payload)>.<hmac>`. The payload is `{name, country, region, location: ResolvedLocation, exp}`. It is signed with HMAC-SHA256 keyed on `session_secret` plus a fixed purpose prefix, and expires after 1 hour. `verify_place_ref(ref, secret, now) -> LivePlace | None` is constant-time and returns None for a bad signature, bad shape or expiry.
      - Debounce, rate limit and cache (answers deferred question 1): the client debounces 300 ms and aborts stale requests, and starts at 2 characters. The server caps `q` at 80 characters, caches normalised queries (fold + trim) in a small TTL LRU (`CachedDestinationSearch`, 10 min, 256 entries, only successful results), and spaces upstream calls with the existing `RateLimiter` from `app/locations/resolver.py` (1 per second, Nominatim's policy).
      - Composition: `search_destinations(q, starter, live_search, live_on) -> DestinationSearchResult`. With live off it returns `live=False` and starter only, with no upstream call. With live on and the upstream failing it returns starter matches plus `unavailable=True`. Starter matches are always ahead of live ones; a live match that duplicates a starter place (same folded name and country) is dropped.
      - Route `GET /places/search?q=` in `app/routers/places.py`, public like `GET /places`. A blank or one-character `q` returns an empty `matches` list.
      - Dependency `get_destination_search` in `app/routers/deps.py`: live on means `get_settings().is_live("places")`, which is true outside local mode and opt-in inside it. This is the same switch `get_destination_resolver` uses.
    files:
      - services/api/app/places/destination_search.py
      - services/api/app/routers/places.py
      - services/api/app/routers/deps.py
    rationale: |
      AC1, 12, 13, 18, 19, 20, 21. Reuses the Nominatim, timezone, rate-limiter and `is_live("places")` plumbing already in `app/locations` and `deps.py` instead of adding a new provider concept.
  - description: |
      Save a trip to a live place; reject anything not returned by search.
      - `TripFields` gets `place_ref: str | None = Field(default=None, max_length=2000)`. It is write-only: it is never stored and never returned.
      - `Trip` gets `place_source: Literal["starter","live"] | None = None` (server-owned). `Trip` gets `rematched_from: str | None = None` (server-owned, used for AC24).
      - New helper in `app/routers/trips.py`: `_checked_destination(body, now, secret) -> _Picked`.
        - With `place_ref`, it verifies the ref with `verify_place_ref`. It also requires that the folded `destination` text in the body equals "<name>, <country>" of the verified place. Otherwise it raises `ApiError(422, "place_not_from_search")`.
        - Without `place_ref`, the destination must resolve through `best_match()` to a starter place. Otherwise it raises the same error.
        - It returns country, place, source and the verified `ResolvedLocation`.
      - `create_trip` calls it BEFORE building the Trip, so a rejected request saves nothing (AC22/23). For a live pick, `country`, `place`, `location`, `place_source="live"` and `destination="<name>, <country>"` come from the token and the resolver is not called, so the save never makes another outside request. For a starter pick, behaviour is unchanged.
      - `update_trip` applies the same check only when `body.destination` differs from the stored one. This is needed so Trip settings "Change destination" can pick a live place, and it closes the same tamper hole there.
      - `destination_status(...)` gains `live: bool = False`. When live and the country or place has no data it returns the new `"limited_data"` instead of `"no_country_data"` / `"no_place_data"`. `DestinationStatus` gains `"limited_data"` in `app/trips/destination.py`. `trip_recommendations`, `_visa_view` and `trip_medical_guidance` pass `live=trip.place_source == "live"`. `source.for_destination` is wrapped so a provider exception on a live trip yields `limited_data` (AC16) while the other routes keep answering (AC17).
    files:
      - services/api/app/trips/store.py
      - services/api/app/trips/destination.py
      - services/api/app/routers/trips.py
    rationale: |
      AC2, 3, 9, 10, 16, 17, 22, 23. Verifying a signed, expiring token answers the server-side validation question without an outbound call at save time, and carries the resolved location so the trip is stored with it.
  - description: |
      Per-feature data status route `GET /trips/{trip_id}/data-status` returning `DataStatusView(destination: ChosenDestination | None, features: FeatureStatus)`, where each of `recommendations`, `visa` and `itinerary` is `Literal["available","limited"]`.
      - `recommendations` is available when `source.for_destination(place)` is non-empty. An exception counts as limited.
      - `visa` is available when `has_guidance(country)` is true.
      - `itinerary` is available when the trip has days (dates set) and a chosen place.
      - Starter trips report all three as available. Owner or accepted editor access, using `_editable_trip`.
    files:
      - services/api/app/routers/trips.py
    rationale: |
      AC26, plus the Trip overview "Data for Agra" card in the prototype.
  - description: |
      Re-match older trips on reopen (AC24/25). In `_load` (after `_converted`), for a trip with `destination_unmatched` and no `country`, `_rematch_to_picked(trips, owner, trip)` scans the owner's own trips (`trips.list_trips(owner)`) for distinct live picks (`place_source == "live"`). It matches when the first comma segment of the old destination folds equal to a pick's `place`, and when the old text has a second segment, that segment must be a prefix of the pick's region or country code. It requires exactly one distinct candidate. On a hit it copies `country`, `place`, `location`, `place_source="live"`, sets `destination` to the pick's label, `destination_unmatched=False` and `rematched_from=<old text>`, and saves once. On no hit or an ambiguous hit the trip is returned unchanged ("shown as it is shown today").
    files:
      - services/api/app/routers/trips.py
    rationale: |
      Uses the traveller's own earlier picks as the "previously resolved place", so no new table or cache key is needed.
  - description: |
      Web search client and hook.
      - `searchDestinations(q, signal)` in `apps/web/src/places/api.ts` calls `GET /places/search`. It returns `DestinationSearchResult` with `fullGuide` and `kind`.
      - `useDestinationSearch(query)` in `apps/web/src/places/useDestinationSearch.ts` waits for at least 2 characters, debounces 300 ms, aborts the previous request, and exposes `{status: 'idle'|'searching'|'done'|'failed', result}`. A thrown request is `failed`.
    files:
      - apps/web/src/places/api.ts
      - apps/web/src/places/useDestinationSearch.ts
    rationale: |
      The client half of the debounce / abort answer. Both the picker and the results page use it.
  - description: |
      Shared searchable picker. Rewrite `apps/web/src/trips/DestinationPicker.tsx` internals (same export, so New trip and Trip settings keep importing it) to match the prototype's "New trip" and "Destination picker" screens.
      - `<section className="card stack" data-wf-id="destination-picker">` holds a `.field`: `.field-label` "Destination", `.input` `type="search"` placeholder "Type a city or town", and a `.field-hint` plus a `.field-error` with `role="alert"`.
      - Below it, three `.skeleton` lines while searching, and a `ul` of row buttons in `aria-live="polite"`. Each row shows the name (bold), the region (`text-sm text-muted`) and, for starters only, `<span className="badge badge-success">Full guide</span>` with a check icon. Live rows have no badge in the picker. The selected row has `aria-pressed` and a primary border plus `--color-primary-subtle` fill.
      - Group order is always starters, then live.
      - Hint states: live on shows "Search any city or town. Try “Agra”."; live off shows "Live places are off. Only starter destinations are searched." (AC19); live unavailable shows the note "Live results are unavailable right now; showing starter destinations only." with the alert icon, `role="status"` (AC21).
      - New props: `onChange(destination: string, placeRef?: string)`, plus `idPrefix`, `value` and `error`. `value` stays "Place, Country" for the stored destination. Clearing or retyping calls `onChange('')`.
      - Style with new classes `place-pick*` in `apps/web/src/index.css`, using only tokens from `design-system/tokens.css`: `--space-2`, `--space-3`, `--size-control-lg`, `--radius-md`, `--border-width`, `--border-width-strong`, `--color-border-strong`, `--color-primary`, `--color-primary-subtle`, `--color-surface`, `--color-focus`, `--color-fg-muted`, `--font-size-sm` and `--font-weight-bold`. Do not reuse `.pick` or `.pick-list`: they already exist in `index.css` (lines 340-362) with different meanings.
      - Reuse `FallbackNotice` styling pattern (`.alert`, `.field-hint`) for the note, and the existing `.badge-success`, `.skeleton`, `.field-*` classes.
      - Wire into `NewTripSetupPage.tsx`: store `placeRef` in form state and send `place_ref` in the create body. Wire into `TripSettingsDrawer.tsx`: send `place_ref` in the update body when the destination changed. Keep the drawer as it is, because it already is a `.drawer` (prototype keeps the destination row; this is the lowest-churn way to reach the same picker).
    files:
      - apps/web/src/trips/DestinationPicker.tsx
      - apps/web/src/trips/NewTripSetupPage.tsx
      - apps/web/src/trips/TripSettingsDrawer.tsx
      - apps/web/src/trips/api.ts
      - apps/web/src/index.css
    rationale: |
      AC1, 2, 6, 7, 12, 18, 19, 20, 21, 22 (surfaced as a field error, "That place wasn't in the search results. Search again and pick one."). One component for four call sites, as the prototype's design plan asks.
  - description: |
      Starter planner and Explore use the shared picker.
      - `StarterPlannerPage.tsx`: replace the two `StarterSelect`s with the picker. "View place content" stays and is enabled only for a starter pick; for a live pick it shows a hint that only starter places have a full guide. "Book trip" stays enabled for any pick. Delete `StarterSelect.tsx` only if nothing else imports it (verify with Grep).
      - `ExplorePage.tsx`: the "Change destination" link to `/` becomes a button that opens the picker in a `.card`. Choosing a place sets `?destination=<name>` and shows a `Toast` ("Destination changed"), staying on Explore.
    files:
      - apps/web/src/places/StarterPlannerPage.tsx
      - apps/web/src/places/StarterSelect.tsx
      - apps/web/src/explore/ExplorePage.tsx
    rationale: |
      AC1, 6, 7 at two more choice points. The prototype's Starter planner screen shows a "Start planning" button, but today's page books a sample trip and shows starter content. This plan keeps the existing actions and swaps only the destination control. See open questions.
  - description: |
      Destination results page. `DestinationResultsPage.tsx` renders a new `DestinationMatchesView` (in `apps/web/src/places/DestinationMatchesView.tsx`) when the URL has `q` but neither `destination` nor `trip`. The existing places-for-a-destination view stays for those two params.
      - It shows the search form (`.search` row: `.input` plus `.btn-primary` "Search", prefilled with `q`; submitting updates `?q=`), an `h2` `Results for “{q}”`, then a `.group-label` "Starter destinations" followed by `.card.result-card` rows (name, region, `.badge-success` "Full guide", `.btn-secondary` "Start trip"). Under a second `.group-label` "Live places", each live row has a `.badge-neutral` "Live place" and a `.btn-primary` "Start trip". Starters are always first (AC5).
      - No match shows `.empty-state` with `role="status"`, `h3` "No places match" and "Try another search above.", and the search form stays rendered above it (AC14/15). Use `EmptyStateArt`.
      - Searching shows `.skeleton` cards. A failed live lookup shows the same unavailable note as the picker, with starter results. Live off shows the live-off hint.
      - "Start trip" navigates to `/trips/new` with router state `{ destination, placeRef }`. `NewTripSetupPage` reads it, prefilling the picker (AC8). Starters pass no `placeRef`.
      - Ref: prototype screens "Destination results" and "Destination results, no match".
    files:
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/places/DestinationMatchesView.tsx
      - apps/web/src/trips/NewTripSetupPage.tsx
    rationale: |
      AC4, 5, 6, 7, 8, 14, 15. The home search box (`DestinationSearch.tsx`) is deliberately untouched: it already navigates to `/destinations?q=`.
  - description: |
      Limited-data messages and trip overview.
      - `apps/web/src/trips/destination.ts`: `DestinationStatus` gains `'limited_data'`.
      - `DestinationGate.tsx`: for `limited_data` render `.empty-state` (`role="status"`, `InfoIcon`, `h2` "Limited data for {label}", body "We couldn’t load {feature} for this place. Your other pages still work. Try again in a moment.", `.btn-secondary` "Try again" calling an optional `onRetry`) plus the existing `Toast`. Children are not rendered. Add `onRetry` to the callers `TripRecommendationsTab.tsx` and `VisaRequirementsPage.tsx`. Other statuses are unchanged.
      - `TripDetailPage.tsx`: add a "Data for {destination}" `.card` with three `.status-row`s, each a `.badge-success` "Available" or `.badge-warning` "Limited", from `fetchDataStatus(tripId)` (new in `trips/api.ts`). It is hidden for starter trips. When the trip has `rematched_from`, show `.alert.alert-info` "Saved as “{old}”. We matched it to {destination}, which you picked before."; `MyTripsPage.tsx` shows the same alert on the card.
      - `ItineraryDocument.tsx` already renders "Not yet planned" for an empty day (`ItineraryDocument.tsx:60,84`). No code change is planned unless the live-place trip test shows a gap.
    files:
      - apps/web/src/trips/destination.ts
      - apps/web/src/trips/DestinationGate.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/trips/VisaRequirementsPage.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/api.ts
    rationale: |
      AC3, 9, 10, 11, 16, 17, 24, 25, 26 on the web side. The prototype's "Recommendations, limited data" screen, "Trip overview" status card and "Old trips reopened" screen are the references.
tests:
  - |
    AC13, API. Write first in `services/api/tests/unit/test_destination_search_router.py`. `sign_in_as` gains a fake live search that returns Agra.
    ```python
    def test_search_includes_agra_when_live_is_on(client_with_live):
        body = client_with_live.get("/places/search", params={"q": "Agra"}).json()
        assert body["live"] is True
        agra = next(m for m in body["matches"] if m["name"] == "Agra")
        assert agra["kind"] == "live" and agra["fullGuide"] is False
    ```
  - |
    AC5 and AC18, ordering. A query matching one starter and one live place lists the starter first.
    ```python
    kinds = [m["kind"] for m in client.get("/places/search", params={"q": "ja"}).json()["matches"]]
    assert kinds == sorted(kinds, key=lambda k: k != "starter")
    ```
  - |
    AC6 and AC7, API flags.
    ```python
    jaipur = next(m for m in matches if m["name"] == "Jaipur")
    assert jaipur["fullGuide"] is True
    assert all(m["fullGuide"] is False for m in matches if m["kind"] == "live")
    ```
  - |
    AC12 and AC19, live off. With `LIVE_PROVIDERS` unset in local mode, the fake provider is never called.
    ```python
    body = local_client.get("/places/search", params={"q": "Agra"}).json()
    assert body["live"] is False
    assert {m["kind"] for m in body["matches"]} <= {"starter"}
    assert fake_live.calls == 0
    ```
    Web side (`DestinationPicker.test.tsx`): `expect(screen.getByText('Live places are off. Only starter destinations are searched.')).toBeInTheDocument()` and `expect(screen.queryByText('Agra')).not.toBeInTheDocument()`.
  - |
    AC20 and AC21, live down. The fake raises `LiveSearchUnavailable`.
    ```python
    body = client.get("/places/search", params={"q": "Jai"}).json()
    assert body["unavailable"] is True
    assert [m["name"] for m in body["matches"]] == ["Jaipur"]
    ```
    Web: `expect(await screen.findByText('Live results are unavailable right now; showing starter destinations only.')).toBeInTheDocument()` and `expect(screen.getByText('Jaipur')).toBeInTheDocument()`.
  - |
    Debounce, cache and limits (deferred question 1). In `test_destination_search_cache.py`:
    ```python
    cached.search("Agra"); cached.search("  agra ")
    assert upstream.calls == 1                       # same normalised query served from cache
    upstream.fail_next(); 
    with pytest.raises(LiveSearchUnavailable): cached.search("Delhi")
    cached.search("Delhi")                           # a failure is not cached
    assert upstream.calls == 3
    assert client.get("/places/search", params={"q": "a"}).json()["matches"] == []   # under 2 characters
    ```
    Web (`useDestinationSearch.test.ts`, fake timers): typing "A", "Ag", "Agr", "Agra" within 300 ms results in `expect(fetch).toHaveBeenCalledTimes(1)`, and the earlier in-flight request's `AbortSignal` is aborted.
  - |
    AC1, picker at every choice point. `DestinationPicker.test.tsx` types 'Agra' and asserts `expect(await screen.findByRole('button', { name: /Agra/ })).toBeInTheDocument()`. The same assertion is repeated in `NewTripSetupPage.test.tsx`, `TripSettingsDrawer` (via the existing trip settings test file), `StarterPlannerPage.test.tsx` and `ExplorePage.test.tsx`.
  - |
    AC2, create a trip to Agra. In `test_trips_live_place.py`, take `agra_ref` from the search response, then:
    ```python
    r = client.post("/trips", json=body(destination="Agra, India", place_ref=agra_ref))
    assert r.status_code == 201
    trip = client.get(f"/trips/{r.json()['id']}").json()
    assert (trip["place"], trip["country"], trip["place_source"]) == ("Agra", "India", "live")
    assert trip["location"]["country_code"] == "IN"
    ```
  - |
    AC22 and AC23, typed or tampered. The same rule for both, and nothing is saved.
    ```python
    @pytest.mark.parametrize("extra", [
        {"destination": "Atlantis, Nowhere"},                                  # typed, no place_ref
        {"destination": "Agra, India", "place_ref": "live:forged.sig"},        # tampered signature
        {"destination": "Delhi, India", "place_ref": agra_ref},                # valid ref, different name
        {"destination": "Agra, India", "place_ref": expired_ref},              # expired
    ])
    def test_unsearched_place_is_rejected(client, extra, trips_store):
        r = client.post("/trips", json=body(**extra))
        assert r.status_code == 422 and r.json()["code"] == "place_not_from_search"
        assert trips_store.list_trips(owner) == []
    ```
    A web test in `NewTripSetupPage.test.tsx` mocks a 422 `{code: "place_not_from_search"}` on create and asserts the field error text is shown and no navigation happens.
  - |
    AC3 and AC17, a saved trip to Agra renders every page. API: recommendations, visa and itinerary routes answer 200 for the Agra trip. Web (`TripLivePlacePages.test.tsx`): open `TripRecommendationsTab`, `VisaRequirementsPage` and `ItineraryTab` for the live trip and `expect(screen.queryByText(/Limited data for/)).not.toBeInTheDocument()` on pages whose data is present. When the recommendations source fails, `/recommendations` returns `status == "limited_data"` while `/visa` still returns `status == "ready"`.
  - |
    AC9 and AC10, limited data per feature. API: with an empty recommendation source, `assert client.get(f"/trips/{tid}/recommendations").json()["status"] == "limited_data"`. With data present, `== "ready"`. Web: `DestinationGate.test.tsx` renders `status="limited_data"` and asserts `expect(screen.getByText('Limited data for Agra')).toBeInTheDocument()`, `expect(screen.queryByText('child-content')).not.toBeInTheDocument()` and a "Try again" button that calls `onRetry`. With `status="ready"`, `expect(screen.queryByText(/Limited data/)).not.toBeInTheDocument()`.
  - |
    AC16, live data fails during the trip. The recommendation source raises `RuntimeError` for a live trip:
    ```python
    assert client.get(f"/trips/{tid}/recommendations").json()["status"] == "limited_data"
    ```
    Web: the Recommendations page shows `Limited data for Agra` and the toast.
  - |
    AC26, data status.
    ```python
    s = client.get(f"/trips/{agra_trip_id}/data-status").json()["features"]
    assert set(s) == {"recommendations", "visa", "itinerary"}
    assert set(s.values()) <= {"available", "limited"}
    ```
    Plus one case with each of the three forced to `limited`. Web: `TripDetailPage.test.tsx` asserts three `Available`/`Limited` badges, and that no status card is shown for a starter trip.
  - |
    AC11, `ItineraryPage.test.tsx` gets a case for a live-place trip with empty days:
    `expect(screen.getAllByText('Not yet planned').length).toBeGreaterThan(0)`. It passes today for starter trips (existing tests at lines 167-181), so this is a regression guard.
  - |
    AC4, AC5, AC6, AC7, AC8, AC14 and AC15, results page. `DestinationMatchesView.test.tsx` with fetch stubbed:
    ```tsx
    expect(await screen.findByRole('heading', { name: /Results for/ })).toHaveTextContent('Agra')
    expect(screen.getByText('Agra')).toBeInTheDocument()                       // AC4
    const names = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
    expect(names.indexOf('Jaipur')).toBeLessThan(names.indexOf('Agra'))        // AC5
    expect(within(jaipurCard).getByText('Full guide')).toBeInTheDocument()     // AC6
    expect(within(agraCard).queryByText('Full guide')).not.toBeInTheDocument() // AC7
    fireEvent.click(within(agraCard).getByRole('button', { name: 'Start trip' }))
    expect(navigate).toHaveBeenCalledWith('/trips/new', { state: expect.objectContaining({ destination: 'Agra, India' }) })  // AC8
    ```
    No match: `expect(await screen.findByText('No places match')).toBeInTheDocument()` and `expect(screen.getByRole('searchbox')).toBeEnabled()`.
  - |
    AC24 and AC25, re-match. In `test_trip_rematch_live.py`: the owner has an Agra live trip and an older flagged trip with `destination="Agra, UP"`. After `client.get(f"/trips/{old_id}")`:
    ```python
    t = client.get(f"/trips/{old_id}").json()
    assert (t["place"], t["place_source"], t["rematched_from"]) == ("Agra", "live", "Agra, UP")
    ```
    Case with `destination="Hidden Valley Retreat"`: `assert t["place"] is None and t["destination"] == "Hidden Valley Retreat" and t["destination_unmatched"] is True` and the stored trip is unchanged. An ambiguous case (two different live picks named "Aurangabad") leaves the trip unchanged. Existing-rows test: a trip document saved without `place_source` / `rematched_from` still loads (`Trip(**legacy_dict).place_source is None`).
  - |
    Existing tests that post arbitrary destinations to `POST /trips` will start failing with 422 (AC22 makes that the rule). Update `services/api/tests/unit/test_trips_router.py` and the other files that post a non-starter destination to use a starter place (for example "Lisbon") or a signed ref from the fake live search. Update `DestinationPicker.test.tsx`, `NewTripSetupPage.test.tsx`, `DestinationResultsPage.test.tsx`, `StarterPlannerPage.test.tsx` and `ExplorePage.test.tsx` for the new controls. Narrow commands for verification, derived from the project command:
    `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_destination_search_router.py tests/unit/test_trips_live_place.py tests/unit/test_trip_rematch_live.py)` and `(cd apps/web && pnpm run test -- src/trips/DestinationPicker.test.tsx src/places/DestinationMatchesView.test.tsx src/trips/DestinationGate.test.tsx)`.
assumptions_or_open_questions:
  - |
    Prototype vs today's Starter planner. The prototype shows a picker and a "Start planning" button that goes to the trip overview. The current page books a sample trip and shows starter content. The plan keeps those actions and only swaps the destination control. Reviewer: confirm, or say whether "Start planning" should create a real trip.
  - |
    Prototype vs today's Trip settings. The prototype shows a destination row with a "Change destination" button that opens a drawer holding the picker. `TripSettingsDrawer` is already a drawer with the destination field inline, so the plan swaps the field for the picker and does not add the nested drawer. Confirm that is acceptable.
  - |
    Repurposing `/destinations?q=`. Today that page shows places inside a destination. The plan shows destination matches there instead, and keeps the old places view only for `destination` or `trip` params. Existing tests that open `/destinations?q=Lisbon` and expect place cards must be rewritten. Confirm this is the intended replacement.
  - |
    API shape. The prototype's endpoint JSON uses `fullGuide` (camelCase) while the rest of the API is snake_case. The plan follows the prototype for this one endpoint via a serialization alias, and adds an `unavailable` boolean that the prototype does not show (needed for AC20/21).
  - |
    AC22 applies to creation. The plan also applies the same check to `PUT /trips/{id}` when the destination changes, because Trip settings must be able to pick a live place and an unchecked update would bypass the rule. Existing trips that are edited without changing the destination are not affected.
  - |
    Itinerary "limited" meaning for AC26. The plan defines Itinerary as available when the trip has dates (days) and a chosen place. Nothing in the item says what else makes it limited; confirm or give the intended rule.
  - |
    Visa data for live places. A live place inherits visa guidance from its country through `has_guidance(country)`. If the seeded visa rules do not cover a country, Visa shows "Limited data". Real visa providers are out of scope.
  - |
    Deferred question, retention and monitoring of resolved live place data (project-wide, from TRAVEL-PLANNER-APP-CHORE-139). The plan keeps search results only in a 10-minute in-process cache, and stores a live place only on the traveller's own trip. It does not add retention rules or monitoring for the live provider beyond the existing logging of failed lookups. A human should set the retention period and the availability and usage monitoring.
  - |
    Rate limiting is per Lambda instance (an in-process limiter and cache), so many concurrent instances can exceed Nominatim's 1 request per second policy. A shared limiter or cache (DynamoDB, as `DynamoLocationCache` does) is not planned. Confirm that is acceptable at ~10,000 users (ADR-0004), or that the story should add it.
  - |
    Nominatim `featuretype=city` may miss towns and villages. The plan relies on `featuretype=settlement`, a broader setting, if tests against the fake show gaps; real-provider tuning is not verifiable here.
  - |
    Trips created before this change have `destination_unmatched` set by `convert_trip`. I did not read `app/trips/destination_conversion.py`, so the implementer must confirm that unmatched old trips carry the flag and no `country`, which the re-match step relies on.
estimated_points: 8
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: no migration. `Trip` gets two optional fields (`place_source`, `rematched_from`) that default to None, so every stored trip document (DynamoDB item or the local JSON file) still loads and behaves as before. Old trips with `destination_unmatched` are re-matched lazily on open, saved once, and are otherwise untouched.
  - **Backfill / seed**: none. The re-match runs per trip when it is opened and is idempotent: after it saves, the flag is cleared and it does not run again.
  - **Settings**: no new env var. Search uses the existing `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT`, `LIVE_PROVIDERS` (local mode opt-in for `places`) and the existing session secret (to sign place refs). Cache TTL (10 min), cache size (256), debounce (300 ms) and minimum query length (2) are constants in code.
  - **Provisioning**: nothing new. Nominatim is already reachable for `NominatimResolver`.
  - **Order and rollback**: deploy the API first (the web app then finds the new endpoint), then the web app. A new web app against an old API would get 404 from `/places/search` and the picker would show its failure state. Rolling back the API leaves `place_source`/`rematched_from` in stored trips, which old code ignores. If the secret changes, only in-flight picks (under 1 hour old) become invalid.

  ### UI sources
  Read from `TRAVEL-PLANNER-APP-STORY-140-design.html`: screens Home, Destination results, Destination results no match, New trip, Destination picker live off and live unavailable, Trip settings, Trip overview, Recommendations, Recommendations limited data, Visa, Itinerary, Starter planner, Explore change destination, Old trips reopened and Search endpoint response. Tokens come from `design-system/tokens.css`, imported at `apps/web/src/index.css:2`. The app's own classes (`.card`, `.badge-*`, `.alert`, `.empty-state`, `.skeleton`, `.field-*`, `.btn-*`) already exist in `index.css`. Reused components: `EmptyStateArt` (no-match), `FallbackNotice`'s `.alert` pattern (hint, note, limited data) and `Toast`. Prototype-only "Prototype controls" boxes are not built.

  ### Shape of the change
  ```mermaid
  flowchart TD
    Home[DestinationSearch.tsx - unchanged] --> Results[DestinationResultsPage.tsx]
    Results --> Matches[DestinationMatchesView.tsx - new]
    Matches --> Hook[useDestinationSearch.ts - new]
    Picker[DestinationPicker.tsx] --> Hook
    NewTrip[NewTripSetupPage.tsx] --> Picker
    Settings[TripSettingsDrawer.tsx] --> Picker
    Planner[StarterPlannerPage.tsx] --> Picker
    Explore[ExplorePage.tsx] --> Picker
    Hook --> PlacesRouter[routers/places.py - GET /places/search]
    PlacesRouter --> Search[places/destination_search.py - new]
    PlacesRouter --> Deps[routers/deps.py]
    Search --> Starter[trips/starter_destinations.py]
    NewTrip --> TripsRouter[routers/trips.py - verify place_ref]
    Settings --> TripsRouter
    TripsRouter --> Search
    TripsRouter --> Store[trips/store.py - Trip fields]
    TripsRouter --> Dest[trips/destination.py - limited_data]
    Gate[DestinationGate.tsx] --> TripsRouter
    classDef touched fill:#f96,color:#000
    class Results,Matches,Hook,Picker,NewTrip,Settings,Planner,Explore,PlacesRouter,Search,Deps,TripsRouter,Store,Dest,Gate touched
  ```
  `places/destination_search.py` is the one place that decides what is offered and what a signed ref means; both the search route and the trip routes call it, so what search returns and what save accepts cannot drift apart.
review_focus: |
  IN scope: the search endpoint, signed-ref validation on create (and on update when the destination changes), `limited_data` status plus the data-status route, the shared picker at four choice points, the `/destinations?q=` results view, and re-match of old trips. OUT: starter content, photos, ratings, real visa/rates providers, AI, and any change to the home search box. The riskiest areas are (1) the place-ref check in `routers/trips.py`, because a mistake either lets a tampered place through or rejects a legitimate pick, and (2) the many existing tests that post free-text destinations and must be updated. Deliberate decisions: `/destinations?q=` now lists destination matches instead of places; the Starter planner and Trip settings keep their existing actions and only swap the destination control; rate limiting and caching are per instance.
