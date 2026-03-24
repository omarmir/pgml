import type { PgmlColumn, PgmlSourceRange } from '~/utils/pgml'

export type TableAttachmentKind = 'Index' | 'Constraint' | 'Function' | 'Procedure' | 'Trigger' | 'Sequence'

export type TableAttachmentFlag = {
  key: string
  label: string
  color: string
}

export type TableAttachment = {
  id: string
  kind: TableAttachmentKind
  title: string
  subtitle: string
  details: string[]
  tableId: string
  color: string
  flags: TableAttachmentFlag[]
  sourceRange?: PgmlSourceRange
}

export type TableRow = {
  kind: 'column'
  key: string
  tableId: string
  column: PgmlColumn
} | {
  kind: 'attachment'
  key: string
  tableId: string
  attachment: TableAttachment
}

export type TableGroupMasonryItem = {
  height: number
  id: string
}

export type TableGroupMasonryPlacement = {
  columnIndex: number
  height: number
  id: string
  x: number
  y: number
}

export type TableGroupMasonryLayout = {
  columnCount: number
  contentHeight: number
  contentWidth: number
  placements: Record<string, TableGroupMasonryPlacement>
}

const masonryCompactionHeightSlackRatio = 1.15

const buildFixedTableGroupMasonryLayout = (
  items: TableGroupMasonryItem[],
  columnCount: number,
  columnWidth: number,
  gap: number
): TableGroupMasonryLayout => {
  const safeItemCount = Math.max(items.length, 1)
  const safeColumnCount = Math.max(1, Math.min(Math.round(columnCount), safeItemCount))
  const columnHeights = Array.from({
    length: safeColumnCount
  }, () => 0)
  const placements = items.reduce<Record<string, TableGroupMasonryPlacement>>((entries, item) => {
    const shortestColumnIndex = columnHeights.reduce((bestIndex, currentHeight, index) => {
      const bestHeight = columnHeights[bestIndex] || 0

      return currentHeight < bestHeight ? index : bestIndex
    }, 0)
    const currentColumnHeight = columnHeights[shortestColumnIndex] || 0

    entries[item.id] = {
      columnIndex: shortestColumnIndex,
      height: item.height,
      id: item.id,
      x: shortestColumnIndex * (columnWidth + gap),
      y: currentColumnHeight
    }

    columnHeights[shortestColumnIndex] = currentColumnHeight + item.height + gap
    return entries
  }, {})
  const tallestColumnHeight = columnHeights.length
    ? Math.max(...columnHeights)
    : 0

  return {
    columnCount: safeColumnCount,
    contentHeight: items.length > 0 ? Math.max(0, tallestColumnHeight - gap) : 0,
    contentWidth: safeColumnCount * columnWidth + Math.max(0, safeColumnCount - 1) * gap,
    placements
  }
}

const getTableGroupMasonryUnusedArea = (
  layout: TableGroupMasonryLayout,
  items: TableGroupMasonryItem[],
  columnWidth: number
) => {
  const boundingArea = layout.contentWidth * layout.contentHeight
  const contentArea = items.reduce((sum, item) => sum + item.height * columnWidth, 0)

  return Math.max(0, boundingArea - contentArea)
}

export const buildTableGroupMasonryLayout = (
  items: TableGroupMasonryItem[],
  columnCount: number,
  columnWidth: number,
  gap: number
): TableGroupMasonryLayout => {
  const safeItemCount = Math.max(items.length, 1)
  const maxColumnCount = Math.max(1, Math.min(Math.round(columnCount), safeItemCount))
  const candidates = Array.from({ length: maxColumnCount }, (_value, index) => {
    return buildFixedTableGroupMasonryLayout(items, index + 1, columnWidth, gap)
  })
  const minimumHeight = candidates.reduce((minHeight, candidate) => {
    return Math.min(minHeight, candidate.contentHeight)
  }, Number.POSITIVE_INFINITY)
  const acceptableCandidates = candidates.filter((candidate) => {
    return candidate.contentHeight <= minimumHeight * masonryCompactionHeightSlackRatio
  })

  return acceptableCandidates.reduce((best, candidate) => {
    const bestUnusedArea = getTableGroupMasonryUnusedArea(best, items, columnWidth)
    const candidateUnusedArea = getTableGroupMasonryUnusedArea(candidate, items, columnWidth)

    if (candidateUnusedArea !== bestUnusedArea) {
      return candidateUnusedArea < bestUnusedArea ? candidate : best
    }

    if (candidate.contentHeight !== best.contentHeight) {
      return candidate.contentHeight < best.contentHeight ? candidate : best
    }

    if (candidate.columnCount !== best.columnCount) {
      return candidate.columnCount > best.columnCount ? candidate : best
    }

    return candidate
  }, acceptableCandidates[0] || buildFixedTableGroupMasonryLayout(items, 1, columnWidth, gap))
}
