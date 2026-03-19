const foregroundBaseZIndex = 1000
const backgroundMaxZIndex = foregroundBaseZIndex - 1
const connectionZIndex = foregroundBaseZIndex + 1

export const getDiagramGroupBackgroundZIndex = (order: number) => {
  return Math.max(1, Math.min(backgroundMaxZIndex, Math.round(order)))
}

export const getDiagramNodeZIndex = (order: number) => {
  return foregroundBaseZIndex + Math.max(1, Math.round(order)) * 2
}

export const getDiagramConnectionZIndex = (_fromOrder: number, _toOrder: number) => {
  return connectionZIndex
}
