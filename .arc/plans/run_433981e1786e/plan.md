summary: |
  Restyle the three entry screens (Sign in, My trips, New trip set-up stepper) so they read as a consumer product, using only design-system tokens. Sign in gets a teal brand panel beside the form at desktop width, stacked on phones. My trips cards get a gradient cover and a status badge. The set-up stepper gets a step indicator, and its chips, radios and checkboxes get the design-system sample styles. This is look and layout only. No visible text, route, handler or API call changes, and nothing may scroll horizontally at 390px or 1280px. It is almost all CSS in the existing stylesheet plus small markup wrappers, guarded by a Playwright spec at both widths and vitest checks that text and behaviour are unchanged.
scope:
  - description: |
      Sign in: split layout with a teal brand panel. Wrap the existing AuthForm output in SignInPage in a two-column container. Add a decorative panel, `<aside className="auth-brand" aria-hidden="true">`, with no text of its own (a text-free icon or shape only), so AC3 holds. CSS: `.auth-split` is a single column by default (panel stacked above the form) and `display: grid; grid-template-columns: 1fr 1fr` at `@media (min-width: 48rem)`. `.auth-brand` uses `background: linear-gradient(var(--color-primary), var(--color-primary-hover))`, `color: var(--color-on-primary)`, `border-radius: var(--radius-lg)`, `padding: var(--space-5)`, and `min-height: var(--size-control-lg)` on phones. The existing `.auth` column keeps `max-width: var(--size-modal-width)` and gets `min-width: 0`. AuthForm is shared with Sign up, so put the wrapper in SignInPage only; the AuthForm props and markup stay as they are.
    files:
      - apps/web/src/auth/SignInPage.tsx
      - apps/web/src/index.css
    rationale: |
      AC5 and AC6, plus AC1 to AC4 for this screen. Wrapping in SignInPage leaves Sign up and the other AuthForm users untouched.
  - description: |
      My trips: gradient cover and status badge on each trip card. In `TripRow` (MyTripsPage.tsx), add `<div className="trip-cover" aria-hidden="true" />` as the first child of the `li.card.trip-row`, and make the card a column (cover on top, body below) with `overflow: hidden` and `padding: 0` on the cover edge. Render the list in the existing `.grid` class (guidelines say `.card` in `.grid`). CSS: `.trip-cover { height: var(--size-control-lg) * 2 equivalent via calc(var(--size-control-lg) * 2); background: linear-gradient(var(--color-primary), var(--color-info)); border-radius: var(--radius-lg) var(--radius-lg) 0 0 }`. Status badge: reuse the string already shown on the card, the stay count ("No stays yet" or "N stay(s)"). Move it out of the muted `<p>` into `<span className="badge badge-neutral">` for no stays and `badge badge-success` for one or more, with the text produced by the same expression. The Shared and Unmatched badges, dates, destination, Open link, route and fetch/refresh logic stay unchanged. The `.trip-row` flex rules are adjusted so `.trip-info` and the Open button still wrap without overflow.
    files:
      - apps/web/src/trips/MyTripsPage.tsx
      - apps/web/src/index.css
    rationale: |
      AC7 and AC8. The badge reuses existing text so AC3 holds (see the open question on what counts as the status). A cover with no image keeps behaviour and data unchanged.
  - description: |
      New trip set-up stepper: step indicator, chip, radio and checkbox styles. NewTripSetupPage already has two steps ('profile' and 'details'). Add a text-free step indicator above the heading, `<ol className="steps" aria-label=...>`. To keep every visible string unchanged, render two `<li className="step">` items as marker dots only, with `aria-current="step"` on the active one and a `.is-done` class on the completed one. Do not add numerals or labels. Use `aria-hidden` on the list rather than inventing an accessible label, because no new copy is allowed. CSS: `.steps` is a flex row with `gap: var(--space-2)`. `.step` is a pill of `height: var(--space-2)`, `flex: 1`, `background: var(--color-border)`, `border-radius: var(--radius-full)`. `.step.is-current, .step.is-done` use `background: var(--color-primary)`. Chips: align the existing `.chip` / `.chip[aria-pressed]` / `.chip.is-selected` rules to the style-guide sample, and give the tastes labels in ProfileStep (currently `label.check` with `input.checkbox`) the same selected tint as `.activity:has(.checkbox:checked)` via `.checks .check:has(.checkbox:checked)` using `--color-primary-subtle` and `--color-primary`. Checkbox: `.checkbox` has no rule in index.css today, so add `.checkbox { width: var(--size-check); height: var(--size-check); accent-color: var(--color-primary); }` to match the existing `.radio` rule, plus an `.is-invalid` border using `--color-danger`. Radio: extend `.radio` so any set-up radio options match the style-guide sample (`style-guide.html` lines 145 to 147). Keep `.radio` sizing from the `--size-check` token. No radios or chips are rendered in the stepper's current steps, only the DestinationPicker `.dest-*` list and the tastes checkboxes, so these rules are shared and apply wherever those classes are already used. Also make `.narrow`, `.two` and `.form-actions` safe at 390px: `min-width: 0` on grid children.
    files:
      - apps/web/src/trips/NewTripSetupPage.tsx
      - apps/web/src/trips/ProfileStep.tsx
      - apps/web/src/index.css
    rationale: |
      AC9 to AC12 and AC1 to AC4 for the stepper. The indicator has no text so wording is unchanged; the class rules go in the one global stylesheet that already holds every shared control style.
  - description: |
      Guardrails. Extend the stylesheet unit test so the new rules stay token-only (the existing no-literal and no-raw-px checks already scan index.css, so they cover them) and assert the new selectors exist. Add a Playwright spec `entry-screens.spec.ts` (modelled on foundations.spec.ts, API stubbed at the network edge) that visits /sign-in, /, /trips and /trips/new at 390px and 1280px, asserts `document.documentElement.scrollWidth <= innerWidth`, and checks the layout and style ACs.
    files:
      - apps/web/src/designSystem.test.ts
      - apps/web/e2e/entry-screens.spec.ts
    rationale: |
      Proves AC1 and AC2 at real widths, which jsdom cannot, and keeps the token rule enforced.
