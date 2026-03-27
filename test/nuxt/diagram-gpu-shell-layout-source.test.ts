import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram GPU shell group layout source', () => {
  it('keeps symmetric vertical padding around grouped tables', () => {
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(shellFile).toContain('diagramGroupHeaderHeight + diagramGroupVerticalPadding * 2 + layout.contentHeight')
    expect(shellFile).toContain('y: group.y + diagramGroupHeaderHeight + diagramGroupVerticalPadding + (placement?.y || 0)')
  })

  it('blocks connection routing through the full group header band down to the table content start', () => {
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(shellFile).toContain('bottom: group.y + diagramGroupHeaderHeight + diagramGroupVerticalPadding')
  })
})
