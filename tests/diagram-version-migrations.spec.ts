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

const expectComparePanelWithinContainer = async (page: Page) => {
  const comparePanel = getComparePanel(page)

  await expect.poll(async () => {
    return comparePanel.evaluate((element) => {
      const toolPanel = element.closest('[data-diagram-tool-panel="true"]')
      const scrollRegion = element.querySelector('[data-studio-scrollable="true"]')

      if (!(toolPanel instanceof HTMLElement) || !(scrollRegion instanceof HTMLElement)) {
        return false
      }

      const compareRect = element.getBoundingClientRect()
      const toolRect = toolPanel.getBoundingClientRect()
      const scrollRect = scrollRegion.getBoundingClientRect()

      return scrollRegion.scrollWidth - scrollRegion.clientWidth <= 1
        && compareRect.bottom <= toolRect.bottom + 1
        && compareRect.right <= toolRect.right + 1
        && scrollRect.bottom <= compareRect.bottom + 1
        && scrollRegion.clientHeight < scrollRegion.scrollHeight
    })
  }).toBe(true)
}

const getMigrationsPanel = (page: Page) => {
  return page.locator('[data-diagram-migrations-panel="true"]')
}

const getHistoryToolsPanel = (page: Page) => {
  return page.locator('[data-diagram-tool-panel="true"]')
}

const expectHistoryToolsHeaderActionsWithinPanel = async (page: Page) => {
  const historyToolsPanel = getHistoryToolsPanel(page)

  await expect.poll(async () => {
    return historyToolsPanel.evaluate((element) => {
      const actions = element.querySelector('[data-diagram-tool-panel-actions="true"]')

      if (!(element instanceof HTMLElement) || !(actions instanceof HTMLElement)) {
        return false
      }

      const panelRect = element.getBoundingClientRect()
      const actionsRect = actions.getBoundingClientRect()

      return actionsRect.right <= panelRect.right - 10
        && actionsRect.left >= panelRect.left + 10
        && actionsRect.top >= panelRect.top
        && actionsRect.bottom <= panelRect.bottom
    })
  }).toBe(true)
}

const expectHistoryToolsPanelToFillViewport = async (page: Page) => {
  const historyToolsPanel = getHistoryToolsPanel(page)

  await expect.poll(async () => {
    return historyToolsPanel.evaluate((element) => {
      const viewport = element.closest('[data-diagram-viewport="true"]')

      if (!(element instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
        return false
      }

      const panelRect = element.getBoundingClientRect()
      const viewportRect = viewport.getBoundingClientRect()

      return Math.abs(panelRect.left - viewportRect.left) <= 1
        && Math.abs(panelRect.top - viewportRect.top) <= 1
        && Math.abs(panelRect.right - viewportRect.right) <= 1
        && Math.abs(panelRect.bottom - viewportRect.bottom) <= 1
    })
  }).toBe(true)
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

test('compare panel ignores equivalent sequence defaults that only differ by regclass syntax or modifier order', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.agency_cost_category_line_item {
  id bigint [pk, not null, default: nextval('public.agency_cost_category_line_item_id_seq')]
}`)
  await createCheckpoint(page, 'Equivalent defaults baseline')

  await setPgmlEditorValue(editor, `Table public.agency_cost_category_line_item {
  id bigint [not null, default: nextval('public.\\"agency_cost_category_line_item_id_seq\\"'::regclass), pk]
}`)

  await compareFromVersion(page, 'Equivalent defaults baseline')

  const comparePanel = getComparePanel(page)
  const modifiedStat = comparePanel.locator('[data-compare-stat-filter="modified"]')
  const addedStat = comparePanel.locator('[data-compare-stat-filter="added"]')
  const removedStat = comparePanel.locator('[data-compare-stat-filter="removed"]')

  await expect(modifiedStat).toContainText('0')
  await expect(addedStat).toContainText('0')
  await expect(removedStat).toContainText('0')
  await expect(comparePanel.locator('[data-compare-entry]')).toHaveCount(0)
  await expect(comparePanel).toContainText('No diff entries match the current filter.')
})

test('compare panel ignores equivalent serial sequence metadata imported from pg_dump when pg_dump only adds default clauses and quoted ownership', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.Transfer_Payment_Stream_Area_of_Expertise {
  id bigint [pk, not null, default: nextval('public.Transfer_Payment_Stream_Area_of_Expertise_id_seq')]
}

Sequence public.Transfer_Payment_Stream_Area_of_Expertise_id_seq {
  as: bigint
  owned_by: public.Transfer_Payment_Stream_Area_of_Expertise.id
}`)
  await createCheckpoint(page, 'Equivalent sequence metadata baseline')

  await openVersionsPanel(page)
  await page.locator('[data-version-import-dump="true"]').click()

  const importDialog = page.locator('[data-studio-modal-surface="pg-dump-import"]')

  await expect(importDialog).toBeVisible()
  await importDialog.getByLabel('Increment from version').click()
  await page.getByRole('option', { name: /Equivalent sequence metadata baseline/i }).click()
  await importDialog.locator('textarea').fill(`CREATE TABLE public."Transfer_Payment_Stream_Area_of_Expertise" (
  id bigint DEFAULT nextval('public."Transfer_Payment_Stream_Area_of_Expertise_id_seq"'::regclass) NOT NULL
);
ALTER TABLE ONLY public."Transfer_Payment_Stream_Area_of_Expertise"
  ADD CONSTRAINT "Transfer_Payment_Stream_Area_of_Expertise_pkey" PRIMARY KEY (id);
CREATE SEQUENCE public."Transfer_Payment_Stream_Area_of_Expertise_id_seq" AS bigint START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public."Transfer_Payment_Stream_Area_of_Expertise_id_seq"
  OWNED BY public."Transfer_Payment_Stream_Area_of_Expertise".id;`)
  await importDialog.getByRole('button', { name: 'Replace workspace with import' }).click()
  await expect(importDialog).toHaveCount(0)

  await compareFromVersion(page, 'Equivalent sequence metadata baseline')

  const comparePanel = getComparePanel(page)
  const modifiedStat = comparePanel.locator('[data-compare-stat-filter="modified"]')
  const addedStat = comparePanel.locator('[data-compare-stat-filter="added"]')
  const removedStat = comparePanel.locator('[data-compare-stat-filter="removed"]')

  await expect(modifiedStat).toContainText('0')
  await expect(addedStat).toContainText('0')
  await expect(removedStat).toContainText('0')
  await expect(comparePanel.locator('[data-compare-entry]')).toHaveCount(0)
  await expect(comparePanel).toContainText('No diff entries match the current filter.')
})

