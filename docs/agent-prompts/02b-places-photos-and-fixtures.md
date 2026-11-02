# 02b Place photos, recorded fixtures and old-trip backfill

Read `docs/agent-prompts/RULES.md` first. Run after 02 (stories 125–134 already built the OpenStreetMap
resolver, `OsmPlaceSearch`, fallback notice, opt-in and map tiles). This closes what prompt 02 left open.

## Goal
Real places currently all show the local placeholder image, the recorded-response folder is empty, and
trips saved before destination resolving existed stay unresolved. Fix those three, nothing else.

## Build
1. **Photos from open sources.** OSM has no photos. For each place, use its `wikimedia_commons` or
   `wikidata` tag to look up one image on Wikimedia Commons (Commons API, no key). Use the thumbnail
   URL (https only, passes `_safe_image_url`), and keep the author, licence and file page link. Show
   "Photo: author, licence" wherever the photo shows (extend `PlacesSourceNote.tsx`). Skip any image
   whose licence is not on a fixed allow-list (CC0, CC BY, CC BY-SA, public domain). No tag or no
   allowed image: keep the placeholder and the local illustrations from 00c. Go through the
   integration client (cache for days, retries, rate limit, circuit breaker, a descriptive
   User-Agent), and add `commons` to the provider registry so `LOCAL_LIVE_PROVIDERS` controls it.
   Look up at most N places per request, in one batched call, so a results page never waits on 30
   lookups; the rest fill in on later requests from the cache.
2. **Recorded fixtures.** Record, scrub and commit responses (using the existing
   `tests/unit/integrations_support/recorded.py`) for Nominatim and Overpass for Lisbon, Kyoto and
   Paris, and one city that is not in the seed data (for example Porto). Add tests that run
   `NominatimResolver` and `OsmPlaceSearch` against them, plus error, timeout and empty-result cases.
   Do the recording by hand, once, with the provider opted in; tests must never call out.
3. **Backfill old trips.** Trips saved before story 132 load fine but have no location. Add a
   resolve-on-open step: when a trip with a country and place has no location, resolve it once (only
   if the provider is on or the resolver is cached) and store it. Never block the page on it, never
   change the trip's visible destination, and cover it with a test using the pre-field trip from
   `test_trip_saved_before_location_existed_loads_unchanged`.

## Out of scope
Ratings and price levels (OSM has neither; that needs a different provider). Any change to the
destination format, the API client files or the devProxy.

## Done when
With `places`, `nominatim` and `commons` opted in, `/explore` for a city never seeded shows real
places, with photos where Commons has one and attribution under each. With them off, everything works
as today. Recorded-fixture tests and the backfill test pass, and no test touches the network.
