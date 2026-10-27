summary: |
  Replace the placeholder visa string in `GET /trips/{id}/requirements` with a structured per-traveller visa result (status required / not_required / no_data, guidance, "confirm with official sources" note, official-site link for no-data, rules-published date), read from a new `VisaRulesSource` port on every request so a provider change shows on the next view. Add an "I'll check myself" mark stored on the Trip, shown as unresolved with a "Plan incomplete" note on the trip page. The web gets a per-traveller card grid on the existing requirements page (matching the approved prototype's "Visa requirements" screen) and a Visa card on the trip page (the prototype's "Trip plan" screen). Medical requirements and provider comparison are untouched.

scope:
  - description: |
      New visa rules port, modelled on `RateSource` in `services/api/app/trips/rates.py`.
      ```python
      class VisaRule(BaseModel):
          needs_visa: bool
          stay_note: str | None = None      # e.g. "stays up to 90 days"
          published_on: date

      class VisaRulesSource(Protocol):
          def rule(self, destination_country: str, citizenship: str, residence: str) -> VisaRule | None: ...
          def official_site(self, destination_country: str) -> str | None: ...
      ```
      `InMemoryVisaRules(table, sites)` is the seeded default; it is mutable so a test can "publish a change". The seed is the data now hard-coded in `_VISA_FREE` (Japan: visa-free citizenships listed there, everything else for Japan needs a visa). A rule is keyed on destination country + citizenship (AC7/8 say no-data depends on citizenship and destination); residence may override it. No result caching anywhere.
    files:
      - services/api/app/trips/visa_rules.py
      - services/api/tests/unit/test_visa_rules.py
    rationale: |
      A port keeps the real provider swappable (same shape as rates/recommendations) and makes AC14 testable without a network.
  - description: |
      Rework `requirements.py`: `visa: str | None` becomes a structured object. `visa_for` is replaced by:
      ```python
      class VisaResult(BaseModel):
          status: Literal["required", "not_required", "no_data"]
          text: str                       # "A visa is required for Japan." / "No visa is needed for Japan." / no-data message
          confirm_note: str | None        # "Confirm with official sources." on required and not_required; None on no_data
          official_url: str | None        # only on no_data
          rules_published_on: date | None # None on no_data
          checking_myself: bool           # the "I'll check myself" mark

      def visa_for(destination: str | None, citizenship: str, residence: str,
                   rules: VisaRulesSource, checking_myself: bool) -> VisaResult | None
      ```
      Still returns None when citizenship or residence is blank (keeps the existing "Details needed" path). There is deliberately NO advisory field anywhere on the result (AC13). `checking_myself` is only true when status is no_data, so a mark left over after the provider publishes data stops counting.
    files:
      - services/api/app/trips/requirements.py
      - services/api/tests/unit/test_requirements_router.py
    rationale: |
      Existing assertions on the old strings (`"No visa needed" in ana["visa"]`, `test_pure_rules`) are rewritten against the new shape; this is a deliberate response-shape change, and the web consumer is updated in the same change.
  - description: |
      Persist the mark on the Trip: `visa_checks: list[str] = []` in `Trip` (store.py), holding traveller ids, with `"owner"` for the owner row. Server-owned like `needed_categories`, changed only by the new route. Removing a traveller (`remove_traveller` in the router) also drops its entry. New route:
      ```python
      class VisaCheck(BaseModel):
          traveller_id: str | None   # None = owner
          checking: bool

      @router.put("/{trip_id}/requirements/visa-check")
      def set_visa_check(trip_id, body: VisaCheck, ...) -> list[TravellerRequirement]
      ```
      Owner only (via `_owned_trip`), 404 for an unknown traveller id (`_traveller`). `trip_requirements` takes `rules: VisaRulesSource = Depends(get_visa_rules)` and passes `checking_myself` per person. Add `get_visa_rules` + `_visa_rules()` to `deps.py` (same shape as `get_rates`; one seeded in-memory instance for both local and cloud until a provider exists, so local and cloud follow the same rules per story 073).
    files:
      - services/api/app/trips/store.py
      - services/api/app/routers/trips.py
      - services/api/app/routers/deps.py
      - services/api/tests/unit/test_requirements_router.py
      - services/api/tests/conftest.py
    rationale: |
      The mark has to survive reloads and be visible on the trip page, so it lives on the Trip. A defaulted list means existing stored trips (Dynamo items and the local data file) load unchanged. conftest gets an override so tests can inject an `InMemoryVisaRules`.
  - description: |
      Web API client: replace `visa: string | null` on `TravellerRequirement` with `visa: VisaResult | null` and add
      ```ts
      export type VisaResult = {
        status: 'required' | 'not_required' | 'no_data'
        text: string
        confirm_note: string | null
        official_url: string | null
        rules_published_on: string | null
        checking_myself: boolean
      }
      export const setVisaCheck = (tripId: string, travellerId: string | null, checking: boolean) =>
        call<TravellerRequirement[]>(`/trips/${encodeURIComponent(tripId)}/requirements/visa-check`, 'PUT', { traveller_id: travellerId, checking })
      ```
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Single typed seam for both screens.
  - description: |
      Visa requirements screen. Rework the Visa tab in `TripRequirementsPage.tsx` (the Medical tab keeps its table) into the prototype's "Visa requirements" screen: breadcrumb "Trip plan / Visa requirements" (`.crumbs`, link back to `/trips/:id`), `h1` "Visa requirements", "Destination: Japan", a `.cluster` with "Rules published by provider on <date>" and a `.btn-ghost.btn-sm` "Refresh rules" that re-fetches (loading state = `.grid` of three `.card` with `.skeleton` lines, then a `.toast` "Rules updated. Results use the latest published rules."). Results are a `.grid` of one `VisaTravellerCard` per traveller (`.card.traveller-card`, single column on phones, no fixed column count):
      - `h3` name; `.text-sm.text-muted` "Citizenship: X · Residence: Y"
      - result `.badge` with icon + words: danger + AlertIcon "Visa required", success + check icon "No visa needed", warning + InfoIcon "No data for this route"; below it the `text` sentence
      - `.confirm` paragraph with InfoIcon "Confirm with official sources." (top border, `--font-size-sm`, muted) on required/not_required cards
      - no_data card only: explanation paragraph, an `<a>` "<Country> official government site" (`official_url`, `target="_blank" rel="noopener noreferrer"`), and a `.btn-secondary` "I'll check myself" with `aria-pressed`; the pressed style (`--color-primary` border, `--color-primary-subtle` fill) goes in the web stylesheet; a `role="status"` note beneath ("Marked as "I'll check myself". It shows as unresolved on your trip plan." / "Not marked yet. ..."); toast on toggle. NO advisory text on this card (AC13).
      Travellers with blank details keep the existing "Details needed" badge + "Enter details" drawer button.
      Tokens only (spacing `--space-2/3/4`, `--radius-lg`), light theme, `.btn-primary` is not used on this screen (one primary per section is on the trip page). Keep `aria-live="polite"` on the results region.
    files:
      - apps/web/src/trips/TripRequirementsPage.tsx
      - apps/web/src/trips/VisaTravellerCard.tsx
      - apps/web/src/trips/TripRequirementsPage.test.tsx
      - apps/web/src/trips/VisaTravellerCard.test.tsx
      - apps/web/src/index.css
    rationale: |
      Mirrors the approved prototype screen "Visa requirements" (data-wf-ids visa-ana-card, visa-ben-card, visa-chen-card, chen-official-link, chen-check-myself). `index.css` is the web app's global stylesheet; the `.confirm`, `.verdict` and pressed-button styles from the prototype go there.
  - description: |
      Trip page "Visa" card, the prototype's "Trip plan" screen. New `VisaSummaryCard` rendered in `TripDetailPage.tsx` for owners next to `TripTotalCard` (line ~207), fed by `fetchRequirements(trip.id)`: `section.card` with `h3` "Visa", one `.row` per traveller (name left, badge right: "Visa required" danger, "No visa needed" success, "Unresolved" warning with InfoIcon when `checking_myself`, "No data for this route" warning otherwise), and, only while any traveller is unresolved, a `.badge-warning` `role="status"` "Plan incomplete: Chen's visa is still unresolved" (names joined like `joinNames` in TripTotalCard). A `.btn-primary` "Visa requirements" `Link` goes to `/trips/:id/requirements`. It shows with no bookings (AC3), because it depends only on the trip's travellers and destination, never on `options`. Skeleton while loading; a failed fetch shows an `.alert-warning` with Retry rather than blocking the page.
    files:
      - apps/web/src/trips/VisaSummaryCard.tsx
      - apps/web/src/trips/VisaSummaryCard.test.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: |
      AC11/12 ask for the unresolved state and the "plan incomplete" note on the trip plan view.

tests:
  - |
    AC1 (API): one traveller with a seeded rule gets a visa result.
    ```python
    def test_single_traveller_sees_whether_a_visa_is_needed(sign_in_as):
        a = sign_in_as("a@example.com")
        tid = _trip_with(a, [("Ana", _d("India", "India"))])
        ana = next(r for r in a.get(f"/trips/{tid}/requirements").json() if r["name"] == "Ana")
        assert ana["visa"]["status"] == "required"
    ```
  - |
    AC2 (API): two travellers with different citizenship or residence each get their own result.
    ```python
    ana, ben = by_name(rows, "Ana"), by_name(rows, "Ben")   # Ana Canada/Canada, Ben India/Canada
    assert (ana["visa"]["status"], ben["visa"]["status"]) == ("not_required", "required")
    ```
    Add a second case where citizenship is equal and only residence differs; assert the result text carries the residence note for the differing one.
  - |
    AC3 (API + web): a trip with `options == []` still returns the visa result, and the trip page shows the Visa card.
    ```python
    assert trip["options"] == []
    assert ana["visa"] is not None
    ```
    ```ts
    expect(await screen.findByRole('heading', { name: 'Visa' })).toBeInTheDocument()
    expect(screen.getByText('Visa required')).toBeInTheDocument()   // trip has no chosen options
    ```
  - |
    AC4: not_required wording (API and web).
    ```python
    assert ben["visa"]["status"] == "not_required" and "No visa is needed" in ben["visa"]["text"]
    ```
    ```ts
    expect(screen.getByText('No visa is needed for Japan.')).toBeInTheDocument()
    ```
  - |
    AC5: required wording (API and web).
    ```python
    assert ana["visa"]["status"] == "required" and "A visa is required" in ana["visa"]["text"]
    ```
    ```ts
    expect(screen.getByText('A visa is required for Japan.')).toBeInTheDocument()
    ```
  - |
    AC6: every required/not_required result carries the note, in the API and rendered once per card.
    ```python
    assert all(r["visa"]["confirm_note"] == "Confirm with official sources." for r in rows if r["visa"]["status"] != "no_data")
    ```
    ```ts
    expect(screen.getAllByText('Confirm with official sources.')).toHaveLength(2)
    ```
    Open point: the note on a no_data card (see assumptions); the prototype omits it there.
  - |
    AC7: no rule for the citizenship and destination gives a no-data result and the web message.
    ```python
    assert chen["visa"]["status"] == "no_data"
    ```
    ```ts
    expect(screen.getByText('No data for this route')).toBeInTheDocument()
    ```
  - |
    AC8: with data there is no no-data message (web).
    ```ts
    expect(screen.queryByText('No data for this route')).not.toBeInTheDocument()   // only Ana and Ben
    ```
  - |
    AC9: the no-data card links to the destination's official site.
    ```python
    assert chen["visa"]["official_url"] == "https://www.mofa.go.jp/j_info/visit/visa/index.html"
    ```
    ```ts
    expect(screen.getByRole('link', { name: 'Japan official government site' })).toHaveAttribute('href', 'https://www.mofa.go.jp/j_info/visit/visa/index.html')
    ```
  - |
    AC10: selecting "I'll check myself" stores the mark (API) and the button reflects it (web).
    ```python
    r = a.put(f"/trips/{tid}/requirements/visa-check", json={"traveller_id": chen_id, "checking": True})
    assert by_name(r.json(), "Chen")["visa"]["checking_myself"] is True
    assert a.get(f"/trips/{tid}").json()["visa_checks"] == [chen_id]   # or via a fresh GET /requirements
    ```
    ```ts
    fireEvent.click(screen.getByRole('button', { name: "I'll check myself" }))
    expect(screen.getByRole('button', { name: "I'll check myself" })).toHaveAttribute('aria-pressed', 'true')
    ```
    Also: owner row (`traveller_id: null`) can be marked; unknown traveller id returns 404; a stranger gets 404 and an editor 403; toggling off removes the mark; removing the traveller drops the entry.
  - |
    AC11: after marking, the trip page shows the visa as unresolved.
    ```ts
    expect(within(screen.getByTestId('visa-chen')).getByText('Unresolved')).toBeInTheDocument()
    ```
  - |
    AC12: marked shows the plan-incomplete note; unmarked does not.
    ```ts
    expect(screen.getByText("Plan incomplete: Chen's visa is still unresolved")).toBeInTheDocument()
    // with no mark:
    expect(screen.queryByText(/Plan incomplete: .* visa/)).not.toBeInTheDocument()
    ```
  - |
    AC13: a no-data result carries no advisory, in the API and on the card.
    ```python
    assert set(chen["visa"]) == {"status", "text", "confirm_note", "official_url", "rules_published_on", "checking_myself"}
    ```
    ```ts
    expect(screen.queryByText(/advisory/i)).not.toBeInTheDocument()
    ```
  - |
    AC14: a provider change shows on the next view without a restart.
    ```python
    rules.publish("Japan", "India", VisaRule(needs_visa=False, published_on=date(2026, 10, 27)))
    assert by_name(a.get(f"/trips/{tid}/requirements").json(), "Ana")["visa"]["status"] == "not_required"
    ```
    Web: clicking "Refresh rules" shows the skeleton, re-calls `GET /trips/t1/requirements`, shows the new "Rules published by provider on 27 Oct 2026" and the toast.
  - |
    Existing data stays readable: a Trip stored without `visa_checks` (old Dynamo item and old local data file) loads with `[]`.
    ```python
    assert Trip.model_validate({"id": "t1", "name": "x"}).visa_checks == []
    ```
    Plus a local-store round trip through `PersistentTripStore` that writes a legacy JSON file without the key, then reads it.

assumptions_or_open_questions:
  - |
    I replaced the string `visa` field with a structured object rather than adding a second field. Only `TripRequirementsPage` and its tests consume it, so the break is contained, but it is a response-shape change worth confirming.
  - |
    "I'll check myself" is stored on the Trip (`visa_checks`), not per user, because the requirements and the trip page are owner-only today. Editors and read-only viewers do not see the Visa card. Say so if travellers other than the owner must see it.
  - |
    The provider is a seeded in-memory source (like rates and recommendations); no real upstream integration exists in the repo. AC14 is met by reading the source on every request with no caching, and the "Refresh rules" button just re-fetches. A real provider adapter is out of scope.
  - |
    Seed data covers only Japan today (the existing `_VISA_FREE` table), so every other destination country gives no_data. The official-site table needs an entry per destination country the app accepts; I plan the same ten countries as `Country` in store.py, using each government's immigration or foreign-affairs URL. Please confirm the URLs, or tell me where they should come from.
  - |
    The prototype shows "Confirm with official sources." only on required/not_required cards; AC6 says "any visa requirement result". I follow the prototype (the no-data message already points at the official site). If you read AC6 as including the no-data card, add the note there too; it is one line.
  - |
    Residence only refines a rule (the existing "Carry your X residence permit" note, kept inside `text`/`stay_note`); no-data depends on citizenship and destination only, as AC7/8 word it.
  - |
    The Visa card on the trip page sits beside the existing cost "Plan incomplete" badge in `TripTotalCard`; they are separate notes for separate causes and are not merged.
  - |
    The prototype does not show a failed-fetch state or the owner-only card for editors; I use the existing `.alert` pattern from `TripRequirementsPage` for failures.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout

  - **Existing data**: `Trip` gains `visa_checks: list[str] = []`. It is optional with a default, so every Dynamo item and local data-file trip already stored loads unchanged (no migration, no backfill). Covered by the legacy-load test above.
  - **Backfill / seed**: none for stored data. The visa rules seed is in code (`SEED_VISA_RULES`, `SEED_OFFICIAL_SITES` in `visa_rules.py`), idempotent by construction.
  - **Settings**: none. The seeded in-memory source needs no env var; a future provider adapter will add its own.
  - **Provisioning**: nothing to create.
  - **Order and rollback**: ship API and web together (the `visa` response shape changed). Rolling back leaves a harmless extra `visa_checks` attribute on stored trips; older code ignores it (`Trip` ignores unknown keys by default) so no down migration is needed. Verify that pydantic setting when implementing.

  ### Design source

  Read `TRAVEL-PLANNER-APP-STORY-050-design.html` fully: two screens, "Trip plan" (AC 1-5, 11, 12) and "Visa requirements" (AC 1, 2, 4-10, 13, 14). Used classes: `.card`, `.row`, `.badge-danger/success/warning`, `.alert`, `.btn-primary/secondary/ghost`, `.grid`, `.stack`, `.crumbs`, `.verdict`, `.confirm`, `.skeleton`, toast. No conflict with an AC was found. The prototype's tokens CSS has two `[object Object]` durations (`--duration-fast/spin`), a prototype artefact; use the project's real tokens, not those lines.

  ```mermaid
  flowchart TD
    TDP[TripDetailPage.tsx] --> VSC[VisaSummaryCard.tsx]
    TDP --> TTC[TripTotalCard.tsx]
    TRP[TripRequirementsPage.tsx] --> VTC[VisaTravellerCard.tsx]
    VSC --> API[trips/api.ts]
    TRP --> API
    API --> R[routers/trips.py requirements + visa-check]
    R --> REQ[trips/requirements.py]
    REQ --> VR[trips/visa_rules.py VisaRulesSource]
    R --> DEPS[routers/deps.py get_visa_rules]
    R --> ST[trips/store.py Trip.visa_checks]
    classDef touched fill:#f96,color:#000
    class TDP,VSC,TRP,VTC,API,R,REQ,VR,DEPS,ST touched
  ```

  Touched nodes (orange): VisaSummaryCard and TripDetailPage render the trip-plan Visa card; TripRequirementsPage and VisaTravellerCard render the per-traveller screen; api.ts types the new shape; the router, requirements.py and visa_rules.py compute the result; deps.py wires the source; store.py holds the mark. TripTotalCard is untouched context.

  TDD order: visa_rules + requirements unit tests, then the router (visa-check) tests, then api.ts types, then the two web components' tests, then the page integration.

review_focus: |
  IN: structured per-traveller visa result, the rules port read on every request, the "I'll check myself" mark on the Trip, the Visa card and "Plan incomplete" note on the trip page, and the per-traveller cards. OUT: provider comparison, medical rules, any real upstream integration, and a destination advisory (AC13 requires none). Riskiest: the `visa` response shape change (the existing router/page tests are rewritten on purpose) and keeping the mark honest, so it counts as unresolved only while the result is still no_data. The 90-day and residence-permit wording from the old placeholder is preserved only where it still fits the new sentences.
