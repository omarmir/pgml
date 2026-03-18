import { expect, test } from '@nuxt/test-utils/playwright'

test.setTimeout(120_000)

test('studio attaches operational rows to tables and still lets floating nodes expand from the node header', async ({ goto, page }) => {
  await goto('/diagram')

  await expect(page.locator('[data-group-content="group:Core"]')).toBeVisible()
  await expect(page.locator('[data-node-anchor="function:register_entity"]')).toHaveCount(0)
  await expect(page.locator('[data-node-anchor="trigger:trg_register_fundingopportunity"]')).toHaveCount(0)
  await expect(page.locator('[data-node-anchor="sequence:order_number_seq"]')).toHaveCount(0)
  await expect(page.locator('[data-node-anchor="constraint:chk_orders_total"]')).toHaveCount(0)
  await expect(page.locator('[data-attachment-row="function:register_entity"]')).toContainText('TRIGGER')
  await expect(page.locator('[data-attachment-row="trigger:trg_register_fundingopportunity"]')).toBeVisible()
  await expect(page.locator('[data-attachment-row="sequence:order_number_seq"]')).toBeVisible()
  await expect(page.locator('[data-attachment-row="constraint:chk_orders_total"]')).toBeVisible()
  await expect(page.locator('[data-node-body="index:idx_products_search"]')).toHaveCount(0)

  await page.locator('[data-attachment-row="trigger:trg_register_fundingopportunity"]').click()
  await expect(page.locator('[data-attachment-popover="trigger:trg_register_fundingopportunity"]')).toContainText('Registers a Common_Entity id')
  await page.locator('[data-attachment-row="constraint:chk_orders_total"]').click()
  await expect(page.locator('[data-attachment-popover="constraint:chk_orders_total"]')).toContainText('total_cents >= 0')

  const indexNode = page.locator('[data-node-anchor="index:idx_products_search"]')
  const initialHeight = await indexNode.evaluate((element) => {
    return Math.round(element.getBoundingClientRect().height)
  })

  await page.getByRole('button', { name: 'Expand idx_products_search' }).click()
  await expect(page.locator('[data-node-body="index:idx_products_search"]')).toBeVisible()

  const expandedHeight = await indexNode.evaluate((element) => {
    return Math.round(element.getBoundingClientRect().height)
  })

  expect(expandedHeight).toBeGreaterThan(initialHeight + 40)

  await page.getByRole('button', { name: 'Collapse idx_products_search' }).click()
  await expect(page.locator('[data-node-body="index:idx_products_search"]')).toHaveCount(0)

  const collapsedHeight = await indexNode.evaluate((element) => {
    return Math.round(element.getBoundingClientRect().height)
  })

  expect(collapsedHeight).toBeLessThan(expandedHeight)
})

test('studio scrolls the editor to clicked floating cards and grouped tables', async ({ goto, page }) => {
  await goto('/diagram')

  const filler = Array.from({ length: 80 }, (_, index) => `// filler ${index + 1}`).join('\n')
  const source = `${filler}

TableGroup Core {
  orders
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

  await editor.fill(source)
  await expect(page.locator('[data-node-anchor="function:orphan_report"]')).toBeVisible()
  await expect(page.locator('[data-table-anchor="public.orders"]')).toBeVisible()

  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.scrollTop = 0
    element.setSelectionRange(0, 0)
  })
  await page.locator('[data-node-anchor="function:orphan_report"]').click()
  await expect.poll(async () => {
    return editor.evaluate((element: HTMLTextAreaElement) => {
      return {
        scrollTop: element.scrollTop,
        selectedText: element.value.slice(element.selectionStart, element.selectionEnd)
      }
    })
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

  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.scrollTop = 0
    element.setSelectionRange(0, 0)
  })
  await page.locator('[data-table-anchor="public.orders"]').click()
  await expect.poll(async () => {
    return editor.evaluate((element: HTMLTextAreaElement) => {
      return element.value.slice(element.selectionStart, element.selectionEnd)
    })
  }).toBe(`Table orders in Core {
  id integer [pk]
  total_cents integer
  Index idx_orders_total (total_cents)
}`)
})
