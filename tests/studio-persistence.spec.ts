import { readFileSync } from 'node:fs'

import { expect, test } from '@nuxt/test-utils/playwright'

test.setTimeout(120_000)

test('studio saves, reloads, and downloads PGML with embedded layout', async ({ goto, page }) => {
  await goto('/diagram')
  const studioActionsButton = page.getByRole('button', { name: 'Studio actions' })

  await page.locator('[data-node-anchor="group:Core"]').click()
  await page.locator('input[type="color"]').fill('#14b8a6')
  await page.getByRole('button', { name: 'Expand email_address' }).click()
  await expect(page.locator('[data-node-body="custom-type:Domain:email_address"]')).toBeVisible()

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
  expect(savedSchemas[0]?.text).toContain('color: #14b8a6')
  expect(savedSchemas[0]?.text).toContain('Properties "custom-type:Domain:email_address" {')
  expect(savedSchemas[0]?.text).toContain('collapsed: false')
  expect(savedSchemas[0]?.text).not.toContain('width:')
  expect(savedSchemas[0]?.text).not.toContain('height:')
  expect(savedSchemas[0]?.text).not.toContain('Properties "index:idx_products_search" {')
  expect(savedSchemas[0]?.text).not.toContain('Properties "constraint:chk_orders_total" {')
  expect(savedSchemas[0]?.text).not.toContain('Properties "function:register_entity" {')
  expect(savedSchemas[0]?.text).not.toContain('Properties "custom-type:Domain:email_address" {\n  x:')

  await studioActionsButton.click()
  await page.getByRole('menuitem', { name: 'Clear schema' }).click()
  await expect(page.getByPlaceholder('Paste PGML here...')).toHaveValue('')

  await studioActionsButton.click()
  await page.getByRole('menuitem', { name: 'Load saved schema' }).click()
  await page.getByRole('button', { name: 'Load' }).click()

  await expect(page.getByPlaceholder('Paste PGML here...')).toHaveValue(/Properties "group:Core" \{/)
  await expect(page.locator('[data-node-body="custom-type:Domain:email_address"]')).toBeVisible()

  await studioActionsButton.click()
  await page.getByRole('menuitem', { name: 'Download schema' }).click()

  const downloadPromise = page.waitForEvent('download')

  await page.getByRole('button', { name: 'Download .pgml' }).click()

  const download = await downloadPromise
  const downloadPath = await download.path()

  expect(download.suggestedFilename()).toBe('roundtrip-layout.pgml')
  expect(readFileSync(downloadPath!, 'utf8')).toContain('Properties "group:Core" {')
})

test('save modal lists existing schemas as explicit overwrite targets', async ({ goto, page }) => {
  await goto('/diagram')

  await page.evaluate(() => {
    window.localStorage.setItem('pgml-studio-schemas-v1', JSON.stringify([
      {
        id: 'core-schema',
        name: 'Core schema',
        text: 'Table public.users {\\n  id uuid [pk]\\n}',
        updatedAt: '2026-03-18T16:00:00.000Z'
      }
    ]))
  })

  await page.reload()

  const studioActionsButton = page.getByRole('button', { name: 'Studio actions' })

  await studioActionsButton.click()
  await page.getByRole('menuitem', { name: 'Save schema' }).click()
  await page.getByRole('button', { name: /Core schema/ }).click()

  await expect(page.getByPlaceholder('Schema name')).toHaveValue('Core schema')
  await expect(page.getByRole('button', { name: 'Overwrite saved schema' })).toBeVisible()
})

test('light mode keeps modal secondary actions and select highlights readable', async ({ goto, page }) => {
  await goto('/diagram')

  await page.getByRole('button', { name: 'Switch to light mode' }).click()

  const studioActionsButton = page.getByRole('button', { name: 'Studio actions' })

  await studioActionsButton.click()
  await page.getByRole('menuitem', { name: 'Save schema' }).click()

  const cancelButtonStyles = await page.getByRole('button', { name: 'Cancel' }).evaluate((element) => {
    const styles = window.getComputedStyle(element)

    return {
      backgroundColor: styles.backgroundColor,
      borderColor: styles.borderColor,
      color: styles.color
    }
  })

  expect(cancelButtonStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(cancelButtonStyles.borderColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(cancelButtonStyles.color).not.toBe(cancelButtonStyles.backgroundColor)

  await page.getByRole('button', { name: 'Close' }).click()
  await page.locator('[data-table-edit-button="public.users"]').click()
  const schemaSelectStylesBeforeOpen = await page.getByLabel('Table schema').evaluate((element) => {
    const styles = window.getComputedStyle(element)

    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      boxShadow: styles.boxShadow
    }
  })
  await page.getByLabel('Table schema').hover()
  const schemaSelectStylesHover = await page.getByLabel('Table schema').evaluate((element) => {
    const styles = window.getComputedStyle(element)

    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      boxShadow: styles.boxShadow
    }
  })
  await page.getByLabel('Table schema').click()
  const schemaSelectStylesOpen = await page.getByLabel('Table schema').evaluate((element) => {
    const styles = window.getComputedStyle(element)

    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      boxShadow: styles.boxShadow
    }
  })
  await page.keyboard.press('ArrowDown')

  const highlightedItemStyles = await page.evaluate(() => {
    const highlightedItem = document.querySelector('[data-highlighted]')

    if (!(highlightedItem instanceof HTMLElement)) {
      return null
    }

    const styles = window.getComputedStyle(highlightedItem)
    const beforeStyles = window.getComputedStyle(highlightedItem, '::before')

    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      beforeBackgroundColor: beforeStyles.backgroundColor,
      boxShadow: styles.boxShadow
    }
  })

  expect(schemaSelectStylesBeforeOpen.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(schemaSelectStylesBeforeOpen.color).not.toBe(schemaSelectStylesBeforeOpen.backgroundColor)
  expect(schemaSelectStylesHover.boxShadow).not.toBe(schemaSelectStylesBeforeOpen.boxShadow)
  expect(schemaSelectStylesOpen.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(schemaSelectStylesOpen.color).not.toBe(schemaSelectStylesOpen.backgroundColor)
  expect(schemaSelectStylesOpen.boxShadow).not.toBe(schemaSelectStylesBeforeOpen.boxShadow)
  expect(highlightedItemStyles).not.toBeNull()
  expect(
    highlightedItemStyles?.backgroundColor === 'rgba(0, 0, 0, 0)'
    && highlightedItemStyles?.beforeBackgroundColor === 'rgba(0, 0, 0, 0)'
    && highlightedItemStyles?.boxShadow === 'none'
  ).toBe(false)
  expect(highlightedItemStyles?.color).not.toBe(highlightedItemStyles?.backgroundColor)
})
