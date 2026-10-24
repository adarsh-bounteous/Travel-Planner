import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; list ordering and the shared flag are covered by the API tests.
const signedIn = (page: import('@playwright/test').Page) =>
  page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )

test('lists own and shared trips, marks the shared one, and opens the itinerary', async ({ page }) => {
  await signedIn(page)
  await page.route('**/trips', (route) =>
    route.fulfill({
      json: [
        { id: 't2', name: 'Oslo', destination: 'Norway', shared: true },
        { id: 't1', name: 'Lisbon', destination: 'Portugal', shared: false },
      ],
    }),
  )
  await page.route('**/trips/t1', (route) =>
    route.fulfill({
      json: {
        id: 't1',
        name: 'Lisbon',
        is_owner: true,
        days: [{ date: '2027-03-03', name: 'Day 1' }],
        options: [],
        activities: [],
      },
    }),
  )

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Oslo', 'Lisbon'])
  await expect(page.getByText('Shared')).toHaveCount(1)
  await expect(page.getByRole('listitem').filter({ hasText: 'Oslo' })).toContainText('Shared')

  await page.getByRole('link', { name: 'Open Lisbon' }).click()
  await expect(page.getByRole('tab', { name: 'Itinerary', selected: true })).toBeVisible()
})

test('a traveller with no trips is guided into planning the first one', async ({ page }) => {
  await signedIn(page)
  await page.route('**/trips', (route) => route.fulfill({ json: [] }))

  await page.goto('/')
  await expect(page.getByText('No trips yet')).toBeVisible()
  await page.getByRole('link', { name: 'Plan your first trip' }).click()
  await expect(page.getByLabel('Trip name')).toBeVisible()
})
