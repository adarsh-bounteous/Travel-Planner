import { expect, test, type Page } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API e2e tests.
async function stub(page: Page) {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/trips', (route) => route.fulfill({ json: [] }))
}

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } })

  test('header pill row scrolls sideways, page does not, and no Menu button', async ({ page }) => {
    await stub(page)
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav).toHaveCSS('overflow-x', 'auto')
    expect(await nav.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    await expect(page.getByRole('banner').getByRole('button', { name: 'Menu' })).toHaveCount(0)
  })

  for (const path of ['/', '/no-such-page']) {
    test(`touch targets on ${path} are at least 44px`, async ({ page }) => {
      await stub(page)
      await page.goto(path)
      await expect(page.getByRole('banner')).toBeVisible()
      for (const el of await page.locator('main a, main button, main input, main select').all()) {
        if (!(await el.isVisible())) continue
        const box = (await el.boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
      for (const el of await page.locator('header a, header button').all()) {
        const box = (await el.boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    })
  }
})

test.describe('desktop width', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('header is one row and styled from tokens', async ({ page }) => {
    await stub(page)
    await page.goto('/')
    const bar = await page.locator('.shell-bar').boundingBox()
    expect(bar!.height).toBeLessThan(80)
    await expect(page.locator('.shell-link[aria-current="page"]')).toHaveCSS(
      'background-color',
      'rgb(236, 254, 255)',
    )
  })

  test('404 state uses the card radius and border colour', async ({ page }) => {
    await stub(page)
    await page.goto('/no-such-page')
    await expect(page.locator('.nf .empty-state')).toHaveCSS('border-radius', '12px')
  })

  test('keyboard focus shows a visible outline', async ({ page }) => {
    await stub(page)
    await page.goto('/')
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus-visible')
    await expect(focused).toHaveCSS('outline-style', 'solid')
    await expect(focused).toHaveCSS('outline-width', '2px')
  })
})

test('reduced motion disables every animation and transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await stub(page)
  await page.goto('/')
  const offenders = await page.evaluate(() =>
    [...document.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el)
      return s.animationName !== 'none' || s.transitionDuration.split(',').some((d) => d.trim() !== '0s')
    }).length,
  )
  expect(offenders).toBe(0)
})

test('no request leaves the app origin', async ({ page }) => {
  const external: string[] = []
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== new URL(page.url() || r.url()).origin)
      external.push(r.url())
  })
  await stub(page)
  await page.goto('/')
  await page.goto('/no-such-page')
  expect(external).toEqual([])
})
