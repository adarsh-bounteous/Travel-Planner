summary: |
  Let the trip owner record citizenship, residence and health status for each additional traveller (companion) on a trip, and use those values to show per-traveller visa and medical requirements. Companion details are stored on the Trip item only (never in a saved profile), are never shown to the owner's own row, to editors, or to a person with no account, and carry no tastes, diet or religion. API (FastAPI, `services/api`) gains a companion-details update route, a remove-traveller route and a requirements route; the web app (React + vite, `apps/web`) extends the existing Travelers tab with companion cards, an edit drawer, a remove confirmation modal and a Trip requirements view, all built from the approved prototype. Work is test-first, one failing test per acceptance criterion.
scope:
  - description: |
      API model: extend the traveller with three optional detail fields that default to blank, so Trip items already stored without them load unchanged.

      ```python
      class TravellerFields(BaseModel):
          name: TrimmedName

      class CompanionDetails(BaseModel):
          citizenship: TrimmedName   # same trimmed, non-empty type as name; "" or "   " -> 422
          residence: TrimmedName
          health_status: TrimmedName

      class Traveller(TravellerFields):
          id: str
          citizenship: str = ""
          residence: str = ""
          health_status: str = ""
      ```
    files:
      - services/api/app/trips/store.py
    rationale: |
      Companion details live with the trip only (scope note), so they sit on the Traveller inside the Trip item, not in ProfileStore. Defaults keep DynamoTripStore.save_trip/get_trip working for old items.
  - description: |
      API routes in the trips router, owner only via `_owned_trip` (404 stranger, 403 editor, same as add_traveller):

      ```python
      @router.put("/{trip_id}/travellers/{traveller_id}")
      def update_traveller_details(trip_id: str, traveller_id: str, body: CompanionDetails, ...) -> TripView

      @router.delete("/{trip_id}/travellers/{traveller_id}")
      def remove_traveller(trip_id: str, traveller_id: str, ...) -> TripView
      ```
      Unknown traveller_id raises NOT_FOUND. Blank fields are rejected by pydantic with 422 (existing error shape). `_view` blanks citizenship, residence and health_status on every traveller when `is_owner` is false, so an editor never receives companion details.
    files:
      - services/api/app/routers/trips.py
    rationale: AC7, AC8, AC9, AC10, AC11. Removing the Traveller drops its details with it because they live on that object.
  - description: |
      Requirements: a pure module with a small static rule table, plus an owner-only route.

      ```python
      class TravellerRequirement(BaseModel):
          traveller_id: str | None      # None for the owner row
          name: str
          citizenship: str
          residence: str
          health_status: str
          visa: str | None              # None when citizenship or residence is blank
          medical: str | None           # None when health status is blank

      def visa_for(destination: str | None, citizenship: str, residence: str) -> str | None
      def medical_for(health_status: str) -> str | None

      @router.get("/{trip_id}/requirements")
      def trip_requirements(trip_id, ...) -> list[TravellerRequirement]
      ```
      The owner row takes citizenship, residence and health status from `ProfileStore.get_profile(owner)` (read only). Companion rows come from the trip's travellers. The rule table is seeded from the prototype FIXTURE (visa-free list, medical text per health status, "Carry your X residence permit" when residence differs from citizenship).
    files:
      - services/api/app/trips/requirements.py
      - services/api/app/routers/trips.py
    rationale: AC2, AC3. Keeping rules pure makes "based on that traveller's citizenship/residence/health" directly unit-testable.
  - description: |
      Web API client and types: extend `Traveller` and add calls.

      ```ts
      export type Traveller = { id: string; name: string; citizenship?: string; residence?: string; health_status?: string }
      export type CompanionDetailsInput = { citizenship: string; residence: string; health_status: string }
      export type TravellerRequirement = { traveller_id: string | null; name: string; citizenship: string; residence: string; health_status: string; visa: string | null; medical: string | null }
      export const saveTravellerDetails = (tripId: string, travellerId: string, input: CompanionDetailsInput) => call<Trip>(`/trips/${encodeURIComponent(tripId)}/travellers/${encodeURIComponent(travellerId)}`, 'PUT', input)
      export const removeTraveller = (tripId: string, travellerId: string) => call<Trip>(`/trips/${encodeURIComponent(tripId)}/travellers/${encodeURIComponent(travellerId)}`, 'DELETE')
      export const fetchRequirements = (tripId: string) => call<TravellerRequirement[]>(`/trips/${encodeURIComponent(tripId)}/requirements`)
      ```
    files:
      - apps/web/src/trips/api.ts
    rationale: Same `call` wrapper as the other trip calls; 422 already maps to ValidationError.
  - description: |
      Travelers tab (design screen "Trip travellers"): owner row is a `.card.traveller` with the name only (AC4). Each companion is a `.card.traveller` with an `h2` name, a ghost small `Remove` button (aria-label "Remove NAME"), three `<p>` lines "Citizenship:", "Residence:", "Health status:" showing the value or `Not yet entered` in warning colour (`.missing`), and a secondary `Edit details` button (aria-label "Edit details for NAME"). Intro copy: "Visa and medical needs are worked out for each person. Details for companions stay with this trip only." A single `.btn-primary` "View trip requirements" links to the requirements view. When no companions exist, show "Only you are travelling, so there are no companion details to add." The existing add-by-name form and AccessSection stay as they are.

      New `CompanionDetailsDrawer` (via the existing `Overlay kind="drawer"`): title is the companion name; hint "We use these to check visa and medical needs for this trip. They aren't saved to any profile."; three `.field` + `.select` (Citizenship, Residence, Health status) each with a `.field-hint` (design copy); Cancel (`btn-ghost`) and Save (`btn-primary`, "Saving…" while pending). Validation after submit only: blank select gets `.is-invalid`, `aria-invalid`, and a `.field-error role="alert"` ("Enter citizenship", "Enter residence", "Enter health status"), focus moves to the first invalid select, and nothing is sent. On success close and toast "NAME details saved."

      New `RemoveTravellerModal` (modeled on `RemoveActivityModal`): "Remove NAME from this trip?" / "Their details will be removed from this trip." Cancel and Remove; on success toast "NAME removed from this trip."
    files:
      - apps/web/src/trips/TravelersTab.tsx
      - apps/web/src/trips/CompanionDetailsDrawer.tsx
      - apps/web/src/trips/RemoveTravellerModal.tsx
      - apps/web/src/trips/companionDetails.ts
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/index.css
    rationale: |
      AC1, AC4, AC5, AC7-AC10. `companionDetails.ts` holds `companionErrors(values)` and the option lists, importing COUNTRIES and the health options from `profileQuestions.ts` so there is one list. Editors see the existing read-only list without companion fields (the API already blanks them). TripDetailPage only needs to route to the requirements view and pass the toast callback it already provides.
  - description: |
      Trip requirements view (design screen "Trip requirements"): h1 "Trip requirements", "For DESTINATION, DATES." line, "Back to travellers" link, `.tabs` Visa / Medical, and a table with columns Traveller, Citizenship, Residence, Health status, Visa requirement or Medical requirement. Below 48rem each row becomes a bordered card with `data-label` prefixes (the `.req` CSS in the prototype). A companion with missing values shows a `.badge-warning` "Details needed" plus an "Enter details" ghost button that opens the drawer. Loading shows `.skeleton` rows. Data is re-fetched on open so an edit is shown at once (AC10).
    files:
      - apps/web/src/trips/TripRequirementsPage.tsx
      - apps/web/src/App.tsx
      - apps/web/src/index.css
    rationale: AC2, AC3. New route `/trips/:tripId/requirements`, wrapped like the other trip routes.
  - description: |
      Regression-only for AC6: no production change expected. Assert that New trip set-up (NewTripSetupPage + ProfileStep) never shows or prefills companion citizenship, residence or health status, and that saving companion details leaves ProfileStore untouched.
    files:
      - apps/web/src/trips/NewTripSetupPage.test.tsx
      - services/api/tests/unit/test_travellers_router.py
    rationale: Locks in "companion details live with the trip only".
