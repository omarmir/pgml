import { expect, test } from '@nuxt/test-utils/playwright'
import { getPgmlEditor, readPgmlEditorValue, setPgmlEditorValue } from './helpers/pgml-editor'

test('home page exposes the three schema-source lanes and the SQL dump placeholder', async ({ goto, page }) => {
  await goto('/')

  await expect(page.getByRole('heading', { name: 'Choose where this schema starts.' })).toHaveCount(0)
  await expect(page.locator('[data-source-card="browser-local-storage"]')).toContainText('Browser local storage')
  await expect(page.locator('[data-source-card="computer-saved-file"]')).toContainText('Computer saved file')
  await expect(page.locator('[data-source-card="hosted-database"]')).toContainText('Hosted database')
  await expect(page.getByText('SQL dump', { exact: true })).toHaveCount(3)
  await expect(page.locator('[data-spec-banner="true"]')).toContainText('Need the language reference before you open the studio?')
  await expect(page.getByRole('link', { name: 'Jump to spec' })).toHaveCount(1)
})

test('home page opens a specific browser-saved schema in the studio and keeps it linked to the original save slot', async ({ goto, page }) => {
  await goto('/')

  await page.evaluate(() => {
    window.localStorage.setItem('pgml-studio-schemas-v1', JSON.stringify([
      {
        id: 'billing-schema',
        name: 'Billing schema',
        text: 'Table public.billing_accounts {\\n  id uuid [pk]\\n}',
        updatedAt: '2026-03-20T15:00:00.000Z'
      }
    ]))
  })

  await page.reload()
  await page.locator('[data-source-card="browser-local-storage"]').getByRole('link', { name: /Billing schema/i }).click()

  const editor = getPgmlEditor(page)

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.billing_accounts')
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('Billing schema')

  await page.getByRole('button', { name: 'Schema' }).click()
  await page.getByRole('menuitem', { name: 'Save schema' }).click()
  await expect(page.getByRole('button', { name: 'Overwrite saved schema' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  await setPgmlEditorValue(editor, 'Table public.billing_accounts {\n  id uuid [pk]\n  status text\n}')

  await expect.poll(async () => {
    const savedSchemas = await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')
    })

    return {
      count: savedSchemas.length,
      id: savedSchemas[0]?.id || null,
      text: savedSchemas[0]?.text || ''
    }
  }, {
    timeout: 8000
  }).toEqual({
    count: 1,
    id: 'billing-schema',
    text: expect.stringContaining('status text')
  })
})

test('home page can launch the studio with a blank schema from the browser lane', async ({ goto, page }) => {
  await goto('/')

  await page.locator('[data-source-card="browser-local-storage"]').getByRole('link', { name: 'Start new' }).click()

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toBe('')
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('Untitled schema')
})

test('home page can delete a browser-saved schema from the launch card', async ({ goto, page }) => {
  await goto('/')

  await page.evaluate(() => {
    window.localStorage.setItem('pgml-studio-schemas-v1', JSON.stringify([
      {
        id: 'billing-schema',
        name: 'Billing schema',
        text: 'Table public.billing_accounts {\\n  id uuid [pk]\\n}',
        updatedAt: '2026-03-20T15:00:00.000Z'
      }
    ]))
  })

  await page.reload()

  const browserCard = page.locator('[data-source-card="browser-local-storage"]')

  await expect(browserCard.getByRole('link', { name: /Billing schema/i })).toBeVisible()
  await browserCard.getByRole('button', { name: 'Delete Billing schema' }).click()

  await expect(browserCard.getByRole('link', { name: /Billing schema/i })).toHaveCount(0)
  await expect(browserCard).toContainText('No browser-saved schemas yet.')
  await expect(browserCard).toContainText('0 saved schemas')
  await expect.poll(async () => {
    return await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]').length
    })
  }).toBe(0)
})

test('spec page keeps the hero preview focused and documents the current sections', async ({ goto, page }) => {
  await goto('/spec')

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

test('spec page keeps the table of contents pinned while scrolling', async ({ goto, page }) => {
  await goto('/spec')

  const tableOfContents = page.locator('aside')

  await expect(tableOfContents).toBeVisible()

  await page.evaluate(() => window.scrollTo(0, 1400))

  await expect.poll(async () => {
    const box = await tableOfContents.boundingBox()
    return box ? Math.round(box.y) : null
  }).toBe(96)
})
