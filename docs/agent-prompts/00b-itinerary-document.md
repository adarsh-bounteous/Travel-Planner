# 00b Final itinerary document

Read `docs/agent-prompts/RULES.md` first. Run after 00a.

## Goal
Give every trip a clear, finished **itinerary document**: the whole plan in one place, with what is
included, what is not, what is booked and what still needs doing, the way a travel agency would
hand it over. It must work from the data the app already has. Later prompts only make it richer.

## Context
A trip already holds: destination, dates, travellers, budget and currency; chosen stays, transport
picks, SIM, insurance and restaurant picks; activities by day; reminders; visa and requirements
status; saved places; weather and currency helpers. Costs are computed in `TripTotalCard.tsx` and
the cost endpoints. The trip page is `TripDetailPage.tsx`; the read-only share is
`SharedTripPage.tsx`.

## Build
1. **Server-built document model**: `GET /trips/{id}/itinerary` returns one structured object, so
   the inclusion and exclusion rules are testable in Python (owner and editor access as for other
   trip reads; a shared read-only view gets the same document without edit links). Sections:
   - **Cover**: trip name, destination, dates and nights, travellers, generated date, a version
     or "last updated" stamp.
   - **At a glance**: key numbers (nights, travellers, total cost with currency, budget left) and
     the status of the essentials: stay, transport, SIM, insurance, visa.
   - **Day by day**: for each date in order: where you stay (check-in and check-out days marked),
     transport legs with times where known, activities, restaurant picks by meal, reminders. Days
     with nothing planned say so. Items without a day are listed after, under "Still to schedule".
   - **Bookings and confirmations**: a table of each chosen item with provider, dates, price with
     currency, a status (chosen, link-out, booked once prompt 10 exists), and the provider link.
   - **Included**: every chosen and priced item, with its price.
   - **Not included**: items the plan has no choice for (for example "Flights: not chosen",
     "Travel insurance: not chosen", "Visa fee: not included"), things never priced by the app
     (meals without picks, local transport, activities without a price, tips, personal spending),
     and a short standard list of general exclusions. Each unchosen item links to where to add it.
   - **Cost summary**: by category, with currency, conversion notes and "as of" dates for rates, and
     a note on estimates.
   - **Travel essentials**: visa status and official link, insurance plan, SIM, currency and
     typical weather for the dates, and medical guidance when present, each with its source and date.
   - **Before you go**: a checklist built from the data (passport validity, visa, insurance, SIM,
     reminders, bookings to make) with the done state of each.
   - **Important notes**: price and availability can change, the "confirm with official sources"
     notes, and the data sources and dates used.
2. **Itinerary page** `/trips/:tripId/itinerary` in the v2 design (`docs/design/`): a clean
   document layout with a sticky section list, and a **print stylesheet** so Print or Save as PDF
   from the browser gives a tidy A4 document (page breaks between days, no app chrome, links
   readable). Add "Itinerary" actions on the trip page: View itinerary, Print or Save as PDF, and
   Email me a copy (SES, or the local inbox in local mode, with the document as HTML).
3. **Optional server PDF**: add it only if it needs no heavy system libraries on the deployment
   target. Otherwise rely on print CSS, and say so in the report.
4. **Shared view**: when a trip has a read-only share link, the shared page may show the itinerary
   (owner can turn it off). Use the existing sharing rules.
5. **Empty and partial trips**: a trip with no dates, no bookings or no picks still renders, with
   clear "Not yet planned" states instead of blanks.

## Tests
Python tests for each inclusion and exclusion rule (empty trip, full trip, multi-stay, a stay
outside the dates, no currency conversion available), access rules, and the shared view. Web tests
for the sections and states. An e2e test that opens the page and checks the print stylesheet hides
the app chrome.

## Done when
A full trip produces a complete itinerary with correct included and not-included lists, printable
to a clean PDF, and an almost-empty trip produces a sensible short one. Every test passes.
