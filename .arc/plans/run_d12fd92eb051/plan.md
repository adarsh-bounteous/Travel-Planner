summary: |
  Trips now store a structured `country` and `place` (set by the destination conversion in `trips/destination_conversion.py` and by the dropdown), next to the legacy free-text `destination`. The seven destination views still ignore them. Visa, medical and SIM take the last comma segment of `trip.destination`. Recommendations, restaurants and activities pass the whole "Place, Country" string to providers keyed by the bare place ("lisbon"), so they find nothing. Each web page derives its own label with `split(',')` or shows the raw string. This plan adds ONE backend resolver, `chosen_destination(trip)`, which reads `trip.country` and `trip.place`, and ONE web component, `DestinationGate`, which renders the shared label, the "choose a destination" prompt and the "no information available for this country/place" messages. Every response for the seven views carries `destination` and a server-computed `status`, so the web never guesses "no data" from an empty list. Dropdown, seeding and existing-trip matching stay out of scope.

scope:
  - description: |
      New backend module `app/trips/destination.py`: the single reader of a trip's chosen destination and the single place the label text is built.

      ```python
      DestinationStatus = Literal["ready", "no_destination", "no_country_data", "no_place_data"]

      class ChosenDestination(BaseModel):
          country: str
          place: str | None
          label: str  # "Lisbon, Portugal" (same text as web formatDestination); just the country when there is no place

      def chosen_destination(trip: Trip) -> ChosenDestination | None:
          """From trip.country / trip.place (blank counts as unset). None when no country is chosen."""

      def destination_status(
          chosen: ChosenDestination | None, *, needs_place: bool,
          country_has_data: bool, place_has_data: bool = True,
      ) -> DestinationStatus:
          # None, or needs_place and no place -> "no_destination"
          # not country_has_data -> "no_country_data"
          # needs_place and not place_has_data -> "no_place_data"
          # else "ready"

      def country_has_any_place(country: str, place_has_data: Callable[[str], bool]) -> bool:
          """True when any starter place of this country (starter_destinations.places_in) has data. False for an unknown country."""
      ```

      The legacy `trip.destination` text is no longer parsed for these views. A trip that could not be matched has no country or place, so it gets the "choose a destination" prompt. `visa.destination_country` and `destination_info.country_for` keep their signatures because weather and currency still use them.
    files:
      - services/api/app/trips/destination.py
    rationale: |
      One resolver and one label mean no per-feature text format (the story goal) and AC5. The status function keeps the AC6, 7, 8 and 9 rules in one place.

  - description: |
      Visa, medical and SIM responses carry `destination` and `status`. The callers pass `chosen.country` into the existing string-taking functions, so `visa_result_for` and `medical.guidance_for` keep their signatures.

      - `VisaView.destination` changes from `str` to `ChosenDestination | None`, and gains `status`. The web reads `view.destination` in two places and is updated in the web scope item.
      - `/medical-guidance` today returns a bare `list[TravellerGuidance]`. It becomes `MedicalGuidanceView { destination, status, travellers }`.
      - `SimOptions` (in `sims/options.py`) gains `destination` and `status`. `TripSimOptions` inherits them. `SimOptions.place` stays for existing callers. `gather_sims` computes the status from `chosen_destination(trip)`.
      - Country has data for visa is `country in visa._GUIDANCE`, through a new `visa.has_guidance(country)`. For medical it is `country in medical._ROUTES`, through a new `medical.has_data(country)`. For SIM it is whether any provider covers the country, ignoring dates, through `sims.options.country_covered(providers, country)`, so a date gap is not reported as "no information".
      - SIM options are still only fetched when the trip has dates. `status` is decided before that check.
    files:
      - services/api/app/routers/trips.py
      - services/api/app/routers/sim_options.py
      - services/api/app/sims/options.py
      - services/api/app/trips/medical.py
      - services/api/app/trips/visa.py
    rationale: |
      AC1, 2, 3, 5, 6 and 7. The server decides "no data", so the web never guesses from an empty list.

  - description: |
      Recommendations, restaurants and activities read the chosen PLACE (the bare "Lisbon").

      - `gather_restaurants` and `gather_activities` call `provider.fetch(chosen.place)`. The restaurant filter becomes `_fold(r.city) == _fold(chosen.place)`.
      - `trip_recommendations` and `day_recommendations` call `source.for_destination(chosen.place)`. `/days/{date}/recommendations` stays a list and only gets the place fix.
      - `/trips/{id}/recommendations` becomes `TripRecommendations { destination, status, items }`. `RestaurantOptions` and `ActivityOptions` gain `destination` and `status`. Their `place` field stays.
      - needs_place is True for all three. Country has data is `country_has_any_place(country, lambda p: <source has data for p>)`. Place has data is measured BEFORE the user's interest, diet, price and budget filters, so a filter that empties the list is not reported as "no information for this place".
      - For recommendations use `bool(source.for_destination(place))` as the place check, so the `RecommendationSource` Protocol does not change.
    files:
      - services/api/app/dining/options.py
      - services/api/app/attractions/options.py
      - services/api/app/routers/trips.py
      - services/api/app/routers/restaurant_options.py
      - services/api/app/routers/activity_options.py
      - services/api/app/trips/recommendations.py
    rationale: |
      AC4, 5, 7, 8 and 9. This is the real functional bug: the full "Lisbon, Portugal" string never matched the place-keyed catalogues.

  - description: |
      Web shared pieces. They reuse the global classes `alert`, `empty-state`, `text-muted` and `btn btn-primary`. These are already styled from `design-system/tokens.css`, which `apps/web/src/index.css` line 2 imports. No new CSS, colour or pixel value.

      `apps/web/src/trips/destination.ts`:
      ```ts
      export type DestinationRef = { country: string; place: string | null; label: string }
      export type DestinationStatus = 'ready' | 'no_destination' | 'no_country_data' | 'no_place_data'
      ```

      `apps/web/src/trips/DestinationGate.tsx`:
      ```tsx
      type Props = { tripId: string; destination: DestinationRef | null; status: DestinationStatus; children: ReactNode }
      // no_destination   -> <div role="status" className="empty-state"><h2>Choose a destination</h2>
      //                      <p>Choose a country and place for this trip first.</p>
      //                      <Link className="btn btn-primary" to={`/trips/${tripId}`}>Choose a destination</Link></div>
      // no_country_data  -> <p className="text-muted">Destination: {label}</p> + <p role="status">No information available for this country</p>
      // no_place_data    -> <p className="text-muted">Destination: {label}</p> + <p role="status">No information available for this place</p>
      // ready            -> <p className="text-muted">Destination: {label}</p> then children
      ```

      In `trips/api.ts`, update `VisaView`, `SimOptions`, `RestaurantOptions`, `ActivityOptions`, a new `MedicalGuidanceView` and a new `TripRecommendations`. `fetchMedicalGuidance` and `fetchTripRecommendations` return the wrappers.

      Wrap the content of `VisaRequirementsPage`, `MedicalGuidancePage`, `SimOptionsPage`, `RestaurantOptionsPage`, `ActivityOptionsPage` and `TripRecommendationsTab` in `DestinationGate`. Remove `countryOf` in `SimOptionsPage` and the `split(',')` in `MedicalGuidancePage`. The medical heading becomes `Medical guidance for {destination.country}`. `VisaRequirementsPage` drops its own `Destination: ${view.destination}` line and its `loaded.view.destination || 'Destination'` use (official-site link text) in favour of `destination.country`. Restaurant and activity pages show the place only through the gate label.
    files:
      - apps/web/src/trips/destination.ts
      - apps/web/src/trips/DestinationGate.tsx
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/VisaRequirementsPage.tsx
      - apps/web/src/trips/MedicalGuidancePage.tsx
      - apps/web/src/trips/SimOptionsPage.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/ActivityOptionsPage.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
    rationale: |
      AC5, 6, 7, 8 and 9. One component gives identical label text, one prompt and one message per status across the views.

  - description: |
      Places view for a trip. `TripRecommendationsTab` Open currently navigates to `/destinations?destination=<whole string>&q=...`, and `searchPlaces` is keyed by the bare place. Change it to pass the chosen place from the response: `/destinations?destination=Lisbon&q=...&trip=<tripId>`.

      `DestinationResultsPage` keeps reading `destination` unchanged. When a `trip` param is present it also renders the shared gate from `fetchTrip(trip)`, using `trip.country` and `trip.place`:
      - no country or no place -> "Choose a destination" prompt (AC6, AC8).
      - country not in `fetchStarterDestinations()` -> "No information available for this country" (AC7).
      - search returns no places -> "No information available for this place" instead of "No places match your search" (AC9).
      - otherwise show `Destination: Lisbon, Portugal`.
      Without the `trip` param the page behaves exactly as today.

      To avoid a second label builder, export `destinationLabel(country, place)` from `apps/web/src/trips/destination.ts` and have `places/destinationMatch.ts` `formatDestination` keep its output (`${place}, ${country}`). A test asserts the two agree.
    files:
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/trips/destination.ts
    rationale: |
      AC4, 5, 6, 7, 8 and 9 for the places view. The same place text reaches the places search and the recommendations.