tests:
  - |
    AC1 (web, vitest, TravelersTab.test.tsx): owner with two travellers opens "Edit details for Ana".
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Edit details for Ana' }))
    const drawer = await screen.findByRole('dialog', { name: 'Ana' })
    expect(within(drawer).getByLabelText('Citizenship')).toBeInTheDocument()
    expect(within(drawer).getByLabelText('Residence')).toBeInTheDocument()
    expect(within(drawer).getByLabelText('Health status')).toBeInTheDocument()
    ```
  - |
    AC2 (api, pytest, new test_requirements_router.py): companion with Canada/Canada and one with India/Canada on a Japan trip.
    ```python
    rows = a.get(f"/trips/{tid}/requirements").json()
    ana = next(r for r in rows if r["name"] == "Ana")
    assert "No visa needed" in ana["visa"]
    ben = next(r for r in rows if r["name"] == "Ben")
    assert "Tourist visa needed" in ben["visa"]
    ```
    Plus pure unit test `assert visa_for("Kyoto, Japan", "", "Canada") is None`, and a web test that the Visa tab renders each row's visa text.
  - |
    AC3 (api + web): health status drives the medical text.
    ```python
    assert ana["medical"] == medical_for("Allergies")
    assert medical_for("") is None
    ```
    Web: click the Medical tab, `expect(screen.getByText(/allergy card/)).toBeInTheDocument()`.
  - |
    AC4 (web): trip with `travellers: []` shows the owner card with no companion fields.
    ```ts
    expect(screen.queryByText('Citizenship:')).toBeNull()
    expect(screen.queryByRole('button', { name: /Edit details for/ })).toBeNull()
    expect(screen.getByText(/Only you are travelling/)).toBeInTheDocument()
    ```
  - |
    AC5 (web): drawer and companion card have no tastes, diet or religion.
    ```ts
    for (const label of ['Tastes', 'Diet', 'Religion']) expect(screen.queryByLabelText(label)).toBeNull()
    ```
    API: `assert set(r.json()["travellers"][0]) == {"id","name","citizenship","residence","health_status"}`.
  - |
    AC6 (web + api): after saving companion details on trip 1, `NewTripSetupPage` rendered for a later trip contains no 'Citizenship: Canada' text and no prefilled companion values, and
    ```python
    assert profiles.get_profile(owner_id) == before   # PUT travellers/{id} never writes the profile
    ```
  - |
    AC7 (api): all three given saves.
    ```python
    r = a.put(f"/trips/{tid}/travellers/{ana_id}", json={"citizenship": "Canada", "residence": "Canada", "health_status": "Allergies"})
    assert r.status_code == 200
    assert r.json()["travellers"][0]["citizenship"] == "Canada"
    ```
    Web: Save sends one PUT and shows the toast "Ana details saved."
  - |
    AC8 (api + web): each blank field is refused and stored values are unchanged.
    ```python
    for blank in ("citizenship", "residence", "health_status"):
        body = {"citizenship": "Canada", "residence": "Canada", "health_status": "Allergies", blank: "  "}
        assert a.put(f"/trips/{tid}/travellers/{ana_id}", json=body).status_code == 422
    ```
    Web: with residence blank, Save shows `Enter residence` (role alert) next to the Residence select, the select has `aria-invalid="true"`, and no PUT was made.
  - |
    AC9 (api + web): removing drops the traveller and details.
    ```python
    assert a.delete(f"/trips/{tid}/travellers/{ana_id}").status_code == 200
    assert all(t["id"] != ana_id for t in a.get(f"/trips/{tid}").json()["travellers"])
    assert a.delete(f"/trips/{tid}/travellers/{ana_id}").status_code == 404
    ```
    Web: Remove, confirm in modal, `expect(screen.queryByText('Ana')).toBeNull()`; Cancel sends nothing.
  - |
    AC10 (api + web): change one value, the new value is returned and displayed.
    ```python
    a.put(url, json={**ok, "residence": "Portugal"})
    assert a.get(f"/trips/{tid}").json()["travellers"][0]["residence"] == "Portugal"
    ```
    Web: after saving, the card shows "Residence: Portugal", and the requirements row for that traveller uses the new value.
  - |
    AC11 (api): an editor (`is_owner` false) and an unauthenticated client get no companion details.
    ```python
    view = editor.get(f"/trips/{tid}").json()
    assert all(t["citizenship"] == "" and t["health_status"] == "" for t in view["travellers"])
    assert editor.put(url, json=ok).status_code == 403
    assert anonymous.get(f"/trips/{tid}/requirements").status_code == 401
    ```
    Also assert the read-only share link payload (`SharedTrip`) has no `travellers` key. Web: an editor's Travelers tab shows no "Citizenship:" text.
  - |
    Existing-data check: a Trip stored with `travellers: [{"id": "a", "name": "Ana"}]` (no detail keys) still loads through `get_trip`, `PUT travellers/a` works, and the existing 'lists exactly the travellers' web test is updated to the new card markup.
assumptions_or_open_questions:
  - |
    Visa and medical rules: nothing in the repo gives real rules, and the prototype's are fixture text for Japan. I assume a small static table in `requirements.py` seeded from the prototype and keyed on the trip's destination country; real rule data or a provider is out of scope. Please confirm this is acceptable, and what the visa text should be for a destination not in the table (I would show "We don't have visa advice for this destination yet.").
  - |
    Conflict with the prototype: its health options are "None reported / Allergies / Mobility needs / Chronic condition" and its country list includes India. The existing profile uses "No health needs to share" and has no India. I plan to reuse the profile's lists (one source of truth, and the owner row comes from the profile), and let `medical_for` treat "No health needs to share" like "None reported". Say if you want the prototype's labels instead.
  - |
    Conflict with the UI guidelines: the prototype's Remove modal confirm button is `btn-primary`, while the guidelines reserve `btn-danger` for irreversible actions behind a modal. Removing a companion is recoverable by re-adding, so I follow the prototype.
  - |
    The prototype shows a standalone "Trip travellers" page, but the guidelines put travellers in the trip's Travelers tab, which already exists. I build the cards inside that tab and add the requirements as its own route. The prototype's "Prototype only" panel and the "later New trip set-up" screen are not product UI; that screen is covered by the AC6 regression test only.
  - |
    Blank-field rule: all three fields are required whenever the owner saves, but a companion added by name starts with all three empty (shown as Not yet entered) until the owner opens Edit details. The requirements view flags such a person as "Details needed" rather than guessing.
  - |
    The owner's own citizenship, residence and health status come from their saved profile in the requirements table. If the profile is empty the owner row shows "Not yet entered" with no visa or medical text.
  - |
    Companions' diet and religion capture is stated as undecided in the story, so none is built and no field is shown (AC5).
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: no migration. `Traveller` gains three string fields with default `""`. DynamoDB Trip items are written whole by `save_trip` (None values dropped), so old items without the keys load as blank and stay readable. Nothing narrows an existing type.
  - **Backfill / seed**: none needed.
  - **Settings**: none.
  - **Provisioning**: none; no new table or index (details sit in the existing Trip item, which already carries a 400 KB budget with `MAX_TRAVELLERS = 50`; three short strings per traveller do not change that).
  - **Order and rollback**: deploy API first, then web (the web only calls the new routes). Roll back by redeploying the previous builds; details already saved remain as extra keys on the Trip item and are ignored by the old code.

  ### Approach and design source

  Read from the prototype: `.card.traveller` cards (owner name only), right `.drawer` with three `.field`/`.select` and `.field-error` + `.is-invalid`, `.modal` confirm, `.tabs` Visa/Medical, `.req` table that becomes cards below 47.99rem, `.badge-warning` "Details needed", `.toast`, one `.btn-primary` per section. Tokens come from the existing `index.css`, which already mirrors tokens.css; the `.req` and `.traveller` styles are added there.

  Privacy: GDPR (ADR-0011) applies, since companion health status is sensitive data. It is therefore never logged, never returned to editors, never in the share-link payload (`SharedTrip` is an include-list), and deleted with the traveller or the trip.

  ```mermaid
  flowchart TD
    TD[TripDetailPage.tsx] --> TT[TravelersTab.tsx]
    TT --> CD[CompanionDetailsDrawer.tsx]
    TT --> RM[RemoveTravellerModal.tsx]
    TD --> RP[TripRequirementsPage.tsx]
    TT --> API[trips/api.ts]
    RP --> API
    API --> R[routers/trips.py]
    R --> S[trips/store.py]
    R --> Q[trips/requirements.py]
    Q --> P[trips/profile_store.py]
    R --> SH[routers/shared.py]
    classDef touched fill:#f96,color:#000
    class TT,CD,RM,RP,API,R,S,Q,TD touched
  ```
  Touched: store.py (traveller fields), trips.py (new routes and owner-only view), requirements.py (rules), api.ts, the Travelers tab and its new drawer and modal, the new requirements page and the route in App.tsx. `profile_store.py` is read only and `shared.py` is untouched, but its test is added.
review_focus: |
  IN: companion details on the Trip item, the update, remove and requirements routes, the Travelers tab drawer and modal, and the requirements view. OUT: any saved-profile change, companion diet, religion or tastes, real visa or medical data sources. Riskiest area: visibility, meaning editors and the share-link payload must never receive companion details (`_view` blanking and the `SharedTrip` include-list). The static visa and medical rule table and the profile-versus-prototype option lists are deliberate placeholders listed in the open questions.
