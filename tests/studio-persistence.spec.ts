import { readFileSync } from 'node:fs'

import { expect, test } from '@nuxt/test-utils/playwright'

test.setTimeout(120_000)

test('studio saves, reloads, and downloads PGML with embedded layout', async ({ goto, page }) => {
  await goto('/diagram')
  const studioActionsButton = page.getByRole('button', { name: 'Studio actions' })

  await studioActionsButton.click()
  await page.getByRole('menuitem', { name: 'Save schema' }).click()

  const modalSurface = await page.evaluate(() => {
    const surface = document.querySelector('[data-studio-modal-surface="schema"]')
    const styles = surface instanceof HTMLElement ? getComputedStyle(surface) : null

    return styles
      ? {
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor
        }
      : null
  })

  expect(modalSurface?.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  await page.getByPlaceholder('Schema name').fill('Roundtrip layout')
  await page.getByRole('button', { name: 'Save to browser' }).click()

  const savedSchemas = await page.evaluate(() => {
    return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')
  })

  expect(savedSchemas).toHaveLength(1)
  expect(savedSchemas[0]?.name).toBe('Roundtrip layout')
  expect(savedSchemas[0]?.text).toContain('Properties "group:Core" {')
  expect(savedSchemas[0]?.text).toContain('Properties "function:register_entity" {')

  await studioActionsButton.click()
  await page.getByRole('menuitem', { name: 'Clear schema' }).click()
  await expect(page.getByPlaceholder('Paste PGML here...')).toHaveValue('')

  await studioActionsButton.click()
  await page.getByRole('menuitem', { name: 'Load saved schema' }).click()
  await page.getByRole('button', { name: 'Load' }).click()

  await expect(page.getByPlaceholder('Paste PGML here...')).toHaveValue(/Properties "group:Core" \{/)

  await studioActionsButton.click()
  await page.getByRole('menuitem', { name: 'Download schema' }).click()

  const downloadPromise = page.waitForEvent('download')

  await page.getByRole('button', { name: 'Download .pgml' }).click()

  const download = await downloadPromise
  const downloadPath = await download.path()

  expect(download.suggestedFilename()).toBe('roundtrip-layout.pgml')
  expect(readFileSync(downloadPath!, 'utf8')).toContain('Properties "group:Core" {')
})
