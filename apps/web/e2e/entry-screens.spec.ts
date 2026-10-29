import { expect, test, type Page } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API e2e tests.
async function stub(page: Page, signedIn: boolean) {
  await page.route('**/auth/me', (route) =>
    signedIn
      ? route.fulfill({ json: { email: 'maya@example.com', method: 'email' } })
      : route.fulfill({ status: 401, json: {} }),
  )
  // /trips is also the My trips page URL, so only API calls are stubbed, never the page load.
  await page.route('**/trips', (route) =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : route.fulfill({ json: [{ id: 't1', name: 'Lisbon', destination: 'Portugal' }] }),
  )
}

for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } })

    for (const [path, signedIn] of [
      ['/sign-in', false],
      ['/trips', true],
      ['/trips/new', true],
    ] as const) {
      test(`${path} does not scroll sideways`, async ({ page }) => {
        await stub(page, signedIn)
        await page.goto(path)
        await expect(page.locator('main h1, main h2').first()).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      })
    }

    test('sign-in brand panel is beside the form on desktop, stacked on phone', async ({ page }) => {
      await stub(page, false)
      await page.goto('/sign-in')
      const panel = (await page.locator('.auth-brand').boundingBox())!
      const form = (await page.locator('.auth form').boundingBox())!
      await expect(page.locator('.auth-brand')).toHaveCSS('background-image', /gradient/)
      if (width >= 1280) expect(panel.x + panel.width).toBeLessThanOrEqual(form.x)
      else expect(panel.y + panel.height).toBeLessThanOrEqual(form.y)
    })

    test('trip cards show a gradient cover and a badge', async ({ page }) => {
      await stub(page, true)
      await page.goto('/trips')
      await expect(page.locator('.trip-cover').first()).toHaveCSS('background-image', /linear-gradient/)
      await expect(page.locator('li.card .badge-neutral')).toHaveCount(1)
    })
  })
}
