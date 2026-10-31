import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; the catalogue's completeness is covered by the API tests.
const catalogue = [
  { name: 'Japan', places: ['Tokyo', 'Kyoto', 'Osaka'] },
  { name: 'Portugal', places: ['Lisbon', 'Porto', 'Lagos'] },
  { name: 'India', places: ['Delhi', 'Jaipur', 'Goa'] },
  { name: 'Thailand', places: ['Bangkok', 'Chiang Mai', 'Phuket'] },
  { name: 'Mexico', places: ['Mexico City', 'Oaxaca', 'Tulum'] },
  { name: 'Morocco', places: ['Marrakech', 'Fez', 'Chefchaouen'] },
  { name: 'Peru', places: ['Lima', 'Cusco', 'Arequipa'] },
]

test('every starter place books and shows its content', async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/starter-destinations', (route) => route.fulfill({ json: catalogue }))
  await page.route('**/starter-destinations/*/*', (route) => {
    const place = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!)
    return route.fulfill({
      json: {
        name: place,
        places: [{ name: 'Sample place', note: 'A note' }],
        restaurants: [{ name: 'Sample restaurant', note: 'A note' }],
        stays: [{ name: 'Sample stay', note: 'A note', price_per_night: 100, currency: 'USD' }],
        activities: [{ name: 'Sample activity', note: 'A note' }],
        medical_guidance: 'Sample guidance.',
      },
    })
  })

  for (const { name: country, places } of catalogue) {
    for (const place of places) {
      await page.goto('/trips/plan')
      await page.getByRole('button', { name: /destination/i }).click()
      await page.getByRole('option', { name: country }).click()
      await page.getByRole('button', { name: /place/i }).click()
      await page.getByRole('option', { name: place, exact: true }).click()
      await page.getByRole('button', { name: 'Book trip' }).click()
      await expect(page.getByText(`Trip booked: ${place}, ${country}`)).toBeVisible()
      await page.getByRole('link', { name: 'View place content' }).click()
      await expect(page.getByRole('heading', { name: 'Medical guidance' })).toBeVisible()
      await expect(page.getByText(/no data/i)).toHaveCount(0)
      await page.getByRole('link', { name: 'Back to trip' }).click()
      await expect(page.getByRole('heading', { name: 'Plan a trip' })).toBeVisible()
      await expect(page.getByRole('button', { name: /place/i })).toHaveText(new RegExp(place))
    }
  }
})