test('compare panel ignores equivalent built-in type aliases like varchar and character varying', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.agency_profile {
  legal_name varchar(255) [not null]
  submitted_at timestamp
}`)
  await createCheckpoint(page, 'Equivalent type aliases baseline')

  await setPgmlEditorValue(editor, `Table public.agency_profile {
  legal_name character varying(255) [not null]
  submitted_at timestamp without time zone
}`)

  await compareFromVersion(page, 'Equivalent type aliases baseline')

  const comparePanel = getComparePanel(page)
  const modifiedStat = comparePanel.locator('[data-compare-stat-filter="modified"]')
  const addedStat = comparePanel.locator('[data-compare-stat-filter="added"]')
  const removedStat = comparePanel.locator('[data-compare-stat-filter="removed"]')

  await expect(modifiedStat).toContainText('0')
  await expect(addedStat).toContainText('0')
  await expect(removedStat).toContainText('0')
  await expect(comparePanel.locator('[data-compare-entry]')).toHaveCount(0)
  await expect(comparePanel).toContainText('No diff entries match the current filter.')
})

test('compare panel ignores equivalent function and trigger source changes when only formatting or syntax aliases differ', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Function public.touch_users() returns trigger {
  source: $sql$
    CREATE OR REPLACE FUNCTION public.touch_users() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RETURN NEW;
    END;
    $$;
  $sql$
}

Trigger trg_touch_users on public.users {
  source: $sql$
    CREATE TRIGGER trg_touch_users
      BEFORE UPDATE OR INSERT ON public.users
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_users();
  $sql$
}`)
  await createCheckpoint(page, 'Equivalent executable formatting baseline')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Function public.touch_users() returns trigger {
  source: $sql$
    create or replace function public.touch_users()
    returns trigger
    as $fn$
    -- formatting-only change
    begin
      return new;
    end;
    $fn$
    language plpgsql;
  $sql$
}

Trigger trg_touch_users on public.users {
  source: $sql$
    create trigger trg_touch_users before insert or update on public.users
      for each row
      execute procedure public.touch_users();
  $sql$
}`)

  await compareFromVersion(page, 'Equivalent executable formatting baseline')

  const comparePanel = getComparePanel(page)
  const modifiedStat = comparePanel.locator('[data-compare-stat-filter="modified"]')
  const addedStat = comparePanel.locator('[data-compare-stat-filter="added"]')
  const removedStat = comparePanel.locator('[data-compare-stat-filter="removed"]')

  await expect(modifiedStat).toContainText('0')
  await expect(addedStat).toContainText('0')
  await expect(removedStat).toContainText('0')
  await expect(comparePanel.locator('[data-compare-entry]')).toHaveCount(0)
  await expect(comparePanel).toContainText('No diff entries match the current filter.')
})

test('compare noise filters hide optional compare-only changes and saved comparisons recall their settings', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.orders {
  id uuid [pk]
  status text [default: 'draft']
}

Function public.refresh_orders() returns void {
  cost: 100
  source: $sql$
    select 1;
  $sql$
}`)
  await createCheckpoint(page, 'Noise baseline')

  await setPgmlEditorValue(editor, `Table public.orders {
  id uuid [pk]
  status text [default: 'submitted']
}

Function public.refresh_orders() returns void {
  cost: 200
  source: $sql$
    select 1;
  $sql$
}`)

  await compareFromVersion(page, 'Noise baseline')

  const comparePanel = getComparePanel(page)
  const defaultEntry = comparePanel.locator('[data-compare-entry="column:public.orders::status"]')
  const metadataEntry = comparePanel.locator('[data-compare-entry="function:public.refresh_orders"]')
  const hideDefaultsButton = comparePanel.locator('[data-compare-noise-filter="hideDefaults"]')
  const hideMetadataButton = comparePanel.locator('[data-compare-noise-filter="hideMetadata"]')

  await expect(defaultEntry).toHaveCount(0)
  await expect(metadataEntry).toHaveCount(0)
  await expect(comparePanel).toContainText('No diff entries match the current filter.')

  await hideDefaultsButton.click()
  await expect(hideDefaultsButton).toHaveAttribute('aria-pressed', 'false')
  await expect(defaultEntry).toBeVisible()
  await expect(metadataEntry).toHaveCount(0)

  await hideMetadataButton.click()
  await expect(hideMetadataButton).toHaveAttribute('aria-pressed', 'false')
  await expect(defaultEntry).toBeVisible()
  await expect(metadataEntry).toBeVisible()

  await openMigrationsPanel(page)
  await expect(getMigrationArtifact(page)).toContainText(`ALTER TABLE "public"."orders" ALTER COLUMN "status" SET DEFAULT 'submitted';`)

  await openComparator(page)
  await comparePanel.locator('[data-compare-create-comparison="true"]').click()

  const comparisonDialog = page.locator('[data-studio-modal-surface="compare-comparison"]')

  await expect(comparisonDialog).toBeVisible()
  await comparisonDialog.locator('[data-compare-comparison-name-input="true"]').fill('Noise settings')
  await comparisonDialog.locator('[data-compare-comparison-save="true"]').click()
  await expect(comparisonDialog).toHaveCount(0)

  await createCheckpoint(page, 'Noise follow-up')
  await openComparator(page)
  await expect(comparePanel.locator('[data-compare-entry]')).toHaveCount(0)

  await comparePanel.locator('[data-compare-comparison-select="true"]').click()
  await page.getByRole('option', { name: 'Noise settings' }).click()

  await expect(comparePanel.locator('[data-compare-base-select="true"]')).toContainText('Noise baseline')
  await expect(comparePanel.locator('[data-compare-noise-filter="hideDefaults"]')).toHaveAttribute('aria-pressed', 'false')
  await expect(comparePanel.locator('[data-compare-noise-filter="hideMetadata"]')).toHaveAttribute('aria-pressed', 'false')
  await expect(defaultEntry).toBeVisible()
  await expect(metadataEntry).toBeVisible()
})

