import { expect, test } from '@nuxt/test-utils/playwright'

test('landing page keeps the hero preview focused and documents the current sections', async ({ goto, page }) => {
  await goto('/')

  const heroQuickStart = page.locator('[data-testid="hero-quick-start"]')

  await expect(heroQuickStart).toBeVisible()
  await expect(heroQuickStart).toContainText('TableGroup Commerce')
  await expect(heroQuickStart).toContainText('Table public.orders')
  await expect(heroQuickStart).toContainText('Function register_entity(entity_kind text) returns trigger [replace]')
  await expect(heroQuickStart).not.toContainText('Properties "group:Commerce"')

  await expect(page.getByRole('heading', { name: 'Use PGML when the schema is part structure, part behavior, and part documentation.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'PGML is intentionally close to DBML, then opinionated where Postgres needs more surface area.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The language is block-based, readable, and meant to be learned from examples.' })).toBeVisible()
})

test('landing page keeps the table of contents pinned while scrolling', async ({ goto, page }) => {
  await goto('/')

  const tableOfContents = page.locator('aside')

  await expect(tableOfContents).toBeVisible()

  await page.evaluate(() => window.scrollTo(0, 1400))

  await expect.poll(async () => {
    const box = await tableOfContents.boundingBox()
    return box ? Math.round(box.y) : null
  }).toBe(96)
})
