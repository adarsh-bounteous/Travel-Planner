# Travel Planner: UI/UX redesign spec (v2 visual refresh)

Status: proposal. Scope: **visual design and front-end presentation only.** Features, flows, copy,
routes, data and the API stay exactly as they are.

## Visual reference: sample screens

The look is defined by **`docs/design/mockups.html`**, a self-contained page that opens in any browser, and by
its PNG renders in **`docs/design/screens/`**. To re-render them after editing the mockups, run
`node docs/design/render-mockups.mjs`.

| # | PNG | Shows | App screens it applies to |
| --- | --- | --- | --- |
| 01 | `01-design-system.png` | Colours, type, buttons, badges, chips, inputs, alerts, elevation, toast, icons | All |
| 02 | `02-sign-in.png` | Split auth layout | `/sign-in`, `/sign-up`, `/confirm-email`, `/confirm-email/:token` |
| 03 | `03-my-trips.png` | Header, page head, trip cards with covers | `/` |
| 04 | `04-new-trip.png` | Stepper, question cards, radio cards, chips, sticky footer | `/trips/new`, `/trips/plan/*` |
| 05 | `05-trip-overview.png` | Trip hero, sticky tabs, two-column layout with summary rail | `/trips/:tripId` (Overview) |
| 06 | `06-itinerary.png` | Day cards with timeline | Itinerary tab |
| 07 | `07-stay-shortlist.png` | **Shared option-card anatomy** | Stay options and shortlist, SIM, activity, restaurant and insurance options |
| 08 | `08-compare-table.png` | Comparison table | `StayComparison`, `RestaurantCompare`, `/insurance-options/compare` |
| 09 | `09-flights.png` | Filter rail, flight and transport time-line cards | `/trips/:tripId/flights`, Transport tab, `/transport`, `/explore/travel` |
| 10 | `10-explore.png` | Search hero, segmented toggle, image-first place cards | `/explore`, `/destinations`, Recommendations tab, `/saved` |
| 11 | `11-book-trip-drawer.png` | Drawer over a scrim, checklist summary | `BookTripDrawer` and every other drawer; modals follow the same surface rules |
| 12 | `12-phone.png` | 390px layouts: scrollable nav, stacked rail, bottom sheet | All screens at phone width |
| 13 | `13-states.png` | Empty, skeleton, error, 404 and local inbox | All lists, `NotFoundPage`, `/local/inbox` |

**How to read the mockups:**
- They specify **look and layout only.** Copy the colours, spacing, radius, shadows, type and arrangement.
- **They do not specify content.** Text, badges, filter chips, subtitles, taglines, status labels, sample
  numbers and facts that the real screen does not already render are illustrative. Do not add them. The
  real screen keeps exactly its current elements and wording.
- Where the mockup and the real screen differ in which elements exist, the real screen wins. Apply the
  closest mockup pattern to the elements that are actually there.
- Covers are CSS gradients with a watermark initial, not photos, so nothing loads from outside.

## 1. Goals and non-goals

### Goals
- The app should feel like a real consumer travel product: calm, trustworthy and a little aspirational.
  Think Airbnb, Booking.com or Google Travel, not an admin console.
- Make the next step obvious on every screen. There is one primary action per section.
- Make options easy to compare: stays, flights, transport, SIMs, restaurants and insurance.
- Use one consistent look across about 90 screens. Today each feature styles its own option cards.
- Keep or improve accessibility: WCAG 2.2 AA contrast, visible focus, keyboard support, and a
  usable layout at 375px.

### Non-goals (hard constraints)
- **No backend change.** Do not touch anything in `services/api/`.
- **No change to behaviour or data flow in the web app.** Do not change API client modules
  (`api.ts`, `*Api.ts`, `*api.ts`), `devProxy.ts`, `vite.config.ts` proxy settings, `AuthProvider`,
  `RequireAuth`, route paths in `App.tsx`, request payloads, state logic, or validation rules.
- **No copy change.** Keep visible text, headings, button labels, error messages, `aria-*`
  attributes, roles, `id`s and `data-testid`s. Tests find elements by these.
