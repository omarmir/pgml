import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram GPU group header overlay source', () => {
  it('renders group headers in a dedicated layer above connections and below tables', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneFile).toContain('let groupHeaderContainer: PixiContainer | null = null')
    expect(sceneFile).toContain('let groupHeaderSpriteEntries = new Map<string, TextureCacheEntry>()')
    expect(sceneFile).toContain("kind: 'group' | 'group-header' | 'object' | 'table'")
    expect(sceneFile).toContain('const compositeColors = (foreground: string, background: string) => {')
    expect(sceneFile).toContain('const buildGroupHeaderOverlayCanvas = (group: DiagramGpuGroupNode, resolution: number) => {')
    expect(sceneFile).toContain('const headerTopFill = withAlpha(group.color, 0.28)')
    expect(sceneFile).toContain('const headerMidFill = withAlpha(group.color, 0.14)')
    expect(sceneFile).toContain('const headerLowFill = withAlpha(group.color, 0.05)')
    expect(sceneFile).toContain("headerGradient.addColorStop(0.24, headerMidFill)")
    expect(sceneFile).toContain("headerGradient.addColorStop(0.5, headerLowFill)")
    expect(sceneFile).toContain("headerGradient.addColorStop(0.72, 'rgba(0, 0, 0, 0)')")
    expect(sceneFile).toContain("headerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')")
    expect(sceneFile).toContain('context.fillStyle = headerGradient')
    expect(sceneFile).toContain('worldContainer.addChild(groupContainer)')
    expect(sceneFile).toContain('worldContainer.addChild(lineGraphics)')
    expect(sceneFile).toContain('worldContainer.addChild(groupHeaderContainer)')
    expect(sceneFile).toContain('worldContainer.addChild(tableContainer)')
  })

  it('keeps the header tint blended into the group shell instead of outlining a separate header box', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneFile).toContain("const selectionKey = getSelectionStateKey(group.id)")
    expect(sceneFile).toContain("context.strokeStyle = selectionKey === 'selected-group' ? accentColor : borderColor")
    expect(sceneFile).toContain("context.lineWidth = selectionKey === 'selected-group' ? 1.5 : 1")
    expect(sceneFile).toContain('roundRect(context, 0.5, 0.5, group.width - 1, group.height - 1, 2.5)')
    expect(sceneFile).not.toContain('const strokeTopRoundRectOutline = (')
    expect(sceneFile).not.toContain('context.fillStyle = headerBaseFill')
    expect(sceneFile).not.toContain('context.moveTo(1, diagramGroupHeaderHeight + 0.5)')
  })

  it('invalidates cached group sprites when the group render content changes', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneFile).toContain('const hashDiagramRenderSignature = (value: string) => {')
    expect(sceneFile).toContain('const getGroupRenderSignature = (group: DiagramGpuGroupNode) => {')
    expect(sceneFile).toContain('const renderSignature = getGroupRenderSignature(group)')
    expect(sceneFile).toContain("const nextKey = `${key}:${getSelectionStateKey(key)}:${Math.round(resolution * 100)}:${width}x${height}:${hashDiagramRenderSignature(renderSignature)}`")
    expect(sceneFile).toContain('group.color')
  })
})
