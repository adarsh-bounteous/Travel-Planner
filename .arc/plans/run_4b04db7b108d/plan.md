summary: |
  Make the existing flight shortlist a single-mode transport shortlist. The leg endpoint `GET /trips/{id}/flights/shortlist` already gathers options from every provider in parallel and ranks them by fare, travel time, stops and saved-preference fit, so adding train, bus and taxi entries as extra providers puts them in the same ranking. This change adds a `mode` and an `estimate` flag to the option model, and train, bus and taxi seed providers keyed by leg. It makes preference fit mode-aware, and adds a per-mode "no services" note. On the web it shows the mode on each card, labels taxi fares as estimates and gives taxis a provider link. No combined multi-mode journeys are built: every entry comes from exactly one provider with exactly one mode.
scope:
  - description: |
      Add mode and estimate to the option model, and tell each source which modes it covers.

      ```python
      class FlightOption(BaseModel):
          ...
          mode: Mode = "flight"       # new; default keeps every existing flight valid
          estimate: bool = False      # new; true for a taxi's estimated fare

      class SourceResult(BaseModel):
          name: str
          status: SourceStatus
          modes: list[Mode] = ["flight"]   # new; from getattr(provider, "modes", ("flight",))
      ```

      `gather_flights` fills `SourceResult.modes` from the provider's optional `modes` attribute.
    files:
      - services/api/app/flights/options.py
    rationale: |
      One model for every mode keeps the "same details as a flight" requirement (provider, fare, deal, travel time, stops) true by construction, and means ranking and budget code need no per-mode branches. The defaults leave existing flight data and tests untouched.
  - description: |
      Add the seed train, bus and taxi catalogues for the same legs as the flight seeds (Lisbon to Faro, Faro to Porto) plus a local taxi leg inside the destination (Faro Airport to Faro). They go in `InMemoryFlightProvider` form with a `modes` attribute, for example a "Rail search" source (mode train), a "Coach search" source (mode bus) and a "Ride provider" source (mode taxi). Train and bus entries carry fare, minutes, stops and an optional deal. A taxi entry has `estimate=True`, `departs=None`, `cabin=None`, 0 stops and a ride-provider `url`. The helper `_flight` gains a `mode` argument and `estimate`. `InMemoryFlightProvider.__init__` gains `modes: tuple[Mode, ...] = ("flight",)`. A route with no service for a mode simply has no catalogue entry for it. `deps._flight_providers` already iterates `SEED_CATALOGUES`, so it needs only the modes passed through: seed catalogues become `name -> (modes, catalogue)` or a parallel `SEED_MODES` dict.
    files:
      - services/api/app/flights/providers.py
      - services/api/app/routers/deps.py
    rationale: |
      The provider port (`FlightProvider.fetch(origin, destination, on)`) is already the seam where Flight and Hotel Search adapters (ADR-0008) will plug in, so ground modes enter through the same port with no new endpoint. Each entry stays single-mode because each comes from one catalogue row.
  - description: |
      Make preference fit mode-aware. In `preference_fit`, change `met.append("flight" in prefs.modes)` to `met.append(f.mode in prefs.modes)`. Ranking itself (`rank_flights`) is unchanged, because fare, minutes and stops are already mode-neutral. Add a response field `no_service: list[Mode]` to the shortlist, listing each mode that has no entries and whose sources all answered ok (a failed or timed-out source is reported by the existing source alert, not as "no service").

      ```python
      class FlightShortlist(BaseModel):
          ...
          no_service: list[Mode]   # new
      ```

      Compute it in the router from `sources` and the gathered entries, in a small helper `modes_without_service(sources, flights) -> list[Mode]` in `flights/shortlist.py`, using the canonical mode order flight, train, bus, taxi.
    files:
      - services/api/app/flights/shortlist.py
      - services/api/app/routers/flight_shortlist.py
    rationale: |
      Without the preference change, a traveller whose preferred modes are ["train"] would see every train scored as missing the preference. The `no_service` field lets the UI show the note for AC10 while AC11 follows from no entries being generated for that mode.
  - description: |
      Web types and API client. Extend `FlightOption` with `mode: TransportMode` and `estimate?: boolean`, extend `SourceResult` with `modes`, and extend `FlightShortlist` with `no_service: TransportMode[]`. Add `formatMode(mode)` to `flights.ts` returning Flight, Train, Bus or Taxi.
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/flights.ts
    rationale: |
      Keeps the client types in line with the API response. `TransportMode` already exists in `api.ts`.
  - description: |
      Card and page. In `FlightShortlistCard`: show a mode badge (`formatMode`). For an entry with `estimate` true, label the fare "Estimated fare" and show it as an estimate in place of "indicative as of". For a taxi, show a link `<a href={flight.url} rel="noopener noreferrer" target="_blank">Open ride provider</a>`. Provider, fare, deal, travel time and stops render as they do for flights. In `FlightShortlistPage`: change the heading, the loading label, the list aria-label and the empty-state copy from "flights" to "travel options" (update the existing tests that assert the old strings), and render one short note per `no_service` mode, for example `No train services run on this route.`, in a `role="note"` element.
    files:
      - apps/web/src/trips/FlightShortlistCard.tsx
      - apps/web/src/trips/FlightShortlistPage.tsx
    rationale: |
      Covers AC4 and AC6 to AC10 in the UI. The link is shown only for taxis, because the general booking link belongs to a later story in this epic.
