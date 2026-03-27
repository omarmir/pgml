import { expect, test } from '@nuxt/test-utils/playwright'
import {
  getPgmlEditor,
  readPgmlEditorState,
  readPgmlEditorValue,
  setPgmlEditorScrollTop,
  setPgmlEditorSelection,
  setPgmlEditorValue
} from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('table edit modal can rename a table and add a new grouped table', async ({ goto, page }) => {
  await goto('/diagram')
  const editor = getPgmlEditor(page)

  await page.locator('[data-table-edit-button="public.users"]').click()
  await page.locator('[data-table-editor-name="true"]').fill('accounts')
  await expect(page.locator('[data-table-editor-save="true"]')).toBeVisible()
  await page.locator('[data-table-editor-save="true"]').dispatchEvent('click')

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/TableGroup Core \{\n {2}public\.tenants\n {2}public\.accounts\n {2}public\.roles/)
  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Table public\.accounts in Core \{/)
  await expect(page.locator('[data-pgml-diagnostics="true"]')).toContainText('public.users')

  const renamedSource = (await readPgmlEditorValue(editor)).replaceAll('public.users', 'public.accounts')

  await setPgmlEditorValue(editor, renamedSource)
  await expect(page.locator('[data-pgml-diagnostics="true"]')).toHaveCount(0)

  await page.locator('[data-group-add-table="Core"]').dispatchEvent('click')
  await expect(page.locator('[data-table-editor-name="true"]')).toBeVisible()
  await page.locator('[data-table-editor-name="true"]').fill('audit_log')
  await expect(page.locator('[data-table-editor-save="true"]')).toBeVisible()
  await page.locator('[data-table-editor-save="true"]').dispatchEvent('click')

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Table public\.audit_log in Core \{/)
  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/TableGroup Core \{\n {2}public\.tenants\n {2}public\.accounts\n {2}public\.roles\n {2}public\.audit_log/)
})

test('top-level add table button creates a floating table through the modal', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await page.locator('[data-diagram-create-table="true"]').click()
  await page.locator('[data-table-editor-name="true"]').fill('audit_entries')
  await expect(page.getByLabel('Table group', { exact: true })).toContainText('Ungrouped')
  await page.locator('[data-table-editor-save="true"]').dispatchEvent('click')

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Table public\.audit_entries \{/)
  await expect.poll(async () => readPgmlEditorValue(editor)).not.toContain('\n  public.audit_entries\n')
  await expect(page.locator('[data-node-anchor="public.audit_entries"]')).toBeVisible()
})

test('table editor uses searchable group selection and descriptive type presets', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await page.locator('[data-diagram-create-table="true"]').click()
  await page.locator('[data-table-editor-name="true"]').fill('job_runs')

  const tableGroup = page.getByLabel('Table group', { exact: true })

  await tableGroup.click()
  await page.getByPlaceholder('Search groups').fill('core')
  await page.getByRole('option', { name: /Core/i }).click()

  const firstColumn = page.locator('[data-table-editor-column]').first()
  const columnTypePreset = firstColumn.getByLabel('Column type preset', { exact: true })
  const columnTypeInput = firstColumn.getByLabel('Column type', { exact: true })

  await firstColumn.getByLabel('Column name', { exact: true }).fill('id')
  await columnTypePreset.click()
  await page.getByPlaceholder('Search column types').fill('auto-incrementing large number')
  await page.getByRole('option', { name: /Auto-incrementing large number/i }).click()
  await expect(columnTypeInput).toHaveValue('bigserial')

  await page.locator('[data-table-editor-save="true"]').dispatchEvent('click')

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('Table public.job_runs in Core {')
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('id bigserial')
})

test('group editor can create and rename table groups from the diagram canvas', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await page.locator('[data-diagram-create-group="true"]').click()
  await page.locator('[data-group-editor-name="true"]').fill('Billing')
  await page.locator('[data-group-editor-note="true"]').fill('Invoices and payouts')
  await expect(page.locator('[data-group-editor-save="true"]')).toBeVisible()
  await page.locator('[data-group-editor-save="true"]').dispatchEvent('click')

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/TableGroup Billing \{\n {2}Note: Invoices and payouts\n\}/)
  await expect(page.locator('[data-node-anchor="group:Billing"]')).toBeVisible()

  await page.locator('[data-browser-group-edit="Billing"]').click()
  await page.locator('[data-group-editor-name="true"]').fill('BillingOps')
  await page.locator('[data-group-editor-note="true"]').fill('Revenue operations and settlement.')
  await expect(page.locator('[data-group-editor-save="true"]')).toBeVisible()
  await page.locator('[data-group-editor-save="true"]').dispatchEvent('click')

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/TableGroup BillingOps \{\n {2}Note: Revenue operations and settlement\.\n\}/)
  await expect.poll(async () => readPgmlEditorValue(editor)).not.toMatch(/TableGroup Billing \{/)
  await expect(page.locator('[data-node-anchor="group:BillingOps"]')).toBeVisible()
})

test('group editor can associate and disassociate tables with the searchable selector', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `TableGroup Core {
  public.users
  public.audit_log
}

TableGroup Billing {
}

Table public.users in Core {
  id uuid [pk]
}

Table public.audit_log in Core {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
}`)

  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-group-edit="Core"]').click()

  const groupTables = page.getByLabel('Group tables', { exact: true })

  await groupTables.click()
  await page.getByPlaceholder('Search tables').fill('orders')
  await page.getByRole('option', { name: /public\.orders/i }).click()

  await groupTables.click()
  await page.getByPlaceholder('Search tables').fill('audit_log')
  await page.getByRole('option', { name: /public\.audit_log/i }).click()

  await page.locator('[data-group-editor-save="true"]').dispatchEvent('click')

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain(`TableGroup Core {
  public.users
  public.orders
}`)
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain(`Table public.orders in Core {`)
  await expect.poll(async () => readPgmlEditorValue(editor)).toContain(`Table public.audit_log {`)
})

test('group editor top-aligns the table selector with the first field row', async ({ goto, page }) => {
  await goto('/diagram')

  await page.locator('[data-diagram-create-group="true"]').click()

  const groupNameInput = page.locator('[data-group-editor-name="true"]')
  const groupTablesSelect = page.getByLabel('Group tables', { exact: true })

  await expect(groupNameInput).toBeVisible()
  await expect(groupTablesSelect).toBeVisible()

  const groupNameBox = await groupNameInput.boundingBox()
  const groupTablesBox = await groupTablesSelect.boundingBox()

  if (!groupNameBox || !groupTablesBox) {
    throw new Error('Expected group editor controls to be measurable.')
  }

  expect(Math.abs(groupNameBox.y - groupTablesBox.y)).toBeLessThanOrEqual(6)
})

