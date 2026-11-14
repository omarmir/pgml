import type { DiagramPoint, DiagramRect } from './diagram-routing'

type RouteSearchEntry = { index: number, distance: number, score: number }

const segmentIntersectsRect = (from: DiagramPoint, to: DiagramPoint, rect: DiagramRect, includeEdges = false) => {
  if (from.x === to.x) {
    const crossesX = includeEdges ? from.x >= rect.left && from.x <= rect.right : from.x > rect.left && from.x < rect.right
    return crossesX && Math.max(from.y, to.y) > rect.top && Math.min(from.y, to.y) < rect.bottom
  }

  const crossesY = includeEdges ? from.y >= rect.top && from.y <= rect.bottom : from.y > rect.top && from.y < rect.bottom
  return crossesY && Math.max(from.x, to.x) > rect.left && Math.min(from.x, to.x) < rect.right
}

const pathIntersectsRects = (points: DiagramPoint[], rects: DiagramRect[]) => points.some((point, index) => {
  const previous = points[index - 1]
  return previous && rects.some(rect => segmentIntersectsRect(previous, point, rect))
})

const getEndpointExit = (anchor: DiagramPoint, host: DiagramRect, obstacles: DiagramRect[]) => {
  const direction = Math.abs(anchor.x - host.left) < 0.5
    ? { x: -1, y: 0 }
    : Math.abs(anchor.x - host.right) < 0.5
      ? { x: 1, y: 0 }
      : Math.abs(anchor.y - host.top) < 0.5
        ? { x: 0, y: -1 }
        : { x: 0, y: 1 }
  let distance = 2

  for (const rect of obstacles) {
    if (direction.x !== 0 && anchor.y > rect.top && anchor.y < rect.bottom) {
      if (direction.x > 0 && rect.left >= anchor.x) distance = Math.min(distance, (rect.left - anchor.x) / 2)
      if (direction.x < 0 && rect.right <= anchor.x) distance = Math.min(distance, (anchor.x - rect.right) / 2)
    }
    if (direction.y !== 0 && anchor.x > rect.left && anchor.x < rect.right) {
      if (direction.y > 0 && rect.top >= anchor.y) distance = Math.min(distance, (rect.top - anchor.y) / 2)
      if (direction.y < 0 && rect.bottom <= anchor.y) distance = Math.min(distance, (anchor.y - rect.bottom) / 2)
    }
  }

  return { x: anchor.x + direction.x * distance, y: anchor.y + direction.y * distance }
}

const pushSearchEntry = (queue: RouteSearchEntry[], entry: RouteSearchEntry) => {
  let index = queue.length
  queue.push(entry)
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2)
    const parent = queue[parentIndex]
    if (!parent || parent.score < entry.score || (parent.score === entry.score && parent.distance >= entry.distance)) break
    queue[index] = parent
    index = parentIndex
  }
  queue[index] = entry
}

const popSearchEntry = (queue: RouteSearchEntry[]) => {
  const first = queue[0]
  const last = queue.pop()
  if (!last || queue.length === 0) return first
  let index = 0
  while (index * 2 + 1 < queue.length) {
    let childIndex = index * 2 + 1
    const left = queue[childIndex]
    const right = queue[childIndex + 1]
    if (left && right && (right.score < left.score || (right.score === left.score && right.distance > left.distance))) childIndex += 1
    const child = queue[childIndex]
    if (!child || last.score < child.score || (last.score === child.score && last.distance >= child.distance)) break
    queue[index] = child
    index = childIndex
  }
  queue[index] = last
  return first
}

const findOutsidePath = (
  from: DiagramPoint,
  to: DiagramPoint,
  hosts: { from: DiagramRect, to: DiagramRect },
  obstacles: DiagramRect[]
): DiagramPoint[] | null => {
  const start = getEndpointExit(from, hosts.from, obstacles)
  const end = getEndpointExit(to, hosts.to, obstacles)
  if (obstacles.some(rect => segmentIntersectsRect(from, start, rect) || segmentIntersectsRect(end, to, rect))) return null

  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap(rect => [rect.left - 2, rect.right + 2])])].sort((a, b) => a - b)
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap(rect => [rect.top - 2, rect.bottom + 2])])].sort((a, b) => a - b)
  const points = ys.flatMap(y => xs.map(x => ({ x, y })))
  const blocked = points.map(point => obstacles.some(rect => point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom))
  const startIndex = ys.indexOf(start.y) * xs.length + xs.indexOf(start.x)
  const endIndex = ys.indexOf(end.y) * xs.length + xs.indexOf(end.x)
  if (blocked[startIndex] || blocked[endIndex]) {
    const directPath = [from, to]
    return (from.x === to.x || from.y === to.y) && !pathIntersectsRects(directPath, obstacles) ? directPath : null
  }

  const distances = new Float64Array(points.length).fill(Number.POSITIVE_INFINITY)
  const parents = new Int32Array(points.length).fill(-1)
  const queue: RouteSearchEntry[] = []
  distances[startIndex] = 0
  pushSearchEntry(queue, { index: startIndex, distance: 0, score: Math.abs(start.x - end.x) + Math.abs(start.y - end.y) })

  while (queue.length > 0) {
    const entry = popSearchEntry(queue)
    if (!entry || entry.distance !== distances[entry.index]) continue
    if (entry.index === endIndex) {
      const route = [to]
      let index = endIndex
      while (index >= 0) {
        const point = points[index]
        if (point) route.push(point)
        const parent = parents[index]
        if (parent === undefined) return null
        index = parent
      }
      route.push(from)
      route.reverse()
      return route.filter((point, index) => {
        const previous = route[index - 1]
        const next = route[index + 1]
        return !previous || !next || !((point.x === previous.x && point.x === next.x) || (point.y === previous.y && point.y === next.y))
      })
    }

    const point = points[entry.index]
    if (!point) continue
    const column = entry.index % xs.length
    const neighbors = [entry.index - xs.length, entry.index + xs.length]
    if (column > 0) neighbors.push(entry.index - 1)
    if (column + 1 < xs.length) neighbors.push(entry.index + 1)
    for (const index of neighbors) {
      const next = points[index]
      if (!next || blocked[index] || obstacles.some(rect => segmentIntersectsRect(point, next, rect, true))) continue
      const distance = entry.distance + Math.abs(next.x - point.x) + Math.abs(next.y - point.y)
      const previousDistance = distances[index]
      if (previousDistance === undefined || distance >= previousDistance) continue
      distances[index] = distance
      parents[index] = entry.index
      pushSearchEntry(queue, { index, distance, score: distance + Math.abs(next.x - end.x) + Math.abs(next.y - end.y) })
    }
  }

  return null
}

export const avoidDiagramEndpointHostIntersections = (
  points: DiagramPoint[],
  hosts: { from: DiagramRect, to: DiagramRect },
  headerBands: DiagramRect[]
) => {
  const endpointHosts = [hosts.from, hosts.to]
  const from = points[0]
  const to = points.at(-1)
  if (!from || !to || !pathIntersectsRects(points, endpointHosts)) return points

  const outsidePath = findOutsidePath(from, to, hosts, [...endpointHosts, ...headerBands])
  if (outsidePath) return outsidePath

  // Covered endpoints cannot escape overlapping cards; preserve their attachment when no outside route exists.
  const hostOnlyPath = findOutsidePath(from, to, hosts, endpointHosts)
  return hostOnlyPath ? hostOnlyPath : points
}
