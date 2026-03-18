import { readFileSync } from 'node:fs'

import { expect, test } from '@nuxt/test-utils/playwright'

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

  await studioActionsButton.click()

  const pngDownloadPromise = page.waitForEvent('download')

  await page.getByRole('menuitem', { name: 'PNG 8x' }).click()

  const pngDownload = await pngDownloadPromise

  expect(pngDownload.suggestedFilename()).toBe('pgml-diagram-8x.png')
})
