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

  it('includes persisted group masonry state when serializing node layout properties', () => {
    const sceneUtilsFile = readSourceFile('app/utils/diagram-gpu-scene.ts')
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(shellFile).toContain('kind: \'group\' as const')
    expect(shellFile).toContain('masonry: group.masonry')
    expect(shellFile).toContain('tableWidthScale: group.tableWidthScale')
    expect(sceneUtilsFile).toContain('masonry: typeof entry.masonry === \'boolean\' ? entry.masonry : previousEntry.masonry')
  })

  it('resets collapsed floating object heights back to the shared collapsed size', () => {
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(shellFile).toContain('height: collapsed ? diagramObjectCollapsedHeight : expandedHeight')
    expect(shellFile).toContain('height: diagramObjectCollapsedHeight')
  })
})
