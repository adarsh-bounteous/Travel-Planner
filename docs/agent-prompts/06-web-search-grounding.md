# 06 Web search grounding with citations

Read `docs/agent-prompts/RULES.md` first, especially the Claude and safety sections. This builds on
prompts 04 and 05.

## Goal
Fill gaps that no structured API covers with facts from the web. Every fact carries a source link
and a date, and nothing from a web page can steer the app.

Use cases, in this order:
1. Travel advisories and entry notices for the destination (shown on Trip requirements next to the
   visa data from prompt 03).
2. Opening hours, closures and "closed for renovation" notes for places on the itinerary.
3. Current SIM and eSIM deals for the destination (added beside the SIM shortlist, clearly marked
   as web-sourced).
4. Events during the trip dates (festivals, strikes, public holidays) on the trip overview.

## Approach
- Use Claude's server-side **web search tool** (`web_search_20260209` on current models) with
  `max_uses` set and `allowed_domains` per use case (for example government travel-advice sites
  for advisories). Check the parameter names against the current Anthropic docs. Search errors come
  back as result blocks with an error code, not as exceptions, so handle them.
- Ask for a structured result: `{facts: [{text, source_url, source_title, published_or_checked_date,
  confidence}], none_found: bool}`. Keep `source_url` only if it appeared in the search results for
  this call. Drop facts with no source.
- **Prompt-injection defence**: the system prompt states that page content is untrusted data. The
  call has no other tools (it cannot change the trip). The output is schema-only. Strip HTML and
  links from `text` and render it as plain text. Add tests with a malicious page fixture ("ignore
  previous instructions…") showing it has no effect.
- Cache per (use case, destination, date range) with a TTL that fits the use case: advisories
  12 hours, hours and closures 24 hours, SIM deals 3 days, events 1 day.
- A per-user and global daily budget for searches; log searches used and cost.

## UI
A "From the web" card in each place. Each fact shows its source name (linked, opening in a new tab
with `rel="noopener noreferrer"`) and "checked on <date>". The card is hidden when disabled or when
nothing is found. Advisories use `.alert-warning` when the source marks a higher risk level.

## Eval (required)
Add `services/api/evals/web/` with recorded search results for 10–15 cases. Checks: every fact has
a source from the results; dates are present; the injection fixture is ignored; no fact
contradicts the recorded source text. A live run is opt-in only.

## Done when
- With `llm` opted in, the four use cases show cited facts.
- With it off, nothing changes.
- The injection tests pass, the eval baseline is recorded, and every test passes.
