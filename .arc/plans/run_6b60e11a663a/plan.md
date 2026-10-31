summary: |
  Extend the printable itinerary document (built in STORY-112, `GET /trips/{id}/itinerary`) with three new
  sections: **Travel essentials** (visa status with official link, insurance, SIM, currency, typical weather for the
  trip dates, and medical guidance only when the destination has it, each with source and date, and
  "Not yet planned" when there is no data), **Before you go** (always exactly six items with a done / not done
  state) and **Important notes** (prices may change, confirm with official sources, data sources and dates used).
  The API assembles these from data it already holds (visa rules, medical guidance, destination climate and currency,
  the trip's chosen insurance and SIM, reminders), so the web page only renders. The web side adds three sections to
  `ItineraryPage.tsx` following the approved prototype (fact cards in `.grid`, badge rows, alerts).
scope:
  - description: |
      API essentials builder. New module `app/trips/essentials.py` with pydantic models and a pure function
      (no I/O, no network):

      ```python
      class EssentialFact(BaseModel):
          key: Literal["visa", "insurance", "sim", "currency", "weather", "medical"]
          label: str
          value: str | None          # None renders as "Not yet planned"
          detail: str | None = None
          link_text: str | None = None
          link_url: str | None = None   # http(s) only, visa official source
          source: str | None = None
          as_of: date | None = None

      class ChecklistItem(BaseModel):
          key: Literal["passport", "visa", "insurance", "sim", "reminders", "bookings"]
          label: str
          hint: str | None = None
          done: bool

      class ImportantNotes(BaseModel):
          price_notice: str
          confirm_notice: str
          sources: list[SourceLine]   # label, source, as_of; only facts that have a value

      def build_essentials(trip: Trip, owner_profile: Profile | None, visa_rules: VisaRuleSource, today: date) -> tuple[list[EssentialFact], list[ChecklistItem], ImportantNotes]
      ```

      Fact rules, reusing existing code rather than re-implementing it:
      - visa: `visa_result_for(country, Person(owner), visa_rules, trip.visa_self_checks)` for the owner row. Value is the
        result `message` when status is `required` / `not_needed`; None when status is None or `no_data`. Link is
        `OFFICIAL_SITES.get(country)` (expose a small public helper `official_site_for(country)` in `visa.py` that returns the seeded
        site only, never the Google search fallback, because AC2 says an official source). Source is the visa rule provider,
        date is `visa_rules.published_on()`.
      - insurance: `trip.insurance` name + provider; source is the plan provider, date is the trip's `updated_at` date (see open question).
      - sim: `trip.sim` name, data_gb and validity; source is the SIM provider, date is the trip's `updated_at` date.
      - currency: `currency_for(trip.destination)`; source and date from a new constant `CURRENCY_AS_OF` in `destination_info.py`.
        No live rate call, so building the itinerary never depends on the rates provider.
      - weather: `typical_weather_for(trip.destination, trip.start_date.month)`; value is the summary, date is `as_of`.
      - medical: present in the list only when `medical.has_data(country)`; built from `medical.guidance_for` for the owner, date from a new
        `MEDICAL_AS_OF` constant in `medical.py`. When no guidance exists the fact is omitted (AC4), unlike the other five which show "Not yet planned".
      Checklist: always the six keys in fixed order. `done` is true when the key is in the new `Trip.checklist_done` list, or derived:
      insurance = `trip.insurance is not None`, sim = `trip.sim is not None`, reminders = `bool(visible_reminders(trip))`.
    files:
      - services/api/app/trips/essentials.py
      - services/api/app/trips/visa.py
      - services/api/app/trips/destination_info.py
      - services/api/app/trips/medical.py
    rationale: |
      The data and its source/date constants already live in these modules (`SEED_PUBLISHED_ON`, `CLIMATE_AS_OF`); the new module only composes them.
      Keeping it pure mirrors `build_itinerary` and keeps it unit-testable without a client.
  - description: |
      Stored checklist state. Add `checklist_done: list[Literal["passport", "visa", "insurance", "sim", "reminders", "bookings"]] = []`
      to `Trip` as a server-owned field (comment like the neighbouring fields). Default `[]` means every trip already stored loads unchanged.
      No write route in this item (see open questions).
    files:
      - services/api/app/trips/store.py
    rationale: |
      AC6 and AC7 need a "marked done" state per item, and passport, visa and bookings have nothing to derive it from today.
  - description: |
      Wire into the itinerary. `Itinerary` gains `essentials: list[EssentialFact]`, `checklist: list[ChecklistItem]`, `notes: ImportantNotes`;
      update its docstring (it currently says "no essentials field"). `build_itinerary(trip, owner_profile, visa_rules, today)` calls `build_essentials`.
      The router takes `profiles: ProfileStore = Depends(get_profiles)`, `visa_rules: VisaRuleSource = Depends(get_visa_rules)`,
      `today: date = Depends(get_today)` and reads the profile of the owner id that `_load` already returns (an editor sees the owner's visa status, not their own).
    files:
      - services/api/app/trips/itinerary.py
      - services/api/app/routers/itinerary.py
    rationale: |
      One endpoint stays the single source for the document, so the print view and the page can never disagree.
      `app/routers/shared.py` uses an allow-list, so the shared read-only link does not gain these fields; confirm that in a test.
  - description: |
      Web types and rendering. Extend `Itinerary` in `api.ts` with `essentials`, `checklist`, `notes`. In `ItineraryPage.tsx` add three `<section>`s
      after Still to schedule, each with an id added to `SECTIONS` ("essentials", "before-you-go", "important-notes") so the section list and
      scroll-to work. Components follow the prototype:
      - Travel essentials: `<div className="grid">` of `.card` fact cards (new classes `.fact`, `.fact-label`, `.fact-value`, `.fact-value.is-empty`,
        `.fact-detail`, `.fact-source`, `.fact-link`). Empty value renders the text "Not yet planned" in `.fact-value.is-empty` and "No source or date yet" in the source line. Visa link has `target="_blank" rel="noopener"` and an sr-only "(opens in a new tab)". Source line reads "Source: X. Checked 14 Oct 2026." with `CalendarIcon`.
        Dates use `Intl.DateTimeFormat(undefined, {day:'numeric', month:'short', year:'numeric'})` via the existing `localDate`.
      - Before you go: `.section-head` with an `<h2>` and a `role="status"` "N of 6 done" count; `<ul className="checklist">` of `.check-row` (+ `.is-done`), label with optional hint, and a `.badge.badge-success` "Done" with `CheckIcon` or `.badge.badge-neutral` "Not done" with a minus icon.
      - Important notes: `.alert.alert-warning` ("Prices and availability may change." + "Check again before you book.") with `AlertIcon`, `.alert.alert-info` ("Confirm with official sources before you travel.") with an info icon, and a `.card` "Data sources and dates used" with a `.sources` list.
      Reuse `OptionCard` / `.card` / `.badge` / `.alert` where they fit; no new shared component is needed because the fact card is only used here.
      The `.checklist` rule already in `index.css` (small muted list) conflicts with the prototype's row style, so the new rows use a distinct class `.check-row` and the existing `.checklist` selectors are left untouched.
      Add an info icon to `apps/web/src/auth/icons.tsx` only if one does not exist (check first; the prototype uses `i-info` and `i-minus`).
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/index.css
      - apps/web/src/auth/icons.tsx
    rationale: |
      Matches the approved prototype section by section. Styling uses only tokens (see notes). Print: the sections inherit the existing A4 print rules; fact cards and check rows get `break-inside: avoid`.
tests:
  - |
    AC1, API (`services/api/tests/unit/test_essentials.py`, write first, fails with ImportError):
    ```python
    facts = {f.key: f for f in build_essentials(_trip_full(), _profile("Canada"), _rules(), TODAY)[0]}
    for key in ("visa", "insurance", "sim", "currency", "weather"):
        assert facts[key].value and facts[key].source and facts[key].as_of is not None
    ```
  - |
    AC2, API:
    ```python
    visa = facts["visa"]   # destination Portugal, citizenship Canada, rule present
    assert visa.link_url == "https://vistos.mne.gov.pt/en"
    assert visa.link_url.startswith("https://")
    ```
    Web (`ItineraryPage.test.tsx`):
    ```tsx
    expect(screen.getByRole('link', { name: /Official visa source/ })).toHaveAttribute('href', 'https://vistos.mne.gov.pt/en')
    ```
  - |
    AC3 and AC4, API (country Portugal with a seeded citizenship vs Peru, which `medical.has_data` is False for):
    ```python
    assert "medical" in {f.key for f in build_essentials(_trip(country="Portugal"), ...)[0]}
    assert "medical" not in {f.key for f in build_essentials(_trip(country="Peru"), ...)[0]}
    ```
    Web: `expect(screen.getByText('Medical guidance')).toBeInTheDocument()` with fact present, `expect(screen.queryByText('Medical guidance')).not.toBeInTheDocument()` without; the shown medical card contains `Source:` and a date.
  - |
    AC5, API and web:
    ```python
    assert [c.key for c in checklist] == ["passport", "visa", "insurance", "sim", "reminders", "bookings"]
    ```
    ```tsx
    expect(within(screen.getByRole('list', { name: 'Before you go' })).getAllByRole('listitem')).toHaveLength(6)
    ```
    Also covers a trip with no data at all (still six items).
  - |
    AC6 and AC7, API: `checklist_done=["visa"]` gives visa done and passport not done; a chosen insurance gives insurance done, none gives not done.
    ```python
    assert by_key["visa"].done is True
    assert by_key["passport"].done is False
    ```
    Web:
    ```tsx
    expect(within(screen.getByTestId('check-visa')).getByText('Done')).toBeInTheDocument()
    expect(within(screen.getByTestId('check-passport')).getByText('Not done')).toBeInTheDocument()
    ```
    and the count `expect(screen.getByRole('status', { name: /done/ }))` reads "1 of 6 done".
  - |
    AC8, API: an empty trip gives `value is None` for visa, insurance, sim, weather; web renders the label.
    ```tsx
    expect(within(screen.getByTestId('fact-insurance')).getByText('Not yet planned')).toBeInTheDocument()
    ```
    Also a visa `no_data` route (citizenship with no rule) yields `value is None` and no link claiming status.
  - |
    AC9 and AC10, web (always shown, independent of trip data):
    ```tsx
    expect(screen.getByText(/Prices and availability may change/)).toBeInTheDocument()
    expect(screen.getByText(/Confirm with official sources before you travel/)).toBeInTheDocument()
    ```
    API: `assert notes.price_notice` and `assert notes.confirm_notice` are non-empty.
  - |
    AC11, API and web: sources list lists exactly the facts that have a value, with their date, and is not padded for missing ones.
    ```python
    assert [s.label for s in notes.sources] == ["Visa status", "Currency", "Typical weather for your dates"]
    ```
    ```tsx
    expect(within(screen.getByRole('heading', { name: 'Data sources and dates used' }).closest('div')!).getByText(/Vodafone Portugal, 9 Oct 2026/)).toBeInTheDocument()
    ```
  - |
    AC12, web: all three headings plus the existing sections render and the section list links to them.
    ```tsx
    for (const name of ['Travel essentials', 'Before you go', 'Important notes']) {
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'Before you go' })).toHaveAttribute('href', '#before-you-go')
    ```
    API router test (`test_itinerary_router.py`): `GET /trips/{id}/itinerary` body has keys `essentials`, `checklist`, `notes`; an accepted editor gets the owner's profile-based visa answer; the shared-link payload does not contain them.
  - |
    Data safety, API: a Trip JSON saved before this change (no `checklist_done`) still validates and `build_itinerary` returns six items all not done:
    ```python
    trip = Trip.model_validate({"id": "t", "name": "Old"})
    assert trip.checklist_done == []
    ```
    Plus the existing `test_itinerary.py` and `ItineraryPage.test.tsx` cases still pass (their call signatures are updated for the new parameters).
  - |
    Narrow run commands (derived from the project command):
    `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_essentials.py tests/unit/test_itinerary.py tests/unit/test_itinerary_router.py)`
    and `(cd apps/web && pnpm run test -- src/trips/ItineraryPage.test.tsx)`.
assumptions_or_open_questions:
  - |
    Freshness question from intake (how fresh visa, weather and medical data must be, and refresh/caching). Answer from the code: all three are seeded in-process data with a fixed as-of date
    (`SEED_PUBLISHED_ON`, `CLIMATE_AS_OF`, new `MEDICAL_AS_OF`), so the itinerary shows that date and nothing is fetched or cached when it is built. Refreshing from real providers
    is out of scope; a later provider adapter that implements `VisaRuleSource.published_on()` would flow through unchanged. Needs a human to confirm no maximum staleness is required for this release.
  - |
    Project-wide question about builds and emails per trip or user and failure monitoring: not answerable from this item. This plan adds no emails and no network calls to the build, so it does not change sizing. Left for the human.
  - |
    How an item gets marked done. The prototype and ACs only show state, and there is no editing control in the design. This plan stores `Trip.checklist_done` and derives insurance, SIM and reminders,
    but adds no route or toggle to set passport, visa or bookings, so those show "Not done" until a later item adds one. Confirm that is acceptable or add a PUT route and a toggle (needs a design).
  - |
    Source and date for insurance and SIM: `InsurancePick` and `ChosenSim` have no pick date, so the plan uses the trip's `updated_at` date, which also moves on unrelated edits. Alternative: add an optional `picked_on` date
    to both models, set in the insurance and SIM routes. Needs a decision.
  - |
    Visa source label and official link: only the ten countries in `OFFICIAL_SITES` have an official link, and the source named is the visa rule provider, not an agency such as AIMA as in the prototype fixture. For a country without a seeded
    official site the visa fact shows no link rather than a search URL. Confirm.
  - |
    Medical guidance is shown for the owner only (the traveller whose profile the trip belongs to), as one summary card, because the prototype shows a single medical card. Per-traveller guidance stays on the existing medical guidance page.
  - |
    The prototype's "Preview" switcher chips, the placeholder "Your itinerary" card, the print button and Back to top are prototype aids or already built by the shell/core document, so none of them is planned here.
  - |
    Prototype CSS uses `--duration-fast: [object Object]` in its inlined tokens (a token build glitch). This plan does not copy that; transitions are not needed for these sections.
  - |
    Dates appear in the traveller's locale format via `Intl.DateTimeFormat`, as the existing page does. The prototype's "Checked 14 Oct 2026" wording is the fixed copy; the exact word "Checked" is kept.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: one additive field, `Trip.checklist_done`, default `[]`. Trips already stored (DynamoDB in deployment, the local JSON file in local mode) have no such attribute and load via the default, so nothing is rewritten. No migration, no NOT NULL or enum change.
  - **Backfill / seed**: none. The essentials come from the existing in-code seeds (`SEED_VISA_RULES`, `_CLIMATE`, `_ROUTES`); `MEDICAL_AS_OF` and `CURRENCY_AS_OF` are constants set to the date the seeds were written (confirm values at implementation).
  - **Settings**: no new setting or env var.
  - **Provisioning**: nothing new.
  - **Order and rollback**: deploy API and web together; an old web build ignores the new response fields, and a new web build against an old API would see `essentials` undefined, so the render code must treat missing arrays as empty to avoid a crash during a rolling deploy. Rolling back leaves a harmless unused `checklist_done` attribute on any trip written meanwhile (nothing writes it in this item).

  ### Design and tokens

  Read the whole prototype `TRAVEL-PLANNER-APP-STORY-114-design.html` (one screen, "Itinerary document", data-ac 1-12, states Full trip / Partly planned / skeleton loading). Tokens come from `design-system/tokens.css`; the app already loads them (`apps/web/src/index.css` uses `var(--space-*)` etc., and the prototype's utility classes `.card`, `.grid`, `.badge-*`, `.alert-*`, `.stack`, `.cluster`, `.skeleton` already exist there, confirmed by grep at lines 68-72, 114, 250-252, 324-361). Implementer: open `design-system/` and `index.css`'s import of the tokens to confirm the exact mapping before writing CSS; I did not open the token file directly, the token names below are taken from the prototype's inlined copy.

  Tokens by element: fact card gap `--space-1`, source line `--font-size-sm` / `--color-fg-muted` / padding-top `--space-2`; fact label `--font-size-sm`, `--font-weight-medium`, `--color-fg-muted`; fact value `--font-weight-bold`, empty `--color-fg-muted` italic; link row `min-height: var(--size-control-md)`; check row `min-height: var(--size-control-lg)`, padding `--space-2` `--space-3`, border `--border-width` `--color-border`, radius `--radius-md`, gap `--space-3`; done label `--color-fg-muted` with line-through; badges `--color-success*` and `--color-surface`; badge min-height `--size-control-sm`; sources list padding-left `--space-4`; alerts `--color-warning(-subtle)` and `--color-info(-subtle)`. Layout is single column on phones and `.grid` on desktop with no fixed column counts, inside the existing `.document` (it caps width at `calc(var(--size-modal-width) * 1.5)`, narrower than the prototype's `--size-content-max`; keep the existing container).

  Loading uses the page's existing skeleton state. The prototype's per-section skeleton is only shown while swapping preview data, so no new loading state is added: the whole document is one request.

  Guideline conformance: no `.btn-primary` added (there are no actions), `.badge` for state, `.alert` for notices that stay on the page, second-person copy ("Check again before you book"), dates in locale format.

  Conflict between prototype and ACs: none found. Small deviation: the prototype's sources list adds a line "Items marked Not yet planned have no source yet." when facts are missing; AC11 only asks for the sources and dates used, so that line is kept as presentation copy only.

  ```mermaid
  flowchart TD
    Page[ItineraryPage.tsx] -->|renders 3 new sections| Types[api.ts Itinerary type]
    Types -->|GET /trips/id/itinerary| Router[routers/itinerary.py]
    Router -->|adds profile, visa rules, today| Build[trips/itinerary.py build_itinerary]
    Build -->|new call| Ess[trips/essentials.py]
    Ess --> Visa[trips/visa.py]
    Ess --> Med[trips/medical.py]
    Ess --> Dest[trips/destination_info.py]
    Ess --> Store[trips/store.py Trip]
    Router --> Deps[routers/deps.py get_profiles get_visa_rules get_today]
    classDef touched fill:#f96,color:#000
    class Page,Types,Router,Build,Ess,Visa,Med,Dest,Store touched
  ```

  `deps.py` is only read (providers already exist), so it is shown unstyled. Touched nodes: Page and Types (render), Router (new dependencies), Build (new fields), Ess (new), Visa/Med/Dest (as-of constants and official-site helper), Store (`checklist_done`).
review_focus: |
  IN: the three new sections of the itinerary document, the API fields that feed them, and the one additive `Trip.checklist_done` field. OUT: any route or toggle to mark an item done, live provider calls or caching, per-traveller medical guidance, and anything in the shared read-only link.
  Riskiest: the essentials builder deciding "no data" per fact (medical omitted vs the others showing "Not yet planned") and the `source`/`as_of` it reports for insurance and SIM, which rely on the trip's `updated_at` as a stand-in; also keeping the web render safe if the new arrays are missing. Deliberate: the visa link is the seeded official site only, never the search fallback, and the existing `.checklist` CSS is left alone in favour of a new `.check-row`.
