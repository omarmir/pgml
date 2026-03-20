import { useEventListener } from '@vueuse/core'

type PointerSessionOptions = {
  onEnd?: () => void
  onMove: (event: PointerEvent) => void
}

export const useWindowPointerSession = () => {
  const startPointerSession = ({ onEnd, onMove }: PointerSessionOptions) => {
    if (!import.meta.client) {
      return
    }

    let isActive = true
    let stopMoveListener = () => {}
    let stopUpListener = () => {}
    let stopCancelListener = () => {}

    const stopSession = () => {
      if (!isActive) {
        return
      }

      isActive = false
      stopMoveListener()
      stopUpListener()
      stopCancelListener()
      onEnd?.()
    }

    stopMoveListener = useEventListener(window, 'pointermove', onMove, {
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
