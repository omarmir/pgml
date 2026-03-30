import { readFileSync } from 'node:fs'

import type { Page } from '@playwright/test'
import { expect, test } from '@nuxt/test-utils/playwright'
import { getPgmlEditor, readPgmlEditorValue, setPgmlEditorValue } from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

const getVersionsPanel = (page: Page) => {
  return page.locator('[data-diagram-versions-panel="true"]')
}

const getComparePanel = (page: Page) => {
  return page.locator('[data-diagram-compare-panel="true"]')
}

const openVersionsPanel = async (page: Page) => {
  await page.locator('[data-diagram-panel-tab="versions"]').click()
  await expect(getVersionsPanel(page)).toBeVisible()
}

const getVersionCardByLabel = (
  page: Page,
  label: string
) => {
  return getVersionsPanel(page)
    .locator('[data-version-card]:not([data-version-card="workspace"])')
    .filter({ hasText: label })
    .first()
}

const createCheckpoint = async (
  page: Page,
  name: string
) => {
  await openVersionsPanel(page)
  await page.locator('[data-version-create-checkpoint="true"]').click()

  const checkpointDialog = page.locator('[data-studio-modal-surface="checkpoint"]')

  await expect(checkpointDialog).toBeVisible()
  await checkpointDialog.getByPlaceholder('Checkpoint name').fill(name)
  await checkpointDialog.getByRole('button', { name: 'Create design checkpoint' }).click()
  await expect(checkpointDialog).toHaveCount(0)
  await expect(getVersionCardByLabel(page, name)).toBeVisible()
}

const compareFromVersion = async (
  page: Page,
  versionLabel: string
) => {
  await openVersionsPanel(page)
  await getVersionCardByLabel(page, versionLabel).locator('[data-version-compare]').click()
}

const openComparator = async (page: Page) => {
  await openVersionsPanel(page)
  await page.locator('[data-version-open-comparator="true"]').click()
  await expect(getComparePanel(page)).toBeVisible()
}
const selectDocumentScope = async (
  page: Page,
  label: string
) => {
  await page.locator('[data-document-scope-select="true"]').click()
  await page.getByText(label, { exact: true }).click()
}

const expectEditorValueToContain = async (
  editor: ReturnType<typeof getPgmlEditor>,
  text: string
) => {
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain(text)
}

const expectEditorValueNotToContain = async (
  editor: ReturnType<typeof getPgmlEditor>,
  text: string
) => {
  await expect.poll(async () => readPgmlEditorValue(editor)).not.toContain(text)
}

const viewVersion = async (
  page: Page,
  versionLabel: string
) => {
  await openVersionsPanel(page)
  await getVersionCardByLabel(page, versionLabel).locator('[data-version-view]').click()
  await expect(getVersionCardByLabel(page, versionLabel)).toContainText('Previewing now')
}

const clickDiagramRow = async (
  page: Page,
  input: {
    rowKey: string
    tableId: string
  }
) => {
  const viewport = page.locator('[data-diagram-viewport="true"]')
  const viewportBox = await viewport.boundingBox()

  expect(viewportBox).not.toBeNull()

  const point = await page.evaluate((selection) => {
    const sceneDebug = (window as Window & {
      __pgmlSceneDebug?: {
        tableCards: Array<{
          headerHeight: number
          height: number
          id: string
          rows: Array<{
            attachmentId?: string
            columnName?: string
            key: string
            kind: 'attachment' | 'column'
          }>
          width: number
          x: number
          y: number
        }>
      }
      __pgmlSceneRendererDebug?: {
        panX: number
        panY: number
        scale: number
      }
    }).__pgmlSceneDebug
    const rendererDebug = (window as Window & {
      __pgmlSceneRendererDebug?: {
        panX: number
        panY: number
        scale: number
      }
    }).__pgmlSceneRendererDebug
    const table = sceneDebug?.tableCards.find(entry => entry.id === selection.tableId)

    if (!table || !rendererDebug) {
      return null
    }

    const rowIndex = table.rows.findIndex(row => row.key === selection.rowKey)

    if (rowIndex < 0) {
      return null
    }

    return {
      x: rendererDebug.panX + (table.x + table.width / 2) * rendererDebug.scale,
      y: rendererDebug.panY + (table.y + table.headerHeight + rowIndex * 31 + 15.5) * rendererDebug.scale
    }
  }, input)

  expect(point).not.toBeNull()

  await viewport.click({
    position: {
      x: point!.x,
      y: point!.y
    }
  })
}

test('versions panel generates history-aware SQL and Kysely migrations across checkpoint lineage', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}`)
  await expectEditorValueToContain(editor, 'Table public.users')

  await createCheckpoint(page, 'Initial users')

  await setPgmlEditorValue(editor, `Enum public.order_status {
  draft
  paid
}

Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [not null]
  status public.order_status
}

Ref: public.orders.user_id > public.users.id`)
  await expectEditorValueToContain(editor, 'Table public.orders')

  await createCheckpoint(page, 'Orders baseline')

  await setPgmlEditorValue(editor, `Enum public.order_status {
  draft
  submitted
  paid
}

Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [not null]
  status public.order_status [default: 'submitted']
}

