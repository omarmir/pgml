import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Batch } from 'pixi.js'
import Scene from '../../app/components/pgml/PgmlDiagramGpuScene.vue'

type BoundaryApplication = {
  resolve: () => void
  render: ReturnType<typeof vi.fn>
  batch: Batch | null
  destroyThrows: boolean
}
const mock = vi.hoisted(() => ({ apps: [] as BoundaryApplication[] }))
vi.mock('pixi.js', async () => {
  const real = await vi.importActual<typeof import('pixi.js')>('pixi.js')
  class Container {
    children: unknown[] = []
    sortableChildren = false
    position = { set: vi.fn() }
    scale = { set: vi.fn() }
    destroy = vi.fn()
    addChild = (child: unknown) => { this.children.push(child) }
    sortChildren = () => {}
  }
  class Graphics {
    clear = () => this
    rect = () => this
    circle = () => this
    fill = () => this
    moveTo = () => this
    lineTo = () => this
    stroke = () => this
  }
  class Application {
    stage = new Container()
    canvas = document.createElement('canvas')
    renderer = new real.WebGLRenderer()
    batcher = new real.DefaultBatcher({ maxTextures: 16, attributesInitialSize: 64, indicesInitialSize: 64 })
    batch: Batch | null = null
    destroyThrows = false
    resolve = () => {}
    constructor() {
      mock.apps.push(this)
      this.renderer.resize = vi.fn()
      Object.defineProperty(this.renderer, 'gl', { value: null })
      this.batcher.packQuadAttributes = () => {}
    }

    render = vi.fn(() => {
      const element = new real.BatchableSprite()
      element.texture = real.Texture.EMPTY
      element.renderable = new real.Sprite(real.Texture.EMPTY)
      element.transform = new real.Matrix()
      element.bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 }
      this.batcher.begin()
      this.batcher.add(element)
      this.batcher.finish(new real.InstructionSet())
      this.batch = this.batcher.batches[0] ?? null
    })

    destroy = vi.fn((options: Parameters<typeof this.renderer.destroy>[0]) => {
      if (this.destroyThrows) throw new Error('Partial application plugin cleanup')
      this.canvas.remove()
      this.stage.destroy()
      this.renderer.destroy(options)
    })

    init = () => new Promise<void>((resolve) => { this.resolve = resolve })
  }
  return { ...real, Application, Container, Graphics }
})

describe('installed Pixi local cleanup ownership', () => {
  beforeEach(() => {
    mock.apps = []
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  for (const partialCleanup of [false, true]) {
    it(`preserves the current real batch when obsolete cleanup uses ${partialCleanup ? 'renderer fallback' : 'application destruction'}`, async () => {
      const wrapper = await mountSuspended(Scene, { props: { groups: [], tables: [], objects: [], connections: [],
        worldBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }, rendererBackend: 'webgl' } })
      await vi.waitFor(() => expect(mock.apps).toHaveLength(1))
      const old = mock.apps[0]!
      old.destroyThrows = partialCleanup
      await wrapper.setProps({ rendererBackend: 'webgpu' })
      await vi.waitFor(() => expect(mock.apps).toHaveLength(2))
      const live = mock.apps[1]!
      live.resolve()
      await flushPromises()
      window.dispatchEvent(new Event('resize'))
      await vi.waitFor(() => expect(live.render.mock.calls.length).toBeGreaterThanOrEqual(2))
      expect(live.batch?.textures).not.toBeNull()
      old.resolve()
      await flushPromises()
      try {
        expect(live.batch?.textures, 'Obsolete cleanup must preserve the active installed-Pixi batch').not.toBeNull()
      } finally {
        wrapper.unmount()
      }
    })
  }
})
