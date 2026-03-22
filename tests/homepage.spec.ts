import type { Page } from '@playwright/test'
import { expect, test } from '@nuxt/test-utils/playwright'
import {
  installMockComputerFiles,
  primeMockComputerFile,
  queueMockComputerSave,
  readMockComputerFileState,
  setMockComputerFilePermission
} from './helpers/computer-files'
import { getPgmlEditor, readPgmlEditorValue, setPgmlEditorValue } from './helpers/pgml-editor'

const confirmComputerFileAccess = async (page: Page, continueLabel: string) => {
  const accessDialog = page.locator('[data-studio-modal-surface="computer-file-access"]')

  await expect(accessDialog).toContainText('Why PGML asks')
  await expect(accessDialog).toContainText('What PGML can access')
  await expect(accessDialog).toContainText('What happens next')
  await page.getByRole('button', { name: continueLabel }).click()
}

const getPgDumpImportDialog = (page: Page) => {
  return page.locator('[data-studio-modal-surface="pg-dump-import"]')
}

test('home page exposes the three schema-source lanes and the SQL dump placeholder', async ({ goto, page }) => {
  await goto('/')

  await expect(page.getByRole('heading', { name: 'Choose where this schema starts.' })).toHaveCount(0)
  await expect(page.locator('[data-source-card="browser-local-storage"]')).toContainText('Browser local storage')
  await expect(page.locator('[data-source-card="computer-saved-file"]')).toContainText('Computer saved file')
  await expect(page.locator('[data-source-card="hosted-database"]')).toContainText('Hosted database')
  await expect(page.getByText('SQL dump', { exact: true })).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Import a pg_dump' })).toHaveCount(3)
  await expect(page.locator('[data-spec-banner="true"]')).toContainText('Need the language reference before you open the studio?')
  await expect(page.getByRole('link', { name: 'Jump to spec' })).toHaveCount(1)
})

test('studio redirects back home until the user launches it from the source chooser', async ({ goto, page }) => {
  await goto('/diagram')

  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('[data-source-card="browser-local-storage"]')).toBeVisible()
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

test('home page can import a pasted pg_dump into the browser lane', async ({ goto, page }) => {
  await goto('/')

  const browserCard = page.locator('[data-source-card="browser-local-storage"]')

  await browserCard.getByRole('button', { name: 'Import a pg_dump' }).click()

  const importDialog = getPgDumpImportDialog(page)

  await expect(importDialog).toContainText('Import pg_dump into browser storage')
  await importDialog.locator('textarea').fill(`CREATE TABLE public.users (
  id uuid NOT NULL,
  email text NOT NULL
);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);`)
  await page.getByRole('button', { name: 'Import into browser storage' }).click()

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('Table public.users')
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('Imported schema')
  await expect.poll(async () => {
    return await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]').length
    })
  }).toBe(1)
})

