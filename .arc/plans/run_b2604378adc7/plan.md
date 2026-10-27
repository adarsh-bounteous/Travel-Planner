summary: |
  Add per-traveller medical guidance for a trip: a new owner-only API route `GET /trips/{trip_id}/medical-guidance` backed by a pure rules module (`app/trips/medical.py`, seeded placeholder data like the existing `requirements.py`) and a new web page `MedicalGuidancePage` that follows the approved prototype (one `.card` per named traveller with Medical tests, a Vaccinations table with status badges, Health advisories, and a "Confirm with official sources" note; `.empty-state` + official-site link for no data; `.alert-success` for nothing required; `.skeleton` loading). Guidance is tailored by each traveller's own citizenship and residence, and by two optional health details (vaccinations already had, pregnancy yes/no) that this story only READS; two optional fields are added to the Profile and Traveller models so the rules have something to read. Collection UI stays in the Traveller profile epic.
scope:
  - description: |
      Pure rules module. Seeded placeholder data keyed by destination country then citizenship, with residence-specific extras, mirroring `requirements.py` (which says real sources are out of scope).
      ```python
      VaccStatus = Literal["required", "recommended", "already_had", "unsuitable_in_pregnancy"]

      class VaccinationGuidance(BaseModel):
          name: str
          status: VaccStatus

      class TravellerGuidance(BaseModel):
          traveller_id: str | None      # None for the owner row
          name: str
          citizenship: str
          residence: str
          result: Literal["guidance", "no_data", "none_required"]
          tests: list[str]
          vaccinations: list[VaccinationGuidance]
          advisories: list[str]
          health_details_given: bool
          official_site_url: str | None  # set when result == "no_data"
          confirm_note: str              # on every result

      def guidance_for(destination: str | None, citizenship: str, residence: str,
                       vaccinations_had: list[str], pregnant: bool | None, *,
                       name: str, traveller_id: str | None) -> TravellerGuidance: ...
      ```
      Rules: no seeded route for (country, citizenship) gives no_data plus the destination's official government site. A seeded route whose tests, vaccinations and applicable advisories are all empty gives none_required. A vaccination in vaccinations_had is already_had, never required. Pregnancy advisories and unsuitable_in_pregnancy appear only when pregnant is True; pregnant False or None adds nothing pregnancy-specific. already_had wins over unsuitable_in_pregnancy. Residence adds extra tests and vaccinations (for example TB screening for an India residence).
    files:
      - services/api/app/trips/medical.py
    rationale: |
      Keeps the AC logic pure and unit-testable apart from FastAPI and the stores, like `requirements.py`. All twelve ACs are decided here, so the router and page stay thin.
  - description: |
      Add the two optional health details the rules read. Both default to empty, so every stored Profile and trip Traveller still validates.
      ```python
      # profile_store.py, Profile
      vaccinations_had: list[Annotated[str, StringConstraints(max_length=60)]] = Field(default_factory=list, max_length=30)
      pregnant: bool | None = None   # None = not provided
      # store.py, Traveller (same two fields)
      ```
      `CompanionDetails` and the PUT routes are NOT extended: collecting these answers belongs to the Traveller profile epic.
    files:
      - services/api/app/trips/profile_store.py
      - services/api/app/trips/store.py
    rationale: |
      The code has only a free-text `health_status`; there is no vaccination or pregnancy field anywhere (verified by grep). AC3 and AC8-10 cannot be met without somewhere to read them from.
  - description: |
      New owner-only route next to `trip_requirements`, using the same `_owned_trip` and people-list pattern (owner row from the Profile, then `trip.travellers`).
      ```python
      @router.get("/{trip_id}/medical-guidance")
      def trip_medical_guidance(trip_id: str, owner=Depends(get_current_user), trips=Depends(get_trips),
                                profiles=Depends(get_profiles), identity=Depends(get_identity)
                                ) -> list[TravellerGuidance]: ...
      ```
      The owner row is named from `profile.display_name`, falling back to "You".
    files:
      - services/api/app/routers/trips.py
    rationale: |
      Reuses existing auth, ownership (same 404 for another user's trip) and local/cloud store wiring; no new store or dependency.
  - description: |
      Web client types and fetcher: `TravellerGuidance`, `VaccinationGuidance`, and `fetchMedicalGuidance(tripId)` beside `fetchRequirements`.
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Matches the existing `call<T>` client pattern.
  - description: |
      `MedicalGuidancePage` at `/trips/:tripId/medical-guidance`, wrapped in `RequireAuth` in `App.tsx`, built from the prototype's "Medical guidance" screen.
      - Breadcrumb `nav.crumbs` (Trips / trip name / Medical guidance), `h1` "Medical guidance for {country}", muted note "Based on each traveller's residence, citizenship and health details."
      - Loading: two `.card.stack` blocks of `.skeleton` lines inside `aria-busy`. Failure: `.alert.alert-danger` with a Retry `.btn-secondary`, like `TripRequirementsPage`.
      - Each traveller is a `section.card.stack` labelled by its `h2` (name) with a `.text-sm.text-muted` line "Lives in {residence}, {citizenship} citizen". Inside: `h3.section-title` Medical tests (`ul.plain-list`), Vaccinations (`table.vax` with a `Status` badge column), Health advisories.
      - Badges always carry an icon and a word, never colour alone: `badge-warning` + alert icon "Required", `badge-success` + check "Already had", `badge-neutral` + info "Recommended", `badge-danger` + alert "Unsuitable in pregnancy".
      - When the traveller gave no health details, a muted line "{Name} hasn't added health details, so you see the general advisories only." (the prototype's two wordings are unified on the traveller's name; the owner row reads "You haven't...").
      - no_data: `.empty-state` (search icon, h2 "No data for this route", the prototype text, `.btn-secondary` link "Official government travel site" with `target="_blank" rel="noopener"`).
      - none_required: `.alert.alert-success` titled "No medical requirements apply to this trip".
      - Every card or result ends with `p.confirm` "Confirm with official sources before you travel." and the page ends with the link "Update health details in your profile" to `/account`.
      Styles for `.crumbs`, `.vax`, `.confirm`, `.plain-list`, `.section-title` are added to `index.css` from the prototype using tokens only (check which already exist first). The prototype's "Preview state" `.chip` scenario switcher is a reviewer aid and is NOT built. Single column, light theme, one primary button per section (none on this page).
    files:
      - apps/web/src/trips/MedicalGuidancePage.tsx
      - apps/web/src/App.tsx
      - apps/web/src/index.css
    rationale: |
      Implements the approved design with the project's `.card`, `.badge`, `.alert`, `.empty-state`, `.skeleton` components.
  - description: |
      Entry point. The prototype opens guidance from a "Travel readiness" card on a Trip overview. That screen does not exist in the repo (trip tabs are Travelers and others), so add a `Link` "Medical guidance" (`.btn.btn-secondary`) next to the existing "View trip requirements" button in `TravelersTab.tsx`.
    files:
      - apps/web/src/trips/TravelersTab.tsx
    rationale: |
      Smallest reachable entry point; the owner-only requirements link already lives there. Flagged below as a design deviation.
tests:
  - |
    AC1 (services/api/tests/unit/test_medical_guidance.py), written first, fails with ImportError until medical.py exists.
    ```python
    g = guidance_for("Lisbon, Portugal", "Canada", "Canada", [], None, name="Maya", traveller_id="a")
    assert g.result == "guidance"
    assert g.tests is not None and g.vaccinations and g.advisories
    ```
  - |
    AC2, citizenship and residence each change the output.
    ```python
    ca = guidance_for("Lisbon, Portugal", "Canada", "Canada", [], None, name="M", traveller_id="a")
    ind = guidance_for("Lisbon, Portugal", "India", "India", [], None, name="T", traveller_id="b")
    assert (ca.tests, ca.vaccinations) != (ind.tests, ind.vaccinations)
    in_res = guidance_for("Lisbon, Portugal", "Canada", "India", [], None, name="M", traveller_id="a")
    assert in_res.tests != ca.tests  # same citizenship, different residence
    ```
  - |
    AC3, a vaccination already had is not required.
    ```python
    g = guidance_for("Lisbon, Portugal", "Canada", "Canada", ["Hepatitis A"], None, name="M", traveller_id="a")
    hep = next(v for v in g.vaccinations if v.name == "Hepatitis A")
    assert hep.status == "already_had" and hep.status != "required"
    ```
  - |
    AC4, no health details still shows the destination's advisories.
    ```python
    g = guidance_for("Lisbon, Portugal", "Canada", "Canada", [], None, name="M", traveller_id="a")
    assert g.advisories and g.health_details_given is False
    ```
  - |
    AC5, API e2e (services/api/tests/e2e/test_medical_guidance_e2e.py, httpx). A trip with two travellers returns one entry per person, each carrying its own name.
    ```python
    rows = client.get(f"/trips/{tid}/medical-guidance").json()
    assert [r["name"] for r in rows] == ["You", "Ana", "Ben"]
    ```
    Also assert another user gets 404 and an unauthenticated call gets 401. Web side (MedicalGuidancePage.test.tsx): `expect(screen.getByRole('heading', { name: 'Maya Chen', level: 2 })).toBeInTheDocument()` and a heading for Tom Reyes.
  - |
    AC6, no data for the route.
    ```python
    g = guidance_for("Tokyo, Japan", "Canada", "Canada", [], None, name="M", traveller_id="a")
    assert g.result == "no_data"
    ```
    Web: `expect(screen.getByText(/No data for this route/)).toBeInTheDocument()`.
  - |
    AC7, official site link on no_data.
    ```python
    assert g.official_site_url and g.official_site_url.startswith("https://")
    ```
    Web: `expect(screen.getByRole('link', { name: 'Official government travel site' })).toHaveAttribute('href', 'https://www.portugal.gov.pt/')`.
  - |
    AC8, pregnant yes adds the pregnancy advisory.
    ```python
    base = guidance_for("Lisbon, Portugal", "Canada", "Canada", [], None, name="M", traveller_id="a")
    preg = guidance_for("Lisbon, Portugal", "Canada", "Canada", [], True, name="M", traveller_id="a")
    assert "Pregnancy advisory" in preg.advisories and "Pregnancy advisory" not in base.advisories
    ```
  - |
    AC9, unsuitable vaccination marked when pregnant.
    ```python
    mmr = next(v for v in preg.vaccinations if v.name == "MMR booster")
    assert mmr.status == "unsuitable_in_pregnancy"
    ```
    Web: `expect(screen.getAllByText('Unsuitable in pregnancy').length).toBeGreaterThan(0)`.
  - |
    AC10, pregnant no adds nothing pregnancy-specific.
    ```python
    no = guidance_for("Lisbon, Portugal", "Canada", "Canada", [], False, name="M", traveller_id="a")
    assert "Pregnancy advisory" not in no.advisories
    assert all(v.status != "unsuitable_in_pregnancy" for v in no.vaccinations)
    ```
  - |
    AC11, the confirm note on every result, for all three result kinds in the API and the page.
    ```python
    for g in (guidance, no_data, none_required):
        assert g.confirm_note == "Confirm with official sources before you travel."
    ```
    Web: `expect(screen.getAllByText('Confirm with official sources before you travel.')).toHaveLength(rows.length)`.
  - |
    AC12, nothing applies (seeded Ireland to Portugal route with empty lists).
    ```python
    g = guidance_for("Lisbon, Portugal", "Ireland", "Ireland", [], None, name="M", traveller_id="a")
    assert g.result == "none_required"
    ```
    Web: `expect(screen.getByText('No medical requirements apply to this trip')).toBeInTheDocument()`.
  - |
    Data compatibility. Add to the unit tests a stored Profile and Traveller dict without `vaccinations_had` or `pregnant` and assert both still validate with `vaccinations_had == []` and `pregnant is None`. Extend the existing profile store contract (rules_profiles.py) with a save and get round-trip of the two new fields so the in-memory, local and Dynamo stores stay aligned.
  - |
    Web states: skeleton while loading (`getByRole('status', { name: 'Loading' })` or aria-busy), the failure alert with Retry, and keyboard focus visible on the official-site link (use the shared focus styles).
assumptions_or_open_questions:
  - |
    The repo has no vaccinations-had or pregnancy fields (only a free-text `health_status`). I assume the Traveller profile epic will add the collection UI later, and that this story adds just the two optional model fields (`vaccinations_had: list[str]`, `pregnant: bool | None`) so it can read them. If that epic defines different field names or shapes, `medical.py` and the two models must follow it. Please confirm.
  - |
    Medical data is seeded placeholder data (Portugal for Canada, India and Ireland citizens), as `requirements.py` already does for visas; no real data provider is integrated. Other destinations or citizenships show the no-data state. Please confirm that seeded data is acceptable, or point me to a source.
  - |
    Design deviation 1. The prototype shows no-data and nothing-required as whole-page states. Because citizenship can differ per traveller, the plan computes these per traveller and renders them inside that traveller's card, under their name (AC5). The whole-page look is identical for a single traveller.
  - |
    Design deviation 2. The prototype opens guidance from a "Travel readiness" card on a Trip overview, which does not exist in this repo, so the entry point is a link in the Travelers tab. The prototype's "Preview state" chips are a reviewer aid and are not built.
  - |
    The route is owner-only, like `/requirements`, because it exposes companion health details; editors and share-link viewers do not see it. The owner's row is read from their Profile.
  - |
    The existing Medical tab on the Trip requirements page (free-text `medical_for`) is left unchanged.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: two new optional fields with defaults (`vaccinations_had` empty, `pregnant` None) on the Profile and on Traveller. Stored Profiles (the DynamoDB `profile` map on the account item, or the local store) and trips written before this change still validate and read as "no health details given". No migration, no new index, no NOT NULL column.
  - **Backfill / seed**: none for stored data. The medical rules data is in code (`medical.py`), so there is nothing to seed or re-run.
  - **Settings**: none. No new env var or config file.
  - **Provisioning**: none. No new table, bucket or permission.
  - **Order and rollback**: deploy API and web together; the new route is purely additive. Rolling back leaves the two optional fields in stored documents, which older code ignores, because the pydantic models would drop unknown keys on read. Please check this at implement time against how the Dynamo trip item is parsed, and add a test if not.

  ### Design source

  Read from the prototype: the Medical guidance screen (cards, `.vax` table, badges, `.confirm` note, `#nodata` empty-state with the official-site link, `#none` success alert, `#loading` skeleton) and the tokens/utilities inlined in it. Layout is a single `.page` column with `--space-4` gaps, and the shell nav uses Trips as the active section. The UI guidelines (verb-first buttons, `.empty-state`, `.skeleton`, light theme, phone-first) are met by this.

  ```mermaid
  flowchart TD
    Web[MedicalGuidancePage.tsx] -->|fetchMedicalGuidance| ApiTs[trips/api.ts]
    Tab[TravelersTab.tsx] -->|link| Web
    App[App.tsx route] --> Web
    ApiTs -->|GET /trips/id/medical-guidance| Router[routers/trips.py]
    Router --> Medical[trips/medical.py]
    Router --> TripStore[trips/store.py Traveller]
    Router --> ProfileStore[trips/profile_store.py Profile]
    Router -.same pattern.-> Req[trips/requirements.py]
    classDef touched fill:#f96,color:#000
    class Web,ApiTs,Tab,App,Router,Medical,TripStore,ProfileStore touched
  ```

  Touched nodes: Router adds the route; Medical is new rules; TripStore and ProfileStore gain the two optional fields; Web, ApiTs, Tab and App are the page, client, entry link and route.
review_focus: |
  IN scope: the rules module, the owner-only guidance route, the two optional model fields, the page and its entry link. OUT: any UI to collect vaccinations or pregnancy (Traveller profile epic) and real medical data sources. The riskiest area is `medical.py`: precedence (already_had beats required and unsuitable_in_pregnancy; pregnancy content only when pregnant is True) and per-traveller no_data/none_required. Deliberate choices that should not be flagged: seeded placeholder data, the owner-only route, the link in the Travelers tab, and no scenario chips.
