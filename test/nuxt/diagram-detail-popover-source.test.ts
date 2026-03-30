import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram detail popover source', () => {
  it('keeps popover detail lines readable by clamping preserved tab width', () => {
    const file = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(file).toContain('const detailPopoverDetailTextClass =')
    expect(file).toContain('[tab-size:2]')
    expect(file).toContain('data-detail-popover-detail="true"')
    expect(file).toContain(':class="detailPopoverDetailTextClass"')
  })
})