Ref: public.orders.user_id > public.users.id

Function public.touch_orders() returns trigger {
  source: $sql$
    CREATE OR REPLACE FUNCTION public.touch_orders()
    RETURNS trigger AS $$
    BEGIN
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}

Trigger trg_touch_orders on public.orders {
  source: $sql$
    CREATE TRIGGER trg_touch_orders
      BEFORE UPDATE ON public.orders
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_orders();
  $sql$
}`)
  await expectEditorValueToContain(editor, 'Trigger trg_touch_orders on public.orders')

  await compareFromVersion(page, 'Initial users')

  const versionsPanel = getVersionsPanel(page)
  const migrationArtifact = page.locator('[data-version-migration-artifact="true"]')

  await expect(migrationArtifact).toHaveAttribute('data-version-migration-format-active', 'sql')
  await expect(migrationArtifact).toContainText('-- Step 1: Initial users -> Orders baseline')
  await expect(migrationArtifact).toContainText('-- Step 2: Orders baseline -> Current workspace')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."orders"')
  await expect(migrationArtifact).toContainText('ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");')
  await expect(migrationArtifact).toContainText(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)
  await expect(migrationArtifact).toContainText(`ALTER TABLE "public"."orders" ALTER COLUMN "status" SET DEFAULT 'submitted';`)
  await expect(migrationArtifact).toContainText('CREATE OR REPLACE FUNCTION public.touch_orders()')
  await expect(migrationArtifact).toContainText('CREATE TRIGGER trg_touch_orders')

  const sqlDownloadPromise = page.waitForEvent('download')

  await versionsPanel.locator('[data-version-migration-download="sql"]').click()

  const sqlDownload = await sqlDownloadPromise
  const sqlDownloadPath = await sqlDownload.path()

  expect(sqlDownload.suggestedFilename()).toContain('.migration.sql')
  expect(readFileSync(sqlDownloadPath!, 'utf8')).toContain('-- Step 2: Orders baseline -> Current workspace')

  await versionsPanel.locator('[data-version-migration-format="kysely"]').click()
  await expect(migrationArtifact).toHaveAttribute('data-version-migration-format-active', 'kysely')
  await expect(migrationArtifact).toContainText('// Step 1: Initial users -> Orders baseline')
  await expect(migrationArtifact).toContainText('// Step 2: Orders baseline -> Current workspace')
  await expect(migrationArtifact).toContainText('await sql`')
  await expect(migrationArtifact).toContainText('CREATE OR REPLACE FUNCTION public.touch_orders()')

  const kyselyDownloadPromise = page.waitForEvent('download')

  await versionsPanel.locator('[data-version-migration-download="kysely"]').click()

  const kyselyDownload = await kyselyDownloadPromise
  const kyselyDownloadPath = await kyselyDownload.path()

  expect(kyselyDownload.suggestedFilename()).toContain('.migration.ts')
  expect(readFileSync(kyselyDownloadPath!, 'utf8')).toContain('// Step 2: Orders baseline -> Current workspace')
})

test('versions panel keeps warning-only history steps visible in SQL and Kysely previews', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Enum public.order_status {
  draft
  paid
  archived
}`)
  await createCheckpoint(page, 'Full status')

  await setPgmlEditorValue(editor, `Enum public.order_status {
  draft
  paid
}`)
  await createCheckpoint(page, 'Trim status')

  await setPgmlEditorValue(editor, `Enum public.order_status {
  draft
  paid
}

Table public.audit_log {
  id uuid [pk]
}`)
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.audit_log')

  await compareFromVersion(page, 'Full status')

  const versionsPanel = getVersionsPanel(page)
  const migrationArtifact = page.locator('[data-version-migration-artifact="true"]')
  const warningsPanel = page.locator('[data-version-migration-warnings="true"]')

  await expect(migrationArtifact).toContainText('-- Step 1: Full status -> Trim status')
  await expect(migrationArtifact).toContainText('-- No automatic SQL statements were generated for this step. Review warnings.')
  await expect(migrationArtifact).toContainText('-- Warning: Enum public.order_status changed in a way that cannot be migrated safely')
  await expect(migrationArtifact).toContainText('-- Step 2: Trim status -> Current workspace')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."audit_log"')
  await expect(warningsPanel).toContainText('Enum public.order_status changed in a way that cannot be migrated safely')

  await versionsPanel.locator('[data-version-migration-format="kysely"]').click()

  await expect(migrationArtifact).toHaveAttribute('data-version-migration-format-active', 'kysely')
  await expect(migrationArtifact).toContainText('// Step 1: Full status -> Trim status')
  await expect(migrationArtifact).toContainText('// No automatic SQL statements were generated for this step. Review warnings.')
  await expect(migrationArtifact).toContainText('// Warning: Enum public.order_status changed in a way that cannot be migrated safely')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."audit_log"')
})

test('visual comparator highlights changed rows on the diagram and inspects them in the compare panel', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
  email text
}`)
  await createCheckpoint(page, 'Users baseline')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
  email varchar [not null]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [not null]
}

