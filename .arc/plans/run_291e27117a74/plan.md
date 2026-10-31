summary: |
  Put the existing `ImageFrame` (16:9, reserved space via `aspect-ratio`, blur placeholder, fade-in) on every listed surface: trip cards (My trips), the trip hero (`TripDetailPage`), recommendation cards, place cards, option cards, empty states and the itinerary document cover. Destination art is used for trips, hero and cover; place-type art for recommendation, place and option cards; a new neutral `generic` illustration is the fallback everywhere nothing matches. Text over images (hero, cover) sits on a token-built scrim. Hero and cover images get non-empty alt text; card and empty-state images are hidden from screen readers. This is web-only: no API, schema or data change.
scope:
  - description: |
      Add a neutral generic illustration and make `resolveIllustration` never fall through to a missing key.
      Today `IllustrationRef.placeType` is required and the last fallback is `type/${placeType}`; a trip with no destination, or a recommendation with no place, has no type. Change to:
      ```ts
      export type IllustrationRef = { destination?: string; country?: string; placeType?: PlaceType }
      // destination art -> region art -> type art -> 'generic/generic'
      export function resolveIllustration(ref: IllustrationRef): string
      ```
      Add `art/generic.svg` (modelled on `#ill-generic` in the prototype: tokens-neutral greys, hills and a sun) and `generic: 'generic'` in `FOLDERS`. Only keys present in `illustrationLoaders` may be returned.
    files:
      - apps/web/src/illustrations/registry.ts
      - apps/web/src/illustrations/art/generic.svg
      - apps/web/src/illustrations/registry.test.ts
    rationale: |
      AC13. Without this, an unmatched destination with no place type would request a key that has no loader and the frame would stay blank.
  - description: |
      Scrim + hero building block, reusing `ImageFrame`. New `HeroImage` renders `ImageFrame ratio="16/9"` plus a `.scrim` element and the title/dates children above it, matching the prototype's `.hero` grid (art, scrim, `.hero-title`, `.hero-dates`). Props: `illustration: IllustrationRef`, `alt: string` (required, non-empty), `children`.
      CSS in `index.css`, tokens only: `.hero` (grid, `--radius-lg`), `.scrim` (`linear-gradient` over `color-mix(in srgb, var(--color-overlay) 85% / 55% / transparent)`), `.hero-title`/`.hero-dates` in `--color-on-primary`, padding `--space-4`/`--space-3`, title `--font-size-xl`.
      Existing `.cover` rules (the 4:3 gradient class at index.css:380 and the itinerary cover at :573) clash on name; rename the gradient one with the PlaceCover removal below and the itinerary cover to `.itin-cover`.
    files:
      - apps/web/src/components/HeroImage.tsx
      - apps/web/src/components/HeroImage.test.tsx
      - apps/web/src/index.css
    rationale: |
      AC7, AC11. One reusable scrim shared by hero and cover (the prototype flags the scrim as a reusable piece).
  - description: |
      Trip card: in `TripRow` (`MyTripsPage.tsx`) replace the gradient `<div className="trip-cover" aria-hidden>` with a decorative `ImageFrame`:
      ```tsx
      <ImageFrame ratio="16/9" illustration={{ destination: trip.place ?? trip.destination ?? undefined, country: trip.country ?? undefined }} />
      ```
      No `alt` is passed, so `ImageFrame` already sets `aria-hidden`. Drop `.trip-cover` CSS; keep `.trip-row` padding 0 / overflow hidden so the image is flush to the card edge like the prototype's `.media-card .imgc` (radius 0).
    files:
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/MyTripsPage.test.tsx
      - apps/web/src/index.css
    rationale: AC1, AC9, AC10, AC12, AC13.
  - description: |
      Trip hero: in `TripDetailPage.tsx` replace `<header className="trip-hero">` content with `HeroImage` wrapping `<h1>{trip.name}</h1>` and the dates. Keep the header landmark (`aria-label="Trip"`), and keep the destination line and badges outside the scrim text only if they are needed by existing tests. Alt text: `Illustration of ${trip.destination}` or `Travel illustration` when there is no destination. Remove the old `.trip-hero` gradient rules.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/TripDetailPage.test.tsx
      - apps/web/src/index.css
    rationale: AC2, AC7, AC9, AC10, AC11, AC13.
  - description: |
      Itinerary document cover: in `Document` (`ItineraryPage.tsx`) replace `.cover-art` (icon on a tinted block) with `HeroImage` using `cover.destinations[0]` and alt `Illustration of ${destination}` (generic alt otherwise). Name and dates move onto the scrim as in the prototype's `.hero.cover`; keep `id="cover"` and `aria-labelledby="cover-h"`. The destinations line stays in `.cover-body` below the image. Print: the scrim stays so white text remains readable.
    files:
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/trips/ItineraryPage.test.tsx
      - apps/web/src/index.css
    rationale: AC5, AC7, AC9, AC10, AC11, AC13.
  - description: |
      Place and recommendation cards: replace `PlaceCover` with `ImageFrame` in `PlaceCard.tsx` (`illustration={{ placeType: place.place_type }}`) and `TripRecommendationsTab.tsx` (`placeType: r.place?.place_type`, so a recommendation without a place gets the generic art). Both are decorative (no alt). Delete `PlaceCover.tsx`, its test and the `.cover-0..3` gradient CSS once nothing imports it (Grep first; `SavedPage`, `ExplorePage` and `DestinationResultsPage` tests reference `place-cover` and must move to the new frame).
    files:
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/places/PlaceCard.test.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/trips/TripRecommendationsTab.test.tsx
      - apps/web/src/places/PlaceCover.tsx
      - apps/web/src/places/PlaceCover.test.tsx
      - apps/web/src/saved/SavedPage.test.tsx
      - apps/web/src/explore/ExplorePage.test.tsx
      - apps/web/src/places/DestinationResultsPage.test.tsx
      - apps/web/src/index.css
    rationale: AC3, AC4, AC9, AC10, AC12, AC13.
  - description: |
      Option cards: extend `OptionCard` with an optional image on top, and wire it only where an option has a place type.
      ```tsx
      type OptionCardProps = { /* existing */ illustration?: IllustrationRef }
      // renders <ImageFrame ratio="16/9" illustration={illustration} /> as the first child when set
      ```
      Wire `RestaurantOptionsPage.tsx` (`placeType: 'food'`) and `ActivityOptionsPage.tsx` (activity `kind` mapped to a place type, default `landmark`). Add a small `.option-card-image` rule so the image bleeds to the card edge. Cards with no illustration prop render as before (stays, flights, insurance, SIM keep their layout).
    files:
      - apps/web/src/components/OptionCard.tsx
      - apps/web/src/components/OptionCard.test.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/ActivityOptionsPage.tsx
      - apps/web/src/index.css
    rationale: AC8, AC9, AC10, AC12, AC13.
  - description: |
      Empty states: add `EmptyStateArt` (an `ImageFrame ratio="16/9"` with the generic illustration, decorative, `max-width: 22rem` per the prototype's `.empty-state .imgc`) and render it as the first child of every `className="empty-state"` element. Enumerate sites with `Grep 'empty-state' apps/web/src --glob '!*.test.*'` (about 30: My trips, Explore, Saved, NotFound, destination results, itinerary tabs and pages, option pages, travel search, local pages, invite, etc.). A source-scan test fails if any non-test `.tsx` has `className="empty-state"` in a file that does not import `EmptyStateArt`.
    files:
      - apps/web/src/components/EmptyStateArt.tsx
      - apps/web/src/components/EmptyStateArt.test.tsx
      - apps/web/src/index.css
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/NotFoundPage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/places/AddPlaceNoTripsPage.tsx
      - apps/web/src/local/LocalInboxPage.tsx
      - apps/web/src/travel/TravelSearchPage.tsx
      - apps/web/src/travel/LocalBookingPage.tsx
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/trips/ItineraryPage.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/trips/StayOptionsPage.tsx
      - apps/web/src/trips/ChosenStayCard.tsx
      - apps/web/src/trips/SimOptionsPage.tsx
      - apps/web/src/trips/RestaurantCompare.tsx
      - apps/web/src/trips/RestaurantShortlistPage.tsx
      - apps/web/src/trips/RestaurantsCard.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/FlightShortlistPage.tsx
      - apps/web/src/trips/StayShortlistPage.tsx
      - apps/web/src/trips/StaysSection.tsx
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/trips/InsuranceComparePage.tsx
      - apps/web/src/trips/InvitePage.tsx
      - apps/web/src/trips/AccessSection.tsx
      - apps/web/src/trips/DestinationGate.tsx
      - apps/web/src/trips/MedicalGuidancePage.tsx
      - apps/web/src/trips/AddActivityDrawer.tsx
      - apps/web/src/trips/TravelersTab.tsx
      - apps/web/src/trips/TransportTab.tsx
    rationale: |
      AC6, AC12, AC13. Many one-line edits; the source-scan test keeps the list honest if the Grep count differs. Inline empty states inside a drawer or a list row (`AddActivityDrawer`, `TravelersTab`, `TransportTab`) get the art too, as AC6 says "a screen shows an empty state", but see the open question on those.
tests:
  - |
    AC13 first (registry). In `registry.test.ts`:
    ```ts
    expect(resolveIllustration({ destination: 'Atlantis' })).toBe('generic/generic')
    expect(resolveIllustration({})).toBe('generic/generic')
    expect(resolveIllustration({ placeType: 'food' })).toBe('type/food')
    expect(illustrationLoaders).toHaveProperty(['generic/generic'])
    ```
  - |
    AC1, AC12, AC13 (MyTripsPage.test.tsx). Render a trip with `place: 'Lisbon'`; the card's frame loads `destination/lisbon` and is hidden:
    ```tsx
    const card = (await screen.findByRole('heading', { name: 'Lisbon weekend' })).closest('li')!
    await waitFor(() => expect(card.querySelector('.imgc img')).not.toBeNull())
    expect(card.querySelector('.imgc img')).toHaveAttribute('aria-hidden', 'true')
    expect(card.querySelector('.imgc')).toHaveStyle({ '--ratio': '16/9' })
    ```
    Plus a trip with destination `Reykjavik` still renders an `.imgc img` (generic).
  - |
    AC2, AC7, AC11 (TripDetailPage.test.tsx). The header holds an image with alt and a scrim over it:
    ```tsx
    const hero = await screen.findByRole('banner', { name: 'Trip' })  // header aria-label="Trip"
    const img = await within(hero).findByRole('img', { name: /Lisbon/ })
    expect(img.getAttribute('alt')).not.toBe('')
    expect(hero.querySelector('.scrim')).not.toBeNull()
    ```
    Without a destination the alt is still non-empty.
  - |
    AC7 (HeroImage.test.tsx). The scrim follows the image in the DOM and the text follows the scrim; and CSS uses tokens:
    ```ts
    expect(css).toMatch(/\.scrim\s*\{[^}]*var\(--color-overlay\)/)
    expect(css).not.toMatch(/\.scrim\s*\{[^}]*#[0-9a-f]{3,8}/i)
    ```
  - |
    AC3, AC12, AC13 (TripRecommendationsTab.test.tsx). A recommendation with `place.place_type: 'museum'` loads `type/museum` art and is `aria-hidden`; one with `place: null` renders generic art (`.imgc img` present, no `place-cover` testid).
  - |
    AC4, AC12, AC13 (PlaceCard.test.tsx):
    ```tsx
    render(<PlaceCard place={{ ...place, place_type: 'park' }} saved={false} onToggleSave={vi.fn()} />)
    await waitFor(() => expect(container.querySelector('.imgc img')).not.toBeNull())
    expect(container.querySelector('.imgc img')).toHaveAttribute('aria-hidden', 'true')
    ```
    Update the Saved, Explore and Destination results tests that looked for `place-cover`.
  - |
    AC5, AC7, AC11 (ItineraryPage.test.tsx). With `cover.destinations: ['Lisbon']`:
    ```tsx
    const cover = document.getElementById('cover')!
    const img = await within(cover).findByRole('img', { name: /Lisbon/ })
    expect(img.getAttribute('alt')).not.toBe('')
    expect(cover.querySelector('.scrim')).not.toBeNull()
    ```
    With no destinations the cover still shows an image with non-empty alt.
  - |
    AC6, AC12 (EmptyStateArt.test.tsx). Render `<EmptyStateArt />`; the frame contains an image with `aria-hidden="true"`. Source-scan test:
    ```ts
    const files = globSync('src/**/*.tsx', { cwd: webRoot }).filter((f) => !f.endsWith('.test.tsx'))
    const missing = files.filter((f) => /className="empty-state"/.test(read(f)) && !/EmptyStateArt/.test(read(f)))
    expect(missing).toEqual([])
    ```
    Plus MyTripsPage "No trips yet" shows an `.imgc` inside `.empty-state`.
  - |
    AC8, AC12, AC13 (OptionCard.test.tsx, RestaurantOptionsPage and ActivityOptionsPage tests). `OptionCard` with `illustration={{ placeType: 'food' }}` renders `.imgc` before the heading, hidden from screen readers; without the prop no `.imgc` is rendered:
    ```tsx
    expect(container.querySelector('.option-card > .imgc')).not.toBeNull()
    expect(container.querySelector('.imgc img')).toHaveAttribute('aria-hidden', 'true')
    ```
    Restaurant options show `type/food` art.
  - |
    AC9, AC10 (ImageFrame.test.tsx / CSS checks, extending the existing ones). On every surface the frame has `--ratio: 16/9`, and `.imgc` keeps `aspect-ratio: var(--ratio)` so the box exists before the image loads. Assert on each surface test that `.imgc` is in the DOM synchronously, before `img` appears:
    ```tsx
    const { container } = render(<PlaceCard ... />)
    expect(container.querySelector('.imgc')).toHaveStyle({ '--ratio': '16/9' })
    expect(container.querySelector('.imgc img')).toBeNull() // frame already reserved
    ```
    Run narrow: `(cd apps/web && pnpm run test -- src/components src/illustrations src/trips/MyTripsPage.test.tsx)` and then the full command.
assumptions_or_open_questions:
  - |
    Reviewed the prototype at `designs/.../TRAVEL-PLANNER-APP-STORY-118-design.html` lines 1-1000 and spot-checked the screens by Grep (trips list, hero, cover, no-results empty state). I did not read the card screens at lines 1100-1272 line by line, only their generated markup helper; the implementer should open those when styling `.media-card` bodies.
  - |
    The prototype draws art as inline SVG; production `ImageFrame` loads the SVG as an `<img>` via the registry. I follow production for the loading mechanism and the prototype for layout, scrim and a11y. The prototype's `hero` and `cover` alt text ("Illustration of Lisbon: terracotta rooftops...") is a free-form description; I use `Illustration of <destination>`. Say if you want per-destination descriptions in the registry.
  - |
    AC8 says "an option at a place of a given type", but only restaurants and activities carry something that maps to a place type. I wired just those two. Stays, flights, insurance and SIM option cards have no place type and are left unchanged. Tell me if they should show generic art instead.
  - |
    Only 5 type illustrations, 2 destination (lisbon, tokyo) and 2 region (europe, asia) arts exist in `illustrations/art`. The prototype also draws Kyoto, Paris, Porto, bakery, sight and park scenes. I do not add any of them beyond `generic`, as no AC asks for more art; those destinations fall back to region art, then generic.
  - |
    The prototype's "replay" button on the Trips screen is a demo-only control for the loading state and is not built.
  - |
    Hero keeps the destination text line and the unmatched badge; the prototype hero shows only the title and dates on the scrim. I keep the destination line below the scrim only if a current test needs it. Confirm whether it can move.
  - |
    Empty states inside a drawer (`AddActivityDrawer`) or a list row (`TravelersTab`, `TransportTab`) are tiny inline messages; a 22rem-wide 16:9 image may look heavy there. AC6 reads as covering all empty states, so I included them. Say if these should be excluded.
  - |
    Existing bundle size test (`bundleBaseline.test.ts`) may need its baseline checked, since one more SVG chunk and three small components are added. SVGs are lazy chunks, so the main bundle should barely move.
estimated_points: 8
package_dependencies: []
notes: |
  ### Data & rollout
  None — front-end rendering only. No API, stored data, migration, setting or env var. Safe to roll back by reverting the commit.

  ### How the pieces fit
  `ImageFrame` and the registry already exist (and are unused by any screen today). They already give 16:9 via `--ratio` and `aspect-ratio` (`index.css:146`), blur placeholder and fade-in, and `aria-hidden` when no `alt` is given — so AC9, AC10 and the hidden/alt split (AC11, AC12) fall out of passing or omitting `alt`. The new work is the generic fallback, the scrim, and wiring.

  Tokens: loaded already through `apps/web/src/index.css` (the `:root` tokens and `.imgc` rules are there); no new loading step. Tokens used: `--color-overlay`, `--color-on-primary`, `--color-skeleton`, `--radius-lg`, `--radius-md`, `--space-3`, `--space-4`, `--font-size-xl`, `--blur-placeholder`, `--motion-duration-base`, `--motion-ease-out`. The scrim opacity stops (85%, 55%) are the prototype's, written as `color-mix` percentages; there is no token for them (open to a reviewer if they want one).

  ```mermaid
  flowchart TD
    Reg[illustrations/registry.ts + art/generic.svg]:::touched
    IF[components/ImageFrame.tsx]
    HI[components/HeroImage.tsx new]:::touched
    ESA[components/EmptyStateArt.tsx new]:::touched
    OC[components/OptionCard.tsx]:::touched
    MT[trips/MyTripsPage.tsx]:::touched
    TD[trips/TripDetailPage.tsx]:::touched
    IP[trips/ItineraryPage.tsx]:::touched
    PC[places/PlaceCard.tsx]:::touched
    TR[trips/TripRecommendationsTab.tsx]:::touched
    RO[trips/RestaurantOptionsPage.tsx]:::touched
    AO[trips/ActivityOptionsPage.tsx]:::touched
    ES[~30 empty-state sites]:::touched
    IF -->|resolveIllustration| Reg
    HI --> IF
    ESA --> IF
    OC --> IF
    MT --> IF
    PC --> IF
    TR --> IF
    TD --> HI
    IP --> HI
    RO --> OC
    AO --> OC
    ES --> ESA
    classDef touched fill:#f96,color:#000
  ```
review_focus: |
  IN: ImageFrame on trip cards, trip hero, itinerary cover, place and recommendation cards, restaurant and activity option cards, and every `.empty-state`; a generic fallback illustration; a shared scrim. OUT: new destination art, API or data changes, and option cards without a place type (stays, flights, insurance, SIM). Riskiest parts are the `.cover` CSS name clash between the old PlaceCover gradient and the itinerary cover, and the ~30 empty-state edits (guarded by a source-scan test); the hero must keep its `header` landmark and existing text so current tests and navigation do not break. Deliberate: hero/cover images have alt text while all card and empty-state images are `aria-hidden`, via `ImageFrame`'s existing no-`alt` behaviour.
