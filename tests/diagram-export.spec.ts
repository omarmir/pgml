import { expect, test } from '@nuxt/test-utils/playwright'

test.setTimeout(120_000)

test('studio exports svg and png downloads', async ({ goto, page }) => {
  await goto('/diagram')

  const exportButton = page.getByRole('button', { name: 'Export diagram' })

  await expect(exportButton).toBeVisible()

  await exportButton.click()

  const svgDownloadPromise = page.waitForEvent('download')

  await page.getByRole('button', { name: 'SVG' }).click()

  const svgDownload = await svgDownloadPromise

  expect(svgDownload.suggestedFilename()).toBe('pgml-diagram.svg')

  await exportButton.click()

  const pngDownloadPromise = page.waitForEvent('download')

  await page.getByRole('button', { name: 'PNG 8x' }).click()

  const pngDownload = await pngDownloadPromise

  expect(pngDownload.suggestedFilename()).toBe('pgml-diagram-8x.png')
})
