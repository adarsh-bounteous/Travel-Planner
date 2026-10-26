import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API tests.
test('save transport preferences once, then search without being asked for them', async ({ page }) => {
  let profile: Record<string, unknown> = {
    display_name: '',
    home_city: '',
    dietary_notes: '',
    citizenship: 'Ireland',
    residence: 'France',
    health_status: '',
    religion: '',
    diet: '',
    tastes: [],
    travel_style: '',
    transport_preferences: { modes: [], cabin: null, departure_window: null, max_stops: null, providers: [] },
  }
  let searchedUrl = ''
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/profile', (route) => {
    if (route.request().method() === 'PUT') profile = route.request().postDataJSON()
    return route.fulfill({ json: profile })
  })
  await page.route('**/transport/options?**', (route) => {
    searchedUrl = route.request().url()
    return route.fulfill({
      json: {
        origin: 'Lisbon',
        destination: 'Madrid',
        date: '2026-11-14',
        options: [
          {
            id: 'example-air-flight',
            mode: 'flight',
            title: 'Flight - Example Air',
            provider: 'Example Air',
            detail: 'Nonstop, departs 08:05 (morning)',
            stops: 0,
            departs: '08:05:00',
            cabin: 'economy',
            price: '112',
            currency: 'USD',
            estimate: false,
            why: 'Nonstop, morning departure',
            url: 'https://example.com/transport/example-air-flight',
            preferred_provider: true,
          },
        ],
      },
    })
  })

  await page.goto('/account')
  await page.getByRole('link', { name: 'Transport preferences' }).click()
  await expect(page.getByText('Nothing set yet.')).toBeVisible()

  await page.getByRole('button', { name: 'Train' }).click()
  await page.getByRole('radio', { name: 'Business' }).click()
  await page.getByRole('radio', { name: 'Evening' }).click()
  await page.getByRole('radio', { name: '1', exact: true }).click()
  await page.getByLabel('Add a provider').fill('Example Air')
  await page.getByRole('button', { name: 'Add provider' }).click()
  await page.getByRole('button', { name: 'Save preferences' }).click()
  await expect(page.getByText('Transport preferences saved.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('Saved: Train')).toBeVisible()
  await expect(page.getByText('Saved: Business')).toBeVisible()
  await expect(page.getByText('Saved: Evening')).toBeVisible()
  await expect(page.getByText('Saved: Example Air')).toBeVisible()

  await page.getByRole('link', { name: 'Back to search' }).click()
  await page.getByLabel('From').fill('Lisbon')
  await page.getByLabel('To').fill('Madrid')
  await page.getByLabel('Dates').fill('2026-11-14')
  await page.getByRole('button', { name: 'Search' }).click()

  await expect(page.getByText('Preferred provider')).toBeVisible()
  await expect(page.getByText('Matched to your saved transport preferences')).toBeVisible()
  expect(Array.from(new URL(searchedUrl).searchParams.keys())).toEqual(['origin', 'destination', 'date'])
})