tests:
  - |
    Unit, written first, in `services/api/tests/unit/test_destination.py` (follow the fixtures in `test_visa_router.py`). The resolver and status rules:
    ```python
    def test_label_is_place_comma_country():
        d = chosen_destination(Trip(..., country="Portugal", place="Lisbon"))
        assert (d.country, d.place, d.label) == ("Portugal", "Lisbon", "Lisbon, Portugal")

    def test_blank_country_is_none():
        assert chosen_destination(Trip(..., country=None, place=None)) is None
        assert chosen_destination(Trip(..., country="  ", place="Lisbon")) is None

    def test_status_rules():
        lisbon = ChosenDestination(country="Portugal", place="Lisbon", label="Lisbon, Portugal")
        assert destination_status(None, needs_place=False, country_has_data=True) == "no_destination"
        assert destination_status(lisbon.model_copy(update={"place": None}), needs_place=True, country_has_data=True) == "no_destination"
        assert destination_status(lisbon, needs_place=False, country_has_data=False) == "no_country_data"
        assert destination_status(lisbon, needs_place=True, country_has_data=True, place_has_data=False) == "no_place_data"
        assert destination_status(lisbon, needs_place=True, country_has_data=True) == "ready"
    ```
  - |
    AC1 Portugal visa. API test in `test_visa_router.py`: a trip with `country="Portugal", place="Lisbon"`, GET `/trips/{id}/visa`:
    ```python
    body = client.get(f"/trips/{tid}/visa").json()
    assert body["destination"]["country"] == "Portugal"
    assert body["status"] == "ready"
    assert body["travellers"][0]["guidance"]["country"] == "Portugal"
    ```
    Web, `VisaRequirementsPage.test.tsx`: `expect(await screen.findByText('Destination: Lisbon, Portugal')).toBeInTheDocument()`.
  - |
    AC2 Portugal SIM. API test in `test_sim_options_router.py`:
    ```python
    body = client.get(f"/trips/{tid}/sim-options").json()
    assert body["destination"]["label"] == "Lisbon, Portugal"
    assert body["status"] == "ready"
    assert all("Portugal" in o["countries"] for o in body["options"])
    ```
    A trip whose dates fall outside every SIM stays `ready` with an empty list: `assert body["status"] == "ready" and body["options"] == []`.
  - |
    AC3 Portugal medical. API test in `test_medical_guidance_router.py` (existing assertions move to `body["travellers"]`):
    ```python
    body = client.get(f"/trips/{tid}/medical-guidance").json()
    assert body["destination"]["country"] == "Portugal"
    assert body["status"] == "ready"
    ```
    Web, `MedicalGuidancePage.test.tsx`: `expect(await screen.findByRole('heading', { name: 'Medical guidance for Portugal' })).toBeInTheDocument()`.
  - |
    AC4 the chosen place drives the content. API tests, which fail today because the full string never matches. They use `test_restaurant_options_router.py`, `test_activity_options_router.py` and `test_local_recommendations.py`:
    ```python
    # trip country="Portugal", place="Lisbon"
    assert client.get(f"/trips/{tid}/recommendations").json()["items"]
    assert client.get(f"/trips/{tid}/restaurant-options").json()["options"]
    assert client.get(f"/trips/{tid}/activity-options").json()["options"]
    # trip country="Japan", place="Kyoto" returns the Kyoto items, not Lisbon's
    assert {r["id"] for r in kyoto_items} == {"fushimi-inari", "nishiki-market", "arashiyama-bamboo", "philosophers-path"}
    ```
    Web, `TripRecommendationsTab.test.tsx`: clicking Open navigates to `/destinations?destination=Lisbon&q=...&trip=<id>`, never `Lisbon%2C%20Portugal`.
  - |
    AC5 same label across views. API contract test:
    ```python
    urls = ["visa", "sim-options", "medical-guidance", "recommendations", "restaurant-options", "activity-options"]
    labels = {u: client.get(f"/trips/{tid}/{u}").json()["destination"]["label"] for u in urls}
    assert set(labels.values()) == {"Lisbon, Portugal"}
    ```
    Web, `DestinationGate.test.tsx` plus one test per page rendering the same mocked response:
    ```tsx
    expect(await screen.findByText('Destination: Lisbon, Portugal')).toBeInTheDocument()
    ```
    Also `expect(destinationLabel('Portugal', 'Lisbon')).toBe(formatDestination({ country: 'Portugal', place: 'Lisbon' }))`.
  - |
    AC6 no destination. API, a trip with no country or place returns 200, not 500, on all six endpoints:
    ```python
    for u in urls:
        body = client.get(f"/trips/{tid}/{u}").json()
        assert body["destination"] is None and body["status"] == "no_destination"
    ```
    Also a legacy trip with only `destination="Paris, France"` (unmatched) gets the same prompt. Web, per page and the places view:
    ```tsx
    expect(await screen.findByText('Choose a destination')).toBeInTheDocument()
    expect(screen.queryByText(/Traveller|Option/)).not.toBeInTheDocument()  // page content not rendered
    ```
  - |
    AC7 a country with no data. API, a trip with `country="France", place="Paris"`:
    ```python
    for u in urls:
        assert client.get(f"/trips/{tid}/{u}").json()["status"] == "no_country_data"
    ```
    Web, per page:
    ```tsx
    expect(await screen.findByText('No information available for this country')).toBeInTheDocument()
    ```
  - |
    AC8 a country but no place. API, a trip with `country="Portugal", place=None` on `recommendations`, `restaurant-options` and `activity-options`:
    ```python
    assert body["status"] == "no_destination"
    ```
    The same trip on visa, medical and SIM stays `ready`, because those use only the country. Web, the three place-based pages show `Choose a destination`.
  - |
    AC9 a place with no data. API, a trip with `country="Portugal", place="Lagos"` (a starter place with no seeded recommendations, restaurants or activities):
    ```python
    assert body["status"] == "no_place_data"
    ```
    A filter that empties the list does NOT change the status. A trip with an interest that matches nothing stays `ready` with `items == []`. Web, per page:
    ```tsx
    expect(await screen.findByText('No information available for this place')).toBeInTheDocument()
    ```
    Places view with `?trip=<id>` and an empty search shows the same text.
  - |
    Regression. Update the existing tests that read the old shapes: `test_medical_guidance_router.py`, `test_medical_guidance.py` if it calls the router, the recommendations tests in `test_local_recommendations.py`, and the web tests that mock `/medical-guidance` and `/trips/{id}/recommendations`. Any existing test that creates a trip with only `destination="Lisbon, Portugal"` goes through `_converted` on load and matches. Tests using unmatched text must set `country` and `place`. The full run is `(cd services/api && sh run-py.sh -m pytest -c pytest.ini) && (cd apps/web && pnpm run test)`. Narrow forms while working, for example `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_destination.py)` and `(cd apps/web && pnpm run test -- DestinationGate)`.

