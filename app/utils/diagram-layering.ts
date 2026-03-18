export const getDiagramNodeZIndex = (order: number) => {
  return Math.max(1, Math.round(order)) * 2
}

export const getDiagramConnectionZIndex = (fromOrder: number, toOrder: number) => {
  return Math.max(1, Math.min(Math.round(fromOrder), Math.round(toOrder))) * 2 + 1
}
