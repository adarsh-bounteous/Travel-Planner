import { expect, test } from '@playwright/test'

test('the favicon is served as an SVG (AC4)', async ({ request }) => {
  const res = await request.get('/favicon.svg')
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toContain('image/svg+xml')
})

test('the logo is served as an SVG (AC2)', async ({ request }) => {
  const res = await request.get('/brand/logo.svg')
  expect(res.headers()['content-type']).toContain('image/svg+xml')
})

for (const file of ['/icons/icon-192.png', '/icons/icon-512.png', '/social-preview.png']) {
  test(`${file} is served as a PNG (AC5, AC6, AC7)`, async ({ request }) => {
    const res = await request.get(file)
    expect(res.ok()).toBe(true)
    expect(res.headers()['content-type']).toContain('image/png')
  })
}
