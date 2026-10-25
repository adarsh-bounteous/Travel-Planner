summary: |
  Add a "Your profile" step to the start of the guided New trip set-up (`/trips/new`). It loads the owner's saved profile and shows only the questions that have no saved answer: citizenship and residence (required, Continue is blocked without them) and health status, religion, diet, tastes and travel style (optional, skippable). Answers given in the step are held in page state and only saved to the profile when the owner finishes set-up, so leaving early saves nothing and a skipped optional question is asked again on the next trip. Backend: widen the existing `Profile` model and `/profile` contract with the seven new answer fields. Frontend: a pure "which questions are unanswered" helper, a profile-step component built to the approved prototype, and a merge-and-save at Finish.
scope:
  - description: |
      Widen the API `Profile` model with the seven answers. Existing fields (`display_name`, `home_city`, `dietary_notes`) stay, because ProfilePage and its tests use them. An answer counts as "answered" when it is non-empty.
      ```python
      class Profile(BaseModel):
          display_name: str = Field(default="", max_length=80)
          home_city: str = Field(default="", max_length=80)
          dietary_notes: str = Field(default="", max_length=500)
          citizenship: str = Field(default="", max_length=80)
          residence: str = Field(default="", max_length=80)
          health_status: str = Field(default="", max_length=80)
          religion: str = Field(default="", max_length=80)
          diet: str = Field(default="", max_length=80)
          tastes: list[str] = Field(default_factory=list, max_length=20)  # each item capped at 40 chars
          travel_style: str = Field(default="", max_length=80)
      ```
      No router change is needed: GET returns `Profile()` when nothing is saved and PUT stores the whole body. `DynamoProfileStore` already stores `profile.model_dump()` as a map, which holds the list.
    files:
      - services/api/app/trips/profile_store.py
      - services/api/tests/unit/test_profile_router.py
      - services/api/README.md
    rationale: |
      The saved traveller profile is the one place answers live; reusing it makes "asked once, reused" true across trips and devices. Defaults keep profiles already stored (without the new keys) readable.
  - description: |
      Web `Profile` type and a pure helper that decides which questions are still unanswered, plus the question definitions (labels, hints, option lists) from the prototype.
      ```ts
      export type Profile = {
        display_name: string; home_city: string; dietary_notes: string
        citizenship: string; residence: string; health_status: string
        religion: string; diet: string; tastes: string[]; travel_style: string
      }
      export type ProfileQuestionKey = 'citizenship' | 'residence' | 'health_status' | 'religion' | 'diet' | 'tastes' | 'travel_style'
      export type ProfileAnswers = Partial<Record<ProfileQuestionKey, string | string[]>>
      export const unansweredQuestions = (saved: Partial<Profile>): ProfileQuestionKey[]
      export const requiredErrors = (saved: Partial<Profile>, answers: ProfileAnswers): Partial<Record<'citizenship' | 'residence', string>>
      export const answeredOnly = (answers: ProfileAnswers): ProfileAnswers   // drops blanks and empty tastes
      ```
      Messages come from the prototype: "Choose your citizenship to continue" and "Choose your country of residence to continue". Tolerate fields missing from the response (an older profile): treat undefined as unanswered. Options are the prototype lists (countries, health, religion, diet, tastes, travel style).
    files:
      - apps/web/src/trips/api.ts
      - apps/web/src/trips/profileQuestions.ts
      - apps/web/src/trips/profileQuestions.test.ts
    rationale: |
      Keeps the show/hide, blocking and "only save what was answered" rules in one tested pure module, away from the component.
  - description: |
      New `ProfileStep` component, the first step of set-up, following design screen "New trip set-up — traveller profile questions" (`#new-trip-profile`): `.narrow` column; h1 "Your profile" with muted intro "A few questions so we can tailor visas, food and places. We only ask once."; `.alert .alert-danger` summary (focused, title "Continue isn't ready yet.", list of "Citizenship: Choose your citizenship to continue") shown only after Continue is pressed; a "Required" `<section>` with h2 and `.field` + `.select` for Citizenship and Residence, each with a `.field-hint` and a `.field-error` (`role="alert"`, `.is-invalid`, `aria-invalid`, `aria-describedby`); an "Optional" section with h2 and muted "Skip any you like. We'll ask again on your next trip.", containing selects for Health status, Religion, Diet and Travel style and a `<fieldset>` "Tastes" of `.check`/`.checkbox` inputs; `.form-actions` with a "Leave set-up" ghost button on the left and one `.btn-primary` "Continue" on the right. A group whose questions are all answered is not rendered at all (answered questions are absent, not disabled). When nothing is left, show `.alert .alert-info` "Your profile is already saved." with "We have everything we need, so there's nothing to answer here. Continue to your trip details." and the Continue button. Loading uses `.skeleton` lines. A profile load failure shows `.alert .alert-danger` "We couldn't load your profile. Reload to try again." and no Continue.
      Props: `{ saved: Profile; answers: ProfileAnswers; onAnswers(a): void; onContinue(): void; onLeave(): void }`.
    files:
      - apps/web/src/trips/ProfileStep.tsx
      - apps/web/src/trips/ProfileStep.test.tsx
      - apps/web/src/index.css
    rationale: |
      Implements the approved design with existing utility classes (`.field`, `.select`, `.alert`, `.btn-primary`, `.skeleton`). index.css only gains small `.group`, `.checks` and fieldset reset rules copied from the prototype, built from tokens.
  - description: |
      Make `NewTripSetupPage` two-step. State: `step: 'profile' | 'details'`, `saved: Profile | 'loading' | 'failed'` (from `fetchProfile()` on mount), `answers: ProfileAnswers` held in memory only. Continue runs `requiredErrors`; if any, it stays on the profile step and shows errors, otherwise it goes to the existing trip-details form (unchanged). The details form gets a "Back" button to return to the profile step with answers kept; the existing header Back and leave modal stay, and `Leave set-up` on the profile step opens the same modal. At Finish, after `createTrip` succeeds, if `answeredOnly(answers)` is non-empty call `saveProfile({ ...saved, ...answeredOnly(answers) })`. A failure to save the profile must not undo or block the created trip: navigate anyway, and the questions are asked again next time. Toast text: "Trip created. N profile answer(s) saved for next time." when N is above 0, else the current "Trip created. Here are your shortlists." Nothing is saved on leave, on a failed `createTrip`, or when set-up is abandoned.
      ```ts
      type Step = 'profile' | 'details'
      const [saved, setSaved] = useState<Profile | 'loading' | 'failed'>('loading')
      ```
    files:
      - apps/web/src/trips/NewTripSetupPage.tsx
      - apps/web/src/trips/NewTripSetupPage.test.tsx
      - apps/web/src/places/AddToTrip.test.tsx
    rationale: |
      Covers ACs 6, 8, 12 and 13. Saving at Finish (as in the prototype note "nothing is saved until the next step finishes") is what makes "leave before finishing" ask again. Existing tests reach the details form only via the profile step now, so their stubs gain `GET /profile` and a Continue click.
  - description: |
      Update ProfilePage tests for the wider `Profile` shape. ProfilePage itself only needs to keep sending back the full object it loaded (it already spreads `values`), so the new answers are preserved when a traveller edits the three existing fields. No UI is added to ProfilePage.
    files:
      - apps/web/src/profile/ProfilePage.test.tsx
    rationale: |
      Guards against the existing profile page wiping the new answers on save.
