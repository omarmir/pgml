import { useEventListener } from '@vueuse/core'
import { createAnimationFrameBatcher } from '~/utils/animation-frame'

type PointerSessionOptions = {
  frameThrottle?: boolean
  onEnd?: () => void
  onMove: (event: PointerEvent) => void
}

export const useWindowPointerSession = () => {
  const startPointerSession = ({ frameThrottle = false, onEnd, onMove }: PointerSessionOptions) => {
    if (!import.meta.client) {
      return
    }

    let isActive = true
    const moveBatcher = createAnimationFrameBatcher()
    let stopMoveListener = () => {}
    let stopUpListener = () => {}
    let stopCancelListener = () => {}

    const stopSession = () => {
      if (!isActive) {
        return
      }

      isActive = false
      moveBatcher.flush()
      stopMoveListener()
      stopUpListener()
      stopCancelListener()
      onEnd?.()
    }

    const handleMove = (event: PointerEvent) => {
      if (!isActive) {
        return
      }

      if (!frameThrottle) {
        onMove(event)
        return
      }

      moveBatcher.schedule(() => {
        onMove(event)
      })
    }

    stopMoveListener = useEventListener(window, 'pointermove', handleMove, {
      passive: true
    })
    stopUpListener = useEventListener(window, 'pointerup', stopSession, {
      passive: true
    })
    stopCancelListener = useEventListener(window, 'pointercancel', stopSession, {
      passive: true
    })
  }

  return {
    startPointerSession
  }
}
