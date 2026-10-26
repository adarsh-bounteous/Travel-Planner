summary: |
  Let travellers pick transport from the leg shortlist (flight, train, bus, taxi) and follow the provider's booking link. A pick is stored on the Trip per leg (to and from the destination, between cities, local taxi), so there can be up to three picks at once. A pick can be changed (a new pick on the same leg replaces the old one) or cleared. Picks feed the existing trip cost summary (taxi estimates included) and show under chosen options on the itinerary. A fare that changes after the pick is refreshed on the pick, and the total uses the new fare. Nothing is paid in the app. This mirrors the shipped chosen-stay feature (STORY-044) on the API and web sides, and builds the approved prototype screens: Trip transport, Transport shortlist and Itinerary.
scope:
  - description: |
      API model. Add `TransportLeg = Literal["destination", "between_cities", "local_taxi"]` and a `TransportPick` model to the store, and a server-owned `transport: list[TransportPick] = []` on `Trip`, next to `stays`.

      ```python
      class TransportPick(BaseModel):
          leg: TransportLeg
          option_id: str
          mode: Mode
          provider: str
          origin: str
          destination: str
          date: date
          estimate: bool = False      # taxi fares are estimates
          fare: Decimal               # current fare, refreshed
          picked_fare: Decimal        # fare when picked, to show "was ..."
          currency: str
          url: HttpUrl                # provider booking page
      ```
      The default `[]` means stored trips without the key still load (DynamoTripStore._to_trip validates it away). Trip.options stays untouched so Book trip is unaffected.
    files:
      - services/api/app/trips/store.py
    rationale: |
      Picks live on the Trip, like Stay.chosen, so they are saved and shared with the same ownership and editor rules. A leg-keyed list gives "one pick per leg, several legs at once" without a new table.
  - description: |
      API routes, new router `transport_picks.py` included in main.py. Same shape as the chosen-stay routes in stay_options.py.

      ```python
      @router.put("/{trip_id}/transport/{leg}")      # body ChooseTransport(origin, destination, date, option_id)
      def pick_transport(...) -> TripView
      @router.delete("/{trip_id}/transport/{leg}")
      def clear_transport(...) -> TripView
      @router.post("/{trip_id}/transport/refresh")
      def refresh_transport(...) -> TripView
      ```
      PUT uses `_editable_trip`, rebuilds the option list with `gather_flights(providers, origin, destination, date)` and takes the fare and url from the matching option, never from the body. An unknown option id gives a new `INVALID_TRANSPORT = ApiError(422, "invalid_transport")`. It replaces any pick on the same leg. DELETE removes the leg's pick and returns 404 for an unknown trip. POST refresh re-fetches each pick's leg, updates `fare` (keeping `picked_fare`) and leaves the pick in place if its option is no longer returned. Add a `_save_transport` helper in routers/trips.py like `_save_stays`.
    files:
      - services/api/app/routers/transport_picks.py
      - services/api/app/routers/trips.py
      - services/api/app/main.py
    rationale: |
      Taking price and link server-side stops a client from forging a fare or link. A refresh endpoint gives AC13 without making every trip GET call providers, which would add up to 5 s of latency per read.
  - description: |
      Trip total. In `summarise_cost` add a loop over `trip.transport` after the stays loop, using the same rate lookup (currency conversion, `unconvertible_count`, `used` rates) with `pick.fare`. Taxi estimates count like any fare. Clearing a pick removes it from the sum because the sum is recomputed on every view.
    files:
      - services/api/app/trips/cost.py
    rationale: |
      One total, one place. The budget and over-budget alert already follow `CostSummary.total`.
  - description: |
      Web API client. Add types `TransportLeg`, `TransportPick` (the `Trip.transport?` field) and functions `pickTransport(tripId, leg, {origin, destination, date, optionId})`, `clearTransport(tripId, leg)` and `refreshTransport(tripId)`, following chooseStay and clearChosenStay.
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Matches the existing client conventions.
  - description: |
      Shortlist. FlightShortlistPage reads a `leg` query param (`destination`, `between_cities` or `local_taxi`) and loads the trip's current picks. Each FlightShortlistCard gets an optional Pick control, matching the prototype's Transport shortlist: a `btn-secondary` "Pick" that becomes a `btn-primary` "Picked" with a check icon and `aria-pressed`, and the card gets the selected outline (`is-picked`: 2px `--color-primary` border). Picking another option moves the pick, with a toast "Picked X. Your earlier pick is replaced." or "Picked X. Added to your trip total." The leg heading and a "Done" ghost button (returns to the trip) match the prototype panel. Failure shows an `alert alert-danger` that says what happened and what to do.
    files:
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/trips/FlightShortlistCard.tsx
    rationale: |
      The shortlist is where options are chosen. The card is reused rather than duplicated, as the prototype reuses the STORY-038 card.
  - description: |
      Trip transport screen. New `TransportTab.tsx` plus a "Transport" entry in `TABS` in TripDetailPage.tsx (inside-trip `.tabs`, per the UI guidelines). One `.card.stack` per leg (To and from <destination>, Between cities, Local taxi in <destination>). A pick is a nested `.card` (surface background) with the mode, provider and fare ("Estimate" prefix for taxis), the "Book with provider" link (`target="_blank" rel="noopener noreferrer"`, with an sr-only "(opens in a new tab)") sitting beside the note "Fare may differ on the provider's booking page.", and `btn-secondary` Change and `btn-ghost` Clear buttons (editors only). An empty leg shows `.empty-state` "No transport picked yet" and a `btn-secondary` "Choose transport" linking to the shortlist with `leg`. A warning badge "Fare updated, was <picked_fare>" and an `alert-warning` "A fare changed after you picked it..." appear when `fare != picked_fare`. The tab shows the trip total in an `aria-live="polite"` neutral badge with the line "Adds up N picks, including taxi estimates. You pay providers when you book with them.", and one `btn-primary` "View itinerary" that opens the Itinerary tab. No payment control anywhere. The tab calls `refreshTransport` on mount. Clearing shows a toast "Cleared X. It is no longer in your trip total." Single column, 375px first, spacing from `--space-2` and `--space-3`.
    files:
      - apps/web/src/trips/TransportTab.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: |
      Covers AC 1-5, 8, 10-13 in the UI as the Trip transport prototype screen shows them.
  - description: |
      Itinerary. In ItineraryTab.tsx add a `ChosenTransport` section titled "Chosen options" before the days (the prototype's card with a `chosen` list: "<leg name>: <mode> · <provider> · <fare>", "Estimate" prefix for taxis), an empty line "No transport picked yet. Pick transport on the trip." when there are none, and "Trip total <total>" taken from `trip.cost.total`, like the existing ChosenStays section.
    files:
      - apps/web/src/trips/ItineraryTab.tsx
    rationale: |
      AC 9, and the itinerary repeats the trip total (AC 6-8).
tests:
  - |
    AC1, API, written first in services/api/tests/unit/test_transport_picks_router.py (fake flight provider like test_stay_shortlist_router).
    ```python
    r = client.put(f"/trips/{t}/transport/destination", json=PICK_A)
    assert r.status_code == 200
    assert [p["option_id"] for p in r.json()["transport"]] == ["flight-a"]
    ```
  - |
    AC2, a pick on the same leg replaces the earlier one.
    ```python
    client.put(f"/trips/{t}/transport/destination", json=PICK_A)
    r = client.put(f"/trips/{t}/transport/destination", json=PICK_B)
    assert [p["option_id"] for p in r.json()["transport"]] == ["flight-b"]
    ```
  - |
    AC3, clearing removes the pick.
    ```python
    r = client.delete(f"/trips/{t}/transport/destination")
    assert r.json()["transport"] == []
    ```
  - |
    AC4 and AC11, three legs can be picked at once.
    ```python
    for leg, body in [("destination", PICK_A), ("between_cities", PICK_BUS), ("local_taxi", PICK_TAXI)]:
        r = client.put(f"/trips/{t}/transport/{leg}", json=body)
    assert {p["leg"] for p in r.json()["transport"]} == {"destination", "between_cities", "local_taxi"}
    ```
  - |
    AC5 and AC12 (API half), the url comes from the provider, not the body. Web test is in TransportTab.test.tsx below.
    ```python
    body = {**PICK_A, "url": "https://evil.example"}
    r = client.put(f"/trips/{t}/transport/destination", json=body)
    assert r.json()["transport"][0]["url"] == "https://airline.example/a"
    ```
    An unknown option id gives `assert r.status_code == 422` and `assert r.json()["error"] == "invalid_transport"`. A viewer who is not an editor gets 403.
  - |
    AC6 and AC7, written first in services/api/tests/unit/test_cost_transport.py.
    ```python
    assert summarise_cost(trip_with(pick(fare="180")), RATES).total == 180.0
    assert summarise_cost(trip_with(pick(fare="25", estimate=True, mode="taxi")), RATES).total == 25.0
    assert summarise_cost(trip_with(pick("180"), pick("25")), RATES).total == 205.0
    ```
    A foreign-currency pick is converted and listed in `summary.rates`, and an unconvertible one adds nothing and is counted in `unconvertible_count`.
  - |
    AC8, clearing drops the fare from the total, both in the cost unit test and through the API.
    ```python
    t.transport = []
    assert summarise_cost(t, RATES).total == 0.0
    assert client.delete(f"/trips/{t}/transport/destination").json()["cost"]["total"] == 0.0
    ```
  - |
    AC13, the refresh endpoint updates the fare and keeps the pick.
    ```python
    provider.fare = Decimal("195")
    r = client.post(f"/trips/{t}/transport/refresh")
    pick = r.json()["transport"][0]
    assert pick["fare"] == "195" and pick["picked_fare"] == "180"
    assert r.json()["cost"]["total"] == 195.0
    ```
    A pick whose option disappeared from the provider keeps its last fare and is still listed.
  - |
    Existing-data test (store). A stored trip without a `transport` key still loads, and a pick round-trips as JSON.
    ```python
    t = DynamoTripStore._to_trip({"pk": "USER#u", "sk": "TRIP#t", "id": "t", "name": "T"})
    assert t.transport == []
    ```
  - |
    AC1, 2, 3 and 4, web, in FlightShortlistPage.test.tsx (extend). The card shows "Pick" and then "Picked".
    ```ts
    await user.click(screen.getByRole('button', { name: 'Pick' }))
    expect(await screen.findByRole('button', { name: 'Picked' })).toHaveAttribute('aria-pressed', 'true')
    ```
    Picking another option leaves only that one "Picked", and picking a taxi on `leg=local_taxi` while a flight is picked leaves both picks on the trip.
  - |
    AC5, AC10 and AC12, web, in new TransportTab.test.tsx. The link and note are shown together and nothing offers payment.
    ```ts
    const link = screen.getByRole('link', { name: /Book with provider/ })
    expect(link).toHaveAttribute('href', 'https://airline.example/a')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText("Fare may differ on the provider's booking page.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay|checkout|buy/i })).toBeNull()
    ```
  - |
    AC3 and AC8, web. Clearing removes the pick and updates the total.
    ```ts
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(await screen.findByText('No transport picked yet')).toBeInTheDocument()
    expect(screen.getByText(/EUR\s?25\.00|€25\.00/)).toBeInTheDocument()
    ```
  - |
    AC6, AC7 and AC13, web. The total badge shows the sum including the taxi "Estimate", and a changed fare shows the "Fare updated, was ..." badge while the pick stays listed.
    ```ts
    expect(screen.getByText(/Fare updated, was/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Book with provider/ })).toBeInTheDocument()
    ```
  - |
    AC9, web, in ItineraryStays.test.tsx style. The itinerary lists the pick under "Chosen options".
    ```ts
    const section = screen.getByRole('heading', { name: 'Chosen options' }).closest('div')!
    expect(within(section).getByText(/Atlantic Air/)).toBeInTheDocument()
    ```
    With no picks it shows "No transport picked yet. Pick transport on the trip."
  - |
    AC11, web. All three legs picked renders three pick cards in the tab (`getAllByRole('link', { name: /Book with provider/ })` has length 3).
assumptions_or_open_questions:
  - |
    A "leg" is one of three fixed kinds (destination, between_cities, local_taxi) with one pick each, as the prototype's three leg cards show. Several picks on one kind (for example two separate between-city journeys) are not covered. Tell me if that is needed.
  - |
    AC13 ("fare changes after it was chosen") is met by a refresh endpoint that the Transport tab calls on load, not by re-querying providers on every trip read. A fare that changes between visits therefore shows once the tab is opened. The fare also lives on the pick as `fare` next to `picked_fare`.
  - |
    The prototype's "Preview as" demo chips (Flight fare changed, Reset picks) are reviewer scaffolding and are not built.
  - |
    The prototype shows a single total badge in EUR. The real screen uses the trip currency and the existing `formatMoney`, which always includes the currency. The prototype's shortlist is an in-flow panel instead of the wireframe's drawer. I build it on the existing shortlist page, which already is a page, so there is no conflict.
  - |
    The leg's origin, destination and date for the shortlist query come from the trip (home city is not stored, so the "To and from" leg links use the same origin and destination query that FlightShortlistPage already takes). I did not find where origin is set for the Transport tab links, so the tab needs the traveller to start from an existing route link or the leg uses the trip destination with trip start date. To confirm with the reviewer.
  - |
    The work item text contains no instruction outside the change itself, so nothing was refused.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: a new optional `transport` list on the stored Trip item. Existing items lack the key and load as `[]` through `Trip.model_validate`. No migration or backfill.
  - **Backfill / seed**: none.
  - **Settings**: none. Provider timeouts reuse `FLIGHT_SOURCE_TIMEOUT_SECONDS`.
  - **Provisioning**: none. The DynamoDB item is schemaless.
  - **Order and rollback**: deploy API and web together. The web tolerates a missing `transport` (`trip.transport ?? []`). Rolling the API back leaves an unknown `transport` attribute on stored items, which the old model ignores (Pydantic default `extra=ignore`), so it is safe to leave.

  ```mermaid
  flowchart TD
    FSP[FlightShortlistPage / Card] -->|PUT /transport/leg| TP[routers/transport_picks.py]
    TT[TransportTab] -->|DELETE and refresh| TP
    TDP[TripDetailPage] --> TT
    TP --> GF[flights/options gather_flights]
    TP --> TR[routers/trips.py _editable_trip and _save_transport]
    TR --> ST[trips/store.py Trip.transport]
    TR --> CO[trips/cost.py summarise_cost]
    IT[ItineraryTab] --> CO
    classDef touched fill:#f96,color:#000
    class FSP,TP,TT,TDP,TR,ST,CO,IT touched
  ```
  Every node is a file that exists today except `transport_picks.py` and `TransportTab.tsx`, which are new. They sit beside `stay_options.py` and `ItineraryTab.tsx`.

  Design source: the prototype screens Trip transport (leg cards, nested pick, link beside note, total badge, View itinerary), Transport shortlist (Pick/Picked card, Done) and Itinerary (Chosen options list, total). Tokens and classes used are the project's `.card`, `.badge`, `.btn-*`, `.empty-state`, `.alert`, `.toast`.
review_focus: |
  IN: pick/change/clear per leg, booking link plus note, total including taxi estimates, refresh on fare change, itinerary chosen options. OUT: payment, provider integrations, multi-pick on one leg, a preferences change. Riskiest is the fare refresh (AC13) and currency conversion in `summarise_cost`. The price and url are taken from the provider on the server, never the request body, which is deliberate. The origin and date source for each leg link is an open question to confirm.
