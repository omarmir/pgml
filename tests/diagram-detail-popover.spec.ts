import { expect, test } from '@nuxt/test-utils/playwright'
import {
  getPgmlEditor,
  setPgmlEditorValue
} from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('selecting an attached entity opens a detail popover with its contents', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-entity-row="index:idx_products_search"] button').first().click()

  const popover = page.locator('[data-attachment-popover="index:idx_products_search"]')

  await expect(popover).toBeVisible()
  await expect(popover).toContainText('Index')
  await expect(popover).toContainText('Columns: search')
})

test('selecting a standalone routine opens a detail popover with source lines', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.orders {
  id integer [pk]
  total_cents integer
}

Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}`)

  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await expect(page.locator('[data-browser-entity-row="function:orphan_report"]')).toBeVisible()
  await page.locator('[data-browser-entity-row="function:orphan_report"] button').first().click()

  const popover = page.locator('[data-object-popover="function:orphan_report"]')

  await expect(popover).toBeVisible()
  await expect(popover).toContainText('Function')
  await expect(popover).toContainText('language: sql')
  await expect(popover).toContainText('source:')
  await expect(popover).toContainText('select 1;')
})