assumptions_or_open_questions:
  - |
    Which source decides "has data" for medical. Today `medical._ROUTES` holds only Portugal (citizenships Canada, India, Ireland). The plan uses `_ROUTES` keys only. A Japan trip therefore shows "No information available for this country" on the medical page, where today it shows per-traveller "no data" cards with an official-site link. The alternative is to also accept the seven starter countries, since `starter_destinations` has `medical_guidance` text for each, but that needs a new medical rendering and is outside this story. Decision wanted.
  - |
    Seed data today (read in `dining/providers.py`, `attractions/providers.py` and `trips/recommendations.py`): restaurants for Lisbon and Porto, activities for Lisbon only, recommendations for Lisbon (plus Kyoto in local mode). Most starter places (Lagos, Tokyo, Delhi, and so on) will show "No information available for this place", and a country with no seeded place (for example Thailand) shows the country message. Seeding is a separate story per the item, so this plan adds no seed data. The starter places are not yet fully named (settled on STORY-102), so the "country has data" check uses `starter_destinations.places_in(country)` and will pick up new places as they are added.
  - |
    The "places" view is not trip-scoped today: `/destinations` is a global search. The plan makes it trip-aware only when opened with a new `trip` query param from the trip's recommendations tab. If the reviewer means a different trip-scoped places view, say so.
  - |
    `MyTripsPage.tsx` builds its label as `${trip.country}, ${trip.place}` (country first), the reverse of `formatDestination` ("Place, Country"). It is not one of the seven views, so the plan leaves it alone. Should it be aligned to the shared label too?
  - |
    The plan changes two API response shapes (`/medical-guidance` and `/trips/{id}/recommendations` from a list to an object) and `VisaView.destination` from a string to an object. The only web callers found are in `apps/web/src/trips/api.ts`. The Playwright e2e specs and `VisaSummaryCard` (which calls `fetchVisa`) were not opened. The implementer must grep for other consumers before changing the shapes.
  - |
    Trips with free-text destination that never matched the dropdown list have no country or place. They get the "Choose a destination" prompt on all seven views. Matching them is the separate STORY-101 work, which is already merged, so this plan relies on it.
  - |
    The existing test fixtures and the exact router test helper names were not all opened. The implementer must follow the layout in `services/api/tests/unit` and the web test setup used by the neighbouring `*.test.tsx` files.

