summary: |
  Replace the free-text Destination input on the New trip set-up form (NewTripSetupPage) and the edit form (TripSettingsDrawer, "Trip settings") with one shared DestinationPicker: a searchable Destination dropdown, a Country select (Japan, Portugal, India, Thailand, Mexico, Morocco, Peru) and a Place select that lists only the chosen country's places and clears when the country changes. Typing in the dropdown is evaluated client-side against the existing starter catalogue (GET /starter-destinations): an exact place or country match selects it, a place within 2 character edits yields exactly one "Did you mean X?" suggestion the traveller confirms, and anything 3+ edits from every place shows a no-match message. The destination is saved in the existing string field as "Place, Country" (the format the API already parses via destination_country), so no API or schema change is needed. Save is blocked until both a country and a place are chosen.
scope:
  - description: |
      New pure helper module for the matching rules and the stored format.
      ```ts
      export type Catalogue = { name: string; places: string[] }[]
      export type Choice = { country: string; place: string }
      export type Evaluation =
        | { kind: 'empty' }
        | { kind: 'place'; choice: Choice }
        | { kind: 'country'; country: string }
        | { kind: 'near'; choice: Choice }   // exactly one, lowest distance, ties go to catalogue order
        | { kind: 'none' }
      export function editDistance(a: string, b: string): number   // Levenshtein, case-insensitive, accent-folded
      export function evaluateDestination(query: string, catalogue: Catalogue): Evaluation
      export const formatDestination = (c: Choice) => `${c.place}, ${c.country}`
      export function parseDestination(stored: string | null | undefined, catalogue: Catalogue): Choice | null
      ```
      Order of evaluation: exact place, then exact country, then nearest place with distance <= 2, else none. Only place names are used for near matches (AC5, AC9).
    files:
      - apps/web/src/places/destinationMatch.ts
      - apps/web/src/places/destinationMatch.test.ts
    rationale: |
      Keeps the 2-edit rule and the "Place, Country" format in one tested place, mirroring the evaluate() and lev() logic in the approved prototype script. A legacy free-text value such as "Norway" or "Lisbon" parses to null so the form shows an empty selection rather than guessing.
  - description: |
      New shared component used by both forms.
      ```tsx
      type DestinationPickerProps = {
        idPrefix: string                       // unique ids per form, e.g. "setup" or "settings"
        value: string                          // stored "Place, Country" or ""
        onChange: (destination: string) => void // "" while country or place is missing
        error?: string                          // shown with .is-invalid and .field-error after submit
      }
      ```
      It fetches the catalogue with fetchStarterDestinations (apps/web/src/places/starterApi.ts), shows .skeleton lines while loading and an .alert-danger "We couldn't load the destinations. Reload to try again." on failure. Layout follows the prototype screens "New trip", "New trip, best-match suggestion", "New trip, no match" and "Edit trip":
      1. .field with label "Destination": a .select.dest-trigger button (aria-haspopup="listbox", aria-expanded) whose label is the placeholder "Type or pick a destination" (text-muted), the typed text, or "Lisbon, Portugal". It opens a .dest-pop holding an .input "Search places" and a .dest-list (role="listbox", each .dest-item shows the place name and the country in <small>). Picking an item chooses that place and country. Enter in the search box, or a pause when the list is empty, evaluates the text with evaluateDestination. Esc closes and returns focus to the trigger. Hint: "Pick from the list, or search by place name."
      2. Near match: a .card.suggestion (background --color-primary-subtle) with aria-live="polite" text "Did you mean <strong>Lisbon</strong>?", a .btn.btn-primary.btn-sm "Use Lisbon" (sets country and place, AC6) and a .btn.btn-ghost.btn-sm "No thanks" (dismisses).
      3. No match: a .field-error.no-match role="alert" with the AlertIcon and "No country or place matches what you typed. Pick a country below, or try another spelling."; the field and trigger get .is-invalid and aria-invalid so the state is not colour alone.
      4. .field "Country": native .select with "Choose a country" then the 7 catalogue countries (AC3).
      5. .field "Place": native .select, disabled and showing "Choose a country first" until a country is chosen; then "Choose a place in X" plus only that country's places (AC4); changing the country resets the place to empty (AC10). Hint: "Only places in your chosen country are listed."
      Tokens used (all already imported in apps/web/src/index.css line 2): --space-1, --space-2, --space-4, --color-primary-subtle, --color-fg-muted, --color-bg, --color-border, --radius-md, --radius-sm, --size-control-md, --z-dropdown, --border-width, --font-size-sm. Only classes already defined in index.css are reused (.field, .select, .input, .card, .btn-*, .menu, .field-error, .alert, .skeleton, .cluster) plus the new .dest, .dest-trigger, .dest-pop, .dest-list, .dest-item, .dest-empty and .suggestion rules copied from the prototype's style block with the same token names.
    files:
      - apps/web/src/trips/DestinationPicker.tsx
      - apps/web/src/trips/DestinationPicker.test.tsx
      - apps/web/src/index.css
    rationale: |
      One component keeps create and edit identical (AC1 and AC2) and keeps the scope to the destination input only, as the story requires. The searchable dropdown plus native selects follow the approved prototype exactly; StarterSelect (apps/web/src/places/StarterSelect.tsx) has no search box, so it is not reused for the Destination control.
  - description: |
      Wire the picker into the guided set-up form: replace the free-text input with id "setup-destination" (NewTripSetupPage.tsx lines 185-204) by <DestinationPicker idPrefix="setup" value={values.destination} onChange={...} error={errors.destination} />. The createTrip call keeps sending destination: values.destination.trim(), which is now always "Place, Country". In tripBasics.ts change the empty-destination message to "Choose a country and a place." and keep the check on the trimmed string, so Finish is blocked when nothing is chosen (AC11).
      Before and after for the message:
      ```ts
      destination: values.destination.trim() ? undefined : 'Enter a destination, like Lisbon.',
      destination: values.destination.trim() ? undefined : 'Choose a country and a place.',
      ```
    files:
      - apps/web/src/trips/NewTripSetupPage.tsx
      - apps/web/src/trips/tripBasics.ts
      - apps/web/src/trips/tripBasics.test.ts
      - apps/web/src/trips/NewTripSetupPage.test.tsx
    rationale: |
      The existing summary alert and SUMMARY_LABELS already surface a destination error, so only the control and the message change.
  - description: |
      Wire the picker into the edit form (TripSettingsDrawer). Add state initialised from trip.destination, render <DestinationPicker idPrefix="settings" ... /> above the dates, validate that the destination is non-empty on submit (error key "destination", message "Choose a country and a place."), and send destination: destination instead of trip.destination ?? null in the updateTrip call (line 81). The prefill uses parseDestination, so "Lisbon, Portugal" shows both selects filled.
    files:
      - apps/web/src/trips/TripSettingsDrawer.tsx
      - apps/web/src/trips/TripDetailPage.test.tsx
    rationale: |
      The drawer is the only edit form for a trip's destination today (it currently passes the stored value through unchanged); TripDetailPage.test.tsx already opens it via openSettings().
  - description: |
      Update existing tests that type a free-text destination (NewTripSetupPage.test.tsx uses type('Destination', 'Lisbon') at lines 50, 161 and 175, and expects 'Enter a destination, like Lisbon.' at line 113) to choose Portugal then Lisbon through the selects, with GET /starter-destinations mocked.
    files:
      - apps/web/src/trips/NewTripSetupPage.test.tsx
    rationale: |
      These tests would fail once the free-text field is gone; updating them is part of the change, not extra scope.
