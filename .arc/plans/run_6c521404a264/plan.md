summary: |
  Let the traveller choose one stay from a Stay's shortlist (the Stay is a place plus a date range on a Trip), change or clear that choice, follow the provider's booking link, and have the chosen stay's dates and cost flow into the trip itinerary and trip total. The API stores the choice on the Stay (server-resolved from the shortlist so price and booking URL are never client-supplied), adds the cost to `summarise_cost`, and the web app adds a chosen-stay card and Choose buttons on the existing shortlist page, plus a stays list in the itinerary. Booking happens on the provider's site in a new tab; nothing payment-related is added.

scope:
  - description: |
      API model: add an optional `chosen` snapshot to `Stay`, plus the `ChosenStay` model. Existing stored Stays have no such key, so the default None keeps them valid.

      ```python
      class ChosenStay(BaseModel):
          property_id: str
          name: str
          provider: str            # the provider of the lowest offer
          url: HttpUrl             # that offer's booking page
          total: Decimal           # for the Stay's nights
          currency: str            # the offer's currency; may differ from the trip currency

      class Stay(StayFields):
          id: str
          chosen: ChosenStay | None = None   # server-owned: changed only through the chosen-stay routes
      ```
      `StayFields` (the request body of add/change stay) is untouched, so a client can never set `chosen` through the existing stay routes.
    files:
      - services/api/app/trips/store.py
    rationale: |
      Storing the choice on the Stay gives "one chosen stay per date range" by construction (AC2, AC3) and removes it when the Stay is removed. A snapshot (name, provider, url, total) keeps the itinerary and total stable if provider prices later move.

  - description: |
      API routes, in the same router as the shortlist, accepting the same criteria query as `/shortlist`:

      ```python
      class ChooseStay(BaseModel):
          property_id: str

      @router.put("/{trip_id}/stays/{stay_id}/chosen")
      def choose_stay(trip_id, stay_id, body: ChooseStay, <same criteria query params as stay_shortlist>, ...) -> TripView

      @router.delete("/{trip_id}/stays/{stay_id}/chosen")
      def clear_chosen_stay(trip_id, stay_id, ...) -> TripView
      ```
      `choose_stay` uses `_editable_trip` (owner or accepted editor; 403 otherwise, 404 for stranger), 404s an unknown Stay, builds `build_shortlist(providers, stay, criteria)`, finds `property.id == body.property_id` in `shortlist.stays` (422 `invalid_stay` if it is not on the shortlist), and sets `stay.chosen` from the cheapest offer (`min(offers, key=total)`, the same rule `_Scored` uses). A second PUT replaces the first. Both routes save through a `_save_stays`-style helper (sets `updated_at`, `trips.save_trip`, returns `_view`). Because `_view` dumps `trip.stays`, `chosen` reaches the client with no extra serialising.

      Also fix `change_stay` (PUT `/{trip_id}/stays/{stay_id}`): it rebuilds `Stay(id=..., **body)` and would silently drop `chosen`. Rule: keep `chosen` when place and dates are unchanged; clear it when they change, since the priced dates no longer apply.
    files:
      - services/api/app/routers/stay_options.py
      - services/api/app/routers/trips.py
    rationale: |
      Resolving the price and URL server-side stops a client from planting an arbitrary cost or link on a trip. Reusing `build_shortlist` and `_editable_trip` keeps ranking, auth and error shapes identical to the existing routes.

  - description: |
      Trip total: in `summarise_cost`, after the options loop, add each chosen stay's `total` converted with `rates.rate(currency, trip.currency)` (same conversion, `used` rates and `unconvertible_count` handling as options). Stays with `chosen is None` are skipped; no change to `unpriced_count` or `missing_categories`.
    files:
      - services/api/app/trips/cost.py
    rationale: |
      AC7/AC8: the total is computed server-side for the Trip view, so clearing a choice drops the total on the next response with no client arithmetic.

  - description: |
      Web API client: add `ChosenStay` type and `chosen?: ChosenStay | null` on `Stay`; add

      ```ts
      export const chooseStay = (tripId: string, stayId: string, propertyId: string, c: StayCriteria) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(stayId)}/chosen?${stayQuery(c)}`, 'PUT', { property_id: propertyId })
      export const clearChosenStay = (tripId: string, stayId: string) =>
        call<Trip>(`/trips/${encodeURIComponent(tripId)}/stays/${encodeURIComponent(stayId)}/chosen`, 'DELETE')
      ```
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Follows the existing `addStay`/`removeStay` pattern; `call` already maps 403/404/422 to typed errors.

  - description: |
      New `ChosenStayCard` rendering the design's "Chosen stay" `.card.chosen-card` section (`aria-label="Chosen stay"`, `aria-live="polite"`), placed above the shortlist in `StayShortlistPage`:
      - Chosen state: `.badge.badge-success` with check icon and "Chosen"; `h3` stay name; "Cost for these dates:" with the cost in `--font-size-xl` bold (`formatMoney`, always with the currency code); muted note "Final price confirmed on provider's site. You book with {provider}; nothing is paid in the app." (AC9); actions row: one `.btn.btn-primary` link "Book on provider site" (`<a href={url} target="_blank" rel="noopener noreferrer">` with sr-only "(opens in a new tab)", AC4/AC5), `.btn.btn-secondary` "Change stay" (scrolls to and focuses the first Choose button), `.btn.btn-ghost` "Clear chosen stay".
      - Empty state (after clear): `.empty-state` "No stay chosen yet" / "Pick one from the shortlist below to see its booking link and add it to your itinerary."
      - Only render the link when `url` starts with http(s); no payment control or form anywhere.
      Read-only travellers (`can_edit` false) get no Choose/Change/Clear buttons but still see the card and the link.
    files:
      - apps/web/src/trips/ChosenStayCard.tsx
    rationale: |
      Built from the approved prototype (screen "Trip stays shortlist"): single column, chosen card above the shortlist so the decision stays in view, one `.btn-primary` per section. Uses existing classes only (`card`, `badge`, `btn-*`, `empty-state`, `row-between`).

  - description: |
      `StayShortlistCard` gains optional `chosen?: boolean`, `busy?: boolean`, `onChoose?: () => void`. It keeps all STORY-043 content (rank, reason, fit, offers) and adds a `.btn.btn-secondary` at the end: "Choose stay" with sr-only ": {name}" and `aria-pressed="false"`; for the chosen stay a disabled "Chosen" button with check icon and `aria-pressed="true"`; while a choice is in flight the label is "Choosing…" and it is disabled (design JS). `StayShortlistPage` loads the chosen stay from `trip.stays[].chosen` (it already calls `fetchTrip`), matches it to cards by `property.id`, calls `chooseStay`/`clearChosenStay`, replaces its local `stay` from the returned Trip, and shows a `.toast` (existing `Toast.tsx`): "{name} is your chosen stay for {dates}." and, on clear, "Stay cleared for these dates" with an Undo that re-chooses the previous property. A failed call shows an inline `.alert.alert-danger`: "We couldn't save your choice. Try again." Also link "View itinerary" back to the trip, as in the design subtitle.
    files:
      - apps/web/src/trips/StayShortlistCard.tsx
      - apps/web/src/trips/StayShortlistPage.tsx
    rationale: |
      AC1-AC3 UI. Design conflict, resolved deliberately: the prototype's shortlist rows are slim (name, provider, cost, Choose) because comparison and ranking are explicitly out of its scope ("belong to STORY-043"). The app already ships the richer STORY-043 cards, so this plan keeps them and only adds the Choose control rather than regressing 043.

  - description: |
      Itinerary: `ItineraryTab` lists each Stay that has a chosen stay in a "Stays" `.stack` of `.card.row-between` rows above the day cards, each showing bold name, the date range (`formatRange`) and the cost via `formatMoney`, in the trip currency when the cost was converted (reuse the `OptionPrice` approach: show converted value with the original as `small`). Stays with no choice are not listed; nothing is shown when none is chosen. The existing `TripTotalCard` already renders `trip.cost.total`, now including the stay; add a muted note "Final price confirmed on provider's site." beneath the stay list (matches the design itinerary screen).
    files:
      - apps/web/src/trips/ItineraryTab.tsx
    rationale: |
      AC6/AC8. The prototype's itinerary screen is a standalone page; in the real app the Itinerary tab and total card are the equivalent, so the stay list is added there rather than creating a new route. Its "No stay in your itinerary" empty state is not reproduced because the day cards already carry their own empty states; flag if the reviewer wants it.

tests:
  - |
    AC1 (API, write first, services/api/tests/unit/test_chosen_stay_router.py). Choosing a shortlisted property stores it on that Stay.
    ```python
    r = client.put(f"/trips/{tid}/stays/{sid}/chosen?property_type=hotel&rooms=1", json={"property_id": pid})
    assert r.status_code == 200
    chosen = next(s for s in r.json()["stays"] if s["id"] == sid)["chosen"]
    assert chosen["property_id"] == pid and chosen["name"] == "Casa Azulejo"
    assert Decimal(chosen["total"]) == Decimal("480")
    assert client.get(f"/trips/{tid}").json()["stays"][0]["chosen"]["property_id"] == pid  # persisted
    ```
    Also: a property not on the shortlist gives `assert r.status_code == 422`; unknown stay id gives 404; a read-only/stranger user gives 403/404; a client-supplied price or url in the body is ignored (extra field not stored).
  - |
    AC2 (API). Choosing a different property replaces the first.
    ```python
    client.put(url, json={"property_id": a}); r = client.put(url, json={"property_id": b})
    chosen = r.json()["stays"][0]["chosen"]
    assert chosen["property_id"] == b
    assert sum(1 for s in r.json()["stays"] if s["chosen"]) == 1
    ```
  - |
    AC3 (API). Clearing removes the choice.
    ```python
    r = client.delete(f"/trips/{tid}/stays/{sid}/chosen")
    assert r.status_code == 200 and r.json()["stays"][0]["chosen"] is None
    ```
    Plus: `change_stay` with the same place and dates keeps `chosen`; with new dates `assert r.json()["stays"][0]["chosen"] is None`.
  - |
    AC4/AC5 (web, apps/web/src/trips/ChosenStayCard.test.tsx and StayShortlistPage.test.tsx, vitest + testing-library). The chosen card exposes the provider booking link, opening in a new tab.
    ```tsx
    const link = screen.getByRole('link', { name: /Book on provider site/ })
    expect(link).toHaveAttribute('href', 'https://booking-nest.example/stays/casa-azulejo?checkin=2027-01-01&checkout=2027-01-05')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    ```
    A non-http(s) url renders no link. No link is rendered when nothing is chosen.
  - |
    AC1-AC3 (web, StayShortlistPage.test.tsx). Clicking Choose calls the API and updates the card and buttons; Change replaces; Clear shows the empty state and an Undo toast.
    ```tsx
    await user.click(screen.getByRole('button', { name: /Choose stay: Rua Verde Stay/ }))
    expect(fetchMock).toHaveBeenCalledWith('/trips/t1/stays/s1/chosen?property_type=hotel&rooms=1', expect.objectContaining({ method: 'PUT' }))
    expect(within(screen.getByRole('region', { name: 'Chosen stay' })).getByRole('heading', { name: 'Rua Verde Stay' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Chosen/ })).toBeDisabled()   // only the new stay
    await user.click(screen.getByRole('button', { name: 'Clear chosen stay' }))
    expect(screen.getByText('No stay chosen yet')).toBeVisible()
    ```
  - |
    AC6/AC8 (web, new ItineraryStays.test.tsx or ItineraryTab test). A chosen stay lists name, dates and cost; a cleared one does not.
    ```tsx
    render(<ItineraryTab trip={tripWithChosenStay} {...noop} />)
    const row = screen.getByText('Casa Azulejo').closest('.card')!
    expect(within(row).getByText('480 EUR')).toBeVisible()
    expect(within(row).getByText(/1 Jan/)).toBeVisible()
    // rerender with chosen: null
    expect(screen.queryByText('Casa Azulejo')).not.toBeInTheDocument()
    ```
  - |
    AC7 (API, services/api/tests/unit/test_cost_chosen_stay.py). The total includes the chosen stay, converting foreign currency, and drops after clear.
    ```python
    trip = Trip(id="t", name="T", currency="EUR", stays=[Stay(id="s", place="Lisbon", start_date=d1, end_date=d2,
        chosen=ChosenStay(property_id="p", name="Casa", provider="BN", url="https://x.example/p", total=Decimal("480"), currency="EUR"))])
    assert summarise_cost(trip, rates).total == 480.0
    trip.stays[0].chosen = None
    assert summarise_cost(trip, rates).total == 0.0
    ```
    Plus a GBP stay against EUR trip uses the rate and appears in `rates`; an unconvertible currency increments `unconvertible_count` and adds nothing. A router-level check that `GET /trips/{id}` `cost.total` rises after PUT and falls after DELETE.
  - |
    AC9 (web). With a chosen stay shown, no payment UI exists.
    ```tsx
    expect(screen.queryByRole('button', { name: /pay|checkout|card number/i })).toBeNull()
    expect(document.querySelector('form')).toBeNull()
    expect(screen.getByText(/nothing is paid in the app/i)).toBeVisible()
    ```
  - |
    Backward compatibility (API, test_trip_store or the new router test). A Trip item stored before this change (stays without a `chosen` key) still loads.
    ```python
    trip = DynamoTripStore._to_trip({"pk": "USER#u", "sk": "TRIP#t", "id": "t", "name": "T", "stays": [{"id": "s", "place": "Lisbon", "start_date": "2027-01-01", "end_date": "2027-01-05"}]})
    assert trip.stays[0].chosen is None
    ```
    Also round-trip a chosen stay through `model_dump(mode="json")` and `Trip.model_validate` and assert `chosen.total == Decimal("480")`.

assumptions_or_open_questions:
  - |
    The chosen stay lives on the Stay (date range) rather than the trip's `options` list, so the existing Book trip flow and `missing_categories` are unaffected. Confirm this is wanted rather than a ChosenOption with category "Stay".
  - |
    The cost is the lowest offer's total across providers (the figure the shortlist ranks and displays), and the booking link is that same offer's URL. The shortlist does not let a traveller pick a specific provider's offer, and the design shows one provider per stay.
  - |
    The choose endpoint takes the same criteria query as the shortlist route so the server can rebuild exactly the shortlist the traveller saw. If provider prices moved between viewing and choosing, the stored total is the fresh one and the page shows it.
  - |
    Editing a Stay's place or dates clears its chosen stay, because the priced dates no longer apply. The traveller sees the empty state and re-chooses.
  - |
    Editors (not only owners) may choose, change and clear, matching the other stay routes. Read-only share-link viewers see the chosen stay and link but no controls.
  - |
    Design conflicts: the prototype's slim shortlist rows versus the shipped STORY-043 ranked cards (we keep the cards and add Choose); the prototype's separate Itinerary screen versus the app's Itinerary tab (we add the stay list there). The prototype's fixture is EUR only; the web app formats money as "480 EUR" via the existing `formatMoney` for consistency with the rest of the app.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout

  - **Existing data**: no migration. `Stay.chosen` is a new optional field with default None, stored inside the existing Trip item in the Trip Database (DynamoDB, `DynamoTripStore.save_trip` writes `model_dump(mode="json")`, which already drops None only at top level). Stays saved before this change have no `chosen` key and load as None via `_to_trip`; a test covers this.
  - **Backfill / seed**: none needed.
  - **Settings**: none. Existing stay providers (`get_stay_providers`) are reused.
  - **Provisioning**: nothing new.
  - **Order and rollback**: deploy API before web (the web only calls the new routes after the API exists). Rolling back the API leaves a `chosen` key in stored Trips; Pydantic's default ignores unknown fields on `Stay`, so older code still loads them. Safe to leave in place. Decimal is serialised to a string by `mode="json"` and read back by Pydantic, so no float is stored.

  ### Shape

  ```mermaid
  flowchart TD
    SP[StayShortlistPage.tsx] --> CS[ChosenStayCard.tsx]
    SP --> SC[StayShortlistCard.tsx]
    SP --> API[api.ts chooseStay / clearChosenStay]
    API --> R[routers/stay_options.py choose / clear]
    R --> BS[stays/shortlist.py build_shortlist]
    R --> ST[trips/store.py Stay.chosen]
    TR[routers/trips.py change_stay + _view] --> ST
    TR --> CO[trips/cost.py summarise_cost]
    IT[ItineraryTab.tsx] --> TT[TripTotalCard.tsx]
    classDef touched fill:#f96,color:#000
    class SP,CS,SC,API,R,ST,TR,CO,IT touched
  ```
  Touched: the shortlist page and card (Choose UI), ChosenStayCard (new), api.ts (client), stay_options.py (new routes), store.py (model), trips.py (`change_stay` must not drop the choice), cost.py (total), ItineraryTab (listing). `build_shortlist` and `TripTotalCard` are existing, untouched context.

  ### UI notes from the prototype
  Single column; chosen `.card` with 1px `--color-primary` border above the shortlist `h2`; one `.btn-primary` (Book on provider site); `.btn-secondary` Choose/Change; `.btn-ghost` Clear (not `.btn-danger`: clearing is reversible via the Undo toast, so no modal); `.toast` with Undo; `.empty-state` for none chosen; `aria-live="polite"` on the chosen card; buttons start with a verb. Phone first, wraps via `row-between`/`actions` flex-wrap; no fixed columns.

review_focus: |
  IN scope: choose/change/clear a stay for a Stay's date range, the provider booking link, and the itinerary listing and trip total. OUT: any in-app payment, comparison/ranking changes (STORY-043), provider selection beyond the lowest offer. Riskiest area is server-side: price and URL must come from the rebuilt shortlist (never the client), `change_stay` must not silently drop or keep a stale `chosen`, and `summarise_cost` currency conversion for a foreign-currency stay. Deliberate: Clear uses `.btn-ghost` with an Undo toast rather than a danger modal, and the richer STORY-043 cards are kept instead of the prototype's slim rows.
