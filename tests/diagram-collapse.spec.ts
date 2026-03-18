import { expect, test } from '@nuxt/test-utils/playwright'

test.setTimeout(120_000)

test('studio starts non-table entities collapsed and lets the user expand them from the node header', async ({ goto, page }) => {
  await goto('/diagram')

  await expect(page.locator('[data-group-content="group:Core"]')).toBeVisible()
  await expect(page.locator('[data-node-body="function:register_entity"]')).toHaveCount(0)
  await expect(page.locator('[data-node-body="sequence:order_number_seq"]')).toHaveCount(0)
  await expect(page.locator('[data-node-body="index:idx_products_search"]')).toHaveCount(0)

  const functionNode = page.locator('[data-node-anchor="function:register_entity"]')
  const initialHeight = await functionNode.evaluate((element) => {
    return Math.round(element.getBoundingClientRect().height)
  })

  await page.getByRole('button', { name: 'Expand register_entity' }).click()
  await expect(page.locator('[data-node-body="function:register_entity"]')).toBeVisible()

  const expandedHeight = await functionNode.evaluate((element) => {
    return Math.round(element.getBoundingClientRect().height)
  })

  expect(expandedHeight).toBeGreaterThan(initialHeight + 40)

  await page.getByRole('button', { name: 'Collapse register_entity' }).click()
  await expect(page.locator('[data-node-body="function:register_entity"]')).toHaveCount(0)

  const collapsedHeight = await functionNode.evaluate((element) => {
    return Math.round(element.getBoundingClientRect().height)
  })

  expect(collapsedHeight).toBeLessThan(expandedHeight)
})
