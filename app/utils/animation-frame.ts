type AnimationFrameBatcherOptions = {
  cancelFrame?: (handle: number) => void
  requestFrame?: (callback: FrameRequestCallback) => number
}

export type AnimationFrameBatcher = {
  cancel: () => void
  flush: () => void
  isPending: () => boolean
  schedule: (task: () => void) => void
}

export const createAnimationFrameBatcher = (
  options: AnimationFrameBatcherOptions = {}
): AnimationFrameBatcher => {
  const requestFrame = options.requestFrame
    || (typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : null)
  const cancelFrame = options.cancelFrame
    || (typeof globalThis.cancelAnimationFrame === 'function'
      ? globalThis.cancelAnimationFrame.bind(globalThis)
      : null)
  let frameHandle: number | null = null
  let pendingTask: (() => void) | null = null

  const runPendingTask = () => {
    const task = pendingTask

    pendingTask = null
    task?.()
  }

  const flush = () => {
    if (frameHandle !== null && cancelFrame) {
      cancelFrame(frameHandle)
    }

    frameHandle = null
    runPendingTask()
  }

  const schedule = (task: () => void) => {
    pendingTask = task

    if (!requestFrame || !cancelFrame) {
      flush()
      return
    }

    if (frameHandle !== null) {
      return
    }

    frameHandle = requestFrame(() => {
      frameHandle = null
      runPendingTask()
    })
  }

  const cancel = () => {
    if (frameHandle !== null && cancelFrame) {
      cancelFrame(frameHandle)
    }

    frameHandle = null
    pendingTask = null
  }

  return {
    cancel,
    flush,
    isPending: () => pendingTask !== null,
    schedule
  }
}
