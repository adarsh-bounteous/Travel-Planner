summary: |
  Add a local stand-in for stay, flight and transport search that follows the existing shared local mode switch (`LOCAL_MODE` / `APP_ENV=local`, resolved in `services/api/app/local_mode.py`). In local mode the three provider ports (`StayProvider`, `FlightProvider`, `TransportProvider`) are served by new deterministic generators, so the existing trip stay/flight/transport pages and a new "Search travel" page (under Explore) all list several generated options. The options are seeded from type + destination + dates + route, so any change gives different options; places outside a fixed known list match nothing and give an empty result. A booking link on a generated option is `local://booking/...`, and the web app opens it as an in-app pretend booking page instead of example.com. A return date before the departure date is rejected with a validation message and no options. A small Local mode settings page (under Account) shows the shared switch; turning it on in a non-local (live) deployment is refused, the switch stays Off and a message says so. Real providers are untouched: with the switch off, `deps.py` hands out the same in-memory seed providers as today.

scope:
  - description: |
      Add a `travel_search` flag to `LocalStandIns` so the new stand-in flips with the one switch, and add an in-process runtime override for the switch used by the settings page.

      ```python
      @dataclass(frozen=True)
      class LocalStandIns:
          storage: bool
          sign_in: bool
          cloud_services: bool
          travel_search: bool

      def resolve_local_mode(env: Mapping[str, str], override: bool | None = None) -> tuple[str, bool]: ...
      # override True in a non-local environment raises LocalModeRefusedError("Local mode is not allowed in live deployments. ...")
      # override False wins over LOCAL_MODE=on; None keeps today's behaviour exactly.
      ```
      `config.get_settings()` passes the override through. The override lives in a small module-level holder (`set_local_mode_override`, `clear_local_mode_override`) in `local_mode.py`; it is memory only, never stored.
    files:
      - services/api/app/local_mode.py
      - services/api/app/config.py
      - services/api/tests/unit/test_local_mode.py
    rationale: |
      AC6, AC9, AC10. Reuses the existing refusal rule (`environment != local`) so a live deployment can never turn local mode on, whichever way it is asked. The existing `test_stand_ins_flip_together` already guards that a new flag follows the switch.

  - description: |
      New `app/travel/` package holding the generator and the unified search service.

      `app/travel/local.py`: known places and option pools copied from the approved design (Lisbon, Paris, Tokyo, Rome, Barcelona, Lima, Cape Town, Berlin, Marrakech, New York; case-insensitive exact match after trim/casefold). Three classes that implement the existing ports, so every existing caller gets local data from `deps.py` without changing:

      ```python
      class LocalStayProvider:
          name = "Local stays"
          def fetch(self, place: str, start: date, end: date) -> list[ProviderListing]: ...
      class LocalFlightProvider:
          name = "Local flights"; modes = ("flight",)
          def fetch(self, origin: str, destination: str, on: date) -> list[FlightOption]: ...
      class LocalTransportProvider:
          name = "Local transport"
          def fetch(self, origin: str, destination: str, on: date) -> list[TransportOption]: ...
      ```
      Each returns 3 options (empty for an unmatched place) drawn from a shuffled pool using a stable hash (`hashlib.sha256`, not `hash()`, which is salted per process) of `kind|place|dates|route`. Each option url is `local://booking/<kind>-<place-slug>-<n>?start=YYYY-MM-DD&end=YYYY-MM-DD&origin=...` so the booking page can rebuild the option from the link alone (no stored state). Currency EUR, whole units, as the design shows.

      `app/travel/search.py`: one function used by the new route.

      ```python
      class TravelOption(BaseModel):
          id: str; name: str; detail: str; price: Decimal; currency: str
          unit: Literal["total", "per traveller"]; url: str
      class TravelSearchResult(BaseModel):
          kind: Literal["stay", "flight", "transport"]
          source: Literal["local", "provider"]
          matched: bool
          options: list[TravelOption]
      def search_travel(kind, destination, depart, return_date, route, *, stays, flights, transports, local) -> TravelSearchResult: ...
      ```
      Raises `ReturnBeforeDepartError` when `return_date < depart`. With local on and the place unmatched: `matched=False, options=[]`. With local off: maps the real providers' `fetch` results to `TravelOption` (route text "From - to" gives the origin for flight/transport) and sets `source="provider"`.
    files:
      - services/api/app/travel/__init__.py
      - services/api/app/travel/local.py
      - services/api/app/travel/search.py
      - services/api/tests/unit/test_local_travel.py
      - services/api/tests/unit/test_travel_search.py
    rationale: |
      AC1, AC2, AC3, AC4 (link shape), AC5 (no example.com is ever produced locally), AC6, AC7, AC8. Implementing the existing provider Protocols keeps the swap at one seam (`deps.py`) and leaves `search_stays`, `gather_flights` and `search_transport` untouched.

  - description: |
      Switch the provider getters in `deps.py` on the shared setting, the same way `get_trips()` already does:

      ```python
      def get_stay_providers() -> list[StayProvider]:
          return _local_stay_providers() if get_settings().local_mode else _stay_providers()
      ```
      (same for flight and transport). Add two routers, registered in `main.py`:
      - `routers/travel_search.py`, prefix `/travel-search`: `GET /travel-search?type=&destination=&depart=&return=&route=` (signed-in only, via `get_current_user`) answers `TravelSearchResult`; a return before depart answers `ApiError(422, "return_before_depart")`. `GET /travel-search/booking?ref=<local:// url>` rebuilds the option for the pretend page, 404 `not_found` when local mode is off or the ref does not parse/match.
      - `routers/local_mode.py`, prefix `/local`: `PUT /local/mode` body `{"on": bool}` (signed-in). Sets the override; on `LocalModeRefusedError` answers `ApiError(409, "local_mode_not_allowed")` and leaves the override unset. Answers `{"local_mode": bool}`.
    files:
      - services/api/app/routers/deps.py
      - services/api/app/routers/travel_search.py
      - services/api/app/routers/local_mode.py
      - services/api/app/main.py
      - services/api/tests/unit/test_travel_search_router.py
      - services/api/tests/unit/test_local_mode_router.py
      - services/api/tests/e2e/test_travel_search_e2e.py
    rationale: |
      AC1-AC10 through the HTTP surface. 409 with a stable `code` follows the existing `{"code": ...}` error shape.

  - description: |
      Web: a "Search travel" page, an in-app booking page, a Local mode settings page, and one shared booking-link component.

      - `travel/api.ts`: `searchTravel(params)`, `fetchBookingPreview(ref)`, `setLocalMode(on)`, with the response types above.
      - `travel/TravelSearchPage.tsx` at `/explore/travel`, built to the design's "Travel search", "Search results", "Search with no match" and "Search with return before departure" screens: `.inbox-col.stack` (max 40rem, centred); `h1` "Search travel"; `.tabs` Stay / Flight / Transport; a `.form-grid` with Destination (`.field-wide`), Depart, Return and Route (`.field-wide`, shown for flight and transport only), each `.field` with `.field-hint`; one `.btn.btn-primary` "Search" that shows `.spinner` while waiting; link "Local mode settings". Field errors use `.field-error` plus `.is-invalid`, shown after submit only, and keep typed values ("Add a destination, like Lisbon.", "Pick a departure date.", "Pick a return date." for stay, "Add a route, like Porto - Lisbon." for flight/transport). Return-before-depart shows the design's text "Return date is before the departure date. Pick a return on or after the departure." under Return and lists nothing. Results: `.alert.alert-info` "Local mode is on." (or `.alert-warning` "Local mode is off. These results come from the real provider.", chosen from `source`), summary line `Lisbon · 12-15 Mar 2027 · Stay`, a `.stack` of `.card` options (name `h3`, detail `text-muted text-sm`, price in `--font-size-lg` bold with currency via the existing `formatMoney`, `.btn.btn-secondary` "Book" with `aria-label="Book <name>"`), and a `.btn-ghost` "Change search". No match: `.empty-state` with search icon, `h2` "No results for this place", text "We couldn't find "X". Check the spelling or try a larger city nearby.". `.skeleton` cards are not needed; the button spinner covers the short wait.
      - `travel/LocalBookingPage.tsx` at `/explore/travel/booking?ref=...`, built to the design's "Local booking page": `.back` link "Back to results" (uses `navigate(-1)`), `h1` "Option 1 · Lisbon stay", `.alert.alert-info` "Pretend booking. Nothing is booked or sent.", `.mail-sheet` with `.mail-meta` rows Option / Dates / Price, a body showing the `local://booking/...` link in `.mail-link` plus "The provider's own page, example.com, is never opened in local mode.", and a disabled `.btn.btn-primary` "Confirm booking" with the hint "Confirming is switched off on this page. It only pretends." (`aria-describedby`). An unknown ref shows the `.empty-state` used by the inbox ("This page is not available").
      - `travel/BookingLink.tsx`: `({ url, className, children })` renders a router `<Link to={"/explore/travel/booking?ref=" + encodeURIComponent(url)}>` when `url.startsWith("local://booking/")`, otherwise the current external `<a target="_blank" rel="noopener noreferrer">`. Swap it in at the five existing booking-link sites: `trips/PropertyCard.tsx`, `trips/FlightShortlistCard.tsx`, `trips/TransportTab.tsx`, `trips/ChosenStayCard.tsx`, `transport/TransportSearchPage.tsx`.
      - `account/LocalModePage.tsx` at `/account/local-mode`, built to the design's "Local mode settings": `h1` "Local mode", a `fieldset` with legend "Use local stand-ins for travel search" and On / Off `.radio`s with the design's hint; the initial value comes from `fetchLocalMode()`. Choosing On calls `setLocalMode(true)`; a 409 leaves the radio on Off and shows `.alert.alert-danger role="alert"` "Local mode is not allowed in live deployments. The switch stays Off." Link "Back to search". Link to this page from `AccountPage.tsx`. The design's dashed "Pretend this is a live deployment" card is a prototype-only control and is NOT built; the real API answers that case.
      - Wiring: routes in `App.tsx` (all inside `<RequireAuth>`), `navSections.ts` (`pathname.startsWith('/explore/')` stays under Explore), a link from `ExplorePage.tsx`, `/travel-search` added to `API_PREFIXES` in `devProxy.ts`, and the small missing styles added to `index.css` (`.form-grid`, `.row-between`, `.back`, and `.travel-option` for the option card layout; the design's class `.option` collides with an existing `.option` rule, so the card uses `.travel-option`). Colours, spacing and radii use only existing tokens.
    files:
      - apps/web/src/travel/api.ts
      - apps/web/src/travel/TravelSearchPage.tsx
      - apps/web/src/travel/LocalBookingPage.tsx
      - apps/web/src/travel/BookingLink.tsx
      - apps/web/src/account/LocalModePage.tsx
      - apps/web/src/account/AccountPage.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/App.tsx
      - apps/web/src/navSections.ts
      - apps/web/src/devProxy.ts
      - apps/web/src/index.css
      - apps/web/src/trips/PropertyCard.tsx
      - apps/web/src/trips/FlightShortlistCard.tsx
      - apps/web/src/trips/TransportTab.tsx
      - apps/web/src/trips/ChosenStayCard.tsx
      - apps/web/src/transport/TransportSearchPage.tsx
      - apps/web/src/travel/TravelSearchPage.test.tsx
      - apps/web/src/travel/LocalBookingPage.test.tsx
      - apps/web/src/travel/BookingLink.test.tsx
      - apps/web/src/account/LocalModePage.test.tsx
      - apps/web/src/navSections.test.ts
      - apps/web/src/devProxy.test.ts
      - apps/web/e2e/travel-search.spec.ts
    rationale: |
      AC1-AC10 in the UI. The booking link rewrite is the only place that decides in-app versus external, so AC4/AC5 hold for every list, including the existing shortlist pages.

tests:
  - |
    AC1 (pytest, unit). Write first in `services/api/tests/unit/test_local_travel.py`, run red, then add `app/travel/local.py`.
    ```python
    @pytest.mark.parametrize("kind", ["stay", "flight", "transport"])
    def test_each_kind_lists_several_options(kind):
        result = search_travel(kind, "Lisbon", date(2027, 3, 12), date(2027, 3, 15), "Porto - Lisbon", **LOCAL)
        assert result.matched is True and result.source == "local"
        assert len(result.options) >= 3
    ```
  - |
    AC2 (pytest, unit). Same file; one test per differing input (destination, depart, return, route), each per kind.
    ```python
    base = dict(kind=kind, destination="Lisbon", depart=date(2027, 3, 12), return_date=date(2027, 3, 15), route="Porto - Lisbon")
    for change in ({"destination": "Paris"}, {"depart": date(2027, 3, 13)}, {"return_date": date(2027, 3, 16)}, {"route": "Faro - Lisbon"}):
        other = search_travel(**{**base, **change}, **LOCAL)
        assert [o.id for o in other.options] != [o.id for o in search_travel(**base, **LOCAL).options]
    # and the same search twice is stable
    assert search_travel(**base, **LOCAL) == search_travel(**base, **LOCAL)
    ```
    For stay the route is ignored by design, so the route case is skipped for `kind == "stay"`. Flight and transport ignore the return date in the provider call, but the generator seeds on it, so it still changes the options.
  - |
    AC3 (pytest, unit + web). API: an unknown place answers an empty list and `matched` false; the HTTP route answers 200.
    ```python
    result = search_travel("stay", "Nowhere Land", date(2027, 3, 12), date(2027, 3, 15), "", **LOCAL)
    assert result.options == [] and result.matched is False
    ```
    Web (`TravelSearchPage.test.tsx`): with the mocked API answering `matched: false`, `expect(await screen.findByText('No results for this place')).toBeVisible()` and `expect(screen.queryByRole('heading', { level: 3 })).toBeNull()`.
  - |
    AC4 (vitest). `BookingLink.test.tsx` and `TravelSearchPage.test.tsx`: activating Book renders the pretend page inside the app.
    ```tsx
    await user.click(screen.getByRole('link', { name: 'Book Central Boutique Hotel' }))
    expect(await screen.findByText('Pretend booking.')).toBeVisible()
    expect(screen.getByText(/local:\/\/booking\/stay-lisbon-1/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeDisabled()
    ```
    Plus a pytest for `GET /travel-search/booking?ref=...` returning the same option the search listed, and 404 for a ref that does not match.
  - |
    AC5 (vitest + playwright). Unit: the rendered booking link has no external target.
    ```tsx
    const link = screen.getByRole('link', { name: /Book/ })
    expect(link).toHaveAttribute('href', expect.stringMatching(/^\/explore\/travel\/booking\?ref=/))
    expect(link).not.toHaveAttribute('target')
    ```
    pytest: no generated option url contains `example.com`: `assert all("example.com" not in o.url for o in result.options)`. Playwright (`travel-search.spec.ts`): click Book, then `expect(page).toHaveURL(/\/explore\/travel\/booking/)` and assert no request or navigation to `example.com` (`page.on('framenavigated', ...)` collects hosts; `expect(hosts).not.toContain('example.com')`).
  - |
    AC6 (pytest). With `LOCAL_MODE` unset, the route's results come from the real providers and are flagged so.
    ```python
    monkeypatch.delenv("LOCAL_MODE", raising=False)
    body = client.get("/travel-search", params={"type": "stay", "destination": "Lisbon", "depart": "2027-03-12", "return": "2027-03-15"}).json()
    assert body["source"] == "provider"
    assert any("Hotel Alfama Terrace" in o["name"] for o in body["options"])   # the seeded real-provider catalogue
    assert deps.get_stay_providers() is deps._stay_providers()
    ```
    Same for flight (Lisbon to Faro seed) and transport. Web: the off-mode result renders the `.alert-warning` "Local mode is off."
  - |
    AC7 (pytest + vitest). With local mode on, for each kind:
    ```python
    r = client.get("/travel-search", params={"type": kind, "destination": "Lisbon", "depart": "2027-03-15", "return": "2027-03-12", "route": "Porto - Lisbon"})
    assert r.status_code == 422 and r.json() == {"code": "return_before_depart"}
    ```
    Web: `expect(await screen.findByText(/Return date is before the departure date/)).toBeVisible()`, and the Return input has `aria-invalid="true"`.
  - |
    AC8 (pytest + vitest). The 422 body carries no options (asserted above by the exact `{"code": ...}` body), and the web page lists none:
    `expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)` and `expect(screen.queryByText('Search results')).toBeNull()`.
  - |
    AC9 (pytest). In `test_local_mode.py` and `test_local_mode_router.py`:
    ```python
    def test_override_on_in_live_is_refused(monkeypatch):
        monkeypatch.setenv("APP_ENV", "production"); monkeypatch.delenv("LOCAL_MODE", raising=False)
        r = client.put("/local/mode", json={"on": True})
        assert r.status_code == 409
        assert get_settings().local_mode is False
    with pytest.raises(LocalModeRefusedError, match="live deployments"):
        resolve_local_mode({"APP_ENV": "production"}, override=True)
    ```
    Also `test_off_means_no_stand_in` and `test_on_enables_every_stand_in` are extended with `travel_search=`.
  - |
    AC10 (pytest + vitest). The 409 body is `{"code": "local_mode_not_allowed"}`. Web (`LocalModePage.test.tsx`), with the mocked PUT answering 409:
    ```tsx
    await user.click(screen.getByLabelText('On'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Local mode is not allowed in live deployments.')
    expect(screen.getByLabelText('Off')).toBeChecked()
    ```
  - |
    Supporting tests. `navSections.test.ts`: `expect(mainSectionFor('/explore/travel/booking')).toBe('explore')`. `devProxy.test.ts`: `/travel-search` is in `API_PREFIXES`. Existing stay, flight and transport tests keep passing unchanged because local mode is off in them.
  - |
    Verify commands, in order: `cd services/api && uv run pytest tests/unit tests/e2e` (the stack lists pip as the package manager; use the project's existing invocation, `.venv` is already present), then `cd apps/web && pnpm vitest run && pnpm tsc --noEmit && pnpm playwright test e2e/travel-search.spec.ts`.

assumptions_or_open_questions:
  - |
    The "shared local mode switch" is today the server setting `LOCAL_MODE` (plus `APP_ENV=local`), shown to the web app through `/startup-status`; no in-app switch exists. The design adds a Local mode settings screen with On/Off, and AC9/AC10 are about "a user turns on the switch", so I am adding `PUT /local/mode` with an in-memory override. Question for the reviewer: is a runtime switch wanted, or should the page be read-only (showing the env value, with the live-deployment message when asked to turn on)? The runtime override is the larger change.
  - |
    Because the switch is shared, turning it Off at runtime in a local environment also swaps trip/profile storage back to DynamoDB (via `get_trips()` and the others), which will not work on a laptop with no AWS. Option B is to make the runtime override affect only `travel_search`. I have not chosen B because the story says "shared"; please confirm.
  - |
    The override is per process (memory only). That is fine for local uvicorn, and in live it can never be on, so it cannot leak. Not persisted across restarts: the env value applies again.
  - |
    There are no stay, flight or transport search pages that take Destination + Depart + Return + Route in one form today (stays are tied to a trip stay, flights to a trip leg, transport to one date). The design shows one combined page, so I add `/travel-search` and `/explore/travel` and ALSO make the existing trip pages local through the provider getters. The real-provider mapping in `search_travel` treats the Route text "From - to" as origin and uses Destination as the destination; the return date is used by stays only.
  - |
    Prototype vs AC: the prototype opens results and booking as separate screens; I build them as one page state plus a booking route. The prototype's dashed "Pretend this is a live deployment" control is prototype-only and is not built. Both are a deliberate difference, not a conflict with an AC.
  - |
    Known places are exactly the design's ten, exact match, case-insensitive. Anything else, including near-misses, is "cannot be matched". Prices are EUR with the currency shown.
  - |
    No new third-party package: `hashlib` is standard library, and the web side uses React Router and the existing helpers.

estimated_points: 8

package_dependencies: []

notes: |
  ### Data & rollout
  None — no schema, stored data, seed or fixture changes. Generated options are computed per request from the query, and the booking page rebuilds an option from its link. No new env var: `LOCAL_MODE` and `APP_ENV` keep their meaning and defaults (unset means off and real providers). The one new piece of state is the in-memory runtime override of the switch, which is empty at process start and cannot hold On outside `APP_ENV=local`. Deploy order does not matter; rollback is to revert the change.

  ### Shape

  ```mermaid
  flowchart TD
    LM[local_mode.py]:::touched --> CFG[config.py get_settings]:::touched
    CFG --> DEPS[routers/deps.py provider getters]:::touched
    LOC[travel/local.py generators]:::touched --> DEPS
    DEPS --> TS[routers/travel_search.py]:::touched
    DEPS --> SO[routers/stay_options.py]
    DEPS --> TR[routers/transport.py]
    DEPS --> FS[routers/flight_shortlist.py]
    SRCH[travel/search.py]:::touched --> TS
    LMR[routers/local_mode.py]:::touched --> LM
    MAIN[main.py]:::touched --> TS
    MAIN --> LMR
    TS --> WAPI[web travel/api.ts]:::touched
    WAPI --> PAGE[TravelSearchPage]:::touched
    WAPI --> BOOK[LocalBookingPage]:::touched
    WAPI --> MODE[LocalModePage]:::touched
    BL[BookingLink]:::touched --> PC[PropertyCard / FlightShortlistCard / TransportTab / ChosenStayCard / TransportSearchPage]:::touched
    classDef touched fill:#f96,color:#000
  ```

  - `deps.py` is the one seam: the same getters feed the existing routers and the new one, so a single check of `get_settings().local_mode` decides local versus real everywhere.
  - Existing pattern mirrored: `get_trips()` / `get_profiles()` already pick a local store on `local_mode`; `LocalInboxPage` and its `.inbox-col`, `.mail-sheet`, `.mail-meta` styles are reused for the booking sheet (design marks them as reused from STORY-074).
  - The generator hashes with `hashlib.sha256`: Python's `hash()` is salted per process and would make "the same search" differ between restarts.
  - ADR-0008 (Flight and Hotel Search, outbound) is respected: the real adapters stay behind the same ports and are not modified.

review_focus: |
  IN: local generators behind the three existing provider ports, a new `/travel-search` route, the in-app pretend booking page, the Local mode settings page, and swapping the five booking links to one `BookingLink`. OUT: any change to real providers or seed catalogues, stored data, and real booking. Riskiest: the runtime override of the shared switch (it also swaps storage when turned Off locally; see the open questions) and the live-deployment refusal, which must go through `resolve_local_mode` so it cannot be bypassed. Deliberate: the card class is `.travel-option` because the design's `.option` collides with an existing rule, and the design's "pretend live deployment" checkbox is not built.