test('compare panel exports the current visible compare state as HTML', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  status text [default: 'draft']
}`)
  await createCheckpoint(page, 'Export baseline')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
  email text
}

Table public.orders {
  id uuid [pk]
  status text [default: 'submitted']
}

Table public.audit_log {
  id uuid [pk]
}

Function public.refresh_users() returns void {
  source: $sql$
    select 1;
  $sql$
}`)

  await compareFromVersion(page, 'Export baseline')

  const comparePanel = getComparePanel(page)

  await comparePanel.locator('[data-compare-edit-exclusions="true"]').click()

  const exclusionsDialog = page.locator('[data-studio-modal-surface="compare-exclusions"]')

  await expect(exclusionsDialog).toBeVisible()
  await exclusionsDialog.locator('[data-compare-exclusion-entity-section="function"] [data-compare-exclusion-option="function:public.refresh_users"]').click()
  await exclusionsDialog.locator('[data-compare-exclusions-save="true"]').click()
  await expect(exclusionsDialog).toHaveCount(0)

  await comparePanel.locator('[data-compare-stat-filter="added"]').click()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    comparePanel.locator('[data-compare-export-html="true"]').click()
  ])
  const downloadPath = await download.path()

  expect(downloadPath).not.toBeNull()
  expect(download.suggestedFilename()).toContain('pgml-compare')

  const html = readFileSync(downloadPath!, 'utf8')

  expect(html).toContain('Export baseline to Current workspace')
  expect(html).toContain('1 excluded compare entity')
  expect(html).toContain('Added only')
  expect(html).toContain('public.audit_log')
  expect(html).toContain('public.users.email')
  expect(html).not.toContain('public.refresh_users')
  expect(html).not.toContain('public.orders.status')
})

test('compare panel exports the current visible compare state as Markdown', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  status text [default: 'draft']
}`)
  await createCheckpoint(page, 'Markdown export baseline')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
  email text
}

Table public.orders {
  id uuid [pk]
  status text [default: 'submitted']
}

Table public.audit_log {
  id uuid [pk]
}

Function public.refresh_users() returns void {
  source: $sql$
    select 1;
  $sql$
}`)

  await compareFromVersion(page, 'Markdown export baseline')

  const comparePanel = getComparePanel(page)

  await comparePanel.locator('[data-compare-edit-exclusions="true"]').click()

  const exclusionsDialog = page.locator('[data-studio-modal-surface="compare-exclusions"]')

  await expect(exclusionsDialog).toBeVisible()
  await exclusionsDialog.locator('[data-compare-exclusion-entity-section="function"] [data-compare-exclusion-option="function:public.refresh_users"]').click()
  await exclusionsDialog.locator('[data-compare-exclusions-save="true"]').click()
  await expect(exclusionsDialog).toHaveCount(0)

  await comparePanel.locator('[data-compare-stat-filter="added"]').click()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    comparePanel.locator('[data-compare-export-md="true"]').click()
  ])
  const downloadPath = await download.path()

  expect(downloadPath).not.toBeNull()
  expect(download.suggestedFilename()).toContain('.md')

  const markdown = readFileSync(downloadPath!, 'utf8')

  expect(markdown).toContain('# PGML Compare')
  expect(markdown).toContain('- comparison: Current comparison')
  expect(markdown).toContain('- base: Markdown export baseline')
  expect(markdown).toContain('- target: Current workspace')
  expect(markdown).toContain('- exclusions: 1 excluded compare entity')
  expect(markdown).toContain('- change filter: Added only')
  expect(markdown).toContain('### Table (1)')
  expect(markdown).toContain('### Column (2)')
  expect(markdown).toContain('- Added public.users.email')
  expect(markdown).toContain('public.audit_log')
  expect(markdown).toContain('public.users.email')
  expect(markdown).not.toContain('public.refresh_users')
  expect(markdown).not.toContain('public.orders.status')
})

test('compare panel stat cards filter the visible entries and keep the panel within its container', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)
  const removedTableNames = Array.from({ length: 10 }, (_, index) => {
    return `public.removed_agency_funding_case_agreement_history_${index + 1}`
  })
  const removedTableDefinitions = removedTableNames.map((tableName) => {
    return `Table ${tableName} {
  id uuid [pk]
}`
  }).join('\n\n')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
  email text
  status text
}

