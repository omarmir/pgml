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

const getDbmlImportDialog = (page: Page) => {
  return page.locator('[data-studio-modal-surface="dbml-import"]')
}

const chooseImportedWorkspace = async (page: Page, label: 'Open Analysis' | 'Open Diagram') => {
  const launchDialog = page.locator('[data-studio-modal-surface="imported-schema-launch"]')

  await expect(launchDialog).toContainText('Open imported schema')
  await page.getByRole('button', { name: label }).click()
}

test('home page exposes the three schema-source lanes and the import actions', async ({ goto, page }) => {
  await goto('/')

  await expect(page.getByRole('heading', { name: 'Choose where this schema starts.' })).toHaveCount(0)
  await expect(page.locator('[data-source-card="browser-local-storage"]')).toContainText('Browser local storage')
  await expect(page.locator('[data-source-card="computer-saved-file"]')).toContainText('Computer saved file')
  await expect(page.locator('[data-source-card="hosted-database"]')).toContainText('Hosted database')
  await expect(page.locator('[data-source-card="browser-local-storage"]')).toContainText('Open bundled example')
  await expect(page.locator('[data-source-card="computer-saved-file"]')).toContainText('Save example to a new file')
  await expect(page.locator('[data-source-card="hosted-database"]')).toContainText('Preview hosted example')
  await expect(page.getByText('Imports', { exact: true })).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Import into browser storage' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Import DBML into browser storage' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Import into a new file' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Import DBML into a new file' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Import from hosted lane' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Import DBML from hosted lane' })).toHaveCount(1)
  await expect(page.locator('[data-spec-banner="true"]')).toContainText('Need the PGML spec before you open analysis, compare, and migrations?')
  await expect(page.locator('[data-spec-banner="true"]')).toContainText('DBML and pg_dump imports')
  await expect(page.getByRole('link', { name: 'Jump to spec' })).toHaveCount(1)
})

test('home page keeps source inventory visible on mobile cards', async ({ goto, page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  })
  await goto('/')

  const browserCard = page.locator('[data-source-card="browser-local-storage"]')
  const browserInventory = browserCard.locator('[data-source-card-inventory="true"]')
  const computerInventory = page.locator('[data-source-card="computer-saved-file"] [data-source-card-inventory="true"]')

  await expect(browserInventory).toBeVisible()
  await expect(browserInventory).toContainText('Inventory')
  await expect(browserInventory).toContainText('0 saved schemas')
  await expect(computerInventory).toContainText('0 recent files')
})

test('studio routes redirect back home until the user launches them from the source chooser', async ({ goto, page }) => {
  await goto('/diagram')

  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('[data-source-card="browser-local-storage"]')).toBeVisible()

  await goto('/analysis')

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

  await browserCard.getByRole('button', { name: 'Import into browser storage' }).click()

  const importDialog = getPgDumpImportDialog(page)

  await expect(importDialog).toContainText('Import pg_dump into browser storage')
  await importDialog.locator('textarea').fill(`CREATE TABLE public.users (
  id uuid NOT NULL,
  email text NOT NULL
);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);`)
  await page.getByRole('button', { name: 'Import into browser storage' }).click()
  await chooseImportedWorkspace(page, 'Open Diagram')

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('Table public.users')
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('Imported schema')
  await expect.poll(async () => {
    return await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]').length
    })
  }).toBe(1)
})

test('home page pg_dump import keeps partial and expression indexes in the imported PGML', async ({ goto, page }) => {
  await goto('/')

  const browserCard = page.locator('[data-source-card="browser-local-storage"]')

  await browserCard.getByRole('button', { name: 'Import into browser storage' }).click()

  const importDialog = getPgDumpImportDialog(page)

  await expect(importDialog).toContainText('Import pg_dump into browser storage')
  await importDialog.locator('textarea').fill(`CREATE TABLE public.users (
  id uuid NOT NULL,
  email text NOT NULL,
  deleted boolean
);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX idx_users_email_active ON public.users USING btree (email) WHERE (deleted = false);
CREATE UNIQUE INDEX idx_users_email_expression ON public.users USING btree (email, md5(lower(email))) WHERE (deleted = false);`)
  await page.getByRole('button', { name: 'Import into browser storage' }).click()
  await chooseImportedWorkspace(page, 'Open Diagram')

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('Index idx_users_email_active (email) [type: btree]')
  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('Indexes {')
  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain(
    '(email, md5(lower(email))) [name: idx_users_email_expression, type: btree]'
  )
})

