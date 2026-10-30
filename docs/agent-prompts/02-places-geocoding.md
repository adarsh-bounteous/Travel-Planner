# 02 Real places and geocoding

Read `docs/agent-prompts/RULES.md` first. This builds on prompt 01's integration layer.

**Provider:** `<PROVIDER>`, for example Google Places API, Foursquare Places, or OpenStreetMap
(Nominatim for geocoding and Overpass for points of interest). Check the provider's current terms
for caching, attribution and rate limits before you build, and follow them.

## Goal
Replace seed places with real ones, and resolve a destination (country plus place) to real
coordinates. Later prompts depend on both: AI recommendations rank real candidates, and vendor
searches need coordinates.

## Context
- `app/places/search.py` defines `Place` and the `PlaceSearch` port. `app/places/local_search.py`
  is the local stand-in. `GET /places` serves it.
- Trips store a chosen `country` and `place` (stories 090, 091 and 101). Features read those
  instead of free text.
- Saved places validate images in `app/routers/saved_places.py` (`_safe_image_url`).

## Build
1. **Destination resolver** port and adapter: country plus place to the canonical name,
   ISO country code, coordinates, time zone and bounding box. Cache the results for a long time.
   Use it when a trip's destination is set, and store the result on the trip (add fields if
   needed, with a migration for existing trips like story 101).
2. **`PlaceSearch` adapter** for `<PROVIDER>`: search by resolved destination and by category
   (sights, food, museums, viewpoints, nightlife), mapped to the existing `Place` model and
   categories. Include rating, price level, address, coordinates, opening hours where available,
   the provider id and a provider URL.
3. **Images**: show the provider's image only if its terms allow it. Proxy it through the API or
   use the provider's allowed URL pattern, and keep `_safe_image_url` rules (https only). Otherwise
   use the existing local placeholder.
4. **Attribution**: show the provider's required attribution wherever its data is shown.
5. **Fallback**: on failure or no key, fall back to the seed catalogue with `source` and `as_of`
   set, and show the notice from prompt 01.
6. **Map** (`PlacesMap`): if the map uses tiles from outside, make sure it is allowed in local mode
   only when opted in.

## Tests
Contract tests against the in-memory adapter. Recorded responses for Lisbon, Kyoto, Paris and a
city that has never been seeded. Error, timeout and empty-result cases. A migration test for
existing trips.

## Done when
- With the provider opted in, `/explore` and the Recommendations tab show real places for any city.
- With it off, everything works exactly as today.
- Every test passes.
