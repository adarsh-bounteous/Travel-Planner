# Prompt for the AI coding assistant

Copy everything below the line into your AI coding tool. Run it once per phase: replace
`<PHASE>` with 1 to 6 from section 11 of the spec, and start a new branch for each phase.

**Images to attach (5, every phase):** all 13 sample screens are combined into these 5 sheets in
`docs/design/screens/sheets/`. Attach all 5 every time, so the agent always sees the whole system.

| Sheet | Contains |
| --- | --- |
| `sheet-1-foundations.png` | 01 design system, 13 empty/loading/error/404/inbox |
| `sheet-2-entry.png` | 02 sign in, 03 my trips, 04 new trip set-up |
| `sheet-3-trip.png` | 05 trip overview, 06 itinerary, 11 book trip drawer |
| `sheet-4-options.png` | 07 option card (stays), 08 compare table, 09 flights and transport |
| `sheet-5-explore-phone.png` | 10 explore and saved, 12 phone layouts |

If your tool can read files, the full-size single screens are in `docs/design/screens/`, and the
exact CSS values are in `docs/design/mockups.html`.

---

You are redesigning the **visual layer only** of the Travel Planner web app in this repository, so it
looks like a professional, real-world consumer travel product. You have three design inputs. Use them
in this order:

1. **The sample screens**: `docs/design/mockups.html`, rendered as PNGs in `docs/design/screens/`
   (`01-design-system.png` … `13-states.png`), also combined into the 5 attached sheets in
   `docs/design/screens/sheets/`. Each tile is labelled with its number, name and the routes it applies to.
   These are the visual target. Open the PNGs (and the
   HTML, whose `<style>` block shows the exact CSS values used) and match them closely: colour,
   type scale, spacing, radius, shadows, and the layout of each screen.
2. **The spec**: `docs/design/UI-UX-REDESIGN.md`. It has the token values, component rules, which
   mockup applies to which route ("Visual reference" table), responsive and accessibility rules, and
   the rollout phases.
3. **The existing rules**: `design-system/UI-GUIDELINES.md`. Component usage rules still apply.

Before changing anything, read `design-system/tokens.json`, `design-system/tokens.css` and
`apps/web/src/index.css`, and open the components of each screen you will touch.

**This task: implement Phase <PHASE> of the rollout in section 11 of the spec, and nothing from
later phases.**

## How to use the mockups
- **Translate, don't copy.** The mockup HTML is a standalone prototype. Don't paste it into the app.
  Bring its look into the app's own structure: update tokens, restyle the existing classes in
  `apps/web/src/index.css`, and make only the small JSX changes the rules below allow.
- **Look, not content.** Match how things look and where they sit. Text, badges, chips, subtitles,
  taglines, status labels and sample numbers that the real screen doesn't already render are
  illustrative. **Do not add them.** Each real screen keeps exactly its current elements and wording.
- **The real screen wins.** If a mockup shows an element the real screen lacks, leave it out. If the
  real screen has an element the mockup lacks, style it with the closest pattern from the mockups
  (usually the option-card anatomy in `07`, the card and helper rows in `05`, or the states in `13`).
- **One pattern per kind of thing.** Every option list (stays, flights, transport, SIMs, activities,
  restaurants, insurance) uses the option-card anatomy in `07` and `09`. Every comparison uses `08`.
  Every drawer uses `11`. Every empty, loading or error state uses `13`.
- **Covers are gradients.** Use `--gradient-cover-1..6` picked by a stable hash of the id, with an
  `aria-hidden` initial watermark. Never use remote images. Replace the current `picsum.photos` usage
  with the local placeholder.

## Stack
- React 19, React Router 7, Vite 7, TypeScript, Tailwind CSS v4 (imported in `index.css`).
- Styling is token-driven through shared semantic classes in `apps/web/src/index.css` (`.btn`,
  `.card`, `.option-*`, `.stay-*`, `.badge` and so on). Restyle those classes rather than adding
  long Tailwind utility strings to each JSX file.

## Hard rules (do not break any of these)
1. **Do not modify anything under `services/`.** The backend is out of scope.
2. **Do not change behaviour or data flow.** Leave these files untouched: `api.ts`, any `*Api.ts`
   or `*api.ts`, `devProxy.ts`, `vite.config.ts`, `auth/AuthProvider.tsx`, `auth/RequireAuth.tsx`,
   and the route paths in `App.tsx`. Do not change hooks, state, effects, handlers, fetch calls,
   validation or conditional rendering logic.
3. **Do not change user-facing text or accessibility hooks.** Keep every visible string, heading
   level, button label, `aria-*` attribute, `role`, `id`, `htmlFor`, `name` and `data-testid`.
4. **Keep every existing CSS class name.** You may add classes. Tests query `.sk-card`,
   `.skeleton`, `ul.grid`, `.toast-error`, `.option-title`, `.badge`,
   `#current-password-email` and `#current-password-password`.
5. **The header must not get a button named "Menu"**, and all header links must stay visible at
   375px and at desktop width (`e2e/app-shell.spec.ts`). Use the horizontally scrollable pill row
   shown in `12-phone.png`.
6. **No outside network requests.** Load no CDN fonts, remote images or icon CDNs. Use inline SVG
   icons (the sprite in `mockups.html` shows the style) and CSS gradients. If you add the Inter
   font, use the npm package `@fontsource-variable/inter` and import it in `main.tsx`.
7. **Keep every existing token name** in `design-system/tokens.json` and `tokens.css`, and keep the
   two files in sync. Add new tokens in the same format. Fix the `[object Object]` values of
   `--duration-fast` and `--duration-spin` at the source, then remove the override in `index.css`.
8. **JSX changes may only** add wrapper elements, add or change `className`, or add decorative
   `aria-hidden="true"` elements (SVG icons, cover gradients, the logo mark). Use CSS (grid areas,
   `order`) for visual placement. Do not reorder DOM elements in a way that changes reading order or
   heading order.
9. **Do not edit or delete tests** to make them pass. If a test fails because of your change, fix
   your change.
10. Meet WCAG 2.2 AA: 4.5:1 for text (including white text on the hero gradient; add a dark scrim as
    in the mockups), 3:1 for UI borders and icons, visible focus, 44px touch targets, and respect for
    `prefers-reduced-motion`.

## How to work
1. Make a short plan for this phase: for each mockup screen in the phase, list the real components
   and files it maps to, and what you will change in each.
2. Make the changes. Match the existing code style: tokens through `var(--…)`, the existing comment
   density, no inline `style={{}}` for design values.
3. Verify. All of these must pass:
   - `pnpm --dir apps/web typecheck`
   - `pnpm --dir apps/web test`
   - `pnpm --dir apps/web e2e`
   - `git diff --stat` shows no file under `services/` and none of the protected files from rule 2.
4. Start the app with `pnpm start` (local mode; demo account `demo@example.com` /
   `demo-password-1`). Open each screen this phase touched at 390px and 1280px wide. Put it side by
   side with its mockup PNG and fix visible differences in look. In DevTools → Network, confirm there
   are no requests to any host other than the app origin.
5. If you can take screenshots, save after-screens for this phase to
   `docs/design/after/phase-<PHASE>/` with the same names as the mockups.
6. Report the result:
   - files changed
   - for each screen touched: how close it is to its mockup, and any deliberate differences
   - the output of the test commands
   - anything from the mockups or spec you skipped because it would break a rule, and why

If a mockup or spec item would require a behaviour, copy or API change, **skip it and list it in
your report**. Do not work around the rules.
