summary: |
  Put the existing `ImageFrame` (16:9, blur placeholder, reserved space via `--ratio`) on every surface in the story: trip cards (My trips), the trip hero, place cards, recommendation cards, option cards, empty states and the itinerary document cover. Destination art goes on trips, hero and cover; place-type art goes on place, recommendation and option cards. Text over art (hero and cover) sits on a new reusable scrim. A neutral generic illustration is added to the registry and returned whenever nothing matches. Hero and cover art get non-empty alt text; art on cards and empty states stays hidden from screen readers. This builds the approved prototype (trips list, trips no-results empty state, trip hero, recommendations, places, options, itinerary document cover).
scope:
  - description: |
      Registry: add a neutral generic illustration and make `placeType` optional, so a trip (which has no place type) can resolve.
      Before: `export type IllustrationRef = { destination?: string; country?: string; placeType: PlaceType }` and `resolveIllustration` always returns `type/${placeType}` last.
      After: `placeType?: PlaceType`; the last step returns `type/${placeType}` only when that key is in `illustrationLoaders`, otherwise `'generic/generic'`. Add `generic: 'generic'` to `FOLDERS` and a new `art/generic.svg` (hills and sun, matching the prototype's `ill-generic`, colours as token-based fills like the other art files).
      Add `export function illustrationAlt(ref: IllustrationRef, subject?: string): string` returning `Illustration of ${destination}` when the key is `destination/*`, otherwise `Neutral illustration of hills and a sun` (the prototype's GENERIC_ALT). Region and type art use the generic-style neutral wording so alt is never empty.
    files:
      - apps/web/src/illustrations/registry.ts
      - apps/web/src/illustrations/art/generic.svg
    rationale: |
      AC13 needs a neutral fallback. Today an unknown destination falls to the place-type art, which is not neutral, and a trip has no place type at all. Existing registry tests keep passing because a given known placeType still resolves to `type/<t>`.
  - description: |
      Scrim and hero: new `ImageHero` component that renders `ImageFrame` (ratio 16/9, with `alt` from `illustrationAlt`), a `.scrim` element (`aria-hidden`, gradient from `--color-overlay`), then the title and dates on top in `--color-on-primary`. Props: `illustration: IllustrationRef`, `title: ReactNode` (the heading, so the page keeps its single `h1`), `dates?: ReactNode`, `variant?: 'hero' | 'cover'`. Mirrors the prototype's `.hero` grid: image, scrim and text share one grid area so the text sits above the scrim above the image.
      CSS (index.css): add `.hero`, `.hero > .imgc`, `.scrim`, `.hero-title`, `.hero-dates`. Tokens only: `--radius-lg`, `--radius-md` (cover), `--color-overlay`, `--opacity-overlay`, `--color-on-primary`, `--font-size-xl`, `--font-weight-medium`, `--space-3`, `--space-4`. Replace the old gradient `.trip-hero` rule (index.css line 223 to 225).
    files:
      - apps/web/src/components/ImageHero.tsx
      - apps/web/src/index.css
    rationale: |
      Hero and cover are the same pattern (art, scrim, text), so one component serves AC2, AC5, AC7 and AC11. The prototype marks the scrim as reusable (`data-arc-promote="scrim"`).
  - description: |
      Trip hero (AC2): in `TripDetailPage` replace the `<header className="trip-hero">` block with `<ImageHero illustration={{ destination: trip.place ?? trip.destination, country: trip.country }} title={<h1>{trip.name}</h1>} dates={...formatRange(...)} />`. Keep the destination line as text where it is today.
      Itinerary cover (AC5): in `ItineraryPage` `Document`, replace the `.cover-art` icon block with `ImageHero variant="cover"` using `cover.destinations[0]` as the destination (the itinerary `cover` has `name`, `start_date`, `end_date`, `destinations`, no country). Keep `<section className="cover" id="cover" aria-labelledby="cover-h">` and `h1#cover-h`; keep the destinations line with `HomeIcon` below if it is still wanted. Remove the now-unused `ImageIcon` import if nothing else uses it.
    files:
      - apps/web/src/trips/TripDetailPage.tsx
      - apps/web/src/trips/ItineraryPage.tsx
    rationale: |
      Both screens already carry the title and dates; only the backdrop changes. Print: the cover keeps its art (prototype notes "prints as a cover").
  - description: |
      Trip cards (AC1, AC12): in `MyTripsPage` `TripRow` replace `<div className="trip-cover" aria-hidden="true" />` with `<ImageFrame ratio="16/9" illustration={{ destination: trip.place ?? trip.destination, country: trip.country }} />` (no `alt`, so the image is hidden from screen readers). Update `.trip-row` CSS (index.css lines 306 to 309): drop `.trip-cover`, and keep the card's top corners clipped by the existing `overflow: hidden`.
      Place cards (AC4, AC12): in `PlaceCard` replace `<PlaceCover seed={place.id} />` with `<ImageFrame ratio="16/9" illustration={{ placeType: place.place_type }} />`. This also covers Explore, Saved and Destination results, which all render `PlaceCard`.
      Recommendation cards (AC3, AC12): in `TripRecommendationsTab` replace `<PlaceCover seed=... />` with `<ImageFrame ratio="16/9" illustration={{ placeType: r.place?.place_type }} />`; a recommendation with no `place` gets the generic art.
      Remove `PlaceCover` and its test, plus the `.cover-0` to `.cover-3` rules and the 4:3 `.cover` rule (index.css lines 426 to 430). Grep first that `coverVariant`, `COVER_VARIANTS` and `place-cover` are not used elsewhere. NOTE index.css has two `.cover` rules (line 426 for PlaceCover, line 619 for the itinerary cover); only the first is removed.
    files:
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/places/PlaceCard.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/places/PlaceCover.tsx
      - apps/web/src/places/PlaceCover.test.tsx
      - apps/web/src/index.css
    rationale: |
      The placeholder gradient covers (4:3) are replaced by real art in a 16:9 frame; keeping both would leave two cover systems.
  - description: |
      Option cards (AC8, AC12): extend `OptionCard` with an optional prop `illustration?: IllustrationRef`. When set it renders `<ImageFrame ratio="16/9" illustration={illustration} />` as the first child of the card (no alt, hidden from screen readers). Cards that pass nothing look exactly as today, so stays, flights, insurance, SIM and transport options are unchanged.
      Callers: `RestaurantCard` in `RestaurantOptionsPage` passes `{ placeType: 'food' }` and drops the grey "Photo placeholder" block; `ActivityCard` in `ActivityOptionsPage` passes `{}`-style generic art (see open questions: `ActivityOption` carries no place type).
    files:
      - apps/web/src/components/OptionCard.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/ActivityOptionsPage.tsx
      - apps/web/src/index.css
    rationale: |
      OptionCard is the one look for every option (catalogue component), so the image goes there as an opt-in prop rather than in each page.
  - description: |
      Empty states (AC6, AC12, AC13): new `EmptyStateArt` component rendering `<ImageFrame ratio="16/9" illustration={{}} />` (generic art, no alt, so hidden from screen readers) inside a wrapper capped at `max-width: 22rem` (prototype `.empty-state .imgc`). Insert it as the first child of each screen-level `.empty-state`: MyTripsPage, ExplorePage, SavedPage, DestinationResultsPage (2), TravelSearchPage, LocalBookingPage, LocalInboxPage (2), LocalModePage, AddPlaceNoTripsPage, NotFoundPage, SimOptionsPage, StayOptionsPage, StaysSection, ChosenStayCard, RestaurantsCard, RestaurantCompare, RestaurantOptionsPage, RestaurantShortlistPage, InsuranceOptionsPage, MedicalGuidancePage, DestinationGate, AddActivityDrawer, TripRecommendationsTab (2), ItineraryTab (3), ItineraryPage not-found state. For the Trips no-results state the prototype uses a "search" scene (`ill-search`); use the generic art unless a search illustration is added (open question).
      Inline one-liners that are not a screen's empty state (`NotYetPlanned` in ItineraryPage, "No travellers yet." in TravelersTab, "No transport picked yet" in TransportTab) are left as they are.
    files:
      - apps/web/src/components/EmptyStateArt.tsx
      - apps/web/src/index.css
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/explore/ExplorePage.tsx
      - apps/web/src/saved/SavedPage.tsx
      - apps/web/src/places/DestinationResultsPage.tsx
      - apps/web/src/places/AddPlaceNoTripsPage.tsx
      - apps/web/src/travel/TravelSearchPage.tsx
      - apps/web/src/travel/LocalBookingPage.tsx
      - apps/web/src/local/LocalInboxPage.tsx
      - apps/web/src/account/LocalModePage.tsx
      - apps/web/src/NotFoundPage.tsx
      - apps/web/src/trips/SimOptionsPage.tsx
      - apps/web/src/trips/StayOptionsPage.tsx
      - apps/web/src/trips/StaysSection.tsx
      - apps/web/src/trips/ChosenStayCard.tsx
      - apps/web/src/trips/RestaurantsCard.tsx
      - apps/web/src/trips/RestaurantCompare.tsx
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/RestaurantShortlistPage.tsx
      - apps/web/src/trips/InsuranceOptionsPage.tsx
      - apps/web/src/trips/MedicalGuidancePage.tsx
      - apps/web/src/trips/DestinationGate.tsx
      - apps/web/src/trips/AddActivityDrawer.tsx
      - apps/web/src/trips/TripRecommendationsTab.tsx
      - apps/web/src/trips/ItineraryTab.tsx
      - apps/web/src/trips/ItineraryPage.tsx
    rationale: |
      There is no shared empty-state component today, only the `.empty-state` class used at about 30 sites. A tiny shared piece plus a guard test (see tests) keeps them from drifting.
tests:
  - |
    Registry generic fallback (AC13). Add to `apps/web/src/illustrations/registry.test.ts`, fails first because `resolveIllustration` returns `type/landmark` / has no generic key:
    ```ts
    expect(resolveIllustration({ destination: 'Reykjavik' })).toBe('generic/generic')
    expect(resolveIllustration({})).toBe('generic/generic')
    expect(illustrationLoaders['generic/generic']).toBeTypeOf('function')
    expect(resolveIllustration({ destination: 'Lisbon' })).toBe('destination/lisbon')
    expect(illustrationAlt({ destination: 'Lisbon' })).toBe('Illustration of Lisbon')
    expect(illustrationAlt({ destination: 'Reykjavik' })).not.toBe('')
    ```
    The existing cases (`type/park` for `{ placeType: 'park' }`, region fallbacks) must still pass.
  - |
    Trip card (AC1, AC12, AC13) in `MyTripsPage.test.tsx`: mock `fetchTrips` with a Lisbon trip and a Reykjavik trip.
    ```ts
    const lisbon = within(await screen.findByRole('heading', { name: 'Lisbon weekend' }).closest('li')!)
    await waitFor(() => expect(lisbon.getByTestId('image-placeholder').parentElement!.querySelector('img')!.getAttribute('src')).toMatch(/lisbon\.svg/))
    expect(card.querySelector('img')).toHaveAttribute('aria-hidden', 'true')
    expect(card.querySelector('img')).toHaveAttribute('alt', '')
    // Reykjavik, no art:
    expect(reykjavikCard.querySelector('img')!.getAttribute('src')).toMatch(/generic\.svg/)
    ```
  - |
    Trip hero (AC2, AC7, AC11, AC13) in `TripDetailPage.test.tsx`:
    ```ts
    const hero = await screen.findByLabelText('Trip') // the hero region keeps aria-label="Trip"
    expect(await within(hero).findByRole('img', { name: /Lisbon/ })).toHaveAttribute('src', expect.stringMatching(/lisbon\.svg/))
    expect(hero.querySelector('.scrim')).toHaveAttribute('aria-hidden', 'true')
    expect(hero.querySelector('.scrim')!.compareDocumentPosition(hero.querySelector('h1')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    ```
    A trip with an unknown destination: `expect(img.getAttribute('alt')).not.toBe('')` and src matches `generic.svg`.
  - |
    Recommendation card (AC3, AC12, AC13) in `TripRecommendationsTab.test.tsx`: a recommendation with `place.place_type = 'museum'`:
    ```ts
    await waitFor(() => expect(card.querySelector('img')!.getAttribute('src')).toMatch(/museum\.svg/))
    expect(card.querySelector('img')).toHaveAttribute('aria-hidden', 'true')
    ```
    A recommendation with no `place` shows `generic.svg`.
  - |
    Place card (AC4, AC12) in `PlaceCard.test.tsx`; replaces the `place-cover` assertions:
    ```ts
    render(<ul><PlaceCard place={{ ...place, place_type: 'park' }} saved={false} onToggleSave={vi.fn()} /></ul>)
    await waitFor(() => expect(screen.getByRole('listitem').querySelector('img')!.getAttribute('src')).toMatch(/park\.svg/))
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByTestId('place-cover')).toBeNull()
    ```
  - |
    Itinerary cover (AC5, AC7, AC11) in `ItineraryPage.test.tsx`:
    ```ts
    const cover = await screen.findByRole('region', { name: 'Lisbon weekend' })
    expect(await within(cover).findByRole('img', { name: /Lisbon/ })).toBeInTheDocument()
    expect(cover.querySelector('.scrim')).not.toBeNull()
    ```
  - |
    Empty state (AC6, AC12, AC13): in `MyTripsPage.test.tsx` with `fetchTrips` resolving `[]`, `.empty-state` contains an `img` with `aria-hidden="true"` and `src` matching `generic.svg`. Plus a new `apps/web/src/components/EmptyStateArt.test.tsx` rendering the component and asserting the same. Plus a guard test (new `apps/web/src/emptyStates.test.ts`) that reads every non-test `.tsx` under `src` with `readdirSync` and asserts each file containing `className="empty-state"` also contains `EmptyStateArt`, except an explicit allowlist (`TravelersTab.tsx`, `TransportTab.tsx`, and the `NotYetPlanned` function in `ItineraryPage.tsx` is covered because that file also renders the not-found state).
  - |
    Scrim (AC7) in new `ImageHero.test.tsx`: the text is after the scrim in DOM order and the CSS keeps text above it.
    ```ts
    expect(css).toMatch(/\.scrim\s*\{[^}]*var\(--color-overlay\)/)
    expect(css).toMatch(/\.hero-title[^{]*\{[^}]*z-index: 2/)
    expect(css).toMatch(/\.scrim\s*\{[^}]*z-index: 1/)
    ```
  - |
    Option card (AC8, AC12) in `OptionCard.test.tsx` and `RestaurantOptionsPage.test.tsx` (if it exists; otherwise the `OptionCard` test alone):
    ```ts
    const { container } = render(<OptionCard title="Tapas" illustration={{ placeType: 'food' }} />)
    await waitFor(() => expect(container.querySelector('img')!.getAttribute('src')).toMatch(/food\.svg/))
    expect(container.querySelector('img')).toHaveAttribute('aria-hidden', 'true')
    // no illustration prop: no frame, layout unchanged
    expect(render(<OptionCard title="Hotel" />).container.querySelector('.imgc')).toBeNull()
    ```
  - |
    16:9 and no layout shift (AC9, AC10): in each of the card, hero, cover and empty-state tests above, assert the frame is reserved before the art loads:
    ```ts
    expect(container.querySelector('.imgc')).toHaveStyle({ '--ratio': '16/9' })
    expect(container.querySelector('.imgc')!.getAttribute('style')).toBe(styleBeforeLoad) // unchanged after the img appears
    ```
    `ImageFrame.test.tsx` already pins `aspect-ratio: var(--ratio)` and absolute children, so it needs no change.
assumptions_or_open_questions:
  - |
    Design vs repo art: the prototype's sprite has Lisbon, Kyoto, Paris and Porto destination art plus bakery, sight, museum and park place-type art. The repo's registry (`apps/web/src/illustrations/art`) has Lisbon and Tokyo, the Europe and Asia regions, and landmark, museum, park, food and shopping place types. The plan reuses the repo set and does not author new art beyond `generic.svg`. Kyoto and Porto therefore show their region art (Europe and Asia), not generic, and Paris shows Europe if a country is known; the prototype's "Reykjavik shows generic" case holds only when no country maps to a region. Confirm that is acceptable.
  - |
    AC13 says "a neutral generic illustration" when nothing matches. With region art in the chain, a destination whose country maps to a region shows the region art, not the generic scene. I read region art as a "matching illustration" (existing registry behaviour from the foundations story). If the reviewer wants generic for every non-destination match, drop the region step for these surfaces.
  - |
    `ActivityOption` carries no place type (OptionCard callers), so the activity option cards get the generic art. If the API exposes the place type of the place an activity is at, pass it instead. Stays, flights, insurance, SIM and transport option cards have no place and are left without art.
  - |
    Scrim opacities: the prototype uses `color-mix(in srgb, var(--color-overlay) 85%, transparent)` and 55% stops, and those percentages are not tokens. The plan uses `--color-overlay` with `--opacity-overlay` (0.5) as the one strong stop and a transparent top, and flags the weaker contrast risk: verify the white title on the lightest art (Lisbon sky) reaches AA, and if not, ask for a scrim-strength token.
  - |
    The prototype's Trips no-results state uses a dedicated search scene (`ill-search`). There is no such art in the registry; the generic scene is used. Adding a search illustration is out of scope unless the reviewer asks.
  - |
    Inline "empty" fragments (`NotYetPlanned`, travellers and transport one-liners) are treated as not being a screen's empty state and get no illustration, because a 22rem art block inside every itinerary day card would swamp the printable document. Confirm.
  - |
    The prototype puts a trip card inside a link (`<a class="card media-card">`); the repo's `TripRow` is an `li` with an Open button. The plan keeps the existing structure and only swaps the cover. The prototype's period tabs and search box on Trips are not part of this story.
  - |
    Tests rely on `ImageFrame` rendering the `<img>` after a lazy loader resolves, so assertions use `waitFor`/`findBy`. `import.meta.glob` makes `src` a URL ending in the file name in vitest (as `ImageFrame.test.tsx` already asserts for `lisbon.svg`).
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — front-end rendering only: no stored data, schema, API, setting or env var changes. The new `generic.svg` ships with the web bundle as another lazy chunk (the registry uses `import.meta.glob`, so it is not in the main bundle; `bundleBaseline.test.ts` should be re-checked in case it counts chunks).

  ### Tokens and how they load

  `apps/web/src/index.css` line 1 `@import "tailwindcss";` and line 2 `@import "../../../design-system/tokens.css";` load the tokens; the app styles with plain CSS using `var(--token)` in `index.css` (no Tailwind theme mapping). New CSS stays in `index.css` and uses only: `--color-overlay`, `--opacity-overlay`, `--color-on-primary`, `--color-skeleton`, `--radius-md`, `--radius-lg`, `--font-size-xl`, `--font-weight-medium`, `--space-2`, `--space-3`, `--space-4`, `--blur-placeholder` (already used by `.imgc-blur`). `designSystem.test.ts` already fails on colour literals, which guards this. The 22rem empty-state art cap and the 48rem document width are rem values with no token (the prototype uses 22rem); flagged above only as the cap.

  ### Prototype elements this builds

  Prototype file: `TRAVEL-PLANNER-APP-STORY-118-design.html`. Trips (`#trips-list`): `.media-card` with a 16:9 `.imgc` on top, name and dates under it, image `aria-hidden`. Trips no-results (`#trips-empty`): `.empty-state` with a 16:9 art block (max 22rem) above the heading. Trip (`#trip-hero`): `.hero` grid with `.imgc`, `.scrim` and `.hero-title` / `.hero-dates` in `--color-on-primary`, art with `role="img"` and an `aria-label`. Recommendations and Places (`#recommendations`, `#places`): `.media-card` in `.grid`, art by place type, hidden from screen readers. Options (`#options`): cards with place-type art. Itinerary (`#itinerary-document`): `.hero.cover` with `--radius-md`, same scrim, alt text, days as plain text.

  ```mermaid
  flowchart TD
    Registry[illustrations/registry.ts]:::touched --> ImageFrame[components/ImageFrame.tsx]
    ImageFrame --> ImageHero[components/ImageHero.tsx NEW]:::touched
    ImageFrame --> EmptyStateArt[components/EmptyStateArt.tsx NEW]:::touched
    ImageFrame --> OptionCard[components/OptionCard.tsx]:::touched
    ImageFrame --> PlaceCard[places/PlaceCard.tsx]:::touched
    ImageFrame --> MyTrips[trips/MyTripsPage.tsx]:::touched
    ImageFrame --> RecsTab[trips/TripRecommendationsTab.tsx]:::touched
    ImageHero --> TripDetail[trips/TripDetailPage.tsx]:::touched
    ImageHero --> Itinerary[trips/ItineraryPage.tsx]:::touched
    EmptyStateArt --> EmptyPages[about 25 screens with .empty-state]:::touched
    OptionCard --> RestaurantOpts[trips/RestaurantOptionsPage.tsx]:::touched
    OptionCard --> ActivityOpts[trips/ActivityOptionsPage.tsx]:::touched
    PlaceCard --> Explore[ExplorePage, SavedPage, DestinationResultsPage]
    classDef touched fill:#f96,color:#000
  ```

  Registry gains the generic key (AC13); ImageFrame is reused unchanged; ImageHero (new) is the shared art, scrim and text block for hero and cover (AC2, AC5, AC7, AC11); EmptyStateArt (new) serves AC6; OptionCard takes an optional illustration (AC8); PlaceCard, MyTripsPage and TripRecommendationsTab swap their placeholder covers for ImageFrame (AC1, AC3, AC4).
review_focus: |
  IN: swapping placeholders for `ImageFrame` on trip, place, recommendation and option cards; `ImageHero` (art, scrim, text) for the trip hero and itinerary cover; a shared `EmptyStateArt` on screen-level empty states; a `generic` illustration with `placeType` made optional in the registry. OUT: new art beyond `generic.svg`, Trips search and period tabs, option cards without a place (stays, flights, insurance, SIM, transport), photos. Riskiest: the empty-state sweep across about 25 files (the guard test is what keeps it complete) and the registry change (existing fallbacks must not regress). Deliberate: hero and cover art carry alt text while card and empty-state art is `aria-hidden` (AC11 vs AC12), and region art counts as a match before generic.
