# 02c Live destination search, everywhere a destination is chosen

Read `docs/agent-prompts/RULES.md` first. Run after 02 (stories 125–134: integration client, Nominatim
resolver, OSM places, local opt-in) and after PR #122 (the Nominatim places backup and the integration
cache fix). Do it on its own branch.

## Problem
Wherever a traveller picks a destination, the app only knows a fixed list: `STARTER_DESTINATIONS`
(`app/trips/starter_destinations.py`), 21 places in 7 countries, served by `GET /starter-destinations`.
Typing "Agra" in the new-trip picker finds nothing, even though OSM search (`/places`) works for any city.
The same list also gates trip saving and the guidance pages, so the fix is wider than one dropdown.

## Goal
A traveller can search any city or town in the world by keyword, anywhere a destination is chosen, and
get a trip that works. The 21 starter places keep every feature they have today. Other places get the
features that can work for them, and clear "limited data" messages for the rest. Never an error, a blank
page or "no places match" for a real place.

## Where destinations are chosen or validated (find them all, don't trust this list)
Web: `trips/DestinationPicker.tsx` (used by `NewTripSetupPage.tsx` and `TripSettingsDrawer.tsx`),
`places/destinationMatch.ts`, `places/StarterPlannerPage.tsx` ("Choose from starter destinations"),
`places/starterApi.ts`, `places/DestinationResultsPage.tsx` (also reads the starter list to gate a trip),
`explore/ExplorePage.tsx` (Change destination), `trips/AddActivityDrawer.tsx`, `trips/DestinationGate.tsx`,
and every page that shows a gate: Recommendations, Activities, Restaurants, SIM, Visa, Medical.
API: `routers/starter_destinations.py`, `trips/destination.py` (`DestinationStatus`, `country_has_any_place`),
`trips/destination_match.py` (`best_match`), `trips/destination_conversion.py`, the `INVALID_PLACE` check
and the destination edit/rematch logic in `routers/trips.py`. Grep for `STARTER_DESTINATIONS`,
`places_in`, `best_match` and `fetchStarterDestinations` and handle every hit.

## Decisions already made
- **Source**: the existing Nominatim resolver through the integration client (cache, rate limit of 1 per
  second, circuit breaker, descriptive User-Agent). No new provider. Honour `LOCAL_LIVE_PROVIDERS=places`:
  with it off, search only the starter list, exactly as today.
- **Starter places stay first** and are marked "Full guide" in results. The starter data, content and
  tests don't change.
- **Stored format stays `Place, Country`** with `country` and `place` fields (stories 090, 091, 101). A
  live result is normalised to a canonical English country name and place name, plus the resolved
  location (coordinates, ISO code, time zone) already stored on the trip by story 132. Don't invent a
  second format.
- **Country names must match the rest of the app** (visa rules, medical guidance, rates and insurance key
  on country names). Map the ISO code to the app's existing country names; where there is no match, keep
  the resolved name and treat the country as "no data" rather than guessing.
- No outside call from the browser. All lookups go through the API.

## Build
1. **API: destination search.** `GET /destinations/search?q=` (signed-in, like `/starter-destinations`):
   - Matches the starter catalogue first (accent-insensitive, same folding as `fold`), then live
     Nominatim results for places (city, town, village; not streets or shops). Returns at most 10:
     `{country, place, label, region?, source: "starter" | "osm", has_full_guide: bool, lat, lng}`.
   - Minimum 2 characters, 300 ms debounce on the client, a result cache of 24 hours per normalised
     query, and a `source`/`as_of` note when it fell back. Nominatim failing returns the starter matches
     with `degraded: true`, never a 500.
   - Add `/destinations` to `API_PREFIXES` in `apps/web/src/devProxy.ts` and make sure the guard test
     from prompt 00a covers it.
2. **API: accept any resolved place.** Relax the `INVALID_PLACE` and rematch logic so a trip can hold a
   `country`/`place` that is not in the starter list, but only when it came from the search endpoint
   (verify server-side by resolving it again or by a signed token from the search response; free typed
   text is still rejected or kept as the old unmatched-destination flag). Keep the existing
   `destination_unmatched` behaviour for old trips. `best_match` also consults the cache of resolved
   places so reopening an old trip rematches.
3. **API: statuses.** Extend `DestinationStatus` use so a non-starter place gets `no_country_data` or
   `no_place_data` only where a feature truly has no data. Per feature, decide and test:
   visa (country-level rules; many countries already covered), medical, SIM, insurance, rates and weather
   (country or coordinates, so they work), recommendations and places (OSM, works), activities and
   restaurants (OSM or "limited data"), stays, flights and transport (by name or coordinates).
4. **Web: one shared destination picker.** Rebuild `DestinationPicker` as a combobox (ARIA 1.2: input
   `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, listbox with options,
   arrow/Enter/Escape support) with type-ahead calling the new endpoint. Keep the existing Country and Place
   selects for starter browsing, and keep every existing label, id, test id and class so current tests
   still pass. Show loading, "No place found. Try another spelling", and a degraded note.
   Reuse it in new trip, trip settings, the starter planner, Explore's Change destination and the home
   search so all entry points behave the same.
5. **Web: limited-data states.** Where `DestinationGate` shows `no_country_data` or `no_place_data`,
   say what is missing and what still works ("Visa rules for X aren't in our guide yet. Check the official
   site." plus the link, never a dead end), and show the OSM-powered sections that do have data. Never
   show a starter-only message such as "Pick a place from the starter list" for a live place.
6. **Itinerary and trip pages** (00b): a non-starter destination renders fully, with "Not yet planned" for
   what has no data.
7. **Local mode**: with `LOCAL_LIVE_PROVIDERS` not containing `places`, nothing goes outside and the
   picker works only on the starter list; say so in a hint ("Showing starter destinations. Turn on live
   places to search anywhere") and on the Local mode page.

## Tests
- API: search ranking (starter first, then live), accent and case folding, 1-character and empty
  queries, Nominatim down (degraded, starter matches only), duplicate and ambiguous names (two Portos:
  show the region), a non-place hit (a street) filtered out, rate limit and cache respected, local mode
  off. Trip create and edit with a live place, with a tampered place, and with an old unmatched trip.
  Per-feature status for a live place. Use recorded responses for Agra, Porto, Springfield (ambiguous)
  and a village. No test calls the network.
- Web: combobox keyboard and screen-reader behaviour, debounce, loading and empty and degraded states,
  choosing a live result sets the Country and Place fields and the stored `Place, Country`, and the
  starter flow is unchanged.
- E2E: create a trip to "Agra" by typing, then open Recommendations, Visa and the Itinerary and see a
  sensible page on each (real places or a clear limited-data message, never a blank page or an error).

## Out of scope
Photos (02b), ratings, any change to starter content, real visa or rates providers (03), AI.

## Done when
With `places` opted in, typing a keyword for any city in the new-trip picker, trip settings, the starter
planner, Explore and the home search offers it, and a trip to Agra can be created and used on every trip
page without an error. With it off, behaviour is exactly as today. Every test passes, and the report lists
each file touched and each page checked, with a screenshot of Agra and Lisbon trips side by side.
