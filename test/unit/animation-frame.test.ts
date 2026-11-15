import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAnimationFrameBatcher } from '../../app/utils/animation-frame'

afterEach(() => vi.unstubAllGlobals())

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

  it('does not let a cancelled callback run a newer scheduled task', () => {
    const callbacks: FrameRequestCallback[] = []
    const batcher = createAnimationFrameBatcher({
      cancelFrame: vi.fn(),
      requestFrame: callback => callbacks.push(callback)
    })
    const cancelledTask = vi.fn()
    const newTask = vi.fn()

    batcher.schedule(cancelledTask)
    batcher.cancel()
    batcher.schedule(newTask)
    callbacks[0]?.(16)

    expect(cancelledTask).not.toHaveBeenCalled()
    expect(newTask).not.toHaveBeenCalled()
    expect(batcher.isPending()).toBe(true)

    callbacks[1]?.(32)
    expect(newTask).toHaveBeenCalledTimes(1)
    expect(batcher.isPending()).toBe(false)
  })

  it.each(['frame', 'flush'])('preserves a task scheduled from inside a %s callback', (execution) => {
    const callbacks: FrameRequestCallback[] = []
    const batcher = createAnimationFrameBatcher({
      cancelFrame: vi.fn(),
      requestFrame: callback => callbacks.push(callback)
    })
    const nextTask = vi.fn()

    batcher.schedule(() => {
      expect(batcher.isPending()).toBe(false)
      batcher.schedule(nextTask)
    })

    if (execution === 'frame') {
      callbacks[0]?.(16)
    } else {
      batcher.flush()
    }

    expect(batcher.isPending()).toBe(true)
    expect(callbacks).toHaveLength(2)
    expect(nextTask).not.toHaveBeenCalled()

    callbacks[1]?.(32)
    expect(nextTask).toHaveBeenCalledTimes(1)
  })

  it('runs immediately when browser frame scheduling is unavailable', () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.stubGlobal('cancelAnimationFrame', undefined)
    const batcher = createAnimationFrameBatcher()
    const task = vi.fn()

    batcher.schedule(task)
    batcher.flush()
    batcher.cancel()

    expect(task).toHaveBeenCalledTimes(1)
    expect(batcher.isPending()).toBe(false)
  })
})