tests:
  - |
    AC1 and AC2 (Playwright, apps/web/e2e/entry-screens.spec.ts, written first and failing until the CSS lands). For each of /sign-in, /trips and /trips/new, at 390px and 1280px:
    ```ts
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width)
    ```
  - |
    AC3 (vitest, SignInPage.test.tsx, MyTripsPage.test.tsx, NewTripSetupPage.test.tsx). The existing text assertions must keep passing unchanged. Add a snapshot of the screen's visible text before and after the change:
    ```ts
    expect(container.textContent).toBe(textBeforeChange)
    ```
    Capture the string from the pre-change render and hard-code it in the test so the cover, panel and step markers are proven to add no text.
  - |
    AC4 (vitest, existing behavioural tests in the same three files). Do not edit them. They must pass as-is: sign-in submit and Google, My trips Open and New trip links, set-up Continue, Finish, Back and Leave. Add one assertion that the Open link still goes to `/trips/${id}`:
    ```ts
    expect(screen.getByRole('link', { name: 'Open Lisbon' })).toHaveAttribute('href', '/trips/t1')
    ```
  - |
    AC5 (Playwright, 1280px, /sign-in). The brand panel sits beside the form:
    ```ts
    const panel = await page.locator('.auth-brand').boundingBox()
    const form = await page.locator('.auth form').boundingBox()
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(form!.x)
    ```
    plus `await expect(page.locator('.auth-brand')).toHaveCSS('background-image', /gradient/)`.
  - |
    AC6 (Playwright, 390px, /sign-in). The panel is stacked, not beside the form:
    ```ts
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(form!.y)
    expect(panel!.x).toBeLessThan(form!.x + form!.width)
    ```
  - |
    AC7 (vitest, MyTripsPage.test.tsx, with at least one trip). Each card has a cover; a Playwright check at both widths confirms it paints a gradient:
    ```ts
    expect(container.querySelectorAll('li.card .trip-cover')).toHaveLength(trips.length)
    await expect(page.locator('.trip-cover').first()).toHaveCSS('background-image', /linear-gradient/)
    ```
  - |
    AC8 (vitest, MyTripsPage.test.tsx). Each card has a status badge:
    ```ts
    for (const card of container.querySelectorAll('li.card')) {
      expect(card.querySelector('.badge-success, .badge-neutral')).not.toBeNull()
    }
    ```
  - |
    AC9 (vitest, NewTripSetupPage.test.tsx, plus Playwright at both widths). The step indicator has one current step, and on Continue the profile step becomes done:
    ```ts
    expect(container.querySelectorAll('.steps .step')).toHaveLength(2)
    expect(container.querySelector('.step[aria-current="step"]')).not.toBeNull()
    ```
    Computed style: `await expect(page.locator('.step.is-current')).toHaveCSS('background-color', 'rgb(14, 116, 144)')`, which is the --color-primary value, as in foundations.spec.ts.
  - |
    AC10 (Playwright, /trips/new, and designSystem.test.ts). The chip rule uses tokens only and keeps the pill radius, and a pressed chip has the primary tint:
    ```ts
    expect(css).toMatch(/\.chip\[aria-pressed="true"\]\s*\{[^}]*var\(--color-primary-subtle\)/)
    ```
  - |
    AC11 (Playwright, any set-up radio on screen, and designSystem.test.ts). The radio is sized from the token and uses the primary accent:
    ```ts
    expect(css).toMatch(/\.radio\s*\{[^}]*width: var\(--size-check\)[^}]*accent-color: var\(--color-primary\)/)
    ```
  - |
    AC12 (vitest, designSystem.test.ts, and Playwright on the profile step with tastes visible). The checkbox gets a rule, which is missing today, and the checked option is tinted:
    ```ts
    expect(css).toMatch(/\.checkbox\s*\{[^}]*width: var\(--size-check\)[^}]*accent-color: var\(--color-primary\)/)
    await expect(page.locator('.checks .check').first().locator('.checkbox')).toHaveCSS('width', '20px')
    ```
