type DiagramViewportFitOptions = {
  bounds: {
    height: number
    width: number
    x: number
    y: number
  }
  maxScale: number
  padding?: number
  viewportHeight: number
  viewportInsetRight?: number
  viewportWidth: number
}

export const getDiagramViewportFitTransform = ({
  bounds,
  maxScale,
  padding = 40,
  viewportHeight,
  viewportInsetRight = 0,
  viewportWidth
}: DiagramViewportFitOptions) => {
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)
  const availableWidth = Math.max(1, viewportWidth - Math.max(0, viewportInsetRight) - padding * 2)
  const availableHeight = Math.max(1, viewportHeight - padding * 2)
  const scale = Math.min(availableWidth / width, availableHeight / height, maxScale)

  return {
    panX: padding + (availableWidth - width * scale) / 2 - bounds.x * scale,
    panY: padding + (availableHeight - height * scale) / 2 - bounds.y * scale,
    scale
  }
}
