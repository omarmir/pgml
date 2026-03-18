import { readFileSync } from 'node:fs'

import { expect, test } from '@nuxt/test-utils/playwright'

test.setTimeout(120_000)

test('studio exports svg and png downloads', async ({ goto, page }) => {
  await goto('/diagram')

  const studioActionsButton = page.getByRole('button', { name: 'Studio actions' })

  await expect(studioActionsButton).toBeVisible()
  await page.getByRole('button', { name: 'Expand register_entity' }).click()
  await expect(page.locator('[data-node-body="function:register_entity"]')).toBeVisible()

  await studioActionsButton.click()

  const svgDownloadPromise = page.waitForEvent('download')

  await page.getByRole('menuitem', { name: 'SVG' }).click()

  const svgDownload = await svgDownloadPromise
  const svgPath = await svgDownload.path()
  const svgText = readFileSync(svgPath!, 'utf8')

  expect(svgDownload.suggestedFilename()).toBe('pgml-diagram.svg')
  expect(svgText).toContain('<linearGradient id="pgml-node-gradient-')
  expect(svgText).toContain('id="pgml-node-function-register_entity-base"')
  expect(svgText).toContain('id="pgml-node-group-Core-gradient"')
  expect(svgText).not.toContain('id="pgml-node-function-register_entity-gradient"')
  expect(svgText).not.toContain('color(srgb')
  expect(svgText).not.toContain('color-mix(')
  expect(svgText).not.toContain('var(--')
  expect(svgText).not.toContain('rgba(')
  expect(svgText).toContain('fill-opacity=')
  expect(svgText).toContain('stop-opacity=')
  expect(svgText).toContain('xml:space="preserve"')
  expect(svgText).toMatch(/<tspan[^>]*>\s{4}BEGIN<\/tspan>/)
  expect(svgText).toMatch(/<tspan[^>]*>\s{6}INSERT INTO public\.common_entity \(entity_type\)<\/tspan>/)

  await studioActionsButton.click()

  const pngDownloadPromise = page.waitForEvent('download')

  await page.getByRole('menuitem', { name: 'PNG 8x' }).click()

  const pngDownload = await pngDownloadPromise

  expect(pngDownload.suggestedFilename()).toBe('pgml-diagram-8x.png')
})
