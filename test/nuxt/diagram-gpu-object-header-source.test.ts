import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram GPU object header source', () => {
  it('keeps object subtitles above the divider in collapsed cards', () => {
    const sceneUtilsFile = readSourceFile('app/utils/diagram-gpu-scene.ts')
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneUtilsFile).toContain('export const diagramObjectHeaderHeight = 54')
    expect(sceneUtilsFile).toContain('export const diagramObjectCollapsedHeight = 58')
    expect(sceneFile).toContain('context.fillText(fitText(context, node.subtitle, node.width - 20), 10, 42)')
    expect(sceneFile).toContain('context.moveTo(0, diagramObjectHeaderHeight + 0.5)')
    expect(sceneFile).toContain('context.lineTo(node.width, diagramObjectHeaderHeight + 0.5)')
  })
})
