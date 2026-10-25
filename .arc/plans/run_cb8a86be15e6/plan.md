summary: |
  Replace the placeholder `/profile` page (a free-text form for display name, home city and dietary notes) with the approved "Traveller profile" page: one `.card` row per set-up answer (citizenship, residence, health status, religion, diet, tastes, travel style) showing its saved value with a Change link, or, for a skipped optional answer, an empty "Not answered" field with an Add answer button. Change and Add open a right-hand drawer (the shared `Overlay`), save through the existing `PUT /profile`, and show the new value on the page at once with a toast. Clearing citizenship or residence is blocked with a `.field-error` beside the field. No companion details are shown. Account gets the entry link the design shows. This is a web-app-only change: the API already stores and returns all seven answers, so no backend or data change is needed.

scope:
  - description: |
      Pure helpers for the page, in a new `apps/web/src/profile/profileAnswers.ts`. They are unit-tested first and reuse `SELECT_QUESTIONS`, `TASTES`, `ProfileQuestionKey` and `unansweredQuestions` from `apps/web/src/trips/profileQuestions.ts` instead of redefining questions.

      ```ts
      export const PROFILE_ORDER: ProfileQuestionKey[]  // citizenship, residence, health_status, religion, diet, tastes, travel_style
      export const answerText = (profile: Profile, key: ProfileQuestionKey): string  // '' when not given; tastes joined with ', '
      export const answerError = (key: ProfileQuestionKey, value: string | string[]): string | undefined
      // citizenship/residence empty -> 'Citizenship is required. Choose one to save.' (label lower/upper per design copy)
      // optional keys empty in the ADD drawer -> 'Choose one to save.' ; tastes -> 'Choose at least one taste to save.'
      export const withAnswer = (profile: Profile, key: ProfileQuestionKey, value: string | string[]): Profile
      // returns { ...profile, [key]: value } so the other answers and the three legacy fields ride along untouched
      ```
    files:
      - apps/web/src/profile/profileAnswers.ts
      - apps/web/src/profile/profileAnswers.test.ts
    rationale: |
      Keeps validation and the merge-before-PUT rule out of the component so they are testable without rendering. `PUT /profile` replaces the whole profile, so every save must send the full saved profile with one answer changed.

  - description: |
      New `ProfileAnswerDrawer` component, built on `Overlay kind="drawer"` like `apps/web/src/trips/CompanionDetailsDrawer.tsx`.

      ```ts
      type Props = {
        mode: 'edit' | 'add'
        question: ProfileQuestionKey
        value: string | string[]          // current saved value ('' / [] when adding)
        onClose: () => void
        onSave: (value: string | string[]) => Promise<void>   // rejects on API failure
      }
      ```

      Layout from the prototype's `profile-edit`, `profile-citizenship-cleared` and `profile-add-answer` screens:
      - Title "Edit citizenship" or "Add religion". Subtext is "This updates your saved profile for every trip." when editing and "Optional. You can skip it and add it later." when adding.
      - One `.field` holding a `.select` (placeholder option "Choose …") plus `.field-hint`. Tastes use a `.chipset` of `.chip` toggles (`aria-pressed`) in a `role="group"` with the hint.
      - `.form-actions`: "Clear answer" as `.btn-ghost` (edit mode only), then Cancel as `.btn-secondary` and Save as the single `.btn-primary`. While saving, the Save button shows `.spinner` and "Saving".
      - Errors show only after Save or Clear answer on a required answer, as `FieldError` beside the field, with `.is-invalid`, `aria-invalid` and `aria-describedby`. Focus returns to the field. The error clears when the traveller picks a value.
      - Clear answer on citizenship or residence shows the error and does not save. On an optional answer it saves an empty value, so the row returns to Not answered with Add answer.
      - The options come from `SELECT_QUESTIONS[question].options`. If the saved value is not in the list (older profile), it is added as an option so the select never silently drops it.
      - An API failure keeps the drawer open and shows a `.field-error` "We couldn't save that answer. Try again."
    files:
      - apps/web/src/profile/ProfileAnswerDrawer.tsx
    rationale: |
      A single drawer serves edit, add and the cleared-required states, as the prototype's notes say ("reused for every saved answer"). AC6 is enforced here, next to the field.

  - description: |
      Rewrite `ProfilePage` in `apps/web/src/profile/ProfilePage.tsx`. It still calls `fetchProfile()` on mount, with a `.skeleton` list while loading and an `.alert alert-danger` with a retry hint on failure (the current bare `<p role="alert">`).

      Layout from the prototype's `profile` screen:
      - `.col.stack` page with breadcrumb "Account / Traveller profile" (`.crumbs` markup already in index.css), `h1` "Traveller profile" and the muted line "The answers you gave in trip set-up. Keep them current so recommendations fit you."
      - A `.stack` with `aria-live="polite"` holding seven `.card` `article` rows in `PROFILE_ORDER`.
      - A saved row shows the label, the value and a "Change" link-button with `aria-label="Change citizenship"`. A skipped row shows the label, a disabled `.select` reading "Not answered" (`aria-label="Religion, not answered"`) and a `.btn-secondary` "Add answer" with `aria-label="Add answer for religion"`.
      - The closing muted note: "Changes save to your profile only. People travelling with you aren't part of it, so no companion details are shown here."
      - `onSave` calls `saveProfile(withAnswer(profile, key, value))`, then replaces the page state with the returned or merged profile and closes the drawer. It then shows `<Toast key=id message=… />` ("Citizenship changed to Ireland.", "Religion added: Buddhist.", "Religion answer cleared. You can add it again any time.").
      - The page makes no `/trips` or traveller request. Companion details never enter this page (AC5).
    files:
      - apps/web/src/profile/ProfilePage.tsx
    rationale: |
      This is the core of AC2, 3, 4, 5 and 7. The old three-field form is not in the approved design, so it is removed from the UI. The three legacy fields stay in the data and are preserved on every PUT.

  - description: |
      Account entry (AC1). In `AccountPage.tsx` change the existing `<Link to="/profile">View your traveller profile</Link>` inside a `.card` to the design's `account-menu` entry: a `Link` styled `.btn .btn-secondary` reading "Traveller profile". The Settings ghost button in the design belongs to another story and is not added. Add the small row styles from the prototype (`.answer-row`, `.answer-label`, `.answer-value`, `.answer-link`, `.chipset`) to `apps/web/src/index.css` using tokens only. `.form-actions`, `.crumbs`, `.chip`, `.drawer` and `.toast-slot` already exist there.
    files:
      - apps/web/src/account/AccountPage.tsx
      - apps/web/src/index.css
    rationale: |
      The route and top-bar link already exist; only the Account entry and the row styling are new.

  - description: |
      Tests that go with the scope above: rewrite `ProfilePage.test.tsx` (its two tests describe the old three-field form and the old AC numbering), update the link test in `AccountPage.test.tsx`, and add a Playwright spec at `apps/web/e2e/profile.spec.ts` with `page.route` stubs, following `apps/web/e2e/account.spec.ts`.
    files:
      - apps/web/src/profile/ProfilePage.test.tsx
      - apps/web/src/account/AccountPage.test.tsx
      - apps/web/e2e/profile.spec.ts
    rationale: |
      TDD: these are written and seen failing before the components change.

