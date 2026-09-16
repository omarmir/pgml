import { expect, test } from '@nuxt/test-utils/playwright'
import { getPgmlEditor, setPgmlEditorValue } from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test('JSONB array defaults render columns without diagnostics', async ({ goto, page }) => {
  await authorizeStudioLaunchAccess(page)
  await goto('/diagram')
  await setPgmlEditorValue(getPgmlEditor(page), `Table public.templates {
  egcs_tp_outputformats jsonb [not null, default: '["docx", "pdf"]'::jsonb] // Document formats
}`)

  const table = page.locator('[data-node-anchor="public.templates"]')
  await expect(table).toBeVisible()
  await expect(table).toContainText('egcs_tp_outputformats')
  await expect(page.locator('[data-pgml-diagnostics="true"]')).toHaveCount(0)
})
