import { readFileSync } from 'node:fs'

import type { Page } from '@playwright/test'
import { expect, test } from '@nuxt/test-utils/playwright'
import {
  installMockComputerFiles,
  primeMockComputerFile,
  readMockComputerFileState,
  setMockComputerFilePermission
} from './helpers/computer-files'
import { getPgmlEditor, readPgmlEditorValue, setPgmlEditorValue } from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

const confirmComputerFileAccess = async (page: Page, continueLabel: string) => {
  const accessDialog = page.locator('[data-studio-modal-surface="computer-file-access"]')

  await expect(accessDialog).toBeVisible()
  await page.getByRole('button', { name: continueLabel }).click()
}

test('studio saves, reloads, and downloads PGML with embedded layout', async ({ goto, page }) => {
  await goto('/diagram')
  const schemaMenuButton = page.getByRole('button', { name: 'Schema' })
  const editor = getPgmlEditor(page)

  await page.locator('[data-node-anchor="group:Core"]').dispatchEvent('click')
  await expect(page.locator('input[type="color"]')).toBeVisible()
  await page.locator('input[type="color"]').fill('#14b8a6')
  await page.getByRole('button', { name: 'Expand email_address' }).click()
  await expect(page.locator('[data-node-body="custom-type:Domain:email_address"]')).toBeVisible()

  await schemaMenuButton.click()
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
  await expect(
    page.getByLabel('Notifications (F8)').getByText('Saved to browser local storage.', { exact: true })
  ).toBeVisible()

  const savedSchemas = await page.evaluate(() => {
    return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')
  })

  expect(savedSchemas).toHaveLength(1)
  expect(savedSchemas[0]?.name).toBe('Roundtrip layout')
  expect(savedSchemas[0]?.text).toContain('Properties "group:Core" {')
  expect(savedSchemas[0]?.text).toContain('color: #14b8a6')
  expect(savedSchemas[0]?.text).toContain('Properties "custom-type:Domain:email_address" {')
  expect(savedSchemas[0]?.text).toContain('x:')
  expect(savedSchemas[0]?.text).toContain('y:')
  expect(savedSchemas[0]?.text).toContain('collapsed: false')
  expect(savedSchemas[0]?.text).not.toContain('width:')
  expect(savedSchemas[0]?.text).not.toContain('height:')
  expect(savedSchemas[0]?.text).not.toContain('Properties "index:idx_products_search" {')
  expect(savedSchemas[0]?.text).not.toContain('Properties "constraint:chk_orders_total" {')
  expect(savedSchemas[0]?.text).not.toContain('Properties "function:register_entity" {')

  await schemaMenuButton.click()
  await page.getByRole('menuitem', { name: 'Clear schema' }).click()
  await expect.poll(async () => readPgmlEditorValue(editor)).toBe('')

  await schemaMenuButton.click()
  await page.getByRole('menuitem', { name: 'Load saved schema' }).click()
  await page.getByRole('button', { name: 'Load' }).click()

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Properties "group:Core" \{/)
  await expect(page.locator('[data-node-body="custom-type:Domain:email_address"]')).toBeVisible()

  await schemaMenuButton.click()
  await page.getByRole('menuitem', { name: 'Download schema' }).click()

  const downloadPromise = page.waitForEvent('download')

  await page.getByRole('button', { name: 'Download .pgml' }).click()

  const download = await downloadPromise
  const downloadPath = await download.path()

  expect(download.suggestedFilename()).toBe('roundtrip-layout.pgml')
  expect(readFileSync(downloadPath!, 'utf8')).toContain('Properties "group:Core" {')
})

test('entity visibility persists when a saved schema is reloaded', async ({ goto, page }) => {
  await goto('/diagram')

  const schemaMenuButton = page.getByRole('button', { name: 'Schema' })
  const editor = getPgmlEditor(page)

  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-visibility-toggle="public.users"]').click()
  await expect(page.locator('[data-table-anchor="public.users"]')).toHaveCount(0)

  await schemaMenuButton.click()
  await page.getByRole('menuitem', { name: 'Save schema' }).click()
  await page.getByPlaceholder('Schema name').fill('Hidden users')
  await page.getByRole('button', { name: 'Save to browser' }).click()

  const savedSchemas = await page.evaluate(() => {
    return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')
  })

  expect(savedSchemas[0]?.text).toContain('Properties "public.users" {')
  expect(savedSchemas[0]?.text).toContain('visible: false')

  await schemaMenuButton.click()
  await page.getByRole('menuitem', { name: 'Clear schema' }).click()
  await expect.poll(async () => readPgmlEditorValue(editor)).toBe('')

  await schemaMenuButton.click()
  await page.getByRole('menuitem', { name: 'Load saved schema' }).click()
  await page.getByRole('button', { name: 'Load' }).click()

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Properties "public\.users" \{[\s\S]*visible: false/)
  await expect(page.locator('[data-table-anchor="public.users"]')).toHaveCount(0)
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

  const schemaMenuButton = page.getByRole('button', { name: 'Schema' })

  await schemaMenuButton.click()
  await page.getByRole('menuitem', { name: 'Save schema' }).click()
  await page.getByRole('button', { name: /Core schema/ }).click()

  await expect(page.getByPlaceholder('Schema name')).toHaveValue('Core schema')
  await expect(page.getByRole('button', { name: 'Overwrite saved schema' })).toBeVisible()
})

