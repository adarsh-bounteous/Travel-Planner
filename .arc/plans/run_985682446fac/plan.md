summary: |
  Finish the LOCAL_LIVE_PROVIDERS opt-in. The setting, its parser (`resolve_live_providers`), `Settings.live_providers` and a README row already exist, but only the `places` map tiles honour it: `KNOWN_LIVE_PROVIDERS` is just `{"places"}`, every other provider selector in `deps.py` / `auth.py` keys off `local_mode` alone, and the parser lower-cases names so `PLACES` is accepted (AC9 requires it be refused). This plan (1) makes the known names the registered providers, (2) makes parsing case-sensitive and whitespace/trailing-comma tolerant, (3) adds one `Settings.is_live(name)` rule used by every provider selector, so in local mode only named providers use their live adapter and the rest use their local stand-in, and (4) tightens the README row.
scope:
  - description: |
      Known names and parsing in `app/local_mode.py`. Derive the known set from the provider registry names (places, flights, hotels, email, identity) so it cannot drift, and stop lower-casing: match is exact and case-sensitive. Whitespace around names and empty items (trailing comma) are dropped.

      ```python
      KNOWN_LIVE_PROVIDERS = frozenset(e.name for e in default_registry()._entries)  # or a public names() on ProviderRegistry

      def resolve_live_providers(env: Mapping[str, str]) -> frozenset[str]:
          names = frozenset(n.strip() for n in env.get("LOCAL_LIVE_PROVIDERS", "").split(",") if n.strip())
          unknown = names - KNOWN_LIVE_PROVIDERS
          if unknown:
              raise LocalModeRefusedError(f"LOCAL_LIVE_PROVIDERS names unknown provider(s) {sorted(unknown)}. Known: {sorted(KNOWN_LIVE_PROVIDERS)}.")
          return names
      ```
      Prefer adding a small public `names()` method to `ProviderRegistry` over reading `_entries`; check for an import cycle (registry imports only `app.integrations.breaker`).
    files:
      - services/api/app/local_mode.py
      - services/api/app/providers/registry.py
    rationale: |
      AC5 and AC9: unknown or wrongly-cased names stop start-up (`get_settings()` already runs in `lifespan`, and parses the setting whether or not local mode is on). AC8: tolerant splitting.
  - description: |
      One rule for "may this provider call out". Add to `Settings` in `app/config.py`, and reuse it in `map_tiles_enabled`:

      ```python
      def is_live(self, provider: str) -> bool:
          """Outside local mode every provider is live; in local mode only the opted-in ones are."""
          return (not self.local_mode) or provider in self.live_providers
      ```
    files:
      - services/api/app/config.py
    rationale: |
      AC1-4 and AC7 in a single testable place, instead of five copies of `local_mode` checks.
  - description: |
      Route each provider selector through `is_live`, keeping the local stand-in as the fallback:
      - places: `get_places` and `get_destination_resolver` (`settings.is_live("places")` picks the real `_places()` / `_resolver()`, else `_local_places()` / `NoResolver()`).
      - flights: `get_flight_providers` and `get_transport_providers`.
      - hotels: `get_stay_providers`.
      - email: `get_invite_sender` (live = `_invite_sender()`).
      - identity: the identity selector in `app/routers/auth.py` (line ~83, `_cognito()` vs `_local_identity()`) only; the account store, storage, trips, profiles and saved places are not providers and stay on `local_mode`.
      Example: `return _places() if get_settings().is_live("places") else _local_places()`.
      Stores, rates, recommendations, forecast and seeded catalogues are not registry providers and stay unchanged.
    files:
      - services/api/app/routers/deps.py
      - services/api/app/routers/auth.py
    rationale: |
      AC1-4: today only the map tiles follow the setting. Outside local mode `is_live` is always true, so AC7 and production behaviour are unchanged.
  - description: |
      README settings table row for `LOCAL_LIVE_PROVIDERS` (line 25 of services/api/README.md): keep default `empty`; list the accepted names (`places`, `flights`, `hotels`, `email`, `identity`), say names are case-sensitive, spaces and a trailing comma are ignored, unknown names stop start-up, and that outside local mode the setting has no effect (everything is live).
    files:
      - services/api/README.md
    rationale: |
      AC6.
