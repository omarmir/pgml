import { expect, test } from '@nuxt/test-utils/playwright'
import {
  getPgmlEditor,
  setPgmlEditorValue
} from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('studio nests inferred sequence rows inside their owning table instead of rendering standalone sequence cards', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)

  await setPgmlEditorValue(editor, `Table public.orders {
  id bigint [pk]
  order_number bigint [not null, unique, default: nextval('invoice_number_seq')]
}

Sequence invoice_number_seq {
  source: $sql$
    CREATE SEQUENCE public.invoice_number_seq;
  $sql$
}`)

  await page.locator('[data-diagram-panel-tab="entities"]').click()

  await expect(page.locator('[data-browser-entity-row="public.orders"]')).toBeVisible()

  const nestedBrowserRow = page.locator('[data-browser-entity-row="public.orders"] [data-browser-entity-row="sequence:invoice_number_seq"]')

  await expect(nestedBrowserRow).toBeVisible()
  await expect(page.locator('[data-browser-entity-row="sequence:invoice_number_seq"]')).toHaveCount(1)
})
