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
    expect(sceneFile).toContain('const headerBaseFill = compositeColors(bodyOverlayFill, compositeColors(shellFill, sceneTheme.background))')
    expect(sceneFile).toContain('context.fillStyle = headerBaseFill')
    expect(sceneFile).toContain('worldContainer.addChild(groupContainer)')
    expect(sceneFile).toContain('worldContainer.addChild(lineGraphics)')
    expect(sceneFile).toContain('worldContainer.addChild(groupHeaderContainer)')
    expect(sceneFile).toContain('worldContainer.addChild(tableContainer)')
  })
})
