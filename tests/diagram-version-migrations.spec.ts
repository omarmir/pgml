import { readFileSync } from 'node:fs'

import type { Page } from '@playwright/test'
import { expect, test } from '@nuxt/test-utils/playwright'
import JSZip from 'jszip'
import { getPgmlEditor, readPgmlEditorValue, setPgmlEditorValue } from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

const getVersionsPanel = (page: Page) => {
  return page.locator('[data-diagram-versions-panel="true"]')
}

const getVersionsOverview = (page: Page) => {
  return getVersionsPanel(page).locator('[data-version-overview="true"]')
}

const getComparePanel = (page: Page) => {
  return page.locator('[data-diagram-compare-panel="true"]')
}

const getMigrationsPanel = (page: Page) => {
  return page.locator('[data-diagram-migrations-panel="true"]')
}

const getHistoryToolsPanel = (page: Page) => {
  return page.locator('[data-diagram-tool-panel="true"]')
}

const getMigrationArtifact = (page: Page) => {
  return getMigrationsPanel(page).locator('[data-version-migration-artifact="true"]')
}

const getMigrationScopeButton = (
  page: Page,
  scope: 'combined' | `step:${number}`
) => {
  return getMigrationsPanel(page).locator(`[data-version-migration-scope="${scope}"]`)
}

const getDocumentScopeSelect = (page: Page) => {
  return page.locator('[data-document-scope-select="true"]')
}

const openVersionsPanel = async (page: Page) => {
  const historyToolsPanel = getHistoryToolsPanel(page)

  if (await historyToolsPanel.isVisible()) {
    if ((await historyToolsPanel.getAttribute('data-diagram-tool-panel-mode')) !== 'versions') {
      await historyToolsPanel.locator('[data-diagram-tool-panel-tab="versions"]').click()
    }
  } else {
    await page.locator('[data-diagram-tool-toggle="versions"]').click()
  }

  await expect(historyToolsPanel).toBeVisible()
  await expect(historyToolsPanel).toHaveAttribute('data-diagram-tool-panel-mode', 'versions')
  await expect(getVersionsPanel(page)).toBeVisible()
}

const openMigrationsPanel = async (page: Page) => {
  const historyToolsPanel = getHistoryToolsPanel(page)

  if (await historyToolsPanel.isVisible()) {
    if ((await historyToolsPanel.getAttribute('data-diagram-tool-panel-mode')) !== 'migrations') {
      await historyToolsPanel.locator('[data-diagram-tool-panel-tab="migrations"]').click()
    }
  } else {
    await page.locator('[data-diagram-tool-toggle="migrations"]').click()
  }

  await expect(historyToolsPanel).toBeVisible()
  await expect(historyToolsPanel).toHaveAttribute('data-diagram-tool-panel-mode', 'migrations')
  await expect(getMigrationsPanel(page)).toBeVisible()
}

const selectMigrationScope = async (
  page: Page,
  scope: 'combined' | `step:${number}`
) => {
  // The versions panel exposes one selectable file card per history step.
  // Routing scope changes through one helper keeps those browser interactions
  // aligned with the current data-version-migration-scope contract.
  await getMigrationScopeButton(page, scope).click()
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

const clickVersionCardAction = async (
  page: Page,
  versionLabel: string,
  selector: string
) => {
  await getVersionCardByLabel(page, versionLabel).locator(selector).click()
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
  await openComparator(page)
  await getComparePanel(page).locator('[data-compare-base-select="true"]').click()
  await page.getByRole('option', { name: versionLabel }).click()
  await getComparePanel(page).locator('[data-compare-target-select="true"]').click()
  await page.getByRole('option', { name: 'Current workspace' }).click()
}

const openComparator = async (page: Page) => {
  const historyToolsPanel = getHistoryToolsPanel(page)

  if (await historyToolsPanel.isVisible()) {
    if ((await historyToolsPanel.getAttribute('data-diagram-tool-panel-mode')) !== 'compare') {
      await historyToolsPanel.locator('[data-diagram-tool-panel-tab="compare"]').click()
    }
  } else {
    await page.locator('[data-diagram-tool-toggle="compare"]').click()
  }

  await expect(historyToolsPanel).toBeVisible()
  await expect(historyToolsPanel).toHaveAttribute('data-diagram-tool-panel-mode', 'compare')
  await expect(getComparePanel(page)).toBeVisible()
}

const downloadMigrationArtifacts = async (
  page: Page,
  format: 'sql' | 'kysely',
  expectedCount = 1
) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    getMigrationsPanel(page).locator(`[data-version-migration-download="${format}"]`).click()
  ])
  const downloadPath = await download.path()

  expect(downloadPath).not.toBeNull()

  if (download.suggestedFilename().endsWith('.zip')) {
    const archive = await JSZip.loadAsync(readFileSync(downloadPath!))
    const archiveEntries = await Promise.all(
      Object.values(archive.files)
        .filter(entry => !entry.dir)
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async (entry) => {
          return {
            content: await entry.async('string'),
            fileName: entry.name
          }
        })
    )

    expect(archiveEntries).toHaveLength(expectedCount)

    return {
      archiveFileName: download.suggestedFilename(),
      files: archiveEntries
    }
  }

  const files = [{
    content: readFileSync(downloadPath!, 'utf8'),
    fileName: download.suggestedFilename()
  }]

  expect(files).toHaveLength(expectedCount)

  return {
    archiveFileName: null,
    files
  }
}

