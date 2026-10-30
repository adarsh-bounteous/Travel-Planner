# 03 Real reference data: exchange rates, weather, visa rules

Read `docs/agent-prompts/RULES.md` first. This builds on prompts 01 and 02.

**Providers:**
- Rates: `<RATES_PROVIDER>`, for example ECB reference rates (free, daily) or a commercial rates
  API.
- Weather: Open-Meteo (forecast plus climate, no key) unless you name another.
- Visa: `<VISA_PROVIDER>`, a visa-requirements data API. If none is available yet, build the
  adapter against a recorded sample and leave the provider unconfigured.

## Goal
Make the trip helpers (currency, weather, visa, requirements) use real data, with the seed data as
the fallback, and show how fresh the data is.

## Context
- Rates: `app/trips/rates.py` (`RateSource`, `LOCAL_RATES_PER_EUR`) and
  `tests/unit/test_last_known_rates.py`. The web app's `OFFERED_CURRENCIES` in
  `apps/web/src/trips/convertApi.ts` must match the supported currencies.
- Weather: `app/trips/forecast.py` (`ForecastSource`) and the typical climate in
  `app/trips/destination_info.py`.
- Visa: `app/trips/visa.py` (`VisaRuleSource`, `SEED_VISA_RULES`), the Visa requirements, Trip
  requirements and Medical guidance pages.

## Build
1. **Rates adapter**: daily rates cached for 24 hours. Keep the "last known rates" behaviour when
   the source is down. Extend the supported currencies from the source, and keep the web list in
   step with them (serve the list from the API rather than hard-coding it, if that's simple).
2. **Weather adapter**: a forecast when the trip is inside the forecast window, and typical
   weather from climate data otherwise. Use the resolved coordinates from prompt 02. Keep the
   existing `as_of` dating.
3. **Visa adapter**: map the provider's answer to the existing visa verdicts. Always show the
   source, the date checked, and a "check with the official embassy site" link. Never present
   visa data as legal advice.
4. Each adapter registers with the provider status from prompt 01, falls back to seed data, and
   marks `source` and `as_of`.

## Tests
Contract tests for each port. Recorded responses. Stale-cache and outage behaviour. A currency the
source doesn't support. A trip outside the forecast window. A passport and destination pair with
no data.

## Done when
- With the providers opted in, the helpers show live data with a date.
- With them off, the app behaves as today.
- Every test passes.
