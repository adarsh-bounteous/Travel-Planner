# Agent prompts: integrations and AI features

Run these prompts one at a time and in order. Each one builds on the ones before it. Paste the
whole prompt file into the coding agent, on a new branch, and review and merge before you start the
next. Every prompt tells the agent to read [RULES.md](RULES.md) first.

Already done (no prompt needed): the earlier blocker fixes (stories 087, 088, 089, 092), one
destination format across features (090, 091, 101) and the v2 design refresh (103–107).

Run in this order. The `a`, `b` and `c` prompts are the new ones from your latest bug and
enhancement list; they don't depend on any outside service, so they come first.

| Order | Prompt | Builds | Needs from you before you run it |
| --- | --- | --- | --- |
| 1 | [00a-bug-fixes.md](00a-bug-fixes.md) | Fixes: starter destinations error, empty insurance compare, restaurants missing from the trip summary and stuck on Unscheduled | Nothing |
| 2 | [00b-itinerary-document.md](00b-itinerary-document.md) | A finished itinerary document: day by day, bookings, inclusions and exclusions, costs, essentials, printable as PDF | Nothing |
| 3 | [00c-ui-motion-and-imagery.md](00c-ui-motion-and-imagery.md) | Brand and logo, local illustrations, one icon set, page transitions and micro-animations, per-trip accent themes | Nothing |
| 4 | [01-integration-groundwork.md](01-integration-groundwork.md) | Shared HTTP client, caching, retries, keys, recorded responses, provider status, local opt-in | Nothing |
| 5 | [02-places-geocoding.md](02-places-geocoding.md) | Real places search and destination lookup, and real photos where licences allow | Choose a places provider and get an API key |
| 6 | [03-reference-data.md](03-reference-data.md) | Real exchange rates, weather and visa rules | Choose the rates and visa providers (weather can use Open-Meteo, no key) |
| 7 | [03b-visa-application-help.md](03b-visa-application-help.md) | "Apply for your visa": official link, document checklist, latest safe date to apply, progress tracking | Nothing new |
| 8 | [04-ai-recommendations.md](04-ai-recommendations.md) | Claude-ranked, personalised recommendations from real places | Anthropic API key and a monthly budget |
| 9 | [05-ai-comparison.md](05-ai-comparison.md) | "Why this one" summaries and trade-off comparisons on shortlists | Nothing new |
| 10 | [06-web-search-grounding.md](06-web-search-grounding.md) | Web-sourced facts with citations (advisories, opening hours, SIM deals, events) | Decide the allowed domains |
| 11 | [07-vendor-inventory.md](07-vendor-inventory.md) | Real flights, stays, activities, restaurants, SIMs and insurance searches | Partner access for each provider (run once per provider) |
| 12 | [08-conversational-planner.md](08-conversational-planner.md) | Chat planner that uses the app's own actions as tools | Nothing new |
| 13 | [09-price-tracking.md](09-price-tracking.md) | Price and availability tracking with email alerts | Nothing new |
| 14 | [10-booking-checkout.md](10-booking-checkout.md) | Real booking and payment for one vertical | Payment provider account, legal and security sign-off |

Tips:
- Prompts 02, 03, 07 and 10 leave `<PROVIDER>` placeholders. Fill them in before you paste.
- Prompts 07 and 10 are big. Run 07 once per provider, starting with the one you already have access to.
- After each AI prompt (04, 05, 06 and 08), keep the eval script it adds and re-run it whenever the
  prompt, model or provider changes.
- The itinerary document (00b) picks up richer data automatically as later prompts land: real
  prices, visa progress (03b), AI summaries, and booked status (10). Re-open it after each one.
- 00c uses local illustrations on purpose. Real photos arrive with prompt 02.
