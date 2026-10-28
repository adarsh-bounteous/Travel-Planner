summary: |
  Today the seeded visa rules (`SEED_VISA_RULES` in `services/api/app/trips/visa.py`) cover only Japan, so a trip to Portugal, India, Thailand, Mexico, Morocco or Peru (all offered by the destination dropdown via `STARTER_DESTINATIONS`) always shows the "No data" verdict. This plan seeds rules for all seven starter countries, and adds a per-country guidance block (entry requirement, maximum stay, required documents, naming the country) that the Trip Planner API returns on every real answer and the Visa requirements page renders. A route with no seeded rule (for example an unlisted citizenship) keeps the existing No data message. Tests are written first, API then web.
scope:
  - description: |
      Extend `app/trips/visa.py`. Add a `VisaGuidance` model and a per-country table, seed rules for the seven starter countries, and return the guidance on a real answer.

      ```python
      class VisaGuidance(BaseModel):
          country: str
          entry_requirement: str   # differs for visa-free vs visa-required
          max_stay: str            # e.g. "90 days"
          documents: list[str]

      def guidance_for(country: str, required: bool) -> VisaGuidance | None: ...

      class VisaResult(BaseModel):
          ...
          guidance: VisaGuidance | None = None   # only on required / not_needed
      ```

      - `SEED_VISA_RULES` is built from per-country sets: for each of Japan, Portugal, India, Thailand, Mexico, Morocco and Peru, the citizenships in `_JAPAN_VISA_FREE` (the existing nine) get a `VisaRule`, with `required=True` where the country needs a visa for that citizenship. Existing Japan entries are kept unchanged.
      - `visa_result_for` sets `guidance=guidance_for(country, required)` in the real-answer branch only; the no-data and blank-details branches leave it None, so no stale guidance appears beside the No data message.
      - Guidance country keys must come from `list_countries()` in `app/trips/starter_destinations.py`; a test enforces that every offered country has seeded rules and guidance.
    files:
      - services/api/app/trips/visa.py
    rationale: |
      Rules and guidance live beside the existing visa seed, behind the existing `VisaRuleSource` port, so no router or store change is needed: `_visa_view` and `get_visa_rules` in `app/routers` pick the data up unchanged.
  - description: |
      Mirror the new field in the web types: add `VisaGuidance` and `guidance: VisaGuidance | null` to `VisaResult` in `apps/web/src/trips/api.ts` (near line 299).
    files:
      - apps/web/src/trips/api.ts
    rationale: Keeps the typed client in step with the API response.
  - description: |
      In `VisaRequirementsPage.tsx`, render `row.guidance` inside each traveller card when present, after the verdict and before the confirm note: a heading naming `guidance.country`, then "Entry requirement", "Maximum stay" and "Required documents" (a list). Nothing is rendered when `guidance` is null, so No data cards are unchanged. Styling reuses the page's existing utility classes (`stack`, `stack-sm`, `text-sm`, `text-muted`); no new CSS, colour or pixel value is introduced, so no new design tokens are needed.
    files:
      - apps/web/src/trips/VisaRequirementsPage.tsx
    rationale: Shows the guidance to the user in the place they already read the verdict.
  - description: |
      Update existing tests that use Portugal as the no-data case (it now has rules). Switch them to a citizenship with no seeded rule, such as "China", or to `InMemoryVisaRules({}, ...)`. Affected: `test_no_data_carries_the_official_link_and_no_confirm_note` and `test_unresolved_needs_the_mark_and_no_data` in `test_visa_rules.py`, and `test_no_data_has_official_link_no_confirm_note_and_no_advisory` and `test_self_check_marks_and_leaves_the_plan_unresolved` in `test_visa_router.py`. Other tests that pick Portugal, India or the other starter countries as a visa destination (search `test_trips_router.py`, `test_requirements_router.py`, `TripRequirementsPage.test.tsx`, `VisaSummaryCard.test.tsx`) must be checked for the same assumption.
    files:
      - services/api/tests/unit/test_visa_rules.py
      - services/api/tests/unit/test_visa_router.py
    rationale: Seeding changes which routes are no-data, so tests that relied on the old gap would fail for the wrong reason.