const downloadMigrationArtifact = async (
  page: Page,
  format: 'sql' | 'kysely'
) => {
  const download = await downloadMigrationArtifacts(page, format, 1)

  return download.files[0]!
}
const selectDocumentScope = async (
  page: Page,
  label: string
) => {
  await getDocumentScopeSelect(page).click()
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
  await clickVersionCardAction(page, versionLabel, '[data-version-view]')
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

  await openMigrationsPanel(page)

  const migrationsPanel = getMigrationsPanel(page)
  const migrationArtifact = getMigrationArtifact(page)

  await expect(migrationArtifact).toHaveAttribute('data-version-migration-format-active', 'sql')
  await expect(migrationArtifact).toContainText('-- Step 1: Initial users -> Orders baseline')
  await expect(migrationArtifact).toContainText('-- Step 2: Orders baseline -> Current workspace')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."orders"')
  await expect(migrationArtifact).toContainText('ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");')
  await expect(migrationArtifact).toContainText(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)
  await expect(migrationArtifact).toContainText(`ALTER TABLE "public"."orders" ALTER COLUMN "status" SET DEFAULT 'submitted';`)
  await expect(migrationArtifact).toContainText('CREATE OR REPLACE FUNCTION public.touch_orders()')
  await expect(migrationArtifact).toContainText('CREATE TRIGGER trg_touch_orders')

  const sqlDownloads = await downloadMigrationArtifacts(page, 'sql', 2)

  expect(sqlDownloads.archiveFileName).toContain('initial-users-to-workspace')
  expect(sqlDownloads.archiveFileName).toMatch(/\.migration\.sql\.zip$/)
  expect(sqlDownloads.files[0]!.fileName).toMatch(/^001-/)
  expect(sqlDownloads.files[0]!.content).toContain('CREATE TABLE "public"."orders"')
  expect(sqlDownloads.files[0]!.content).toContain('ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");')
  expect(sqlDownloads.files[0]!.content).not.toContain(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)
  expect(sqlDownloads.files[1]!.fileName).toMatch(/^002-/)
  expect(sqlDownloads.files[1]!.content).toContain(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)
  expect(sqlDownloads.files[1]!.content).toContain('CREATE TRIGGER trg_touch_orders')
  expect(sqlDownloads.files[1]!.content).not.toContain('CREATE TABLE "public"."orders"')

  await selectMigrationScope(page, 'step:0')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."orders"')
  await expect(migrationArtifact).toContainText('ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");')
  await expect(migrationArtifact).not.toContainText(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)
  await expect(migrationArtifact).not.toContainText('CREATE TRIGGER trg_touch_orders')

  const stepOneSqlDownload = await downloadMigrationArtifact(page, 'sql')

  expect(stepOneSqlDownload.fileName).toMatch(/^001-/)
  expect(stepOneSqlDownload.content).toContain('CREATE TABLE "public"."orders"')
  expect(stepOneSqlDownload.content).not.toContain(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)

  await migrationsPanel.locator('[data-version-migration-format="kysely"]').click()
  await expect(migrationArtifact).toHaveAttribute('data-version-migration-format-active', 'kysely')
  await expect(migrationArtifact).toContainText('await sql`')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."orders"')
  await expect(migrationArtifact).not.toContainText('CREATE OR REPLACE FUNCTION public.touch_orders()')

  await selectMigrationScope(page, 'step:1')
  await expect(migrationArtifact).toContainText(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)
  await expect(migrationArtifact).toContainText('CREATE OR REPLACE FUNCTION public.touch_orders()')
  await expect(migrationArtifact).toContainText('CREATE TRIGGER trg_touch_orders')
  await expect(migrationArtifact).not.toContainText('CREATE TABLE "public"."orders"')

  const kyselyDownload = await downloadMigrationArtifact(page, 'kysely')

  expect(kyselyDownload.fileName).toMatch(/^002-/)
  expect(kyselyDownload.content).toContain(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)
  expect(kyselyDownload.content).toContain('CREATE OR REPLACE FUNCTION public.touch_orders()')
  expect(kyselyDownload.content).not.toContain('CREATE TABLE "public"."orders"')

  await selectMigrationScope(page, 'combined')

  const kyselyDownloads = await downloadMigrationArtifacts(page, 'kysely', 2)

  expect(kyselyDownloads.archiveFileName).toContain('initial-users-to-workspace')
  expect(kyselyDownloads.archiveFileName).toMatch(/\.migration\.ts\.zip$/)
  expect(kyselyDownloads.files[0]!.fileName).toMatch(/^001-/)
  expect(kyselyDownloads.files[0]!.content).toContain('CREATE TABLE "public"."orders"')
  expect(kyselyDownloads.files[0]!.content).not.toContain(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)
  expect(kyselyDownloads.files[1]!.fileName).toMatch(/^002-/)
  expect(kyselyDownloads.files[1]!.content).toContain(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)
  expect(kyselyDownloads.files[1]!.content).toContain('CREATE TRIGGER trg_touch_orders')
})

