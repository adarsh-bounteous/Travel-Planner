import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; the callback's behaviour is covered by the API unit tests.
const IDENTITIES = [
  { email: 'demo@example.com', has_account: true },
  { email: 'new.user@example.com', has_account: false },
]

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/me', (route) => route.fulfill({ status: 401, json: { code: 'not_signed_in' } }))
  await page.route('**/local/google-identities', (route) =>
    route.fulfill({ json: { identities: IDENTITIES } }),
  )
  await page.route('**/auth/google/callback**', (route) => {
    const url = new URL(route.request().url())
    const error = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    const location = error
      ? '/sign-in?error=google_cancelled'
      : code === 'demo@example.com'
        ? '/sign-in?signed-in'
        : '/sign-in?error=google_not_linked'
    return route.fulfill({ status: 303, headers: { location } })
  })
})

test('picking an identity with an account then Allow leaves the consent page', async ({ page }) => {
  await page.goto('/local/google-consent?state=abc')
  await page.getByRole('radio', { name: /demo@example.com/ }).check()
  await page.getByRole('button', { name: 'Allow' }).click()
  await expect(page).toHaveURL(/signed-in/)
})

test('typing an email then Allow finishes with that email', async ({ page }) => {
  await page.goto('/local/google-consent?state=abc')
  await page.getByLabel('Or type an email address').fill('demo@example.com')
  await page.getByRole('button', { name: 'Allow' }).click()
  await expect(page).toHaveURL(/signed-in/)
})

test('Cancel returns to sign in, signed out', async ({ page }) => {
  await page.goto('/local/google-consent?state=abc')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/\/sign-in\?error=google_cancelled/)
})

test('an identity with no account gets the No account yet prompt', async ({ page }) => {
  await page.goto('/local/google-consent?state=abc')
  await page.getByRole('radio', { name: /new.user@example.com/ }).check()
  await page.getByRole('button', { name: 'Allow' }).click()
  await expect(page.getByRole('dialog', { name: 'No account yet' })).toBeVisible()
})

test('a malformed email shows the field error and stays on the consent page', async ({ page }) => {
  await page.goto('/local/google-consent?state=abc')
  await page.getByLabel('Or type an email address').fill('bad@')
  await page.getByRole('button', { name: 'Allow' }).click()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  await expect(page).toHaveURL(/\/local\/google-consent/)
})
