import { expect, test } from '@nuxt/test-utils/playwright'
import {
  getPgmlEditor,
  readPgmlEditorState,
  readPgmlEditorValue,
  setPgmlEditorScrollTop,
  setPgmlEditorSelection,
  setPgmlEditorValue
} from './helpers/pgml-editor'

test.setTimeout(120_000)

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

test('table edit modal explains relationship direction and uses searchable reference selectors', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await page.locator('[data-table-edit-button="public.users"]').click()

  const roleIdColumn = page.locator('[data-table-editor-column]').filter({ hasText: 'role_id' })
  const relationDirection = roleIdColumn.getByLabel('Relationship direction', { exact: true })
  const targetTable = roleIdColumn.getByLabel('Reference target table', { exact: true })
  const targetColumn = roleIdColumn.getByLabel('Reference target column', { exact: true })

  await relationDirection.click()
  await expect(page.getByText('Most foreign keys use this. Example: `tenant_id` points to `tenants.id`.')).toBeVisible()
  await expect(page.getByText('Use this when the other table points back to this column.')).toBeVisible()
  await page.locator('[role="option"]').filter({ hasText: 'The target references this column' }).click()

  await targetTable.click()
  await page.getByPlaceholder('Search tables').fill('roles')
  await page.locator('[role="option"]').filter({ hasText: 'public.roles' }).click()

  await targetColumn.click()
  await page.getByPlaceholder('Search columns').fill('key')
  await page.locator('[role="listbox"]').getByText(/^key$/).click()

  await page.locator('[data-table-editor-save="true"]').dispatchEvent('click')

  await expect.poll(async () => readPgmlEditorValue(editor)).toMatch(/role_id uuid \[not null, ref: < public\.roles\.key\]/)
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

  await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.mouse.wheel(0, -180)

  const zoomedTransform = await plane.evaluate((element) => {
    return (element as HTMLElement).style.transform
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
    await page.mouse.up()
  }

  await dragNodeBy('group:Core', 54, 36)

  await expect.poll(async () => {
    return plane.evaluate((element) => {
      return (element as HTMLElement).style.transform
    })
  }).toBe(zoomedTransform)

  await dragNodeBy('custom-type:Domain:email_address', 48, 42)

  await expect.poll(async () => {
    return plane.evaluate((element) => {
      return (element as HTMLElement).style.transform
    })
  }).toBe(zoomedTransform)
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

  await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.mouse.wheel(0, -180)

  const viewportTransformBeforeEdit = await plane.evaluate((element) => {
    return (element as HTMLElement).style.transform
  })

  const source = await readPgmlEditorValue(editor)
  await setPgmlEditorValue(editor, source.replace(
    '  total_cents integer [not null]',
    '  total_cents integer [not null]\n  currency_code text'
  ))

  await expect.poll(async () => {
    return plane.evaluate((element) => {
      return (element as HTMLElement).style.transform
    })
  }).toBe(viewportTransformBeforeEdit)
})