test('studio header includes a Home link back to the source chooser', async ({ goto, page }) => {
  await goto('/')

  await page.locator('[data-source-card="browser-local-storage"]').getByRole('link', { name: 'Start from example' }).click()

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('TableGroup Core')
  await page.getByRole('link', { name: 'Home' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('[data-source-card="browser-local-storage"]')).toBeVisible()
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

test('home page can create a blank computer-backed file, autosave to it, and reopen it from recents', async ({ goto, page }) => {
  await installMockComputerFiles(page)
  await goto('/')
  const recentFileId = await queueMockComputerSave(page, 'blank-computer-schema.pgml')

  expect(recentFileId).toBeTruthy()
  await page.locator('[data-source-card="computer-saved-file"]').getByRole('button', { name: 'Start new' }).click()
  await confirmComputerFileAccess(page, 'Continue to save dialog')

  const editor = getPgmlEditor(page)

  await expect.poll(async () => readPgmlEditorValue(editor)).toBe('')
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('blank-computer-schema')

  await setPgmlEditorValue(editor, 'Table public.file_backed {\n  id uuid [pk]\n}')

  await expect.poll(async () => {
    const state = await readMockComputerFileState(page)

    return recentFileId ? state?.files[recentFileId]?.text || '' : ''
  }, {
    timeout: 8000
  }).toContain('Table public.file_backed')

  await page.goBack()

  const fileCard = page.locator('[data-source-card="computer-saved-file"]')
  const blankSchemaRecentButton = fileCard.locator('button.studio-choice-button').filter({
    hasText: 'blank-computer-schema'
  })

  await expect(fileCard).toContainText('1 recent file')
  await expect(blankSchemaRecentButton).toBeVisible()
  await blankSchemaRecentButton.click()
  await expect(page.locator('[data-studio-modal-surface="computer-file-access"]')).toHaveCount(0)

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('Table public.file_backed')
})

test('home page can import a pg_dump file into a new computer-backed file', async ({ goto, page }) => {
  await installMockComputerFiles(page)
  await goto('/')
  const recentFileId = await queueMockComputerSave(page, 'orders-import.pgml')

  expect(recentFileId).toBeTruthy()
  await page.locator('[data-source-card="computer-saved-file"]').getByRole('button', { name: 'Import a pg_dump' }).click()

  const importDialog = getPgDumpImportDialog(page)

  await importDialog.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(`CREATE TABLE public.orders (
  id uuid NOT NULL,
  customer_id uuid
);
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);`),
    mimeType: 'text/plain',
    name: 'orders.sql'
  })
  await page.getByRole('button', { name: 'Import into new file' }).click()
  await confirmComputerFileAccess(page, 'Continue to save dialog')

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('Table public.orders')
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('orders-import')

  const state = await readMockComputerFileState(page)

  expect(recentFileId ? state?.files[recentFileId]?.text : null).toContain('Table public.orders')
})

test('home page can remove a recent computer file without deleting the underlying file', async ({ goto, page }) => {
  await installMockComputerFiles(page)
  await goto('/')
  const recentFileId = await primeMockComputerFile(page, {
    fileName: 'remove-me-schema.pgml',
    text: 'Table public.remove_me {\n  id uuid [pk]\n}'
  })

  expect(recentFileId).toBeTruthy()
  await page.reload()

  const fileCard = page.locator('[data-source-card="computer-saved-file"]')
  const removeMeRecentButton = fileCard.locator('button.studio-choice-button').filter({
    hasText: 'remove-me-schema'
  })

  await expect(removeMeRecentButton).toBeVisible()
  await fileCard.getByRole('button', { name: 'Remove remove-me-schema from recent files' }).click()

  await expect(removeMeRecentButton).toHaveCount(0)
  await expect(fileCard).toContainText('No recent computer files yet.')
  await expect(fileCard).toContainText('0 recent files')

  await expect.poll(async () => {
    const state = await readMockComputerFileState(page)

    return {
      fileExists: recentFileId ? Boolean(state?.files[recentFileId]) : false,
      recentCount: state?.recent.length || 0
    }
  }).toEqual({
    fileExists: true,
    recentCount: 0
  })
})

test('home page can seed a new computer-backed file from the bundled example', async ({ goto, page }) => {
  await installMockComputerFiles(page)
  await goto('/')
  const recentFileId = await queueMockComputerSave(page, 'example-seeded-schema.pgml')

  expect(recentFileId).toBeTruthy()
  await page.locator('[data-source-card="computer-saved-file"]').getByRole('button', { name: 'Start from example' }).click()
  await confirmComputerFileAccess(page, 'Continue to save dialog')

  const editor = getPgmlEditor(page)

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('TableGroup Core')
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('example-seeded-schema')

  const state = await readMockComputerFileState(page)

  expect(recentFileId ? state?.files[recentFileId]?.text : null).toContain('TableGroup Core')
})

test('home page shows an error when both pasted text and a pg_dump file are provided', async ({ goto, page }) => {
  await goto('/')

  await page.locator('[data-source-card="browser-local-storage"]').getByRole('button', { name: 'Import a pg_dump' }).click()

  const importDialog = getPgDumpImportDialog(page)

  await importDialog.locator('textarea').fill('CREATE TABLE public.users (id uuid NOT NULL);')
  await importDialog.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from('CREATE TABLE public.accounts (id uuid NOT NULL);'),
    mimeType: 'text/plain',
    name: 'accounts.sql'
  })

  await expect(importDialog).toContainText('Choose either pasted pg_dump text or a file upload, not both.')
  await page.getByRole('button', { name: 'Import into browser storage' }).click()
  await expect(importDialog).toBeVisible()
})

test('home page still explains computer-file access when a recent file no longer has permission', async ({ goto, page }) => {
  await installMockComputerFiles(page)
  await goto('/')
  const recentFileId = await primeMockComputerFile(page, {
    fileName: 'permission-reset-schema.pgml',
    text: 'Table public.permission_reset {\n  id uuid [pk]\n}'
  })

  expect(recentFileId).toBeTruthy()
  await setMockComputerFilePermission(page, {
    fileId: recentFileId as string,
    queryPermission: 'prompt',
    requestPermission: 'granted'
  })
  await page.reload()

  const fileCard = page.locator('[data-source-card="computer-saved-file"]')
  const permissionResetRecentButton = fileCard.locator('button.studio-choice-button').filter({
    hasText: 'permission-reset-schema'
  })

  await expect(permissionResetRecentButton).toBeVisible()
  await permissionResetRecentButton.click()
  await confirmComputerFileAccess(page, 'Continue and reopen file')

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('Table public.permission_reset')
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
