export type DiagramTouchPoint = Readonly<{
  x: number
  y: number
}>

export type DiagramTouchGesture = Readonly<{
  center: DiagramTouchPoint
  distance: number
}>

export type DiagramPinchViewportTransform = Readonly<{
  pan: DiagramTouchPoint
  scale: number
}>

type DiagramPinchViewportTransformOptions = Readonly<{
  currentCenter: DiagramTouchPoint
  currentDistance: number
  initialCenter: DiagramTouchPoint
  initialDistance: number
  initialPan: DiagramTouchPoint
  initialScale: number
  maxScale: number
  minScale: number
}>

const clampScale = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value))
}

export const getDiagramTouchGesture = (
  firstPoint: DiagramTouchPoint,
  secondPoint: DiagramTouchPoint
): DiagramTouchGesture => {
  return {
    center: {
      x: (firstPoint.x + secondPoint.x) / 2,
      y: (firstPoint.y + secondPoint.y) / 2
    },
    distance: Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y)
  }
}

export const getDiagramPinchViewportTransform = ({
  currentCenter,
  currentDistance,
  initialCenter,
  initialDistance,
  initialPan,
  initialScale,
  maxScale,
  minScale
}: DiagramPinchViewportTransformOptions): DiagramPinchViewportTransform => {
  const safeInitialDistance = initialDistance > 0 ? initialDistance : currentDistance || 1
  const normalizedScale = Number(
    clampScale(initialScale * (currentDistance / safeInitialDistance), minScale, maxScale).toFixed(2)
  )
  const planeX = (initialCenter.x - initialPan.x) / initialScale
  const planeY = (initialCenter.y - initialPan.y) / initialScale

  return {
    pan: {
      x: Math.round(currentCenter.x - planeX * normalizedScale),
      y: Math.round(currentCenter.y - planeY * normalizedScale)
    },
    scale: normalizedScale
  }
}