tests:
  - |
    AC1 (create form has a dropdown, no free-text field). In NewTripSetupPage.test.tsx, advance to the details step and assert:
    ```ts
    expect(screen.getByRole('button', { name: /destination/i })).toHaveAttribute('aria-haspopup', 'listbox')
    expect(screen.queryByPlaceholderText('Where are you going?')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Destination' })).not.toBeInTheDocument()
    ```
    The search box inside the popup is labelled "Search places" and only exists while the popup is open.
  - |
    AC2 (edit form). In TripDetailPage.test.tsx, open Trip settings for a trip with destination 'Lisbon, Portugal' and assert:
    ```ts
    const drawer = await openSettings()
    expect(within(drawer).getByRole('button', { name: /destination/i })).toHaveTextContent('Lisbon, Portugal')
    expect(within(drawer).queryByRole('textbox', { name: 'Destination' })).not.toBeInTheDocument()
    ```
  - |
    AC3 (country options). In DestinationPicker.test.tsx:
    ```ts
    const options = within(screen.getByLabelText('Country')).getAllByRole('option').slice(1).map((o) => o.textContent)
    expect(options).toEqual(['Japan', 'Portugal', 'India', 'Thailand', 'Mexico', 'Morocco', 'Peru'])
    ```
    The mocked catalogue lists them in this order; the order of the real API response is checked by a service test (see assumptions).
  - |
    AC4 (places limited to the country). After selecting Portugal:
    ```ts
    await user.selectOptions(screen.getByLabelText('Country'), 'Portugal')
    const places = within(screen.getByLabelText('Place')).getAllByRole('option').slice(1).map((o) => o.textContent)
    expect(places).toEqual(['Lisbon', 'Porto', 'Lagos'])
    expect(places).not.toContain('Tokyo')
    ```
    Before a country is chosen, expect(screen.getByLabelText('Place')).toBeDisabled().
  - |
    AC5 (best-match suggestion within 2 edits). Pure test in destinationMatch.test.ts plus a component test:
    ```ts
    expect(evaluateDestination('Lisbn', CATALOGUE)).toEqual({ kind: 'near', choice: { country: 'Portugal', place: 'Lisbon' } })
    expect(evaluateDestination('Lsbn', CATALOGUE)).toMatchObject({ kind: 'near' }) // 2 edits
    ```
    Component: type "Lisbn" in "Search places" and press Enter, then expect(screen.getAllByText(/Did you mean/)).toHaveLength(1) and expect(screen.getByRole('button', { name: 'Use Lisbon' })).toBeInTheDocument(). Also cover the tie rule: the lowest distance wins, then catalogue order.
  - |
    AC6 (confirming the suggestion). After the AC5 steps, click "Use Lisbon" and assert:
    ```ts
    await user.click(screen.getByRole('button', { name: 'Use Lisbon' }))
    expect(onChange).toHaveBeenLastCalledWith('Lisbon, Portugal')
    expect(screen.getByLabelText('Country')).toHaveValue('Portugal')
    expect(screen.getByLabelText('Place')).toHaveValue('Lisbon')
    expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument()
    ```
  - |
    AC7 (no-match message). Type "Atlantis" and press Enter:
    ```ts
    expect(await screen.findByRole('alert')).toHaveTextContent('No country or place matches what you typed.')
    expect(screen.queryByRole('button', { name: /^Use / })).not.toBeInTheDocument()
    ```
    Unit: expect(evaluateDestination('Atlantis', CATALOGUE)).toEqual({ kind: 'none' }).
  - |
    AC8 (saved trip shows country and place). Create flow in NewTripSetupPage.test.tsx: choose Portugal and Lisbon, fill the other fields, press Finish, then
    ```ts
    expect(createTrip).toHaveBeenCalledWith(expect.objectContaining({ destination: 'Lisbon, Portugal' }))
    ```
    Edit flow in TripDetailPage.test.tsx: change to Japan and Kyoto, press Save, then expect(updateTrip).toHaveBeenCalledWith('t1', expect.objectContaining({ destination: 'Kyoto, Japan' })) and expect the page to show Kyoto, Japan once onSaved fires.
  - |
    AC9 (3+ edits gives no suggestion). Unit tests:
    ```ts
    expect(editDistance('Lisbon', 'Lsb')).toBe(3)
    expect(evaluateDestination('Lsb', CATALOGUE)).toEqual({ kind: 'none' })
    ```
    Component: type "Atlantis", then expect(screen.queryByText(/Did you mean/)).not.toBeInTheDocument().
  - |
    AC10 (changing the country clears the place). With Lisbon, Portugal chosen:
    ```ts
    await user.selectOptions(screen.getByLabelText('Country'), 'Japan')
    expect(screen.getByLabelText('Place')).toHaveValue('')
    expect(onChange).toHaveBeenLastCalledWith('')
    ```
  - |
    AC11 (nothing chosen, not saved). Create form: press Finish with no country or place and assert createTrip is not called and the message shows:
    ```ts
    expect(createTrip).not.toHaveBeenCalled()
    expect(screen.getByText(/Destination: Choose a country and a place\./)).toBeInTheDocument()
    ```
    Unit in tripBasics.test.ts: expect(validateTripBasics({ ...VALID, destination: '' }, TODAY).destination).toBe('Choose a country and a place.'). Edit form: clear the selection, press Save, expect(updateTrip).not.toHaveBeenCalled().
  - |
    Legacy and format coverage in destinationMatch.test.ts, so existing trips stay usable:
    ```ts
    expect(parseDestination('Lisbon, Portugal', CATALOGUE)).toEqual({ country: 'Portugal', place: 'Lisbon' })
    expect(parseDestination('Norway', CATALOGUE)).toBeNull()
    expect(formatDestination({ country: 'Japan', place: 'Kyoto' })).toBe('Kyoto, Japan')
    ```
  - |
    Narrow verification commands (derived from the project test command):
    ```sh
    cd apps/web && pnpm run test -- src/places/destinationMatch.test.ts src/trips/DestinationPicker.test.tsx src/trips/tripBasics.test.ts src/trips/NewTripSetupPage.test.tsx src/trips/TripDetailPage.test.tsx
    ```
    No API test changes are expected. If the optional catalogue-order test is added, run `cd services/api && sh run-py.sh -m pytest -c pytest.ini tests/unit/test_starter_destinations_router.py`.
