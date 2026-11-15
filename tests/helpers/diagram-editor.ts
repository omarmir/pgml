import type { Page } from '@playwright/test'

export const openTableEditorFromInspector = async (page: Page, tableId: string) => {
  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator(`[data-browser-entity-row="${tableId}"] button`).first().click()
  await page.locator('[data-diagram-panel-tab="inspector"]').click()
  await page.locator('[data-diagram-panel="true"]').getByRole('button', { name: 'Edit table', exact: true }).click()
}
