import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; the itinerary rules are covered by the API tests.
let trip = {
  id: 'abc',
  name: 'Lisbon',
  start_date: '2027-03-03',
  end_date: '2027-03-05',
  budget: 1500,
  currency: 'EUR',
  is_owner: true,
  days: [
    { date: '2027-03-03', name: 'Day 1' },
    { date: '2027-03-04', name: 'Day 2' },
    { date: '2027-03-05', name: 'Day 3' },
  ],
  options: [{ id: 'o1', title: 'Tram pass', category: 'Conveyance', date: '2027-03-03' }],
}

test.use({ viewport: { width: 375, height: 800 } })

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/trips/abc', (route) => {
    if (route.request().method() === 'PUT')
      trip = { ...trip, ...route.request().postDataJSON() }
    return route.fulfill({ json: trip })
  })
})

test('day stacks sit in one column on a phone', async ({ page }) => {
  await page.goto('/trips/abc')
  const stacks = page.getByRole('region')
  await expect(stacks).toHaveCount(3)
  const [first, second] = await Promise.all([stacks.nth(0).boundingBox(), stacks.nth(1).boundingBox()])
  expect(second!.x).toBe(first!.x)
  expect(second!.y).toBeGreaterThan(first!.y)
})

test('the owner renames the trip and sees a toast', async ({ page }) => {
  await page.goto('/trips/abc')
  await page.getByRole('button', { name: 'Edit trip' }).click()
  await page.getByLabel('Trip name').fill('Lisbon Spring')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Lisbon Spring' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Trip saved')
})