${removedTableDefinitions}`)
  await createCheckpoint(page, 'Filter baseline')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
  email varchar [not null]
  status integer [not null]
}

Table public.orders {
  id uuid [pk]
}`)
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.orders')

  await compareFromVersion(page, 'Filter baseline')

  const comparePanel = getComparePanel(page)
  const addedStat = comparePanel.locator('[data-compare-stat-filter="added"]')
  const modifiedStat = comparePanel.locator('[data-compare-stat-filter="modified"]')
  const removedStat = comparePanel.locator('[data-compare-stat-filter="removed"]')
  const addedTableScope = comparePanel.locator('[data-compare-scope-row="table:public.orders"]')
  const modifiedTableScope = comparePanel.locator('[data-compare-scope-row="table:public.users"]')
  const modifiedTableScopeEntry = comparePanel.locator('[data-compare-scope-entry="table:public.users"]')
  const modifiedColumnEntry = comparePanel.locator('[data-compare-entry="column:public.users::email"]')
  const removedTableScope = comparePanel.locator(`[data-compare-scope-row="table:${removedTableNames[0]!}"]`)

  await expect(addedTableScope).toBeVisible()
  await expect(modifiedTableScope).toBeVisible()
  await expect(modifiedColumnEntry).toHaveCount(0)
  await expect(removedTableScope).toBeVisible()
  await expectComparePanelWithinContainer(page)

  await modifiedTableScopeEntry.click()
  await expect(modifiedColumnEntry).toBeVisible()
  await modifiedColumnEntry.click()
  const modifiedRow = comparePanel.locator('[data-compare-entry-row="column:public.users::email"]')
  const modifiedDetail = modifiedRow.locator('[data-compare-entry-detail="true"]')
  await expect(modifiedRow.getByText('public.users.email', { exact: true })).toHaveCount(1)
  await expect(modifiedDetail).toContainText('Show on diagram')
  await expect(modifiedDetail).toContainText('Structured diff')
  await expect(modifiedDetail).not.toContainText('Snapshot diff')
  await expect(modifiedDetail.locator('[data-compare-diff-block="true"]').first()).toBeVisible()

  await comparePanel.locator('[data-compare-detail-view="both"]').click()
  await expect(modifiedDetail).toContainText('Snapshot diff')
  await expect(modifiedDetail).toContainText('modifiers')

  await addedStat.click()
  await expect(addedStat).toHaveAttribute('aria-pressed', 'true')
  await expect(addedTableScope).toBeVisible()
  await expect(modifiedTableScope).toHaveCount(0)
  await expect(modifiedColumnEntry).toHaveCount(0)
  await expect(removedTableScope).toHaveCount(0)
  await expect(comparePanel.locator('[data-compare-entry-detail="true"]')).toHaveCount(0)

  await modifiedStat.click()
  await expect(modifiedStat).toHaveAttribute('aria-pressed', 'true')
  await expect(addedTableScope).toBeVisible()
  await expect(modifiedTableScope).toBeVisible()
  await expect(modifiedColumnEntry).toBeVisible()
  await expect(removedTableScope).toHaveCount(0)
  await expect(comparePanel.locator('[data-compare-entry-row="column:public.users::email"]').getByText('public.users.email', { exact: true })).toHaveCount(1)

  await removedStat.click()
  await expect(removedStat).toHaveAttribute('aria-pressed', 'true')
  await expect(addedTableScope).toBeVisible()
  await expect(modifiedTableScope).toBeVisible()
  await expect(modifiedColumnEntry).toBeVisible()
  await expect(removedTableScope).toBeVisible()
  await expectComparePanelWithinContainer(page)

  await removedStat.click()
  await expect(removedStat).toHaveAttribute('aria-pressed', 'false')
  await expect(addedTableScope).toBeVisible()
  await expect(modifiedTableScope).toBeVisible()
  await expect(modifiedColumnEntry).toBeVisible()
  await expect(removedTableScope).toHaveCount(0)
  await expectComparePanelWithinContainer(page)
})

test('compare panel entity-kind filters surface executable diffs and narrow the visible entries', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Entity filter baseline')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
}

Function public.refresh_users() returns void {
  source: $sql$
    select 1;
  $sql$
}