- **No new feature.** Do not add Bookings or Budget top-level sections. `navSections.ts` says they
  are added when their screens exist.
- **No outside hosts at runtime.** Load no CDN fonts, remote images or icon CDNs. Local mode
  promises no outside requests.

## 2. Where the design lives today

| Layer | File | Notes |
| --- | --- | --- |
| Tokens | `design-system/tokens.json` and `design-system/tokens.css` | `tokens.css` is generated from `tokens.json`. Keep both in sync and keep every existing token name. |
| Global styles and components | `apps/web/src/index.css` (about 500 lines) | Imports Tailwind v4 and the tokens. Holds every component class (`.btn`, `.card`, `.alert`, `.option-*`, `.stay-*` and so on). |
| Rules | `design-system/UI-GUIDELINES.md` | Component usage rules. These still apply. |
| Reference pages | `design-system/style-guide.html`, `app-shell.html` | Update them so they show the new look. |

Because almost every screen is built from the shared classes in `index.css`, **most of the
redesign is done in tokens and CSS**, with only small JSX changes. That keeps the risk low.

There is a known bug: `tokens.css` exports `--duration-fast` and `--duration-spin` as
`[object Object]`. `index.css` overrides both. Fix them at the source in both token files.

## 3. Design direction

**"Calm ocean, warm sand."** Keep the brand teal for actions. Add a warm neutral and one coral
accent for highlights such as "Best value" or "Top pick". Put white cards with soft shadows on a
light tinted page so the content stands out. Use generous spacing, rounded corners and clear
type hierarchy.

Personality: warm, confident, uncluttered. Photos and gradients carry the emotion. The chrome
stays quiet.

## 4. Design tokens

Add these tokens. **Do not remove or rename existing tokens.** Change the values marked "update".

### 4.1 Colour

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` (update) | `#f8fafc` | Page background. It is tinted so white cards stand out. |
| `--color-surface-raised` (new) | `#ffffff` | Cards, drawers, modals, header. |
| `--color-surface` | `#f1f5f9` | Hover fills and subtle wells. No change. |
| `--color-border` (update) | `#e2e8f0` | Softer dividers. |
| `--color-border-strong` | `#64748b` | Form borders. No change; it is needed for 3:1 contrast. |
| `--color-primary` | `#0e7490` | Actions, links, selection. No change (5.4:1 on white). |
| `--color-primary-hover` | `#155e75` | No change. |
| `--color-primary-subtle` | `#ecfeff` | No change. |
| `--color-accent` (new) | `#c2410c` | Coral highlight badges and price emphasis (5.2:1 on white). |
| `--color-accent-subtle` (new) | `#fff7ed` | Tint behind accent badges. |
| `--color-sand` (new) | `#faf7f2` | Warm hero and empty-state backgrounds. |
| `--gradient-hero` (new) | `linear-gradient(135deg, #0e7490 0%, #0891b2 55%, #f59e0b 140%)` | Trip and auth hero bands. White text on it must use the dark end. |
| `--gradient-cover-1..6` (new) | 6 two-stop gradients, for example teal→cyan, indigo→sky, rose→amber, emerald→teal, violet→fuchsia, slate→sky | Destination cover placeholders when there is no image. Pick one by a hash of the trip id. |

Status colours (`success`, `warning`, `danger`, `info` and their `-subtle` tints) stay the same.
They already pass AA.

### 4.2 Typography

Use the Inter font, self-hosted. The token already lists it but nothing loads it today. Add
`@fontsource-variable/inter` as a dependency and import it in `main.tsx`, or keep the system
stack. Never load it from Google Fonts.

| Token | Value | Use |
| --- | --- | --- |
| `--font-size-xs` (new) | 12px | Badge text, meta |
| `--font-size-sm` | 14px | No change |
| `--font-size-md` | 16px | No change |
| `--font-size-lg` | 20px | No change |
| `--font-size-xl` | 28px | Page H1 on phone |
| `--font-size-2xl` (new) | 36px | Page H1 on desktop, trip hero title |
| `--font-size-price` (new) | 22px | Prices on option cards |
| `--font-weight-semibold` (new) | 600 | Card titles, prices, tabs |
| `--letter-spacing-tight` (new) | -0.02em | H1, H2 |

