import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API e2e tests.
test('open Account, change password and email, then sign out', async ({ page }) => {
  let signedIn = true
  await page.route('**/auth/me', (route) =>
    signedIn
      ? route.fulfill({ json: { email: 'maya@example.com', method: 'email' } })
      : route.fulfill({ status: 401, json: { code: 'not_signed_in' } }),
  )
  await page.route('**/auth/account/password', (route) => route.fulfill({ status: 204 }))
  await page.route('**/auth/account/email', (route) =>
    route.fulfill({ status: 202, json: { status: 'confirmation_sent' } }),
  )
  await page.route('**/auth/sign-out', (route) => {
    signedIn = false
    return route.fulfill({ status: 204 })
  })

  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: 'Account' }).click()
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible()

  await page.locator('#current-password-password').fill('abcdefghij12')
  await page.getByLabel('New password').fill('newpassword12')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByRole('status')).toContainText('Password changed.')

  await page.locator('#current-password-email').fill('newpassword12')
  await page.getByLabel('New email address').fill('new@example.com')
  await page.getByRole('button', { name: 'Save email' }).click()
  await expect(page.getByRole('status')).toContainText('Changes saved.')
  await expect(page.getByText('maya@example.com')).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
