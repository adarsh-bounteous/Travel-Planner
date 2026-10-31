summary: |
  Add the shared building blocks later polish slices will reuse, without applying them to any screen:
  (1) a checked-in bundle baseline (`apps/web/bundle-baseline.json`) measured on the untouched tree first;
  (2) motion tokens (durations, easings, distance, blur) as CSS custom properties plus a small TS lookup, with the
  reduced-motion rule changed from "no transitions" to "fade only, no movement";
  (3) the single inline-SVG icon set, extended from the existing `apps/web/src/auth/icons.tsx` with the missing
  Suitcase, MapPin, Clock and Close icons and a name registry; (4) an `ImageFrame` component (fixed 16:9 / 4:3 / 1:1
  frame, blurred placeholder, lazy, alt handling, photo-swappable) backed by a local SVG illustration set
  (destination, then region, then place type) fetched on demand. All of it is test-first, with vitest as the
  project's unit tool.

scope:
  - description: |
      Record the bundle baseline FIRST, before any other change in this item. Add a `bundle:measure` script that runs
      after `pnpm run build`, reads `dist/assets`, and writes `bundle-baseline.json` with the main (entry) chunk and the
      largest route chunk, each as raw and gzip bytes (gzip via `node:zlib`, so no new dependency).
      Shape: `{ "measuredAt", "commit", "unit": "bytes", "main": {file, bytes, gzipBytes}, "largestRoute": {file, bytes, gzipBytes, note} }`.
      Run it on the unchanged tree (base commit 2efd6b9) and commit the JSON before the other tasks land.
    files:
      - apps/web/scripts/measure-bundle.mjs
      - apps/web/bundle-baseline.json
      - apps/web/package.json
      - apps/web/src/bundleBaseline.test.ts
    rationale: |
      AC1 needs "before" numbers, so this must precede every other change. The design's bundle card shows
      214.6 kB / 96.3 kB, but those are placeholders in the prototype. The recorded numbers must come from a real
      build, never copied from the design.

  - description: |
      Motion tokens. Add to `design-system/tokens.json` and `design-system/tokens.css` (kept in sync by hand, as the
      generator is not in the repo): `--motion-duration-fast: 150ms`, `--motion-duration-base: 220ms`,
      `--motion-duration-slow: 400ms`, `--motion-ease-out: cubic-bezier(0.16, 1, 0.3, 1)`,
      `--motion-ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`, `--motion-distance: 24px`, `--blur-placeholder: 12px`
      (the exact values in the design's `:root` proposal block).
      In `apps/web/src/index.css` add a `.motion-move` utility (transform and opacity transitions using the tokens, and
      `transform: translateX(var(--motion-distance))` for the moved state, named `.motion-move.is-moved`).
      Replace the single global reduced-motion block. Today it sets `animation: none !important; transition: none !important`,
      which would also kill a fade. The new block keeps `animation: none !important` and `scroll-behavior: auto`, forces
      `transform: none !important` on `.motion-move`, and limits transitions to opacity at `--motion-duration-base` with
      `linear` easing. This matches the design's `.reduced .motion-box` and `@media (prefers-reduced-motion: reduce)` rules.
      Add `apps/web/src/motion.ts` exporting `MOTION` (token name to `var(--motion-...)` string) and
      `prefersReducedMotion(): boolean` for JS callers.
    files:
      - design-system/tokens.json
      - design-system/tokens.css
      - apps/web/src/index.css
      - apps/web/src/motion.ts
      - apps/web/src/motion.test.ts
      - apps/web/src/designSystem.test.ts
    rationale: |
      AC2 and AC3. `designSystem.test.ts` currently asserts exactly one reduced-motion block containing
      `transition: none !important`. That assertion contradicts AC3 (a fade is a transition), so it is updated
      deliberately, not worked around. The no-raw-px test scans only index.css, so the two px token values live in the
      token files, which is where the design puts them.

  - description: |
      Icon set. Extend the existing `apps/web/src/auth/icons.tsx` (same private `Icon` wrapper, `className="icon"`,
      `aria-hidden`) with `SuitcaseIcon`, `MapPinIcon`, `ClockIcon` and `CloseIcon` (an alias of the existing `XIcon`).
      Use the path data from the design's `ic-suitcase`, `ic-map-pin` and `ic-clock` symbols. Add a typed registry:
      `export const ICONS = { home: HomeIcon, search: SearchIcon, trips: SuitcaseIcon, profile: UserIcon, calendar: CalendarIcon, 'map-pin': MapPinIcon, clock: ClockIcon, plus: PlusIcon, 'arrow-right': ArrowRightIcon, close: CloseIcon, suitcase: SuitcaseIcon } as const`.
      No icon font, no sprite file and no external request is added.
    files:
      - apps/web/src/auth/icons.tsx
      - apps/web/src/auth/icons.test.tsx
    rationale: |
      AC4, AC5, AC19. The design's icon card lists these groups: navigation Home, Search, Trips, Profile; meta row
      Dates, Location, Duration; buttons Add, Next, Close; empty state No trips yet (suitcase). Only Suitcase, MapPin,
      Clock and Close are missing today. The design draws icons through an SVG sprite and `<use>`. The app already ships
      per-icon inline components, so the plan extends those instead of introducing a second mechanism, which keeps the
      set single.

  - description: |
      Illustration set and resolver. Add local SVGs under `apps/web/src/illustrations/art/`, each with a 160x90 viewBox
      and `preserveAspectRatio="xMidYMid slice"`, drawn only from design-token colours via `currentColor`/CSS custom
      properties (no hex literals). Files: destination `lisbon.svg`, `tokyo.svg`; region `europe.svg`, `asia.svg`;
      place type `landmark.svg`, `museum.svg`, `park.svg`, `food.svg`, `shopping.svg`.
      `apps/web/src/illustrations/registry.ts`:
      ```ts
      export const illustrationLoaders: Record<string, () => Promise<string>> // key -> lazy URL, from import.meta.glob('./art/*.svg', { query: '?url', import: 'default' })
      export type Region = 'europe' | 'asia' | 'americas' | 'africa'
      export function regionOfCountry(country: string): Region | undefined // Japan, India, Thailand -> asia; Portugal -> europe; Mexico, Peru -> americas; Morocco -> africa
      export type IllustrationRef = { destination?: string; country?: string; placeType: PlaceType }
      export function resolveIllustration(ref: IllustrationRef): string // returns a key such as 'destination/lisbon'
      ```
      Resolution order: destination art if it exists, else region art for the destination's country, else the place-type
      art. `PlaceType` is imported from `apps/web/src/places/api.ts`. The seeded countries are Japan, Portugal, India,
      Thailand, Mexico, Morocco and Peru (read from `services/api/app/trips/starter_destinations.py`).
    files:
      - apps/web/src/illustrations/registry.ts
      - apps/web/src/illustrations/registry.test.ts
      - apps/web/src/illustrations/art/lisbon.svg
      - apps/web/src/illustrations/art/tokyo.svg
      - apps/web/src/illustrations/art/europe.svg
      - apps/web/src/illustrations/art/asia.svg
      - apps/web/src/illustrations/art/landmark.svg
      - apps/web/src/illustrations/art/museum.svg
      - apps/web/src/illustrations/art/park.svg
      - apps/web/src/illustrations/art/food.svg
      - apps/web/src/illustrations/art/shopping.svg
    rationale: |
      AC13 to AC18. A lazy glob (not eager) keeps every file's URL out of the main bundle. Vite would inline small SVGs
      as data URIs if they were eagerly imported, which would inflate the main bundle that item 1 baselines. Americas
      and Africa deliberately have no region art, so Mexico City and Marrakech-style destinations exercise AC18 with
      real seeded data. Lisbon and Tokyo have their own art for AC13, and Porto and Kyoto exercise AC17.

  - description: |
      `ImageFrame` component. Signature:
      ```tsx
      export type Ratio = '16/9' | '4/3' | '1/1'
      export type ImageFrameProps = {
        ratio: Ratio
        alt?: string                       // absent or empty -> image hidden from screen readers
        photo?: { src: string; alt?: string; placeholder?: string }  // when set, replaces the illustration in the same frame
        illustration: IllustrationRef
      }
      export function ImageFrame(props: ImageFrameProps): JSX.Element
      ```
      Render a `div.imgc` frame with `style={{ '--ratio': ratio }}` (CSS `aspect-ratio: var(--ratio)`), containing a
      placeholder layer `div.imgc-blur[data-testid="image-placeholder"]` and one `<img loading="lazy" decoding="async">`.
      The illustration URL is resolved with `illustrationLoaders[key]()` in an effect, so only the displayed one is
      fetched. The placeholder is shown until the `<img>` fires `load`, then fades out with
      `var(--motion-duration-base) var(--motion-ease-out)`. With alt, set `alt={alt}`. Without alt, set `alt=""` and
      `aria-hidden="true"`. CSS in `index.css`: `.imgc` (position relative, `overflow: hidden`, `border-radius: var(--radius-md)`,
      `background: var(--color-skeleton)`, `border: var(--border-width) solid var(--color-border)`),
      `.imgc > * { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover }`,
      `.imgc-blur { filter: blur(var(--blur-placeholder)); background: var(--color-skeleton) }`, and `.imgc.is-loaded .imgc-blur { opacity: 0 }`.
      Existing `PlaceCover` and the `.cover` / `.restaurant-photo` classes are left alone (not applied to screens in this item).
    files:
      - apps/web/src/components/ImageFrame.tsx
      - apps/web/src/components/ImageFrame.test.tsx
      - apps/web/src/index.css
    rationale: |
      AC6 to AC12, AC20, AC21. The frame's size comes from CSS `aspect-ratio` on the wrapper, and all children are
      absolutely positioned, so neither a load nor a photo swap can change the frame's box. The component is named
      `ImageFrame` to avoid shadowing the DOM `Image` global. It extends the `components/` catalogue (OptionCard,
      CompareTable). The image styles use only tokens from `tokens.css` (`--color-skeleton`, `--radius-md`,
      `--border-width`, `--color-border`) plus the new motion tokens.

tests:
  - |
    AC1 (write first, fails until the file exists). `apps/web/src/bundleBaseline.test.ts`:
    ```ts
    const baseline = JSON.parse(readFileSync(resolve(__dirname, '../bundle-baseline.json'), 'utf8'))
    expect(baseline.main.bytes).toBeGreaterThan(0)
    expect(baseline.main.gzipBytes).toBeGreaterThan(0)
    expect(baseline.largestRoute.bytes).toBeGreaterThan(0)
    expect(baseline.commit).toMatch(/^[0-9a-f]{7,40}$/)
    ```
    Also assert `package.json` has a `bundle:measure` script.
  - |
    AC2. `apps/web/src/motion.test.ts`:
    ```ts
    expect(MOTION.durationFast).toBe('var(--motion-duration-fast)')
    expect(MOTION.easeOut).toBe('var(--motion-ease-out)')
    ```
    Plus, reading `design-system/tokens.css` and `index.css`, assert each of the five duration/easing tokens is defined with a real value
    (`expect(tokens).toMatch(/--motion-duration-base:\s*220ms/)`, `/--motion-ease-out:\s*cubic-bezier\(0\.16, 1, 0\.3, 1\)/`), and that none is `[object Object]`.
  - |
    AC3. In `designSystem.test.ts`, replace the old "one global reduced-motion block" test:
    ```ts
    const blocks = css.match(/@media \(prefers-reduced-motion: reduce\)/g) ?? []
    expect(blocks).toHaveLength(1)
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(rm).toMatch(/\.motion-move[^}]*transform: none !important/)
    expect(rm).toMatch(/transition-property: opacity/)
    expect(rm).not.toMatch(/transition: none/)
    ```
    jsdom does not evaluate media queries, so the rule is checked as text, matching how this file already tests CSS.
    `motion.test.ts` also stubs `matchMedia` and asserts `prefersReducedMotion()` is true when it matches.
  - |
    AC4 and AC19. `apps/web/src/auth/icons.test.tsx`:
    ```tsx
    for (const name of ['home','search','trips','profile','calendar','map-pin','clock','plus','arrow-right','close','suitcase'] as const) {
      const Icon = ICONS[name]
      const { container, unmount } = render(<Icon />)
      const svg = container.querySelector('svg.icon')
      expect(svg).not.toBeNull()
      expect(svg!.getAttribute('aria-hidden')).toBe('true')
      expect(svg!.querySelector('path,circle,rect')).not.toBeNull()
      unmount()
    }
    ```
  - |
    AC5. Add to `designSystem.test.ts`:
    ```ts
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'))
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(' ')).not.toMatch(/fontawesome|material-icons|bootstrap-icons|lucide|feather/i)
    expect(html).not.toMatch(/<link[^>]+(icon|font)/i)
    ```
    The existing no-`@font-face` and no-`https?://` checks already cover external requests.
  - |
    AC6. `ImageFrame.test.tsx`, a test per ratio:
    ```tsx
    render(<ImageFrame ratio="4/3" illustration={{ placeType: 'landmark' }} />)
    expect(container.querySelector('.imgc')).toHaveStyle('--ratio: 4/3')
    ```
    Repeated for `'16/9'` and `'1/1'`, plus `expect(css).toMatch(/\.imgc\s*\{[^}]*aspect-ratio: var\(--ratio\)/)`.
  - |
    AC7 and AC12. Capture the frame's `className` and `style` attribute before the image `load` event, fire
    `fireEvent.load(img)`, and assert both are unchanged except for the added `is-loaded` class. Re-render with
    `photo={{ src: '/p.jpg' }}` and assert the frame's `style` attribute and tag are identical.
    `expect(css).toMatch(/\.imgc > \*\s*\{[^}]*position: absolute[^}]*inset: 0/)`.
  - |
    AC8 and AC21. Before the load event:
    ```tsx
    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument()
    ```
    Run it once with a `photo` and once with an illustration only. Check `expect(css).toMatch(/\.imgc-blur\s*\{[^}]*blur\(var\(--blur-placeholder\)\)/)`.
    After `fireEvent.load(img)`, the frame has class `is-loaded`.
  - |
    AC9. `expect(img).toHaveAttribute('loading', 'lazy')` for both the photo and the illustration. The browser then
    defers the request for below-the-fold images.
  - |
    AC10 and AC20.
    ```tsx
    render(<ImageFrame ratio="1/1" alt="Lisbon hills" illustration={{ destination: 'Lisbon', placeType: 'landmark' }} />)
    expect(await screen.findByRole('img', { name: 'Lisbon hills' })).toBeInTheDocument()
    ```
    Without alt: `expect(img).toHaveAttribute('alt', '')` and `expect(img).toHaveAttribute('aria-hidden', 'true')`, and
    `expect(screen.queryByRole('img')).toBeNull()`.
  - |
    AC11. Render with only an illustration, then `rerender` with `photo={{ src: '/lisbon.jpg', alt: 'Rooftops' }}`:
    `expect(img).toHaveAttribute('src', '/lisbon.jpg')`, and no illustration URL remains.
  - |
    AC13, AC14, AC15, AC17, AC18. `registry.test.ts`:
    ```ts
    expect(resolveIllustration({ destination: 'Lisbon', country: 'Portugal', placeType: 'landmark' })).toBe('destination/lisbon')
    expect(resolveIllustration({ destination: 'Porto', country: 'Portugal', placeType: 'landmark' })).toBe('region/europe')
    expect(resolveIllustration({ destination: 'Mexico City', country: 'Mexico', placeType: 'museum' })).toBe('type/museum')
    expect(resolveIllustration({ placeType: 'park' })).toBe('type/park')
    expect(regionOfCountry('Japan')).toBe('asia')
    ```
    Every key the resolver can return has a loader, so a typo cannot fail silently:
    `for (const t of PLACE_TYPES) expect(illustrationLoaders[resolveIllustration({ placeType: t })]).toBeTypeOf('function')`.
    A component test renders a destination with no photo and asserts the resolved `img` src ends in `lisbon.svg`.
  - |
    AC16. Spy on each `illustrationLoaders[key]` (`vi.spyOn`). Render one `ImageFrame` for Lisbon, await its `img`, then:
    ```tsx
    expect(spies['destination/lisbon']).toHaveBeenCalledTimes(1)
    for (const [key, spy] of Object.entries(spies)) if (key !== 'destination/lisbon') expect(spy).not.toHaveBeenCalled()
    expect(container.querySelectorAll('img')).toHaveLength(1)
    ```
    Also assert `bundle-baseline`-style: no SVG data URI appears in the built main chunk (checked manually via `pnpm run build`).

assumptions_or_open_questions:
  - |
    The app has no route-level code splitting: App.tsx imports every page eagerly, so a build yields one entry chunk and
    no per-route chunk. For the baseline, "largest route" is recorded as the largest non-entry JS chunk, or, if there is
    none, the entry chunk with an explanatory `note` field. Adding route splitting is out of scope here. Please confirm
    that this is acceptable for AC1, or say if "largest route" should mean something else.
  - |
    The design's baseline numbers (214.6 kB main, 96.3 kB Trip) are prototype placeholders. The plan records real
    measurements from the unchanged tree and does not copy them.
  - |
    `design-system/tokens.css` is marked auto-generated, and `tokens.json` plus `tokens.css` both carry the broken
    `--duration-fast: [object Object]` values (index.css overrides them). I found no generator script, so the new motion
    tokens are added to both files by hand. Tell me if a generator exists elsewhere and should be used instead.
  - |
    The existing test in `designSystem.test.ts` that requires `transition: none !important` in the single reduced-motion block conflicts with AC3
    (reduced motion must still fade). The plan changes that test and the block, and keeps exactly one reduced-motion block.
    Existing hover and background transitions effectively become instant under reduced motion, because only opacity
    keeps a transition.
  - |
    The design renders icons via an SVG sprite and `<use>`. The plan keeps the app's existing per-component inline SVG
    approach in `auth/icons.tsx` (still inline SVG, still a single set) and does not add a sprite. The icon file stays
    under `auth/` to avoid import churn. Say if you want it moved to a shared folder.
  - |
    The seeded countries are Japan, Portugal, India, Thailand, Mexico, Morocco and Peru. Illustrations are provided for Lisbon,
    Tokyo, Europe, Asia and the five place types. Americas and Africa deliberately have no region art so the
    place-type fallback (AC18) is exercised with real data. The region mapping (country to region) is a frontend lookup,
    since the API does not carry regions. Please confirm the illustration list is enough.
  - |
    Illustration artwork is new SVG authored for this item in the style of the design's `il-*` symbols (flat shapes,
    token colours only). If design wants different art, only the SVG files change.
  - |
    No dedicated reference page or route is added (the design's "Shared building blocks" page is a review aid, and the item
    says not to apply the blocks to screens yet). AC9 and AC16 are therefore verified at component level
    (`loading="lazy"` and loader spies), not with a Playwright network log.
  - |
    The `place-type` illustration for a destination is chosen by the caller-supplied `placeType` (default landmark in
    callers). Mapping real destinations to a type is a later slice's concern.