tests:
  - |
    AC1, in `services/api/tests/unit/test_live_providers.py`. Failing first because only places is wired. For each registered provider, local mode with an empty or unset setting uses the stand-in:
    ```python
    @pytest.mark.parametrize("providers", ["", None])
    def test_nothing_live_by_default(monkeypatch, providers):
        _local_env(monkeypatch, providers)
        s = get_settings()
        assert not any(s.is_live(n) for n in KNOWN_LIVE_PROVIDERS)
        assert isinstance(deps.get_places(), LocalPlaceSearch)
        assert isinstance(deps.get_destination_resolver(), NoResolver)
        assert deps.get_flight_providers() == deps._local_flight_providers()
        assert deps.get_stay_providers() == deps._local_stay_providers()
    ```
  - |
    AC2 and AC3 (named provider live, unnamed stays local): clear `lru_cache`d `_places`/`_local_places` first, and assert with `LOCAL_LIVE_PROVIDERS=places`.
    ```python
    assert deps.get_places() is deps._places()
    assert deps.get_stay_providers() is deps._local_stay_providers()   # hotels not named
    assert deps.get_invite_sender() is deps._local_invite_sender()     # email not named
    ```
  - |
    AC4: two names, both live, a third stays local.
    ```python
    _local_env(monkeypatch, "places,hotels")
    assert deps.get_places() is deps._places()
    assert deps.get_stay_providers() is deps._stay_providers()
    assert deps.get_flight_providers() is deps._local_flight_providers()
    ```
  - |
    AC5: unknown name stops start-up and the message names it, both at the parser and on app start.
    ```python
    with pytest.raises(LocalModeRefusedError, match="bogus"):
        resolve_live_providers({"LOCAL_LIVE_PROVIDERS": "places,bogus"})
    with pytest.raises(LocalModeRefusedError, match="bogus"):
        with TestClient(app):  # lifespan runs get_settings()
            pass
    ```
    Also a drift guard: `assert KNOWN_LIVE_PROVIDERS == {e["name"] for e in default_registry().statuses(lambda _: "x")}`.
  - |
    AC6, README: a test (in `test_live_providers.py`, reading `services/api/README.md` via `Path(__file__).parents[2]`) finds the row and asserts its default cell is empty.
    ```python
    row = next(l for l in readme.splitlines() if l.startswith("| `LOCAL_LIVE_PROVIDERS`"))
    assert [c.strip() for c in row.strip("|").split("|")][1] == "empty"
    ```
  - |
    AC7: local mode off, setting names a provider, behaviour is as without it.
    ```python
    monkeypatch.delenv("LOCAL_MODE", raising=False); monkeypatch.setenv("LOCAL_LIVE_PROVIDERS", "places")
    s = get_settings()
    assert s.is_live("places") and s.is_live("flights")
    assert deps.get_places() is deps._places()
    ```
  - |
    AC8: whitespace and trailing comma.
    ```python
    assert resolve_live_providers({"LOCAL_LIVE_PROVIDERS": " places , hotels, "}) == {"places", "hotels"}
    ```
    plus a `get_settings()`-level check that both `is_live` and the selectors pick the live adapter.
  - |
    AC9, failing first because the parser currently lower-cases. Existing `test_places_parsed_and_empty_default` (which passes `" places "`) stays valid.
    ```python
    with pytest.raises(LocalModeRefusedError, match="Places"):
        resolve_live_providers({"LOCAL_LIVE_PROVIDERS": "Places"})
    ```
    and an app start with `LOCAL_LIVE_PROVIDERS=PLACES` raises. Run the existing `test_place_tiles.py`, `test_startup_status_router.py` and `test_local_*` suites to confirm no regression. Narrow command: `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_live_providers.py)`.
assumptions_or_open_questions:
  - |
    "Known provider" is taken to mean the five names in `default_registry()` (places, flights, hotels, email, identity). Today `KNOWN_LIVE_PROVIDERS` is only `places`; confirm the reviewer wants the full registry set.
  - |
    Mapping of registry names to selectors is my reading: flights covers flight and transport providers, hotels covers stays, places covers search, destination resolver and tiles. Activity, restaurant, insurance and SIM catalogues are seeded in every mode with no outside call, so they are untouched.
  - |
    The identity opt-in switches only the sign-in identity provider (`auth.py`). A live Cognito login with the local account store may need a real pool configured; the existing "not configured" behaviour covers a missing pool. Say if identity should be left out of the known names.
  - |
    Case handling: names are matched exactly as registered (lower case); `places` is accepted, `Places` is refused (AC9). No change to how LOCAL_MODE values are parsed.
  - |
    Live adapters for flights, hotels, email today are in-memory seeds or SES, so "goes to the live service" means selecting the non-local adapter that production uses.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout
  - **Existing data**: None. No schema, stored data or migration.
  - **Backfill / seed**: None.
  - **Settings**: `LOCAL_LIVE_PROVIDERS` already exists. Default empty, so unset is safe (nothing calls out in local mode, and no effect outside it). Documented in `services/api/README.md` settings table. A tightened rule: wrongly-cased names that used to be accepted (`PLACES`) now stop start-up.
  - **Provisioning**: None.
  - **Order and rollback**: Code only; roll back by reverting. Outside local mode behaviour is unchanged because `is_live` is always true there.

  Existing pieces I read: `services/api/app/local_mode.py` (`resolve_live_providers`, `KNOWN_LIVE_PROVIDERS`), `app/config.py` (`Settings.live_providers`, `map_tiles_enabled`), `app/routers/deps.py` (selectors), `app/providers/registry.py` (`default_registry`), `app/main.py` (`lifespan` calls `get_settings()`), `tests/unit/test_live_providers.py`. No UI change, so no design-system work.

  ```mermaid
  flowchart TD
    main[app/main.py lifespan] --> config[app/config.py Settings.is_live]
    config --> lm[app/local_mode.py resolve_live_providers]
    lm --> reg[app/providers/registry.py names]
    deps[app/routers/deps.py selectors] --> config
    auth[app/routers/auth.py identity selector] --> config
    classDef touched fill:#f96,color:#000
    class config,lm,reg,deps,auth touched
  ```
review_focus: |
  IN scope: the setting's parsing and validation, one `Settings.is_live` rule, the provider selectors in `deps.py` and `auth.py`, and the README row. OUT: new adapters, UI, the stores and seeded catalogues. Riskiest part is the selector rewiring: outside local mode every selector must return exactly what it does today. The removal of lower-casing is deliberate (AC9), and the known set deliberately comes from the provider registry so the two cannot drift.
