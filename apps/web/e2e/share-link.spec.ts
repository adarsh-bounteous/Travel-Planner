import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; the real link rules are covered by the API tests.
test('a visitor sees the itinerary note while it is off and no edit links once it is on', async ({ page }) => {
  const trip = { name: 'Lisbon trip', is_owner: false, can_edit: false, days: [], options: [], activities: [] }
  const itinerary = {
    cover: { name: 'Lisbon trip', start_date: null, end_date: null, destinations: [] },
    glance: { booked: 0, unbooked: 0 },
    days: [],
    still_to_schedule: [],
    money: {
      bookings: [],
      included: [],
      not_included: [{ name: 'Airport transfer', reason: 'unchosen', add_path: null }],
      standard_exclusions: [],
      cost: { currency: 'EUR', total: 0, by_currency: [], conversions: [], estimates_note: 'Estimates.' },
    },
    essentials: [],
    checklist: [],
    notes: { price_notice: 'Prices change.', confirm_notice: 'Confirm before you go.', sources: [] },
  }
  let shared = false
  await page.route('**/auth/me', (route) => route.fulfill({ status: 401, json: {} }))
  await page.route('**/shared/*', (route) =>
    route.fulfill({
      json: shared
        ? { ...trip, itinerary_shared: true, itinerary }
        : { ...trip, itinerary_shared: false, itinerary: null },
    }),
  )

  await page.goto('/trips/read-only/k7Qm2xVd9')
  await expect(page.getByText('The itinerary isn’t shared.')).toBeVisible()
  shared = true
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Cost summary' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Edit|Add to plan/ })).toHaveCount(0)
})

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
