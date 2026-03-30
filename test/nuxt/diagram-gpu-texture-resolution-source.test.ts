import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram GPU texture resolution source', () => {
  it('caps sprite raster resolution to the active renderer texture limits', () => {
    const sceneFile = readSourceFile('app/components/pgml/PgmlDiagramGpuScene.vue')

    expect(sceneFile).toContain('type PixiWebGLRenderer = import(\'pixi.js\').WebGLRenderer')
    expect(sceneFile).toContain('type PixiWebGPURenderer = import(\'pixi.js\').WebGPURenderer')
    expect(sceneFile).toContain('const diagramFallbackMaxTextureDimension = 4096')
    expect(sceneFile).toContain('const diagramTextureDimensionPadding = 64')
    expect(sceneFile).toContain('const diagramTextureAreaSafetyRatio = 0.82')
    expect(sceneFile).toContain('const diagramMinimumTextureResolution = 0.125')
    expect(sceneFile).toContain('const diagramTextureResolutionStep = 0.125')
    expect(sceneFile).toContain('let maxSpriteTextureDimension = diagramFallbackMaxTextureDimension')
    expect(sceneFile).toContain('const getRendererMaxTextureDimension = () => {')
    expect(sceneFile).toContain('const renderer = app.renderer as PixiWebGLRenderer | PixiWebGPURenderer')
    expect(sceneFile).toContain('renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE)')
    expect(sceneFile).toContain('renderer.gpu?.device?.limits?.maxTextureDimension2D')
    expect(sceneFile).toContain('const syncMaxSpriteTextureDimension = () => {')
    expect(sceneFile).toContain('const getTextureResolution = (width: number, height: number) => {')
    expect(sceneFile).toContain('const cappedDimension = Math.max(1024, maxSpriteTextureDimension - diagramTextureDimensionPadding)')
    expect(sceneFile).toContain('const resolutionCapFromDimension = cappedDimension / Math.max(width, height, 1)')
    expect(sceneFile).toContain('const safeTextureArea = cappedDimension * cappedDimension * diagramTextureAreaSafetyRatio')
    expect(sceneFile).toContain('const resolutionCapFromArea = Math.sqrt(safeTextureArea / Math.max(1, width * height))')
    expect(sceneFile).toContain('return quantizeTextureResolution(Math.min(4, resolutionCapFromDimension, resolutionCapFromArea))')
    expect(sceneFile).toContain('const safeResolution = Math.max(diagramMinimumTextureResolution, resolution)')
    expect(sceneFile).toContain('const resolution = getTextureResolution(width, height)')
    expect(sceneFile).toContain('syncMaxSpriteTextureDimension()')
  })
})
