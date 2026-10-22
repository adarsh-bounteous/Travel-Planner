# Travel Planner UI guidelines

## Navigation and information architecture
- **Top bar, no sidebar.** The product has few sections and screens are content-heavy, so full width goes to content.
- **Main sections, in order:** Trips (`trips`), Explore (`explore`), Bookings (`bookings`), Budget (`budget`). This order follows the planning journey from "where" to "how much".
- **Utility links after the sections:** Saved (`saved`, wishlisted places) and Account (`account`). They are personal, not part of planning, so they sit apart.
- **Trips is the home section.** People return to an existing trip far more often than they start a new one.
- **Inside a trip, use `.tabs`** (Overview, Itinerary, Bookings, Budget, Travelers) rather than new top-level items, so the top bar stays constant.
- **Below 48rem the navigation collapses behind a menu button**, because phones can't fit six labels.

## Layout and density
- **Spacious consumer app, not a console.** Users plan casually and often on a phone, so favour `--space-3` and `--space-4` gaps over tight packing.
- **Single column on phones, `.grid` on desktop.** Cards reflow by themselves; don't add fixed column counts.
- **Content max width is `--size-content-max`,** because long itinerary lines are hard to scan.
- **The breakpoints that matter are 375px (phone) and desktop at 48rem;** design phone first.

## Component usage
- **`.card` for things you open** (a trip, a destination, a booking), laid out in `.grid`, because each is a distinct object with its own page.
- **`.stack` of `.card` or rows for an itinerary day,** because order matters more than comparison.
- **A table only for comparing many records on desktop** (budget line items, price comparisons); on phones turn each row into a `.card`, because tables overflow at 375px.
- **One `.btn-primary` per screen section;** other actions use `.btn-secondary` or `.btn-ghost`, so the main next step is obvious.
- **`.btn-danger` only for irreversible actions** (delete trip, cancel booking) and always behind a `.modal` confirmation.
- **`.badge` for booking status** (success = confirmed, warning = pending, danger = cancelled, neutral = draft); **`.chip` for filters and interests,** because chips are user-toggled and badges are not.
- **`.drawer` for editing something in context** (add an activity); **`.modal` only for confirmations,** because drawers keep the itinerary visible.
- **`.dropdown` for choosing one option or sorting; `.menu` for per-item actions;** use `.select` only inside forms.
- **`.toast` for confirming a saved change; `.alert` for problems that stay on the page** (sold-out flight, over budget).
- **`.empty-state` with one `.btn-primary`** wherever a list can be empty (no trips yet), because first use starts empty.
- **`.skeleton` for lists and cards while loading; `.spinner` only for button-sized waits.**
- **Forms: one `.field` per input with a `.field-hint`;** show `.field-error` with `.is-invalid` after submit, not while typing.

## Theme
- **Light only.** Maps, photos and price comparisons are judged on light backgrounds, and one theme halves the review surface.
- **`--color-primary` is reserved for actions and the current selection,** so travellers can tell what is clickable.

## Voice and tone
- **Warm, concise, second person** ("Where to next?"), because trip planning should feel exciting rather than administrative.
- **Buttons start with a verb** (Add activity, Save trip), because they describe the outcome.
- **Errors say what happened and what to do next,** without blame ("That flight is sold out. Try another date.").
- **Show dates and money in the traveller's local format** and always include the currency, because mixed currencies cause costly mistakes.
