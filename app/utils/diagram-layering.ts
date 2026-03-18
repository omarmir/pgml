const foregroundBaseZIndex = 1000
const backgroundMaxZIndex = foregroundBaseZIndex - 1

export const getDiagramGroupBackgroundZIndex = (order: number) => {
  return Math.max(1, Math.min(backgroundMaxZIndex, Math.round(order)))
}

export const getDiagramNodeZIndex = (order: number) => {
  return foregroundBaseZIndex + Math.max(1, Math.round(order)) * 2
}

export const getDiagramConnectionZIndex = (fromOrder: number, toOrder: number) => {
  return foregroundBaseZIndex + Math.max(1, Math.min(Math.round(fromOrder), Math.round(toOrder))) * 2 + 1
}
