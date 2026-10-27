summary: |
  The API already carries a restaurant's optional `url` end to end (ProviderRestaurant.url, RestaurantOption, and RestaurantPick.url copied at pick time in routers/restaurant_picks.py), and the options page already shows a "View listing" link when one exists. What is missing is (a) the explicit "No booking link available" state where there is no link, on the restaurant views, and (b) the picked restaurants in the Book trip drawer. This is a web-app-only change: a small shared `RestaurantLink` component renders the link or the no-link text, is used on the options card and the shortlist entry, and BookTripDrawer gains a `restaurants` prop listing the trip's picked restaurants (only picks, so unpicked restaurants never appear) with that same component and no in-app reserve/confirm control.
scope:
  - description: |
      New `RestaurantLink` component. Signature:
      `export function RestaurantLink({ name, url }: { name: string; url: string | null | undefined })`.
      It runs the url through the existing `safeHref` (http/https only). With a safe href it renders
      `<a href target="_blank" rel="noopener noreferrer" aria-label={`View listing for ${name}`}>View listing</a>`
      (same markup as today's options-card link so existing tests keep passing); otherwise it renders
      `<span className="text-muted text-sm">No booking link available</span>`.
    files:
      - apps/web/src/trips/RestaurantLink.tsx
      - apps/web/src/trips/RestaurantLink.test.tsx
    rationale: |
      One place decides link vs. no-link so the options card, shortlist and Book trip cannot drift (AC1, AC2, AC6).
  - description: |
      Replace the inline `option.url && <a ...>` in `RestaurantCard` with `<RestaurantLink name={option.name} url={option.url} />`.
      In `RestaurantShortlistEntry` add the same component under the reason line, using `entry.restaurant.url`.
      No Add/Reserve behaviour changes.
    files:
      - apps/web/src/trips/RestaurantOptionsPage.tsx
      - apps/web/src/trips/RestaurantShortlistEntry.tsx
    rationale: |
      These are the places the traveller views a restaurant (AC1, AC2).
  - description: |
      `BookTripDrawer` gets an optional prop `restaurants?: RestaurantPick[]` (type already in ./api).
      Render one `<li className="card stack stack-sm">` per pick, after the options and before SIM, showing the name
      and cuisine/city plus `<RestaurantLink name={pick.name} url={pick.url} />`. Include `restaurants.length` in `count`.
      No button other than the link and Close is added (AC5). `TripDetailPage` passes `restaurants={trip.restaurants ?? []}`.
      Picks are the only source, so a restaurant not on the trip is never listed (AC4).
    files:
      - apps/web/src/trips/BookTripDrawer.tsx
      - apps/web/src/trips/TripDetailPage.tsx
    rationale: |
      Lists picked restaurants' links in Book trip (AC3, AC4, AC5, AC6); booking stays on the restaurant's own site, matching the drawer's existing footer copy.
  - description: |
      Add one Playwright scenario to the existing restaurant picks spec: a trip with two picks (one with a url, one null) opens
      Book trip and shows the link and the no-link text. Mock data follows the file's existing fixtures.
    files:
      - apps/web/e2e/restaurant-picks.spec.ts
    rationale: |
      End-to-end check of the Book trip flow for picks.
tests:
  - |
    AC1 - RestaurantLink.test.tsx and RestaurantOptionsPage.test.tsx (write first, fails: component missing).
    ```tsx
    render(<RestaurantLink name="Casa Lima" url="https://example.com/r" />)
    expect(screen.getByRole('link', { name: 'View listing for Casa Lima' })).toHaveAttribute('href', 'https://example.com/r')
    expect(screen.queryByText('No booking link available')).not.toBeInTheDocument()
    ```
    Options page: the existing `within(card).getByRole('link', { name: /View listing/ })` for Casa Lima stays green; add the same check on a shortlist entry in RestaurantShortlistPage.test.tsx.
  - |
    AC2 - null, empty and non-http urls show the text in place of a link; on the options page (Zaytoon has `url: null`) and on a shortlist entry.
    ```tsx
    render(<RestaurantLink name="Zaytoon" url={null} />)
    expect(screen.getByText('No booking link available')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    // and for 'javascript:alert(1)'
    expect(within(screen.getByRole('article', { name: 'Zaytoon' })).getByText('No booking link available')).toBeInTheDocument()
    ```
  - |
    AC3 - new BookTripDrawerRestaurants.test.tsx (same style as BookTripDrawerSim.test.tsx).
    ```tsx
    render(<BookTripDrawer options={[]} restaurants={[pick('Mesa Real', 'https://example.com/mesa')]} onClose={vi.fn()} />)
    expect(screen.getByText('Mesa Real')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View listing for Mesa Real' })).toHaveAttribute('href', 'https://example.com/mesa')
    ```
  - |
    AC4 - TripDetailPage-level test (in TripDetailPage.test.tsx or ItineraryRestaurants.test.tsx): a trip whose `restaurants` holds only Mesa Real, while Casa Lima exists in the options but is not picked. After clicking Book trip:
    ```tsx
    expect(within(drawer).getByText('Mesa Real')).toBeInTheDocument()
    expect(within(drawer).queryByText('Casa Lima')).not.toBeInTheDocument()
    expect(within(drawer).queryByRole('link', { name: /Casa Lima/ })).not.toBeInTheDocument()
    ```
  - |
    AC5 - in the drawer test with a picked restaurant:
    ```tsx
    expect(within(drawer).queryByRole('button', { name: /reserve|book|confirm/i })).not.toBeInTheDocument()
    expect(within(drawer).getAllByRole('button').map((b) => b.textContent)).toEqual(['Close'])
    ```
    (The Overlay close control may add its own button; adjust the expectation to the buttons the drawer already renders, asserting nothing reserve/confirm related is present.)
  - |
    AC6 - drawer with a pick whose url is null:
    ```tsx
    render(<BookTripDrawer options={[]} restaurants={[pick('Cantina Nova', null)]} onClose={vi.fn()} />)
    expect(screen.getByText('No booking link available')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    ```
  - |
    Regression - count text: one pick and nothing else gives `expect(screen.getByText(/1 chosen option\./)).toBeInTheDocument()`; the existing BookTripDrawer*.test.tsx files stay green with the prop omitted.
assumptions_or_open_questions:
  - |
    The Book trip drawer shows a restaurant's "No booking link available" text (exact wording from the AC) rather than the drawer's existing "No booking link is available for this option." sentence, for restaurants only. The other rows keep their wording.
  - |
    "Views the restaurant" is taken to mean the options card and the shortlist entry. The compare table (RestaurantCompare.tsx) and the itinerary pick rows are left unchanged to keep to the ACs; say so if the link should appear there too.
  - |
    Picks keep the url captured at pick time (the API copies it in routers/restaurant_picks.py), so no API change is needed. Picks made before the url was stored, if any, show the no-link state.
  - |
    Only http and https urls count as links (existing safeHref rule), so an unsafe url shows the no-link text.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — web UI only. The API already returns and stores `url` on restaurants and picks, so there is no schema change, backfill, setting or provisioning, and the change can be rolled back by reverting the web build.

  ```mermaid
  flowchart TD
    TDP[TripDetailPage.tsx] -->|passes trip.restaurants| BTD[BookTripDrawer.tsx]
    BTD --> RL[RestaurantLink.tsx]
    ROP[RestaurantOptionsPage.tsx] --> RL
    RSE[RestaurantShortlistEntry.tsx] --> RL
    RL --> SH[safeHref.ts]
    classDef touched fill:#f96,color:#000
    class TDP,BTD,RL,ROP,RSE touched
  ```

  Mirrors the existing `BookLink` and `safeHref` handling for SIM and insurance rows in BookTripDrawer. The component is a new file rather than reusing the drawer's private `BookLink` because the restaurant wording and the card link label differ.
review_focus: |
  IN scope is web only: the shared RestaurantLink, its use on the options card and shortlist entry, and the picked-restaurant rows in BookTripDrawer. OUT are API changes, an in-app reserve/confirm control, and the compare table or itinerary rows. The riskiest part is AC4, since the drawer must list picks only (trip.restaurants), never the options; the exact no-link wording differs from the drawer's older sentence on purpose.