estimated_points: 8

package_dependencies: []

review_focus: |
  IN scope: one backend resolver, `chosen_destination(trip)`, reading `trip.country` and `trip.place`, one shared web `DestinationGate`, and the seven views (visa, SIM, medical, places, recommendations, restaurants, activities) using them. OUT: the dropdown, seed data and existing-trip matching. The riskiest parts are the three response-shape changes (`/medical-guidance`, `/trips/{id}/recommendations`, `VisaView.destination`) and the place-versus-country split: restaurants, activities and recommendations use the PLACE, while visa, medical and SIM use the COUNTRY. Deliberate: "no data" is decided by the server as a `status`, and place data is measured before the user's filters, so a filter that empties a list is not reported as "no information". The medical "has data" rule (`_ROUTES` only) and the choice not to add seed data are open questions, not oversights.

notes: |
  ### Data & rollout
  None — no stored data changes. `trip.country` and `trip.place` already exist on `Trip` (`services/api/app/trips/store.py`) and are filled on load by `_converted`. There are no migrations, seeds or settings. Three API responses change shape, so deploy the API and web together. Rollback is a plain revert.

  Design tokens: `apps/web/src/index.css` line 2 imports `design-system/tokens.css`. `DestinationGate` only reuses `.alert`, `.empty-state`, `.text-muted` and `btn btn-primary`, which `index.css` already defines from tokens (for example `.empty-state` at line 139 and `.text-muted` at line 24). It adds no colour or pixel literals and needs no new tokens. I did not open `tokens.css` itself.

  The draft this replaces assumed a single "Place, Country" string. The current code has structured `country` and `place`, which is why `chosen_destination` takes a `Trip` and no longer splits text.

  ```mermaid
  flowchart TD
    D[trips/destination.py chosen_destination and status]:::touched
    V[trips/visa.py has_guidance]:::touched
    M[trips/medical.py has_data]:::touched
    T[routers/trips.py visa, medical, recommendations]:::touched
    S[routers/sim_options.py]:::touched
    SO[sims/options.py gather_sims]:::touched
    R[dining/options.py gather_restaurants]:::touched
    A[attractions/options.py gather_activities]:::touched
    RE[trips/recommendations.py]:::touched
    SD[trips/starter_destinations.py places_in]
    CV[trips/destination_conversion.py fills country and place]
    W[web DestinationGate]:::touched
    P[web pages, TripRecommendationsTab, DestinationResultsPage]:::touched
    CV -->|sets trip.country and trip.place| T
    T -->|resolve and status| D
    S -->|via gather_sims| SO
    SO -->|resolve and status| D
    R -->|place and status| D
    A -->|place and status| D
    T -->|source.for_destination place| RE
    D -->|country has any place| SD
    T -->|has data| V
    T -->|has data| M
    P -->|render label, prompt, no-info| W
    P -->|fetch with destination and status| T
    classDef touched fill:#f96,color:#000
  ```
