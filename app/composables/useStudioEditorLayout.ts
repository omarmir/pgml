import type { Ref } from 'vue'
import { useEventListener, useResizeObserver, useToggle, useWindowSize } from '@vueuse/core'
import {
  clampStudioEditorWidth,
  getStudioLayoutColumns,
  studioCompactBreakpoint,
  studioEditorPanelMinWidth
} from '~/utils/studio-layout'

export const useStudioEditorLayout = () => {
  const layoutShellRef: Ref<HTMLDivElement | null> = ref(null)
  const editorPanelWidth: Ref<number> = ref(studioEditorPanelMinWidth)
  const isEditorPanelVisible: Ref<boolean> = ref(true)
  const { width: viewportWidth } = useWindowSize({
    initialWidth: studioCompactBreakpoint
  })
  const toggleEditorPanel = useToggle(isEditorPanelVisible)

  const isCompactStudioLayout = computed(() => viewportWidth.value < studioCompactBreakpoint)
  const studioLayoutStyle = computed(() => {
    if (!isEditorPanelVisible.value) {
      return {
        gridTemplateColumns: '1fr'
      }
    }

    return {
      gridTemplateColumns: getStudioLayoutColumns(editorPanelWidth.value, viewportWidth.value)
    }
  })

  const syncStudioViewport = () => {
    if (!layoutShellRef.value) {
      return
    }

    editorPanelWidth.value = clampStudioEditorWidth(
      editorPanelWidth.value,
      layoutShellRef.value.clientWidth
    )
  }

  const resizeEditorPanelBy = (delta: number) => {
    if (isCompactStudioLayout.value || !layoutShellRef.value) {
      return
    }

    editorPanelWidth.value = clampStudioEditorWidth(
      editorPanelWidth.value + delta,
      layoutShellRef.value.clientWidth
    )
  }

  const startEditorResize = (event: PointerEvent) => {
    if (isCompactStudioLayout.value || !isEditorPanelVisible.value || !layoutShellRef.value) {
      return
    }

    event.preventDefault()
    const originX = event.clientX
    const originWidth = editorPanelWidth.value
    const containerWidth = layoutShellRef.value.clientWidth

    const onMove = (moveEvent: PointerEvent) => {
      editorPanelWidth.value = clampStudioEditorWidth(
        originWidth + moveEvent.clientX - originX,
        containerWidth
      )
    }

    const onUp = () => {
      stopPointerMove()
      stopPointerUp()
    }

    const stopPointerMove = useEventListener(window, 'pointermove', onMove)
    const stopPointerUp = useEventListener(window, 'pointerup', onUp, {
      once: true
    })
  }

  const showEditorPanel = () => {
    isEditorPanelVisible.value = true
  }

  const hideEditorPanel = () => {
    isEditorPanelVisible.value = false
  }

  const toggleEditorPanelVisibility = () => {
    toggleEditorPanel()
  }

  watch(viewportWidth, () => {
    syncStudioViewport()
  }, {
    immediate: true
  })

  useResizeObserver(layoutShellRef, () => {
    syncStudioViewport()
  })

  return {
    editorPanelWidth,
    hideEditorPanel,
    isEditorPanelVisible,
    isCompactStudioLayout,
    layoutShellRef,
    resizeEditorPanelBy,
    showEditorPanel,
    startEditorResize,
    studioLayoutStyle,
    syncStudioViewport,
    toggleEditorPanelVisibility,
    viewportWidth
  }
}
