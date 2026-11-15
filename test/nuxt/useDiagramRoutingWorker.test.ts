import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDiagramRoutingWorker } from '../../app/composables/useDiagramRoutingWorker'
import type { DiagramRoutingRequest } from '../../app/utils/diagram-routing-contract'

class RoutingWorker {
  static instances: RoutingWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  terminate = vi.fn()
  postMessage = vi.fn()
  constructor() { RoutingWorker.instances.push(this) }
  reply = (requestId: number) => this.onmessage?.(new MessageEvent('message', { data: { requestId, lines: [] } }))
}
const request: DiagramRoutingRequest = { requestId: 1, descriptors: [], groupGeometries: [], groupHeaderBands: [], nodeOrders: {},
  planeBounds: { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1 }, scale: 1 }
const mountRouting = async () => {
  let api!: ReturnType<typeof useDiagramRoutingWorker>
  const wrapper = await mountSuspended(defineComponent({ setup() {
    api = useDiagramRoutingWorker()
    return () => null
  } }))
  return { api, wrapper }
}
describe('diagram routing worker ownership', () => {
  beforeEach(() => {
    RoutingWorker.instances = []
    vi.stubGlobal('Worker', RoutingWorker)
  })
  afterEach(() => vi.unstubAllGlobals())
  it('terminates a failed worker, rejects callers and creates a fresh worker while ignoring old events', async () => {
    const { api, wrapper } = await mountRouting()
    const failed = api.route(request).catch(() => 'failed')
    const old = RoutingWorker.instances[0]!
    const oldMessage = old.onmessage
    const oldError = old.onerror
    oldError?.(new Event('error'))
    expect(await failed).toBe('failed')
    expect(old.terminate).toHaveBeenCalledOnce()
    const next = api.route({ ...request, requestId: 2 })
    const current = RoutingWorker.instances[1]!
    oldMessage?.(new MessageEvent('message', { data: { requestId: 2, lines: ['stale'] } }))
    oldError?.(new Event('error'))
    expect(current.terminate).not.toHaveBeenCalled()
    current.reply(2)
    expect(await next).toEqual([])
    wrapper.unmount()
  })
  it('settles every pending caller on cancellation/disposal and rejects starts after disposal', async () => {
    const { api, wrapper } = await mountRouting()
    const cancelled = api.route(request).catch(() => 'cancelled')
    api.cancel()
    expect(await cancelled).toBe('cancelled')
    const pending = api.route({ ...request, requestId: 2 }).catch(() => 'disposed')
    wrapper.unmount()
    expect(await pending).toBe('disposed')
    expect(api.isDisposed()).toBe(true)
    await expect(api.route(request)).rejects.toThrow('disposed')
    expect(RoutingWorker.instances).toHaveLength(2)
  })
  it('rejects a failed post without retaining its pending slot and permits subsequent requests', async () => {
    const { api, wrapper } = await mountRouting()
    const first = api.route(request)
    RoutingWorker.instances[0]!.reply(1)
    await first
    const worker = RoutingWorker.instances[0]!
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('clone failed')
    })
    await expect(api.route({ ...request, requestId: 2 })).rejects.toThrow('clone failed')
    const next = api.route({ ...request, requestId: 3 })
    worker.reply(3)
    expect(await next).toEqual([])
    wrapper.unmount()
  })
})
