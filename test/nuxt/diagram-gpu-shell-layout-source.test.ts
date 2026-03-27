import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram GPU shell group layout source', () => {
  it('keeps symmetric vertical padding around grouped tables', () => {
    const sceneUtilsFile = readSourceFile('app/utils/diagram-gpu-scene.ts')
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(sceneUtilsFile).toContain('export const diagramGroupHeaderBandHeight = diagramGroupHeaderHeight + diagramGroupVerticalPadding')
    expect(shellFile).toContain('diagramGroupHeaderBandHeight + diagramGroupVerticalPadding + layout.contentHeight')
    expect(shellFile).toContain('y: group.y + diagramGroupHeaderBandHeight + (placement?.y || 0)')
  })

  it('blocks connection routing through the full group header band down to the table content start', () => {
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(shellFile).toContain('bottom: group.y + diagramGroupHeaderBandHeight')
  })
})