Sequence public.user_number_seq {
  source: $sql$
    CREATE SEQUENCE public.user_number_seq;
  $sql$
}`)

  await compareFromVersion(page, 'Entity filter baseline')

  const comparePanel = getComparePanel(page)
  const addedStat = comparePanel.locator('[data-compare-stat-filter="added"]')
  const tableScopeRow = comparePanel.getByRole('button', { name: /public\.orders/i })
  const functionEntry = comparePanel.locator('[data-compare-entry="function:public.refresh_users"]')
  const sequenceEntry = comparePanel.locator('[data-compare-entry="sequence:public.user_number_seq"]')
  const tableFilter = comparePanel.locator('[data-compare-entity-filter="table"]')
  const functionFilter = comparePanel.locator('[data-compare-entity-filter="function"]')
  const sequenceFilter = comparePanel.locator('[data-compare-entity-filter="sequence"]')
  const clearFilters = comparePanel.getByRole('button', { name: 'Clear filters' })
  const readFilterStyles = async (locator: ReturnType<typeof comparePanel.locator>) => {
    return locator.evaluate((element) => {
      const style = getComputedStyle(element)

      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        color: style.color
      }
    })
  }

  await addedStat.click()
  await expect(tableScopeRow).toBeVisible()
  await expect(functionEntry).toBeVisible()
  await expect(sequenceEntry).toBeVisible()
  await expect(functionFilter).toContainText('Functions')
  await expect(functionFilter.locator('[data-compare-entity-filter-count="function"]')).toHaveText('1')
  await expect(sequenceFilter).toContainText('Sequences')
  await expect(sequenceFilter.locator('[data-compare-entity-filter-count="sequence"]')).toHaveText('1')

  const inactiveFunctionFilterStyles = await readFilterStyles(functionFilter)
  await functionFilter.click()
  await expect(functionFilter).toHaveAttribute('aria-pressed', 'true')
  await expect(tableScopeRow).toHaveCount(0)
  await expect(functionEntry).toBeVisible()
  await expect(sequenceEntry).toHaveCount(0)
  const activeFunctionFilterStyles = await readFilterStyles(functionFilter)

  expect(activeFunctionFilterStyles.backgroundColor).not.toBe(inactiveFunctionFilterStyles.backgroundColor)
  expect(activeFunctionFilterStyles.borderColor).not.toBe(inactiveFunctionFilterStyles.borderColor)
  expect(activeFunctionFilterStyles.color).not.toBe(inactiveFunctionFilterStyles.color)
  expect(activeFunctionFilterStyles.boxShadow).not.toBe('none')

  await clearFilters.click()
  await expect(tableScopeRow).toBeVisible()
  await expect(functionEntry).toBeVisible()
  await expect(sequenceEntry).toBeVisible()

  await sequenceFilter.click()
  await expect(sequenceFilter).toHaveAttribute('aria-pressed', 'true')
  await expect(tableScopeRow).toHaveCount(0)
  await expect(functionEntry).toHaveCount(0)
  await expect(sequenceEntry).toBeVisible()

  await clearFilters.click()
  await tableFilter.click()
  await expect(tableFilter).toHaveAttribute('aria-pressed', 'true')
  await expect(tableScopeRow).toBeVisible()
  await expect(functionEntry).toHaveCount(0)
  await expect(sequenceEntry).toHaveCount(0)
})

test('history tools panel can expand to fill the full diagram viewport without clipping header actions', async ({ goto, page }) => {
  await goto('/diagram')
  await openVersionsPanel(page)

  const historyToolsPanel = getHistoryToolsPanel(page)
  const expandButton = historyToolsPanel.locator('[data-diagram-tool-panel-expand="true"]')

  await expect(historyToolsPanel).toHaveAttribute('data-diagram-tool-panel-expanded', 'false')
  await expect(expandButton).toHaveText('Expand')
  await expectHistoryToolsHeaderActionsWithinPanel(page)

  const dockedWidth = await historyToolsPanel.evaluate((element) => {
    return element.getBoundingClientRect().width
  })

  await expandButton.click()
  await expect(historyToolsPanel).toHaveAttribute('data-diagram-tool-panel-expanded', 'true')
  await expect(expandButton).toHaveText('Restore')
  await expectHistoryToolsPanelToFillViewport(page)
  await expectHistoryToolsHeaderActionsWithinPanel(page)

  const expandedWidth = await historyToolsPanel.evaluate((element) => {
    return element.getBoundingClientRect().width
  })

  expect(expandedWidth).toBeGreaterThan(dockedWidth + 120)

  await historyToolsPanel.locator('[data-diagram-tool-panel-tab="compare"]').click()
  await expect(historyToolsPanel).toHaveAttribute('data-diagram-tool-panel-mode', 'compare')
  await expect(historyToolsPanel).toHaveAttribute('data-diagram-tool-panel-expanded', 'true')
  await expectHistoryToolsHeaderActionsWithinPanel(page)

  await historyToolsPanel.locator('[data-diagram-tool-panel-tab="migrations"]').click()
  await expect(historyToolsPanel).toHaveAttribute('data-diagram-tool-panel-mode', 'migrations')
  await expect(historyToolsPanel).toHaveAttribute('data-diagram-tool-panel-expanded', 'true')
  await expectHistoryToolsHeaderActionsWithinPanel(page)

  await expandButton.click()
  await expect(historyToolsPanel).toHaveAttribute('data-diagram-tool-panel-expanded', 'false')
  await expect(expandButton).toHaveText('Expand')
  await expectHistoryToolsHeaderActionsWithinPanel(page)

  const restoredWidth = await historyToolsPanel.evaluate((element) => {
    return element.getBoundingClientRect().width
  })

  expect(Math.abs(restoredWidth - dockedWidth)).toBeLessThanOrEqual(2)
})

test('saved comparisons persist their base, target, and exclusions and can be recalled later', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users in Core {
  id uuid [pk]
}

Table public.orders in Core {
  id uuid [pk]
  user_id uuid [ref: > public.users.id]
}

Table public.audit_log {
  id uuid [pk]
}

Table public.kysely_migration {
  id bigint [pk]
}

TableGroup Core {
  public.users
  public.orders
}`)
  await createCheckpoint(page, 'Baseline')

  await setPgmlEditorValue(editor, `Table public.users in Core {
  id uuid [pk]
  email text
}

Table public.orders in Core {
  id uuid [pk]
  user_id uuid [ref: > public.users.id]
  status text
}

Table public.audit_log {
  id uuid [pk]
  action text
}

Table public.kysely_migration {
  id bigint [pk]
  name text
}

Enum public.review_status {
  pending
  approved
}

Function public.refresh_users() returns void {
  source: $sql$
    select 1;
  $sql$
}

TableGroup Core {
  public.users
  public.orders
}`)

  await compareFromVersion(page, 'Baseline')

  const comparePanel = getComparePanel(page)
  const usersColumnEntry = comparePanel.locator('[data-compare-entry="column:public.users::email"]')
  const ordersColumnEntry = comparePanel.locator('[data-compare-entry="column:public.orders::status"]')
  const auditLogColumnEntry = comparePanel.locator('[data-compare-entry="column:public.audit_log::action"]')
  const migrationColumnEntry = comparePanel.locator('[data-compare-entry="column:public.kysely_migration::name"]')
  const addedTypeEntry = comparePanel.locator('[data-compare-entry="custom-type:Enum::public.review_status"]')
  const addedFunctionEntry = comparePanel.locator('[data-compare-entry="function:public.refresh_users"]')

  await expect(usersColumnEntry).toBeVisible()
  await expect(ordersColumnEntry).toBeVisible()
  await expect(auditLogColumnEntry).toBeVisible()
  await expect(migrationColumnEntry).toBeVisible()
  await expect(addedTypeEntry).toBeVisible()
  await expect(addedFunctionEntry).toBeVisible()

  await comparePanel.locator('[data-compare-edit-exclusions="true"]').click()

  const exclusionsDialog = page.locator('[data-studio-modal-surface="compare-exclusions"]')

  await expect(exclusionsDialog).toBeVisible()
  await expect(exclusionsDialog.locator('[data-compare-exclusions-type-filters="true"]')).toContainText('All')
  await expect(exclusionsDialog.locator('[data-compare-exclusions-type-filters="true"]')).toContainText('Groups')
  await expect(exclusionsDialog.locator('[data-compare-exclusions-type-filters="true"]')).toContainText('Tables')
  await expect(exclusionsDialog.locator('[data-compare-exclusions-type-filters="true"]')).toContainText('Functions')
  await expect(exclusionsDialog.locator('[data-compare-exclusion-groups-section="true"]')).toContainText('Groups')
  await expect(exclusionsDialog.locator('[data-compare-exclusion-group-section="Core"]')).toContainText('public.users')
  await expect(exclusionsDialog.locator('[data-compare-exclusion-group-section="Core"]')).toContainText('public.orders')
  await expect(exclusionsDialog.locator('[data-compare-exclusion-ungrouped-section="true"]')).toContainText('Ungrouped tables')
  await expect(exclusionsDialog.locator('[data-compare-exclusion-entities-section="true"]')).toContainText('Other compare entities')
  await expect(exclusionsDialog.locator('[data-compare-exclusion-option="column:public.users::email"]')).toHaveCount(0)
  await expect(exclusionsDialog.locator('[data-compare-exclusion-entity-section="custom-type"]')).toContainText('public.review_status')
  await expect(exclusionsDialog.locator('[data-compare-exclusion-entity-section="function"]')).toContainText('public.refresh_users')
  await exclusionsDialog.locator('[data-compare-exclusions-type-filter="function"]').click()
  await expect(exclusionsDialog.locator('[data-compare-exclusions-type-filter="function"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(exclusionsDialog.locator('[data-compare-exclusion-groups-section="true"]')).toHaveCount(0)
  await expect(exclusionsDialog.locator('[data-compare-exclusion-ungrouped-section="true"]')).toHaveCount(0)
  await expect(exclusionsDialog.locator('[data-compare-exclusion-entity-section="custom-type"]')).toHaveCount(0)
  await expect(exclusionsDialog.locator('[data-compare-exclusion-entity-section="function"]')).toContainText('public.refresh_users')
  await exclusionsDialog.locator('[data-compare-exclusions-type-filter="all"]').click()
  await expect(exclusionsDialog.locator('[data-compare-exclusions-type-filter="all"]')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => {
    return exclusionsDialog.locator('[data-compare-exclusion-options="true"]').evaluate((element) => {
      return getComputedStyle(element).overflowY
    })
  }).toBe('visible')
  await expect.poll(async () => {
    return exclusionsDialog.locator('[data-compare-exclusion-groups-section="true"]').evaluate((element) => {
      const scrollContainer = element.parentElement

      return scrollContainer ? scrollContainer.scrollWidth - scrollContainer.clientWidth : Number.POSITIVE_INFINITY
    })
  }).toBeLessThanOrEqual(1)
  await exclusionsDialog.locator('[data-compare-exclusion-group-section="Core"] [data-compare-exclusion-option="group:Core"]').click()
  await exclusionsDialog.locator('[data-compare-exclusion-ungrouped-section="true"] [data-compare-exclusion-option="table:public.kysely_migration"]').click()
  await exclusionsDialog.locator('[data-compare-exclusion-entity-section="custom-type"] [data-compare-exclusion-option="custom-type:Enum::public.review_status"]').click()
  await exclusionsDialog.locator('[data-compare-exclusion-entity-section="function"] [data-compare-exclusion-option="function:public.refresh_users"]').click()
  await exclusionsDialog.locator('[data-compare-exclusions-save="true"]').click()
  await expect(exclusionsDialog).toHaveCount(0)

  await expect(comparePanel).toContainText('Group Core')
  await expect(comparePanel).toContainText('Table public.kysely_migration')
  await expect(comparePanel).toContainText('Type public.review_status')
  await expect(comparePanel).toContainText('Function public.refresh_users')
  await expect(usersColumnEntry).toHaveCount(0)
  await expect(ordersColumnEntry).toHaveCount(0)
  await expect(migrationColumnEntry).toHaveCount(0)
  await expect(addedTypeEntry).toHaveCount(0)
  await expect(addedFunctionEntry).toHaveCount(0)
  await expect(auditLogColumnEntry).toBeVisible()

  await comparePanel.locator('[data-compare-create-comparison="true"]').click()
  const comparisonDialog = page.locator('[data-studio-modal-surface="compare-comparison"]')
  await expect(comparisonDialog).toBeVisible()
  await comparisonDialog.locator('[data-compare-comparison-name-input="true"]').fill('Implemented scope')
  await comparisonDialog.locator('[data-compare-comparison-save="true"]').click()
  await expect(comparisonDialog).toHaveCount(0)

  await createCheckpoint(page, 'App-only')
  await openComparator(page)
  const recalledComparePanel = getComparePanel(page)
  await expect(recalledComparePanel.locator('[data-compare-entry="column:public.users::email"]')).toHaveCount(0)
  await recalledComparePanel.locator('[data-compare-comparison-select="true"]').click()
  await page.getByRole('option', { name: 'Implemented scope' }).click()

  await expect(recalledComparePanel).toContainText('Group Core')
  await expect(recalledComparePanel).toContainText('Table public.kysely_migration')
  await expect(recalledComparePanel).toContainText('Type public.review_status')
  await expect(recalledComparePanel).toContainText('Function public.refresh_users')
  await expect(recalledComparePanel.locator('[data-compare-entry="column:public.users::email"]')).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-entry="column:public.orders::status"]')).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-entry="column:public.kysely_migration::name"]')).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-entry="custom-type:Enum::public.review_status"]')).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-entry="function:public.refresh_users"]')).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-entry="column:public.audit_log::action"]')).toBeVisible()
  await expect(recalledComparePanel.locator('[data-compare-base-select="true"]')).toContainText('Baseline')

  await recalledComparePanel.locator('[data-compare-rename-comparison="true"]').click()
  await expect(comparisonDialog).toBeVisible()
  await comparisonDialog.locator('[data-compare-comparison-name-input="true"]').fill('Implemented today')
  await comparisonDialog.locator('[data-compare-comparison-save="true"]').click()
  await expect(comparisonDialog).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-comparison-select="true"]')).toContainText('Implemented today')

  await recalledComparePanel.locator('[data-compare-delete-comparison="true"]').click()
  await expect(recalledComparePanel.locator('[data-compare-comparison-select="true"]')).toContainText('Current comparison')
  await expect(recalledComparePanel.locator('[data-compare-entry="column:public.users::email"]')).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-entry="column:public.orders::status"]')).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-entry="column:public.kysely_migration::name"]')).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-entry="custom-type:Enum::public.review_status"]')).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-entry="function:public.refresh_users"]')).toHaveCount(0)
  await expect(recalledComparePanel.locator('[data-compare-entry="column:public.audit_log::action"]')).toBeVisible()
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

