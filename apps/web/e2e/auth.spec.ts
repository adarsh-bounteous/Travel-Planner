import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API e2e tests.
test('sign in, stay signed in on reload, then sign out', async ({ page }) => {
  let signedIn = false
  await page.route('**/auth/me', (route) =>
    signedIn
      ? route.fulfill({ json: { email: 'maya@example.com' } })
      : route.fulfill({ status: 401, json: { code: 'not_signed_in' } }),
  )
  await page.route('**/auth/sign-in', (route) => {
    signedIn = true
    return route.fulfill({ json: { status: 'signed_in' } })
  })
  await page.route('**/auth/sign-out', (route) => {
    signedIn = false
    return route.fulfill({ status: 204 })
  })

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill('maya@example.com')
  await page.getByLabel('Password').fill('abcdefghij12')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
