# 03b Visa application help

Read `docs/agent-prompts/RULES.md` first. Run after prompt 03 (real visa data).

## Goal
The app tells a traveller whether they need a visa, but gives no way to act on it. Add a guided
**"Apply for your visa"** step that takes them to the right official place with everything they
need, and tracks progress. This is guidance and tracking, not applying on their behalf.

## Scope decision
Applying for a visa means submitting personal and passport data to a government or an authorised
service. This prompt does **not** collect or submit application data. It sends the traveller to the
official application site and tracks status. Handling applications inside the app, or reselling visa
services, is a separate project with legal review. If you think it's needed, stop and say so.

## Context
`app/trips/visa.py` (`VisaRuleSource`, `OFFICIAL_SITES`, the fallback search link),
`VisaRequirementsPage.tsx` (verdict, official site link, "mark it" tracking),
`TripRequirementsPage.tsx`, and reminders.

## Build
1. **Visa guidance data** per (nationality, destination) pair, extending `VisaRuleSource`:
   visa type (not needed, visa on arrival, e-visa, embassy visa), the official application URL,
   typical processing time, typical fee and currency, validity, entry and passport validity rules,
   documents usually needed, and `source` and `as_of`. Use the provider from prompt 03 when it has
   these fields, and the seed data otherwise. Never present fee or time as certain.
2. **Apply step on the visa page**: when a visa is needed, show an "Apply for visa" card with the
   official link (opening in a new tab, `rel="noopener noreferrer"`), the document checklist, the
   processing time, and a **"Latest safe date to apply"** worked out from the trip start date and
   the processing time, with a warning when it is close or passed.
3. **Progress tracking** on the trip: Not started, Applied, Approved, Rejected or not needed, set by
   the traveller, per traveller on the trip (a companion may have a different passport). Store the
   date and an optional note, but not application numbers beyond what the traveller chooses to
   type (and warn that nothing sensitive should go in the note).
4. **Reminders**: offer to create a reminder at the latest safe date to apply, using the existing
   reminders feature.
5. **Itinerary and checklist**: the visa status feeds the itinerary document's essentials and
   "Before you go" list (00b).
6. **Scam safety**: link only to official government sites or sites from the provider's verified
   list. Show a short "Beware of look-alike sites" note, and never link to a search result as if it
   were official (the existing fallback search link is labelled as a search, not an official site).

## Tests
Verdict-to-step mapping for each visa type, the latest-date maths (including a trip that starts
before processing could finish), per-traveller status, reminders created, official-link whitelist
and the labelled fallback.

## Done when
For a trip that needs a visa, the traveller sees the official link, checklist, deadline and
tracking; for one that doesn't, nothing extra appears. Every test passes.
