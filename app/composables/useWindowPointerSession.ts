import { onScopeDispose } from 'vue'
import { createAnimationFrameBatcher } from '~/utils/animation-frame'

export type PointerSessionCancelReason = 'cancelled' | 'lost-capture' | 'blurred' | 'replaced' | 'disposed'
type PointerSessionOptions = {
  captureTarget?: HTMLElement
  frameThrottle?: boolean
  onCancel?: (reason: PointerSessionCancelReason) => void
  onEnd?: () => void
  onFinish?: (event: PointerEvent) => void
  onMove: (event: PointerEvent) => void
}
type PointerSession = { kind: 'idle' | 'disposed' } | {
  kind: 'active'
  pointerId: number
  options: PointerSessionOptions
  cleanup: () => void
}
type PointerSessionEnd = { kind: 'finished', event: PointerEvent }
  | { kind: 'cancelled', reason: PointerSessionCancelReason }

export const useWindowPointerSession = () => {
  let state: PointerSession = { kind: 'idle' }
  let startRevision = 0
  const isDisposed = () => state.kind === 'disposed'
  const moveBatcher = createAnimationFrameBatcher()
  const endSession = (end: PointerSessionEnd) => {
    if (state.kind !== 'active') return
    const current = state
    state = end.kind === 'cancelled' && end.reason === 'disposed' ? { kind: 'disposed' } : { kind: 'idle' }
    current.cleanup()
    if (current.options.captureTarget?.hasPointerCapture(current.pointerId)) {
      current.options.captureTarget.releasePointerCapture(current.pointerId)
    }
    if (end.kind === 'finished') {
      moveBatcher.flush()
      current.options.onFinish?.(end.event)
    } else {
      moveBatcher.cancel()
      current.options.onCancel?.(end.reason)
    }
    current.options.onEnd?.()
  }
  const cancelPointerSession = () => endSession({ kind: 'cancelled', reason: 'cancelled' })
  const startPointerSession = (event: PointerEvent, options: PointerSessionOptions) => {
    if (!import.meta.client || isDisposed() || event.button !== 0) return
    const revision = ++startRevision
    endSession({ kind: 'cancelled', reason: 'replaced' })
    if (revision !== startRevision || isDisposed()) return
    const pointerId = event.pointerId
    const ownsEvent = (input: PointerEvent) => state === current && input.pointerId === pointerId
    const move = (input: PointerEvent) => {
      if (!ownsEvent(input)) return
      if (options.frameThrottle === true) moveBatcher.schedule(() => options.onMove(input))
      else options.onMove(input)
    }
    const finish = (input: PointerEvent) => {
      if (ownsEvent(input)) endSession({ kind: 'finished', event: input })
    }
    const cancel = (input: PointerEvent) => {
      if (ownsEvent(input)) cancelPointerSession()
    }
    const lostCapture = (input: PointerEvent) => {
      if (ownsEvent(input)) endSession({ kind: 'cancelled', reason: 'lost-capture' })
    }
    const blur = () => endSession({ kind: 'cancelled', reason: 'blurred' })
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', blur)
      options.captureTarget?.removeEventListener('lostpointercapture', lostCapture)
    }
    const current: Extract<PointerSession, { kind: 'active' }> = { kind: 'active', pointerId, options, cleanup }
    state = current
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', finish, { passive: true })
    window.addEventListener('pointercancel', cancel, { passive: true })
    window.addEventListener('blur', blur)
    options.captureTarget?.addEventListener('lostpointercapture', lostCapture)
    options.captureTarget?.setPointerCapture(pointerId)
  }
  onScopeDispose(() => {
    endSession({ kind: 'cancelled', reason: 'disposed' })
    state = { kind: 'disposed' }
  })
  return { startPointerSession, cancelPointerSession }
}