Show prices with `font-variant-numeric: tabular-nums` so the columns line up.

### 4.3 Shape, elevation, motion

| Token | Value |
| --- | --- |
| `--radius-md` (update) | 10px |
| `--radius-lg` (update) | 16px |
| `--radius-xl` (new) | 24px, for hero bands and auth panels |
| `--shadow-sm` (new) | `0 1px 2px rgb(15 23 42 / 0.06)` |
| `--shadow-md` (new) | `0 4px 16px rgb(15 23 42 / 0.08)` |
| `--shadow-lg` (new) | `0 16px 40px rgb(15 23 42 / 0.14)`, for drawers, modals and popovers |
| `--duration-fast` (fix) | 150ms |
| `--duration-base` (new) | 220ms |
| `--duration-spin` (fix) | 600ms |
| `--ease-standard` (new) | `cubic-bezier(0.2, 0, 0, 1)` |

Respect `prefers-reduced-motion`: drop transforms and keep only opacity.

## 5. Component specs (restyle existing classes in `index.css`)

Keep every class name. Tests query `.sk-card`, `.skeleton`, `ul.grid`, `.toast-error`,
`.option-title` and `.badge`.

- **`.btn`**: height 44px by default (40px for `.btn-sm`), radius `--radius-md`, weight 600,
  `transition` on background, shadow and transform. On press: `transform: translateY(1px)`.
  - `.btn-primary`: teal fill, `--shadow-sm`, slightly darker on hover.
  - `.btn-secondary`: white fill, 1px `--color-border` border that turns `--color-border-strong`
    on hover. This replaces the grey fill.
  - `.btn-ghost`: transparent background, teal text, `--color-primary-subtle` on hover.
  - `.btn-danger`: no change apart from shape.
  - Focus stays a 2px `--color-focus` outline with a 2px offset.
- **`.card`**: `--color-surface-raised`, 1px `--color-border`, `--radius-lg`, `--shadow-sm`, padding
  `--space-4` on desktop. A card that is a link or button gets `--shadow-md` on hover and moves up
  1px.
- **Option cards** (`.option`, `.stay-card`, `.property`, `.flight-option`, `.transport-option`,
  `.travel-option`, `.restaurant`, `.plan-card`, `.offer`, `.compare-card`): give them **one shared
  anatomy**.
  1. Media on the left on desktop or on top on phone: a 16:10 image or `--gradient-cover-*`
     placeholder with `--radius-md`.
  2. Body: title (`.option-title`, 18px semibold), a row of meta facts (muted 14px), and badges.
  3. Price block, right-aligned on desktop: the price in `--font-size-price` semibold tabular, the
     currency code muted, "total" or "per night" below in xs muted.
  4. Actions: one primary button, everything else secondary or ghost.
  - When chosen or selected (`.chosen`, `.chosen-card`, `[aria-pressed="true"]`): 2px
    `--color-primary` border and a `--color-primary-subtle` background.
- **`.badge`**: pill, xs semibold, `-subtle` background with the strong text colour. Add
  `.badge-accent` for "Best value", "Top pick" and "Cheapest". Use it only where the UI already
  shows such a label.
- **`.chip`**: pill, 36px high. When selected: teal border, `--color-primary-subtle` fill and a
  check icon.
- **`.input`, `.select`**: 44px high, `--radius-md`, white fill. Hover sets border
  `--color-fg-muted`. Focus sets a teal border plus `0 0 0 3px rgb(14 116 144 / 0.15)`.
  `.is-invalid` sets a danger border and the same ring in red.
- **`.field`**: the label sits 6px above the input, and the hint and error sit 4px below.
- **`.tabs` / `.tab`**: underline style. The active tab has teal text and a 2px teal bar. Tabs
  scroll horizontally on phone with no wrapping, and the tab bar is sticky under the header inside
  a trip.
- **`.alert`**: `--radius-md`, no heavy left border, a 20px status icon and the `-subtle` fill.
- **`.drawer`**: slides in from the right on desktop and opens as a bottom sheet with a grab
  handle on phone. Uses `--shadow-lg`, a sticky footer for actions and a scrolling body.
