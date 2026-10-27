summary: |
  Add a Currency helper and a Weather helper to a Trip. The Trip Planner API gets two owner-scoped read routes, `GET /trips/{id}/currency-helper` and `GET /trips/{id}/weather-helper`. They are built on the existing `RateSource` port plus new forecast and climate ports with local stand-ins, so no outside service is called in local mode. The Web App gets two pages, `/trips/:tripId/currency` and `/trips/:tripId/weather`, and a "Travel helpers" card on the trip Overview tab that links to them. The pages follow the approved prototype: rate card, two-way converter, typical-weather card, forecast table, and the unavailable and last-known states. Failure handling is explicit: an unavailable live rate falls back to a dated last known rate, and an unavailable forecast falls back to dated typical weather. Trip-cost conversion is untouched, because it stays in the Trip itinerary epic.

scope:
  - description: |
      Rates: add a failure signal and a last-known-rate memory next to the existing port. `RateSource.rate` is unchanged for its many callers.
      ```python
      # app/trips/rates.py (additions)
      class RateUnavailable(Exception): ...

      class LastKnownRates:
          """Remembers the latest successful rate per currency pair, with the date it was seen."""
          def remember(self, from_currency: str, to_currency: str, rate: Decimal, on: date) -> None: ...
          def get(self, from_currency: str, to_currency: str) -> tuple[Decimal, date] | None: ...
      ```
      A real provider adapter signals failure by raising `RateUnavailable`. `LocalRates` and `InMemoryRates` never raise.
    files:
      - services/api/app/trips/rates.py
    rationale: |
      AC8 and AC9 need to tell "rate failed to load" apart from "pair unknown" (None), and AC9 needs a dated fallback.
  - description: |
      Destination facts: a seeded table for destination currency and typical weather per month. It is keyed by the country, the last comma segment as `requirements._country` does, or by a known city. The local seed covers the destinations already seeded in `travel/local.py` PLACES, with Tokyo/Japan = JPY.
      ```python
      # app/trips/destination_info.py
      class TypicalWeather(BaseModel):
          month: int            # 1-12
          summary: str
          high_c: int
          low_c: int
          rain_mm: int
          rain_days: int
          as_of: date           # date of the climate data, shown as "dated ..."

      def currency_for(destination: str | None) -> str | None: ...
      def typical_weather_for(destination: str | None, month: int) -> TypicalWeather | None: ...
      ```
    files:
      - services/api/app/trips/destination_info.py
    rationale: |
      AC1 (destination currency), AC5 and AC11 (typical weather for the trip month, labelled with a date). There is no destination metadata in the codebase today, so this is a placeholder seed in the style of `requirements.py` and the recommendation seeds.
  - description: |
      Forecast port with a local stand-in, plus the pure "is a forecast in range" rule.
      ```python
      # app/trips/forecast.py
      FORECAST_HORIZON_DAYS = 14

      class ForecastUnavailable(Exception): ...

      class DayForecast(BaseModel):
          date: date
          high_c: int
          low_c: int
          rain_percent: int

      class ForecastSource(Protocol):
          def for_dates(self, destination: str, start: date, end: date) -> list[DayForecast]: ...  # raises ForecastUnavailable

      def forecast_dates(start: date | None, end: date | None, today: date) -> tuple[date, date] | None:
          """The trip dates clipped to today..today+14, or None when start is more than 14 days away or the trip is over."""
      ```
      `LocalForecast` returns deterministic days for any destination.
    files:
      - services/api/app/trips/forecast.py
    rationale: |
      AC6 and AC7 (14-day rule) and AC10 (failure path). Pure rule function so the boundary (day 14 in, day 15 out) is unit-tested without HTTP.
  - description: |
      New router with the two helper routes, owner-only via `_owned_trip`-style access as `/trips/{id}/requirements` does. The trip's currency is used as the home currency (see open questions). `today` comes from a `get_today` dependency so tests control it.
      ```python
      # app/routers/trip_helpers.py
      router = APIRouter(prefix="/trips/{trip_id}")

      @router.get("/currency-helper")
      def currency_helper(trip_id: str, owner=Depends(get_current_user), trips=Depends(get_trips),
                          identity=Depends(get_identity), rates: RateSource = Depends(get_rates),
                          last_known: LastKnownRates = Depends(get_last_known_rates),
                          today: date = Depends(get_today)) -> CurrencyHelper: ...

      @router.get("/weather-helper")
      def weather_helper(trip_id: str, owner=..., trips=..., identity=..., forecasts: ForecastSource = Depends(get_forecast),
                         today: date = Depends(get_today)) -> WeatherHelper: ...
      ```
      Response shapes:
      ```python
      class CurrencyHelper(BaseModel):
          destination_currency: str | None      # null when the destination has no known currency
          home_currency: str
          live: LiveRate | None                 # {rate, inverse, as_of}; null when unavailable
          last_known: LastKnownRate | None      # {rate, as_of}; only set when live is null
          start_date: date | None
          end_date: date | None

      class WeatherHelper(BaseModel):
          typical: TypicalWeather | None
          forecast: ForecastResult | None       # null = out of range; {status:"available"|"unavailable", days}
          start_date: date | None
          end_date: date | None
      ```
      A successful live rate is saved with `last_known.remember(...)`. A `RateUnavailable` raised by the source yields `live=None` plus the remembered rate, or None. Rates are returned as strings (Decimal) so the client does not lose precision.
    files:
      - services/api/app/routers/trip_helpers.py
      - services/api/app/routers/deps.py
      - services/api/app/main.py
    rationale: |
      Backs every AC. `deps.py` gains `get_forecast`, `get_last_known_rates` (lru_cached singleton, like `_rates`) and `get_today`. `main.py` includes the router beside `rates.router`.
  - description: |
      Web API client and pure helpers. `formatMoney` puts the code first, `JPY 1,000`, and uses 0 decimals for JPY and 2 otherwise, mirroring the API's `WHOLE_UNIT_CURRENCIES`. The existing `formatConverted` in `convertApi.ts` puts the code AFTER the number and is left alone because other pages and tests depend on it.
      ```ts
      // apps/web/src/trips/helperFormat.ts
      export const formatMoney = (amount: number, currency: string): string => ...        // 'JPY 1,000', 'EUR 6.10'
      export const formatRate = (rate: number, from: string, to: string): string => ...   // 'JPY 1 = EUR 0.0061'
      export const formatTripDates = (start?: string | null, end?: string | null): string => ... // toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'}), joined with ' – '
      export const parseAmount = (text: string): number | null => ...                      // strips thousands separators; null when not a number
      export const convertAmount = (amount: number, rate: number, direction: 'toHome' | 'toDestination') => number
      // apps/web/src/trips/helpersApi.ts
      export const fetchCurrencyHelper = (tripId: string) => call<CurrencyHelper>(`/trips/${encodeURIComponent(tripId)}/currency-helper`)
      export const fetchWeatherHelper = (tripId: string) => call<WeatherHelper>(`/trips/${encodeURIComponent(tripId)}/weather-helper`)
      ```
    files:
      - apps/web/src/trips/helperFormat.ts
      - apps/web/src/trips/helpersApi.ts
    rationale: |
      AC3, AC4 (converter maths), AC12 (local date format, same `toLocaleDateString(undefined, ...)` approach as `TripRequirementsPage`), and AC13 (code before number).
  - description: |
      Currency helper page, from the prototype screens "Currency helper" and "Currency helper, live rate unavailable". Layout is `.stack.stack-lg` with:
      - breadcrumb `.crumbs` "Trip / Currency helper" and an `<h1>`
      - `.text-muted` line "Tokyo, 3 Nov – 9 Nov 2026"
      - `.card.stack` rate card: a `.kv` dl with Destination currency "JPY (Japanese yen)" and Home currency "EUR (euro)", then `.rate-line` "Live rate: JPY 1 = EUR 0.0061", a `.text-sm.text-muted` inverse line "EUR 1 = JPY 163.93. Updated ...", and a `.btn.btn-ghost.btn-sm` "Refresh rate" (`aria-live="polite"`)
      - `.card.stack` converter: `<h3>Converter</h3>`, two `.field` inputs ("Amount in JPY", "Amount in EUR") inside `.converter-fields` with the code overlay `.amount-code` (aria-hidden) over the `.input`, then `<p class="result" role="status">` "JPY 1,000 = EUR 6.10" and a `.field-hint`
      Unavailable state: `.alert.alert-danger[role=alert]` titled "The live rate is unavailable right now." with the body "We couldn't reach the exchange rate service. Try again in a moment, or use the last known rate below.", then `.rate-line.is-stale` "Last known rate: JPY 1 = EUR 0.0061, dated 14 Oct 2026", and a `.btn.btn-secondary.btn-sm` "Try again" that shows a `.skeleton` while loading. The converter keeps working at the last known rate, with the result suffix " at the last known rate" and the hint "Amounts use the rate dated ..., so treat them as estimates." With no last known rate, show the alert only and hide the converter.
      The page-level loading state is `.skeleton` lines, as in `TripRequirementsPage`. The prototype's few styles (`.rate-line`, `.kv`, `.amount`, `.converter-fields`, `.result`) go into `index.css` using tokens only.
    files:
      - apps/web/src/trips/CurrencyHelperPage.tsx
      - apps/web/src/index.css
    rationale: |
      AC1-4, 8, 9, 12, 13. Follows the prototype's screens "Currency helper" and "Currency helper, live rate unavailable", using existing utility classes and tokens.
  - description: |
      Weather helper page, from the prototype screens "Weather helper, trip within 14 days", "forecast unavailable" and "more than 14 days away". The layout is `.stack.stack-lg` with a breadcrumb "Trip / Weather helper", an `<h1>`, and the dates line. Then:
      - `.card.stack` typical weather with `<h3>Typical weather for November</h3>`, the summary, and the muted stats line "About 90 mm of rain over 6 days in the month."
      - Forecast `.card.stack` with `<h3>Forecast for trip dates</h3>` and a `.table-wrap` `.data-table` (Date / High / Low / Rain, with a `.sr-only` caption and row headers like "Tue 3 Nov"), shown only when `forecast.status === 'available'`
      - When `forecast` is null, no forecast card is rendered, and the typical card carries the hint "A forecast appears here once your trip is within 14 days."
      - When the forecast is unavailable, a `.alert.alert-danger` "The forecast is unavailable right now." with "Try again" `.btn.btn-secondary.btn-sm`. The typical card heading becomes "Typical weather for November, dated 2026" (the date uses `as_of`, local format)
      The prototype's forecast table is a table on phones too, inside `.table-wrap { overflow-x: auto }`. UI guidelines say tables become cards at 375px. Four narrow columns fit a phone, so follow the prototype and keep the scrollable table.
    files:
      - apps/web/src/trips/WeatherHelperPage.tsx
    rationale: |
      AC5-7, 10-12. Whether the forecast card is rendered is driven by the API's null/available/unavailable value, so the 14-day rule lives in one place (the API).
  - description: |
      Entry points: routes `/trips/:tripId/currency` and `/trips/:tripId/weather` (inside `RequireAuth`, before `/trips/:tripId`), and a "Travel helpers" `.card.stack` on the trip Overview tab. It holds a heading, the line "Tokyo trip, {dates}. Plan your budget and your packing." and two `.btn.btn-secondary` links "Currency helper" and "Weather helper". It replaces the placeholder `<p>Trip overview is shown on its own page.</p>` in `TripDetailPage.tsx`; no test asserts that placeholder text. The prototype's "Trip starts In 7 days / In 4 months" chips are demo controls and are NOT built.
    files:
      - apps/web/src/App.tsx
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/TravelHelpersCard.tsx
    rationale: |
      Gives the traveller a way to open both helpers (every AC says "opens the currency/weather helper for the trip").
  - description: |
      Tests written first (TDD order; see `tests`). API unit tests use FastAPI `TestClient` with `app.dependency_overrides` for `get_rates`, `get_forecast`, `get_today`, `get_last_known_rates`, following `tests/unit/test_account_router.py`. Web unit tests use vitest with the `test-api.tsx` helpers. One Playwright spec covers the core flow in local mode.
    files:
      - services/api/tests/unit/test_trip_helpers_router.py
      - services/api/tests/unit/test_forecast_window.py
      - services/api/tests/unit/test_destination_info.py
      - services/api/tests/unit/test_last_known_rates.py
      - apps/web/src/trips/helperFormat.test.ts
      - apps/web/src/trips/CurrencyHelperPage.test.tsx
      - apps/web/src/trips/WeatherHelperPage.test.tsx
      - apps/web/e2e/travel-helpers.spec.ts
    rationale: |
      One failing test per acceptance criterion before any production code.

