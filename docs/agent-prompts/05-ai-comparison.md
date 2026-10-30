# 05 AI comparison and explanations

Read `docs/agent-prompts/RULES.md` first, especially the Claude section. This builds on prompt 04
(reuse its Claude client, fake client, caching, budget and eval harness).

## Goal
On every shortlist and comparison, give the traveller a short, accurate explanation: why the top
option ranks first, and what they trade off by picking another. **The existing fixed ranking stays
the source of truth.** Claude explains it; it doesn't silently replace it.

## Context
Shortlists and comparisons exist for:
- stays: `app/stays/`, `StayShortlistPage.tsx`, `StayComparison.tsx`
- flights and transport: `app/flights/shortlist.py`, `FlightShortlistPage.tsx`, `TransportTab.tsx`
- restaurants: `app/dining/shortlist.py`, `RestaurantCompare.tsx`
- insurance: `app/insurance/`, `InsuranceComparePage.tsx`
- SIMs: `app/sims/`, `SimOptionsPage.tsx`

Each already computes a rank from price, preference fit and offers (or the equivalent).

## Build
1. **One shared explainer service** (for example `app/ai/compare.py`). Input: the options with
   their computed facts (prices with currency, distances, durations, cancellation, coverage,
   preference fit, rank), the trip context and the traveller's stated preferences. Output
   (structured): `{summary (≤ 2 sentences), per_option: [{option_id, headline, pros[], cons[]}],
   trade_offs: [{from_id, to_id, text}], caveats[]}`.
2. **Grounding check**: every number or fact in the output must come from the input. Add a
   validator that extracts numbers, currencies and option ids from the text and rejects or
   regenerates output that cites values not in the input (one retry, then fall back to a
   template-based explanation built from the facts).
3. **Endpoints**: one `GET .../explanation` per comparison (or a single generic one), cached per
   option-set hash. It is computed on demand when the user opens the comparison, not on every list
   load.
4. **UI**: a collapsible "Why this order?" panel above each shortlist, plus pros and cons on each
   card in the comparison view. Label it as AI-written and show the fixed ranking factors next to
   it. On error or when disabled, hide the panel; the page works as today.
5. **Optional, behind a setting** (`AI_RERANK=false` by default): let Claude re-rank within the
   top N only when the user states a priority in free text ("closest to the old town",
   "quietest"). Store the user's text with the shortlist, and show "Re-ordered for: …" with a way
   to go back to the standard ranking.

## Eval (required)
Add `services/api/evals/compare/` with golden option sets for each vertical. Checks: no invented
numbers; the stated top option matches the fixed rank (unless re-rank is on); cons are real (a
non-refundable option is called non-refundable); currency is always present; length limits hold.
Record the baseline.

## Tests
Grounding validator unit tests (good, invented number, wrong currency, unknown id), the fallback
template, caching, and the UI states.

## Done when
- Each comparison shows a correct explanation with live Claude when opted in, and the template
  version otherwise.
- The eval baseline is recorded and every test passes.