- **`.modal`**: `--radius-xl`, `--shadow-lg`, backdrop blur of 4px if supported. Fades and scales
  in from 0.98.
- **`.toast`**: dark (`--color-fg`), `--radius-md`, `--shadow-lg`, icon on the left. Fix the blank
  white box seen after "Place added".
- **`.skeleton`, `.sk-card`**: shimmer gradient. In skeleton cards, match the shape of the real
  card: media block, two lines and a price stub.
- **`.empty-state`**: centred. A 64px illustration circle in `--color-sand` with an icon, an H2, one
  line of muted text and one primary button.
- **`.data-table`, `.price-table`**: sticky header, zebra rows in `--color-surface`, numbers
  right-aligned and tabular. Below 48rem each row becomes a card, as `UI-GUIDELINES.md` already
  says.

### Icons
The app has `icons.tsx` and an `.icon` class. Keep using inline SVG with no icon CDN. One icon set
with a 2px stroke and round caps, such as hand-copied Lucide paths, is fine. Add icons next to
section titles and meta facts: calendar, map pin, users, bed, plane, wallet, SIM, utensils and
shield.

## 6. App shell

- **Header**: sticky, `--color-surface-raised` with a 1px bottom border. Add `backdrop-filter:
  saturate(1.4) blur(8px)` with 92% opacity.
  - Brand: a small logo mark (inline SVG compass or plane in a teal rounded square) plus "Travel
    Planner" in semibold. **Keep the link text "Travel Planner".**
  - Nav links: pill hover. The current link gets a teal text colour and a subtle fill.
- **Constraint from tests:** the header must show every link at phone and desktop widths and must
  **not** contain a button named "Menu" (`e2e/app-shell.spec.ts`). At 375px, make the links a
  horizontally scrollable row. Don't collapse them.
- **Main**: max width `--size-content-max`. Padding 24px on phone and 40px on desktop.
- **Page header pattern** (`.page-head`): breadcrumbs (`.crumbs`, xs muted, chevron separators),
  then the H1 with `--letter-spacing-tight`, then an optional muted subtitle and actions on the
  right on desktop.
- **Footer** (new, presentational): a muted line with "Local mode" status where the page already
  shows it. Don't add new data calls.

## 7. Screen-by-screen guidance

These changes are about layout and styling only. Every element on each screen stays.

| Screen (route) | Redesign |
| --- | --- |
| Sign in, Sign up, Confirm email (`/sign-in`, `/sign-up`, `/confirm-email`) | Split layout on desktop: the form card on the left, a `--gradient-hero` panel on the right with a short tagline that is already on the page (or decoration only). Phone: form only, with a slim gradient band on top. The Google button is white with a border. "or" dividers have rules on both sides. |
| My trips (`/`) | A greeting header ("My trips", kept). Trip cards in `.grid` with a 16:9 cover (`--gradient-cover-n` plus the destination initial or name), then the title, a date-range and travellers meta row, and a status badge. "New trip" is the primary button at the top right. The empty state uses the empty-state spec. |
| New trip set-up (`/trips/new`) | A visual **stepper** across the top, driven by the existing step state with no new logic: numbered circles joined by lines, done steps show a check. One question group per card. A sticky footer holds Back and Next or Continue. |
| Trip detail (`/trips/:id`) | A **trip hero band**: gradient or cover image, the destination as H1 in white, a meta row (dates, travellers, budget) and the share and settings actions as white ghost buttons. Below it, sticky tabs. Desktop uses two columns: tab content (about 8/12) and a **sticky summary rail** (about 4/12) that holds the existing `TripTotalCard`, `BudgetPanel`, `TravelHelpersCard` and Book trip. Phone stacks them. |
| Itinerary tab | Day sections as a vertical timeline: day name chip, a dotted rail on the left and activity cards with a time and category icon. |
| Recommendations tab, Explore, Destinations (`/explore`, `/destinations`) | Large search field with an icon. Results use an image-first card grid, 3 columns on desktop. Save is a heart icon button over the image (keep its accessible name). The map/list `ViewToggle` is a segmented control. |
| Stays: options, filters, shortlist, compare | Filters sit in a left rail on desktop and in a drawer on phone, using the existing filter component. Results use the shared option-card anatomy. Compare is a side-by-side table with sticky first column and the best value per row highlighted in teal. |
| Flights and transport (`/trips/:id/flights`, Transport tab, `/transport`) | Each option card shows a "time line": depart time, a line with the duration and stops, then the arrive time. Price is on the right. |
| SIM, activities, restaurants, insurance options and compare | The same option-card anatomy. Insurance compare uses the price-table spec. |
| Shortlists (`/trips/:id/shortlists`) | Grouped sections with count badges and compact option cards. |
| Costs, currency, weather, visa, requirements, medical | "Info pages": a hero stat card on top (converted total, temperature, visa verdict) and detail cards below. Visa verdict uses a large status badge. |
| Book trip drawer | A checklist-style summary with chosen items as rows that show a check icon and price, a total row in bold and the primary action in a sticky footer. |
| Account, Profile, Transport preferences | Settings layout: a section list on the left on desktop, and cards of label/value rows (`.answer-row`) with an edit ghost button. |
| Saved (`/saved`) | Image-card grid, the same as Explore. |
| Shared trip (`/trips/read-only/:token`) | The same hero and summary as trip detail, read-only, with a "Shared trip" badge. |
| Local inbox and Google consent (`/local/*`) | Mail-client look: a list of messages on the left and the message body on the right, with a subtle "Local mode" banner. |
| 404 | A large illustration circle, the existing text, and a link back to My trips. |