test('versions panel renames the initial locked version directly from its card actions', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Initial implementation')

  await openVersionsPanel(page)
  await clickVersionCardAction(page, 'Initial implementation', '[data-version-rename]')

  const renameDialog = page.locator('[data-studio-modal-surface="rename-version"]')

  await expect(renameDialog).toBeVisible()
  await renameDialog.getByPlaceholder('Version name').fill('Foundation baseline')
  await renameDialog.locator('[data-rename-version-save="true"]').click()
  await expect(renameDialog).toHaveCount(0)

  await expect(getVersionCardByLabel(page, 'Foundation baseline')).toBeVisible()
  await expect(getVersionCardByLabel(page, 'Initial implementation')).toHaveCount(0)
  await expect(getVersionsPanel(page)).toContainText('Incrementing from Foundation baseline.')
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
  const historyToolsPanel = getHistoryToolsPanel(page)
  const contextRow = comparePanel.locator('[data-compare-context-entry-row="column:public.users::email"]')
  const detail = comparePanel.locator('[data-compare-context-entry-row="column:public.users::email"] [data-compare-entry-detail="true"]')

  await expect(comparePanel.locator('[data-compare-context-entry]').filter({ hasText: 'public.users.email' })).toBeVisible()
  await expect(contextRow.getByText('public.users.email', { exact: true })).toHaveCount(1)
  await expect(historyToolsPanel.locator('h3')).toHaveText('Compare changes')
  await expect(detail).toContainText('Show on diagram')
  await expect(detail).toContainText('Users baseline')
  await expect(detail).toContainText('Current workspace')
  await expect(detail.locator('[data-compare-diff-legend="removed"]').first()).toContainText('Users baseline')
  await expect(detail.locator('[data-compare-diff-legend="added"]').first()).toContainText('Current workspace')
  await expect(detail).toContainText('Structured diff')
  await expect(detail).not.toContainText('Snapshot diff')
  await comparePanel.locator('[data-compare-detail-view="both"]').click()
  await expect(detail.locator('[data-compare-diff-kind="removed"]').filter({ hasText: '"type": "text"' })).toHaveCount(1)
  await expect(detail.locator('[data-compare-diff-kind="added"]').filter({ hasText: '"type": "varchar"' })).toHaveCount(1)
  await expect(detail).toContainText('Snapshot diff')
  await expect(detail).toContainText('modifiers')
})

