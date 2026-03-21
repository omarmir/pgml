import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram page source', () => {
  it('keeps the studio workspace controls and modal entry points in the page source', () => {
    const file = readSourceFile('app/pages/diagram.vue')

    expect(file).toContain('data-editor-resize-hit-area="true"')
    expect(file).toContain('data-editor-resize-grip="true"')
    expect(file).toContain('data-editor-visibility-toggle="true"')
    expect(file).toContain('<StudioModalFrame')
    expect(file).toContain('Add table')
    expect(file).toContain('Add table group')
    expect(file).toContain('Columns')
    expect(file).toContain('Tables in this group')
  })
})
