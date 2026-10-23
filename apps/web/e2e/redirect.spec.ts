import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API e2e tests.
async function stubApi(page: Page, initiallySignedIn: boolean) {
  let signedIn = initiallySignedIn
  await page.route('**/auth/me', (route) =>
    signedIn
      ? route.fulfill({ json: { email: 'maya@example.com' } })
      : route.fulfill({ status: 401, json: { code: 'not_signed_in' } }),
  )
  await page.route('**/auth/sign-in', (route) => {
    signedIn = true
    return route.fulfill({ json: { status: 'signed_in' } })
  })
}

test('signed-out visitor is sent to sign in, then back to the page asked for', async ({ page }) => {
  await stubApi(page, false)

  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByText("You'll go to Trips after signing in.")).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your trips' })).toHaveCount(0)

  // The remembered page survives a reload.
  await page.reload()
  await expect(page.getByText("You'll go to Trips after signing in.")).toBeVisible()

  await page.getByLabel('Email').fill('maya@example.com')
  await page.getByLabel('Password').fill('test-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Your trips' })).toBeVisible()
})

test('the header sign-in entry point opens the sign-in page', async ({ page }) => {
  await stubApi(page, false)
  await page.goto('/sign-up')
  await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('a signed-in traveller never sees the sign-in page', async ({ page }) => {
  await stubApi(page, true)
  await page.goto('/sign-in')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Your trips' })).toBeVisible()
})