tests:
  - |
    AC1/2/3 (API-free unit, vitest, profileQuestions.test.ts). Write first, red because the module does not exist.
    ```ts
    expect(unansweredQuestions({})).toEqual(['citizenship','residence','health_status','religion','diet','tastes','travel_style'])
    expect(unansweredQuestions({ religion: 'Hindu' })).not.toContain('religion')
    expect(unansweredQuestions({ tastes: [] })).toContain('tastes')
    ```
  - |
    AC1/2/3 component (ProfileStep.test.tsx, or NewTripSetupPage.test.tsx via `GET /profile` stub returning blank). Citizenship, Residence, Health status, Religion, Diet, Tastes and Travel style all render.
    ```ts
    stubApi({ 'GET /profile': { status: 200, body: BLANK } })
    renderAt('/trips/new')
    expect(await screen.findByLabelText('Citizenship')).toBeInTheDocument()
    expect(screen.getByLabelText('Residence')).toBeInTheDocument()
    for (const l of ['Health status','Religion','Diet','Travel style']) expect(screen.getByLabelText(l)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Tastes' })).toBeInTheDocument()
    ```
  - |
    AC4 and AC5, continuing is blocked with a field-level error and a summary, and the details form is not shown.
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Choose your citizenship to continue')).toBeInTheDocument()
    expect(screen.getByText('Choose your country of residence to continue')).toBeInTheDocument()
    expect(screen.getByLabelText('Citizenship')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByLabelText('Destination')).not.toBeInTheDocument()
    ```
    Plus the single-field cases: only citizenship blank (residence answered) shows only the citizenship error, and vice versa.
  - |
    AC6, answering citizenship and residence and pressing Continue shows the trip-details step.
    ```ts
    type('Citizenship', 'Ireland'); type('Residence', 'Portugal')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByLabelText('Destination')).toBeInTheDocument()
    ```
  - |
    AC7, with only the two required answered and every optional blank, Continue proceeds and no error shows.
    ```ts
    expect(screen.queryByText(/Continue isn't ready yet/)).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Destination')).toBeInTheDocument()
    ```
  - |
    AC8, answer an unanswered optional (Diet) and finish set-up, then PUT /profile carries it merged with the saved fields.
    ```ts
    const put = fetchMock.mock.calls.find(([p, init]) => p === '/profile' && init?.method === 'PUT')
    expect(JSON.parse(put![1]!.body as string)).toMatchObject({ citizenship: 'Ireland', residence: 'Portugal', diet: 'Vegetarian', display_name: 'Maya' })
    expect(await screen.findByText('Trip created. 3 profile answers saved for next time.')).toBeInTheDocument()
    ```
  - |
    AC9, a saved answer is not shown (profile body has religion 'Hindu'; set-up never renders it).
    ```ts
    expect(screen.queryByLabelText('Religion')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Diet')).toBeInTheDocument()
    ```
    Plus an API test that a PUT then GET /profile round-trips every new field and is per owner (test_profile_router.py).
    ```python
    saved = {**BLANK, "citizenship": "Ireland", "tastes": ["Food", "Museums"]}
    assert a.put("/profile", json=saved).status_code == 200
    assert a.get("/profile").json() == saved
    assert b.get("/profile").json() == BLANK
    ```
  - |
    AC10, every answer saved means no profile question renders, an info note shows, and Continue still leads to the details form.
    ```ts
    expect(await screen.findByText('Your profile is already saved.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByLabelText('Destination')).toBeInTheDocument()
    ```
  - |
    AC11, citizenship saved and residence missing, so only Residence is asked among the required.
    ```ts
    expect(screen.queryByLabelText('Citizenship')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Residence')).toBeInTheDocument()
    ```
  - |
    AC12, an optional question skipped through to Finish is not in the PUT body (or no PUT when nothing was answered), and a fresh render of set-up with the same still-blank profile asks it again.
    ```ts
    expect(fetchMock.mock.calls.filter(([p, i]) => p === '/profile' && i?.method === 'PUT')).toHaveLength(0)
    // re-render with unchanged GET /profile -> expect(await screen.findByLabelText('Travel style'))
    ```
    Helper level: `expect(answeredOnly({ diet: '', tastes: [] })).toEqual({})`.
  - |
    AC13, answer a question, press Leave in the leave modal (or fail createTrip), and verify nothing was saved and the question is shown on re-open.
    ```ts
    fireEvent.click(screen.getByRole('button', { name: 'Leave set-up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(fetchMock.mock.calls.some(([p, i]) => p === '/profile' && i?.method === 'PUT')).toBe(false)
    ```
    And with `'POST /trips': { status: 500 }` at Finish, assert no PUT /profile call.
  - |
    Regression and rollout, existing rows still readable. A profile stored before this change (only the three old keys) loads with the new fields defaulted, so every question shows as unanswered and nothing 500s.
    ```python
    store = InMemoryProfileStore(); store._profiles["u"] = Profile.model_validate({"display_name": "Maya"})
    assert store.get_profile("u").citizenship == ""
    assert store.get_profile("u").tastes == []
    ```
    Also update the existing tests (ProfilePage PUT body now includes the new keys, NewTripSetupPage and AddToTrip tests add `GET /profile` and click Continue), and add the failed-profile-load case (`'GET /profile': { status: 500 }` shows "We couldn't load your profile" and no Continue button).
assumptions_or_open_questions:
  - |
    "Answered" means a non-empty string, or a non-empty tastes list. There is no explicit "prefer not to say" value, so skipping always means the question is asked again next trip (AC12).
  - |
    The server does not enforce citizenship and residence as required, because the profile store is partial by design and ProfilePage saves without them. The block (AC4/5) lives in the set-up UI only. Say so if the API should reject a set-up save without them.
  - |
    Answer values are free strings capped by length, not a server-side enum. The option lists (countries, health, religion, diet, tastes, travel style) are the prototype's illustrative lists, and the real country list may be longer. Confirm the lists.
  - |
    Profile answers are saved by the client at Finish, as a read-merge-write of the profile fetched when set-up opened (PUT replaces the whole profile). A profile edit in another tab during set-up could be overwritten. A server-side partial update (PATCH) would avoid it but adds an endpoint no AC needs.
  - |
    If saving the profile fails after the trip was created, the trip stands and the owner is not told. The only effect is that the questions are asked again next time. Say so if a visible warning is wanted.
  - |
    Prototype vs shipped 046 page. The prototype shows a breadcrumb and "Leave set-up" link at 36rem, while the shipped set-up has a Back button with a leave modal at 32rem (`.narrow`). The plan keeps the shipped 046 chrome and uses "Leave set-up" only as the profile step's footer action, opening the existing leave modal. The prototype's "Saved profile (prototype only)" panel on My trips is not built.
  - |
    The prototype's toast is "Trip created. N profile answers saved for next time.", which replaces the current "Here are your shortlists" text only when answers were saved. With no new answers the existing toast stays.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  - **Existing data**: No migration. Profiles already stored on the account item (`profile` map in the accounts table, via `DynamoProfileStore`) have only `display_name`, `home_city` and `dietary_notes`. The new `Profile` fields all have defaults (`""` or `[]`), so `Profile.model_validate` still reads those rows and every new question shows as unanswered. A traveller with no profile map gets `Profile()` from GET, as today.
  - **Backfill / seed**: None. Nothing needs backfilling, because unanswered is the correct state for existing owners.
  - **Settings**: None. No new env var or config.
  - **Provisioning**: None. The accounts table and the `/profile` route already exist.
  - **Order and rollback**: Deploy the API first (it only adds optional fields, and the old web build ignores them; an old web build that does PUT /profile would drop the new answers, a narrow window), then the web app. Rollback is leaving it in place or redeploying the previous builds. Stored extra keys are ignored by the old model (pydantic default `extra=ignore`).

  Prototype elements used: screen `#new-trip-profile` (heading, intro, danger summary alert, Required/Optional groups, `.select` fields with hint and error, tastes checkbox fieldset, `.form-actions` with Leave set-up and one primary Continue), the info alert `#none-left` for AC10, and the toast copy on finish. The My trips "Saved profile" panel is prototype-only and out of scope.

  ```mermaid
  flowchart TD
    MyTrips[MyTripsPage GUIDED_SETUP_PATH] --> TripPage[TripPage]
    TripPage --> Setup[NewTripSetupPage: two steps, save at Finish]
    Setup --> Step[ProfileStep: unanswered questions]
    Step --> Q[profileQuestions.ts: unansweredQuestions, requiredErrors, answeredOnly]
    Setup --> Api[trips/api.ts: Profile type, fetchProfile, saveProfile]
    Profile[ProfilePage] --> Api
    Api --> Router[routers/profile.py GET and PUT /profile]
    Router --> Store[trips/profile_store.py: Profile model]
    Store --> Dynamo[(accounts table profile map)]
    classDef touched fill:#f96,color:#000
    class Setup,Step,Q,Api,Store touched
  ```

  Setup, Step, Q, Api and Store are touched. Setup holds the two-step flow and the Finish-time save. Step and Q are new (UI and rules). Api gets the wider type. Store gets the new fields. The router, MyTripsPage, TripPage and ProfilePage are read-only context (ProfilePage only has a test change).

  Test commands: `cd services/api && uv run pytest tests/unit/test_profile_router.py`, and `cd apps/web && pnpm vitest run src/trips src/profile src/places`.

  The work item text contained no instructions outside the change itself.
review_focus: |
  In scope: widening `Profile` (API plus web type), the profile step in `/trips/new`, and the save at Finish. Out of scope: any new ProfilePage UI, a PATCH endpoint, and the prototype-only "Saved profile" panel. Riskiest part: the "saved only at Finish" rule (AC8, 12 and 13) and the read-merge-write PUT, which must not wipe existing fields or save on leave or a failed create. Deliberate: citizenship and residence are enforced only in the UI, the shipped 046 chrome is kept over the prototype's breadcrumb, and a failed profile save does not block the created trip.
