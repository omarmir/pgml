export const studioEditorPanelMinWidth = 320
export const studioCanvasMinWidth = 420
export const studioCompactBreakpoint = 1100
export const studioResizeHandleWidth = 10

export const clampStudioEditorWidth = (nextWidth: number, containerWidth: number) => {
  const maximumEditorWidth = Math.max(
    studioEditorPanelMinWidth,
    containerWidth - studioResizeHandleWidth - studioCanvasMinWidth
  )

  return Math.min(
    Math.max(nextWidth, studioEditorPanelMinWidth),
    maximumEditorWidth
  )
}

export const getStudioLayoutColumns = (editorWidth: number, viewportWidth: number) => {
  if (viewportWidth < studioCompactBreakpoint) {
    return '1fr'
  }

  return `${editorWidth}px ${studioResizeHandleWidth}px minmax(0, 1fr)`
}
