import { readFileSync } from 'node:fs'

import { expect, test } from '@nuxt/test-utils/playwright'
import { getPgmlEditor, readPgmlEditorValue, setPgmlEditorValue } from './helpers/pgml-editor'

test.setTimeout(120_000)

test('studio exports svg and png downloads', async ({ goto, page }) => {
  await goto('/diagram')

  const studioActionsButton = page.getByRole('button', { name: 'Studio actions' })

  await expect(studioActionsButton).toBeVisible()
  await expect(page.locator('[data-attachment-row="index:idx_products_search"]')).toBeVisible()
  await expect(page.locator('[data-attachment-row="function:register_entity"]')).toBeVisible()
  await expect(page.locator('[data-attachment-row="constraint:chk_orders_total"]')).toBeVisible()
  await page.getByRole('button', { name: 'Expand email_address' }).click()
  await expect(page.locator('[data-node-body="custom-type:Domain:email_address"]')).toBeVisible()

  await studioActionsButton.click()

  const svgDownloadPromise = page.waitForEvent('download')

  await page.getByRole('menuitem', { name: 'SVG' }).click()

  const svgDownload = await svgDownloadPromise
  const svgPath = await svgDownload.path()
  const svgText = readFileSync(svgPath!, 'utf8')

  expect(svgDownload.suggestedFilename()).toBe('pgml-diagram.svg')
  expect(svgText).toContain('<linearGradient id="pgml-node-gradient-')
  expect(svgText).toContain('id="pgml-node-custom-type-Domain-email_address-base"')
  expect(svgText).toContain('id="pgml-node-group-Core-gradient"')
  expect(svgText).not.toContain('id="pgml-node-index-idx_products_search-base"')
  expect(svgText).not.toContain('id="pgml-node-function-register_entity-base"')
  expect(svgText).not.toContain('id="pgml-node-constraint-chk_orders_total-base"')
  expect(svgText).not.toContain('color(srgb')
  expect(svgText).not.toContain('color-mix(')
  expect(svgText).not.toContain('var(--')
  expect(svgText).not.toContain('rgba(')
  expect(svgText).toContain('fill-opacity=')
  expect(svgText).toContain('stop-opacity=')
  expect(svgText).toContain('xml:space="preserve"')
  expect(svgText).toContain('idx_products_search')
  expect(svgText).toContain('register_entity')
  expect(svgText).toContain('chk_orders_total')
  expect(svgText).toContain('TRIGGER')
  expect(svgText).toContain('email_address')
  expect(svgText).toContain('id="pgml-table-public-products-base"')

  const coreGroupBaseIndex = svgText.indexOf('id="pgml-node-group-Core-base"')
  const connectorPathIndex = svgText.indexOf('<path d="M')
  const productsTableBaseIndex = svgText.indexOf('id="pgml-table-public-products-base"')

  expect(coreGroupBaseIndex).toBeGreaterThanOrEqual(0)
  expect(connectorPathIndex).toBeGreaterThan(coreGroupBaseIndex)
  expect(productsTableBaseIndex).toBeGreaterThan(connectorPathIndex)

  await studioActionsButton.click()

  const pngDownloadPromise = page.waitForEvent('download')

  await page.getByRole('menuitem', { name: 'PNG 8x' }).click()

  const pngDownload = await pngDownloadPromise

  expect(pngDownload.suggestedFilename()).toBe('pgml-diagram-8x.png')
})

test('diagram export tab previews SQL and Kysely artifacts, downloads files, and persists export options', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await page.locator('[data-diagram-panel-tab="export"]').click()

  await expect(page.locator('[data-export-artifact="sql:migration"]')).toBeVisible()
  await expect(page.locator('[data-export-artifact="sql:ddl"]')).toBeVisible()
  await expect(page.locator('[data-export-artifact="sql:migration"]')).toContainText('BEGIN;')
  await expect(page.locator('[data-export-artifact="sql:ddl"]')).toContainText('CREATE TABLE "public"."users"')

  const sqlDownloadPromise = page.waitForEvent('download')

  await page.locator('[data-export-download="sql:migration"]').click()

  const sqlDownload = await sqlDownloadPromise
  const sqlDownloadPath = await sqlDownload.path()

  expect(sqlDownload.suggestedFilename()).toBe('example-schema.migration.sql')
  expect(readFileSync(sqlDownloadPath!, 'utf8')).toContain('BEGIN;')

  await page.locator('[data-export-format="kysely"]').click()
  await expect(page.locator('[data-export-artifact="kysely:migration"]')).toBeVisible()
  await expect(page.locator('[data-export-artifact="kysely:interfaces"]')).toBeVisible()

  await page.getByLabel('Kysely type style').click()
  await page.getByRole('option', { name: 'Driver-safe strict types' }).click()

  await expect(page.locator('[data-export-artifact="kysely:interfaces"]')).toContainText('export interface Database')
  await expect(page.locator('[data-export-artifact="kysely:migration"]')).toContainText('await sql`')
  await expect(page.locator('[data-export-artifact="kysely:migration"]')).toContainText('CREATE TABLE "public"."users"')

  const storedExportPreferences = await page.evaluate(() => {
    return JSON.parse(window.localStorage.getItem('pgml-export-preferences-v1') || '{}')
  })

  expect(storedExportPreferences['name:example-schema']).toEqual({
    format: 'kysely',
    kyselyTypeStyle: 'strict'
  })

  const kyselyDownloadPromise = page.waitForEvent('download')

  await page.locator('[data-export-download="kysely:interfaces"]').click()

  const kyselyDownload = await kyselyDownloadPromise
  const kyselyDownloadPath = await kyselyDownload.path()

  expect(kyselyDownload.suggestedFilename()).toBe('example-schema.database.ts')
  expect(readFileSync(kyselyDownloadPath!, 'utf8')).toContain('export interface Database')

  await page.reload()
  await page.locator('[data-diagram-panel-tab="export"]').click()

  await expect(page.locator('[data-export-artifact="kysely:migration"]')).toBeVisible()
  await expect(page.locator('[data-export-artifact="kysely:interfaces"]')).toContainText('id: Generated<string>')

  const validSource = await readPgmlEditorValue(editor)
  await setPgmlEditorValue(editor, `${validSource}\n\nTable broken {`)

  await page.locator('[data-diagram-panel-tab="export"]').click()
  await expect(page.locator('[data-diagram-export-panel="true"]')).toContainText('Resolve the current PGML parse errors to generate SQL or Kysely exports.')
  await expect(page.locator('[data-export-artifact="kysely:migration"]')).toHaveCount(0)
})