Ref: public.orders.user_id > public.users.id`)
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.orders')

  await compareFromVersion(page, 'Users baseline')
  await openComparator(page)
  await clickDiagramRow(page, {
    rowKey: 'public.users.email',
    tableId: 'public.users'
  })

  const comparePanel = getComparePanel(page)
  const detail = comparePanel.locator('[data-compare-entry-detail="true"]')

  await expect(comparePanel.locator('[data-compare-context-entry]').filter({ hasText: 'public.users.email' })).toBeVisible()
  await expect(detail).toContainText('public.users.email')
  await expect(detail).toContainText('Before snapshot')
  await expect(detail).toContainText('"type": "text"')
  await expect(detail).toContainText('"type": "varchar"')
  await expect(detail).toContainText('modifiers')
})

test('importing a pg_dump onto a selected base version replaces the workspace and generates direct history-aware migrations from that base', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Users baseline')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.teams {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Users and teams')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.scratch_entries {
  id uuid [pk]
}`)
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.scratch_entries')

  await openVersionsPanel(page)
  await page.locator('[data-version-import-dump="true"]').click()

  const importDialog = page.locator('[data-studio-modal-surface="pg-dump-import"]')

  await expect(importDialog).toBeVisible()
  await importDialog.getByLabel('Increment from version').click()
  await page.getByRole('option', { name: /Users baseline/i }).click()
  await importDialog.locator('textarea').fill(`CREATE TABLE public.users (
  id uuid NOT NULL
);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
CREATE TABLE public.orders (
  id uuid NOT NULL,
  user_id uuid NOT NULL
);
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);`)
  await importDialog.getByRole('button', { name: 'Replace workspace with import' }).click()
  await expect(importDialog).toHaveCount(0)

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.orders')

  const importedSource = await readPgmlEditorValue(editor)

  expect(importedSource).toContain('Table public.users')
  expect(importedSource).toContain('Table public.orders')
  expect(importedSource).not.toContain('Table public.scratch_entries')

  await compareFromVersion(page, 'Users baseline')

  const migrationArtifact = page.locator('[data-version-migration-artifact="true"]')

  await expect(migrationArtifact).toContainText('-- Step 1: Users baseline -> Current workspace')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."orders"')
  await expect(migrationArtifact).toContainText('ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");')
  await expect(migrationArtifact).not.toContainText('Users and teams')
  await expect(migrationArtifact).not.toContainText('DROP TABLE IF EXISTS "public"."teams";')
})

test('versions panel can preview and restore an older checkpoint without losing later history', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Users only')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.teams {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Users and teams')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.teams {
  id uuid [pk]
}

Table public.memberships {
  id uuid [pk]
  user_id uuid [not null]
  team_id uuid [not null]
}

Ref: public.memberships.user_id > public.users.id
Ref: public.memberships.team_id > public.teams.id`)
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.memberships')

  await viewVersion(page, 'Users only')
  await expect(getVersionsPanel(page)).toContainText('Preview target: Users only.')

  const usersOnlyCard = getVersionCardByLabel(page, 'Users only')

  await usersOnlyCard.locator('[data-version-restore]').click()

  const restoreDialog = page.locator('[data-studio-modal-surface="restore-version"]')

  await expect(restoreDialog).toBeVisible()
  await restoreDialog.getByRole('button', { name: 'Restore version' }).click()
  await expect(restoreDialog).toHaveCount(0)
  await expect.poll(async () => readPgmlEditorValue(editor)).not.toContain('Table public.memberships')
  await expect.poll(async () => readPgmlEditorValue(editor)).not.toContain('Table public.teams')

  await openVersionsPanel(page)
  await expect(page.locator('[data-version-card="workspace"]')).toContainText('Incrementing from Users only.')
  await expect(getVersionCardByLabel(page, 'Users and teams')).toBeVisible()

  await compareFromVersion(page, 'Users only')

  await expect(getVersionsPanel(page)).toContainText('No visible delta in the selected comparison.')
  await expect(getVersionsPanel(page)).toContainText('No schema or layout changes are visible for the selected compare pair.')
})

test('versioned document mode can scope the editor to the full document, workspace block, or a selected version block', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Scope baseline')

  await page.getByRole('button', { name: 'Versioned document' }).click()
  await expect(page.locator('[data-document-scope-select="true"]')).toBeVisible()
  await expectEditorValueToContain(editor, 'VersionSet ')

  await selectDocumentScope(page, 'Workspace block')
  await expectEditorValueToContain(editor, 'Workspace {')
  await expectEditorValueNotToContain(editor, 'VersionSet ')

  await selectDocumentScope(page, 'Design · Scope baseline')
  await expectEditorValueToContain(editor, 'name: "Scope baseline"')
  await expectEditorValueToContain(editor, 'Version v_')
  await expectEditorValueNotToContain(editor, 'Workspace {')

  await selectDocumentScope(page, 'All VersionSet blocks')
  await expectEditorValueToContain(editor, 'VersionSet ')
  await expectEditorValueToContain(editor, 'Workspace {')
})
