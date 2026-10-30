# 07 Real vendor inventory search

Read `docs/agent-prompts/RULES.md` first. This builds on prompts 01–03 (and 05, whose explanations
should work on the new data unchanged).

Run this prompt **once per provider**. Fill in:
- **Vertical:** `<VERTICAL>`: one of flights, stays, transport, activities, restaurants, SIMs,
  insurance.
- **Provider:** `<PROVIDER>`, for example flights: Duffel or Amadeus; stays: Booking.com Demand
  API, Expedia Rapid or Hotelbeds; activities: Viator or GetYourGuide; restaurants: Yelp Fusion or
  Google Places; SIMs: Airalo partner API; insurance: an insurer's partner API. Confirm you have
  access and that the terms allow search and display in this app before you start.
- **Sandbox or test environment URL and docs link:** `<DOCS>`

## Goal
Search real inventory for `<VERTICAL>` through `<PROVIDER>`, merged with any other providers for
the same vertical. The existing shortlist, compare and pick flows must work unchanged on the
results.

## Context
Ports and merge logic:
- stays: `StayProvider`, `ProviderListing`, `merge_properties`, `search_stays` in
  `app/stays/options.py`
- flights: `FlightProvider` in `app/flights/options.py`
- transport: `TransportProvider` in `app/transport/options.py`
- activities: `ActivityProvider` in `app/attractions/options.py`
- restaurants: `RestaurantProvider` in `app/dining/options.py`
- SIMs: `SimProvider` in `app/sims/options.py`
- insurance: `InsuranceProvider` in `app/insurance/options.py`

The local adapters in `app/travel/local.py` generate `local://booking/...` links. Picks are stored
on the trip (`ChosenStay`, `TransportPick` and others in `app/trips/store.py`).

## Build
1. **Adapter** for `<PROVIDER>` implementing the port. Map fields fully: price with currency and
   what it covers (per night or total, taxes and fees included or not), cancellation terms,
   availability, provider id, a deep link, images if allowed, and the required attribution.
2. **Normalisation**: convert prices for ranking with the rates source from prompt 03, but always
   show the original price and currency. Mark prices as "as of <time>" and "may change".
3. **Merging and duplicates**: when several providers return the same item (same hotel, same
   flight), merge them into one item with several offers, as `merge_properties` does. Match on
   strong ids first, then on a fuzzy match of name and location, with tests.
4. **Search limits**: respect the provider's quotas with the rate limiter from prompt 01. Cache
   search results briefly (minutes) and detail lookups longer. Never cache a price longer than the
   provider allows.
5. **Picks**: storing a pick of a real offer must work. Store the provider, offer id, price,
   currency and the time it was quoted. Re-check the price before booking (prompt 10) and show the
   traveller when it has changed.
6. **Links**: deep links and affiliate links open the provider's site. Keep the local
   `/explore/travel/booking` preview for `local://` links only.
7. **UI**: show the provider name on each offer and a "Prices from N providers" note. Use the
   "source unavailable" notice from prompt 01 when a provider is down while the others still
   return results.

## Tests
Contract tests for the port. Recorded sandbox responses for a normal search, no results, a
partial outage, a currency other than the trip's, a sold-out item and a changed price.
Duplicate-merge tests. Quota (429) handling.

## Done when
- With `<PROVIDER>` opted in, search, shortlist, compare and pick work on real sandbox inventory.
- With it off, the app behaves as today.
- Every test passes.