test('compare panel can compare two locked versions without forcing the workspace as the target', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Initial users')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [not null]
}

Ref: public.orders.user_id > public.users.id`)
  await createCheckpoint(page, 'Orders baseline')

  await openComparator(page)
  await getComparePanel(page).locator('[data-compare-base-select="true"]').click()
  await page.getByRole('option', { name: 'Initial users' }).click()
  await getComparePanel(page).locator('[data-compare-target-select="true"]').click()
  await page.getByRole('option', { name: 'Orders baseline' }).click()

  const comparePanel = getComparePanel(page)

  await expect(comparePanel).toContainText('Initial users')
  await expect(comparePanel).toContainText('Orders baseline')
  await expect(comparePanel).toContainText('increments directly from')
  await expect(comparePanel).not.toContainText('Current workspace')

  await openMigrationsPanel(page)
  await expect(getMigrationArtifact(page)).toContainText('-- Step 1: Initial users -> Orders baseline')
  await expect(getMigrationArtifact(page)).not.toContainText('Current workspace')
})

test('compare panel lets you switch the compare base and target directly', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Initial users')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [not null]
}

Ref: public.orders.user_id > public.users.id`)
  await createCheckpoint(page, 'Orders baseline')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [not null]
}

Table public.audit_log {
  id uuid [pk]
}

