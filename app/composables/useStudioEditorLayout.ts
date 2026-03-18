import type { Ref } from 'vue'
import {
  clampStudioEditorWidth,
  getStudioLayoutColumns,
  studioCompactBreakpoint,
  studioEditorPanelMinWidth
} from '~/utils/studio-layout'

export const useStudioEditorLayout = () => {
  const layoutShellRef: Ref<HTMLDivElement | null> = ref(null)
  const viewportWidth: Ref<number> = ref(studioCompactBreakpoint)
  const editorPanelWidth: Ref<number> = ref(studioEditorPanelMinWidth)

  const isCompactStudioLayout = computed(() => viewportWidth.value < studioCompactBreakpoint)
  const studioLayoutStyle = computed(() => {
    return {
      gridTemplateColumns: getStudioLayoutColumns(editorPanelWidth.value, viewportWidth.value)
    }
  })

  const syncStudioViewport = () => {
    if (!import.meta.client) {
      return
    }

    viewportWidth.value = window.innerWidth

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
    if (isCompactStudioLayout.value || !layoutShellRef.value) {
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
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  onMounted(() => {
    syncStudioViewport()
    window.addEventListener('resize', syncStudioViewport)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', syncStudioViewport)
  })

  return {
    editorPanelWidth,
    isCompactStudioLayout,
    layoutShellRef,
    resizeEditorPanelBy,
    startEditorResize,
    studioLayoutStyle,
    syncStudioViewport,
    viewportWidth
  }
}