estimated_points: 5

package_dependencies: []

notes: |
  ### Data & rollout

  None — front-end only: static assets, CSS tokens and a JSON baseline file. No database, API, stored data, seed, setting or env var changes. Safe to roll back by reverting the commit.

  ### Design reference (read in full)

  Prototype `TRAVEL-PLANNER-APP-STORY-116-design.html`, one reference page ("Shared building blocks") with four `.card` sections:
  Icon set (`.icon-tile` rows: Navigation, Meta row, Buttons, Empty state), Image component (`.imgc` frames at
  `--ratio` 16/9, 4/3, 1/1; blurred `.imgc-blur` layer; `.imgc-art` fading in on `.is-loaded`; fallback chain
  destination, region, place type), Motion tokens (the 5 tokens table, reduced-motion switch), and Bundle baseline (2-row table; file named
  `apps/web/bundle-baseline.json`). Tokens come from `design-system/tokens.css`, loaded by `apps/web/src/index.css:2`
  (`@import "../../../design-system/tokens.css"`) after `@import "tailwindcss"`. The prototype's own `:root` block proposes
  the new `--motion-*` and `--blur-placeholder` tokens. The prototype's reviewer page itself is not built.

  Prototype vs. acceptance criteria: no conflict found, except that the prototype's request log shows an illustration
  fetch as `GET illustrations/<name>.svg`, which the lazy-glob approach matches.

  Order of work (TDD): 1) baseline script, run on the untouched tree, commit JSON; 2) motion tokens and reduced-motion test update;
  3) icons; 4) registry; 5) ImageFrame. Each starts with its failing test.

  Narrow test commands, derived from the project command:
  `(cd apps/web && pnpm exec vitest run src/bundleBaseline.test.ts)`,
  `(cd apps/web && pnpm exec vitest run src/motion.test.ts src/designSystem.test.ts)`,
  `(cd apps/web && pnpm exec vitest run src/auth/icons.test.tsx)`,
  `(cd apps/web && pnpm exec vitest run src/illustrations/registry.test.ts src/components/ImageFrame.test.tsx)`.
  Finish with `(cd apps/web && pnpm run build)` and the full project test command.

review_focus: |
  IN: baseline JSON plus script, motion tokens and reduced-motion rule, icon additions and registry, `ImageFrame` and the illustration set/resolver. OUT: applying any of it to screens, route splitting, a reference page, API changes.
  Riskiest: the reduced-motion block change (it replaces an existing global rule and its existing test, deliberately, for AC3) and keeping illustration URLs out of the main bundle (lazy glob, so Vite does not inline them). Deliberate choices: icons stay as per-component inline SVG in `auth/icons.tsx` rather than the design's sprite, and the baseline must be committed from the untouched tree before other changes.
