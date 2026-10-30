# 09 Price and availability tracking with alerts

Read `docs/agent-prompts/RULES.md` first. This builds on prompt 07 (real prices) and the existing
reminders and email set-up.

## Goal
Let travellers watch shortlisted or chosen options and get an email when the price drops, the
option sells out, or an option they chose changes.

## Context
- Reminders already exist (`ReminderModal.tsx` and the API behind it). Emails go through SES, or
  the local inbox in local mode (which survives restarts since story 094).
- `app/availability/runner.py` shows how scheduled checks run and alert.

## Build
1. **Watch** model per traveller: target (an offer or a shortlist), trigger (price below X, drops
   by Y%, sold out, changed), currency, created time and an active flag. A "Watch price" action on
   option cards and chosen items; a "Watched" list on the trip.
2. **Checker job**: re-queries the provider for active watches on a schedule. Space the calls out
   to respect quotas from prompt 01. Skip trips that have already started or ended. In local mode,
   run it on demand from the Local mode page, with simulated price changes from the local
   provider.
3. **Price history**: store each observed price with its time, and show a small trend on the
   watched item (follow the `dataviz` guidelines if you add a chart).
4. **Alerts**: an email with the old and new price (with currency), a link to the item, and
   one-click unwatch. Duplicate protection: at most one alert per watch per change, and a
   per-traveller daily cap. Use a retry-safe send (an idempotency key per alert).
5. **Settings**: an account preference to turn price emails off.

## Tests
Trigger logic (drop, threshold, sold out, currency conversion), duplicate protection, quota
spacing, stopping after the trip ends, the unwatch link (signed, single-purpose), and the
local-mode simulation.

## Done when
- In local mode a simulated price drop sends one email to the local inbox.
- With a provider opted in, real watches are checked on schedule.
- Every test passes.
