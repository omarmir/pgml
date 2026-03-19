import { expect, test } from '@nuxt/test-utils/playwright'

test.setTimeout(120_000)

test('studio attaches table-scoped rows to tables and still lets floating nodes expand from the node header', async ({ goto, page }) => {
  await goto('/diagram')

  await expect(page.locator('[data-group-content="group:Core"]')).toBeVisible()
  await expect(page.locator('[data-node-anchor="index:idx_products_search"]')).toHaveCount(0)
  await expect(page.locator('[data-node-anchor="function:register_entity"]')).toHaveCount(0)
  await expect(page.locator('[data-node-anchor="procedure:archive_orders"]')).toHaveCount(0)
  await expect(page.locator('[data-node-anchor="trigger:trg_register_fundingopportunity"]')).toHaveCount(0)
  await expect(page.locator('[data-node-anchor="sequence:order_number_seq"]')).toHaveCount(0)
  await expect(page.locator('[data-node-anchor="constraint:chk_orders_total"]')).toHaveCount(0)
  await expect(page.locator('[data-attachment-row="index:idx_products_search"]')).toBeVisible()
  await expect(page.locator('[data-attachment-row="function:register_entity"]')).toContainText('TRIGGER')
  await expect(page.locator('[data-attachment-row="procedure:archive_orders"]')).toHaveCount(2)
  await expect(page.locator('[data-attachment-row="trigger:trg_register_fundingopportunity"]')).toBeVisible()
  await expect(page.locator('[data-attachment-row="sequence:order_number_seq"]')).toBeVisible()
  await expect(page.locator('[data-attachment-row="constraint:chk_orders_total"]')).toBeVisible()

  await page.locator('[data-attachment-row="index:idx_products_search"]').click()
  await expect(page.locator('[data-attachment-popover="index:idx_products_search"]')).toContainText('Columns: search')
  await page.locator('[data-table-anchor="public.orders"] [data-attachment-row="procedure:archive_orders"]').click()
  await expect(page.locator('[data-attachment-popover="procedure:archive_orders"]')).toContainText('writes: public.orders_archive, public.order_item_archive')
  await page.locator('[data-attachment-row="trigger:trg_register_fundingopportunity"]').click()
  await expect(page.locator('[data-attachment-popover="trigger:trg_register_fundingopportunity"]')).toContainText('Registers a Common_Entity id')
  await page.locator('[data-attachment-row="constraint:chk_orders_total"]').click()
  await expect(page.locator('[data-attachment-popover="constraint:chk_orders_total"]')).toContainText('total_cents >= 0')

  const customTypeNode = page.locator('[data-node-anchor="custom-type:Domain:email_address"]')
  const initialHeight = await customTypeNode.evaluate((element) => {
    return Math.round(element.offsetHeight)
  })

  await page.getByRole('button', { name: 'Expand email_address' }).click()
  await expect(page.locator('[data-node-body="custom-type:Domain:email_address"]')).toBeVisible()

  const expandedHeight = await customTypeNode.evaluate((element) => {
    return Math.round(element.offsetHeight)
  })

  expect(expandedHeight).toBeGreaterThan(initialHeight + 40)

  await page.getByRole('button', { name: 'Collapse email_address' }).click()
  await expect(page.locator('[data-node-body="custom-type:Domain:email_address"]')).toHaveCount(0)

  const collapsedHeight = await customTypeNode.evaluate((element) => {
    return Math.round(element.offsetHeight)
  })

  expect(collapsedHeight).toBeLessThan(expandedHeight)
})