tests:
  - |
    AC1, API. A JPY destination reports JPY (file services/api/tests/unit/test_trip_helpers_router.py).
    ```python
    def test_destination_currency_is_jpy(client, tokyo_trip):
        body = client.get(f"/trips/{tokyo_trip}/currency-helper").json()
        assert body["destination_currency"] == "JPY"
    ```
  - |
    AC2, API. Home EUR and destination JPY gives the live rate (a rate source stub returns 0.0061 for JPY to EUR).
    ```python
    assert body["home_currency"] == "EUR"
    assert body["live"]["rate"] == "0.0061"
    assert body["live"]["inverse"] == "163.93"
    ```
  - |
    AC3 and AC4, web (helperFormat.test.ts and CurrencyHelperPage.test.tsx). The rate is 0.0061 EUR per JPY.
    ```ts
    expect(convertAmount(1000, 0.0061, 'toHome')).toBeCloseTo(6.1)
    expect(convertAmount(6.1, 0.0061, 'toDestination')).toBeCloseTo(1000)
    // page: type '1,000' in "Amount in JPY"
    await user.type(screen.getByLabelText('Amount in JPY'), '1,000')
    expect(await screen.findByText('JPY 1,000 = EUR 6.10')).toBeInTheDocument()
    // type '6.10' in "Amount in EUR" and the JPY field shows 1,000
    expect(screen.getByLabelText('Amount in JPY')).toHaveValue('1,000')
    ```
  - |
    AC5, API (typical weather for the trip month; a trip 14 Mar to 20 Mar 2027).
    ```python
    body = client.get(f"/trips/{march_trip}/weather-helper").json()
    assert body["typical"]["month"] == 3
    ```
    Web: `expect(await screen.findByRole('heading', { name: 'Typical weather for March' })).toBeInTheDocument()`
  - |
    AC6 and AC7, unit tests for the pure rule (test_forecast_window.py) and the router. Today is 2026-10-27, so day 14 is 2026-11-10.
    ```python
    assert forecast_dates(date(2026, 11, 3), date(2026, 11, 9), TODAY) == (date(2026, 11, 3), date(2026, 11, 9))
    assert forecast_dates(date(2026, 11, 10), date(2026, 11, 12), TODAY) is not None   # exactly 14 days
    assert forecast_dates(date(2026, 11, 11), date(2026, 11, 12), TODAY) is None       # 15 days
    # router
    assert body["forecast"]["status"] == "available" and len(body["forecast"]["days"]) == 7   # trip 3 to 9 Nov
    assert body["forecast"] is None                                                           # trip 14 Mar 2027
    ```
    Web: `expect(screen.queryByRole('heading', { name: 'Forecast for trip dates' })).not.toBeInTheDocument()` for the far trip.
  - |
    AC8, API and web. A rate source whose `rate` raises `RateUnavailable` and no remembered rate.
    ```python
    assert body["live"] is None and body["last_known"] is None
    ```
    ```ts
    expect(await screen.findByRole('alert')).toHaveTextContent('The live rate is unavailable right now.')
    ```
  - |
    AC9, API and web (test_last_known_rates.py). A good call first, then a failing one with the clock moved on.
    ```python
    assert body["live"] is None
    assert body["last_known"] == {"rate": "0.0061", "as_of": "2026-10-14"}
    ```
    ```ts
    expect(await screen.findByText('Last known rate: JPY 1 = EUR 0.0061, dated 14 Oct 2026')).toBeInTheDocument()
    ```
  - |
    AC10, API and web. A forecast source raising `ForecastUnavailable` for a trip within 14 days.
    ```python
    assert body["forecast"] == {"status": "unavailable", "days": []}
    ```
    ```ts
    expect(await screen.findByRole('alert')).toHaveTextContent('The forecast is unavailable right now.')
    ```
  - |
    AC11, API and web. When the forecast is unavailable, typical weather is still returned and shown, labelled with its date.
    ```python
    assert body["typical"]["month"] == 11 and body["typical"]["as_of"] == "2026-10-01"
    ```
    ```ts
    expect(screen.getByRole('heading', { name: /Typical weather for November, dated 1 Oct 2026/ })).toBeInTheDocument()
    ```
  - |
    AC12, web (helperFormat.test.ts). Dates use the browser locale, checked with the locale pinned. Both pages render `formatTripDates(trip.start_date, trip.end_date)`.
    ```ts
    expect(formatTripDates('2026-11-03', '2026-11-09')).toBe(
      `${new Date('2026-11-03T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date('2026-11-09T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    )
    ```
    Component tests assert that both pages show that string, and that the "dated ..." labels use the same formatter.
  - |
    AC13, web (helperFormat.test.ts).
    ```ts
    expect(formatMoney(1000, 'JPY')).toBe('JPY 1,000')
    expect(formatMoney(6.1, 'EUR')).toBe('EUR 6.10')
    expect(formatRate(0.0061, 'JPY', 'EUR')).toBe('JPY 1 = EUR 0.0061')
    ```
    The component test asserts the converter result and rate line use this format, and that the page never shows the number-then-code form (`1,000 JPY`).
  - |
    Access and entry points. A non-owner gets the same response as the other owner-only trip routes, and the Overview tab links to both helpers.
    ```python
    assert client_other_user.get(f"/trips/{tokyo_trip}/currency-helper").status_code == 404
    ```
    ```ts
    expect(screen.getByRole('link', { name: 'Currency helper' })).toHaveAttribute('href', `/trips/${id}/currency`)
    ```
  - |
    Playwright (travel-helpers.spec.ts, local mode). A seeded Tokyo trip opens the currency helper, which shows the JPY and EUR rate card and a working converter. The weather helper shows typical weather for the trip month, and a forecast card only for a trip within 14 days.

assumptions_or_open_questions:
  - |
    Home currency source. The Profile has no home-currency field today. The plan uses the trip's `currency` (chosen at New trip set-up, default EUR) as the traveller's home currency, so no stored data changes. If the reviewer wants a separate profile home-currency setting, that adds a Profile field and a Profile UI change, which is a larger scope.
  - |
    The "live" rate has no real provider yet. Production `_rates()` is an `InMemoryRates` seed with only USD to EUR, and local mode uses the fixed `LocalRates` table. The plan calls both "live" through the `RateSource` port and records `as_of` as the time of the call. A real adapter later signals failure by raising `RateUnavailable`. Pairs missing from the seed give `live=None` with no last known rate.
  - |
    Last known rate storage is in memory per API instance (`LastKnownRates`), so it resets on a Lambda cold start. Persisting it would mean new Trip Database items, which is out of scope here. The AC only needs it when one exists.
  - |
    Destination currency and typical weather come from a small seeded table (destinations in `travel/local.py` PLACES), because the codebase has no destination metadata or climate source. A destination missing from the table gives `destination_currency=null` and `typical=null`, and the pages show a short "We don't have currency/weather guidance for this destination yet." message.
  - |
    A trip spanning two months uses the start month for the typical weather. A trip with no dates shows typical weather only if a month can be derived, otherwise it shows a "Add dates to see weather guidance" message and no forecast.
  - |
    Forecast range: "within 14 days" means the start date is on or before today + 14 days. The table shows only the days of the trip inside today to today + 14. A trip already under way is in range until its end date. An ended trip shows no forecast.
  - |
    The prototype's demo chips "In 7 days / In 4 months" and the fixture are prototype-only and are not built. Prototype numbers (163.93 inverse, 90 mm rain) are seed values, not requirements. There is no conflict between the prototype and the ACs.
  - |
    Converter inputs accept digits with optional thousands separators and a decimal point (per the prototype hint "Enter numbers only, for example 2,500"). Unparseable text shows "Enter an amount to convert." as in the prototype.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout

  None — read-only routes and UI over seeded in-code data. No schema, stored-data shape, migration, env var or setting changes. The last-known rate is held in process memory only, and the home currency is read from the existing `Trip.currency`. Roll back by reverting the commit.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    App[App.tsx routes]:::touched --> CHP[CurrencyHelperPage.tsx]:::touched
    App --> WHP[WeatherHelperPage.tsx]:::touched
    TDP[TripDetailPage.tsx Overview tab]:::touched --> THC[TravelHelpersCard.tsx]:::touched
    THC -->|links| App
    CHP --> HA[helpersApi.ts]:::touched
    WHP --> HA
    CHP --> HF[helperFormat.ts]:::touched
    WHP --> HF
    HA -->|call| API[trips/api.ts call]
    HA -->|GET /trips/id/currency-helper, weather-helper| TH[routers/trip_helpers.py]:::touched
    Main[main.py include_router]:::touched --> TH
    TH --> Deps[routers/deps.py get_rates, get_forecast, get_today]:::touched
    TH --> Rates[trips/rates.py RateSource, LastKnownRates]:::touched
    TH --> DI[trips/destination_info.py]:::touched
    TH --> FC[trips/forecast.py]:::touched
    TH --> Store[trips/store.py Trip, TripStore via get_trips]
    Deps --> Rates
    Deps --> FC
  ```

  Notes on the design:
  - The 14-day rule and the fallbacks live only in the API, so the web pages render the API's `forecast` value (null, available or unavailable) and `live` / `last_known` and contain no date arithmetic. That keeps AC6/7/10/11 testable with an injected `get_today`.
  - The new router mirrors `/trips/{id}/requirements` for owner-only access. It is a separate file because `routers/trips.py` is already large.
  - The existing `/rates/convert` route and `convertApi.ts` serve trip-cost conversion (Trip itinerary epic) and are not modified. The helper's converter runs client-side at the returned rate, so typing needs no round trip, which matches the prototype.
  - Stack: the API is Python/FastAPI tested with pytest + httpx, and the Web App is React + Vite + Tailwind-era classes already in `index.css` (the project uses the prototype's utility classes), tested with vitest and Playwright. No new packages.
  - Implementation order: pure functions first (`forecast_dates`, `formatMoney`, `convertAmount`), then router tests, then the pages.

review_focus: |
  IN scope: the two owner-only read routes, the seeded destination currency and climate, the forecast and rate failure fallbacks, the two pages and the Overview entry card. OUT: trip-cost conversion, any real rates or weather provider, persisting last-known rates, and a profile home-currency setting. Riskiest parts are the 14-day boundary (day 14 in, day 15 out, trips already under way) and the failure branches (live and last known, forecast and typical). The deliberate choices to check are that home currency is `Trip.currency`, that `formatMoney` is a new code-first formatter because the existing `formatConverted` puts the code after the number, and that the forecast table stays a scrollable table as in the prototype.
