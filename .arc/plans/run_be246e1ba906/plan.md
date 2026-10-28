summary: |
  Add a static starter catalogue of exactly 7 countries (Japan, Portugal, India, Thailand, Mexico, Morocco, Peru), each with exactly 3 places, and every place carrying at least one sample place, restaurant, stay and activity plus medical guidance. The API serves it read-only (`GET /starter-destinations` and `GET /starter-destinations/{country}/{place}`). A new "Plan a trip" page in the web app (route `/trips/plan`) shows the Destination and Place dropdowns, a "Starter content ready" line, a View place content link and a Book trip button. A place-content page (`/trips/plan/:country/:place`) shows five section cards. The catalogue is complete by construction, so the dropdown can never lead to "No data". Visa and SIM data stay out of scope.
scope:
  - description: |
      Starter catalogue module. Pydantic models and a static `STARTER_DESTINATIONS` tuple of 7 countries x 3 places, following the content shape in the prototype's `DATA` fixture.

      ```python
      class SampleItem(BaseModel):
          name: str
          note: str

      class SampleStay(SampleItem):
          price_per_night: int   # whole USD units
          currency: str = "USD"

      class StarterPlace(BaseModel):
          name: str
          places: list[SampleItem]
          restaurants: list[SampleItem]
          stays: list[SampleStay]
          activities: list[SampleItem]
          medical_guidance: str  # place note, if any, + country guidance

      class StarterCountry(BaseModel):
          name: str
          places: list[StarterPlace]

      def list_countries() -> list[str]: ...
      def places_in(country: str) -> list[str] | None: ...
      def content_for(country: str, place: str) -> StarterPlace | None: ...  # fold-insensitive lookup
      ```

      Countries are Japan, Portugal, India, Thailand, Mexico, Morocco and Peru. Peru replaces the prototype's Italy, because the settled decision from CHORE-086 names Peru. Japan, Portugal, India, Thailand, Mexico and Morocco keep the prototype's places and content. Peru needs 3 new places (Lima, Cusco and Arequipa are proposed) with new sample content written in the same shape. Lookup folds case and accents with the same `_fold` approach as `app/places/local_search.py`.
    files:
      - services/api/app/trips/starter_destinations.py
    rationale: |
      A static module follows the repo's "seeded until a data source is chosen" pattern (`app/trips/destination_info.py`, `app/trips/visa.py`). It is one source of truth for the dropdown and the content, so a country or place without content cannot exist. The catalogue lives in `app/trips/` beside the other seeded destination data.
  - description: |
      Read-only router, registered in `main.py` after `places.router`. Both routes use `Depends(get_current_user)`, matching the other trip-planning routes. Unknown country or place returns 404 with a message that names the problem. No new dependency provider is needed because the data is static.

      ```python
      router = APIRouter(prefix="/starter-destinations")

      @router.get("")
      def list_destinations(owner: str = Depends(get_current_user)) -> list[CountryView]: ...  # CountryView(name, places: list[str])

      @router.get("/{country}/{place}")
      def place_content(country: str, place: str, owner: str = Depends(get_current_user)) -> StarterPlace: ...
      ```
    files:
      - services/api/app/routers/starter_destinations.py
      - services/api/app/main.py
    rationale: Exposes the catalogue to the web app over the same API layer every other page uses.
  - description: |
      Web API client and types, `call`-based like `apps/web/src/places/api.ts`.

      ```ts
      export type StarterCountry = { name: string; places: string[] }
      export type SampleItem = { name: string; note: string }
      export type SampleStay = SampleItem & { price_per_night: number; currency: string }
      export type StarterPlaceContent = {
        name: string
        places: SampleItem[]
        restaurants: SampleItem[]
        stays: SampleStay[]
        activities: SampleItem[]
        medical_guidance: string
      }
      export const fetchStarterDestinations = () => call<StarterCountry[]>('/starter-destinations')
      export const fetchStarterPlace = (country: string, place: string) =>
        call<StarterPlaceContent>(`/starter-destinations/${encodeURIComponent(country)}/${encodeURIComponent(place)}`)
      ```
    files:
      - apps/web/src/places/starterApi.ts
    rationale: Keeps the typed fetches beside the other places API, reusing `call` from `trips/api`.
  - description: |
      Trip planner page at `/trips/plan`, built from the prototype's "Trip planner" screen.

      - `h1` "Plan a trip" inside a `.planner` column (max-width 36rem, centred).
      - One `.card.stack` holds the Destination and Place fields. Each field is a `.field` with a `.field-label`, a `.dropdown` that fills the card width, a `.btn.btn-secondary` trigger (label plus chevron icon), a `.menu` popup with `role="listbox"` and `.menu-item` options (`role="option"`, selected one `aria-checked="true"`), and a `.field-hint`.
      - The Destination hint reads "7 starter countries to explore." The Place hint reads "Pick a country first to see its 3 places." and becomes "3 places in Japan." once a country is chosen. The counts come from the fetched data, not literals.
      - The Place trigger is disabled until a country is picked, and picking a new country resets the place.
      - Under the dropdowns a `role="status"` line (`.ready`, success colour, check icon) reads "Starter content ready for Tokyo: places, restaurants, stays, activities and medical guidance." It shows only when a place is picked.
      - Actions row: `.btn.btn-ghost` link "View place content" (aria-disabled until a place is picked) and the one `.btn.btn-primary` "Book trip" (disabled until a place is picked). While booking, the button shows `.spinner` and "Booking trip".
      - On completion an `.alert.alert-success` (`role="status"`) shows "Trip booked: Tokyo, Japan" with a body line, plus a toast "Trip booked".
      - While the catalogue loads the card shows `.skeleton` lines. If the fetch fails, an `.alert.alert-danger` says what happened and to try again.
      - Tokens (via the existing classes and `var()`): `--space-1/2/3/4`, `--size-control-sm`, `--font-size-sm`, `--color-success`, `--color-fg-muted`, `--color-border`, `--radius-md`, `--z-dropdown`, `--size-menu-min`, `--opacity-disabled`. No colour or pixel literals. Any small layout rules go in `apps/web/src/index.css` using these tokens.
      - Book trip completes the flow by showing the confirmation. It does not persist a trip. See the open question.
      - The dropdown behaviour (open and close, arrow keys, Esc, focus return) is written as a small React component, `StarterSelect`, because the prototype's `data-menu` kit is not part of the app. Plain React and the existing `.dropdown`/`.menu` classes are enough, so there are no new packages.
    files:
      - apps/web/src/places/StarterPlannerPage.tsx
      - apps/web/src/places/StarterSelect.tsx
      - apps/web/src/index.css
    rationale: Implements ACs 1, 2, 3, 4 and 10 as the prototype's first screen, with the 7-country and 3-place counts coming straight from the API data.
  - description: |
      Place content page at `/trips/plan/:country/:place`, built from the prototype's "Place content" screen.

      - A "Back to trip" link (arrow-left icon) returns to `/trips/plan` with the picks kept (country and place passed in the link's router state).
      - `h2` with the place name, and a breadcrumb `nav` with `ol.crumbs`: Destinations / Country / Place, current page with `aria-current="page"`.
      - Loading state: three `.card` blocks of `.skeleton` lines with `aria-busy="true"`.
      - Loaded state: a single `.stack` of five `section.card` blocks titled "Sample places", "Sample restaurants", "Sample stays", "Sample activities" and "Medical guidance". The first four hold a list with a `.name` (medium weight) and a `.text-muted.text-sm` note. Stays also show the price on the right via `Intl.NumberFormat(undefined, { style: 'currency', currency })` followed by " / night", so the currency is always shown. Medical guidance is a paragraph.
      - There is no empty state. If the fetch fails, an `.alert.alert-danger` is shown instead.
      - Tokens: `--space-2/3`, `--font-size-sm`, `--font-weight-medium`, `--color-fg-muted`, `--color-border`, `--border-width`.
    files:
      - apps/web/src/places/StarterPlaceContentPage.tsx
    rationale: Implements ACs 1 and 5 to 9, so every section is always filled.
  - description: |
      Routes and entry point. Add `/trips/plan` and `/trips/plan/:country/:place` to `App.tsx`, each wrapped in `<RequireAuth>`, and declared before `/trips/:tripId`. Add a `.btn-secondary` link "Plan from a starter destination" to the Trips home page so users can find the page. This is the Trips section per the UI guidelines. The implementer reads `MyTripsPage.tsx` first to place the link next to the existing empty-state and list actions without adding a second `.btn-primary`.
    files:
      - apps/web/src/App.tsx
      - apps/web/src/trips/MyTripsPage.tsx
    rationale: Makes the new pages reachable and keeps the Trips top-bar section as the home for this flow.
tests:
  - |
    API catalogue, written first in `services/api/tests/unit/test_starter_destinations.py`. AC 2 and AC 3:
    ```python
    names = [c.name for c in STARTER_DESTINATIONS]
    assert {"Japan", "Portugal", "India"} <= set(names)
    assert len(names) == 7 and len(set(names)) == 7
    assert set(names) == {"Japan", "Portugal", "India", "Thailand", "Mexico", "Morocco", "Peru"}
    ```
  - |
    AC 4, in the same file:
    ```python
    for country in STARTER_DESTINATIONS:
        assert len(country.places) == 3, country.name
        assert len({p.name for p in country.places}) == 3
    ```
  - |
    ACs 5 to 9 (one parametrised test over every country and place, each assertion reported separately so a failure names the place):
    ```python
    @pytest.mark.parametrize("country,place", ALL_PAIRS)
    def test_every_place_has_full_content(country, place):
        c = content_for(country, place)
        assert c is not None
        assert len(c.places) >= 1 and all(i.name and i.note for i in c.places)
        assert len(c.restaurants) >= 1
        assert len(c.stays) >= 1 and all(s.price_per_night > 0 and s.currency for s in c.stays)
        assert len(c.activities) >= 1
        assert c.medical_guidance.strip() != ""
    ```
  - |
    Lookup and router, in `services/api/tests/unit/test_starter_destinations_router.py` using the existing test client and auth fixtures. AC 1:
    ```python
    r = client.get("/starter-destinations")
    assert r.status_code == 200 and len(r.json()) == 7
    assert all(len(c["places"]) == 3 for c in r.json())
    r = client.get("/starter-destinations/Japan/Tokyo")
    assert r.status_code == 200 and r.json()["medical_guidance"]
    assert client.get("/starter-destinations/japan/tokyo").status_code == 200   # case-insensitive
    assert client.get("/starter-destinations/Atlantis/Nowhere").status_code == 404
    assert unauthenticated_client.get("/starter-destinations").status_code == 401
    ```
    A further parametrised case walks every country and place from the list endpoint and asserts that each content request returns 200, so nothing the dropdown offers can fail.
  - |
    Planner page, `apps/web/src/places/StarterPlannerPage.test.tsx` (vitest and Testing Library, API mocked with the existing `test-api.tsx` helpers). ACs 2 and 3:
    ```tsx
    await user.click(await screen.findByRole('button', { name: /destination/i }))
    const options = within(screen.getByRole('listbox', { name: 'Countries' })).getAllByRole('option')
    expect(options).toHaveLength(7)
    for (const name of ['Japan', 'Portugal', 'India']) expect(screen.getByRole('option', { name })).toBeInTheDocument()
    ```
  - |
    AC 4 and AC 1 on the planner page, using fixture data from the real catalogue shape:
    ```tsx
    await user.click(screen.getByRole('option', { name: 'Japan' }))
    await user.click(screen.getByRole('button', { name: /place/i }))
    expect(within(screen.getByRole('listbox', { name: 'Places' })).getAllByRole('option')).toHaveLength(3)
    await user.click(screen.getByRole('option', { name: 'Tokyo' }))
    expect(screen.getByRole('status')).toHaveTextContent('Starter content ready for Tokyo')
    expect(screen.queryByText(/no data/i)).not.toBeInTheDocument()
    ```
    Also asserts that the Place trigger is disabled before a country is picked and is reset when the country changes.
  - |
    AC 10, in the same file. Pick Japan, then Tokyo, click Book trip:
    ```tsx
    await user.click(screen.getByRole('button', { name: 'Book trip' }))
    expect(await screen.findByText('Trip booked: Tokyo, Japan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Book trip' })).toBeEnabled()
    ```
    Also asserts the button is disabled until a place is picked.
  - |
    Place content page, `apps/web/src/places/StarterPlaceContentPage.test.tsx`. ACs 5 to 9:
    ```tsx
    for (const title of ['Sample places', 'Sample restaurants', 'Sample stays', 'Sample activities', 'Medical guidance'])
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(within(sectionOf('Sample places')).getAllByRole('listitem').length).toBeGreaterThanOrEqual(1)
    expect(within(sectionOf('Sample stays')).getByText(/\$\d+\.00 \/ night/)).toBeInTheDocument()
    expect(screen.queryByText(/no data/i)).not.toBeInTheDocument()
    ```
    Also covers the skeleton (`aria-busy`) while loading and the danger alert when the fetch fails.
  - |
    Full flow (AC 10), Playwright in `apps/web/e2e/starter-destinations.spec.ts`, following the existing specs' sign-in setup. Loop over all 7 countries and all 3 places each:
    ```ts
    await page.getByRole('button', { name: /destination/i }).click()
    await page.getByRole('option', { name: country }).click()
    await page.getByRole('button', { name: /place/i }).click()
    await page.getByRole('option', { name: place }).click()
    await page.getByRole('button', { name: 'Book trip' }).click()
    await expect(page.getByText(`Trip booked: ${place}, ${country}`)).toBeVisible()
    await page.getByRole('link', { name: 'View place content' }).click()
    await expect(page.getByText(/no data/i)).toHaveCount(0)
    ```
    The narrow run commands are `(cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_starter_destinations.py tests/unit/test_starter_destinations_router.py)` and `(cd apps/web && pnpm run test src/places/StarterPlannerPage.test.tsx src/places/StarterPlaceContentPage.test.tsx)`.
assumptions_or_open_questions:
  - |
    Conflict between the design and the settled country list. The prototype's fixture lists Italy as the 7th country, but the settled decision (CHORE-086, applied to this item) names Peru. The plan follows the settled decision and drops Italy, so Peru's three places (proposed: Lima, Cusco, Arequipa) and all of its sample content are new and need a reviewer's eye. The other six countries reuse the prototype's places and content.
  - |
    Place names for the other six countries are taken from the prototype (Japan: Tokyo, Kyoto, Osaka; Portugal: Lisbon, Porto, Lagos; India: Delhi, Jaipur, Goa; Thailand: Bangkok, Chiang Mai, Phuket; Mexico: Mexico City, Oaxaca, Tulum; Morocco: Marrakech, Fez, Chefchaouen). The deferred decision says the specific places are still to be named, so the reviewer should confirm them.
  - |
    What "Book trip completes" means. The item asks only that the flow through Book trip completes. The existing app has a "Book trip" drawer on a trip (`BookTripDrawer.tsx`), which lists provider links and takes no payment, but a starter place has no trip to book. The plan follows the prototype: the Book trip button shows a confirmation and persists nothing. The prototype's body copy says the sample stay and activities are "saved to Trips", which would be untrue, so the implementation uses "Your sample stay and activities are ready to review. View place content to see them." instead. If the reviewer wants a real trip created through `createTrip`, dates, budget, currency and travellers would be needed and the scope grows.
  - |
    The medical guidance shown is the prototype's static per-country text (plus a place-specific note where it has one). It is separate from the per-traveller guidance in `app/trips/medical.py`, which needs a citizenship route. Whether the two should later be unified is out of scope here.
  - |
    Starter stays carry a price per night in USD, as in the prototype, shown with the currency. Restaurants carry no booking links, so there is no link to follow, which is out of scope here.
  - |
    Entry point. The prototype shows only the planner screen under the Trips top-bar section and no link to it. The plan adds a secondary link on the Trips home page (`MyTripsPage.tsx`, not yet read in detail). The reviewer can say if a different entry point is wanted.
  - |
    The page needs sign-in, like the other trip pages. The prototype does not say whether signed-out visitors should see it.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — the catalogue is a static in-code module read only by new endpoints. There is no database schema, migration, stored data shape, setting or env var, and no provisioning step. Existing trips are not read or changed. Deploy API and web together (the web pages call the new endpoints). Rolling back means reverting the change, which is safe because nothing is persisted.

  ### Design and token loading

  The prototype (`TRAVEL-PLANNER-APP-STORY-102-design.html`) was read in full. The web app already loads the design tokens: `apps/web/src/index.css` line 2 has `@import "../../../design-system/tokens.css";` after `@import "tailwindcss";` on line 1. No new token loading is needed. The note in `index.css` that `--duration-fast` and `--duration-spin` export as "[object Object]" is already handled there by an override. The prototype's utility classes (`.card`, `.stack`, `.dropdown`, `.menu`, `.alert`, `.skeleton`, `.spinner`, `.btn-*`) match the class names the app's pages already use (for example `LocalMenu.tsx` uses `.menu` and `.menu-item`, and the medical page uses `.card`, `.stack` and `.alert`).

  Where the prototype and the UI guidelines differ: the prototype's dropdown popup uses `.menu` inside `.dropdown` and the guidelines say `.dropdown` is for choosing one option, so this is consistent. The prototype uses one `.btn-primary` per screen section (Book trip), as the guidelines require.

  ### Module map

  ```mermaid
  flowchart TD
    App[App.tsx routes] --> Planner[StarterPlannerPage.tsx]
    App --> Content[StarterPlaceContentPage.tsx]
    MyTrips[MyTripsPage.tsx] --> Planner
    Planner --> Select[StarterSelect.tsx]
    Planner --> Client[starterApi.ts]
    Content --> Client
    Client --> Router[routers/starter_destinations.py]
    Main[main.py include_router] --> Router
    Router --> Catalogue[trips/starter_destinations.py]
    classDef touched fill:#f96,color:#000
    class App,Planner,Content,MyTrips,Select,Client,Router,Main,Catalogue touched
  ```

  Every node is new or edited by this plan. `App.tsx` and `main.py` register the routes, `MyTripsPage.tsx` links to the planner, and the catalogue is the single source of truth for both dropdowns and the content.
review_focus: |
  Hold the change to the catalogue, its two read-only endpoints and the two new pages. Visa, SIM, trip persistence and booking links are out. The riskiest part is data completeness: exactly 7 countries, exactly 3 places each and non-empty content for every place are enforced by parametrised tests, and Peru's content is new. Peru replaces the prototype's Italy on purpose, because of the settled country list, and Book trip deliberately shows a confirmation without saving a trip, so don't flag either as a deviation.