test('home page pg_dump import auto-populates trigger-linked function owned_by attachments', async ({ goto, page }) => {
  await goto('/')

  const browserCard = page.locator('[data-source-card="browser-local-storage"]')

  await browserCard.getByRole('button', { name: 'Import into browser storage' }).click()

  const importDialog = getPgDumpImportDialog(page)

  await expect(importDialog).toContainText('Import pg_dump into browser storage')
  await importDialog.locator('textarea').fill(`CREATE TABLE public.users (
  id uuid NOT NULL
);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
CREATE FUNCTION public.touch_users() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_touch_users BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch_users();`)
  await page.getByRole('button', { name: 'Import into browser storage' }).click()
  await chooseImportedWorkspace(page, 'Open Diagram')

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain(`Function public.touch_users() returns trigger {
  affects {
    owned_by: [public.users]
  }`)
})

test('home page can import pasted DBML into the browser lane', async ({ goto, page }) => {
  await goto('/')

  const browserCard = page.locator('[data-source-card="browser-local-storage"]')

  await browserCard.getByRole('button', { name: 'Import DBML into browser storage' }).click()

  const importDialog = getDbmlImportDialog(page)

  await expect(importDialog).toContainText('Import DBML into browser storage')
  await importDialog.locator('textarea').fill(`Project commerce {
  database_type: 'PostgreSQL'
}

Table users {
  id uuid [pk]
  email text [unique]
}`)
  await page.getByRole('button', { name: 'Import into browser storage' }).click()
  await chooseImportedWorkspace(page, 'Open Diagram')

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('Table public.users')
  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).not.toContain('Project commerce')
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('commerce')
  await expect.poll(async () => {
    return await page.evaluate(() => {
      return JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]').length
    })
  }).toBe(1)
})

test('pg_dump modal keeps the top bar visible and the light theme root aligned while open', async ({ goto, page }) => {
  await goto('/')

  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.locator('[data-source-card="computer-saved-file"]').getByRole('button', { name: 'Import into a new file' }).click()

  await expect(page.locator('[data-studio-modal-surface="pg-dump-import"]')).toContainText('Import pg_dump into a new computer file')
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const header = document.querySelector('header')
      const overlay = document.querySelector('[data-slot="overlay"]')
      const content = document.querySelector('[data-slot="content"]')
      const headerRect = header?.getBoundingClientRect()

      return {
        contentZ: content ? window.getComputedStyle(content).zIndex : null,
        headerZ: header ? window.getComputedStyle(header).zIndex : null,
        htmlBackground: window.getComputedStyle(document.documentElement).backgroundColor,
        headerTop: headerRect ? Math.round(headerRect.top) : null,
        overlayZ: overlay ? window.getComputedStyle(overlay).zIndex : null,
        themeBackground: window.getComputedStyle(document.documentElement).getPropertyValue('--studio-shell-bg').trim()
      }
    })
  }).toEqual({
    contentZ: '60',
    headerZ: '50',
    headerTop: 0,
    htmlBackground: 'rgb(244, 241, 234)',
    overlayZ: '40',
    themeBackground: '#f4f1ea'
  })
})

