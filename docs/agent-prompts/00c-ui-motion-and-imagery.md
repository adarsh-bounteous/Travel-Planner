# 00c UI polish phase 2: motion, imagery, icons, identity

Read `docs/agent-prompts/RULES.md` first. Run after 00a and 00b. The v2 refresh (stories 103–107)
is already merged; this takes it further toward a modern travel product. Use `docs/design/` for the
visual language and the five sheets in `docs/design/screens/sheets/` for reference.

## Goal
Make the app feel like a current travel site: confident branding, rich imagery, a consistent icon
set, smooth transitions and a little delight, without hurting speed or accessibility, and
without any change to behaviour, data or copy.

## Decisions already made (follow them)
- **Images**: no outside images or CDNs now. Build a local image system: a set of original
  destination illustrations (SVG, in the style of the cover gradients, one per seeded
  destination plus a generic set by region and by place type) and place-type illustrations. Real
  photos come later, through the places provider in prompt 02, using its allowed image URLs with
  attribution. Design the image component so a photo can replace an illustration with no layout
  change (fixed aspect ratios, blur-up placeholder, lazy loading, alt text).
- **Themes**: the guidelines say light only. Don't add dark mode. "Interactive theme" means a
  **per-trip accent theme**: the trip page's hero, accents and illustrations take their colours from
  the destination (for example Lisbon warm tile blues, Kyoto reds), chosen from a fixed, tested
  palette set that always meets contrast rules. Keep `--color-primary` reserved for actions.
  If you think dark mode is worth adding, don't build it; list it as a follow-up with the
  guideline change it needs.
- **Icons**: use one consistent inline-SVG icon set (already started in `auth/icons.tsx` and the
  design mockups). Replace mixed or missing icons across navigation, section titles, meta rows,
  buttons and empty states. No icon CDN and no icon font.
- **Motion**: CSS-first, using tokens for durations and easing. Respect
  `prefers-reduced-motion` everywhere (fade only, no movement).

## Build
1. **Brand**: a proper logo (mark plus wordmark) as SVG, a favicon set and app icons, a social
   preview image, and a page title pattern. Use them in the header, sign-in, 404 and the
   itinerary document.
2. **Imagery**: the image component and illustration set above, used on trip cards, the trip hero,
   recommendation and place cards, option cards, empty states and the itinerary document cover.
3. **Page and route transitions**: a short fade and slide between routes (View Transitions API
   where supported, a CSS fallback otherwise). Tab changes inside a trip animate the underline and
   cross-fade the panel.
4. **Micro-interactions**: button press and hover states, card lift, heart (save) pop, toast and
   drawer or modal enter and exit, skeleton shimmer, a progress animation when picking an option,
   a count-up on the trip total, a check animation when something is chosen or booked, and an
   animated route line on flight cards.
5. **Home and My trips**: a welcoming header (time-of-day greeting only if it needs no new data),
   upcoming-trip countdown on the next trip, and richer empty states with illustration.
6. **Performance**: animations use `transform` and `opacity` only, images are lazy and sized, no
   layout shift, and the bundle grows by less than a stated budget (set one and report it). Check
   Lighthouse performance and accessibility on three key pages before and after.
7. **Accessibility**: contrast on every theme and over images (use scrims), focus rings intact,
   keyboard and screen-reader behaviour unchanged, decorative images `aria-hidden`.

## Rules for this prompt
Same as the design refresh: no change to the API client files, `devProxy.ts`, sign-in logic, routes,
visible copy, `aria-*`, ids or test ids, and no edits to existing tests. New components get their
own tests.

## Done when
Every screen listed in the five sheets uses the new brand, imagery, icons and motion; reduced
motion is respected; the performance and accessibility numbers are reported and not worse than
before; and every test passes. Save before and after screenshots at 390px and 1280px in
`docs/design/after/phase-2/`.
