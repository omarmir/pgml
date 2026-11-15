import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import Scene from '../../app/components/pgml/PgmlDiagramGpuScene.vue'
import type { DiagramGpuConnectionLine } from '../../app/utils/diagram-gpu-scene'

type MockRenderer = { type: number, resize: Mock<(width: number, height: number) => void>, destroy: Mock<() => void> }
type MockApplication = {
  canvas: HTMLCanvasElement
  renderer: MockRenderer | undefined
  stage: { destroy: Mock<() => void> }
  resolve: (backend?: 'webgl' | 'webgpu') => void
  reject: (error?: Error) => void
  destroy: Mock<() => void>
  render: Mock<() => void>
  destroyThrows: boolean
  preference: 'webgl' | 'webgpu'
}
const mock = vi.hoisted(() => {
  const apps: MockApplication[] = []
  return { apps }
})
vi.mock('pixi.js', () => {
  class Container {
    children: unknown[] = []
    sortableChildren = false
    position = { set: vi.fn() }
    scale = { set: vi.fn() }
    destroy = vi.fn<() => void>()
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
    renderer: MockRenderer | undefined = undefined
    render = vi.fn<() => void>()
    destroyThrows = false
    preference: 'webgl' | 'webgpu' = 'webgl'
    destroy = vi.fn(() => {
      if (this.destroyThrows) throw new Error('Pixi plugins were not initialized')
      this.stage.destroy()
      this.renderer?.destroy()
      this.canvas.remove()
    })

    resolve: (backend?: 'webgl' | 'webgpu') => void = () => {}
    reject: (error?: Error) => void = () => {}
    constructor() { mock.apps.push(this) }
    init = ({ preference }: { preference: 'webgl' | 'webgpu' }) => {
      this.preference = preference
      return new Promise<void>((resolve, reject) => {
        this.resolve = (backend = preference) => {
          this.renderer = { type: backend === 'webgpu' ? 2 : 1, resize: vi.fn<(width: number, height: number) => void>(), destroy: vi.fn<() => void>() }
          resolve()
        }
        this.reject = (error = new Error('Renderer unavailable')) => reject(error)
      })
    }
  }
  return { Application, Container, Graphics, RendererType: { WEBGPU: 2, WEBGL: 1 } }
})
const props = { groups: [], tables: [], objects: [], connections: [], worldBounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 } }
const gpuDescriptor = Object.getOwnPropertyDescriptor(navigator, 'gpu')
const complete = async (application: MockApplication, backend?: 'webgl' | 'webgpu') => {
  application.resolve(backend)
  await flushPromises()
}
const enableGpu = () => Object.defineProperty(navigator, 'gpu', { configurable: true, value: {} })

