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
    expect(sceneFile).toContain('card.headerHeight - 19')
    expect(shellFile).toContain('${card.rows.length} ROWS</text>')
    expect(shellFile).toContain('${card.y + offsetY + 42}')
  })

  it('uses flat neutral grouped headers and flat accent standalone headers', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneFile).toContain('const getReadableTextColor = (background: string) => {')
    expect(sceneFile).toContain('const headerFillColor = isGroupedTable')
    expect(sceneFile).toContain('? sceneTheme.tableSurface')
    expect(sceneFile).toContain(': compositeColors(withAlpha(card.color, 0.2), sceneTheme.tableSurface)')
    expect(sceneFile).toContain('const headerTextColor = isGroupedTable ? shellTextColor : getReadableTextColor(headerFillColor)')
    expect(sceneFile).toContain('const headerMetaColor = isGroupedTable ? accentColor : withAlpha(headerTextColor, 0.82)')
    expect(sceneFile).toContain('const headerChipColors = isGroupedTable')
    expect(sceneFile).toContain('? undefined')
    expect(sceneFile).toContain('fill: withAlpha(headerTextColor, 0.08)')
    expect(sceneFile).toContain('context.fillStyle = headerFillColor')
    expect(sceneFile).toContain('drawHeaderChip(context, card.width - rowCountWidth - 10, 8, rowCountWidth, rowCountLabel, fontMonoSmall, headerChipColors)')
    expect(sceneFile).not.toContain('const headerGradient = context.createLinearGradient(0, 0, 0, card.headerHeight)')
  })

  it('matches the legacy table shell and row divider treatment more closely', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(sceneFile).toContain(': mixColors(card.color, sceneTheme.tableSurface, 0.08)')
    expect(sceneFile).toContain('const shellStrokeColor = isGroupedTable ? dividerColor : borderColor')
    expect(sceneFile).toContain('context.strokeStyle = selectionKey.startsWith(\'selected\') ? accentColor : shellStrokeColor')
    expect(sceneFile).toContain('context.strokeRect(0.5, 0.5, card.width - 1, card.height - 1)')
    expect(sceneFile).toContain('if (card.rows.length > 1) {')
    expect(sceneFile).toContain('context.fillStyle = dividerColor')
    expect(sceneFile).toContain('context.fillRect(1, card.headerHeight, Math.max(0, card.width - 2), Math.max(0, card.height - card.headerHeight - 1))')
    expect(sceneFile).toContain('const rowFillHeight = index < card.rows.length - 1 ? diagramTableRowHeight - 1 : diagramTableRowHeight')
    expect(sceneFile).toContain(': sceneTheme.rowSurface)')
    expect(sceneFile).toContain('context.fillRect(1, rowY, Math.max(0, card.width - 2), rowFillHeight)')
    expect(sceneFile.lastIndexOf('rowY += diagramTableRowHeight')).toBeLessThan(sceneFile.lastIndexOf('context.moveTo(1, card.headerHeight + 0.5)'))
    expect(shellFile).toContain('if (index < card.rows.length - 1) {')
    expect(shellFile).toContain('y1="${rowY + diagramTableRowHeight}"')
    expect(shellFile.lastIndexOf('card.rows.forEach((row, index) => {')).toBeLessThan(shellFile.lastIndexOf('y1="${card.y + offsetY + card.headerHeight}"'))
  })
})
