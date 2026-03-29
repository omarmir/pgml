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

  it('lets grouped table headers fade from the group accent into the neutral table surface', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneFile).toContain('const headerMidColor = isGroupedTable')
    expect(sceneFile).toContain('? withAlpha(card.color, 0.04)')
    expect(sceneFile).toContain('const headerTopColor = isGroupedTable')
    expect(sceneFile).toContain('? withAlpha(card.color, 0.08)')
    expect(sceneFile).toContain('const headerBottomColor = isGroupedTable')
    expect(sceneFile).toContain('? withAlpha(card.color, 0.015)')
    expect(sceneFile).toContain('const headerFinalColor = isGroupedTable ? \'rgba(0, 0, 0, 0)\' : headerBottomColor')
    expect(sceneFile).toContain('headerGradient.addColorStop(isGroupedTable ? 0.2 : 0.64, headerMidColor)')
    expect(sceneFile).toContain('headerGradient.addColorStop(isGroupedTable ? 0.48 : 1, headerBottomColor)')
    expect(sceneFile).toContain('headerGradient.addColorStop(1, headerFinalColor)')
  })
})