test('studio restores the most recently saved schema after reload and shows its name in the header', async ({ goto, page }) => {
  await goto('/diagram')

  await page.evaluate(() => {
    window.localStorage.setItem('pgml-studio-schemas-v1', JSON.stringify([
      {
        id: 'older-schema',
        name: 'Older schema',
        text: 'Table public.older {\\n  id uuid [pk]\\n}',
        updatedAt: '2026-03-18T16:00:00.000Z'
      },
      {
        id: 'latest-schema',
        name: 'Latest schema',
        text: 'Table public.latest {\\n  id uuid [pk]\\n}',
        updatedAt: '2026-03-19T10:30:00.000Z'
      }
    ]))
  })

  await page.reload()

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toMatch(/Table public\.latest \{/)
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('Latest schema')
  await expect(page.locator('[data-studio-schema-status]')).toHaveAttribute('data-studio-schema-status', 'saved')
})

test('studio autosaves changes to local storage and updates the header status icon', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('Example schema')
  await expect(page.locator('[data-studio-schema-status]')).toHaveCount(0)
  await expect(page.locator('[data-studio-schema-status-icon="true"]')).toHaveCount(0)

  await setPgmlEditorValue(editor, `${await readPgmlEditorValue(editor)}\n// autosave change`)

  await expect(page.locator('[data-studio-schema-status]')).toHaveCount(0)
  await expect(page.locator('[data-studio-schema-status-icon="true"]')).toHaveCount(0)

  await expect.poll(async () => {
    const savedSchemas = await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')
    })
    const status = await page.locator('[data-studio-schema-status]').getAttribute('data-studio-schema-status')
    const iconClass = await page.locator('[data-studio-schema-status-icon="true"]').getAttribute('class')

    return {
      count: savedSchemas.length,
      status,
      updatedAt: typeof savedSchemas[0]?.updatedAt === 'string',
      iconClass
    }
  }, {
    timeout: 8000
  }).toEqual({
    count: 1,
    status: 'saved',
    updatedAt: true,
    iconClass: expect.not.stringContaining('animate-spin')
  })
})

test('browser-backed save failures show a toast', async ({ goto, page }) => {
  await goto('/diagram')

  await page.evaluate(() => {
    const storagePrototype = Object.getPrototypeOf(window.localStorage) as Storage

    Object.defineProperty(storagePrototype, 'setItem', {
      configurable: true,
      value: () => {
        throw new Error('Unable to save to local storage.')
      }
    })
  })

  await page.getByRole('button', { name: 'Schema' }).click()
  await page.getByRole('menuitem', { name: 'Save schema' }).click()
  await page.getByRole('button', { name: 'Save to browser' }).click()

  await expect(
    page.getByLabel('Notifications (F8)').getByText('Unable to save to local storage.', { exact: true })
  ).toBeVisible()
})

test('file-backed studio saves back to the selected computer file', async ({ goto, page }) => {
  await installMockComputerFiles(page)
  await goto('/')
  const recentFileId = await primeMockComputerFile(page, {
    fileName: 'linked-file.pgml',
    text: 'Table public.linked {\n  id uuid [pk]\n}',
    updatedAt: '2026-03-20T11:00:00.000Z'
  })

  await goto(`/diagram?source=file&launch=recent&file=${recentFileId}`)

  const editor = getPgmlEditor(page)

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.linked')
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('linked-file')

  await setPgmlEditorValue(editor, 'Table public.linked {\n  id uuid [pk]\n  status text\n}')
  await page.getByRole('button', { name: 'Schema' }).click()
  await page.getByRole('menuitem', { name: 'Save schema' }).click()
  await expect(page.getByRole('button', { name: 'Save to file' })).toBeVisible()
  await page.getByRole('button', { name: 'Save to file' }).click()
  await expect(
    page.getByLabel('Notifications (F8)').getByText('Saved to the selected file.', { exact: true })
  ).toBeVisible()

  await expect.poll(async () => {
    const state = await readMockComputerFileState(page)

    return recentFileId ? state?.files[recentFileId]?.text || '' : ''
  }).toContain('status text')
})

test('file-backed save asks for permission again after access is reset', async ({ goto, page }) => {
  await installMockComputerFiles(page)
  await goto('/')
  const recentFileId = await primeMockComputerFile(page, {
    fileName: 'reauthorize-file.pgml',
    text: 'Table public.reauthorize {\n  id uuid [pk]\n}',
    updatedAt: '2026-03-20T11:00:00.000Z'
  })

  await page.reload()
  await page.locator('[data-source-card="computer-saved-file"]').getByRole('button', { name: /reauthorize-file/i }).click()
  await confirmComputerFileAccess(page, 'Continue and reopen file')

  const editor = getPgmlEditor(page)

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.reauthorize')
  await setMockComputerFilePermission(page, {
    fileId: recentFileId || '',
    queryPermission: 'prompt',
    requestPermission: 'granted'
  })
  await setPgmlEditorValue(editor, 'Table public.reauthorize {\n  id uuid [pk]\n  status text\n}')

  await expect.poll(async () => {
    return await page.locator('body').textContent()
  }, {
    timeout: 8000
  }).toContain('File access needs to be restored before PGML can save again. Use Save to grant permission again.')
  await expect.poll(async () => {
    const state = await readMockComputerFileState(page)

    return recentFileId ? state?.files[recentFileId]?.text || '' : ''
  }, {
    timeout: 8000
  }).not.toContain('status text')

  await page.getByRole('button', { name: 'Schema' }).click()
  await page.getByRole('menuitem', { name: 'Save schema' }).click()
  await page.getByRole('button', { name: 'Save to file' }).click()

  await expect.poll(async () => {
    const state = await readMockComputerFileState(page)

    return recentFileId ? state?.files[recentFileId]?.text || '' : ''
  }).toContain('status text')
})

test('light mode keeps modal secondary actions and select highlights readable', async ({ goto, page }) => {
  await goto('/diagram')

  await page.getByRole('button', { name: 'Switch to light mode' }).click()

  const schemaMenuButton = page.getByRole('button', { name: 'Schema' })

  await schemaMenuButton.click()
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
