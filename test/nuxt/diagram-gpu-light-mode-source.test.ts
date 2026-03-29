import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram GPU light mode source', () => {
  it('rebuilds cached scene sprites when the studio theme changes', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneFile).toContain('let themeObserver: MutationObserver | null = null')
    expect(sceneFile).toContain('const getSceneThemeSignature = (value: SceneTheme) => {')
    expect(sceneFile).toContain('let sceneThemeSignature = getSceneThemeSignature(sceneTheme)')
    expect(sceneFile).toContain('const syncSceneTheme = () => {')
    expect(sceneFile).toContain('attributeFilter: [\'data-studio-theme\', \'style\']')
    expect(sceneFile).toContain('background: sceneTheme.background')
    expect(sceneFile).toContain(':${hashDiagramRenderSignature(sceneThemeSignature)}`')
  })

  it('uses live studio tokens for the viewport chrome and svg export palette', () => {
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(shellFile).toContain('backgroundColor: \'var(--studio-canvas-bg)\'')
    expect(shellFile).toContain('backgroundColor: \'var(--studio-control-bg)\'')
    expect(shellFile).toContain('const readDiagramThemeToken = (name: string, fallback: string) => {')
    expect(shellFile).toContain('background: readDiagramThemeToken(\'--studio-canvas-bg\', diagramBackgroundColor)')
    expect(shellFile).toContain('dot: readDiagramThemeToken(\'--studio-canvas-dot\', diagramDotColor)')
    expect(shellFile).toContain('surface: readDiagramThemeToken(\'--studio-node-surface-bottom\', diagramSurfaceColor)')
    expect(shellFile).toContain('const buildSvgPaintAttributes = (attribute: \'fill\' | \'stroke\', value: string, fallback: string) => {')
    expect(shellFile).toContain('buildSvgPaintAttributes(\'fill\', exportTheme.background, diagramBackgroundColor)')
    expect(shellFile).toContain('buildSvgPaintAttributes(\'fill\', exportTheme.tableSurface, diagramTableSurfaceColor)')
  })
})
