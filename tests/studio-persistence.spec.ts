import { readFileSync } from 'node:fs'

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

test('studio saves, reloads, and downloads PGML with embedded layout', async ({ goto, page }) => {
  await goto('/diagram')
  const schemaMenuButton = page.getByRole('button', { name: 'Schema' })
  const editor = getPgmlEditor(page)

  await page.locator('[data-node-anchor="group:Core"]').dispatchEvent('click')
  await expect(page.locator('input[type="color"]')).toBeVisible()
  await page.locator('input[type="color"]').fill('#14b8a6')
  await page.getByRole('switch', { name: 'Masonry' }).click()
  await page.getByLabel('Table width scale', { exact: true }).click()
  await page.getByRole('option', { name: '1.5x' }).click()
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
  expect(savedSchemas[0]?.text).toContain('masonry: true')
  expect(savedSchemas[0]?.text).toContain('table_width_scale: 1.5')
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
  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Properties "group:Core" \{[\s\S]*masonry: true/)
  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Properties "group:Core" \{[\s\S]*table_width_scale: 1.5/)
  await expect(page.locator('[data-node-body="custom-type:Domain:email_address"]')).toBeVisible()

  await schemaMenuButton.click()
  await page.getByRole('menuitem', { name: 'Download schema' }).click()

  const downloadPromise = page.waitForEvent('download')

  await page.getByRole('button', { name: 'Download .pgml' }).click()

  const download = await downloadPromise
  const downloadPath = await download.path()

  expect(download.suggestedFilename()).toBe('roundtrip-layout.pgml')
  expect(readFileSync(downloadPath!, 'utf8')).toContain('Properties "group:Core" {')
  expect(readFileSync(downloadPath!, 'utf8')).toContain('masonry: true')
  expect(readFileSync(downloadPath!, 'utf8')).toContain('table_width_scale: 1.5')
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
  await expect(page.locator('[data-studio-schema-status]')).toHaveCount(0)
})

test('studio autosaves changes to local storage and updates the header status icon', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('Example schema')
  await expect(page.locator('[data-studio-schema-status]')).toHaveCount(0)
  await expect(page.locator('[data-studio-schema-status-icon="true"]')).toHaveCount(0)

  await setPgmlEditorValue(editor, `${await readPgmlEditorValue(editor)}\n// autosave change`)

  await expect(page.locator('[data-studio-schema-status]')).toHaveAttribute('data-studio-schema-status', 'pending')
  await expect(page.locator('[data-studio-schema-status-icon="true"]')).toHaveClass(/animate-spin/)

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

test('studio reloads malformed workspace indentation as normalized PGML in the raw editor', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const malformedSource = `TableGroup Core {
                                                                                                        public.tenants
                                                                                                        public.accounts
}`

  await setPgmlEditorValue(editor, malformedSource)
  await expect(page.locator('[data-studio-schema-status]')).toHaveAttribute('data-studio-schema-status', 'pending')

  await expect.poll(async () => {
    const savedSchemas = await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')
    })
    const status = await page.locator('[data-studio-schema-status]').getAttribute('data-studio-schema-status')

    return {
      count: savedSchemas.length,
      status
    }
  }, {
    timeout: 8000
  }).toEqual({
    count: 1,
    status: 'saved'
  })

  await page.reload()

  await expect.poll(async () => {
    return readPgmlEditorValue(getPgmlEditor(page))
  }).toBe(`TableGroup Core {
  public.tenants
  public.accounts
}`)
})

test('studio reloads malformed embedded SQL indentation as normalized PGML in the raw editor', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const malformedSource = `Function sync_users() returns trigger {
  source: $sql$
                                                                                                        CREATE FUNCTION public.sync_users() RETURNS trigger LANGUAGE plpgsql AS $$
                                                                                                        BEGIN
                                                                                                          RETURN NEW;
                                                                                                        END;
                                                                                                        $$;
  $sql$
}`

  await setPgmlEditorValue(editor, malformedSource)
  await expect(page.locator('[data-studio-schema-status]')).toHaveAttribute('data-studio-schema-status', 'pending')

  await expect.poll(async () => {
    const savedSchemas = await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')
    })
    const status = await page.locator('[data-studio-schema-status]').getAttribute('data-studio-schema-status')

    return {
      count: savedSchemas.length,
      status
    }
  }, {
    timeout: 8000
  }).toEqual({
    count: 1,
    status: 'saved'
  })

  await page.reload()

  await expect.poll(async () => {
    return readPgmlEditorValue(getPgmlEditor(page))
  }).toBe(`Function sync_users() returns trigger {
  source: $sql$
    CREATE FUNCTION public.sync_users() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RETURN NEW;
    END;
    $$;
  $sql$
}`)
})

