summary: |
  Add a per-trip Recommendations view (a new tab on the trip page, per the approved design) backed by a new
  `GET /trips/{trip_id}/recommendations` route. The route reads the recommendation source through the existing
  `get_recommendations` dependency, which now returns a local, interest-tagged catalogue when the shared local mode
  switch (`Settings.local_mode`) is on and the existing seeded source when it is off. The route keeps only
  recommendations matching at least one of the trip's interests. The web tab shows the source note (Generated locally
  vs From the recommendation service), the trip-interest chips, a card grid, an empty state for an unmatched
  destination, Open and Save. Save goes through `useSavedPlaces().toggle`; Open goes to the existing destination
  places view. Trips gain an optional `interests` list (nothing stores interests today).
scope:
  - description: |
      Trip interests. Add `interests: list[str] = Field(default_factory=list, max_length=10)` to `TripFields` (each item
      trimmed, 1-40 chars) so it is accepted by the existing create/update routes and kept by both trip stores. Add
      `interests: string[]` to the `Trip` type in `apps/web/src/trips/api.ts`. Giving travellers a UI to edit interests
      is OUT of scope: the story takes interests as given. Local seed trips (local_seed.py) get sample interests so the
      local mode demo has something to filter on.
    files:
      - services/api/app/trips/store.py
      - services/api/app/local_seed.py
      - apps/web/src/trips/api.ts
    rationale: |
      AC 4 needs trips with interests, and a grep of services/api/app and apps/web/src finds none today.
  - description: |
      Local recommendation catalogue and selection. Add an optional `interest: str | None = None` and
      `place: Place | None = None` to `Recommendation` (place from app.places.search, so Save can reuse the saved-places
      flow). Add `SEED_LOCAL_RECOMMENDATIONS` with at least Lisbon (Food, Culture, Outdoors) and Kyoto (Culture, Nature),
      matching the design fixtures, each recommendation tagged with an interest. The two destinations share no
      recommendation ids (AC 3). Reuse `InMemoryRecommendations` for matching, so an unknown destination has none (AC 2).
      In deps.py add `_local_recommendations()` (lru_cache) and change `get_recommendations()` to
      `return _local_recommendations() if get_settings().local_mode else _recommendations()`, the same pattern as
      `get_trips` and `get_invite_sender`. No new field on `LocalStandIns`, since `cloud_services` already follows the one switch.
    files:
      - services/api/app/trips/recommendations.py
      - services/api/app/routers/deps.py
    rationale: |
      AC 5 and 6 need the one shared switch to pick the source; `get_recommendations` is the existing injection point
      used by the day recommendations route, so both routes follow the switch.
  - description: |
      New route in the trips router, next to `day_recommendations`:

      ```python
      @router.get("/{trip_id}/recommendations")
      def trip_recommendations(
          trip_id: str,
          user: str = Depends(get_current_user),
          trips: TripStore = Depends(get_trips),
          identity: IdentityProvider = Depends(get_identity),
          source: RecommendationSource = Depends(get_recommendations),
      ) -> list[Recommendation]:
      ```

      It loads the trip with `_editable_trip` (as the day route does), returns [] with no destination, and otherwise
      returns `source.for_destination(trip.destination)`. With a non-empty `trip.interests` it keeps only
      recommendations whose `interest` is in that list (case-insensitive). With no interests it keeps all of them
      (see open questions).
    files:
      - services/api/app/routers/trips.py
    rationale: AC 1-6. The filtering lives server-side so local and service answers follow the same rule.
  - description: |
      Web Recommendations tab. Add `fetchTripRecommendations(tripId)` and extend `Recommendation` with `interest?` and
      `place?` in trips/api.ts. Add `TripRecommendationsTab.tsx` following the design screens "Trip recommendations" and
      "Trip recommendations (no matches)". It shows an `.alert alert-info` source note ("Generated locally." vs
      `.alert-warning` "From the recommendation service."), a `.cluster` of trip-interest `.chip` buttons with
      `aria-pressed` (all selected at first; toggling filters the list client-side), and a `.grid` of `.card` items with
      image placeholder, `h3` name, `.badge badge-neutral` interest, muted text and a `.btn btn-secondary btn-sm` Open
      beside a `.btn btn-ghost btn-sm` Save. Three `.skeleton` cards show while loading. With no match there is an
      `.empty-state` ("No recommendations for this destination yet", an icon and one `.btn-primary`). With every chip
      deselected the `.empty-state` reads "Pick an interest to see ideas". Wire it into `TripDetailPage.tsx` as a
      `recommendations` tab in `TABS` (guidelines say tabs inside a trip). Save calls `useSavedPlaces().toggle(rec.place)`
      and shows its `panel` (toast + alert); the Save button uses `aria-pressed`, "Saved" label and a filled heart
      (HeartIcon) as in the design. Open navigates to the existing places view for the trip's destination
      (`/destinations?destination=...&q=<name>`). Tokens, spacing and the single-column phone layout come from the
      existing utility classes; no new CSS.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: AC 1, 2, 4, 7, 8, and the loading/empty states the design shows.
  - description: |
      Docs. Update the Recommendations row in docs/local-setup.md ("generated locally from the trip's destination and
      interests when local mode is on; the seeded source otherwise") and the matching line in services/api/README.md if it
      lists stand-ins.
    files:
      - docs/local-setup.md
      - services/api/README.md
    rationale: The README table of what is faked is the project's record of each stand-in.
tests:
  - |
    Backend (new file services/api/tests/unit/test_local_recommendations.py, written first and failing). Uses the
    existing local-mode fixtures from test_local_trips_invites_share.py.

    AC 1:
    ```python
    def test_trip_with_destination_gets_recommendations(local_client, make_trip):
        tid = make_trip(destination="Lisbon", interests=["Food"])
        body = local_client.get(f"/trips/{tid}/recommendations").json()
        assert 1 <= len(body) <= 5
    ```
    AC 2:
    ```python
    tid = make_trip(destination="Nowhere Bay", interests=["Food"])
    assert local_client.get(f"/trips/{tid}/recommendations").json() == []
    ```
    AC 3:
    ```python
    lisbon = {r["id"] for r in get_for("Lisbon")}
    kyoto = {r["id"] for r in get_for("Kyoto")}
    assert lisbon and kyoto and lisbon.isdisjoint(kyoto)
    ```
    AC 4:
    ```python
    recs = get_for("Lisbon", interests=["Culture"])
    assert recs and {r["interest"] for r in recs} == {"Culture"}
    ```
    Existing rows: a trip stored without an `interests` key still loads, and its recommendations answer 200.
  - |
    AC 5 and 6, in the same file (and an extension of test_local_mode.py): local mode on gives a local-catalogue id,
    and off gives the seeded source.
    ```python
    monkeypatch.setenv("LOCAL_MODE", "on"); monkeypatch.setenv("APP_ENV", "local")
    get_settings.cache_clear()
    assert isinstance(get_recommendations(), InMemoryRecommendations)
    assert "kyoto" in get_recommendations()._catalogue
    # off:
    assert "kyoto" not in get_recommendations()._catalogue
    ```
    The route must not read `settings.local_mode` itself; only `get_recommendations` does (assert by overriding the
    dependency with a fake source and checking the route returns the fake's rows).
  - |
    Web (new file apps/web/src/trips/TripRecommendationsTab.test.tsx, vitest + testing-library, using the fake API in
    test-api.tsx).

    AC 1 and 4:
    ```tsx
    expect(await screen.findAllByRole('heading', { level: 3 })).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Food', pressed: true }))
    expect(screen.queryByText('Time Out Market tasting hour')).not.toBeInTheDocument()
    ```
    AC 2: `expect(await screen.findByText('No recommendations for this destination yet')).toBeInTheDocument()`.
    Source note: with a `GET /trips/t1/recommendations` mock the note reads "Generated locally." when the app is in local
    mode (the same signal LocalMenu uses to show itself) and "From the recommendation service." otherwise.
  - |
    AC 7 (web): clicking Open navigates through the existing destination places view.
    ```tsx
    await user.click(screen.getByRole('button', { name: 'Open Time Out Market tasting hour' }))
    expect(location.pathname + location.search).toBe('/destinations?destination=Lisbon&q=Time%20Out%20Market%20tasting%20hour')
    ```
  - |
    AC 8 (web): Save uses the existing saved-places call, not a new one.
    ```tsx
    await user.click(screen.getByRole('button', { name: 'Save Time Out Market tasting hour' }))
    expect(calls).toContainEqual(expect.stringMatching(/^PUT \/saved-places\//))
    expect(await screen.findByRole('button', { name: 'Saved Time Out Market tasting hour' })).toHaveAttribute('aria-pressed', 'true')
    ```
    Plus a TripDetailPage.test.tsx case that the tablist now holds a Recommendations tab.
  - |
    Playwright e2e (apps/web e2e folder, local mode) for AC 3 and 5: open the Lisbon sample trip's Recommendations
    tab, then the Kyoto trip's, and assert the two card-name lists differ and the "Generated locally." note shows.
assumptions_or_open_questions:
  - |
    Trips have no interests today, so this plan adds an optional `interests` list to the trip (default empty). Nothing
    in the story says where travellers set them; no editing UI is planned. Reviewer: confirm, or tell me where interests
    already live.
  - |
    No separate place detail page exists in the web app (the design draws it as "Existing place view"). The only
    existing flows for a recommendation are the Add activity drawer (day recommendations) and the destination places
    results page. I plan Open as navigation to `/destinations?destination=<destination>&q=<name>`. If a different flow is
    meant, say so.
  - |
    Save needs a full `Place` (image_url, place_type, price, lat, lng) for the existing `PUT /saved-places/{id}` flow, but
    `Recommendation` has only id, name and detail. I plan to carry an optional `place` on the local catalogue's
    recommendations. Without a real service adapter there is no way to see what the service returns, so service-mode
    recommendations (the seeded source) are saved only if they carry the same field.
  - |
    A trip with an empty interest list shows every recommendation for its destination (no filter). AC 4 only constrains
    trips that have interests.
  - |
    No real recommendation adapter exists yet; the "outside service" in AC 6 is `InMemoryRecommendations` over
    `SEED_RECOMMENDATIONS`. AC 6 is tested against that source only.
  - |
    The prototype's top strip (trip dropdown and local-mode switch) is prototype-only per the design notes, so it is not
    built; in the app the switch is the existing LocalMenu and LOCAL_MODE. The design's Overview tab is the trip page's
    existing tabs, so the new tab is added to the existing five rather than replacing them.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: `interests` is a new optional field on the Trip with a default of an empty list. No migration,
    and no NOT NULL or enum change. Trips already in DynamoDB or in the local `store.json` have no `interests` key
    and load as `[]`, so they stay readable. A test loads a trip stored without the key.
  - **Backfill / seed**: none for stored rows. Local seed trips (`app/local_seed.py`) get sample interests; the seed only
    runs on an empty local store, so existing local stores are not rewritten (Reset local data adds them).
  - **Settings**: no new setting. The route follows the existing `LOCAL_MODE` / `APP_ENV` settings, documented in
    docs/local-setup.md.
  - **Provisioning**: nothing to create.
  - **Order and rollback**: API and web can deploy in either order (the web tab calls a new route; an older API 404s and
    the tab shows the empty message). Rollback is a plain revert; stored `interests` values are ignored by older code.

  ```mermaid
  flowchart TD
    Tab[TripDetailPage tabs] --> RT[TripRecommendationsTab]
    RT --> API[fetchTripRecommendations in trips/api.ts]
    RT --> Saved[useSavedPlaces toggle]
    Saved --> SP[PUT saved-places]
    API --> R[GET trips/id/recommendations in routers/trips.py]
    R --> Dep[get_recommendations in deps.py]
    Dep -->|local_mode on| Local[local catalogue]
    Dep -->|local_mode off| Seed[SEED_RECOMMENDATIONS]
    Local --> Rec[recommendations.py]
    Seed --> Rec
    R --> Store[Trip.interests in store.py]
    classDef touched fill:#f96,color:#000
    class Tab,RT,API,R,Dep,Rec,Store touched
  ```

  Design reading: all UI details above come from the approved prototype (screens "Trip recommendations", "Trip
  recommendations (no matches)", "Place detail (existing view)"). Conflict flagged: the prototype's tab row shows only
  Overview and Recommendations, but the real trip page already has five tabs, so I add one rather than replace them.
  Also the prototype's "no interest selected" and "saved" states are covered; the "Back to Lisbon trip" button on the
  empty state becomes the one `.btn-primary` linking to the trip's Overview/Itinerary tab.

  Work item text contained no instructions beyond the change itself, so nothing was refused.
review_focus: |
  IN scope: the new per-trip recommendations route, the local catalogue chosen through the existing `get_recommendations`
  dependency, the optional trip `interests` field, and the web tab with Open/Save reusing existing flows. OUT: any
  interests editing UI, real recommendation provider adapters, and new place pages. Riskiest areas are the assumptions
  that Trip gets an `interests` field and that Open goes to the destinations view; check both against the story's
  intent. Deliberate: the route does not read `local_mode` itself, so the switch is applied in one place only.
