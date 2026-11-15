import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWindowPointerSession } from '../../app/composables/useWindowPointerSession'

const pointer = (type: string, pointerId = 7, clientX = 0) => new PointerEvent(type, { pointerId, clientX, button: 0 })
const mountSession = async () => {
  let api!: ReturnType<typeof useWindowPointerSession>
  const wrapper = await mountSuspended(defineComponent({ setup() {
    api = useWindowPointerSession()
    return () => null
  } }))
  return { api, wrapper }
}
describe('window pointer ownership', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('ignores unrelated pointers and finishes its own session once', async () => {
    const { api, wrapper } = await mountSession()
    const onMove = vi.fn()
    const onFinish = vi.fn()
    api.startPointerSession(pointer('pointerdown'), { onMove, onFinish })
    window.dispatchEvent(pointer('pointermove', 8))
    window.dispatchEvent(pointer('pointerup', 8))
    expect(onMove).not.toHaveBeenCalled()
    expect(onFinish).not.toHaveBeenCalled()
    window.dispatchEvent(pointer('pointermove', 7, 42))
    window.dispatchEvent(pointer('pointerup'))
    window.dispatchEvent(pointer('pointerup'))
    expect(onMove).toHaveBeenCalledOnce()
    expect(onFinish).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
  it('flushes the latest queued move before finish and discards moves on replacement or cancellation', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { api, wrapper } = await mountSession()
    const calls: string[] = []
    const options = { frameThrottle: true, onMove: (event: PointerEvent) => calls.push(`move:${event.clientX}`),
      onFinish: () => calls.push('finished'), onCancel: (reason: string) => calls.push(reason) }
    api.startPointerSession(pointer('pointerdown'), options)
    window.dispatchEvent(pointer('pointermove', 7, 10))
    window.dispatchEvent(pointer('pointermove', 7, 20))
    window.dispatchEvent(pointer('pointerup'))
    expect(calls).toEqual(['move:20', 'finished'])
    api.startPointerSession(pointer('pointerdown'), options)
    window.dispatchEvent(pointer('pointermove'))
    api.startPointerSession(pointer('pointerdown', 8), options)
    window.dispatchEvent(pointer('pointermove', 8))
    window.dispatchEvent(pointer('pointercancel', 8))
    expect(calls).toEqual(['move:20', 'finished', 'replaced', 'cancelled'])
    wrapper.unmount()
  })
  it('cancels on capture loss, blur and scope disposal without committing', async () => {
    const { api, wrapper } = await mountSession()
    const target = document.createElement('div')
    target.setPointerCapture = vi.fn()
    target.hasPointerCapture = () => true
    target.releasePointerCapture = vi.fn()
    const onCancel = vi.fn()
    const onFinish = vi.fn()
    const onMove = vi.fn()
    const options = { captureTarget: target, onCancel, onFinish, onMove }
    api.startPointerSession(pointer('pointerdown'), options)
    target.dispatchEvent(pointer('lostpointercapture', 8))
    expect(onCancel).not.toHaveBeenCalled()
    target.dispatchEvent(pointer('lostpointercapture'))
    api.startPointerSession(pointer('pointerdown'), options)
    window.dispatchEvent(new Event('blur'))
    api.startPointerSession(pointer('pointerdown'), options)
    wrapper.unmount()
    window.dispatchEvent(pointer('pointermove'))
    window.dispatchEvent(pointer('pointerup'))
    api.startPointerSession(pointer('pointerdown'), options)
    expect(onCancel.mock.calls.flat()).toEqual(['lost-capture', 'blurred', 'disposed'])
    expect(onFinish).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()
    expect(target.releasePointerCapture).toHaveBeenCalledTimes(3)
  })
  for (const callback of ['onCancel', 'onEnd'] as const) {
    it(`keeps the latest reentrant ${callback} owner and removes every registered callback`, async () => {
      const { api, wrapper } = await mountSession()
      const add = vi.spyOn(window, 'addEventListener')
      const remove = vi.spyOn(window, 'removeEventListener')
      const calls: string[] = []
      api.startPointerSession(pointer('pointerdown'), {
        onMove: () => calls.push('initial'),
        [callback]: () => api.startPointerSession(pointer('pointerdown', 8), { onMove: () => calls.push('nested') })
      })
      api.startPointerSession(pointer('pointerdown', 8), { onMove: () => calls.push('outer') })
      window.dispatchEvent(pointer('pointermove', 8))
      expect(calls).toEqual(['nested'])
      wrapper.unmount()
      for (const [type, listener] of add.mock.calls) {
        expect(remove.mock.calls.some(([removedType, removed]) => type === removedType && listener === removed)).toBe(true)
      }
      add.mockRestore()
      remove.mockRestore()
    })
  }
})
