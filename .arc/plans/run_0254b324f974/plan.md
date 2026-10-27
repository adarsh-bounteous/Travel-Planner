summary: |
  Replace the free-text visa line on the existing owner-only trip requirements page with a structured, per-traveller visa result, and build the approved "Visa requirements" and "Trip plan" visa card screens on top of it. The API gets a `VisaRuleSource` port (seeded in-memory adapter, read on every request so a provider change shows immediately), a `GET /trips/{id}/visa` route returning one result per traveller (visa required / no visa needed / no data for this route, with the confirm-with-official-sources note on every real result and the destination's official-site link only in the no-data case), and a route to mark or unmark "I'll check myself". The trip view reports which travellers' visas are unresolved so the web trip page can show the "Plan incomplete" note. Provider comparison is out of scope.
scope:
  - description: |
      New module `app/trips/visa.py` holding the visa domain. It replaces `visa_for` in `requirements.py`.

      ```python
      class VisaRule(BaseModel):
          required: bool
          by_residence: dict[str, bool] = {}   # residence -> required, overrides `required`

      class VisaRuleSource(Protocol):
          def rule(self, destination_country: str, citizenship: str, residence: str) -> VisaRule | None: ...
          def published_on(self) -> date: ...   # when the provider last published rules

      class InMemoryVisaRules:                 # seeded default
          def __init__(self, rules: dict[tuple[str, str], VisaRule], published_on: date) -> None: ...
          def publish(self, rules: dict[tuple[str, str], VisaRule], on: date) -> None: ...  # simulates a provider change (tests, local mode)

      VisaStatus = Literal["required", "not_needed", "no_data"]

      class VisaResult(BaseModel):
          traveller_id: str | None             # None = the owner row
          name: str
          citizenship: str
          residence: str
          status: VisaStatus | None            # None while citizenship or residence is blank
          message: str | None                  # "A visa is required for Japan." / "No visa is needed for Japan." / no-data copy
          confirm_note: str | None             # "Confirm with official sources." on required / not_needed only
          official_site_url: str | None        # ONLY when status == "no_data" (AC 9, 13)
          marked_self_check: bool              # "I'll check myself" is on
          unresolved: bool                     # marked_self_check and status == "no_data"

      def visa_result_for(destination: str | None, who: Person, source: VisaRuleSource, self_checks: list[str]) -> VisaResult: ...
      ```

      `OFFICIAL_SITES: dict[str, str]` maps each destination country to its government visa/immigration page (seeded for the `Country` options in `store.py`). The result carries no destination advisory text in any state (AC 13). Seed `SEED_VISA_RULES` from the old `_VISA_FREE` Japan set (no visa needed) plus India to Japan (required); any other destination is no-data.
    files:
      - services/api/app/trips/visa.py
      - services/api/app/trips/requirements.py
    rationale: |
      Keeps the upstream provider behind a port, as `RateSource` in `app/trips/rates.py` and the flight/stay providers do, so a real adapter replaces the seed later. The result is computed on each request, never cached or stored, so a published rule change is reflected on the next view (AC 14).
  - description: |
      Persist the "I'll check myself" mark on the trip and expose it.

      - `Trip` in `store.py` gains `visa_self_checks: list[str] = []` (server-owned; entries are a traveller id or the literal `"owner"`).
      - `routers/trips.py`: `GET /trips/{trip_id}/visa` (owner only, via `_owned_trip`) returns `VisaView(destination, published_on, travellers: list[VisaResult])`.
      - `PUT /trips/{trip_id}/visa/{traveller_key}/self-check` with body `{"checked": bool}` returns the updated `VisaView`. It answers 404 for an unknown traveller key and 409 `{"code": "visa_has_data"}` when the traveller's result is not no-data, because the mark is only meaningful for the no-data case.
      - `TripView` gains `unresolved_visas: list[str]` (traveller names, owner only, computed from the same `visa_result_for`) so the trip page needs no second call to show "Plan incomplete".
      - Removing a traveller drops their key from `visa_self_checks`.
      - Remove `visa` from `TravellerRequirement` and `trip_requirements` (medical stays).
      - `deps.py` gains `get_visa_rules()` (one `lru_cache`d `InMemoryVisaRules(SEED_VISA_RULES, ...)`, used in local mode too since it makes no outside call).
    files:
      - services/api/app/trips/store.py
      - services/api/app/routers/trips.py
      - services/api/app/routers/deps.py
    rationale: |
      Mirrors how travellers and reminders are server-owned, changed only through their own routes. A new field with a default means existing stored trips load unchanged.
  - description: |
      Web: types and calls in `api.ts` (`VisaResult`, `VisaView`, `fetchVisa(tripId)`, `setVisaSelfCheck(tripId, key, checked)`; add `unresolved_visas?: string[]` to `Trip`; drop `visa` from `TravellerRequirement`). New `VisaRequirementsPage.tsx` at route `/trips/:tripId/visa-requirements` (registered in `App.tsx` inside `RequireAuth`), built from the "Visa requirements" screen of the approved prototype:

      - crumbs `Trip plan / Visa requirements`, `h1` "Visa requirements", "Destination: {country}" and a `text-sm text-muted` cluster "Rules published by provider on {date}" plus a `btn btn-ghost btn-sm` "Refresh rules".
      - results in a `.grid` of `article.card.traveller-card` (one column on a phone, auto-fit columns from `--size-grid-min` on desktop): `h3` name, `text-sm text-muted` "Citizenship: X · Residence: Y", a `.verdict` badge with icon and words (`badge-danger` + AlertIcon "Visa required", `badge-success` + check icon "No visa needed", `badge-warning` + InfoIcon "No data for this route"), the message line, and for required/not-needed a `.confirm` paragraph with the info icon "Confirm with official sources."
      - no-data card: the explanatory sentence, one link `{Country} official government site` (`target="_blank" rel="noopener noreferrer"`), then `btn btn-secondary` "I'll check myself" with `aria-pressed` and a `role="status"` `text-sm text-muted` note (marked: `Marked as "I'll check myself". It shows as unresolved on your trip plan.`; unmarked: `Not marked yet. Check the official site, then mark it so your plan keeps track.`). Toggling calls `setVisaSelfCheck` and shows a Toast ('Visa marked as "I\'ll check myself"' / 'Visa mark removed'). No advisory text is rendered.
      - loading: `.grid` of three `.card`s with `.skeleton` lines (also used while "Refresh rules" refetches), then a Toast "Rules updated. Results use the latest published rules." Failure: `alert alert-danger` "We couldn't load the visa requirements. Try again." with a Retry button, as in `TripRequirementsPage`.
      - a traveller with blank citizenship or residence shows the existing "Details needed" badge and "Enter details" button that opens `CompanionDetailsDrawer` (owner row: a link to Profile), reusing the behaviour of `TripRequirementsPage`.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/VisaRequirementsPage.tsx
      - apps/web/src/App.tsx
    rationale: |
      Implements the prototype's Visa requirements screen with the project's existing utility classes (`.card`, `.grid`, `.badge-*`, `.alert`, `.skeleton`) and tokens only. No new CSS tokens are needed; small page-specific rules (`.verdict`, `.confirm`) go next to the existing page styles.
  - description: |
      Web: new `VisaSummaryCard.tsx` rendered in `TripDetailPage.tsx` for the owner, directly under `TripTotalCard`, built from the prototype's "Trip plan" screen: `section.card` with `h3` "Visa", one `.row` per traveller (name left, status badge right: `badge-danger` "Visa required", `badge-success` "No visa needed", `badge-warning` "Unresolved" when marked, `badge-warning` "No data for this route" when not yet marked), a `badge-warning` `role="status"` "Plan incomplete: {name}'s visa is still unresolved" (several names: "Plan incomplete: visas for A and B are still unresolved") shown only when `trip.unresolved_visas` is non-empty, and a `btn btn-primary` link "Visa requirements" to the new page. It shows whether or not the trip has bookings (AC 3). The card fetches `fetchVisa` itself and shows `.skeleton` rows while loading. Update `TripRequirementsPage.tsx` to drop the Visa tab and its Visa column (medical only), and `TravelersTab.tsx` to add a "Visa requirements" `btn btn-secondary` link beside "View trip requirements".
    files:
      - apps/web/src/trips/VisaSummaryCard.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/TripRequirementsPage.tsx
      - apps/web/src/trips/TravelersTab.tsx
    rationale: |
      The prototype's Trip plan screen shows the visa card, the plan-incomplete note and the entry link together. The real trip page has no Overview content ("Trip overview is shown on its own page"), so the card sits with the trip total, where the existing "Plan incomplete" note already lives.
tests:
  - |
    AC1, API (`services/api/tests/unit/test_visa_router.py`, written first, fails with 404 until the route exists).
    ```python
    def test_one_traveller_sees_whether_a_visa_is_needed(sign_in_as):
        a = sign_in_as("a@example.com")
        a.put("/profile", json={"citizenship": "Ireland", "residence": "Ireland", "health_status": "Allergies"})
        tid = a.post("/trips", json=trip_body(destination="Kyoto, Japan")).json()["id"]
        body = a.get(f"/trips/{tid}/visa").json()
        assert body["travellers"][0]["status"] == "not_needed"
    ```
  - |
    AC2, API: two travellers with different citizenship each get their own result.
    ```python
    ana = by_name(rows, "Ana")   # Canada / Canada
    ben = by_name(rows, "Ben")   # India / Canada
    assert (ana["status"], ben["status"]) == ("not_needed", "required")
    assert ben["citizenship"] == "India" and ben["residence"] == "Canada"
    ```
    Plus a unit test in `test_visa_rules.py` that a `by_residence` override changes the result for the same citizenship, using a source holding `("Japan", "India"): VisaRule(required=True, by_residence={"Ireland": False})`:
    `assert visa_result_for("Tokyo, Japan", person("X", "India", "Ireland"), source, []).status == "not_needed"`.
  - |
    AC3, API and web. API: a new trip has `options == []` and still returns results (`assert a.get(f"/trips/{tid}/visa").json()["travellers"][0]["status"] is not None`). Web (`VisaSummaryCard.test.tsx`): with `options: []` on the trip, `expect(await screen.findByText('Visa required')).toBeInTheDocument()`.
  - |
    AC4 and AC5, API and web. API: `assert ana["message"] == "No visa is needed for Japan."` and `assert ben["message"] == "A visa is required for Japan."`. Web (`VisaRequirementsPage.test.tsx`): `expect(screen.getByText('No visa needed')).toBeInTheDocument()` and `expect(screen.getByText('A visa is required for Japan.')).toBeInTheDocument()`.
  - |
    AC6, API and web: `assert ana["confirm_note"] == "Confirm with official sources."` for required and not-needed, and `expect(screen.getAllByText('Confirm with official sources.')).toHaveLength(2)` for two result cards. The no-data card carries no verdict, so it has no confirm note (as in the prototype); a test asserts `row["confirm_note"] is None` there.
  - |
    AC7 and AC8, API and web. API: destination "Lisbon, Portugal" gives `assert row["status"] == "no_data"`; Kyoto with data gives `assert row["status"] != "no_data"`. Web: `expect(screen.getByText('No data for this route')).toBeInTheDocument()` for the no-data card, and `expect(screen.queryByText('No data for this route')).not.toBeInTheDocument()` when every traveller has data.
  - |
    AC9, API and web: `assert row["official_site_url"] == OFFICIAL_SITES["Portugal"]`, and `expect(screen.getByRole('link', { name: 'Portugal official government site' })).toHaveAttribute('href', OFFICIAL_SITES.Portugal)`. For rows with data, `assert row["official_site_url"] is None`.
  - |
    AC10, API and web. API: `r = a.put(f"/trips/{tid}/visa/{ben_id}/self-check", json={"checked": True})` then `assert by_name(r.json()["travellers"], "Ben")["marked_self_check"] is True` and a re-GET agrees. Marking a traveller whose result has data returns `assert r.status_code == 409`. Web: `fireEvent.click(screen.getByRole('button', { name: "I'll check myself" }))` then `expect(screen.getByRole('button', { name: "I'll check myself" })).toHaveAttribute('aria-pressed', 'true')` and the toast text appears.
  - |
    AC11, API and web. API: after marking, `assert trip_view["unresolved_visas"] == ["Ben"]` from `GET /trips/{tid}`, and `assert row["unresolved"] is True`. Web (`VisaSummaryCard.test.tsx`): `expect(screen.getByText('Unresolved')).toBeInTheDocument()`.
  - |
    AC12, API and web. Web: `expect(screen.getByText("Plan incomplete: Ben's visa is still unresolved")).toBeInTheDocument()`, and `expect(screen.queryByText(/Plan incomplete/)).not.toBeInTheDocument()` when `unresolved_visas` is empty. API: once a rule for the traveller's route is published, `assert trip_view["unresolved_visas"] == []`, because unresolved needs the mark and still no data.
  - |
    AC13, API and web. API: `assert row["status"] == "no_data" and "advisory" not in row`, since `VisaResult` has no advisory field. Web: the no-data card holds only the explanatory sentence, the link and the button: `expect(within(card).queryByText(/advisory|travel warning/i)).not.toBeInTheDocument()`.
  - |
    AC14, API (provider change reflected), using a dependency override of the source:
    ```python
    source = InMemoryVisaRules({("Japan", "India"): VisaRule(required=True)}, date(2026, 10, 20))
    app.dependency_overrides[get_visa_rules] = lambda: source
    assert by_name(a.get(f"/trips/{tid}/visa").json()["travellers"], "Ben")["status"] == "required"
    source.publish({("Japan", "India"): VisaRule(required=False)}, date(2026, 10, 27))
    body = a.get(f"/trips/{tid}/visa").json()
    assert by_name(body["travellers"], "Ben")["status"] == "not_needed"
    assert body["published_on"] == "2026-10-27"
    ```
    Web: "Refresh rules" shows the loading skeleton, refetches, and shows the new published date and the Toast "Rules updated. Results use the latest published rules."
  - |
    Existing tests to update, not delete. `test_requirements_router.py` loses its visa assertions (`test_visa_is_based_on_each_travellers_citizenship_and_residence`, the visa half of `test_pure_rules`, the owner-row visa check) because that coverage moves to `test_visa_router.py` and `test_visa_rules.py`. `TripRequirementsPage.test.tsx` drops the Visa tab case. The medical tests stay as they are.
  - |
    Old stored trips still load. In `test_visa_router.py`, create a trip document without `visa_self_checks` (as a pre-change record) and assert `GET /trips/{tid}` and `GET /trips/{tid}/visa` both succeed and `assert view["unresolved_visas"] == []`.
assumptions_or_open_questions:
  - |
    A real upstream visa provider is not named anywhere in the project docs or ADRs (ADR-0007 to ADR-0010 cover maps, flights/hotels, identity and email). I plan a `VisaRuleSource` port with a seeded in-memory adapter, as the rate, flight and stay sources already do. AC14 is tested by publishing a change to that source; a real adapter is a later change.
  - |
    The prototype and the ACs differ slightly. AC7 and AC8 key the no-data case on citizenship and destination, while AC1 and AC2 also name residence. I key rules on (destination country, citizenship) and let a rule carry per-residence overrides, so residence changes the result but a missing rule is no-data regardless of residence.
  - |
    The prototype's hidden "Every traveller's visa is settled. Your plan is complete." alert is never shown in any state, so I am not building it.
  - |
    Official government site links need a destination-country table. I seed it for the countries the web offers (`Country` in `store.py`). For a destination outside that table the no-data message has no URL to link, which would break AC9. Should those destinations fall back to a generic link, or should the trip's destination be limited to known countries? I have left the link out in that case.
  - |
    I remove the free-text Visa tab from the existing `TripRequirementsPage` rather than keeping two visa wordings side by side ("Tourist visa needed. Apply online..." versus "A visa is required for Japan."). Medical stays on that page. Say so if you want the old tab kept.
  - |
    Visa results and the unresolved list are owner only, because companion citizenship and residence are already the owner's alone (`_view` strips them for editors).
  - |
    I did not open `DynamoTripStore` or `PersistentTripStore`. I am assuming both persist `Trip` through its pydantic model, so the new defaulted field needs no store changes. The implementer should confirm this and add a contract-rule case in `tests/unit/store_contract/rules_trips.py` if a store enumerates fields by hand.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: `Trip` gains `visa_self_checks: list[str] = []`. It is optional with a default, so every trip already in DynamoDB or the local data file loads unchanged and shows no unresolved visas. No migration.
  - **Backfill / seed**: none for stored data. `SEED_VISA_RULES` and `OFFICIAL_SITES` are code constants in `app/trips/visa.py`, so there is nothing to run or re-run.
  - **Settings**: none. No new env var or config file.
  - **Provisioning**: nothing. No table, queue or permission. The API still has no owned database; the mark lives on the trip in the Trip Database.
  - **Order and rollback**: deploy API and web together; an older web build ignores the new `status`/`unresolved_visas` fields, and the new web build needs the new API. Roll back by redeploying the previous build. The extra `visa_self_checks` field on stored trips is ignored by older code, so it can stay in place.

  ```mermaid
  flowchart TD
    VisaPage[VisaRequirementsPage.tsx<br/>new: prototype Visa requirements screen]:::touched
    Summary[VisaSummaryCard.tsx<br/>new: prototype Trip plan visa card]:::touched
    Detail[TripDetailPage.tsx<br/>renders the card under the trip total]:::touched
    ReqPage[TripRequirementsPage.tsx<br/>drop Visa tab]:::touched
    Travelers[TravelersTab.tsx<br/>link to Visa requirements]:::touched
    AppTsx[App.tsx<br/>new route]:::touched
    WebApi[api.ts<br/>types and calls]:::touched
    Router[routers/trips.py<br/>visa routes, unresolved_visas on TripView]:::touched
    Deps[routers/deps.py<br/>get_visa_rules]:::touched
    Visa[trips/visa.py<br/>new: rule port, result, copy]:::touched
    Reqs[trips/requirements.py<br/>remove visa_for]:::touched
    Store[trips/store.py<br/>Trip.visa_self_checks]:::touched
    Rates[trips/rates.py<br/>RateSource: pattern mirrored]

    AppTsx --> VisaPage
    Detail --> Summary
    Detail --> Travelers
    Summary --> WebApi
    VisaPage --> WebApi
    ReqPage --> WebApi
    WebApi --> Router
    Router --> Visa
    Router --> Store
    Router --> Reqs
    Router --> Deps
    Deps --> Visa
    Visa -.same port pattern.-> Rates

    classDef touched fill:#f96,color:#000
  ```

  Mirrors `RateSource`/`InMemoryRates` in `app/trips/rates.py` for the provider port, and the traveller routes in `routers/trips.py` (`_owned_trip`, `_traveller`, `trips.save_trip`) for the owner-only handlers.

  UI conformance: top bar and tabs come from the shell and `TripDetailPage`; the new page is a sub-page of Trips with breadcrumbs. Status is always icon plus words, never colour alone. One `btn-primary` per section (the visa card's link; the page itself has none). Copy is second person and verb-first, and errors say what happened and what to do. All styling uses existing classes and tokens.
review_focus: |
  IN scope: structured per-traveller visa results, the no-data case with official link and the "I'll check myself" mark, the Trip plan visa card with the plan-incomplete note, and the rule-source port. OUT: provider comparison, medical rules, any real upstream adapter, destination advisories. The riskiest part is `unresolved` being derived (mark AND still no data) rather than stored as a flag, together with removing `visa` from the existing `/requirements` response and Visa tab. Both are deliberate, so a rule published later clears the unresolved state and there is a single visa wording.
