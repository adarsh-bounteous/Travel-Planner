import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; the reminder rules are covered by the API tests.
const base = {
  id: 'abc',
  name: 'Lisbon',
  start_date: '2027-03-03',
  end_date: '2027-03-05',
  currency: 'EUR',
  is_owner: true,
  days: [
    { date: '2027-03-03', name: 'Day 1' },
    { date: '2027-03-04', name: 'Day 2' },
    { date: '2027-03-05', name: 'Day 3' },
  ],
  options: [],
}
let trip: Record<string, unknown>

test.use({ viewport: { width: 375, height: 800 } })

test.beforeEach(async ({ page }) => {
  trip = { ...base, can_edit: true, reminders: [] }
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/trips/abc', (route) => route.fulfill({ json: trip }))
  await page.route('**/trips/abc/reminders**', (route) => {
    const request = route.request()
    const note = { id: 'r1', option_id: null, option_date: null, ...request.postDataJSON() }
    trip = { ...trip, reminders: request.method() === 'DELETE' ? [] : [note] }
    return route.fulfill({ json: trip })
  })
})

test('an editor adds, edits and deletes a reminder', async ({ page }) => {
  await page.goto('/trips/abc')
  await page.getByRole('button', { name: 'Add reminder' }).click()
  await page.getByLabel('Reminder').fill('Pack passports')
  await page.getByLabel('Date').fill('2027-03-04')
  await page.getByRole('button', { name: 'Save' }).click()
  const day4 = page.getByRole('region', { name: /4 March/ })
  await expect(day4.getByText('Pack passports')).toBeVisible()

  await page.getByRole('button', { name: 'Edit reminder: Pack passports' }).click()
  await page.getByLabel('Date').fill('2027-03-05')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('region', { name: /5 March/ }).getByText('Pack passports')).toBeVisible()
  await expect(day4.getByText('Pack passports')).toHaveCount(0)

  await page.getByRole('button', { name: 'Edit reminder: Pack passports' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Pack passports')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
})

test('a viewer sees notes and no controls', async ({ page }) => {
  trip = {
    ...base,
    can_edit: false,
    is_owner: false,
    reminders: [{ id: 'r1', text: 'Pack passports', date: '2027-03-04' }],
  }
  await page.goto('/trips/abc')
  await expect(page.getByText('Pack passports')).toBeVisible()
  await expect(page.getByRole('button', { name: /reminder/i })).toHaveCount(0)
})
