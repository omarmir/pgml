import { expect, test } from '@nuxt/test-utils/playwright'
import type { Page } from '@playwright/test'
import {
  getPgmlEditor,
  readPgmlEditorValue,
  setPgmlEditorValue
} from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

type MeasuredRect = {
  bottom: number
  left: number
  right: number
  top: number
}

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

const readAttachmentRowRect = async (page: Page, tableId: string, attachmentId: string) => {
  let nextRect: MeasuredRect | null = null

  await expect.poll(async () => {
    nextRect = await page.evaluate(({ attachmentId: nextAttachmentId, tableId: nextTableId }) => {
      const debugWindow = window as Window & {
        __pgmlSceneDebug?: {
          tableCards: Array<{
            headerHeight: number
            id: string
            rows: Array<{
              attachmentId?: string
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
      }
      const viewport = document.querySelector('[data-diagram-viewport="true"]')

      if (!(viewport instanceof HTMLElement) || !debugWindow.__pgmlSceneDebug || !debugWindow.__pgmlSceneRendererDebug) {
        return null
      }

      const table = debugWindow.__pgmlSceneDebug.tableCards.find(entry => entry.id === nextTableId)

      if (!table) {
        return null
      }

      const rowIndex = table.rows.findIndex((row) => {
        return row.kind === 'attachment' && row.attachmentId === nextAttachmentId
      })

      if (rowIndex < 0) {
        return null
      }

      const viewportRect = viewport.getBoundingClientRect()
      const rendererDebug = debugWindow.__pgmlSceneRendererDebug
      const rowTop = (table.y + table.headerHeight + rowIndex * 31) * rendererDebug.scale + rendererDebug.panY
      const rowBottom = (table.y + table.headerHeight + (rowIndex + 1) * 31) * rendererDebug.scale + rendererDebug.panY
      const rowLeft = table.x * rendererDebug.scale + rendererDebug.panX
      const rowRight = (table.x + table.width) * rendererDebug.scale + rendererDebug.panX

      return {
        bottom: viewportRect.top + rowBottom,
        left: viewportRect.left + rowLeft,
        right: viewportRect.left + rowRight,
        top: viewportRect.top + rowTop
      }
    }, {
      attachmentId,
      tableId
    })

    return nextRect !== null
  }).toBe(true)

  return nextRect as MeasuredRect
}

const readObjectRect = async (page: Page, objectId: string) => {
  let nextRect: MeasuredRect | null = null

  await expect.poll(async () => {
    nextRect = await page.evaluate((nextObjectId) => {
      const debugWindow = window as Window & {
        __pgmlSceneDebug?: {
          objectCards: Array<{
            height: number
            id: string
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
      }
      const viewport = document.querySelector('[data-diagram-viewport="true"]')

      if (!(viewport instanceof HTMLElement) || !debugWindow.__pgmlSceneDebug || !debugWindow.__pgmlSceneRendererDebug) {
        return null
      }

      const objectCard = debugWindow.__pgmlSceneDebug.objectCards.find(entry => entry.id === nextObjectId)

      if (!objectCard) {
        return null
      }

      const viewportRect = viewport.getBoundingClientRect()
      const rendererDebug = debugWindow.__pgmlSceneRendererDebug
      const objectTop = objectCard.y * rendererDebug.scale + rendererDebug.panY
      const objectBottom = (objectCard.y + objectCard.height) * rendererDebug.scale + rendererDebug.panY
      const objectLeft = objectCard.x * rendererDebug.scale + rendererDebug.panX
      const objectRight = (objectCard.x + objectCard.width) * rendererDebug.scale + rendererDebug.panX

      return {
        bottom: viewportRect.top + objectBottom,
        left: viewportRect.left + objectLeft,
        right: viewportRect.left + objectRight,
        top: viewportRect.top + objectTop
      }
    }, objectId)

    return nextRect !== null
  }).toBe(true)

  return nextRect as MeasuredRect
}

const expectPopoverBesideTarget = (popoverBox: { height: number, width: number, x: number, y: number } | null, targetRect: MeasuredRect) => {
  expect(popoverBox).not.toBeNull()

  if (!popoverBox) {
    return
  }

  const popoverLeft = popoverBox.x
  const popoverRight = popoverBox.x + popoverBox.width
  const popoverTop = popoverBox.y
  const popoverBottom = popoverBox.y + popoverBox.height
  const rightGap = popoverLeft - targetRect.right
  const leftGap = targetRect.left - popoverRight
  const overlapsVertically = Math.min(popoverBottom, targetRect.bottom) - Math.max(popoverTop, targetRect.top)

  expect(overlapsVertically).toBeGreaterThan(8)
  expect(
    (rightGap >= -2 && rightGap <= 48)
    || (leftGap >= -2 && leftGap <= 48)
  ).toBe(true)
}

test('selecting an attached entity opens a detail popover beside its table row', async ({ goto, page }) => {
  await goto('/diagram')
  const rowRect = await readAttachmentRowRect(page, 'public.products', 'index:idx_products_search')

  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-entity-row="index:idx_products_search"] button').first().click()

  const popover = page.locator('[data-attachment-popover="index:idx_products_search"]')

  await expect(popover).toBeVisible()
  await expect(popover).toContainText('Index')
  await expect(popover).toContainText('Columns: search')
  expectPopoverBesideTarget(await popover.boundingBox(), rowRect)
})

test('selecting a standalone routine opens a detail popover beside its object card', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.orders {
  id integer [pk]
  total_cents integer
}

Function orphan_report() {
  language: sql
  source: $sql$
\tselect 1;
  $sql$
}`)

  const objectRect = await readObjectRect(page, 'function:orphan_report')

  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await expect(page.locator('[data-browser-entity-row="function:orphan_report"]')).toBeVisible()
  await page.locator('[data-browser-entity-row="function:orphan_report"] button').first().click()

  const popover = page.locator('[data-object-popover="function:orphan_report"]')

  await expect(popover).toBeVisible()
  await expect(popover).toContainText('Function')
  await expect(popover).toContainText('language: sql')
  await expect(popover).toContainText('source:')
  await expect(popover).toContainText('select 1;')
  await expect.poll(async () => {
    return popover
      .locator('[data-detail-popover-detail="true"]')
      .filter({ hasText: 'select 1;' })
      .first()
      .evaluate(node => getComputedStyle(node).tabSize)
  }).toBe('2')
  expectPopoverBesideTarget(await popover.boundingBox(), objectRect)
})

test('procedure attachment popovers render dedented source previews', async ({ goto, page }) => {
  await goto('/diagram')

  await page.locator('[data-diagram-panel-tab="entities"]').click()

  const procedureRow = page.locator('[data-browser-entity-row="procedure:archive_orders"] button').first()

  await expect(procedureRow).toBeVisible()
  await procedureRow.click()

  const popover = page.locator('[data-attachment-popover="procedure:archive_orders"]')
  const sourceDetail = popover
    .locator('[data-detail-popover-detail="true"]')
    .filter({ hasText: 'CREATE OR REPLACE PROCEDURE public.archive_orders(retention_days integer)' })
    .first()

  await expect(popover).toBeVisible()
  await expect(popover).toContainText('LANGUAGE plpgsql')
  await expect.poll(async () => {
    return sourceDetail.innerText()
  }).toContain(`source:
CREATE OR REPLACE PROCEDURE public.archive_orders(retention_days integer)
LANGUAGE plpgsql
AS $$
BEGIN`)
})

test('detail popovers edit executable SQL directly inside the embedded source editor', async ({ goto, page }) => {
  await goto('/diagram')

  const mainEditor = getPgmlEditor(page).first()

  await setPgmlEditorValue(mainEditor, `Table public.orders {
  id integer [pk]
}

Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}`)

  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-entity-row="function:orphan_report"] button').first().click()

  const popover = page.locator('[data-object-popover="function:orphan_report"]')

  await expect(popover).toBeVisible()
  await expect(popover.locator('[data-detail-popover-edit-source="true"]')).toContainText('Edit SQL')
  await popover.locator('[data-detail-popover-edit-source="true"]').click()

  const popupEditor = popover.locator('[data-detail-popover-source-editor="true"] [data-pgml-editor="true"]')

  await expect(popupEditor).toBeVisible()
  await expect(popupEditor).toHaveAttribute('data-pgml-editor-language', 'sql')
  await expect.poll(async () => {
    return readPgmlEditorValue(popupEditor)
  }).toBe('select 1;')
  await setPgmlEditorValue(popupEditor, `select
  2;`)
  await popover.locator('[data-detail-popover-apply-source="true"]').click()

  await expect(popover).toContainText('select')
  await expect(popover).toContainText('2;')
  await expect.poll(async () => {
    return readPgmlEditorValue(mainEditor)
  }).toContain(`source: $sql$
    select
      2;
  $sql$`)
})

test('function popovers edit only the routine body instead of the trailing language wrapper', async ({ goto, page }) => {
  await goto('/diagram')

  const mainEditor = getPgmlEditor(page).first()

  await setPgmlEditorValue(mainEditor, `Table public.orders {
  id integer [pk]
}

Function demo() returns void [replace] {
  source: $sql$
    CREATE OR REPLACE FUNCTION public.demo()
    RETURNS void AS $$
    BEGIN
      PERFORM 1;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`)

  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-entity-row="function:demo"] button').first().click()

  const popover = page.locator('[data-object-popover="function:demo"]')

  await expect(popover).toBeVisible()
  await expect(popover.locator('[data-detail-popover-edit-source="true"]')).toContainText('Edit SQL')
  await popover.locator('[data-detail-popover-edit-source="true"]').click()

  const popupEditor = popover.locator('[data-detail-popover-source-editor="true"] [data-pgml-editor="true"]')

  await expect(popupEditor).toHaveAttribute('data-pgml-editor-language', 'sql')
  await expect.poll(async () => {
    return readPgmlEditorValue(popupEditor)
  }).toBe(`BEGIN
  PERFORM 1;
END;`)
  await expect(popover).not.toContainText('CREATE OR REPLACE FUNCTION public.demo()')
  await expect(popover).not.toContainText('LANGUAGE plpgsql')

  await setPgmlEditorValue(popupEditor, `BEGIN
  PERFORM 2;
END;`)
  await popover.locator('[data-detail-popover-apply-source="true"]').click()

  await expect.poll(async () => {
    return readPgmlEditorValue(mainEditor)
  }).toContain(`source: $sql$
    CREATE OR REPLACE FUNCTION public.demo()
    RETURNS void AS $$
    BEGIN
      PERFORM 2;
    END;
    $$ LANGUAGE plpgsql;
  $sql$`)
})

test('constraint popovers edit a trimmed SQL expression instead of the indented table row', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-entity-row="constraint:chk_orders_total"] button').first().click()

  const popover = page.locator('[data-attachment-popover="constraint:chk_orders_total"]')

  await expect(popover).toBeVisible()
  await expect(popover.locator('[data-detail-popover-edit-source="true"]')).toContainText('Edit SQL')
  await popover.locator('[data-detail-popover-edit-source="true"]').click()

  const popupEditor = popover.locator('[data-detail-popover-source-editor="true"] [data-pgml-editor="true"]')

  await expect(popupEditor).toHaveAttribute('data-pgml-editor-language', 'sql')
  await expect.poll(async () => {
    return readPgmlEditorValue(popupEditor)
  }).toBe('total_cents >= 0')
})

test('index popovers edit inline PGML snippets without full-document top-level errors', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-entity-row="index:idx_products_search"] button').first().click()

  const popover = page.locator('[data-attachment-popover="index:idx_products_search"]')

  await expect(popover).toBeVisible()
  await expect(popover.locator('[data-detail-popover-edit-source="true"]')).toContainText('Edit block')
  await popover.locator('[data-detail-popover-edit-source="true"]').click()

  const popupEditor = popover.locator('[data-detail-popover-source-editor="true"] [data-pgml-editor="true"]')
  const popupEditorScroller = popover.locator('[data-detail-popover-source-editor="true"] [data-pgml-editor-scroller="true"]')

  await expect(popupEditor).toHaveAttribute('data-pgml-editor-language', 'pgml-snippet')
  await expect(popover.locator('[data-detail-popover-source-editor="true"]')).toContainText('PGML snippet highlighting is active without full-document validation.')
  await expect.poll(async () => {
    return readPgmlEditorValue(popupEditor)
  }).toBe('Index idx_products_search (search) [type: gin]')
  await expect.poll(async () => {
    return popupEditorScroller.evaluate(node => getComputedStyle(node).tabSize)
  }).toBe('2')
})
