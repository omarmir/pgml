import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram page source', () => {
  it('keeps the studio workspace shells and modal entry points in the page source', () => {
    const file = readSourceFile('app/pages/diagram.vue')

    expect(file).toContain('middleware: \'require-studio-launch\'')
    expect(file).toContain('<StudioDesktopWorkspace')
    expect(file).toContain('<StudioMobileWorkspace')
    expect(file).toContain('<StudioEditorSurface')
    expect(file).toContain('v-model:active-view="mobileWorkspaceView"')
    expect(file).toContain('<StudioModalFrame')
    expect(file).toContain('Add table')
    expect(file).toContain('Add table group')
    expect(file).toContain('Columns')
    expect(file).toContain('Tables in this group')
  })
})