## 8. Responsive rules

- Design phone first at 375px, with the desktop layout from 48rem.
- The two-column trip layout and filter rail start at 64rem. Between 48rem and 64rem the page is
  one column with 2-column grids.
- Touch targets are at least 44×44px.
- Nothing scrolls horizontally except the nav row, tab bar and data tables (inside `.table-wrap`).

## 9. Accessibility checklist

- Text has at least 4.5:1 contrast. UI borders and icons have at least 3:1. Check white on every
  gradient at its darkest overlap; add a dark scrim (`rgb(15 23 42 / 0.35)`) under hero text.
- Focus is visible on every interactive element. Don't remove outlines.
- Every new decorative SVG has `aria-hidden="true"`. Icon-only buttons keep their existing
  accessible names.
- Keep the heading order (one H1 per page).
- Respect reduced motion.

## 10. Acceptance criteria

1. `git diff --stat` shows changes only under `apps/web/src/**/*.css`, `apps/web/src/**/*.tsx`
   (markup and className only), `apps/web/src/main.tsx` (font import), `apps/web/package.json`
   (optional font dependency), `design-system/*` and `docs/design/*`.
2. Nothing in `services/` changed, and no `*Api.ts`, `api.ts`, `devProxy.ts`, `AuthProvider.tsx` or
   route path changed.
3. `pnpm --dir apps/web typecheck`, `pnpm --dir apps/web test` and `pnpm --dir apps/web e2e` pass
   with no test edited, except snapshot-free class assertions if the reviewer approves.
4. Manual check at 375px and 1280px of: sign in, My trips, new trip, trip detail (every tab), stay
   shortlist and compare, SIM options, restaurants, insurance, costs, account, the local inbox and
   404.
5. No network request goes to any host other than the app origin. Check this in DevTools →
   Network.

## 11. Suggested rollout (one PR per phase)

1. **Tokens**: add or update the tokens and fix the duration bug. Most screens improve right away.
2. **Base components**: restyle the buttons, inputs, cards, badges, chips, alerts, tabs, drawer,
   modal, toast, skeleton and empty state in `index.css`.
3. **Shell**: header, logo mark, page header pattern and footer.
4. **Shared option-card anatomy**: apply it to stays, flights, transport, SIMs, restaurants and
   insurance.
5. **Signature screens**: auth split layout, My trips covers, trip hero with summary rail, and the
   new-trip stepper.
6. **Polish**: info pages, local inbox, 404, motion, and updating `style-guide.html`.
