summary: |
  Give each traveller who needs a visa a shortlist of up to 3 visa application providers, reached from the visa requirements page via a "Visa provider options" action. The API gathers provider services from a web-search source and a partner-API source (behind one `VisaProvider` port, seeded like the SIM and insurance providers), keeps only those that handle the traveller's visa type and nationality for the destination country, ranks them by service fee (then shorter processing time) and returns the lowest three, each with fee, processing time, offers and a booking link. A new Visa providers page renders the design's shortlist, no-data, no-visa-needed and loading states, one traveller tab at a time; "Pick and book" opens the provider's own booking link in a new tab (nothing is booked or paid in the app, so no pick is stored). To make the "I'll check myself" ACs (12, 13) reachable, the existing self-check is extended from no-data travellers to travellers whose visa is required.
scope:
  - description: |
      Visa provider domain module (new). Port, model, filtering, ranking and the four-way outcome.

      ```python
      SourceKind = Literal["web_search", "partner"]

      class ProviderVisaService(BaseModel):
          id: str
          name: str
          destination_country: str
          visa_types: list[str]        # e.g. ["tourist"]
          nationalities: list[str]     # citizenships handled; ["*"] = any
          fee: Decimal                 # whole currency units
          currency: str
          processing_days: int         # working days
          offers: str | None = None
          url: str                     # the provider's booking link

      class VisaProvider(Protocol):
          name: str
          source: SourceKind
          def fetch(self, destination_country: str) -> list[ProviderVisaService]: ...

      class VisaProviderOption(BaseModel):
          id: str; name: str; source: SourceKind
          fee: Decimal; currency: str; processing_days: int
          offers: str | None; url: str

      ProviderOutcome = Literal["shortlist", "no_visa_needed", "no_data", "details_needed"]

      class VisaProviderView(BaseModel):
          outcome: ProviderOutcome
          traveller_id: str | None
          name: str
          destination: ChosenDestination | None
          visa_type: str | None
          citizenship: str
          matching_count: int
          providers: list[VisaProviderOption]   # at most SHORTLIST_SIZE
          message: str | None                   # the "no data for this route" text
          official_site_url: str | None         # set whenever outcome == "no_data"

      SHORTLIST_SIZE = 3

      def gather_visa_providers(
          providers: list[VisaProvider], trip: Trip, who: Person,
          result: VisaResult, rates: RateSource,
      ) -> VisaProviderView: ...
      ```

      Rules: result.status None gives "details_needed"; "not_needed" gives "no_visa_needed" with no providers (AC7); "no_data" gives "no_data" with the message and official_site_url (AC8, AC9); "required" fetches from every provider (a provider that raises is logged and skipped, like gather_sims), keeps services where destination_country matches, `result.visa_type in visa_types` and (citizenship in nationalities or "*" in nationalities) (AC2), sorts by (fee converted to trip.currency via rates, unconvertible last; processing_days; id) (AC15), counts all matches into matching_count, and returns the first SHORTLIST_SIZE (AC14). Zero matches gives "no_data" with the same message and the same official_site_url (AC10, AC11). The result does not depend on `marked_self_check` (AC13).
    files:
      - services/api/app/visa_providers/__init__.py
      - services/api/app/visa_providers/options.py
    rationale: |
      Mirrors app/sims/options.py and app/insurance/options.py (Protocol port with `name` and `source`, `fetch`, gather function, per-provider try/except, rates-based sort with unconvertible last). Keeping it a pure function over injected providers makes every filter and ranking rule unit-testable with no router or DynamoDB.

  - description: |
      Seeded provider adapters (new), the same shape as app/insurance/providers.py: an `InMemoryVisaProvider(name, source, catalogue)` plus `SEED_CATALOGUES` with at least one `web_search` and one `partner` provider, enough Japan and Portugal services (India citizenship, "tourist") to give more than 3 matches with a fee tie and mixed currencies, and a Mexico/Peru service that handles only another nationality so the filter is exercised. Booking links are https URLs (example.com placeholders, as the insurance seed does).
    files:
      - services/api/app/visa_providers/providers.py
    rationale: |
      AC3 and AC4 need both source kinds present. The project has no real web-search or partner adapters for any domain yet (insurance and SIM say "Seeded default until web-search and partner adapters exist"), so this follows that precedent; see open questions.

  - description: |
      Visa type and self-check on the existing visa module.

      - `VisaRule` gains `visa_type: str = "tourist"`; `VisaResult` gains `visa_type: str | None` (set from the rule, None while there is no rule or details are missing). The trip has no purpose field, so every rule is "tourist" for now.
      - In `visa_result_for`, the `required` branch returns `marked_self_check=marked, unresolved=marked` (today it hard-codes False/False). The `not_needed` branch keeps False/False.
      - `SEED_VISA_RULES` needs no change (default type applies).
    files:
      - services/api/app/trips/visa.py
    rationale: |
      AC12/AC13 need a traveller who needs a visa to be able to be marked "I'll check myself"; the design's "I'll check myself" preview state shows exactly that (required text, unresolved badge, shortlist still reachable).

  - description: |
      Routes. In app/routers/trips.py, relax `set_visa_self_check` so only `not_needed` is refused: `if visa_result_for(...).status not in ("no_data", "required"): raise VISA_HAS_DATA` (the existing 409 stays for not_needed; a blank-details traveller, status None, is still refused). Add a new router file `app/routers/visa_providers.py` (included in app/main.py next to the insurance router) with:

      ```python
      @router.get("/trips/{trip_id}/visa/{traveller_key}/providers")
      def visa_provider_options(trip_id: str, traveller_key: str, owner=Depends(get_current_user), trips=..., profiles=..., identity=..., visa_rules=Depends(get_visa_rules), providers: list[VisaProvider] = Depends(get_visa_providers), rates=Depends(get_rates)) -> VisaProviderView
      ```

      Owner only like GET /trips/{id}/visa (`_owned_trip`); unknown traveller_key gives 404 `NOT_FOUND` (same person lookup as set_visa_self_check, using `_people` and `self_check_key`). The needed private helpers (`_people`, `_visa_results`, `_chosen_country`, `_owned_trip`) are imported from app.routers.trips as app/routers/insurance.py does. Add `get_visa_providers()` to app/routers/deps.py, cached and seeded in local mode too (no outside call), like `get_insurance_providers`.
    files:
      - services/api/app/routers/trips.py
      - services/api/app/routers/visa_providers.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      Reuses the existing owner-only visa route conventions and dependency-injection seam, so tests override `get_visa_providers` and `get_visa_rules` exactly as test_visa_router.py already overrides `get_visa_rules`.

  - description: |
      Web API client: types and fetcher in apps/web/src/trips/api.ts.

      ```ts
      export type VisaProviderOption = {
        id: string; name: string; source: 'web_search' | 'partner'
        fee: string; currency: string; processing_days: number
        offers: string | null; url: string
      }
      export type VisaProviderView = {
        outcome: 'shortlist' | 'no_visa_needed' | 'no_data' | 'details_needed'
        traveller_id: string | null; name: string
        destination: DestinationRef | null; visa_type: string | null; citizenship: string
        matching_count: number; providers: VisaProviderOption[]
        message: string | null; official_site_url: string | null
      }
      export const fetchVisaProviders = (tripId: string, key: string) =>
        call<VisaProviderView>(`/trips/${encodeURIComponent(tripId)}/visa/${encodeURIComponent(key)}/providers`)
      ```
    files:
      - apps/web/src/trips/api.ts
    rationale: |
      Same `call` wrapper and encode-everything convention as fetchVisa and setVisaSelfCheck.

  - description: |
      New page `VisaProvidersPage` at route `/trips/:tripId/visa-providers` with the traveller chosen by `?traveller=<key>` (default the first traveller). Built to the approved design's screens "Visa provider shortlist", "Visa providers - no data for this route" and "Visa providers - no visa needed".

      - Breadcrumb `.crumbs`: Trip / Visa requirements (link back) / Visa providers (aria-current); `h1` "Visa providers".
      - Traveller `.tabs` with `role="tablist"` aria-label "Traveller" (one `.tab` button per traveller, aria-selected; same keyboard pattern as ShortlistsPage); selecting one updates `?traveller` and refetches.
      - Shortlist: context line in `.text-muted` ("Japan tourist visa for Indian citizens. Lowest fee first, equal fees by shorter processing time. Showing 3 of 5 matching providers."), then a `.grid.provider-cards` (1 column on phones, 3 columns from 48rem) of provider cards, then the `.confirm` "Confirm with official sources." note (CONFIRM_NOTE text from the API's requirements result is reused as a constant string).
      - Provider card: reuse `OptionCard` (title = provider name, `badges` = source badge, children = a `dl.provider-facts` with "Service fee", "Processing" and "Offers" rows, actions = the pick button). Source badge: web_search is `.badge.badge-neutral` with the search icon and "Web search"; partner is `.badge.badge-success` with the check icon and "Partner API" (icon plus word, per the design). Fee uses `formatMoney` from trips/money.ts (currency code always shown); processing reads "5 working days"; no offer reads "None".
      - Pick: "Pick and book" rendered with the existing `BookingLink` (anchor, target _blank, rel noopener noreferrer) after `safeHref(url)`; a url that fails `safeHref` shows the "No booking link is available" line SimOptionCard uses and no button. The design's first card is `.btn-primary`, the others `.btn-secondary` (one primary per section).
      - Loading: three `.card` skeleton cards with `aria-busy="true"` (design's #loading block).
      - no_data (also zero matching providers): `.empty-state role="status"` with search icon, h2 "No data for this route", the API `message`, and a `.btn.btn-secondary` link "{country} official government site" to `official_site_url` (target _blank, rel noopener noreferrer), plus an "I'll check myself" `.btn-secondary` that calls `setVisaSelfCheck` and shows the existing Toast. Because the 409 rule only allows marking when status is no_data or required, this button is shown for both no_data cases.
      - no_visa_needed: `.alert.alert-success role="status"` "No visa is needed for {name} for this trip." and a "Back to visa requirements" link; no cards.
      - details_needed: a short `.alert` with a link back to the requirements page (not in the design; minimal handling so the page never shows an empty shortlist).
      - Failed fetch: `.alert.alert-danger role="alert"` with Retry (same wording pattern as VisaRequirementsPage).
      - Styling tokens only: gaps `--space-2/--space-3/--space-4`, `--color-border`, `--color-fg-muted`, `--font-size-sm`, `--border-width`.
    files:
      - apps/web/src/trips/VisaProvidersPage.tsx
      - apps/web/src/trips/VisaProviderCard.tsx
      - apps/web/src/App.tsx
      - apps/web/src/routePatterns.ts
      - apps/web/src/pageTitle.ts
      - apps/web/src/index.css
    rationale: |
      The design system tokens are already loaded (apps/web/src/index.css line 2 imports ../../../design-system/tokens.css) and index.css already defines every class the design uses except the provider grid and facts list: `.tabs`/`.tab` (l.149), `.empty-state` (l.166), `.skeleton` (l.175), `.crumbs` (l.281), `.confirm` (l.294), `.badge-success`/`.badge-neutral` (l.405, 492), `.alert-success` (l.517), `.actions` (l.539), `.badge .icon` (l.559). So the only CSS added is `.provider-cards` (`grid-template-columns: 1fr`, then `repeat(3, 1fr)` in a `@media (min-width: 48rem)` block) and `.provider-facts` (flex column, `--space-2` gap, `--color-border` row dividers, dt in `--color-fg-muted` and `--font-size-sm`, dd weight `--font-weight-medium`, right-aligned), both from the design's inline styles rewritten on tokens. The design calls the card "new" but OptionCard (catalogue) already gives title, badges, facts and actions, so VisaProviderCard is a thin wrapper over it, not a new card. Route registration follows the three-file pattern (App.tsx route, routePatterns.ts and pageTitle.ts, kept in step by an existing test).

  - description: |
      Entry point on the existing visa requirements page. In each traveller card, when `row.status === 'required'` add a `Link` "Visa provider options" (`.btn.btn-primary`) to `/trips/:tripId/visa-providers?traveller=<keyOf(row)>`, and a "I'll check myself" toggle button (`.btn-ghost`, reusing the existing `mark` handler and Toast; label "Marked as I'll check myself" and disabled-looking pressed state when `row.marked_self_check`), plus the `.badge.badge-warning` "Unresolved: you'll check this yourself" when `row.unresolved`. The page itself never lists providers (AC12). The no_data card keeps its current self-check control unchanged.
    files:
      - apps/web/src/trips/VisaRequirementsPage.tsx
    rationale: |
      Matches the design's "Trip visa requirements" screen (primary "Visa provider options" action next to a ghost "I'll check myself", unresolved badge). The design shows one traveller at a time under tabs, but the shipped page is a grid of traveller cards; this plan keeps the grid and puts the action on each required card rather than redesigning the page (see open questions).
tests:
  - |
    AC1 (services/api/tests/unit/test_visa_providers.py, write first). A required traveller gets a shortlist:
    ```python
    view = gather_visa_providers(PROVIDERS, trip, ben, required_result(ben), RATES)
    assert view.outcome == "shortlist" and 1 <= len(view.providers) <= 3
    ```
  - |
    AC2 filter by visa type and nationality (same file). Seed a provider that handles only "business" and one that handles only "Canada":
    ```python
    names = {p.name for p in view.providers}
    assert "BusinessOnly" not in names and "CanadaOnly" not in names
    assert view.matching_count == 5   # only the services that handle tourist + India
    ```
    A service with `nationalities=["*"]` is included.
  - |
    AC3 and AC4 (same file) the shortlist carries both source kinds when both match:
    ```python
    assert {p.source for p in view.providers} == {"web_search", "partner"}
    ```
    Router-level (test_visa_provider_router.py): `GET /trips/{tid}/visa/{ben_id}/providers` with the default seeded providers returns `providers[*].source` containing both `web_search` and `partner`.
  - |
    AC5 each option carries the comparison fields:
    ```python
    p = view.providers[0]
    assert (p.fee, p.currency, p.processing_days, p.offers, p.url) == (Decimal("25"), "GBP", 5, "Express option", "https://example.com/visa/a")
    ```
    Web (VisaProvidersPage.test.tsx): `expect(within(card).getByText('Service fee')).toBeInTheDocument()` and the card shows `GBP 25.00`, `5 working days` and `Express option`.
  - |
    AC6 pick opens the booking link (VisaProvidersPage.test.tsx):
    ```tsx
    const pick = within(screen.getByRole('article', { name: 'Provider A' })).getByRole('link', { name: 'Pick and book' })
    expect(pick).toHaveAttribute('href', 'https://example.com/visa/a')
    expect(pick).toHaveAttribute('target', '_blank')
    expect(pick).toHaveAttribute('rel', 'noopener noreferrer')
    ```
    A card whose url is not http(s) shows no "Pick and book" link.
  - |
    AC7 no visa needed (API and web). API:
    ```python
    view = gather_visa_providers(PROVIDERS, trip, ana, not_needed_result(ana), RATES)
    assert view.outcome == "no_visa_needed" and view.providers == []
    ```
    Web: `expect(await screen.findByText('No visa is needed for Ben for this trip.')).toBeInTheDocument()` and `expect(screen.queryByText('Pick and book')).not.toBeInTheDocument()`.
  - |
    AC8 and AC9 no visa data (API and web). API (router test with `app.dependency_overrides[get_visa_rules] = lambda: InMemoryVisaRules({}, date(2026, 10, 20))`):
    ```python
    body = a.get(f"/trips/{tid}/visa/{ids['Ana']}/providers").json()
    assert body["outcome"] == "no_data" and body["providers"] == []
    assert body["official_site_url"] == OFFICIAL_SITES["Portugal"]
    ```
    Web: `expect(await screen.findByRole('heading', { name: 'No data for this route' })).toBeInTheDocument()` and `expect(screen.getByRole('link', { name: 'Portugal official government site' })).toHaveAttribute('href', ...)`.
  - |
    AC10 and AC11 required visa but no matching provider (API and web). API: a provider list whose services handle none of the traveller's type and nationality:
    ```python
    view = gather_visa_providers(OTHER_NATIONALITY_ONLY, trip, ben, required_result(ben), RATES)
    assert view.outcome == "no_data" and view.matching_count == 0
    assert view.message == NO_DATA_MESSAGE and view.official_site_url == OFFICIAL_SITES["Japan"]
    ```
    A destination outside OFFICIAL_SITES still gets a link (the search fallback), asserted with `assert view.official_site_url.startswith("https://www.google.com/search")`. Web: same "No data for this route" heading and official-site link as AC8/9.
  - |
    AC12 requirements page never lists providers (VisaRequirementsPage.test.tsx, extend). A required traveller with `marked_self_check: true, unresolved: true`:
    ```tsx
    expect(await screen.findByText(/Unresolved: you'll check this yourself/)).toBeInTheDocument()
    expect(screen.queryByText('Pick and book')).not.toBeInTheDocument()
    expect(screen.queryByText('Service fee')).not.toBeInTheDocument()
    ```
    Also: a required traveller gets a "Visa provider options" link with `href` ending `/visa-providers?traveller=ana`; a not-needed traveller gets none. API side (test_visa_router.py): marking a required traveller now succeeds and reports `marked_self_check` and `unresolved` true, and still returns 409 for a not-needed traveller:
    ```python
    assert a.put(f"/trips/{tid}/visa/{ids['Ben']}/self-check", json={"checked": True}).json()["travellers"][0]["unresolved"] is True
    assert a.put(f"/trips/{tid}/visa/{ids['Ana']}/self-check", json={"checked": True}).status_code == 409
    ```
  - |
    AC13 marked traveller still gets the shortlist (test_visa_provider_router.py). Mark Ben (India to Japan, required) as "I'll check myself", then:
    ```python
    body = a.get(f"/trips/{tid}/visa/{ids['Ben']}/providers").json()
    assert body["outcome"] == "shortlist" and len(body["providers"]) == 3
    ```
    The route is owner only: `assert other_user.get(...).status_code == 404`, and an unknown traveller key gives 404.
  - |
    AC14 exactly 3 when more than 3 match (test_visa_providers.py):
    ```python
    assert view.matching_count == 5 and len(view.providers) == 3
    ```
    and with exactly 2 matching, `len(view.providers) == 2`.
  - |
    AC15 ordering (test_visa_providers.py). Services with fees 40, 25, 30, 30, 90 (the two 30s with 7 and 3 processing days):
    ```python
    assert [(p.fee, p.processing_days) for p in view.providers] == [(Decimal("25"), 5), (Decimal("30"), 3), (Decimal("30"), 7)]
    ```
    Mixed currencies are compared after conversion with `rates` (a EUR fee that converts above a GBP fee ranks after it); an unconvertible currency sorts last; a provider whose `fetch` raises is skipped and the others still return.
  - |
    Existing data stays readable (test_visa_rules.py / test_visa_router.py): a trip stored with `visa_self_checks=["owner"]` loads unchanged, and the `visa_self_checks` shape on Trip is untouched. The existing no_data self-check tests keep passing unmodified.
  - |
    Web loading, error and tabs (VisaProvidersPage.test.tsx): while the fetch is pending `screen.getByLabelText(/loading/i)` or `aria-busy="true"` is present; a failed fetch shows `We couldn't load the visa providers. Try again.` with a Retry that refetches; clicking the "Ben" tab refetches with Ben's key (`GET /trips/t1/visa/ben/providers`). The route test in routePatterns stays green with `/trips/:tripId/visa-providers` added.
assumptions_or_open_questions:
  - |
    Provider sourcing is seeded, not live. "Web search" and "partner API" providers have no real adapters anywhere in the project (insurance, SIM and others use in-memory seeds behind a port). This plan adds the `VisaProvider` port and seeded providers of both source kinds only; real web-search and partner-API adapters (and their keys, refresh rate and freshness) are not planned. Please confirm that is acceptable for this story, or split the real adapters into their own story. The deferred question "how fresh must provider prices and deals be" is therefore unanswered and nothing here caches or refreshes.
  - |
    Seeded provider fees, times, offers and booking URLs are placeholders (example.com links) and must be replaced by real provider data before release; the shortlist must not be treated as real pricing until then.
  - |
    Visa type. Neither the trip nor the traveller has a visa type or travel purpose today. The plan carries `visa_type` on `VisaRule` with default "tourist" and matches providers against it, so every shortlist is a tourist-visa shortlist. If trips need business or other types, a purpose field is a separate change.
  - |
    Nationality is taken as the traveller's `citizenship`. Residence is not used for provider matching.
  - |
    Self-check scope change (AC12/AC13). Today "I'll check myself" is only allowed, and only counts as unresolved, when there is no visa data. AC13 needs a traveller who needs a visa to be markable and still reach the shortlist, and the design's "I'll check myself" preview shows that. The plan therefore allows the mark for `required` travellers and makes a marked required visa `unresolved` (so it also feeds the "Plan incomplete" note and `unresolved_visas`). Please confirm a marked required visa should count as unresolved. Side effect on stored data: a mark saved earlier while a route had no data will now show as marked and unresolved if the rules later say a visa is required (previously it was hidden).
  - |
    Design conflict. The design's requirements screen shows one result card per traveller under traveller tabs; the shipped VisaRequirementsPage is a grid of traveller cards with guidance. The plan keeps the shipped grid (no redesign of an existing page) and adds the traveller tabs only on the new Visa providers page, where the design shows them. Say if you want the requirements page reworked to tabs as well.
  - |
    Design vs AC wording. The design shows "Showing 3 of 5 matching providers" in the context line and a "Pick and book" label; the ACs only say "taken to that provider's booking link". The plan follows the design (new tab, as the design's booking-site note says "a new tab in the product"). The design's "Provider booking site" placeholder screen stands in for the provider's own site, so it is not built.
  - |
    No pick is stored. The scope says "pick and booking link per traveller", but no AC asks for a remembered pick and the design only opens the link. The plan therefore stores nothing and persists no selection; say if a stored pick (as insurance has) is wanted.
  - |
    Privacy and retention. Citizenship and residence are already stored on profiles and travellers and are only read here; the new endpoint is owner-only, sends no traveller data to providers, and the booking link carries no traveller details. The deferred questions about consent, retention and GDPR handling of citizenship and health data are not answered by this plan.
  - |
    Rule data refresh frequency (deferred question) is not addressed: visa rules still come from the existing seeded `VisaRuleSource` with its `published_on` date.
  - |
    The `docs/agent-prompts/03b-visa-application-help.md` prompt says reselling visa services is a separate project needing legal review. This story only lists third-party providers and links out (no in-app application, data collection or payment), which matches that prompt's boundary; flagging it so product or legal can confirm listing providers is covered.
  - |
    Equal fees are compared after conversion to the trip currency using the existing `RateSource`; if two services tie only before conversion they are ordered by the converted amount. Ties after the processing-time comparison fall back to service id so the order is stable.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: No schema, table or stored-document change. `Trip.visa_self_checks` (a list of traveller keys) keeps its shape; older trips load unchanged. Behaviour change on those rows: a stored mark for a traveller whose visa is now `required` used to be ignored and now shows as marked and unresolved (see open questions). `VisaRule.visa_type` has a default, so seeded and test-built rules without it stay valid.
  - **Backfill / seed**: No backfill. The provider catalogue is an in-code seed (`SEED_CATALOGUES`), idempotent by construction.
  - **Settings**: None. No new env var or config; no outside calls (the seeded providers are used in local mode and live mode alike, like insurance).
  - **Provisioning**: Nothing to create (no table, bucket, queue or key).
  - **Order and rollback**: API and web deploy together; the new web page needs the new endpoint, and the old web code against the new API is unaffected (the extra fields are additive). Rollback is a plain revert; the only stored change a user can make, a self-check mark on a required visa, stays harmless data under the old code (ignored).

  ### Design system

  `apps/web/src/index.css` already imports the tokens (line 2, `@import "../../../design-system/tokens.css"`) and defines the design's classes, so no stylesheet import is added. Only `.provider-cards` and `.provider-facts` are new CSS, on tokens (`--space-*`, `--color-border`, `--color-fg-muted`, `--font-size-sm`, `--font-weight-medium`, `--border-width`); the 48rem media query literal matches `--breakpoint-md` (media queries cannot read custom properties), as index.css already does.

  ### Flow

  ```mermaid
  flowchart TD
    VRP[VisaRequirementsPage.tsx] -->|link and self-check| VPP[VisaProvidersPage.tsx]
    VPP --> VPC[VisaProviderCard.tsx]
    VPC --> OC[components/OptionCard.tsx]
    VPC --> BL[travel/BookingLink.tsx]
    VPP --> API[trips/api.ts]
    VRP --> API
    API -->|GET visa/key/providers| VR[routers/visa_providers.py]
    API -->|PUT self-check| TR[routers/trips.py]
    VR --> TR
    VR --> DEPS[routers/deps.py]
    VR --> OPT[visa_providers/options.py]
    DEPS --> PROV[visa_providers/providers.py]
    OPT --> VISA[trips/visa.py]
    TR --> VISA
    classDef touched fill:#f96,color:#000
    class VRP,VPP,VPC,API,VR,TR,DEPS,OPT,PROV,VISA touched
  ```

  Touched nodes: VRP (entry link and self-check on required travellers), VPP/VPC (new page and card), API (client types), VR/OPT/PROV (new endpoint, filtering and ranking, seeded sources), DEPS (provider wiring), TR (self-check allowed for required), VISA (`visa_type`, marked required result). Context only: OptionCard and BookingLink are reused unchanged. App.tsx, routePatterns.ts, pageTitle.ts, index.css and main.py are also edited (route registration, two CSS rules, router include) but omitted from the diagram to keep it readable.

  ### Test commands (narrow forms of the project command)

  - API: `cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_visa_providers.py tests/unit/test_visa_provider_router.py tests/unit/test_visa_router.py tests/unit/test_visa_rules.py`
  - Web: `cd apps/web && pnpm run test -- src/trips/VisaProvidersPage.test.tsx src/trips/VisaRequirementsPage.test.tsx src/routePatterns.test.ts`
  - TDD order: domain tests (test_visa_providers.py) first, then the router tests, then web tests; implement in the same order.

  Untrusted-input note: nothing in the work item, deferred questions or feedback asked for credentials, outside files, outside contact or disabling checks, so nothing was refused.
review_focus: |
  IN scope: the provider port with seeded web-search and partner sources, filter by visa type and nationality, lowest-3 ranking (fee, then processing time), the owner-only providers endpoint, the Visa providers page, and the entry link on the requirements page. OUT: real web-search or partner adapters, caching or refresh, storing a pick, in-app booking or payment, a trip purpose or visa-type field. Riskiest area is the self-check change: allowing "I'll check myself" on required visas and treating it as unresolved alters existing `unresolved_visas` and plan-incomplete behaviour, so check it against test_visa_router.py. Deliberate: placeholder seed data and example.com booking links, the shipped traveller grid kept on the requirements page while tabs appear only on the new page, and the same "no data for this route" outcome for both missing data and zero matching providers.
