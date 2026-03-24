import { describe, expect, it, vi } from 'vitest'

import { createAnimationFrameBatcher } from '../../app/utils/animation-frame'

describe('animation frame batcher', () => {
  it('coalesces multiple scheduled tasks into the latest callback for the frame', () => {
    const frameCallbacks: FrameRequestCallback[] = []
    const batcher = createAnimationFrameBatcher({
      cancelFrame: vi.fn(),
      requestFrame: (callback) => {
        frameCallbacks.push(callback)
        return frameCallbacks.length
      }
    })
    const firstTask = vi.fn()
    const secondTask = vi.fn()

    batcher.schedule(firstTask)
    batcher.schedule(secondTask)

    expect(frameCallbacks).toHaveLength(1)

    frameCallbacks[0]?.(16)

    expect(firstTask).not.toHaveBeenCalled()
    expect(secondTask).toHaveBeenCalledTimes(1)
  })

  it('flushes the pending task immediately and cancels the queued frame', () => {
    const cancelFrame = vi.fn()
    const batcher = createAnimationFrameBatcher({
      cancelFrame,
      requestFrame: () => 27
    })
    const task = vi.fn()

    batcher.schedule(task)
    batcher.flush()

    expect(cancelFrame).toHaveBeenCalledWith(27)
    expect(task).toHaveBeenCalledTimes(1)
    expect(batcher.isPending()).toBe(false)
  })

  it('cancels pending work without executing it', () => {
    const cancelFrame = vi.fn()
    const batcher = createAnimationFrameBatcher({
      cancelFrame,
      requestFrame: () => 9
    })
    const task = vi.fn()

    batcher.schedule(task)
    batcher.cancel()

    expect(cancelFrame).toHaveBeenCalledWith(9)
    expect(task).not.toHaveBeenCalled()
    expect(batcher.isPending()).toBe(false)
  })
})