test('standalone function collapse toggles autosave and persists embedded PGML properties', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const source = `Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}`

  await setPgmlEditorValue(editor, source)
  await expect(page.locator('[data-node-anchor="function:orphan_report"]')).toBeVisible()
  await expect.poll(async () => {
    return page.locator('[data-studio-schema-status]').getAttribute('data-studio-schema-status')
  }, {
    timeout: 8000
  }).toBe('saved')

  await page.getByRole('button', { name: 'Expand orphan_report' }).click()
  await expect(page.locator('[data-node-body="function:orphan_report"]')).toBeVisible()
  await expect(page.locator('[data-studio-schema-status]')).toHaveAttribute('data-studio-schema-status', 'pending')
  await expect.poll(async () => readPgmlEditorValue(editor), {
    timeout: 8000
  }).toMatch(/Properties "function:orphan_report" \{[\s\S]*collapsed: false/)
  await expect.poll(async () => {
    const savedSchemas = await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')
    })
    const status = await page.locator('[data-studio-schema-status]').getAttribute('data-studio-schema-status')

    return {
      count: savedSchemas.length,
      status,
      text: savedSchemas[0]?.text || ''
    }
  }, {
    timeout: 8000
  }).toEqual({
    count: 1,
    status: 'saved',
    text: expect.stringMatching(/Properties "function:orphan_report" \{[\s\S]*collapsed: false/)
  })

  await page.getByRole('button', { name: 'Collapse orphan_report' }).click()
  await expect(page.locator('[data-node-body="function:orphan_report"]')).toHaveCount(0)
  await expect.poll(async () => readPgmlEditorValue(editor), {
    timeout: 8000
  }).toMatch(/Properties "function:orphan_report" \{[\s\S]*collapsed: true/)
  await expect.poll(async () => {
    const savedSchemas = await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')
    })
    const status = await page.locator('[data-studio-schema-status]').getAttribute('data-studio-schema-status')

    return {
      count: savedSchemas.length,
      status,
      text: savedSchemas[0]?.text || ''
    }
  }, {
    timeout: 8000
  }).toEqual({
    count: 1,
    status: 'saved',
    text: expect.stringMatching(/Properties "function:orphan_report" \{[\s\S]*collapsed: true/)
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
  await page.locator('[data-source-card="computer-saved-file"]').locator('button.studio-choice-button').filter({
    hasText: 'reauthorize-file'
  }).click()
  await expect(page.locator('[data-studio-modal-surface="computer-file-access"]')).toHaveCount(0)

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

test('android-style file sessions keep edits pending until an explicit save', async ({ goto, page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36'
    })
  })
  await installMockComputerFiles(page)
  await page.setViewportSize({
    width: 390,
    height: 844
  })
  await goto('/')
  const recentFileId = await primeMockComputerFile(page, {
    fileName: 'android-file.pgml',
    text: 'Table public.android_schema {\n  id uuid [pk]\n}',
    updatedAt: '2026-03-20T11:00:00.000Z'
  })

  await goto(`/diagram?source=file&launch=recent&file=${recentFileId}`)

  const editor = getPgmlEditor(page)

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.android_schema')
  await setPgmlEditorValue(editor, 'Table public.android_schema {\n  id uuid [pk]\n  status text\n}')
  await page.waitForTimeout(6000)

  await expect.poll(async () => {
    const state = await readMockComputerFileState(page)

    return recentFileId ? state?.files[recentFileId]?.text || '' : ''
  }).not.toContain('status text')
  await expect(page.locator('body')).not.toContainText(
    'File access needs to be restored before PGML can save again. Use Save to grant permission again.'
  )
  await expect(page.locator('body')).toContainText(
    'Changes are pending. Use Save to write them to the selected file on mobile Chrome.'
  )

  await page.setViewportSize({
    width: 1280,
    height: 844
  })
  await page.getByRole('button', { name: 'Schema' }).click()
  await page.getByRole('menuitem', { name: 'Save schema' }).click()
  await page.getByRole('button', { name: 'Save to file' }).click()

  await expect(
    page.getByLabel('Notifications (F8)').getByText('Saved to the selected file.', { exact: true })
  ).toBeVisible()
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