tests:
  - |
    AC1, backend. In `services/api/tests/unit/test_flight_shortlist_router.py`, using the seeded sources, add the test below. It fails first because the seeds hold only flights.
    ```python
    body = a.get(_url(_trip(a)), params=LEG).json()
    assert {e["flight"]["mode"] for e in body["flights"]} == {"flight", "train", "bus", "taxi"}
    ```
  - |
    AC2, in `services/api/tests/unit/test_flight_shortlist.py`. Three options with equal minutes and stops, where the bus fare is lowest.
    ```python
    ranked = rank_flights([_f("flight", fare=90, mode="flight"), _f("train", fare=80, mode="train"), _f("bus", fare=30, mode="bus")], NO_PREFS, _fits)
    assert ids(ranked)[0] == "bus"
    ```
    The `_f` helper gains a `mode` argument.
  - |
    AC3, same file. Equal fare and stops, and the train has the shortest travel time.
    ```python
    ranked = rank_flights([_f("flight", minutes=120, mode="flight"), _f("train", minutes=60, mode="train"), _f("bus", minutes=120, mode="bus")], NO_PREFS, _fits)
    assert ids(ranked)[0] == "train"
    ```
  - |
    AC4, backend plus UI. Backend: `assert all(e["flight"]["mode"] in {"flight", "train", "bus", "taxi"} for e in body["flights"])`. UI, in `FlightShortlistCard.test.tsx` or `FlightShortlistPage.test.tsx`: for each of the four modes, `expect(screen.getByText('Train')).toBeInTheDocument()` and likewise for Flight, Bus and Taxi.
  - |
    AC5. Every entry has exactly one mode, and there is no entry that combines legs or modes.
    ```python
    assert all(isinstance(e["flight"]["mode"], str) for e in body["flights"])
    assert not any("+" in e["flight"]["mode"] or "," in e["flight"]["mode"] for e in body["flights"])
    ```
    A model-level test also asserts that `FlightOption(mode="train+bus", ...)` raises `ValidationError`, which holds because `Mode` is a closed Literal.
  - |
    AC6. Backend: `assert taxi["flight"]["estimate"] is True and all(not e["flight"]["estimate"] for e in body["flights"] if e["flight"]["mode"] != "taxi")`. UI: `expect(screen.getByText(/Estimated fare/)).toBeInTheDocument()` for a taxi entry, and `expect(screen.queryByText(/Estimated fare/)).toBeNull()` for a flight entry.
  - |
    AC7. UI: `expect(screen.getByRole('link', { name: 'Open ride provider' })).toHaveAttribute('href', 'https://example.com/rides/ridenow-lis-far')` for a taxi. Backend: `assert taxi["flight"]["url"].startswith("https://")`.
  - |
    AC8. Backend, three requests on one trip for the to and from leg (Lisbon to Faro), the leg between cities (Faro to Porto) and the local taxi (Faro Airport to Faro).
    ```python
    for leg in (LEG, {"origin": "Faro", "destination": "Porto", "date": "2027-11-22"}, {"origin": "Faro Airport", "destination": "Faro", "date": "2027-11-19"}):
        assert a.get(_url(tid), params=leg).json()["flights"]
    ```
  - |
    AC9. Backend: for a train, a bus and a taxi entry, `assert {"provider", "fare", "currency", "travel_minutes", "stops", "deal"} <= entry["flight"].keys()`. UI: the card for a train with a deal shows the provider, fare, `Deal: ...`, travel time and stops text, the same assertions the flight card test makes.
  - |
    AC10. Backend, on a leg that has flights only: `assert body["no_service"] == ["train", "bus", "taxi"]`. UI: `expect(screen.getByText('No train services run on this route.')).toBeInTheDocument()`. A failed source is not reported as no service: with a train provider that raises, `assert "train" not in body["no_service"]` and the source status is `failed`.
  - |
    AC11. Backend, same leg: `assert not any(e["flight"]["mode"] == "train" for e in body["flights"])`. UI: `expect(screen.queryByText(/Train/)).toBeNull()` in the card list when the mode is missing.
  - |
    Preference fit regression, in `test_flight_shortlist.py`: `assert preference_fit(_f("t", mode="train"), TransportPreferences(modes=["train"])) == 100` and `assert preference_fit(_f("f"), TransportPreferences(modes=["train"])) == 0`. Existing flight tests must still pass unchanged apart from the renamed UI strings.
