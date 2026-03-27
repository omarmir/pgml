import { expect, test } from '@nuxt/test-utils/playwright'
import { getPgmlEditor, readPgmlEditorState } from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('entities rows expose an explicit focus-source action', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-focus-source="public.users"]').click()

  const editor = getPgmlEditor(page)

  await expect.poll(async () => {
    const state = await readPgmlEditorState(editor)
    return state.value.slice(
      Math.min(state.anchor, state.head),
      Math.max(state.anchor, state.head)
    )
  }).toContain('Table public.users {')
})