tests:
  - |
    AC1 (AccountPage.test.tsx, update the existing test): the Account page links to the profile page.
    ```ts
    expect(await screen.findByRole('link', { name: 'Traveller profile' })).toHaveAttribute('href', '/profile')
    ```
    Plus ProfilePage.test.tsx: `renderAt('/account')`, click the link, then `expect(await screen.findByRole('heading', { name: 'Traveller profile' })).toBeInTheDocument()`. Fails first because the link text is "View your traveller profile".
  - |
    AC2 (ProfilePage.test.tsx): with all seven answers saved, each row shows its saved value.
    ```ts
    stubApi({ 'GET /profile': { status: 200, body: { ...BLANK, citizenship: 'Ireland', residence: 'France',
      health_status: 'Allergies', religion: 'Hindu', diet: 'Vegan', tastes: ['Food', 'Museums'], travel_style: 'Cultural' } } })
    renderAt('/profile')
    for (const v of ['Ireland', 'France', 'Allergies', 'Hindu', 'Vegan', 'Food, Museums', 'Cultural'])
      expect(await screen.findByText(v)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Change / })).toHaveLength(7)
    ```
  - |
    AC3 (ProfilePage.test.tsx): changing a saved answer and saving shows the changed answer, and the PUT keeps everything else.
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Change diet' }))
    fireEvent.change(screen.getByLabelText('Diet'), { target: { value: 'Vegetarian' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Vegetarian')).toBeInTheDocument()
    expect(JSON.parse(put.body)).toEqual({ ...FULL, diet: 'Vegetarian' })
    ```
    The same test is repeated for health status, religion, travel style and tastes (toggle the chip "Nature" and assert "Food, Nature"). A `profileAnswers.test.ts` case asserts `withAnswer(FULL, 'diet', 'Vegan')` equals `{ ...FULL, diet: 'Vegan' }` and does not mutate `FULL`.
  - |
    AC4 (ProfilePage.test.tsx): a skipped answer can be answered from the page.
    ```ts
    // BLANK religion
    fireEvent.click(await screen.findByRole('button', { name: 'Add answer for religion' }))
    fireEvent.change(screen.getByLabelText('Religion'), { target: { value: 'Buddhist' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Buddhist')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add answer for religion' })).not.toBeInTheDocument()
    ```
    Also cover tastes via a chip toggle. Saving the add drawer with nothing chosen keeps it open and shows `Choose one to save.` with no PUT.
  - |
    AC5 (ProfilePage.test.tsx): the page shows no companion details and asks for none.
    ```ts
    const fetchMock = stubApi({ 'GET /profile': { status: 200, body: FULL } })
    renderAt('/profile')
    await screen.findByRole('heading', { name: 'Traveller profile' })
    expect(screen.queryByText('Sam')).not.toBeInTheDocument()   // companion name from a trip stub
    expect(fetchMock.mock.calls.some(([p]) => String(p).startsWith('/trips'))).toBe(false)
    expect(screen.getByText(/no companion details are shown here/)).toBeInTheDocument()
    ```
  - |
    AC6 (ProfilePage.test.tsx and profileAnswers.test.ts): clearing citizenship or residence blocks the save and shows the error next to the field.
    ```ts
    fireEvent.click(await screen.findByRole('button', { name: 'Change citizenship' }))
    fireEvent.change(screen.getByLabelText('Citizenship'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Citizenship is required. Choose one to save.')).toBeInTheDocument()
    expect(screen.getByLabelText('Citizenship')).toHaveAttribute('aria-invalid', 'true')
    expect(putCalls(fetchMock)).toHaveLength(0)
    ```
    Repeat for residence and for the Clear answer button. A further case checks that Clear answer on an optional answer (religion) saves `religion: ''` and the row returns to Add answer. Unit: `expect(answerError('citizenship', '')).toBe('Citizenship is required. Choose one to save.')` and `expect(answerError('diet', 'Vegan')).toBeUndefined()`.
  - |
    AC7 (ProfilePage.test.tsx): each skipped optional answer shows an empty field and an Add answer control.
    ```ts
    // BLANK except citizenship/residence; loop over health_status, religion, diet, tastes, travel_style
    expect(await screen.findByRole('combobox', { name: 'Religion, not answered' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add answer for religion' })).toBeInTheDocument()
    ```
    The `unansweredQuestions` helper is the source of truth for which rows are empty, so a profile saved before the set-up fields existed (fields missing from the stored item) must also render as empty.
  - |
    Failure and load states (ProfilePage.test.tsx): `GET /profile` returning 500 shows the `.alert` "We couldn't load your profile. Reload to try again." A failed PUT keeps the drawer open and the page value unchanged: `expect(await screen.findByText("We couldn't save that answer. Try again.")).toBeInTheDocument()`.
  - |
    E2E (apps/web/e2e/profile.spec.ts, Playwright, API stubbed at the network edge): sign in, open Account, click "Traveller profile", change Diet to Vegan and see "Vegan" and the toast, then add a skipped Religion, and finally try to clear Citizenship and see the inline error with no PUT sent.

assumptions_or_open_questions:
  - |
    Prototype vs production option lists: the prototype's sample options (for example "British" for citizenship, "Slow and local" for travel style) differ from the production lists in `profileQuestions.ts` (countries, "Relaxed" and so on). The plan uses the production lists so values saved in set-up round-trip, and takes only layout and copy from the prototype.
  - |
    Prototype vs AC6: the prototype shows the cleared-required error on a separate screen (`profile-citizenship-cleared`). The plan shows the same error inside the same drawer, next to the field. This meets the AC wording ("error shown next to the cleared field") and avoids a second drawer.
  - |
    The old page's display name, home city and dietary notes are not in the approved design, so the plan removes them from the UI. They stay in the stored profile and are preserved on each PUT. Say if they should still be editable somewhere.
  - |
    No API change: the server accepts an empty citizenship or residence on `PUT /profile`, so AC6 is enforced in the web app only, as the story is worded. Rejecting blank required answers server-side would be a separate decision.
  - |
    Every save sends the whole profile (`PUT /profile` replaces it), so two tabs editing at once could overwrite each other. This matches how set-up already saves and is not addressed here.
  - |
    The top-bar "Profile" link in `AppHeader.tsx` is left as is (the app-shell story owns navigation). "Reached from Account" is satisfied by adding the Account entry link.
  - In-context prompts and the effect of profile changes on existing trips are out of scope per the story.

estimated_points: 3

package_dependencies: []

notes: |
  ### Data & rollout
  None — web UI only. The API's `Profile` model already holds all seven answers, `GET`/`PUT /profile` are unchanged, no migration, seed, setting or env var is added, and profiles saved before set-up existed read as "not answered". Deploy is a normal web release. Rollback is reverting the web change, because the stored shape is untouched.

  ### Design notes
  Read from `TRAVEL-PLANNER-APP-STORY-049-design.html`: the Account screen (`open-profile` button), the Traveller profile screen (`.crumbs`, h1, intro line, `profile-answers` stack of `.card` `.answer-row` rows, save note), the edit drawer (`edit-drawer`, Clear answer / Cancel / Save), the cleared-required drawer (`.is-invalid` select, `.field-error` "Citizenship is required. Choose one to save."), and the add drawer ("Optional. You can skip it and add it later."). UI guidelines followed: drawer for editing in context, one `.btn-primary` per drawer, `.toast` for the saved change, `.field-error` shown only after submit, `.skeleton` while loading, `.alert` for a failed load, buttons start with a verb, phone-first single column with `.col`.

  ```mermaid
  flowchart TD
    App[App.tsx route /profile] --> PP[ProfilePage.tsx]
    AccountPage[AccountPage.tsx] -->|Link to /profile| App
    PP --> PAD[ProfileAnswerDrawer.tsx]
    PP --> PA[profileAnswers.ts]
    PAD --> PA
    PAD --> OV[trips/Overlay.tsx]
    PAD --> FE[trips/FieldError.tsx]
    PP --> TO[trips/Toast.tsx]
    PA --> PQ[trips/profileQuestions.ts]
    PP --> API[trips/api.ts fetchProfile and saveProfile]
    API --> R[routers/profile.py PUT and GET /profile]
    classDef touched fill:#f96,color:#000
    class PP,PAD,PA,AccountPage touched
  ```
  Touched: `ProfilePage.tsx` (rewritten for the rows), `ProfileAnswerDrawer.tsx` and `profileAnswers.ts` (new), `AccountPage.tsx` (entry link). The other nodes are reused unchanged.

review_focus: |
  IN: the web-app profile page (seven answer rows, edit and add drawer, inline required-answer error, toast), the Account entry link, and their tests. OUT: any API or data change, companion details, in-context prompts, effects on existing trips, and Settings. Riskiest part: every save is a whole-profile `PUT`, so `withAnswer` must keep the other answers and the legacy display name, home city and dietary notes intact (covered by the PUT-body assertions). Deliberate choices: the production option lists are used instead of the prototype's sample lists, the AC6 error shows in the same drawer rather than on a separate screen, and the old three-field form is dropped from the UI.