test('ungrouped tables render as floating nodes instead of an Ungrouped lane', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const baseSource = await readPgmlEditorValue(editor)

  await setPgmlEditorValue(editor, `${baseSource}

Table public.audit_entries {
  id uuid [pk, not null]
  body text
}`)

  await expect(page.locator('[data-node-anchor="group:Ungrouped"]')).toHaveCount(0)
  await expect(page.locator('[data-node-anchor="public.audit_entries"]')).toBeVisible()
  await expect(page.locator('[data-table-anchor="public.audit_entries"]')).toBeVisible()

  await page.locator('[data-diagram-panel-tab="entities"]').click()

  await expect(page.getByText('Ungrouped Tables')).toBeVisible()
  await expect(page.locator('[data-browser-entity-row="public.audit_entries"]')).toBeVisible()
  await expect(page.locator('[data-browser-entity-row="group:Ungrouped"]')).toHaveCount(0)
})

test('floating ungrouped tables grow tall enough to contain all rendered rows', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const baseSource = await readPgmlEditorValue(editor)

  await setPgmlEditorValue(editor, `${baseSource}

Table public.audit_entries {
  id uuid [pk, not null]
  tenant_id uuid [not null]
  actor_id uuid
  event_name text [not null]
  target_type text
  target_id uuid
  payload jsonb
  created_at timestamp [not null]
}`)

  const tableNode = page.locator('[data-node-anchor="public.audit_entries"]')
  const lastRow = page.locator('[data-table-anchor="public.audit_entries"] [data-table-row-anchor="public.audit_entries.created_at"]')

  await expect(tableNode).toBeVisible()
  await expect(lastRow).toBeVisible()

  const tableBox = await tableNode.boundingBox()
  const lastRowBox = await lastRow.boundingBox()

  if (!tableBox || !lastRowBox) {
    throw new Error('Floating ungrouped table is not measurable.')
  }

  expect(lastRowBox.y + lastRowBox.height).toBeLessThanOrEqual(tableBox.y + tableBox.height + 1)
})

test('table edit modal autocompletes default values from the column type', async ({ goto, page }) => {
  await goto('/diagram')

  await page.locator('[data-table-edit-button="public.users"]').click()

  const displayNameColumn = page.locator('[data-table-editor-column]').filter({ hasText: 'display_name' })
  const columnTypeInput = displayNameColumn.getByLabel('Column type', { exact: true })
  const columnDefaultInput = displayNameColumn.getByLabel('Column default', { exact: true })

  await expect(columnDefaultInput).toHaveAttribute('placeholder', '\'\'')
  await columnDefaultInput.click()
  await expect(page.getByText(/^''$/)).toBeVisible()
  await expect(page.getByText(/^'pending'$/)).toBeVisible()

  await columnTypeInput.fill('boolean')
  await columnDefaultInput.click()

  await expect(columnDefaultInput).toHaveAttribute('placeholder', 'false')
  await expect(page.getByText(/^false$/)).toBeVisible()
  await expect(page.getByText(/^true$/)).toBeVisible()
})

test('table edit modal keeps its content mounted until close animation finishes', async ({ goto, page }) => {
  await goto('/diagram')

  await page.locator('[data-table-edit-button="public.users"]').click()
  await expect(page.locator('[data-table-editor-name="true"]')).toBeVisible()

  await page.evaluate(() => {
    const monitor = {
      sawSurfaceWithoutField: false
    }
    const update = () => {
      const surface = document.querySelector('[data-studio-modal-surface="table-editor"]')
      const field = document.querySelector('[data-table-editor-name="true"]')

      if (surface && !field) {
        monitor.sawSurfaceWithoutField = true
      }
    }
    const observer = new MutationObserver(update)

    update()
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true
    })

    ;(window as Window & {
      __tableEditorCloseMonitor?: {
        observer: MutationObserver
        sawSurfaceWithoutField: boolean
        update: () => void
      }
    }).__tableEditorCloseMonitor = {
      observer,
      sawSurfaceWithoutField: monitor.sawSurfaceWithoutField,
      update: () => {
        update()
        ;(window as Window & {
          __tableEditorCloseMonitor?: {
            observer: MutationObserver
            sawSurfaceWithoutField: boolean
            update: () => void
          }
        }).__tableEditorCloseMonitor!.sawSurfaceWithoutField = monitor.sawSurfaceWithoutField
      }
    }
  })

  const tableEditorSurface = page.locator('[data-studio-modal-surface="table-editor"]')

  await tableEditorSurface.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(tableEditorSurface).toHaveCount(0)

  const sawSurfaceWithoutField = await page.evaluate(() => {
    const tableEditorWindow = window as Window & {
      __tableEditorCloseMonitor?: {
        observer: MutationObserver
        sawSurfaceWithoutField: boolean
        update: () => void
      }
    }
    const monitor = tableEditorWindow.__tableEditorCloseMonitor

    if (!monitor) {
      throw new Error('Expected table editor close monitor to exist.')
    }

    monitor.update()
    monitor.observer.disconnect()

    return monitor.sawSurfaceWithoutField
  })

  expect(sawSurfaceWithoutField).toBe(false)
})

test('table edit modal explains relationship direction and uses searchable reference selectors', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await page.locator('[data-table-edit-button="public.users"]').click()

  const roleIdColumn = page.locator('[data-table-editor-column]').filter({ hasText: 'role_id' })
  const relationDirection = roleIdColumn.getByLabel('Relationship direction', { exact: true })
  const relationDirectionSymbol = roleIdColumn.getByLabel('Relationship direction symbol', { exact: true })
  const targetTable = roleIdColumn.getByLabel('Reference target table', { exact: true })
  const targetColumn = roleIdColumn.getByLabel('Reference target column', { exact: true })

  await relationDirection.click()
  await expect(page.getByText('Most foreign keys use this. Example: `tenant_id` points to `tenants.id`.')).toBeVisible()
  await expect(page.getByText('Use this when the other table points back to this column.')).toBeVisible()
  await page.locator('[role="option"]').filter({ hasText: 'This column references the target' }).click()
  await expect(relationDirectionSymbol).toContainText('>')

  await relationDirectionSymbol.click()
  await page.locator('[role="option"]').filter({ hasText: '<' }).click()
  await expect(relationDirection).toContainText('The target references this column')

  await targetTable.click()
  await page.getByPlaceholder('Search tables').fill('roles')
  await page.locator('[role="option"]').filter({ hasText: 'public.roles' }).click()

  await targetColumn.click()
  await page.getByPlaceholder('Search columns').fill('key')
  await page.locator('[role="listbox"]').getByText(/^key$/).click()

  await page.locator('[data-table-editor-save="true"]').dispatchEvent('click')

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/role_id uuid \[not null, ref: < public\.roles\.key\]/)
})

