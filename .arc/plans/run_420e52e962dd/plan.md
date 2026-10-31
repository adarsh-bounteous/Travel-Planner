summary: |
  Make the trip page (TripDetailPage) feel like its destination. A fixed, tested palette table maps each seeded destination (Lisbon, Kyoto, plus the Marrakech and Paris sets the approved prototype shows) to one named palette, and every other destination to a neutral slate default built from existing tokens. The page wrapper carries the palette as `--pal-*` custom properties; the hero, hero art, selected tab, tab underline, selected chip and breadcrumb links read them. `--color-primary` stays only on action buttons. The page is declared light-only (`color-scheme: light`) so a dark OS changes nothing. Contrast (4.5:1 hero text, 3:1 large text and controls) and palette distinctness are enforced by unit tests over the palette table.
scope:
  - description: |
      Palette table and resolver. New module with the five palettes from the prototype's palette block, the colour literals living ONLY here (index.css is held to a no-literal test).

      ```ts
      export type PaletteName = 'lisbon' | 'kyoto' | 'marrakech' | 'paris' | 'neutral'
      export type Palette = {
        name: PaletteName
        label: string // 'Lisbon tile blues', 'Kyoto lacquer reds', 'Marrakech terracotta', 'Paris dusk plum', 'Neutral slate'
        hero: string; accent: string; subtle: string; ink: string; sky: string; sun: string; deep: string
      }
      export const PALETTES: Record<PaletteName, Palette>
      export function paletteForDestination(destination: string | undefined): Palette
      export function paletteForTrip(trip: { place?: string | null; country?: string | null; destination?: string | null }): Palette
      export function paletteStyle(p: Palette): CSSProperties // { '--pal-hero': ..., '--pal-accent': ..., ... }
      ```

      `paletteForTrip` reuses `illustrationRefOfTrip` from `apps/web/src/illustrations/registry.ts` to read the destination, then lower-cases and trims it and looks it up. A pure table lookup: same input always gives the same palette (AC6), no randomness. Unknown or empty gives `neutral` (AC5). Hex values come from the prototype (lisbon hero #1e3a8a, accent #3b5fc0; kyoto #9f1d20, #b4232a; marrakech #8c3f14, #b45309; paris #4a3f6b, #6d4fa3; full sets in the design's palette block). The neutral palette uses `var(--color-fg-muted)`, `var(--color-border-strong)`, `var(--color-surface)`, `var(--color-fg)`, `var(--color-border)`, `var(--color-skeleton)`.
    files:
      - apps/web/src/trips/tripPalettes.ts
      - apps/web/src/trips/tripPalettes.test.ts
    rationale: |
      One fixed, tested source of truth (AC1, 5, 6, 9). Literals sit in TS rather than index.css so the existing "uses tokens, not colour literals" test in designSystem.test.ts keeps passing.
  - description: |
      Wire the palette into TripDetailPage. Wrap the page's root `div.stack.stack-lg` with `className="stack stack-lg trip-page"`, `data-palette={palette.name}` and `style={paletteStyle(palette)}`, computed once with `paletteForTrip(trip)`. Pass the palette to the hero: `<ImageHero variant="palette" ...>` (see next item). Do NOT touch `.btn-primary` (Book trip) or the other action buttons.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/TripDetailPage.test.tsx
    rationale: AC1, 4, 5, 6. Only the trip page scopes the palette, so other screens and the itinerary cover are unchanged.
  - description: |
      Extend ImageHero and ImageFrame (both existing in the component catalogue) rather than adding components.

      - `ImageHero` gets `variant?: 'hero' | 'cover' | 'palette'`. The `palette` variant follows the prototype's `.hero`: a two-column grid from 48rem (3fr text, 2fr art), single column on phones. The text panel (`.hero-text`) is a SOLID `--pal-hero` background with the title and dates in `--color-bg`, never on the art, so contrast is deterministic (AC7). The `hero` and `cover` variants keep today's scrim and behaviour.
      - `ImageFrame` gets an optional `palette?: boolean` (or the same `variant`) that renders the prototype's inline SVG scene (sky, sun, hill, deep, line) instead of the `<img>`. The scene's fills are `fill: var(--pal-sky)`, `var(--pal-sun)`, `var(--pal-accent)`, `var(--pal-deep)`, and the line stroke is `var(--pal-subtle)`. Current art is loaded through `<img>` from `illustrations/art/*.svg`, and an `<img>` SVG cannot read page CSS variables, so the palette scene must be inline. Keep `role="img"` and an alt-style `aria-label` ("Illustration in the trip's palette", from the prototype).
    files:
      - apps/web/src/components/ImageHero.tsx
      - apps/web/src/components/ImageFrame.tsx
      - apps/web/src/components/ImageHero.test.tsx
      - apps/web/src/components/ImageFrame.test.tsx
    rationale: AC1, 5, 7, 8. Solid panel resolves the prototype's "text over image" contrast need; extending the catalogue components follows the reuse rule.
  - description: |
      Stylesheet. In `apps/web/src/index.css` add, using tokens only (no hex, no raw px):

      - `:root { color-scheme: light; }`, with no `prefers-color-scheme` rule (AC2). Also add `<meta name="color-scheme" content="light">` to `apps/web/index.html`.
      - `.hero-palette` (grid, `border-radius: var(--radius-lg)`, `background: var(--pal-hero)`), `.hero-text` (padding `--space-4`/`--space-3` phone, `--space-5` at 48rem, `min-height: var(--size-preview-frame)` phone and 0.75 of it from 48rem, text `color: var(--color-bg)`), `.art-sky/.art-sun/.art-hill/.art-deep/.art-line` classes.
      - `.trip-page .crumbs a { color: var(--pal-ink) }`.
      - `.trip-page .tab[aria-selected="true"] { color: var(--pal-ink); border-bottom-color: var(--pal-accent) }`, `.trip-page .tab:hover { background: var(--pal-subtle); color: var(--pal-ink) }`.
      - `.trip-page .tab-indicator { background: var(--pal-accent) }` (it is `--color-primary` today at index.css line 192).
      - `.trip-page .chip:hover { background: var(--pal-subtle) }` and `.trip-page .chip[aria-pressed="true"], .trip-page .chip.is-selected { background: var(--pal-subtle); border-color: var(--pal-accent); color: var(--pal-ink); font-weight: var(--font-weight-bold) }` with the check icon shown only when selected, so selection is not colour alone (AC10).
      - Keep `.btn-primary` rules untouched (AC4).
      - Remember the existing reduced-motion block stays the only one; add no new `@media (prefers-reduced-motion)`.
    files:
      - apps/web/src/index.css
      - apps/web/index.html
      - apps/web/src/designSystem.test.ts
    rationale: AC2, 3, 4, 10. All palette colour flows through `--pal-*`, scoped to `.trip-page`, so primary cannot leak into hero, accents or art.
tests:
  - |
    AC1 and AC9, tripPalettes.test.ts, written first and failing (module absent):
    ```ts
    const seeded = ['lisbon', 'kyoto', 'marrakech', 'paris'] as const
    it.each(seeded)('%s has its own named palette', (d) => {
      expect(paletteForDestination(d).name).toBe(d)
    })
    it('every palette differs in colour from every other', () => {
      const heroes = Object.values(PALETTES).map((p) => p.hero)
      expect(new Set(heroes).size).toBe(heroes.length)
      const accents = Object.values(PALETTES).map((p) => p.accent)
      expect(new Set(accents).size).toBe(accents.length)
    })
    ```
    Plus a test that the sample-seed destinations ("Lisbon", "Kyoto" in services/api/app/local_seed.py `_SAMPLE_TRIPS`) each resolve to a non-neutral palette: `expect(paletteForTrip({ destination: 'Kyoto' }).name).toBe('kyoto')`.
  - |
    AC1 and AC5 and AC6, TripDetailPage.test.tsx (render with a Lisbon trip, then a trip to "Atlantis"):
    ```ts
    expect(container.querySelector('.trip-page')).toHaveAttribute('data-palette', 'lisbon')
    expect(container.querySelector('.trip-page')).toHaveStyle({ '--pal-hero': PALETTES.lisbon.hero })
    // unmatched
    expect(container.querySelector('.trip-page')).toHaveAttribute('data-palette', 'neutral')
    ```
    Repeat: render twice and `expect(paletteForTrip(trip)).toBe(paletteForTrip(trip))` (same object, no randomness). A place/country pair such as `{ place: 'Lisbon', country: 'Portugal' }` also gives lisbon.
  - |
    AC2, designSystem.test.ts:
    ```ts
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/)
    expect(css).not.toMatch(/prefers-color-scheme/)
    expect(readFileSync(resolve(__dirname, '../index.html'), 'utf8')).toMatch(/<meta name="color-scheme" content="light">/)
    ```
    In jsdom, `window.matchMedia('(prefers-color-scheme: dark)')` is mocked as matching and the trip page still renders `.trip-page` with no dark class or attribute.
  - |
    AC3, tripPalettes.test.ts and designSystem.test.ts. Palette colours never equal primary, and no palette rule references it:
    ```ts
    const primary = tokenHex('color-primary').toLowerCase()
    for (const p of Object.values(PALETTES)) {
      for (const v of [p.hero, p.accent, p.subtle, p.ink, p.sky, p.sun, p.deep]) {
        expect(resolveHex(v).toLowerCase()).not.toBe(primary)
      }
    }
    // stylesheet: palette-scoped rules never mention --color-primary
    const rules = css.match(/\.(trip-page|hero-palette|hero-text|art-[a-z]+)[^{]*\{[^}]*\}/g) ?? []
    for (const r of rules) expect(r).not.toContain('--color-primary')
    ```
    Also `.trip-page .tab-indicator` must set `background: var(--pal-accent)`.
  - |
    AC4, TripDetailPage.test.tsx and designSystem.test.ts. Action buttons still use primary, for every palette:
    ```ts
    expect(screen.getByRole('button', { name: 'Book trip' })).toHaveClass('btn-primary')
    expect(css).toMatch(/\.btn-primary\s*\{[^}]*var\(--button-primary-background\)/)
    expect(css).not.toMatch(/\.trip-page[^{]*\.btn-primary/)
    ```
    (`--button-primary-background` is `var(--color-primary)` in design-system/tokens.css, and no palette rule overrides it.)
  - |
    AC5, covered by the TripDetailPage case above plus:
    ```ts
    expect(paletteForDestination('Atlantis').name).toBe('neutral')
    expect(paletteForDestination(undefined).name).toBe('neutral')
    expect(paletteForTrip({ destination: null }).name).toBe('neutral')
    ```
  - |
    AC6, tripPalettes.test.ts: the lookup is a pure function.
    ```ts
    for (let i = 0; i < 20; i++) expect(paletteForDestination('Kyoto')).toBe(PALETTES.kyoto)
    expect(paletteForDestination('  KYOTO ')).toBe(PALETTES.kyoto)
    ```
  - |
    AC7, tripPalettes.test.ts. Hero text is white (`--color-bg`) on a solid hero colour, so the ratio is computed per palette with the same `lum`/`ratio` helpers as designSystem.test.ts (move them to a shared test helper, or duplicate them). Neutral values are resolved from tokens.css through `resolveHex`.
    ```ts
    it.each(Object.values(PALETTES))('$name hero text on hero panel is at least 4.5:1', (p) => {
      expect(ratio(tokenHex('color-bg'), resolveHex(p.hero))).toBeGreaterThanOrEqual(4.5)
    })
    ```
    ImageHero.test.tsx: the `palette` variant renders the title inside `.hero-text`, not inside the art frame, and renders no `.scrim`.
  - |
    AC8, tripPalettes.test.ts. Accent (tab underline, chip border, art hill, day-card rule) must hold 3:1 on the white page, and ink must hold 4.5:1 on white and on subtle (selected tab and chip text):
    ```ts
    it.each(Object.values(PALETTES))('$name accent is at least 3:1 on white', (p) => {
      expect(ratio(tokenHex('color-bg'), resolveHex(p.accent))).toBeGreaterThanOrEqual(3)
    })
    it.each(Object.values(PALETTES))('$name ink is at least 4.5:1 on white and on subtle', (p) => {
      expect(ratio(tokenHex('color-bg'), resolveHex(p.ink))).toBeGreaterThanOrEqual(4.5)
      expect(ratio(resolveHex(p.subtle), resolveHex(p.ink))).toBeGreaterThanOrEqual(4.5)
    })
    ```
    Large text and controls over the hero use the same hero-on-white-text pair (at least 4.5:1, which satisfies 3:1). The hero art carries no text, and ImageHero.test.tsx asserts it is `aria-hidden`/`role="img"` with no text children.
  - |
    AC10, designSystem.test.ts and TripDetailPage.test.tsx. The selected tab and chip use palette variables, never primary:
    ```ts
    expect(css).toMatch(/\.trip-page \.tab\[aria-selected="true"\]\s*\{[^}]*var\(--pal-ink\)[^}]*var\(--pal-accent\)/)
    expect(css).toMatch(/\.trip-page \.chip\[aria-pressed="true"\][^{]*\{[^}]*var\(--pal-subtle\)/)
    const sel = css.match(/\.trip-page \.(tab|chip)\[[^{]*\{[^}]*\}/g) ?? []
    for (const r of sel) expect(r).not.toContain('--color-primary')
    expect(screen.getByRole('tab', { selected: true })).toBeInTheDocument()
    ```
  - |
    Regression, run the narrow suites after each task:
    `(cd apps/web && pnpm run test -- src/trips/tripPalettes.test.ts src/trips/TripDetailPage.test.tsx src/components/ImageHero.test.tsx src/components/ImageFrame.test.tsx src/designSystem.test.ts src/trips/ItineraryPage.test.tsx)`.
    ItineraryPage.test.tsx must stay green: the itinerary cover keeps `ImageHero` variant `cover` and its scrim.
assumptions_or_open_questions:
  - |
    Seed data. The only seeded destinations in services/api/app/local_seed.py `_SAMPLE_TRIPS` are Lisbon and Kyoto. The approved prototype also shows Marrakech and Paris. I include all four named palettes plus neutral because the design is approved. If you want only Lisbon, Kyoto and neutral, drop the Marrakech and Paris entries and their tests.
  - |
    Palette literals. The prototype proposes `--pal-*` tokens "for the design system". The guidelines forbid colour literals in styling, and index.css is under a no-literal test. I keep the hex values in `apps/web/src/trips/tripPalettes.ts` and apply them as inline custom properties. Moving them into design-system/tokens.css is an alternative that needs a design-system change; I have not planned it.
  - |
    Prototype versus the current page. The prototype's trip page has an Edit trip button inside the hero, tabs named Itinerary/Stays/Money/Packing, a day-chip row and a day card with its own art. The real TripDetailPage has its action buttons outside the hero, different tabs and no day chips or day-card art. I restyle the real elements (hero, hero art, tabs, tab indicator, breadcrumb links, chips that appear on the trip page) and do not add the prototype's day chips, day card or in-hero button. So "illustrations" on the trip page is the hero art only.
  - |
    AC3 versus the prototype's white ring. The prototype puts a white ring on its in-hero Edit trip button for 3:1. Since the real hero has no button, no ring is planned. If a primary button is ever placed over the hero, it needs that ring.
  - |
    Drawers and modals opened from the trip page render outside `.trip-page` and keep today's styling, including primary-coloured selection inside forms. AC10 is read as the trip page's own tabs and chips.
  - |
    The ItineraryPage cover (`/trips/:tripId/itinerary`) is a separate page and is not re-themed. The brief says "trip page"; say so if you want it themed too.
  - |
    Contrast numbers for the prototype's hex values are not yet computed. If a pair misses its threshold, the failing test will show it, and I would darken that one value rather than loosen the threshold.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — front-end styling only. No schema, stored data, seed, setting or env var changes. The services/api seed (Lisbon, Kyoto) is read only as a reference for which destinations to cover; it is not edited.

  ### Token loading

  design-system/tokens.css is imported by apps/web/src/index.css line 2 (`@import "../../../design-system/tokens.css"`), after `@import "tailwindcss"` on line 1. Tailwind is part of the confirmed stack, but index.css is plain token-driven CSS, so this plan extends index.css the same way. Tokens used: `--color-bg`, `--color-fg`, `--color-fg-muted`, `--color-surface`, `--color-border`, `--color-border-strong`, `--color-skeleton`, `--space-1..5`, `--radius-lg`, `--radius-md`, `--border-width`, `--border-width-strong`, `--size-preview-frame`, `--font-weight-bold`. `--color-primary` is used by no new rule.

  ### Design reference

  Read from the approved prototype: screen "Trip page, seeded destination" (breadcrumbs, `.hero` with `.hero-text` on a solid `--pal-hero` and an SVG `.hero-art`, tabs with a palette ink and accent underline, chips with palette tint and a check icon), screen "Trip page, unmatched destination" (neutral slate palette built from existing neutral tokens) and screen "Palette set". The prototype's `.hero` is a two-column grid from 48rem and one column below, which I follow. The prototype's state switcher bar is review-only and is not built.

  ```mermaid
  flowchart TD
    Registry[illustrations/registry.ts illustrationRefOfTrip]
    Palettes[trips/tripPalettes.ts NEW palette table and resolver]
    TDP[trips/TripDetailPage.tsx wraps page in trip-page and sets --pal vars]
    Hero[components/ImageHero.tsx palette variant solid text panel]
    Frame[components/ImageFrame.tsx inline SVG scene reading --pal vars]
    CSS[index.css palette-scoped rules and color-scheme light]
    HTML[index.html color-scheme meta]
    Itin[trips/ItineraryPage.tsx cover, unchanged]
    Registry --> Palettes
    Palettes --> TDP
    TDP --> Hero
    Hero --> Frame
    CSS -.styles.-> TDP
    CSS -.styles.-> Hero
    Itin --> Hero
    classDef touched fill:#f96,color:#000
    class Palettes,TDP,Hero,Frame,CSS,HTML touched
  ```

  Order of work (TDD): tripPalettes.test.ts then tripPalettes.ts; ImageFrame and ImageHero tests then components; designSystem.test.ts additions then index.css and index.html; TripDetailPage tests then the wiring.
review_focus: |
  IN: palette table and resolver, TripDetailPage wrapper, ImageHero `palette` variant, ImageFrame inline-SVG scene, palette-scoped CSS, light-only declaration. OUT: per-region palettes, the itinerary cover, the prototype's day chips and day card, drawers and modals. Riskiest: contrast (the hex values come from the prototype and are only proven by the new tests) and the CSS scoping, since the existing `.tab[aria-selected]`, `.tab-indicator` and `.chip[aria-pressed]` rules use `--color-primary` and must be overridden under `.trip-page` without touching `.btn-primary`. Deliberate: palette hex lives in TS, not index.css, because index.css is tested to contain no colour literals; the hero text sits on a solid panel, not over the art, which is how the prototype satisfies the 4.5:1 rule.
