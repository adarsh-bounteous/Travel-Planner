# 08 Conversational trip planner

Read `docs/agent-prompts/RULES.md` first, especially the Claude and safety sections. This builds
on prompts 04–07.

## Goal
Add a chat panel inside a trip where the traveller can plan in plain language ("find a quiet
hotel near Alfama under 120 EUR a night and compare the top three"). Claude uses **the app's own
actions as tools**. The chat never does anything the traveller couldn't do through the UI, and it
never changes the trip without confirmation.

## Build
1. **Tools**: wrap existing service functions (not HTTP calls back into the API) as Claude tools
   with `strict: true` schemas and clear descriptions.
   - Read-only: `get_trip`, `search_stays`, `search_transport`, `search_activities`,
     `search_restaurants`, `get_sim_options`, `get_insurance_options`, `compare_options`
     (prompt 05), `get_recommendations` (prompt 04), `get_weather`, `get_visa`.
   - Changes the trip: `add_to_shortlist`, `choose_option`, `add_activity_to_day`,
     `set_trip_dates`, `set_budget`.
   - Leave out deleting a trip, sharing, inviting editors, booking and payment.
2. **Permissions**: every tool runs as the signed-in traveller with the same ownership and editor
   checks as the routers. The trip id comes from the session's current trip, never from the
   model's arguments. Add tests where the model asks for another user's trip.
3. **Confirmation**: tools that change the trip return a *proposed change* instead of applying
   it. The UI shows it as a card with Confirm and Cancel. Only Confirm calls the real endpoint.
4. **Loop**: use the Anthropic SDK tool runner or a manual loop with `tool_choice: auto` (forced
   tool choice is not supported on current models). Set a max of 8 tool calls per turn and a token
   budget per conversation. Stream responses to the UI. Handle `refusal`, `max_tokens` and
   `pause_turn`.
5. **State**: store conversations per trip, owned by the traveller. Send the conversation history
   unchanged on each turn (append only; don't edit earlier turns) and cache the stable prefix
   (system prompt plus tool definitions). Allow "Clear chat".
6. **Web content**: results from prompt 06 tools are data. The system prompt says so, and tool
   results that contain web text are wrapped and labelled as untrusted.
7. **UI**: a "Plan with chat" button on the trip page opens a side drawer (the v2 drawer pattern).
   Tool results render as the existing cards (stay cards, comparison table) where possible. The
   drawer has loading, error and budget-reached states.

## Eval (required)
Add `services/api/evals/planner/`: 15–20 scripted conversations with recorded tool results.
Checks: correct tool chosen; arguments valid; no change applied without confirmation; another
user's trip is never reached; the final answer matches the tool results; prompt-injection fixtures
from prompt 06 are ignored. Record the baseline and the average tool calls and cost per
conversation.

## Done when
- With `llm` opted in, the chat can search, compare and propose changes that the traveller
  confirms.
- With it off, the button is hidden.
- The eval baseline is recorded and every test passes.