test('table edit modal keeps default reference actions selectable', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const pageErrors: string[] = []

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  customer_id uuid [ref: > public.users.id]
}`)
  await expect(page.locator('[data-pgml-diagnostics="true"]')).toHaveCount(0)

  await page.locator('[data-table-edit-button="public.orders"]').click()

  const customerIdColumn = page.locator('[data-table-editor-column]').filter({ hasText: 'customer_id' })
  const onDelete = customerIdColumn.getByLabel('Reference on delete action', { exact: true })
  const onUpdate = customerIdColumn.getByLabel('Reference on update action', { exact: true })

  await expect(onDelete).toContainText('Default behavior')
  await expect(onUpdate).toContainText('Default behavior')
  expect(pageErrors).toEqual([])

  await onDelete.click()
  await page.locator('[role="option"]').filter({ hasText: 'Cascade' }).click()
  await expect(onDelete).toContainText('Cascade')

  await onDelete.click()
  await page.locator('[role="option"]').filter({ hasText: 'Default behavior' }).click()
  await expect(onDelete).toContainText('Default behavior')

  await onUpdate.click()
  await page.locator('[role="option"]').filter({ hasText: 'Restrict' }).click()
  await expect(onUpdate).toContainText('Restrict')

  await page.locator('[data-table-editor-save="true"]').dispatchEvent('click')

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain('customer_id uuid [ref: > public.users.id, update: restrict]')
  await expect.poll(async () => readPgmlEditorValue(editor)).not.toContain('delete:')
  expect(pageErrors).toEqual([])
})

test('table schema badges stay consistent across groups for the same schema', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `TableGroup Core {
  users
  invoices
}

TableGroup Commerce {
  payouts
}

Table public.users in Core {
  id uuid [pk]
}

Table billing.invoices in Core {
  id uuid [pk]
}

Table billing.payouts in Commerce {
  id uuid [pk]
}`)

  const billingInvoicesBadge = page.locator('[data-table-anchor="billing.invoices"] [data-table-schema-badge]').first()
  const billingPayoutsBadge = page.locator('[data-table-anchor="billing.payouts"] [data-table-schema-badge]').first()
  const publicUsersBadge = page.locator('[data-table-anchor="public.users"] [data-table-schema-badge]').first()

  await expect(billingInvoicesBadge).toBeVisible()
  await expect(billingPayoutsBadge).toBeVisible()
  await expect(publicUsersBadge).toBeVisible()

  const badgeStyles = await page.evaluate(() => {
    const readStyles = (selector: string) => {
      const element = document.querySelector(selector)

      if (!(element instanceof HTMLElement)) {
        return null
      }

      const styles = window.getComputedStyle(element)

      return {
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
        color: styles.color,
        text: element.textContent?.trim() || ''
      }
    }

    return {
      billingInvoices: readStyles('[data-table-anchor="billing.invoices"] [data-table-schema-badge]'),
      billingPayouts: readStyles('[data-table-anchor="billing.payouts"] [data-table-schema-badge]'),
      publicUsers: readStyles('[data-table-anchor="public.users"] [data-table-schema-badge]')
    }
  })

  expect(badgeStyles.billingInvoices?.text).toBe('billing')
  expect(badgeStyles.billingPayouts?.text).toBe('billing')
  expect(badgeStyles.publicUsers?.text).toBe('public')
  expect(badgeStyles.billingInvoices?.backgroundColor).toBe(badgeStyles.billingPayouts?.backgroundColor)
  expect(badgeStyles.billingInvoices?.borderColor).toBe(badgeStyles.billingPayouts?.borderColor)
  expect(badgeStyles.billingInvoices?.color).toBe(badgeStyles.billingPayouts?.color)
  expect(badgeStyles.billingInvoices?.backgroundColor).not.toBe(badgeStyles.publicUsers?.backgroundColor)
})

test('code editor shows PGML diagnostics and autocomplete suggestions', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
  id uuid
  role_id uuid [ref: > public.roles.id]
}`)

  await expect(page.locator('[data-pgml-diagnostics="true"]')).toContainText('Duplicate column')
  await expect(page.locator('[data-pgml-diagnostics="true"]')).toContainText('Reference target table')

  await setPgmlEditorValue(editor, '')
  await setPgmlEditorSelection(editor, 0, 0)
  await page.locator('[data-pgml-editor-content="true"]').click()
  await page.keyboard.press('Control+Space')

  await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible()
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('Table')
})

test('diagnostics panel explains when additional issues are hidden', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const duplicateColumns = Array.from({
    length: 8
  }, () => '  id uuid').join('\n')

  await setPgmlEditorValue(editor, `Table public.users {
  id uuid [pk]
${duplicateColumns}
}`)

  await expect(page.locator('[data-pgml-diagnostics="true"]')).toContainText('Duplicate column')
  await expect(page.locator('[data-pgml-diagnostics-overflow="true"]')).toContainText(/Showing first 6 of \d+ diagnostics\./)
})

