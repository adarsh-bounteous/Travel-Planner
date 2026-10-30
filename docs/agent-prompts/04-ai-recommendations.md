# 04 AI recommendations

Read `docs/agent-prompts/RULES.md` first, especially the Claude section. This builds on prompts 01–03.

## Goal
Make the Recommendations tab (and the matching suggestions on Explore) truly personal. Claude ranks
**real candidate places** from prompt 02 against the traveller's profile and trip, and explains
each pick in one line. It must never invent a place.

## Context
- Port: `RecommendationSource` in `app/trips/recommendations.py`
  (`for_destination(destination) -> list[Recommendation]`). Today it is a seeded catalogue keyed by
  city. It is wired in `deps.py` (`get_recommendations`).
- The profile holds citizenship, residence, health status, religion, diet, tastes and travel style
  (`app/trips/profile_store.py`). The trip has dates, budget, currency, travellers and the resolved
  destination.
- UI: `apps/web/src/trips/TripRecommendationsTab.tsx`, `RecommendationImage.tsx`, and saving via
  the saved-places flow.

## Build
1. **Port change**: widen the port so a source can receive context, for example
   `recommend(trip, profile, limit) -> RecommendationSet`. Keep the in-memory adapters working
   through the new signature. A `RecommendationSet` holds the items plus `source`, `as_of` and,
   for AI, `model`.
2. **Claude adapter** (`ClaudeRecommendations`):
   - Fetch about 30–60 candidates from `PlaceSearch` for the destination and the profile's tastes.
   - Send Claude only what it needs: the candidates (id, name, category, rating, price level,
     short description, distance), the trip dates and budget band, travel style, tastes, diet and
     party size. **Don't send names, emails, citizenship or health details** unless a rule needs
     them; diet and accessibility needs are fine.
   - Structured output (Pydantic): a list of `{candidate_id, rank, reason (≤ 160 chars),
     matched_tastes[], best_time (optional), budget_fit}`.
   - **Validate**: drop any `candidate_id` not in the candidate list, remove duplicates, and keep
     at most `limit`. If fewer than 3 valid items remain, fall back to a fixed ranking (rating
     plus taste match).
   - Cache the result per (trip, profile version, candidate set hash) for 24 hours. Recompute when
     the trip or profile changes.
   - A system prompt in its own file (for example `app/ai/prompts/recommendations.md`), cached.
3. **Fallback chain**: Claude, then the fixed ranking over real candidates, then the seed
   catalogue. The UI shows which one was used ("Picked for you" vs "Popular places").
4. **UI**: show the reason line and the matched tastes as chips on each card, plus an
   "AI-suggested" label with a short "Why am I seeing this?" explanation. Add a "Not for me" action
   that hides the item and is stored, so later runs exclude it. Keep Save and Add to trip as they
   are.
5. **Limits**: per-user daily cap on AI recommendation runs, a timeout, and logged token usage and
   cost.

## Eval (required)
Add `services/api/evals/recommendations/`:
- 15–25 golden cases (profile plus trip plus a recorded candidate set), each with checks: no
  invented ids; diet respected (no steakhouse for a vegan); budget respected; at least N picks
  match stated tastes; reasons mention real attributes. Include tricky cases (conflicting tastes,
  very low budget, kids, accessibility).
- A script that runs them against the real model (opt-in, costs money) or the recorded responses
  (default, free), and prints a score per check.
- Record the baseline score in the report.

## Tests
Unit tests with the fake LLM client: validation drops unknown ids, the fallback order, caching,
the budget cap, and refusal and `max_tokens` handling. UI tests for the new states.

## Done when
- With `llm` and the places provider opted in, a trip shows ranked picks with reasons that match
  the profile.
- With them off, the tab works as today.
- The eval baseline is recorded and every test passes.
