import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; the real link rules are covered by the API tests.
test('an open viewer is told when the owner turns the link off', async ({ page }) => {
  await page.clock.install()
  let loads = 0
  await page.route('**/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/shared/*', (route) =>
    loads++ === 0
      ? route.fulfill({
          json: {
            name: 'Lisbon trip',
            is_owner: false,
            can_edit: false,
            days: [{ date: '2027-03-03', name: 'Day 1' }],
            options: [],
            activities: [],
          },
        })
      : route.fulfill({ status: 404, json: { code: 'not_found' } }),
  )

  await page.goto('/trips/read-only/k7Qm2xVd9')
  await expect(page.getByRole('heading', { level: 1, name: 'Lisbon trip' })).toBeVisible()
  await page.clock.runFor(30_000)
  const dialog = page.getByRole('alertdialog', { name: 'Access removed' })
  await expect(dialog).toContainText('The owner has turned off this read-only link.')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('heading', { name: 'Link no longer available' })).toBeVisible()
})
