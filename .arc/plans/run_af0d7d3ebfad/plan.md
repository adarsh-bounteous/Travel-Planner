summary: |
  Add `with_fallback(primary, fallback)` to the shared integrations package. It calls the primary (live) source and, if that raises or returns an empty result, calls the fallback (saved data). The outcome is returned wrapped in a small `Sourced[T]` envelope carrying the untouched result, a `source` ("live" or "fallback") and an `as_of` time, so the UI can tell the traveller where data came from. If both fail, a new `FallbackError` carrying both failure reasons is raised. Existing `LastKnownRates` (app/trips/rates.py) and `gather_flights` (app/flights/options.py) are not modified.
scope:
  - description: |
      Add `FallbackError(IntegrationError)` with `primary_reason` and `fallback_reason` strings; its message includes both.
    files:
      - services/api/app/integrations/errors.py
    rationale: |
      Reuses the existing IntegrationError base so callers can catch one family.
  - description: |
      New module with the envelope and function:

      ```python
      Source = Literal["live", "fallback"]

      class Sourced(BaseModel, Generic[T]):
          result: T
          source: Source
          as_of: datetime

      def with_fallback(
          primary: Callable[[], T],
          fallback: Callable[[], T],
          *,
          now: Callable[[], datetime] = lambda: datetime.now(UTC),
      ) -> Sourced[T]: ...
      ```

      Behaviour: call primary; if it returns a non-empty value, return `Sourced(result=value, source="live", as_of=now())`. If it raises `Exception` or returns an empty value (None, or a sized container with len 0), log a warning and call fallback; return `Sourced(..., source="fallback", ...)`. If fallback raises too (or returns empty after primary raised), raise `FallbackError` with both reasons. Result object is passed through by identity, never copied or mutated. Export `with_fallback`, `Sourced`, `FallbackError` from `app/integrations/__init__.py`.
    files:
      - services/api/app/integrations/fallback.py
      - services/api/app/integrations/__init__.py
    rationale: |
      Sits beside the resilient client (STORY-125) as another resilience building block; injectable clock keeps as_of deterministic in tests. Mirrors the failed/ok source reporting idea of gather_flights and the remembered-rate idea of LastKnownRates without touching either.
  - description: |
      Unit tests (written first) in a new file; no edits to existing rates or flights tests.
    files:
      - services/api/tests/unit/test_integration_fallback.py
    rationale: |
      One test per acceptance criterion.
tests:
  - |
    AC1 primary result unchanged:
    ```python
    payload = [1, 2]
    out = with_fallback(lambda: payload, lambda: [9])
    assert out.result is payload
    ```
  - |
    AC2 source on primary:
    ```python
    assert with_fallback(lambda: [1], lambda: [9]).source == "live"
    ```
  - |
    AC3 as_of on primary:
    ```python
    t = datetime(2026, 1, 1, tzinfo=UTC)
    assert with_fallback(lambda: [1], lambda: [9], now=lambda: t).as_of == t
    ```
  - |
    AC4 fallback result on primary failure:
    ```python
    def boom(): raise RuntimeError("down")
    saved = [9]
    assert with_fallback(boom, lambda: saved).result is saved
    ```
  - |
    AC5 source marks fallback:
    ```python
    assert with_fallback(boom, lambda: [9]).source == "fallback"
    ```
  - |
    AC6 as_of on fallback:
    ```python
    assert with_fallback(boom, lambda: [9], now=lambda: t).as_of == t
    ```
  - |
    AC7 existing behaviour unchanged: run the existing suites unmodified, and add a guard that the two modules do not import the new one:
    ```python
    # existing: tests/unit/test_trip_helpers_router.py, tests/unit/test_flight_options.py
    assert "fallback" not in inspect.getsource(app.trips.rates) + inspect.getsource(app.flights.options)
    ```
    Narrow command: `cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_integration_fallback.py tests/unit/test_flight_options.py tests/unit/test_trip_helpers_router.py`
  - |
    AC8 both fail:
    ```python
    def also_boom(): raise ValueError("no cache")
    with pytest.raises(FallbackError) as e:
        with_fallback(boom, also_boom)
    assert "down" in str(e.value) and "no cache" in str(e.value)
    ```
  - |
    AC9 empty primary falls back:
    ```python
    out = with_fallback(lambda: [], lambda: [9])
    assert out.result == [9] and out.source == "fallback"
    ```
    Narrow command: `cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_integration_fallback.py`
assumptions_or_open_questions:
  - |
    "Empty" is treated as None or a sized container of length 0. Other falsy values (0, False) count as real results.
  - |
    Source and as_of are carried on a wrapper (`Sourced`) rather than set on the result, because results are arbitrary types and must be returned unchanged (AC1). Source values "live" and "fallback" are assumed; say if specific provider names are wanted.
  - |
    Primary and fallback are zero-argument callables (callers bind arguments with lambda or functools.partial). Only `Exception` is caught, not BaseException.
  - |
    No router or UI wiring is included; the ACs only cover the function. Wiring it into endpoints is left to later stories.
estimated_points: 2
package_dependencies: []
notes: |
  ### Data & rollout

  None — a new pure function and error class; no stored data, migration, settings or provisioning. Safe to leave in place; rollback is reverting the commit.

  Python tests run via `cd services/api && sh run-py.sh -m pytest -c pytest.ini <file>`. No UI step, so design tokens do not apply.
review_focus: |
  IN: new `integrations/fallback.py`, `FallbackError`, exports, and tests. OUT: any change to `LastKnownRates`, `gather_flights` or routers (AC7). Riskiest part is the "empty" definition and ensuring the result is returned by identity. The wrapper envelope is deliberate so the result stays unchanged.