test('studio header includes a Home link back to the source chooser', async ({ goto, page }) => {
  await goto('/')

  await page.locator('[data-source-card="browser-local-storage"]').getByRole('link', { name: 'Open bundled example' }).click()

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('TableGroup Core')
  await page.locator('[data-diagram-tool-toggle="versions"]').click()
  await expect(page.locator('[data-diagram-versions-panel="true"]')).toContainText('Locked')
  await expect(page.locator('[data-version-card="workspace"]')).toContainText('Programs implementation sync')
  await expect(page.locator('[data-diagram-versions-panel="true"]').locator('[data-version-card]')).toHaveCount(5)
  await page.getByRole('link', { name: 'Home' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('[data-source-card="browser-local-storage"]')).toBeVisible()
})

test('workspace menu switches between diagram and analysis without keeping the editor on analysis', async ({ goto, page }) => {
  await goto('/')

  await page.locator('[data-source-card="browser-local-storage"]').getByRole('link', { name: 'Open bundled example' }).click()

  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('TableGroup Core')
  await page.getByRole('button', { name: 'Workspace', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Analysis' }).click()

  await expect(page).toHaveURL(/\/analysis$/)
  await expect(page.locator('[data-analysis-workspace="true"]')).toBeVisible()
  await expect(page.locator('[data-analysis-tab="versions"]')).toBeVisible()
  await expect(page.locator('[data-editor-visibility-toggle="true"]')).toHaveCount(0)
  await expect(page.locator('[data-diagram-tool-toggle="versions"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Workspace', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Diagram' }).click()

  await expect(page).toHaveURL(/\/diagram$/)
  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('TableGroup Core')
})

test('workspace route switches keep saved comparison notes intact', async ({ goto, page }) => {
  await goto('/')

  await page.locator('[data-source-card="browser-local-storage"]').getByRole('link', { name: 'Open bundled example' }).click()
  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('TableGroup Core')

  await page.getByRole('button', { name: 'Workspace', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Analysis' }).click()

  await expect(page).toHaveURL(/\/analysis$/)
  await page.locator('[data-analysis-tab="compare"]').click()

  const comparePanel = page.locator('[data-diagram-compare-panel="true"]')
  const comparisonDialog = page.locator('[data-studio-modal-surface="compare-comparison"]')
  const compareNoteDialog = page.locator('[data-studio-modal-surface="compare-note"]')
  const compareEntries = comparePanel.locator('[data-compare-entry]')

  await expect(comparePanel).toBeVisible()
  await expect(compareEntries.first()).toBeVisible()

  const notedEntryId = await compareEntries.first().getAttribute('data-compare-entry')

  expect(notedEntryId).not.toBeNull()

  const notedEntry = comparePanel.locator(`[data-compare-entry="${notedEntryId}"]`)
  await comparePanel.locator('[data-compare-create-comparison="true"]').click()
  await expect(comparisonDialog).toBeVisible()
  await comparisonDialog.locator('[data-compare-comparison-name-input="true"]').fill('Route switch note coverage')
  await comparisonDialog.locator('[data-compare-comparison-save="true"]').click()
  await expect(comparisonDialog).toHaveCount(0)

  await notedEntry.click()
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(compareNoteDialog).toBeVisible()
  await compareNoteDialog.locator('[data-compare-note-input="true"]').fill('Keep this note after switching workspaces.')
  await compareNoteDialog.locator('[data-compare-note-save="true"]').click()
  await expect(compareNoteDialog).toHaveCount(0)
  await expect(comparePanel.locator('[data-compare-entry-detail="true"]')).toContainText('Keep this note after switching workspaces.')

  await page.getByRole('button', { name: 'Workspace', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Diagram' }).click()
  await expect(page).toHaveURL(/\/diagram$/)
  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('TableGroup Core')

  await page.getByRole('button', { name: 'Workspace', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Analysis' }).click()
  await expect(page).toHaveURL(/\/analysis$/)
  await page.locator('[data-analysis-tab="compare"]').click()
  await expect(comparePanel.locator('[data-compare-comparison-select="true"]')).toContainText('Route switch note coverage')

  await notedEntry.click()
  await expect(comparePanel.locator('[data-compare-entry-detail="true"]')).toContainText('Keep this note after switching workspaces.')
})

test('analysis refresh keeps saved comparison notes intact', async ({ goto, page }) => {
  await goto('/')

  await page.locator('[data-source-card="browser-local-storage"]').getByRole('link', { name: 'Open bundled example' }).click()
  await expect.poll(async () => readPgmlEditorValue(getPgmlEditor(page))).toContain('TableGroup Core')

  await page.getByRole('button', { name: 'Workspace', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Analysis' }).click()

  await expect(page).toHaveURL(/\/analysis$/)
  await page.locator('[data-analysis-tab="compare"]').click()

  const comparePanel = page.locator('[data-diagram-compare-panel="true"]')
  const comparisonDialog = page.locator('[data-studio-modal-surface="compare-comparison"]')
  const compareNoteDialog = page.locator('[data-studio-modal-surface="compare-note"]')
  const compareEntries = comparePanel.locator('[data-compare-entry]')

  await expect(comparePanel).toBeVisible()
  await expect(compareEntries.first()).toBeVisible()

  const notedEntryId = await compareEntries.first().getAttribute('data-compare-entry')

  expect(notedEntryId).not.toBeNull()

  const notedEntry = comparePanel.locator(`[data-compare-entry="${notedEntryId}"]`)
  await comparePanel.locator('[data-compare-create-comparison="true"]').click()
  await expect(comparisonDialog).toBeVisible()
  await comparisonDialog.locator('[data-compare-comparison-name-input="true"]').fill('Analysis refresh note coverage')
  await comparisonDialog.locator('[data-compare-comparison-save="true"]').click()
  await expect(comparisonDialog).toHaveCount(0)

  await notedEntry.click()
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(compareNoteDialog).toBeVisible()
  await compareNoteDialog.locator('[data-compare-note-input="true"]').fill('Keep this note after refreshing analysis.')
  await compareNoteDialog.locator('[data-compare-note-save="true"]').click()
  await expect(compareNoteDialog).toHaveCount(0)
  await expect(comparePanel.locator('[data-compare-entry-detail="true"]')).toContainText('Keep this note after refreshing analysis.')

  await page.reload()
  await expect(page).toHaveURL(/\/analysis$/)
  await page.locator('[data-analysis-tab="compare"]').click()
  await expect(comparePanel.locator('[data-compare-comparison-select="true"]')).toContainText('Analysis refresh note coverage')

  await notedEntry.click()
  await expect(comparePanel.locator('[data-compare-entry-detail="true"]')).toContainText('Keep this note after refreshing analysis.')
})

test('home page can open an imported browser schema directly in analysis', async ({ goto, page }) => {
  await goto('/')

  const browserCard = page.locator('[data-source-card="browser-local-storage"]')

  await browserCard.getByRole('button', { name: 'Import into browser storage' }).click()

  const importDialog = getPgDumpImportDialog(page)

  await expect(importDialog).toContainText('Import pg_dump into browser storage')
  await importDialog.locator('textarea').fill(`CREATE TABLE public.users (
  id uuid NOT NULL,
  email text NOT NULL
);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);`)
  await page.getByRole('button', { name: 'Import into browser storage' }).click()
  await chooseImportedWorkspace(page, 'Open Analysis')

  await expect(page).toHaveURL(/\/analysis\?/)
  await expect(page.locator('[data-analysis-workspace="true"]')).toBeVisible()
  await expect(page.locator('[data-editor-visibility-toggle="true"]')).toHaveCount(0)
  await expect(page.locator('[data-analysis-tab="versions"]')).toBeVisible()
  await expect(page.locator('[data-version-card="workspace"]')).toContainText('Current workspace')
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
  await page.locator('[data-source-card="computer-saved-file"]').getByRole('button', { name: 'Import into a new file' }).click()

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
  await chooseImportedWorkspace(page, 'Open Diagram')
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
  await page.locator('[data-source-card="computer-saved-file"]').getByRole('button', { name: 'Save example to a new file' }).click()
  await confirmComputerFileAccess(page, 'Continue to save dialog')

  const editor = getPgmlEditor(page)

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('TableGroup Core')
  await expect(page.locator('[data-studio-schema-name="true"]')).toHaveText('example-seeded-schema')

  const state = await readMockComputerFileState(page)

  expect(recentFileId ? state?.files[recentFileId]?.text : null).toContain('VersionSet "Example schema"')
  expect(recentFileId ? state?.files[recentFileId]?.text : null).toContain('Version v_programs {')
  expect(recentFileId ? state?.files[recentFileId]?.text : null).toContain('Composite address_record')
})

test('home page shows an error when both pasted text and a pg_dump file are provided', async ({ goto, page }) => {
  await goto('/')

  await page.locator('[data-source-card="browser-local-storage"]').getByRole('button', { name: 'Import into browser storage' }).click()

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
  await expect(heroQuickStart).toContainText('VersionSet "Commerce schema"')
  await expect(heroQuickStart).toContainText('Version v2')
  await expect(heroQuickStart).toContainText('TableGroup Commerce')
  await expect(heroQuickStart).toContainText('Table public.orders')
  await expect(heroQuickStart).toContainText('Function register_entity(entity_kind text) returns trigger [replace]')
  await expect(heroQuickStart).toContainText('active_view: view_schema')
  await expect(heroQuickStart).toContainText('View "Schema focus"')
  await expect(heroQuickStart).not.toContainText('Properties "group:Commerce"')

  await expect(page.getByRole('heading', { name: 'Use PGML when the schema is part structure, part behavior, and part documentation.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'PGML is intentionally close to DBML, then opinionated where Postgres needs more surface area.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The language is block-based, readable, and meant to be learned from examples.' })).toBeVisible()
})

test('spec page keeps the table of contents pinned while scrolling', async ({ goto, page }) => {
  await goto('/spec')

  const tableOfContents = page.locator('aside')
  const firstDocumentationSection = page.locator('#reasons')

  await expect(tableOfContents).toBeVisible()
  await expect(firstDocumentationSection).toBeVisible()

  await firstDocumentationSection.scrollIntoViewIfNeeded()

  await expect.poll(async () => {
    const box = await tableOfContents.boundingBox()
    return box ? Math.round(box.y) : null
  }).toBeGreaterThanOrEqual(72)
})