Ref: public.orders.user_id > public.users.id`)

  await openComparator(page)

  await getComparePanel(page).locator('[data-compare-base-select="true"]').click()
  await page.getByRole('option', { name: 'Initial users' }).click()
  await getComparePanel(page).locator('[data-compare-target-select="true"]').click()
  await page.getByRole('option', { name: 'Orders baseline' }).click()

  const comparePanel = getComparePanel(page)

  await expect(comparePanel).toContainText('Initial users')
  await expect(comparePanel).toContainText('Orders baseline')
  await expect(comparePanel).toContainText('increments directly from')
  await expect(comparePanel).not.toContainText('Current workspace')
  await expect(comparePanel.locator('[data-compare-entry="table:public.orders"]')).toBeVisible()
  await expect(comparePanel.locator('[data-compare-entry]').filter({ hasText: 'public.audit_log' })).toHaveCount(0)
})

test('versions overview controls render inline instead of as a sticky floating card', async ({ goto, page }) => {
  await goto('/diagram')
  await openVersionsPanel(page)

  const overview = getVersionsOverview(page)

  await expect(overview).toBeVisible()
  await expect(overview.locator('[data-version-create-checkpoint="true"]')).toBeVisible()
  await expect(overview.locator('[data-version-import-dbml="true"]')).toBeVisible()
  await expect(overview.locator('[data-version-import-dump="true"]')).toBeVisible()
  await expect(overview).toContainText('Choose which locked snapshot the diagram and raw PGML preview should show.')
  await expect.poll(async () => {
    return overview.evaluate(element => getComputedStyle(element).position)
  }).toBe('static')
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

  await openMigrationsPanel(page)

  const migrationsPanel = getMigrationsPanel(page)
  const migrationArtifact = getMigrationArtifact(page)
  const warningsPanel = page.locator('[data-version-migration-warnings="true"]')

  await expect(migrationArtifact).toContainText('-- Step 1: Full status -> Trim status')
  await expect(migrationArtifact).toContainText('-- No automatic SQL statements were generated for this step. Review warnings.')
  await expect(migrationArtifact).toContainText('-- Warning: Enum public.order_status changed in a way that cannot be migrated safely')
  await expect(migrationArtifact).toContainText('-- Step 2: Trim status -> Current workspace')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."audit_log"')
  await expect(warningsPanel).toContainText('Enum public.order_status changed in a way that cannot be migrated safely')

  await selectMigrationScope(page, 'step:0')
  await expect(migrationArtifact).not.toContainText('CREATE TABLE "public"."audit_log"')
  await expect(warningsPanel).toContainText('Enum public.order_status changed in a way that cannot be migrated safely')

  await selectMigrationScope(page, 'step:1')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."audit_log"')
  await expect(warningsPanel).toHaveCount(0)

  await migrationsPanel.locator('[data-version-migration-format="kysely"]').click()

  await expect(migrationArtifact).toHaveAttribute('data-version-migration-format-active', 'kysely')
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

  await openMigrationsPanel(page)

  const migrationArtifact = getMigrationArtifact(page)

  await expect(migrationArtifact).toContainText('-- Step 1: Users baseline -> Current workspace')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."orders"')
  await expect(migrationArtifact).toContainText('ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");')
  await expect(migrationArtifact).not.toContainText('Users and teams')
  await expect(migrationArtifact).not.toContainText('DROP TABLE IF EXISTS "public"."teams";')
})

test('importing DBML onto a selected base version replaces the workspace and generates direct history-aware migrations from that base', async ({ goto, page }) => {
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
  await page.locator('[data-version-import-dbml="true"]').click()

  const importDialog = page.locator('[data-studio-modal-surface="dbml-import"]')

  await expect(importDialog).toBeVisible()
  await importDialog.getByLabel('Increment from version').click()
  await page.getByRole('option', { name: /Users baseline/i }).click()
  await importDialog.locator('textarea').fill(`Project commerce {
  database_type: "PostgreSQL"
}

Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [not null]
}

Ref: public.orders.user_id > public.users.id`)
  await importDialog.getByRole('button', { name: 'Replace workspace with import' }).click()
  await expect(importDialog).toHaveCount(0)

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.orders')

  const importedSource = await readPgmlEditorValue(editor)

  expect(importedSource).toContain('Table public.users')
  expect(importedSource).toContain('Table public.orders')
  expect(importedSource).not.toContain('Table public.scratch_entries')
  expect(importedSource).not.toContain('Project commerce')

  await compareFromVersion(page, 'Users baseline')

  await openMigrationsPanel(page)

  const migrationArtifact = getMigrationArtifact(page)

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

  await clickVersionCardAction(page, 'Users only', '[data-version-restore]')

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
  await expect(getDocumentScopeSelect(page)).toBeVisible()
  await expectEditorValueToContain(editor, 'VersionSet ')
  await expect(page.locator('[data-pgml-diagnostics="true"]')).toHaveCount(0)

  await selectDocumentScope(page, 'Workspace block')
  await expectEditorValueToContain(editor, 'Workspace {')
  await expectEditorValueNotToContain(editor, 'VersionSet ')
  await expect(page.locator('[data-pgml-diagnostics="true"]')).toHaveCount(0)

  await selectDocumentScope(page, 'Design · Scope baseline')
  await expectEditorValueToContain(editor, 'name: "Scope baseline"')
  await expectEditorValueToContain(editor, 'Version v_')
  await expectEditorValueNotToContain(editor, 'Workspace {')
  await expect(page.locator('[data-pgml-diagnostics="true"]')).toHaveCount(0)

  await selectDocumentScope(page, 'All VersionSet blocks')
  await expectEditorValueToContain(editor, 'VersionSet ')
  await expectEditorValueToContain(editor, 'Workspace {')
  await expect(page.locator('[data-pgml-diagnostics="true"]')).toHaveCount(0)
})
