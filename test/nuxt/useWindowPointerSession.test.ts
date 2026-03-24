import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useWindowPointerSession } from '../../app/composables/useWindowPointerSession'

describe('useWindowPointerSession', () => {
  it('tracks move events and ends the session on pointer completion', async () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()

    const wrapper = await mountSuspended(defineComponent({
      setup() {
        const { startPointerSession } = useWindowPointerSession()

        const start = () => {
          startPointerSession({
            onEnd,
            onMove
          })
        }

        return {
          start
        }
      },
      template: '<button data-testid="start-pointer-session" type="button" @click="start">Start</button>'
    }))

    await wrapper.get('[data-testid="start-pointer-session"]').trigger('click')
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 24,
      clientY: 32
    }))
    window.dispatchEvent(new PointerEvent('pointerup'))
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 40,
      clientY: 48
    }))

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('flushes the latest throttled move before ending the session', async () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()

    const wrapper = await mountSuspended(defineComponent({
      setup() {
        const { startPointerSession } = useWindowPointerSession()

        const start = () => {
          startPointerSession({
            frameThrottle: true,
            onEnd,
            onMove
          })
        }

        return {
          start
        }
      },
      template: '<button data-testid="start-throttled-pointer-session" type="button" @click="start">Start</button>'
    }))

    await wrapper.get('[data-testid="start-throttled-pointer-session"]').trigger('click')
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 48,
      clientY: 64
    }))
    window.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 72,
      clientY: 96
    }))
    window.dispatchEvent(new PointerEvent('pointerup'))

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenLastCalledWith(expect.objectContaining({
      clientX: 72,
      clientY: 96
    }))
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
