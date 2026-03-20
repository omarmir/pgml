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
  const isEditorPanelVisible: Ref<boolean> = ref(true)

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
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const showEditorPanel = () => {
    isEditorPanelVisible.value = true
  }

  const hideEditorPanel = () => {
    isEditorPanelVisible.value = false
  }

  const toggleEditorPanelVisibility = () => {
    isEditorPanelVisible.value = !isEditorPanelVisible.value
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