assumptions_or_open_questions:
  - |
    The prototype shows 4 places per country (for example Hiroshima, Sintra, Faro, Mumbai, Machu Picchu), but the seeded catalogue in services/api/app/trips/starter_destinations.py has 3 per country (Tokyo, Kyoto, Osaka; Lisbon, Porto, Lagos; and so on). STORY-102 settled the catalogue as the single source of truth, and the story says only that the specific places are still to be named. This plan uses the API catalogue unchanged and treats the prototype's fixture as sample data. A different place list would need new content for each added place, so please confirm.
  - |
    Existing trips can hold free-text destinations such as "Norway" or "Lisbon" (see MyTripsPage.test.tsx and the e2e specs). On the edit form those parse to no selection, and AC11 then forces the traveller to pick a country and place before any save, including a rename-only save. The alternative is to keep an untouched legacy value saveable. This plan follows AC11 literally, so please confirm.
  - |
    The stored format is "Place, Country" in the existing destination string. services/api/app/trips/visa.py destination_country takes the part after the last comma, so visa lookups keep working. Other features that match the whole string (InMemoryRecommendations.for_destination, local places search) will see "Lisbon, Portugal" rather than "Lisbon". Making those consistent is the separate cross-feature story named in the scope, so it is not planned here.
  - |
    The Destination dropdown's search is client-side over the fetched catalogue, so no new API endpoint is added. The 2-edit rule is Levenshtein distance on case-folded, accent-stripped text, as in the prototype. A typed country name selects that country and leaves the place empty, and no suggestion is made for country typos, since AC5 and AC9 speak only of place names.
  - |
    GET /starter-destinations requires get_current_user, which holds on both forms because they sit behind sign-in. If the catalogue fails to load, the picker shows an error alert and the form cannot be saved. Please confirm that is acceptable.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — UI change only. The destination stays in the existing `destination` string field (max 120 chars) and no schema, migration, seed, setting or env var changes. Rows already holding free text stay readable everywhere. Only the edit form treats them as "nothing chosen" (see the open questions). Safe to roll back by reverting the web change.

  ### Design source and tokens

  Built from the approved prototype TRAVEL-PLANNER-APP-STORY-090-design.html. I read its "New trip", "New trip, best-match suggestion", "New trip, no match", "Edit trip" and "Saved trip" screens and its script. The tokens come from design-system/tokens.css, which the app loads with `@import "../../../design-system/tokens.css";` at apps/web/src/index.css line 2, so no loader work is needed. The prototype's tokens.css has two durations exported as "[object Object]", and index.css line 4 already overrides them.

  Prototype vs. acceptance criteria: no conflict. The prototype's "Saved trip" screen (a card with a "Trip saved" badge and "Lisbon, Portugal") is a stand-in for AC8. In production the saved destination is shown by the existing trip pages (trip detail, My trips), which already render `trip.destination`, so no new screen is built. The existing "Trip created. Here are your shortlists." toast is kept.

  ```mermaid
  flowchart TD
    Setup[NewTripSetupPage] -->|renders| Picker[DestinationPicker]
    Drawer[TripSettingsDrawer] -->|renders| Picker
    Picker -->|evaluate, parse, format| Match[destinationMatch.ts]
    Picker -->|fetchStarterDestinations| StarterApi[places/starterApi.ts]
    StarterApi -->|GET /starter-destinations| Router[routers/starter_destinations.py]
    Router --> Catalogue[trips/starter_destinations.py]
    Setup -->|validateTripBasics| Basics[tripBasics.ts]
    Setup -->|createTrip destination| TripsApi[trips/api.ts]
    Drawer -->|updateTrip destination| TripsApi
    classDef touched fill:#f96,color:#000
    class Setup,Drawer,Picker,Match,Basics touched
  ```

  Touched nodes: Setup and Drawer swap the free-text input for the picker; Picker and Match are new; Basics gets the new empty-destination message. StarterApi, Router, Catalogue and TripsApi are unchanged and are shown for context.

  Mirrors the existing Starter planner (StarterPlannerPage.tsx), which already loads the same catalogue for its country and place dropdowns.
review_focus: |
  Hold the change to the Destination input on the New trip set-up form and the Trip settings drawer, plus the shared picker and matching helper. Making other features use the new "Place, Country" value consistently is explicitly out of scope, and no API, schema or catalogue change is planned. The riskiest parts are the edit-form handling of legacy free-text destinations (AC11 forces a choice) and the 2-edit boundary: distance 2 suggests, distance 3 does not, and only place names are candidates. Deliberate choices: client-side matching over the existing catalogue, native selects for Country and Place, and the 3-place catalogue instead of the prototype's 4.