describe('GPU scene renderer ownership', () => {
  beforeEach(() => {
    mock.apps = []
    Object.assign(window, { __PGML_ENABLE_SCENE_DEBUG__: true })
    Reflect.deleteProperty(navigator, 'gpu')
  })
  afterEach(() => {
    if (gpuDescriptor) Object.defineProperty(navigator, 'gpu', gpuDescriptor)
    else Reflect.deleteProperty(navigator, 'gpu')
    Reflect.deleteProperty(window, '__PGML_ENABLE_SCENE_DEBUG__')
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('releases an application finishing after unmount without adding late listeners', async () => {
    const added = vi.spyOn(window, 'addEventListener')
    const wrapper = await mountSuspended(Scene, { props })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(1))
    const pending = mock.apps[0]!
    wrapper.unmount()
    const marker = added.mock.calls.length
    await complete(pending)
    const late = added.mock.calls.slice(marker).filter(([name]) => ['resize', 'touchstart', 'touchmove', 'touchend', 'touchcancel'].includes(name))
    expect(late).toHaveLength(0)
    expect(pending.destroy).toHaveBeenCalledOnce()
    expect(pending.canvas.isConnected).toBe(false)
    const resizes = pending.renderer?.resize.mock.calls.length
    window.dispatchEvent(new Event('resize'))
    expect(pending.renderer?.resize.mock.calls.length).toBe(resizes)
  })

  it('keeps the newest completed renderer when an older initialization resolves last', async () => {
    enableGpu()
    const wrapper = await mountSuspended(Scene, { props: { ...props, rendererBackend: 'webgl' } })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(1))
    const older = mock.apps[0]!
    await wrapper.setProps({ rendererBackend: 'webgpu' })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(2))
    const newer = mock.apps[1]!
    await complete(newer)
    expect(wrapper.element.contains(newer.canvas)).toBe(true)
    await complete(older)
    expect(wrapper.findAll('canvas')).toHaveLength(1)
    expect(wrapper.element.contains(newer.canvas)).toBe(true)
    expect(older.destroy).toHaveBeenCalledOnce()
    expect(wrapper.emitted('rendererCapabilityChange')?.at(-1)?.[0]).toMatchObject({ requested: 'webgpu', resolved: 'webgpu', fallbackReason: null })
    wrapper.unmount()
    expect(newer.destroy).toHaveBeenCalledOnce()
  })

  it('cleans partial initialization, falls back for the live generation and preserves its capability', async () => {
    enableGpu()
    const wrapper = await mountSuspended(Scene, { props: { ...props, rendererBackend: 'webgpu' } })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(1))
    const failed = mock.apps[0]!
    failed.destroyThrows = true
    failed.reject()
    await vi.waitFor(() => expect(mock.apps).toHaveLength(2))
    expect(failed.stage.destroy).toHaveBeenCalledOnce()
    expect(mock.apps[1]!.preference).toBe('webgl')
    await complete(mock.apps[1]!)
    expect(wrapper.findAll('canvas')).toHaveLength(1)
    expect(wrapper.emitted('rendererCapabilityChange')?.at(-1)?.[0]).toMatchObject({ requested: 'webgpu', resolved: 'webgl', fallbackReason: 'renderer-init-failed' })
    wrapper.unmount()
  })

  it('does not start a fallback for an obsolete failed generation', async () => {
    enableGpu()
    const wrapper = await mountSuspended(Scene, { props: { ...props, rendererBackend: 'webgpu' } })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(1))
    const old = mock.apps[0]!
    await wrapper.setProps({ rendererBackend: 'webgl' })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(2))
    await complete(mock.apps[1]!)
    old.reject()
    await flushPromises()
    expect(mock.apps).toHaveLength(2)
    expect(wrapper.findAll('canvas')).toHaveLength(1)
    expect(wrapper.emitted('rendererCapabilityChange')?.at(-1)?.[0]).toMatchObject({ requested: 'webgl', resolved: 'webgl' })
    wrapper.unmount()
  })

  it('shows a retryable failure after both renderer attempts fail and ignores input before readiness', async () => {
    enableGpu()
    const wrapper = await mountSuspended(Scene, { props: { ...props, rendererBackend: 'webgpu' } })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(1))
    const surface = wrapper.get('[data-diagram-gesture-surface="true"]')
    await surface.trigger('pointerdown', { pointerId: 7, clientX: 0, clientY: 0, button: 0 })
    await surface.trigger('pointermove', { pointerId: 7, clientX: 30, clientY: 30 })
    expect(wrapper.emitted('select')).toBeUndefined()
    mock.apps[0]!.reject()
    await vi.waitFor(() => expect(mock.apps).toHaveLength(2))
    mock.apps[1]!.reject()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('could not start')
    await wrapper.get('button').trigger('click')
    await vi.waitFor(() => expect(mock.apps).toHaveLength(3))
    await complete(mock.apps[2]!)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findAll('canvas')).toHaveLength(1)
    wrapper.unmount()
  })

  it('retains the manual viewport through ready, pending restart and another restart', async () => {
    enableGpu()
    const wrapper = await mountSuspended(Scene, { props: { ...props, rendererBackend: 'webgl' } })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(1))
    await complete(mock.apps[0]!)
    const initialScale = wrapper.emitted('scaleChange')?.at(-1)?.[0]
    wrapper.vm.handleWheel(new WheelEvent('wheel', { deltaY: -120, clientX: 60, clientY: 70 }))
    await vi.waitFor(() => expect(wrapper.emitted('scaleChange')?.at(-1)?.[0]).not.toEqual(initialScale))
    const expected = wrapper.emitted('transformChange')?.at(-1)?.[0]
    await wrapper.setProps({ rendererBackend: 'webgpu' })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(2))
    await wrapper.setProps({ rendererBackend: 'auto' })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(3))
    await complete(mock.apps[2]!)
    expect(wrapper.emitted('transformChange')?.at(-1)?.[0]).toEqual(expected)
    await complete(mock.apps[1]!)
    expect(wrapper.emitted('transformChange')?.at(-1)?.[0]).toEqual(expected)
    expect(wrapper.findAll('canvas')).toHaveLength(1)
    wrapper.unmount()
  })

  it('cancels full, transform and preview frames instead of rendering old or replacement resources', async () => {
    const frames = new Map<number, FrameRequestCallback>()
    let handle = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++handle, callback)
      return handle
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const wrapper = await mountSuspended(Scene, { props: { ...props, rendererBackend: 'webgl' } })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(1))
    const old = mock.apps[0]!
    await complete(old)
    const initialFrames = Array.from(frames.values())
    frames.clear()
    initialFrames.forEach(callback => callback(0))
    await wrapper.setProps({ worldBounds: { minX: 0, minY: 0, maxX: 120, maxY: 120 } })
    wrapper.vm.handleWheel(new WheelEvent('wheel', { deltaY: -120, clientX: 0, clientY: 0 }))
    wrapper.vm.setDragPreview({ id: 'missing', nodeId: 'missing', kind: 'group', originX: 0, originY: 0, x: 10, y: 10, deltaX: 10, deltaY: 10 })
    expect(frames.size).toBe(3)
    const pending = Array.from(frames.values())
    const oldCount = old.render.mock.calls.length
    await wrapper.setProps({ rendererBackend: 'webgpu' })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(2))
    expect(frames.size).toBe(0)
    pending.forEach(callback => callback(0))
    expect(old.render).toHaveBeenCalledTimes(oldCount)
    const next = mock.apps[1]!
    await complete(next)
    const nextCount = next.render.mock.calls.length
    pending.forEach(callback => callback(0))
    expect(next.render).toHaveBeenCalledTimes(nextCount)
    wrapper.unmount()
    expect(frames.size).toBe(0)
  })

  it('cancels deferred redraw and recursive line animation on disposal', async () => {
    const frames = new Map<number, FrameRequestCallback>()
    let handle = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++handle, callback)
      return handle
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    const line: DiagramGpuConnectionLine = {
      key: 'animated', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      color: '#38bdf8', animated: true, dashed: true, dashPattern: '4 4', fromOwnerNodeId: null, toOwnerNodeId: null, zIndex: 1
    }
    const wrapper = await mountSuspended(Scene, { props: { ...props, connections: [line] } })
    await vi.waitFor(() => expect(mock.apps).toHaveLength(1))
    const application = mock.apps[0]!
    await complete(application)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    wrapper.vm.handleWheel(new WheelEvent('wheel', { deltaY: -120, clientX: 0, clientY: 0 }))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    const pending = Array.from(frames.values())
    const count = application.render.mock.calls.length
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(frames.size).toBe(0)
    pending.forEach(callback => callback(0))
    vi.runAllTimers()
    expect(frames.size).toBe(0)
    expect(application.render).toHaveBeenCalledTimes(count)
  })
})
