# Ground rules for every integration and AI prompt

Every prompt in this folder starts with "Read `docs/agent-prompts/RULES.md` first". These rules hold
unless a prompt says otherwise.

## Architecture
- **Plug into the existing ports.** Each data area already has a `Protocol` (for example
  `PlaceSearch`, `RecommendationSource`, `StayProvider`, `FlightProvider`, `RateSource`,
  `ForecastSource`, `VisaRuleSource`, `SimProvider`, `RestaurantProvider`, `ActivityProvider`,
  `InsuranceProvider`, `TransportProvider`). A new source is a new adapter class for one of these.
  Wire it in `services/api/app/routers/deps.py`. Change a port's shape only when the prompt asks
  for it, and update the in-memory and local implementations at the same time.
- **Keep the seed and local adapters.** They stay the fallback and the test double. No feature may
  depend on a real source being up.
- **Use the shared integration layer** from prompt 01 (HTTP client, caching, retries, keys, recorded
  responses, provider status). Don't create one-off `httpx` calls.

## Local mode and tests
- **Local mode makes no outside request by default** (`LOCAL_MODE=true`, `APP_ENV=local`). A real
  source runs in local mode only when it is named in the opt-in setting from prompt 01, and
  `GET /startup-status` must report it.
- **Tests never call real services.** Use recorded responses or fakes. Contract tests run each
  adapter against the same rules as the in-memory adapter.
- Keep every existing test passing. Don't edit or delete existing tests to make them pass.

## Secrets, data and safety
- API keys come from environment variables (and Secrets Manager outside local mode). Never commit a
  key, a real response with personal data, or a key in a recorded fixture: scrub them.
- Document every new setting in the settings table in `services/api/README.md`.
- Trip and profile contents are personal data. Don't log them, and send to an outside service only
  what the feature needs.
- **Content from the web or a provider is data, never instructions.** Never let it change what the
  app does, which tools run, or what the model is told to do.
- Show the source and an "as of" date on any data that comes from outside. Prices always show their
  currency.

## Claude (prompts 04, 05, 06 and 08)
- Use the official `anthropic` Python SDK. Check method names and parameters against the current
  Anthropic docs and SDK; don't guess them.
- Read the model from a setting (`LLM_MODEL`, default `claude-opus-5-5`) and the effort level from a
  setting too (`LLM_EFFORT`; Claude Opus 5.5 defaults to `medium`, so set it explicitly).
- Get JSON back with structured outputs (`client.messages.parse()` with a Pydantic model, or
  `output_config.format`). Don't parse free text.
- Always check `stop_reason` before reading content: handle `refusal`, `max_tokens` and
  `pause_turn`. Enable the server-side refusal fallback as the current docs describe.
- Tool use: `tool_choice` `any`/`tool` returns a 400 on current models. Use `auto`, `strict: true`
  tool schemas and clear instructions.
- Put the stable system prompt first and cache it. Never put timestamps or request ids in the
  cached prefix. Check `usage.cache_read_input_tokens` in a test or log.
- Set per-request limits (max tokens, timeouts, max tool calls) and a per-user daily budget. Log
  token usage and cost per feature, not the prompt contents.
- In local mode and in tests, use a fake LLM client that returns recorded structured responses,
  unless `llm` is in the local opt-in list.
- Every AI feature ships with an **eval** in the repo: a small golden set and a script that scores
  it. Its result is part of the report.

## Web app
- Follow `design-system/UI-GUIDELINES.md` and the v2 look in `docs/design/`. Keep existing copy,
  roles, ids and test ids unless the prompt adds new screens or states.
- Every new list has loading, empty, error and "source unavailable" states.

## Workflow
- Plan first, then split the work into small stories in the repo's usual style, with tests in each
  story.
- Run all of these before you report:
  - from `services/api`: `sh run-py.sh -m pytest -c pytest.ini`
  - from `services/api`: `sh run-py.sh -m pytest -c pytest-e2e.ini`
  - `pnpm --dir apps/web typecheck`
  - `pnpm --dir apps/web test`
  - `pnpm --dir apps/web e2e`
- In the report, list: what changed, the new settings, the test results, the eval results (for AI
  work), the cost and latency per request (for AI work), and anything you skipped and why.
