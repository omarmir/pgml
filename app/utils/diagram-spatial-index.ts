export type DiagramSpatialBounds = {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

export type DiagramSpatialEntry<T extends string = string> = DiagramSpatialBounds & {
  id: T
}

type DiagramSpatialBucketKey = `${number}:${number}`

export type DiagramSpatialGridIndex<T extends string = string> = {
  bucketCellSize: number
  buckets: Map<DiagramSpatialBucketKey, DiagramSpatialEntry<T>[]>
  entriesById: Map<T, DiagramSpatialEntry<T>>
}

const toBucketKey = (column: number, row: number): DiagramSpatialBucketKey => `${column}:${row}`

export const doesDiagramSpatialEntryIntersectBounds = (
  entry: DiagramSpatialBounds,
  bounds: DiagramSpatialBounds
) => {
  return (
    entry.maxX >= bounds.minX
    && entry.minX <= bounds.maxX
    && entry.maxY >= bounds.minY
    && entry.minY <= bounds.maxY
  )
}

export const buildDiagramSpatialGridIndex = <T extends string>(
  entries: DiagramSpatialEntry<T>[],
  bucketCellSize: number
): DiagramSpatialGridIndex<T> => {
  const safeBucketCellSize = Math.max(1, Math.round(bucketCellSize))
  const buckets = new Map<DiagramSpatialBucketKey, DiagramSpatialEntry<T>[]>()
  const entriesById = new Map<T, DiagramSpatialEntry<T>>()

  entries.forEach((entry) => {
    entriesById.set(entry.id, entry)

    const minColumn = Math.floor(entry.minX / safeBucketCellSize)
    const maxColumn = Math.floor(entry.maxX / safeBucketCellSize)
    const minRow = Math.floor(entry.minY / safeBucketCellSize)
    const maxRow = Math.floor(entry.maxY / safeBucketCellSize)

    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        const bucketKey = toBucketKey(column, row)
        const bucketEntries = buckets.get(bucketKey) || []

        bucketEntries.push(entry)
        buckets.set(bucketKey, bucketEntries)
      }
    }
  })

  return {
    bucketCellSize: safeBucketCellSize,
    buckets,
    entriesById
  }
}

export const queryDiagramSpatialGridIndex = <T extends string>(
  index: DiagramSpatialGridIndex<T>,
  bounds: DiagramSpatialBounds
) => {
  const minColumn = Math.floor(bounds.minX / index.bucketCellSize)
  const maxColumn = Math.floor(bounds.maxX / index.bucketCellSize)
  const minRow = Math.floor(bounds.minY / index.bucketCellSize)
  const maxRow = Math.floor(bounds.maxY / index.bucketCellSize)
  const seenIds = new Set<T>()
  const results: DiagramSpatialEntry<T>[] = []

  for (let column = minColumn; column <= maxColumn; column += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      const bucketEntries = index.buckets.get(toBucketKey(column, row))

      if (!bucketEntries) {
        continue
      }

      bucketEntries.forEach((entry) => {
        if (seenIds.has(entry.id) || !doesDiagramSpatialEntryIntersectBounds(entry, bounds)) {
          return
        }

        seenIds.add(entry.id)
        results.push(entry)
      })
    }
  }

  return results
}
