import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram GPU group header overlay source', () => {
  it('renders group headers in a dedicated layer above connections and below tables', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneFile).toContain('let groupHeaderContainer: PixiContainer | null = null')
    expect(sceneFile).toContain('let groupHeaderSpriteEntries = new Map<string, TextureCacheEntry>()')
    expect(sceneFile).toContain('kind: \'group\' | \'group-header\' | \'object\' | \'table\'')
    expect(sceneFile).toContain('const compositeColors = (foreground: string, background: string) => {')
    expect(sceneFile).toContain('const getGroupHeaderOverlayHeight = (group: DiagramGpuGroupNode) => {')
    expect(sceneFile).toContain('const buildGroupCanvas = (group: DiagramGpuGroupNode, resolution: number) => {')
    expect(sceneFile).toContain('const buildGroupHeaderOverlayCanvas = (group: DiagramGpuGroupNode, resolution: number) => {')
    expect(sceneFile).toContain('const headerOverlayHeight = getGroupHeaderOverlayHeight(group)')
    expect(sceneFile).toContain('const shellFill = compositeColors(sceneTheme.groupSurface, sceneTheme.background)')
    expect(sceneFile).toContain('const bodyOverlayFill = compositeColors(withAlpha(group.color, 0.02), shellFill)')
    expect(sceneFile).toContain('const headerTopFill = compositeColors(withAlpha(group.color, 0.28), bodyOverlayFill)')
    expect(sceneFile).toContain('const headerMidFill = compositeColors(withAlpha(group.color, 0.14), bodyOverlayFill)')
    expect(sceneFile).toContain('const headerLowFill = compositeColors(withAlpha(group.color, 0.05), bodyOverlayFill)')
    expect(sceneFile).toContain('const headerMidStop = Math.min(1, (diagramGroupHeaderBandHeight * 0.24) / headerOverlayHeight)')
    expect(sceneFile).toContain('const headerLowStop = Math.min(1, (diagramGroupHeaderBandHeight * 0.5) / headerOverlayHeight)')
    expect(sceneFile).toContain('const headerTailStop = Math.min(1, diagramGroupHeaderBandHeight / headerOverlayHeight)')
    expect(sceneFile).toContain('const headerFadeOutStop = Math.min(1, (diagramGroupHeaderBandHeight + 18) / headerOverlayHeight)')
    expect(sceneFile).toContain('headerGradient.addColorStop(headerMidStop, headerMidFill)')
    expect(sceneFile).toContain('headerGradient.addColorStop(headerLowStop, headerLowFill)')
    expect(sceneFile).toContain('headerGradient.addColorStop(headerTailStop, headerLowFill)')
    expect(sceneFile).toContain('headerGradient.addColorStop(headerFadeOutStop, bodyOverlayFill)')
    expect(sceneFile).toContain('headerGradient.addColorStop(1, bodyOverlayFill)')
    expect(sceneFile).toContain('context.fillStyle = headerGradient')
    expect(sceneFile).toContain('const chipBaseFill = compositeColors(sceneTheme.control, bodyOverlayFill)')
    expect(sceneFile).toContain('const chipStrokeColor = compositeColors(sceneTheme.rail, chipBaseFill)')
    expect(sceneFile).toContain('drawHeaderChip(context, pillX, 9, pillWidth, pill, fontMonoSmallRegular, pillColors)')
    expect(sceneFile).toContain('worldContainer.addChild(groupContainer)')
    expect(sceneFile).toContain('worldContainer.addChild(lineGraphics)')
    expect(sceneFile).toContain('worldContainer.addChild(groupHeaderContainer)')
    expect(sceneFile).toContain('worldContainer.addChild(tableContainer)')
  })

  it('keeps the header tint blended into the group shell instead of outlining a separate header box', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneFile).toContain('const selectionKey = getSelectionStateKey(group.id)')
    expect(sceneFile).toContain('context.strokeStyle = selectionKey === \'selected-group\' ? accentColor : borderColor')
    expect(sceneFile).toContain('context.lineWidth = selectionKey === \'selected-group\' ? 1.5 : 1')
    expect(sceneFile).toContain('roundRect(context, 0.5, 0.5, group.width - 1, group.height - 1, 2.5)')
    expect(sceneFile).not.toContain('const strokeTopRoundRectOutline = (')
    expect(sceneFile).not.toContain('context.fillStyle = headerBaseFill')
    expect(sceneFile).not.toContain('context.moveTo(1, diagramGroupHeaderHeight + 0.5)')
  })

  it('invalidates cached group sprites when the group render content changes', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneFile).toContain('const hashDiagramRenderSignature = (value: string) => {')
    expect(sceneFile).toContain('const diagramSpriteRasterVersion = \'2026-03-30-group-shell-v3\'')
    expect(sceneFile).toContain('const getGroupRenderSignature = (group: DiagramGpuGroupNode) => {')
    expect(sceneFile).toContain('const renderSignature = getGroupRenderSignature(group)')
    expect(sceneFile).toContain('getGroupHeaderOverlayHeight(group)')
    expect(sceneFile).toContain('const nextKey = `${key}:${getSelectionStateKey(key)}:${Math.round(resolution * 100)}:${width}x${height}:${diagramSpriteRasterVersion}:${hashDiagramRenderSignature(renderSignature)}:${hashDiagramRenderSignature(sceneThemeSignature)}`')
    expect(sceneFile).toContain('group.color')
  })
})