test('clicking a diagnostic line focuses and scrolls the editor to that source location', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const repeatedTables = Array.from({
    length: 32
  }, (_, index) => {
    return `Table public.placeholder_${index} {\n  id uuid [pk]\n}`
  }).join('\n\n')

  await setPgmlEditorValue(editor, `${repeatedTables}

Table public.users {
  id uuid [pk]
  id uuid
}`)
  await setPgmlEditorSelection(editor, 0, 0)
  await setPgmlEditorScrollTop(editor, 0)

  await expect(page.locator('[data-pgml-diagnostics="true"]')).toContainText('Duplicate column')
  await page.locator('[data-pgml-diagnostic-line="true"]').first().click()

  await expect.poll(async () => {
    const state = await readPgmlEditorState(editor)

    return {
      anchor: state.anchor,
      head: state.head,
      scrollTop: state.scrollTop,
      selectedText: state.value.slice(state.anchor, state.head)
    }
  }).toEqual({
    anchor: expect.any(Number),
    head: expect.any(Number),
    scrollTop: expect.any(Number),
    selectedText: 'id'
  })

  const state = await readPgmlEditorState(editor)

  expect(state.anchor).toBeGreaterThan(0)
  expect(state.head).toBeGreaterThan(state.anchor)
  expect(state.scrollTop).toBeGreaterThan(0)
})

test('canvas snaps dragged nodes to the grid and zooms around the mouse position', async ({ goto, page }) => {
  await goto('/diagram')

  await expect(page.locator('[data-grid-snap-toggle="true"]')).toHaveAttribute('aria-pressed', 'true')

  const coreHeader = page.locator('[data-node-header="group:Core"]')
  const coreNode = page.locator('[data-node-anchor="group:Core"]')
  const initialPosition = await coreNode.evaluate((element) => {
    return {
      left: Number.parseInt(element.style.left || '0', 10),
      top: Number.parseInt(element.style.top || '0', 10)
    }
  })
  const headerBox = await coreHeader.boundingBox()

  if (!headerBox) {
    throw new Error('Core group header is not measurable.')
  }

  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(headerBox.x + headerBox.width / 2 + 120, headerBox.y + 96, { steps: 8 })
  await page.mouse.up()

  await expect.poll(async () => {
    return coreNode.evaluate((element) => {
      return {
        left: Number.parseInt(element.style.left || '0', 10),
        top: Number.parseInt(element.style.top || '0', 10)
      }
    })
  }).not.toEqual(initialPosition)

  const snappedPosition = await coreNode.evaluate((element) => {
    return {
      left: Number.parseInt(element.style.left || '0', 10),
      top: Number.parseInt(element.style.top || '0', 10)
    }
  })

  expect(snappedPosition.left % 18).toBe(0)
  expect(snappedPosition.top % 18).toBe(0)

  const beforeBox = await coreNode.boundingBox()

  if (!beforeBox) {
    throw new Error('Core group is not measurable before zoom.')
  }

  const zoomPoint = {
    x: beforeBox.x + beforeBox.width * 0.2,
    y: beforeBox.y + beforeBox.height * 0.2
  }
  const localPoint = {
    x: zoomPoint.x - beforeBox.x,
    y: zoomPoint.y - beforeBox.y
  }

  await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.mouse.wheel(0, -180)

  const afterBox = await coreNode.boundingBox()

  if (!afterBox) {
    throw new Error('Core group is not measurable after zoom.')
  }

  const scaleRatio = afterBox.width / beforeBox.width
  const projectedPoint = {
    x: afterBox.x + localPoint.x * scaleRatio,
    y: afterBox.y + localPoint.y * scaleRatio
  }

  expect(Math.abs(projectedPoint.x - zoomPoint.x)).toBeLessThan(8)
  expect(Math.abs(projectedPoint.y - zoomPoint.y)).toBeLessThan(8)
})

test('dragging a grouped table owner settles near the drop point and keeps reference endpoints attached', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `TableGroup Core {
  public.users
}

Table public.users in Core {
  id uuid [pk]
  tenant_id uuid [ref: > public.tenants.id]
}

Table public.tenants {
  id uuid [pk]
}`)

  const groupHeader = page.locator('[data-node-header="group:Core"]')
  const connection = page.locator('[data-connection-key="ref:public.users:tenant_id:public.tenants:id"]').first()

  await expect(groupHeader).toBeVisible()
  await expect(connection).toBeVisible()

  const getConnectionAttachment = () => {
    return page.evaluate(() => {
      const plane = document.querySelector('[data-diagram-plane="true"]')
      const fromTable = document.querySelector('[data-diagram-plane="true"] [data-table-anchor="public.users"]')
      const toTable = document.querySelector('[data-diagram-plane="true"] [data-table-anchor="public.tenants"]')
      const path = document.querySelector('[data-connection-key="ref:public.users:tenant_id:public.tenants:id"]')

      if (
        !(plane instanceof HTMLElement)
        || !(fromTable instanceof HTMLElement)
        || !(toTable instanceof HTMLElement)
        || !(path instanceof SVGPathElement)
      ) {
        return null
      }

      const planeBounds = plane.getBoundingClientRect()
      const scale = planeBounds.width / Math.max(plane.offsetWidth, 1)
      const projectBounds = (element: HTMLElement) => {
        const bounds = element.getBoundingClientRect()

        return {
          label: element.getAttribute('data-table-anchor'),
          left: (bounds.left - planeBounds.left) / scale,
          top: (bounds.top - planeBounds.top) / scale,
          right: (bounds.right - planeBounds.left) / scale,
          bottom: (bounds.bottom - planeBounds.top) / scale
        }
      }
      const hosts = [projectBounds(fromTable), projectBounds(toTable)]
      const points = Array.from((path.getAttribute('d') || '').matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)).map((match) => {
        return {
          x: Number.parseFloat(match[1] || '0'),
          y: Number.parseFloat(match[2] || '0')
        }
      })

      const resolveHost = (point: { x: number, y: number }) => {
        return hosts.find((bounds) => {
          return point.x >= bounds.left - 1
            && point.x <= bounds.right + 1
            && point.y >= bounds.top - 1
            && point.y <= bounds.bottom + 1
            && (
              Math.abs(point.x - bounds.left) < 1
              || Math.abs(point.x - bounds.right) < 1
              || Math.abs(point.y - bounds.top) < 1
              || Math.abs(point.y - bounds.bottom) < 1
            )
        })?.label || null
      }

      const start = points[0]
      const end = points.at(-1)

      if (!start || !end) {
        return null
      }

      return {
        from: resolveHost(start),
        to: resolveHost(end)
      }
    })
  }

  const headerBox = await groupHeader.boundingBox()

  if (!headerBox) {
    throw new Error('Core group header is not measurable.')
  }

  const dragStart = {
    x: headerBox.x + headerBox.width / 2,
    y: headerBox.y + 16
  }
  const dropPoint = {
    x: dragStart.x + 126,
    y: dragStart.y + 78
  }

  await page.mouse.move(dragStart.x, dragStart.y)
  await page.mouse.down()
  await page.mouse.move(dropPoint.x, dropPoint.y, { steps: 10 })

  await expect.poll(getConnectionAttachment).toEqual({
    from: 'public.users',
    to: 'public.tenants'
  })

  await page.mouse.up()

  const droppedBox = await groupHeader.boundingBox()

  if (!droppedBox) {
    throw new Error('Core group header is not measurable immediately after drop.')
  }

  expect(Math.abs((droppedBox.x + droppedBox.width / 2) - dropPoint.x)).toBeLessThanOrEqual(10)
  expect(Math.abs((droppedBox.y + 16) - dropPoint.y)).toBeLessThanOrEqual(10)

  await expect.poll(async () => {
    const settledBox = await groupHeader.boundingBox()

    if (!settledBox) {
      return Number.POSITIVE_INFINITY
    }

    return Math.abs((settledBox.x + settledBox.width / 2) - dropPoint.x)
  }).toBeLessThanOrEqual(10)

  await expect.poll(async () => {
    const settledBox = await groupHeader.boundingBox()

    if (!settledBox) {
      return Number.POSITIVE_INFINITY
    }

    return Math.abs((settledBox.y + 16) - dropPoint.y)
  }).toBeLessThanOrEqual(10)

  await expect.poll(getConnectionAttachment).toEqual({
    from: 'public.users',
    to: 'public.tenants'
  })
})

