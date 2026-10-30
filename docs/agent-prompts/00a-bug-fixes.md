# 00a Bug fixes: starter destinations, insurance compare, restaurants on the trip

Read `docs/agent-prompts/RULES.md` first. Run this one before any integration work.

## Method
For each bug: **reproduce it first** (local mode, `pnpm start`, demo account), write a failing test
that captures it, find the root cause, fix it, and show the test passing. Don't fix by guessing.
Report the root cause of each one in a sentence.

## Bug 1: "We couldn't load the starter destinations"
**Symptom:** the "Choose from starter destinations" option shows
"We couldn't load the starter destinations." and the feature doesn't work.

**Lead (verify it):** `/starter-destinations` is not in `API_PREFIXES` in
`apps/web/src/devProxy.ts`, so the dev server answers the request with `index.html` instead of
forwarding it to the API. This is the same kind of fault as the earlier `/rates` bug (story 088).
The page is `apps/web/src/places/StarterPlannerPage.tsx`, its API calls are in `starterApi.ts`, and
the router is `services/api/app/routers/starter_destinations.py`.

**Fix and prevent a repeat:** add the missing prefix, and add a guard test in
`devProxy.test.ts` that scans the web app's API client modules for every path they call and fails
if the first path segment is not in `API_PREFIXES`. Also check that the production routing (CDN or
gateway config in the repo, if any) forwards the same prefixes, and report if it doesn't.
Check the whole starter flow works after the fix: country list, place list, the content page
(`/trips/plan/:country/:place`), and "Back to trip".

## Bug 2: Compare insurance plans shows nothing
**Symptom:** opening Compare on the insurance options page returns nothing.

**Leads (verify; don't assume):**
- `InsuranceComparePage.tsx` redirects back to the shortlist when fewer than 2 plans come back
  (`result.plans.length < 2`), so a trip that yields 0 or 1 plan looks like "nothing happens".
- `gather_insurance` (`services/api/app/insurance/options.py`) may return few or no plans when
  traveller details are missing (owner age, companion ages, risky activities, destination country).
  Story 092 added the inputs; check the Compare entry point and the plans for trips with and
  without those details.
- The Compare button may be enabled when it shouldn't be, or the page may not use the plans the
  shortlist page shows.

**Fix:** the Compare button should be enabled only when at least 2 plans exist, say why when it
isn't ("Add traveller details to see more plans"), and the compare page should never silently
bounce: show an empty state with the reason and a link to fix it. Test with 0, 1, 2 and 3 plans,
and with a missing age.

## Bug 3: Restaurants added to a trip don't show on the trip summary, and the itinerary says "Unscheduled"
**Symptom:** after adding restaurants, nothing appears under restaurants on the trip summary page
(the Overview tab), and the itinerary still shows "Unscheduled".

**Context:**
- Picks are stored in `trip.restaurants`. `ItineraryTab.tsx` shows a pick under its day and meal
  when it has them, and under "Unscheduled" when it has none. `RestaurantPickDialog.tsx` defaults
  the day to Unscheduled ("Leave it on Unscheduled if you haven't decided").
- The Overview tab (`TripDetailPage.tsx` and its cards) may not list restaurants at all;
  `TripTotalCard` only counts their estimates.

**Fix (decide and state the behaviour, then test it):**
1. The Overview shows a "Restaurants" section: the picks with name, day and meal when set,
   estimate with currency, and a link to the shortlist. An empty state links to add some.
2. Adding a restaurant from the shortlist asks for the day and meal when the trip has dates, with
   the day preselected sensibly (the first day with no dinner pick), so picks are scheduled by
   default. "Unscheduled" stays available but is no longer the silent default.
3. The "Unscheduled" box in the itinerary is explained (it holds picks with no day yet) and offers
   "Schedule" on each pick.
4. Check the shared (read-only) trip view shows the same restaurants.

## Done when
All three are reproduced by failing tests, fixed, and those tests pass with the whole suite
(`RULES.md` Workflow section).