assumptions_or_open_questions:
  - |
    Taxi fare is shown as an estimate plus a ride-provider link, as the scope leans toward. The item says the product owner has yet to confirm this. If the answer is link only, drop the fare from the taxi card and keep the link. The model keeps `estimate`, so the change would be UI-only.
  - |
    The endpoint path and the response key `flights` are kept, so the existing flight shortlist page, route and tests need no rename. The key now holds entries of every mode. A rename to a mode-neutral path would be a separate refactor.
  - |
    Train, bus and taxi data come from seeded in-memory sources, like the flight seeds, because no real provider is chosen yet (ADR-0008). Seed currency is EUR so all modes rank in one currency, and the `/transport` search page keeps its own USD seeds.
  - |
    A mode counts as "no service" only when no entry exists for it and every source covering that mode answered ok. A mode whose source failed or timed out is covered by the existing source alert.
  - |
    Ranking weights are unchanged. A mode never wins on mode alone, and equal scores fall back to the existing tie-break by fare, minutes, stops, fit and provider.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — no stored data, schema or settings change. The new fields have defaults and the sources are in-memory seeds, so there is nothing to migrate, backfill or provision. The change is safe to deploy API first or web first: the web treats `mode` and `no_service` as optional until the API sends them. To roll back, revert the commit.

  ```mermaid
  flowchart TD
    Router[routers/flight_shortlist.py] -->|adds no_service| Shortlist[flights/shortlist.py]
    Router --> Options[flights/options.py]
    Deps[routers/deps.py] -->|passes modes| Providers[flights/providers.py]
    Providers --> Options
    Shortlist --> Options
    Shortlist --> TOpts[transport/options.py _in_window]
    Page[FlightShortlistPage.tsx] --> Card[FlightShortlistCard.tsx]
    Page --> ApiTs[trips/api.ts]
    Card --> FlightsTs[trips/flights.ts]
    ApiTs -->|GET flights/shortlist| Router
    classDef touched fill:#f96,color:#000
    class Router,Shortlist,Options,Deps,Providers,Page,Card,ApiTs,FlightsTs touched
  ```

  The ranking function is deliberately untouched, because fare, travel minutes and stops are already mode-neutral. The existing `/transport` search (`app/transport/*`) is not changed.

  Files are placed to match current layout: `app/flights/*` holds the shortlist pipeline and `apps/web/src/trips/*` holds its UI. Architecture follows the confirmed stack: FastAPI with pytest, React with vitest, tailwind classes already used by the card (`badge`, `fare`, `option-details`).
review_focus: |
  IN: single-mode train, bus and taxi entries in the existing leg shortlist, mode shown on each card, taxi estimate label and provider link, the per-mode "no services" note. OUT: combined multi-mode journeys, real provider adapters, the general booking link, and any change to the `/transport` search. Riskiest parts are the `no_service` computation, which must not report a failed source as "no service", and the mode-aware `preference_fit`. The endpoint name and the `flights` response key are kept on purpose to avoid churn, and the taxi estimate versus link-only choice is still open with the product owner.