tests:
  - |
    AC1 (API, write first, fails today for 6 of 7), in `services/api/tests/unit/test_visa_rules.py`. The seeded source returns a real answer for every offered country and never the No data status.

    ```python
    @pytest.mark.parametrize("country", list_countries())
    def test_every_offered_country_has_visa_guidance(country):
        source = InMemoryVisaRules(SEED_VISA_RULES, SEED_PUBLISHED_ON)
        result = visa_result_for(f"Somewhere, {country}", person("X", "Canada", "Canada"), source, [])
        assert result.status in ("required", "not_needed")
        assert result.status != "no_data"
    ```
  - |
    AC1 and AC2 end to end, in `test_visa_router.py`. A trip to each starter country returns guidance that names it.

    ```python
    @pytest.mark.parametrize("dest,country", [("Tokyo, Japan", "Japan"), ("Lisbon, Portugal", "Portugal"),
        ("Delhi, India", "India"), ("Bangkok, Thailand", "Thailand"), ("Oaxaca, Mexico", "Mexico"),
        ("Fez, Morocco", "Morocco"), ("Cusco, Peru", "Peru")])
    def test_visa_guidance_names_the_selected_country(sign_in_as, dest, country):
        a = sign_in_as("a@example.com")
        tid, _ = _trip(a, [("Ana", _d("Canada", "Canada"))], destination=dest)
        row = by_name(_rows(a, tid), "Ana")
        assert row["status"] != "no_data"
        assert row["guidance"]["country"] == country
        assert country in row["message"]
    ```
  - |
    AC3, in `test_visa_rules.py`. A route with no seeded rule still gets the No data message, and no guidance.

    ```python
    def test_unseeded_route_still_shows_no_data():
        source = InMemoryVisaRules(SEED_VISA_RULES, SEED_PUBLISHED_ON)
        result = visa_result_for("Lisbon, Portugal", person("X", "China", "China"), source, [])
        assert result.status == "no_data"
        assert result.guidance is None
        assert result.official_site_url == OFFICIAL_SITES["Portugal"]
    ```

    Also assert on the empty source, `InMemoryVisaRules({}, ...)`, for every offered country, so the check is not tied to the citizenship list.
  - |
    AC4, in `test_visa_rules.py`, for each offered country and for both a visa-free and a visa-required citizenship (India for the required case).

    ```python
    assert result.guidance.entry_requirement.strip() != ""
    assert "visa" in result.guidance.entry_requirement.lower()
    ```
  - |
    AC5, in `test_visa_rules.py`, for each offered country.

    ```python
    assert result.guidance.max_stay.strip() != ""
    assert any(ch.isdigit() for ch in result.guidance.max_stay)
    ```
  - |
    AC6, in `test_visa_rules.py`, for each offered country.

    ```python
    assert len(result.guidance.documents) >= 1
    assert all(d.strip() for d in result.guidance.documents)
    ```
  - |
    Web, in `apps/web/src/trips/VisaRequirementsPage.test.tsx`, covering AC1, 2, 4, 5 and 6 on the page. Render a row with `status: 'not_needed'` and a `guidance` object for Peru.

    ```tsx
    expect(await screen.findByText(/Peru/)).toBeInTheDocument()
    expect(screen.getByText(/Entry requirement/i)).toBeInTheDocument()
    expect(screen.getByText(/Maximum stay/i)).toBeInTheDocument()
    expect(screen.getByText(/Required documents/i)).toBeInTheDocument()
    expect(screen.queryByText(/We have no visa data/)).not.toBeInTheDocument()
    ```
  - |
    Web, AC3: a `no_data` row with `guidance: null` renders the existing No data message and none of the guidance headings.

    ```tsx
    expect(screen.getByText(/We have no visa data/)).toBeInTheDocument()
    expect(screen.queryByText(/Maximum stay/i)).not.toBeInTheDocument()
    ```
  - |
    Regression: the rewritten no-data tests in the existing API test files pass, and the full command `(cd services/api && sh run-py.sh -m pytest -c pytest.ini) && (cd apps/web && pnpm run test)` is green. Narrow forms while working are `sh run-py.sh -m pytest -c pytest.ini tests/unit/test_visa_rules.py tests/unit/test_visa_router.py` and `pnpm run test src/trips/VisaRequirementsPage.test.tsx`.
assumptions_or_open_questions:
  - |
    The item says "visa guidance" with an entry requirement, a maximum stay and required documents, but the code has no such fields today (`VisaRule` has only `required` and `by_residence`). I assumed guidance is per destination country, with the entry-requirement wording varying only by whether a visa is required. It is not per citizenship.
  - |
    The seeded facts (which citizenships need a visa, maximum stays, document lists) are real-world immigration claims I cannot verify from the repository. A human should check the seed values for the seven countries before release. The existing "Confirm with official sources." note stays on every real answer.
  - |
    AC3 cannot be reached with a whole offered country once all seven are seeded, so I read it as "an offered country with no seeded rule for that traveller's route". The tests check this with an unseeded citizenship and with an empty rule source.
  - |
    The citizenship set per country is assumed to be the existing nine in `_JAPAN_VISA_FREE`. The story does not say which citizenships to seed.
  - |
    The specific places within each country are named already in `starter_destinations.py`. Visa rules are keyed by country only, so places do not affect this change.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — the visa rules are an in-code seed behind `InMemoryVisaRules` (`get_visa_rules` in `services/api/app/routers/deps.py`), not stored data. `VisaResult.guidance` is an optional new response field defaulting to None, so older clients ignore it. There are no migrations, settings or provisioning. Rollback is a plain revert.

  ### Design system

  The only UI step reuses classes already used on `VisaRequirementsPage.tsx` (`stack`, `stack-sm`, `text-sm`, `text-muted`), so it adds no tokens and no literal colour or pixel values. I did not open the design-system token files, because nothing new is styled.

  ### Shape

  ```mermaid
  flowchart TD
    SD[starter_destinations.py list_countries] -->|source of offered countries| T[test coverage over every offered country]
    V[trips/visa.py seed rules and guidance]:::touched -->|VisaRuleSource| D[routers/deps.py get_visa_rules]
    D --> R[routers/trips.py _visa_view]
    R -->|VisaResult.guidance JSON| A[web trips/api.ts types]:::touched
    A --> P[VisaRequirementsPage.tsx renders guidance]:::touched
    classDef touched fill:#f96,color:#000
  ```

  `visa.py` is touched for the seed and the new field. `api.ts` and the page are touched to type and render it. `deps.py` and `routers/trips.py` are untouched and are shown only as the real callers.
review_focus: |
  IN: seed rules and a guidance block (country, entry requirement, maximum stay, documents) for the seven starter countries, returned on real answers only, plus rendering on the Visa requirements page. OUT: provider integration, per-citizenship guidance text, router or store changes. Riskiest area: seeding flips Portugal and the other countries from No data to real answers, so existing tests that used them as the no-data case must be moved to an unseeded route rather than deleted. The seeded immigration facts need human verification, which is deliberate and listed in the open questions.