test('compare panel labels grouped table scopes separately from actual table entries', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  email text
  name text
}`)
  await createCheckpoint(page, 'Users baseline')

  await setPgmlEditorValue(editor, '')
  await expect.poll(async () => readPgmlEditorValue(editor)).toBe('')

  await compareFromVersion(page, 'Users baseline')

  const comparePanel = getComparePanel(page)
  const scopeEntry = comparePanel.locator('[data-compare-scope-entry="table:public.users"]')
  const tableEntry = comparePanel.locator('[data-compare-entry="table:public.users"]')

  await expect(scopeEntry).toContainText('Table scope')
  await expect(scopeEntry).toContainText('3 scoped changes')
  await expect(scopeEntry).toContainText('Includes 1 table change and 2 column changes.')

  await scopeEntry.click()

  await expect(tableEntry).toContainText('Table')
  await expect(tableEntry).toContainText('Removed table public.users.')
  await expect(tableEntry).not.toContainText('Table scope')
})

test('compare panel reports inline reference additions once as references instead of duplicate modified columns', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.common_entity {
  id uuid [pk]
}

Table public.common_review {
  id uuid [pk]
  entity_id uuid [not null]
}`)
  await createCheckpoint(page, 'Reference baseline')

  await setPgmlEditorValue(editor, `Table public.common_entity {
  id uuid [pk]
}

Table public.common_review {
  id uuid [pk]
  entity_id uuid [not null, ref: > public.common_entity.id, delete: restrict]
}`)
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('ref: > public.common_entity.id')

  await compareFromVersion(page, 'Reference baseline')

  const comparePanel = getComparePanel(page)
  const addedStat = comparePanel.locator('[data-compare-stat-filter="added"]')
  const modifiedStat = comparePanel.locator('[data-compare-stat-filter="modified"]')
  const referenceEntry = comparePanel.locator('[data-compare-entry="reference:>::public.common_review::entity_id::public.common_entity::id"]')
  const columnEntry = comparePanel.locator('[data-compare-entry="column:public.common_review::entity_id"]')

  await expect(addedStat).toContainText('1')
  await expect(modifiedStat).toContainText('0')
  await expect(referenceEntry).toBeVisible()
  await expect(columnEntry).toHaveCount(0)

  await addedStat.click()
  await expect(referenceEntry).toBeVisible()
  await expect(columnEntry).toHaveCount(0)

  await modifiedStat.click()
  await expect(modifiedStat).toHaveAttribute('aria-pressed', 'true')
  await expect(referenceEntry).toBeVisible()
  await expect(columnEntry).toHaveCount(0)

  await addedStat.click()
  await expect(addedStat).toHaveAttribute('aria-pressed', 'false')
  await expect(referenceEntry).toHaveCount(0)
  await expect(columnEntry).toHaveCount(0)
  await expect(comparePanel).toContainText('No diff entries match the current filter.')
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

  await expect(page.locator('[data-studio-schema-status]')).toHaveAttribute('data-studio-schema-status', 'pending')
  await expect.poll(async () => {
    return page.evaluate(() => {
      const savedSchemas = JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')
      const schemaStatus = document.querySelector('[data-studio-schema-status]')?.getAttribute('data-studio-schema-status')

      return {
        status: schemaStatus,
        text: savedSchemas[0]?.text || ''
      }
    })
  }, {
    timeout: 8000
  }).toEqual({
    status: 'saved',
    text: expect.stringContaining('Table public.orders')
  })

  await compareFromVersion(page, 'Users baseline')

  await openMigrationsPanel(page)

  const migrationArtifact = getMigrationArtifact(page)

  await expect(migrationArtifact).toContainText('-- Step 1: Users baseline -> Current workspace')
  await expect(migrationArtifact).toContainText('CREATE TABLE "public"."orders"')
  await expect(migrationArtifact).toContainText('ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");')
  await expect(migrationArtifact).not.toContainText('Users and teams')
  await expect(migrationArtifact).not.toContainText('DROP TABLE IF EXISTS "public"."teams";')
})

