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

type FrameState = { kind: 'idle' }
  | { kind: 'scheduled', handle: number, task: () => void }

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
  let state: FrameState = { kind: 'idle' }

  const flush = () => {
    if (state.kind === 'idle') {
      return
    }

    const pending = state
    state = { kind: 'idle' }

    if (cancelFrame) {
      cancelFrame(pending.handle)
    }

    pending.task()
  }

  const schedule = (task: () => void) => {
    if (!requestFrame || !cancelFrame) {
      task()
      return
    }

    if (state.kind === 'scheduled') {
      state.task = task
      return
    }

    const pending: Extract<FrameState, { kind: 'scheduled' }> = {
      kind: 'scheduled',
      handle: requestFrame(() => {
        if (state !== pending) {
          return
        }

        state = { kind: 'idle' }
        pending.task()
      }),
      task
    }
    state = pending
  }

  const cancel = () => {
    if (state.kind === 'idle') {
      return
    }

    const pending = state
    state = { kind: 'idle' }

    if (cancelFrame) {
      cancelFrame(pending.handle)
    }
  }

  return {
    cancel,
    flush,
    isPending: () => state.kind === 'scheduled',
    schedule
  }
}