test('studio only scrolls the editor on double click for floating cards, grouped tables, and attachment rows', async ({ goto, page }) => {
  await goto('/diagram')

  const filler = Array.from({ length: 80 }, (_, index) => `// filler ${index + 1}`).join('\n')
  const source = `${filler}

TableGroup Core {
  orders
}

Domain email_address {
  base: text
  check: VALUE <> ''
}

Table orders in Core {
  id integer [pk]
  total_cents integer
  Index idx_orders_total (total_cents)
}

Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}`
  const editor = page.locator('[data-pgml-editor="true"]')
  const readEditorState = async () => {
    return editor.evaluate((element: HTMLTextAreaElement) => {
      return {
        scrollTop: element.scrollTop,
        selectedText: element.value.slice(element.selectionStart, element.selectionEnd)
      }
    })
  }
  const resetEditorState = async () => {
    await editor.evaluate((element: HTMLTextAreaElement) => {
      element.scrollTop = 0
      element.setSelectionRange(0, 0)
    })
  }

  await editor.fill(source)
  await expect(page.locator('[data-node-anchor="function:orphan_report"]')).toBeVisible()
  await expect(page.locator('[data-node-anchor="custom-type:Domain:email_address"]')).toBeVisible()
  await expect(page.locator('[data-table-anchor="public.orders"]')).toBeVisible()
  await expect(page.locator('[data-attachment-row="index:idx_orders_total"]')).toBeVisible()

  await resetEditorState()
  await page.locator('[data-node-anchor="custom-type:Domain:email_address"]').click()
  await expect.poll(async () => {
    return (await readEditorState()).selectedText
  }).toBe('')

  await page.locator('[data-node-anchor="custom-type:Domain:email_address"]').dblclick()
  await expect.poll(async () => {
    return readEditorState()
  }).toEqual(expect.objectContaining({
    scrollTop: expect.any(Number),
    selectedText: expect.stringContaining('Domain email_address')
  }))

  await expect.poll(async () => {
    return editor.evaluate((element: HTMLTextAreaElement) => element.scrollTop)
  }).toBeGreaterThan(0)

  await resetEditorState()
  await page.locator('[data-node-anchor="function:orphan_report"]').click()
  await expect.poll(async () => {
    return (await readEditorState()).selectedText
  }).toBe('')

  await page.locator('[data-node-anchor="function:orphan_report"]').dblclick()
  await expect.poll(async () => {
    return readEditorState()
  }).toEqual(expect.objectContaining({
    scrollTop: expect.any(Number),
    selectedText: `Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}`
  }))

  await expect.poll(async () => {
    return editor.evaluate((element: HTMLTextAreaElement) => element.scrollTop)
  }).toBeGreaterThan(0)

  await resetEditorState()
  await page.locator('[data-table-anchor="public.orders"]').click()
  await expect.poll(async () => {
    return (await readEditorState()).selectedText
  }).toBe('')

  await page.locator('[data-table-anchor="public.orders"]').dblclick()
  await expect.poll(async () => {
    return readEditorState()
  }).toEqual(expect.objectContaining({
    scrollTop: expect.any(Number),
    selectedText: `Table orders in Core {
  id integer [pk]
  total_cents integer
  Index idx_orders_total (total_cents)
}`
  }))

  await expect.poll(async () => {
    return editor.evaluate((element: HTMLTextAreaElement) => element.scrollTop)
  }).toBeGreaterThan(0)

  await resetEditorState()
  await page.locator('[data-attachment-row="index:idx_orders_total"]').click()
  await expect.poll(async () => {
    return (await readEditorState()).selectedText
  }).toBe('')

  await page.locator('[data-attachment-row="index:idx_orders_total"]').dblclick()
  await expect.poll(async () => {
    return readEditorState()
  }).toEqual(expect.objectContaining({
    scrollTop: expect.any(Number),
    selectedText: expect.stringContaining('Index idx_orders_total (total_cents)')
  }))

  await expect.poll(async () => {
    return editor.evaluate((element: HTMLTextAreaElement) => element.scrollTop)
  }).toBeGreaterThan(0)
})

test('single click applies a pulsing selection glow to schema objects, grouped tables, and attachment rows', async ({ goto, page }) => {
  await goto('/diagram')

  const customTypeNode = page.locator('[data-node-anchor="custom-type:Domain:email_address"]')
  const ordersTable = page.locator('[data-table-anchor="public.orders"]')
  const ordersConstraint = page.locator('[data-table-anchor="public.orders"] [data-attachment-row="constraint:chk_orders_total"]')

  await customTypeNode.click()

  await expect(customTypeNode).toHaveAttribute('data-selection-active', 'true')
  await expect.poll(async () => {
    return customTypeNode.evaluate((element) => {
      const styles = getComputedStyle(element as HTMLElement)

      return {
        animationName: styles.animationName.includes('pgml-selection-pulse'),
        selectionColor: styles.getPropertyValue('--pgml-selection-color').trim()
      }
    })
  }).toEqual({
    animationName: true,
    selectionColor: '#14b8a6'
  })

  await ordersTable.click()

  await expect(ordersTable).toHaveAttribute('data-selection-active', 'true')
  await expect(customTypeNode).not.toHaveAttribute('data-selection-active', 'true')
  await expect.poll(async () => {
    return ordersTable.evaluate((element) => {
      const styles = getComputedStyle(element as HTMLElement)

      return {
        animationName: styles.animationName.includes('pgml-selection-pulse'),
        selectionColor: styles.getPropertyValue('--pgml-selection-color').trim().length > 0
      }
    })
  }).toEqual({
    animationName: true,
    selectionColor: true
  })

  await ordersConstraint.click()

  await expect(ordersConstraint).toHaveAttribute('data-selection-active', 'true')
  await expect(ordersTable).not.toHaveAttribute('data-selection-active', 'true')
  await expect.poll(async () => {
    return ordersConstraint.evaluate((element) => {
      const styles = getComputedStyle(element as HTMLElement)

      return {
        animationName: styles.animationName.includes('pgml-selection-pulse'),
        selectionColor: styles.getPropertyValue('--pgml-selection-color').trim()
      }
    })
  }).toEqual({
    animationName: true,
    selectionColor: '#fb7185'
  })
})