test('version import modals keep their text inputs above the footer actions', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Initial implementation')

  await openVersionsPanel(page)

  const assertModalTextareaClearsFooter = async (payload: {
    dialogSurfaceId: 'dbml-import' | 'pg-dump-import'
    openButtonSelector: '[data-version-import-dbml="true"]' | '[data-version-import-dump="true"]'
  }) => {
    await page.locator(payload.openButtonSelector).click()

    const importDialog = page.locator(`[data-studio-modal-surface="${payload.dialogSurfaceId}"]`)
    const textarea = importDialog.locator('textarea')
    const confirmButton = importDialog.getByRole('button', { name: 'Replace workspace with import' })

    await expect(importDialog).toBeVisible()
    await expect(textarea).toBeVisible()
    await expect(confirmButton).toBeVisible()

    const layout = await importDialog.evaluate((modal) => {
      const body = modal.children[1]
      const footer = modal.children[2]

      if (!(body instanceof HTMLElement) || !(footer instanceof HTMLElement)) {
        return null
      }

      return {
        bodyBottom: Math.round(body.getBoundingClientRect().bottom),
        bodyClientHeight: body.clientHeight,
        bodyOverflowY: getComputedStyle(body).overflowY,
        bodyScrollHeight: body.scrollHeight,
        footerTop: Math.round(footer.getBoundingClientRect().top)
      }
    })

    if (!layout) {
      throw new Error('Expected the import dialog body and footer to be measurable.')
    }

    expect(layout.bodyBottom).toBeLessThanOrEqual(layout.footerTop)
    expect(layout.bodyOverflowY).toBe('auto')
    expect(layout.bodyScrollHeight).toBeGreaterThan(layout.bodyClientHeight)

    await importDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(importDialog).toHaveCount(0)
  }

  await assertModalTextareaClearsFooter({
    dialogSurfaceId: 'pg-dump-import',
    openButtonSelector: '[data-version-import-dump="true"]'
  })
  await assertModalTextareaClearsFooter({
    dialogSurfaceId: 'dbml-import',
    openButtonSelector: '[data-version-import-dbml="true"]'
  })
})

test('importing a pg_dump onto a selected base version can retain matching table groups from that base', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users in Core {
  id uuid [pk]
}

Table public.orders in Core {
  id uuid [pk]
  user_id uuid [ref: > public.users.id]
}

TableGroup Core {
  public.users
  public.orders
  Note: Shared transactional tables
}`)
  await createCheckpoint(page, 'Grouped base')

  await setPgmlEditorValue(editor, `Table public.scratch_entries {
  id uuid [pk]
}`)
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.scratch_entries')

  await openVersionsPanel(page)
  await page.locator('[data-version-import-dump="true"]').click()

  const importDialog = page.locator('[data-studio-modal-surface="pg-dump-import"]')

  await expect(importDialog).toBeVisible()
  await expect(importDialog).toContainText('Retain matching table groups from base version')
  await importDialog.getByLabel('Increment from version').click()
  await page.getByRole('option', { name: /Grouped base/i }).click()
  await importDialog.locator('textarea').fill(`CREATE TABLE public.users (
  id uuid NOT NULL
);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
CREATE TABLE public.orders (
  id uuid NOT NULL,
  user_id uuid NOT NULL
);
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
CREATE TABLE public.invoices (
  id uuid NOT NULL
);
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);`)
  await importDialog.getByRole('button', { name: 'Replace workspace with import' }).click()
  await expect(importDialog).toHaveCount(0)

  const importedSource = await readPgmlEditorValue(editor)

  expect(importedSource).toContain('Table public.users in Core {')
  expect(importedSource).toContain('Table public.orders in Core {')
  expect(importedSource).toContain('Table public.invoices {')
  expect(importedSource).toContain('TableGroup Core {')
  expect(importedSource).toContain('Note: Shared transactional tables')
  expect(importedSource).not.toContain('Table public.scratch_entries')
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

test('importing DBML onto a selected base version can fold imported identifiers to lowercase', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Users baseline')

  await openVersionsPanel(page)
  await page.locator('[data-version-import-dbml="true"]').click()

  const importDialog = page.locator('[data-studio-modal-surface="dbml-import"]')

  await expect(importDialog).toBeVisible()
  await importDialog.getByLabel('Increment from version').click()
  await page.getByRole('option', { name: /Users baseline/i }).click()
  await importDialog.locator('textarea').fill(`Enum Agreement_Type {
  pending
}

Table Agency_Profile {
  ID uuid [pk]
}

Table Agency_Agreement_Type {
  EGCS_AY_AgreementType Agreement_Type [not null, ref: > Agency_Profile.ID]
}`)
  await importDialog.getByRole('switch').nth(1).click()
  await importDialog.getByRole('button', { name: 'Replace workspace with import' }).click()
  await expect(importDialog).toHaveCount(0)

  const importedSource = await readPgmlEditorValue(editor)

  expect(importedSource).toContain('Enum public.agreement_type {')
  expect(importedSource).toContain('Table public.agency_profile {')
  expect(importedSource).toContain('Table public.agency_agreement_type {')
  expect(importedSource).toContain('egcs_ay_agreementtype public.agreement_type [not null, ref: > public.agency_profile.id]')
  expect(importedSource).not.toContain('Table Agency_Profile')
  expect(importedSource).not.toContain('Agreement_Type [not null')
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

test('versions panel only deletes unreferenced checkpoints', async ({ goto, page }) => {
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

  await openVersionsPanel(page)
  await expect(getVersionCardByLabel(page, 'Users only').locator('[data-version-delete]')).toBeDisabled()
  await expect(getVersionCardByLabel(page, 'Users only')).toContainText('Delete stays locked while a newer checkpoint branches from it.')
  await expect(getVersionCardByLabel(page, 'Users and teams').locator('[data-version-delete]')).toBeDisabled()
  await expect(getVersionCardByLabel(page, 'Users and teams')).toContainText('Delete stays locked while the workspace increments from it.')

  await clickVersionCardAction(page, 'Users only', '[data-version-restore]')

  const restoreDialog = page.locator('[data-studio-modal-surface="restore-version"]')

  await expect(restoreDialog).toBeVisible()
  await restoreDialog.getByRole('button', { name: 'Restore version' }).click()
  await expect(restoreDialog).toHaveCount(0)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.projects {
  id uuid [pk]
}`)
  await createCheckpoint(page, 'Users and projects')

  await openVersionsPanel(page)
  await expect(getVersionCardByLabel(page, 'Users and teams').locator('[data-version-delete]')).toBeEnabled()
  await clickVersionCardAction(page, 'Users and teams', '[data-version-delete]')

  const deleteDialog = page.locator('[data-studio-modal-surface="delete-version"]')

  await expect(deleteDialog).toBeVisible()
  await deleteDialog.getByRole('button', { name: 'Delete version' }).click()
  await expect(deleteDialog).toHaveCount(0)
  await expect(getVersionCardByLabel(page, 'Users and teams')).toHaveCount(0)
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.projects')
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