test('column modifier badges start below the field name to preserve label space', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.related_records {
  id bigint [pk]
}

Table public.audit_entries {
  exceptionally_long_field_name_that_should_stay_visible bigint [not null, ref: > public.related_records.id]
}`)

  const targetRow = page.locator('[data-table-anchor="public.audit_entries"] [data-table-row-anchor="public.audit_entries.exceptionally_long_field_name_that_should_stay_visible"]')

  await expect(targetRow).toBeVisible()

  const layout = await targetRow.evaluate((element) => {
    const row = element as HTMLElement
    const title = row.querySelector('[data-table-row-title]')
    const subtitle = row.querySelector('[data-table-row-subtitle]')
    const badges = Array.from(row.querySelectorAll('[data-table-row-badge]'))

    if (!(title instanceof HTMLElement) || !(subtitle instanceof HTMLElement) || badges.length === 0) {
      return null
    }

    const firstBadge = badges[0]
    const lastBadge = badges.at(-1)

    if (!(firstBadge instanceof HTMLElement) || !(lastBadge instanceof HTMLElement)) {
      return null
    }

    const rowRect = row.getBoundingClientRect()
    const titleRect = title.getBoundingClientRect()
    const subtitleRect = subtitle.getBoundingClientRect()
    const firstBadgeRect = firstBadge.getBoundingClientRect()
    const lastBadgeRect = lastBadge.getBoundingClientRect()

    return {
      badgeTop: firstBadgeRect.top - rowRect.top,
      lastBadgeTop: lastBadgeRect.top - rowRect.top,
      titleBottom: titleRect.bottom - rowRect.top,
      titleWidth: titleRect.width,
      subtitleWidth: subtitleRect.width
    }
  })

  if (!layout) {
    throw new Error('Expected the rendered column row to expose title, subtitle, and modifier badge measurements.')
  }

  expect(layout.badgeTop).toBeGreaterThanOrEqual(layout.titleBottom - 1)
  expect(Math.abs(layout.badgeTop - layout.lastBadgeTop)).toBeLessThanOrEqual(1)
  expect(layout.titleWidth).toBeGreaterThan(layout.subtitleWidth)
})

test('relationship lines can be hidden and restored from the bottom toolbar', async ({ goto, page }) => {
  await goto('/diagram')

  const relationshipLinesToggle = page.locator('[data-relationship-lines-toggle="true"]')
  const connectionPaths = page.locator('[data-connection-layer="true"] path')

  await expect(relationshipLinesToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(connectionPaths.first()).toBeVisible()

  const initialPathCount = await connectionPaths.count()

  expect(initialPathCount).toBeGreaterThan(0)

  await relationshipLinesToggle.click()

  await expect(relationshipLinesToggle).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => page.locator('[data-connection-layer="true"] path').count()).toBe(0)

  await relationshipLinesToggle.click()

  await expect(relationshipLinesToggle).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => page.locator('[data-connection-layer="true"] path').count()).toBe(initialPathCount)
})

test('connection routing stays stable when zoom changes', async ({ goto, page }) => {
  await goto('/diagram')

  const getConnectionPaths = () => {
    return page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-connection-layer="true"] path'))
        .map(path => path.getAttribute('d') || '')
        .filter(path => path.length > 0)
    })
  }

  await expect(page.locator('[data-connection-layer="true"] path').first()).toBeVisible()

  const viewport = page.locator('[data-diagram-viewport="true"]')
  const viewportBox = await viewport.boundingBox()

  if (!viewportBox) {
    throw new Error('Diagram viewport is not measurable.')
  }

  const zoomPoint = {
    x: viewportBox.x + viewportBox.width * 0.65,
    y: viewportBox.y + viewportBox.height * 0.35
  }

  const beforeZoomPaths = await getConnectionPaths()

  await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.mouse.wheel(0, -180)

  await expect.poll(getConnectionPaths).toEqual(beforeZoomPaths)

  await page.mouse.wheel(0, 180)

  await expect.poll(getConnectionPaths).toEqual(beforeZoomPaths)
})

test('canvas interactions keep the PGML editor source in sync', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const coreGroup = page.locator('[data-node-anchor="group:Core"]')

  await coreGroup.dispatchEvent('click')
  await expect(page.locator('input[type="color"]')).toBeVisible()
  await page.locator('input[type="color"]').fill('#14b8a6')

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Properties "group:Core" \{[\s\S]*color: #14b8a6/)

  const columnSlider = page.locator('[data-group-column-count-slider="true"]')

  await columnSlider.evaluate((element: HTMLInputElement) => {
    element.value = '2'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Properties "group:Core" \{[\s\S]*table_columns: 2/)

  const groupedTables = [
    page.locator('[data-node-anchor="group:Core"] [data-table-anchor="public.tenants"]'),
    page.locator('[data-node-anchor="group:Core"] [data-table-anchor="public.users"]')
  ]
  const getGroupedTableWidths = async () => {
    return Promise.all(groupedTables.map((table) => {
      return table.evaluate(element => Math.round(element.getBoundingClientRect().width))
    }))
  }
  const [tenantsWidthBefore, usersWidthBefore] = await getGroupedTableWidths()

  await page.getByLabel('Table width scale', { exact: true }).click()
  await page.getByRole('option', { name: '1.5x' }).click()

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Properties "group:Core" \{[\s\S]*table_width_scale: 1.5/)
  await expect.poll(async () => (await getGroupedTableWidths())[0]).toBeGreaterThan(tenantsWidthBefore)
  await expect.poll(async () => (await getGroupedTableWidths())[1]).toBeGreaterThan(usersWidthBefore)

  const [tenantsWidthAfter, usersWidthAfter] = await getGroupedTableWidths()

  expect(tenantsWidthAfter).toBe(usersWidthAfter)

  const masonrySwitch = page.getByRole('switch', { name: 'Masonry' })

  await masonrySwitch.click()
  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Properties "group:Core" \{[\s\S]*masonry: true/)

  await masonrySwitch.click()
  await expect.poll(async () => readPgmlEditorValue(editor)).not.toContain('masonry: true')

  const coreHeader = page.locator('[data-node-header="group:Core"]')
  const headerBox = await coreHeader.boundingBox()

  if (!headerBox) {
    throw new Error('Core group header is not measurable.')
  }

  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(headerBox.x + headerBox.width / 2 + 55, headerBox.y + 53)
  await page.mouse.up()

  const groupPosition = await coreGroup.evaluate((element) => {
    return {
      x: Number.parseInt(element.style.left || '0', 10),
      y: Number.parseInt(element.style.top || '0', 10)
    }
  })

  await expect.poll(async () => readPgmlEditorValue(editor)).toContain(`Properties "group:Core" {\n  x: ${groupPosition.x}\n  y: ${groupPosition.y}`)

  const customTypeNode = page.locator('[data-node-anchor="custom-type:Domain:email_address"]')
  const customTypeHeader = page.locator('[data-node-header="custom-type:Domain:email_address"]')

  await page.getByRole('button', { name: 'Expand email_address' }).click()

  const customTypeHeaderBox = await customTypeHeader.boundingBox()

  if (!customTypeHeaderBox) {
    throw new Error('Custom type header is not measurable.')
  }

  await page.mouse.move(customTypeHeaderBox.x + customTypeHeaderBox.width / 2, customTypeHeaderBox.y + 16)
  await page.mouse.down()
  await page.mouse.move(customTypeHeaderBox.x + customTypeHeaderBox.width / 2 + 52, customTypeHeaderBox.y + 64)
  await page.mouse.up()

  const customTypePosition = await customTypeNode.evaluate((element) => {
    return {
      x: Number.parseInt(element.style.left || '0', 10),
      y: Number.parseInt(element.style.top || '0', 10)
    }
  })

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(new RegExp(`Properties "custom-type:Domain:email_address" \\{[\\s\\S]*x: ${customTypePosition.x}[\\s\\S]*y: ${customTypePosition.y}[\\s\\S]*collapsed: false`))
})

test('side panel can switch tabs, hide entities, and restore them from saved properties', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const panel = page.locator('[data-diagram-panel="true"]')
  const panelToggle = page.locator('[data-diagram-panel-toggle="true"]')

  await expect(panel).toBeVisible()
  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-entity-search="true"]').fill('display_name')
  await expect(page.locator('[data-browser-entity-row="group:Core"]')).toBeVisible()
  await expect(page.locator('[data-browser-entity-row="public.users"]')).toBeVisible()
  await expect(page.locator('[data-browser-entity-row="public.users.display_name"]')).toBeVisible()
  await expect(page.locator('[data-browser-entity-row="public.users.email"]')).toBeVisible()

  await page.locator('[data-entity-search="true"]').fill('roles')
  await expect(page.locator('[data-browser-entity-row="group:Core"]')).toBeVisible()
  await expect(page.locator('[data-browser-entity-row="public.roles"]')).toBeVisible()

  await page.locator('[data-entity-search="true"]').fill('Core')
  await expect(page.locator('[data-browser-entity-row="group:Core"]')).toBeVisible()
  await expect(page.locator('[data-browser-entity-row="public.roles"]')).toHaveCount(0)

  const panelOverflow = await panel.evaluate((element) => {
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth
    }
  })

  expect(panelOverflow.scrollWidth).toBeLessThanOrEqual(panelOverflow.clientWidth + 1)

  await page.locator('[data-entity-search="true"]').fill('email')

  await expect(page.locator('[data-browser-entity-row="public.users"]')).not.toHaveAttribute('data-browser-search-match', 'true')
  await expect(page.locator('[data-browser-entity-row="public.users.email"]')).toHaveAttribute('data-browser-search-match', 'true')
  await expect(page.locator('[data-browser-entity-row="custom-type:Domain:email_address"]')).toHaveAttribute('data-browser-search-match', 'true')
  await expect(page.locator('[data-browser-entity-row="public.users.email"]')).toHaveAttribute('style', /--pgml-browser-match-color:/)
  await expect(page.locator('[data-browser-entity-row="custom-type:Domain:email_address"]')).toHaveAttribute('style', /--pgml-browser-match-color:/)

  const groupBox = await page.locator('[data-browser-entity-row="group:Core"]').boundingBox()
  const tableBox = await page.locator('[data-browser-entity-row="public.users"]').boundingBox()
  const fieldBox = await page.locator('[data-browser-entity-row="public.users.email"]').boundingBox()

  if (!groupBox || !tableBox || !fieldBox) {
    throw new Error('Expected filtered entity rows to be measurable.')
  }

  expect(tableBox.y - groupBox.y).toBeLessThan(120)
  expect(fieldBox.y - tableBox.y).toBeLessThan(180)

  await page.locator('[data-entity-search="true"]').fill('users')
  await page.locator('[data-browser-visibility-toggle="public.users"]').click()

  await expect(page.locator('[data-table-anchor="public.users"]')).toHaveCount(0)
  await expect(page.locator('[data-connection-key="ref:public.orders:customer_id:public.users:id"]')).toHaveCount(0)
  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/Properties "public\.users" \{[\s\S]*visible: false/)

  const tenantsTable = page.locator('[data-table-anchor="public.tenants"]')
  const beforeToggleBox = await tenantsTable.boundingBox()

  if (!beforeToggleBox) {
    throw new Error('Tenants table is not measurable before panel toggle.')
  }

  await panelToggle.click()
  await expect(panel).toHaveCount(0)
  await panelToggle.click()
  await expect(panel).toBeVisible()

  const afterToggleBox = await tenantsTable.boundingBox()

  if (!afterToggleBox) {
    throw new Error('Tenants table is not measurable after panel toggle.')
  }

  expect(Math.abs(afterToggleBox.x - beforeToggleBox.x)).toBeLessThan(1)
  expect(Math.abs(afterToggleBox.y - beforeToggleBox.y)).toBeLessThan(1)

  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-visibility-toggle="public.users"]').click()

  await expect(page.locator('[data-table-anchor="public.users"]')).toBeVisible()
  await expect.poll(async () => readPgmlEditorValue(editor)).not.toContain('Properties "public.users" {\n  visible: false')
})

test('entity panel clicks select groups, tables, and fields while raising the active host group', async ({ goto, page }) => {
  await goto('/diagram')

  const isNodeAtTopOfStack = async (nodeId: string) => {
    return page.evaluate((targetNodeId) => {
      const target = document.querySelector(`[data-node-anchor="${targetNodeId}"]`)

      if (!(target instanceof HTMLElement)) {
        return false
      }

      const getNodeZIndex = (element: HTMLElement) => {
        const zIndex = Number.parseInt(getComputedStyle(element).zIndex || '0', 10)

        return Number.isFinite(zIndex) ? zIndex : 0
      }

      const targetZIndex = getNodeZIndex(target)
      const maxZIndex = Array.from(document.querySelectorAll('[data-node-anchor]')).reduce((max, entry) => {
        if (!(entry instanceof HTMLElement)) {
          return max
        }

        return Math.max(max, getNodeZIndex(entry))
      }, 0)

      return targetZIndex > 0 && targetZIndex === maxZIndex
    }, nodeId)
  }

  await page.locator('[data-diagram-panel-tab="entities"]').click()

  await page.locator('[data-browser-entity-row="group:Core"] button').first().click()
  await expect(page.locator('[data-node-anchor="group:Core"]')).toHaveAttribute('data-selection-active', 'true')
  await expect.poll(async () => isNodeAtTopOfStack('group:Core')).toBe(true)

  await page.locator('[data-browser-entity-row="public.orders"] button').first().click()
  await expect(page.locator('[data-node-anchor="group:Commerce"] [data-table-anchor="public.orders"]')).toHaveAttribute('data-selection-active', 'true')
  await expect(page.locator('[data-node-anchor="group:Core"]')).not.toHaveAttribute('data-selection-active', 'true')
  await expect.poll(async () => isNodeAtTopOfStack('group:Commerce')).toBe(true)

  await page.locator('[data-browser-entity-row="public.users.email"] button').first().click()
  await expect(page.locator('[data-column-anchor="public.users.email"]')).toHaveAttribute('data-selection-active', 'true')
  await expect(page.locator('[data-node-anchor="group:Commerce"] [data-table-anchor="public.orders"]')).not.toHaveAttribute('data-selection-active', 'true')
  await expect.poll(async () => isNodeAtTopOfStack('group:Core')).toBe(true)
})

test('scrolling inside the diagram panel scrolls the panel instead of the canvas', async ({ goto, page }) => {
  await goto('/diagram')

  await page.locator('[data-diagram-panel-tab="entities"]').click()

  const panelScroll = page.locator('[data-diagram-panel-scroll="true"]')
  const tenantsTable = page.locator('[data-table-anchor="public.tenants"]')
  const beforeTableBox = await tenantsTable.boundingBox()

  if (!beforeTableBox) {
    throw new Error('Tenants table is not measurable before panel scroll.')
  }

  const initialScrollTop = await panelScroll.evaluate(element => element.scrollTop)

  await panelScroll.hover()
  await page.mouse.wheel(0, 480)

  await expect.poll(async () => {
    return panelScroll.evaluate(element => element.scrollTop)
  }).toBeGreaterThan(initialScrollTop)

  const afterTableBox = await tenantsTable.boundingBox()

  if (!afterTableBox) {
    throw new Error('Tenants table is not measurable after panel scroll.')
  }

  expect(Math.abs(afterTableBox.x - beforeTableBox.x)).toBeLessThan(1)
  expect(Math.abs(afterTableBox.y - beforeTableBox.y)).toBeLessThan(1)
})

test('double clicking entity panel items focuses the matching PGML source block', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const readEditorState = async () => {
    const state = await readPgmlEditorState(editor)

    return {
      scrollTop: state.scrollTop,
      selectedText: state.value.slice(
        Math.min(state.anchor, state.head),
        Math.max(state.anchor, state.head)
      )
    }
  }
  const resetEditorState = async () => {
    await setPgmlEditorScrollTop(editor, 0)
    await setPgmlEditorSelection(editor, 0, 0)
  }

  await page.locator('[data-diagram-panel-tab="entities"]').click()

  await resetEditorState()
  await page.locator('[data-browser-entity-row="group:Core"] button').first().dblclick()
  await expect.poll(async () => {
    return readEditorState()
  }).toEqual(expect.objectContaining({
    scrollTop: expect.any(Number),
    selectedText: expect.stringContaining('TableGroup Core {')
  }))

  await resetEditorState()
  await page.locator('[data-entity-search="true"]').fill('email')
  await page.locator('[data-browser-entity-row="public.users.email"] button').first().dblclick()
  await expect.poll(async () => {
    return readEditorState()
  }).toEqual(expect.objectContaining({
    scrollTop: expect.any(Number),
    selectedText: expect.stringContaining('Table public.users {')
  }))
  await expect.poll(async () => {
    return readEditorState()
  }).toEqual(expect.objectContaining({
    selectedText: expect.stringContaining('email email_address')
  }))

  await resetEditorState()
  await page.locator('[data-browser-entity-row="custom-type:Domain:email_address"] button').first().dblclick()
  await expect.poll(async () => {
    return readEditorState()
  }).toEqual(expect.objectContaining({
    scrollTop: expect.any(Number),
    selectedText: expect.stringContaining('Domain email_address {')
  }))
})

test('dragging a group or custom type preserves the current zoom and pan', async ({ goto, page }) => {
  await goto('/diagram')

  await page.getByRole('button', { name: 'Expand email_address' }).click()

  const plane = page.locator('[data-diagram-plane="true"]')
  const viewport = page.locator('[data-diagram-viewport="true"]')
  const viewportBox = await viewport.boundingBox()

  if (!viewportBox) {
    throw new Error('Diagram viewport is not measurable.')
  }

  const zoomPoint = {
    x: viewportBox.x + viewportBox.width * 0.5,
    y: viewportBox.y + viewportBox.height * 0.35
  }

  const viewportStateBeforeZoom = await plane.evaluate((element) => {
    const planeElement = element as HTMLElement

    return {
      panX: planeElement.style.getPropertyValue('--pgml-plane-pan-x'),
      panY: planeElement.style.getPropertyValue('--pgml-plane-pan-y'),
      scale: planeElement.style.getPropertyValue('--pgml-plane-scale')
    }
  })

  await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.mouse.wheel(0, -180)

  await expect.poll(async () => {
    return plane.evaluate((element) => {
      const planeElement = element as HTMLElement

      return {
        panX: planeElement.style.getPropertyValue('--pgml-plane-pan-x'),
        panY: planeElement.style.getPropertyValue('--pgml-plane-pan-y'),
        scale: planeElement.style.getPropertyValue('--pgml-plane-scale')
      }
    })
  }).not.toEqual(viewportStateBeforeZoom)

  const connectionPathCount = await page.locator('[data-connection-layer="true"] path').count()
  const zoomedViewportState = await plane.evaluate((element) => {
    const planeElement = element as HTMLElement

    return {
      panX: planeElement.style.getPropertyValue('--pgml-plane-pan-x'),
      panY: planeElement.style.getPropertyValue('--pgml-plane-pan-y'),
      scale: planeElement.style.getPropertyValue('--pgml-plane-scale')
    }
  })

  const dragNodeBy = async (nodeId: string, deltaX: number, deltaY: number) => {
    const header = page.locator(`[data-node-header="${nodeId}"]`)
    const headerBox = await header.boundingBox()

    if (!headerBox) {
      throw new Error(`Node header is not measurable for ${nodeId}.`)
    }

    await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + 16)
    await page.mouse.down()
    await page.mouse.move(headerBox.x + headerBox.width / 2 + deltaX, headerBox.y + 16 + deltaY, { steps: 8 })
    await expect.poll(async () => page.locator('[data-connection-layer="true"] path').count()).toBe(connectionPathCount)
    await page.mouse.up()
  }

  await dragNodeBy('group:Core', 54, 36)

  await expect.poll(async () => {
    return plane.evaluate((element) => {
      const planeElement = element as HTMLElement

      return {
        panX: planeElement.style.getPropertyValue('--pgml-plane-pan-x'),
        panY: planeElement.style.getPropertyValue('--pgml-plane-pan-y'),
        scale: planeElement.style.getPropertyValue('--pgml-plane-scale')
      }
    })
  }).toEqual(zoomedViewportState)

  await expect.poll(async () => page.locator('[data-connection-layer="true"] path').count()).toBe(connectionPathCount)

  await dragNodeBy('custom-type:Domain:email_address', 48, 42)

  await expect.poll(async () => {
    return plane.evaluate((element) => {
      const planeElement = element as HTMLElement

      return {
        panX: planeElement.style.getPropertyValue('--pgml-plane-pan-x'),
        panY: planeElement.style.getPropertyValue('--pgml-plane-pan-y'),
        scale: planeElement.style.getPropertyValue('--pgml-plane-scale')
      }
    })
  }).toEqual(zoomedViewportState)

  await expect.poll(async () => page.locator('[data-connection-layer="true"] path').count()).toBe(connectionPathCount)
})

test('editing PGML preserves the current canvas viewport', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const plane = page.locator('[data-diagram-plane="true"]')
  const viewport = page.locator('[data-diagram-viewport="true"]')
  const viewportBox = await viewport.boundingBox()

  if (!viewportBox) {
    throw new Error('Diagram viewport is not measurable.')
  }

  const panStart = {
    x: viewportBox.x + viewportBox.width * 0.88,
    y: viewportBox.y + viewportBox.height * 0.82
  }

  await page.mouse.move(panStart.x, panStart.y)
  await page.mouse.down()
  await page.mouse.move(panStart.x - 140, panStart.y - 96, { steps: 10 })
  await page.mouse.up()

  const zoomPoint = {
    x: viewportBox.x + viewportBox.width * 0.62,
    y: viewportBox.y + viewportBox.height * 0.36
  }

  const viewportStateBeforeZoom = await plane.evaluate((element) => {
    const planeElement = element as HTMLElement

    return {
      panX: planeElement.style.getPropertyValue('--pgml-plane-pan-x'),
      panY: planeElement.style.getPropertyValue('--pgml-plane-pan-y'),
      scale: planeElement.style.getPropertyValue('--pgml-plane-scale')
    }
  })

  await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.mouse.wheel(0, -180)

  await expect.poll(async () => {
    return plane.evaluate((element) => {
      const planeElement = element as HTMLElement

      return {
        panX: planeElement.style.getPropertyValue('--pgml-plane-pan-x'),
        panY: planeElement.style.getPropertyValue('--pgml-plane-pan-y'),
        scale: planeElement.style.getPropertyValue('--pgml-plane-scale')
      }
    })
  }).not.toEqual(viewportStateBeforeZoom)

  const viewportStateBeforeEdit = await plane.evaluate((element) => {
    const planeElement = element as HTMLElement

    return {
      panX: planeElement.style.getPropertyValue('--pgml-plane-pan-x'),
      panY: planeElement.style.getPropertyValue('--pgml-plane-pan-y'),
      scale: planeElement.style.getPropertyValue('--pgml-plane-scale')
    }
  })

  const source = await readPgmlEditorValue(editor)
  await setPgmlEditorValue(editor, source.replace(
    '  total_cents integer [not null]',
    '  total_cents integer [not null]\n  currency_code text'
  ))

  await expect.poll(async () => {
    return plane.evaluate((element) => {
      const planeElement = element as HTMLElement

      return {
        panX: planeElement.style.getPropertyValue('--pgml-plane-pan-x'),
        panY: planeElement.style.getPropertyValue('--pgml-plane-pan-y'),
        scale: planeElement.style.getPropertyValue('--pgml-plane-scale')
      }
    })
  }).toEqual(viewportStateBeforeEdit)
})
