import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram GPU table header source', () => {
  it('gives table titles their own second header row below the table metadata', () => {
    const sceneUtilsFile = readSourceFile('app/utils/diagram-gpu-scene.ts')
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(sceneUtilsFile).toContain('export const diagramTableHeaderHeight = 64')
    expect(sceneFile).toContain('const rowCountLabel = `${card.rows.length} ROWS`')
    expect(sceneFile).toContain('context.fillText(fitText(context, card.title, card.width - 20), 10, 29)')
    expect(shellFile).toContain('${card.rows.length} ROWS</text>')
    expect(shellFile).toContain('${card.y + offsetY + 42}')
  })
})
