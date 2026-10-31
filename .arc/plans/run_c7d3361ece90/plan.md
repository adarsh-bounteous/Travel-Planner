summary: |
  Make the first screen welcoming and useful. In this app Home (`/`, `HomePage`) renders `MyTripsPage` inside it, so one change to `MyTripsPage` plus a small welcome header in `HomePage` covers both "Home" and "My trips". We add (1) a `WelcomeHeader` with a device-clock greeting (Good morning / afternoon / evening), (2) a plain "Starts in N days" line on the single soonest strictly-future-dated trip card only, computed by a pure helper (none for underway, undated, starts-today or past trips), and (3) an empty state that keeps exactly one primary action and shows the existing `EmptyStateArt` illustration. Front-end only: no API, schema or stored-data change.
scope:
  - description: |
      Pure date helpers, written test-first. `greetingFor(now)` returns "morning" for hours 0-11, "afternoon" for 12-17, "evening" for 18-23 (device local clock, no new data). `soonestUpcomingTripId(trips, today)` returns the id of the one trip whose `start_date` is strictly after today's local date and earliest among all such trips, else null. `daysUntil(startDate, today)` is a whole-day difference computed from local y/m/d parts via `Date.UTC`, so DST cannot shift it. `countdownLabel(n)` returns "Starts in 1 day" or "Starts in N days".
      ```ts
      export type Period = 'morning' | 'afternoon' | 'evening'
      export function greetingFor(now: Date): Period
      export function daysUntil(startDate: string, today: Date): number
      export function soonestUpcomingTripId(trips: Pick<Trip, 'id' | 'start_date'>[], today: Date): string | null
      export function countdownLabel(days: number): string
      ```
    files:
      - apps/web/src/trips/tripCountdown.ts
      - apps/web/src/trips/tripCountdown.test.ts
    rationale: |
      Keeps the AC2-5, AC8 and AC9 rules in one unit-testable place instead of inside JSX. Date-only strings must be handled as local dates, as `MyTripsPage.formatDate` already does (it avoids the UTC off-by-one).
  - description: |
      New `WelcomeHeader` component: `<div className="welcome">` with `<h1 data-greeting>Good {period}</h1>` and `<p className="text-muted">{subtitle}</p>`. Props `{ subtitle: string; now?: Date }`; `now` defaults to `new Date()` so tests can inject the clock. It re-reads the clock every 60 s with a `setInterval` that is cleaned up on unmount, as the design's `paintGreeting` does. Add `.welcome` CSS to `apps/web/src/index.css` next to `.page-head` (around line 378), using only tokens: `display: flex; flex-direction: column; gap: var(--space-1)`.
    files:
      - apps/web/src/components/WelcomeHeader.tsx
      - apps/web/src/components/WelcomeHeader.test.tsx
      - apps/web/src/index.css
    rationale: |
      The catalogue has no greeting component, so a small new one is justified. Design reference: the "Home with trips", "My trips with trips" and "My trips empty state" screens all open with `.welcome` (h1 greeting plus muted line, `data-ac="1 8"`).
  - description: |
      `MyTripsPage`: compute `const soonestId = soonestUpcomingTripId(trips, new Date())` once per render when loaded. Pass `countdown={trip.id === soonestId}` to `TripRow`. When true, `TripRow` renders `<p className="countdown">{countdownLabel(daysUntil(trip.start_date!, new Date()))}</p>` directly under the dates line, as plain text with no icon or badge. Add the `.countdown` rule to `index.css` using only `font-weight: var(--font-weight-bold); color: var(--color-primary-hover)` (taken from the design's `.countdown`). Empty state: keep `<EmptyStateArt />` (the illustration, hidden from screen readers) and the single `Link.btn.btn-primary.btn-lg` "Plan your first trip". The header's secondary "Plan from a starter destination" stays `btn-secondary`, and "New trip" stays hidden while empty, so there is still exactly one `.btn-primary` in the empty state. Change the page's `<h1>My trips</h1>` to `<h2>My trips</h2>` so the greeting is the screen's only h1. Existing tests query it by `heading` role and name, so they keep passing.
    files:
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/trips/MyTripsPage.test.tsx
      - apps/web/src/index.css
    rationale: |
      This is the shared surface for AC2-7 and AC9. Reusing `EmptyStateArt` (an `ImageFrame` with `illustration={{}}`) follows the design plan ("EmptyStateArt (illustration, existing)") rather than adding a new SVG.
  - description: |
      `HomePage`: replace the local `<h1>Where to next?</h1>` with `<WelcomeHeader subtitle="Where to next?" />` at the top of the `section`. This keeps the existing copy and the single h1 per screen. `DestinationSearch`, the menu, the sign-out control and the staying-signed-in note are unchanged. `MyTripsPage` also renders its own welcome-free `page-head`, so Home shows exactly one welcome header.
    files:
      - apps/web/src/auth/HomePage.tsx
    rationale: |
      AC1 and AC8 for Home. The welcome header must sit at the top of the screen, above the search and trip list.
tests:
  - |
    AC8 (unit, `tripCountdown.test.ts`), written first and failing until the helper exists:
    ```ts
    expect(greetingFor(new Date(2027, 0, 5, 9, 0))).toBe('morning')
    expect(greetingFor(new Date(2027, 0, 5, 12, 0))).toBe('afternoon')
    expect(greetingFor(new Date(2027, 0, 5, 17, 59))).toBe('afternoon')
    expect(greetingFor(new Date(2027, 0, 5, 18, 0))).toBe('evening')
    expect(greetingFor(new Date(2027, 0, 5, 0, 30))).toBe('morning')
    ```
  - |
    AC1 and AC8 (component, `WelcomeHeader.test.tsx`): header is at the top and the greeting follows the injected clock.
    ```tsx
    render(<WelcomeHeader subtitle="Your trips" now={new Date(2027, 0, 5, 20, 0)} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Good evening' })).toBeInTheDocument()
    ```
    Also a `MyTripsPage`/Home render test using `vi.useFakeTimers(); vi.setSystemTime(new Date(2027, 0, 5, 9, 0))` that expects `Good morning` on `renderAt('/')` after the trips load.
  - |
    AC2 (`tripCountdown.test.ts` plus `MyTripsPage.test.tsx`): with today fixed at 2027-01-05, a trip starting 2027-01-19 shows its day count as plain text.
    ```ts
    expect(daysUntil('2027-01-19', new Date(2027, 0, 5, 15, 0))).toBe(14)
    expect(countdownLabel(14)).toBe('Starts in 14 days')
    expect(countdownLabel(1)).toBe('Starts in 1 day')
    ```
    ```tsx
    expect(await screen.findByText('Starts in 14 days')).toBeInTheDocument()
    ```
  - |
    AC3 (`MyTripsPage.test.tsx`): several future trips, only the soonest has a count.
    ```tsx
    // lisbon starts +14 days, kyoto +32 days, listed in either order
    await screen.findByRole('heading', { name: 'Lisbon' })
    expect(document.querySelectorAll('.countdown')).toHaveLength(1)
    expect(within(lisbonCard).getByText('Starts in 14 days')).toBeInTheDocument()
    expect(within(kyotoCard).queryByText(/Starts in/)).toBeNull()
    ```
    Unit: `expect(soonestUpcomingTripId([kyoto, lisbon], today)).toBe('lisbon')`.
  - |
    AC4 (`MyTripsPage.test.tsx` and unit): an underway trip (start in the past, end in the future) gets no count.
    ```ts
    expect(soonestUpcomingTripId([{ id: 'a', start_date: '2027-01-03' }], today)).toBeNull()
    ```
    ```tsx
    expect(document.querySelector('.countdown')).toBeNull()
    ```
  - |
    AC5 (`MyTripsPage.test.tsx` and unit): an undated trip, both `start_date` null and missing, gets no count, and does not stop a dated trip from getting one.
    ```ts
    expect(soonestUpcomingTripId([{ id: 'a', start_date: null }, { id: 'b' }], today)).toBeNull()
    ```
  - |
    AC9 (unit and component): a trip starting today gets no count. The check must pass at any time of day, including 23:59, so the test uses a late clock.
    ```ts
    const today = new Date(2027, 0, 5, 23, 59)
    expect(soonestUpcomingTripId([{ id: 'a', start_date: '2027-01-05' }], today)).toBeNull()
    ```
    ```tsx
    expect(screen.queryByText(/Starts in/)).not.toBeInTheDocument()
    ```
  - |
    AC6 (`MyTripsPage.test.tsx`): with `GET /trips` returning `[]`, the empty state shows the illustration.
    ```tsx
    const empty = await screen.findByText('No trips yet').then((n) => n.closest('.empty-state') as HTMLElement)
    expect(empty.querySelector('.imgc')).not.toBeNull()
    ```
  - |
    AC7 (`MyTripsPage.test.tsx`): with `[]`, exactly one primary action in the empty state.
    ```tsx
    expect(empty.querySelectorAll('.btn-primary')).toHaveLength(1)
    expect(within(empty).getByRole('link', { name: 'Plan your first trip' })).toHaveAttribute('href', '/trips/new')
    ```
  - |
    Regression: the existing `MyTripsPage.test.tsx`, `AppHeader.test.tsx`, `RequireAuth.test.tsx` and `apps/web/e2e/my-trips.spec.ts` assertions (`heading` "My trips", "No trips yet", "Plan your first trip") must still pass unchanged. Narrow command: `(cd apps/web && pnpm run test -- src/trips/tripCountdown.test.ts src/components/WelcomeHeader.test.tsx src/trips/MyTripsPage.test.tsx src/AppHeader.test.tsx src/auth/RequireAuth.test.tsx)`.
assumptions_or_open_questions:
  - |
    Home and My trips are one screen in the code: `/` renders `HomePage`, which embeds `MyTripsPage` (App.tsx line 67, HomePage.tsx line 30). The prototype shows them as separate screens (Home with a soonest-trip card plus "Coming up after that", My trips with Upcoming/Underway/Past tabs). This plan applies the ACs to the one shared screen and does NOT build the prototype's separate Home layout or its tabs, because no AC asks for them. Reviewer, please confirm.
  - |
    Deliberate deviations from the prototype: (a) the prototype has no "My trips" title and puts the greeting in the h1. We keep a "My trips" heading, demoted to h2, because many existing tests and e2e specs find it by that name. (b) The prototype's empty-state button reads "Add a trip" and uses a hand-drawn inline SVG. We keep the existing "Plan your first trip" copy, because `e2e/my-trips.spec.ts` clicks it, and reuse `EmptyStateArt` as the design plan itself names. (c) The prototype's "Simulate device clock" chips are prototype-only and are not built.
  - |
    "Starts today" means `start_date` equals today's local calendar date, taken from the device clock. A trip is future-dated only when its start is strictly after today. Ties on the same start date: the first in list order gets the count, so exactly one trip ever shows it.
  - |
    Greeting boundaries are not specified in the ACs; this plan uses the prototype's: before 12:00 morning, 12:00-17:59 afternoon, 18:00 onward evening.
  - |
    The Trip type has optional `start_date` and `end_date` (`string | null`, apps/web/src/trips/api.ts lines 374-375); no API change is needed.
estimated_points: 3
package_dependencies: []
notes: |
  ### Data & rollout

  None — front-end rendering only; no stored data, schema, API, setting or env var changes.

  Tokens: `apps/web/src/index.css` line 2 does `@import "../../../design-system/tokens.css"`, and the app styles with the token custom properties directly (e.g. `.empty-state` at line 163 and `.page-head` at line 378). New rules use only `--space-1`, `--font-weight-bold` and `--color-primary-hover`. No hex or px literal is needed and no new token is required, which matches the prototype's "no new tokens needed" note.

  UI guidelines check: one `.btn-primary` per section (empty state keeps one); `.empty-state` with one primary; `.card` in `.grid` for trips; warm second-person copy ("Where to next?"); phone-first single column is unchanged.

  ```mermaid
  flowchart TD
    App["App.tsx route '/'"] --> HomePage
    HomePage["auth/HomePage.tsx: add WelcomeHeader"] --> WelcomeHeader
    HomePage --> MyTripsPage
    WelcomeHeader["components/WelcomeHeader.tsx (new): greeting"] --> Count
    MyTripsPage["trips/MyTripsPage.tsx: countdown on soonest, h2 heading"] --> Count
    Count["trips/tripCountdown.ts (new): pure date rules"]
    MyTripsPage --> EmptyStateArt["components/EmptyStateArt.tsx (reused)"]
    MyTripsPage --> Css["index.css: .welcome, .countdown"]
    classDef touched fill:#f96,color:#000
    class HomePage,WelcomeHeader,MyTripsPage,Count,Css touched
  ```
review_focus: |
  IN: the welcome header, the single soonest-trip countdown, and the empty-state check on the shared Home/My trips screen. OUT: the prototype's separate Home layout, Upcoming/Underway/Past tabs and clock-simulator chips, which no AC requires. Riskiest part: the day-count date maths (local-date parsing, DST, starts-today, 23:59 clock), so check the helper tests carefully. Deliberate choices: "My trips" is kept as an h2 so existing tests and e2e keep passing, and the "Plan your first trip" copy and `EmptyStateArt` are reused over the prototype's wording and inline SVG.