assumptions_or_open_questions:
  - |
    The design-system folder has no stepper, brand panel or trip-cover sample. style-guide.html has chip (line 204), checkbox and radio (lines 141 to 147) samples only. I took "sample step style" to mean a segmented progress indicator built from existing tokens. Please confirm, or point me at the sample.
  - |
    AC3 says no new text, but AC8 asks for a status badge, which normally has a label. I planned to move the stay count already shown on each card ("No stays yet" or "N stays") into the badge. If the reviewer wants a different status (for example Draft or Upcoming), that is new wording and conflicts with AC3. Please decide.
  - |
    The step indicator and brand panel carry no text so AC3 holds. A visual step label such as "Step 1 of 2" would be new text and is left out.
  - |
    The stepper currently renders no radio buttons and no chips. It renders checkboxes (tastes) and the destination picker. AC11 and AC10 are therefore met by restyling the shared `.radio` and `.chip` rules, which apply wherever those classes appear, and I cannot show them on the set-up screen without new markup. Please confirm that is acceptable.
  - |
    The gradient uses only token colours (--color-primary to --color-primary-hover or --color-info). No hex or rgb literal is added. The cover height is derived from a size token with calc. If a distinct cover height is wanted, it needs a new token, which would mean editing the generated tokens.css.
  - |
    The 390px width is not covered by the 375px phone rules in the design guidelines. The existing phone block in index.css uses `@media (max-width: 47.99rem)`, so 390px falls inside it and the 44px touch-target rules there apply. New controls must meet them.
estimated_points: 5
package_dependencies: []
notes: |
  ### Data & rollout

  None — presentation-only change to CSS and markup wrappers; no stored data, schema, setting, env var or provisioning, and safe to revert by reverting the commit.

  ### Design tokens

  tokens.css is loaded once at `apps/web/src/index.css` line 2 (`@import "../../../design-system/tokens.css";`) after `@import "tailwindcss"` on line 1, and index.css is the only global stylesheet. The project is configured for Tailwind, but all existing screens are styled with plain class rules in index.css that read tokens via `var(--token)`. I follow that and add no Tailwind utility classes. Tokens used: `--color-primary`, `--color-primary-hover`, `--color-primary-subtle`, `--color-on-primary`, `--color-info`, `--color-border`, `--color-danger`, `--radius-sm`, `--radius-lg`, `--radius-full`, `--space-1` to `--space-5`, `--size-check`, `--size-control-lg`, `--size-modal-width`, `--size-grid-min`, `--border-width`, `--border-width-strong`. `designSystem.test.ts` already fails on any colour literal or raw px value in index.css, so the new rules are held to the same bar.

  ### Notes

  - Sign in is rendered inside `main.shell-main` under the app header (App.tsx line 316 route, line 58 main), so the brand panel lives inside the content column, not full-bleed.
  - AuthForm is shared by Sign in and Sign up; the split wrapper goes in SignInPage so Sign up is unchanged.
  - The phone block at the end of index.css already forces `min-height: var(--size-control-lg)` on controls, which new controls should not undo.

  ```mermaid
  flowchart TD
    App[App.tsx routes] --> SignIn[SignInPage.tsx]
    App --> MyTrips[MyTripsPage.tsx]
    App --> Setup[NewTripSetupPage.tsx]
    SignIn --> AuthForm[AuthForm.tsx]
    Setup --> Profile[ProfileStep.tsx]
    Setup --> Dest[DestinationPicker.tsx]
    SignIn --> CSS[index.css]
    MyTrips --> CSS
    Setup --> CSS
    Profile --> CSS
    Tokens[design-system/tokens.css] --> CSS
    classDef touched fill:#f96,color:#000
    class SignIn,MyTrips,Setup,Profile,CSS touched
  ```
  SignIn gets the split wrapper and brand panel, MyTrips gets the cover and badge, Setup gets the step indicator, Profile gets the checkbox wrapper, and index.css holds all the new rules.
review_focus: |
  IN scope is look and layout of Sign in, My trips and the set-up stepper at 390px and 1280px, in index.css plus small markup wrappers. OUT is any wording, route, handler or API change, and AuthForm shared with Sign up. The riskiest parts are AC3 against AC8 (the status badge reuses the existing stay-count text so no new copy is added) and the shared `.chip`, `.radio` and `.checkbox` rules, which also affect other screens that use them. The stepper has no radios or chips on screen today, so those two are met by shared-rule styling.
