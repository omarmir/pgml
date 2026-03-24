import type { PgmlNodeProperties, PgmlSourceRange } from '~/utils/pgml'

export type DiagramGpuSelection = {
  kind: 'group'
  id: string
} | {
  kind: 'object'
  id: string
} | {
  kind: 'table'
  tableId: string
} | {
  kind: 'column'
  tableId: string
  columnName: string
} | {
  kind: 'attachment'
  tableId: string
  attachmentId: string
}

export type DiagramGpuImpactTarget = {
  columnName: string | null
  tableId: string
}

export type DiagramGpuRowBadge = {
  color: string
  label: string
}

export type DiagramGpuRow = {
  accentColor?: string
  attachmentId?: string
  badges: DiagramGpuRowBadge[]
  columnName?: string
  highlightColor?: string | null
  kindLabel?: string
  key: string
  kind: 'attachment' | 'column'
  sourceRange?: PgmlSourceRange
  subtitle: string
  tableId: string
  title: string
}

export type DiagramGpuGroupNode = {
  color: string
  columnCount: number
  height: number
  id: string
  masonry: boolean
  minHeight: number
  minWidth: number
  note: string | null
  tableCount: number
  tableIds: string[]
  tableWidthScale: number
  title: string
  width: number
  x: number
  y: number
}

export type DiagramGpuTableCard = {
  color: string
  groupId: string | null
  headerHeight: number
  height: number
  id: string
  minHeight: number
  rows: DiagramGpuRow[]
  schema: string
  sourceRange?: PgmlSourceRange
  title: string
  width: number
  x: number
  y: number
}

export type DiagramGpuObjectNode = {
  collapsed: boolean
  color: string
  details: string[]
  expandedHeight: number
  height: number
  id: string
  impactTargets: DiagramGpuImpactTarget[]
  kindLabel: string
  minHeight: number
  minWidth: number
  sourceRange?: PgmlSourceRange
  subtitle: string
  tableIds: string[]
  title: string
  width: number
  x: number
  y: number
}

export type DiagramGpuConnectionPoint = {
  x: number
  y: number
}

export type DiagramGpuConnectionLine = {
  animated: boolean
  bounds: {
    maxX: number
    maxY: number
    minX: number
    minY: number
  }
  color: string
  dashPattern: string
  dashed: boolean
  fromOwnerNodeId: string | null
  key: string
  points: DiagramGpuConnectionPoint[]
  toOwnerNodeId: string | null
  zIndex: number
}

export type DiagramGpuWorldBounds = {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

export type DiagramGpuSceneSnapshot = {
  connections: DiagramGpuConnectionLine[]
  groups: DiagramGpuGroupNode[]
  objects: DiagramGpuObjectNode[]
  tables: DiagramGpuTableCard[]
  worldBounds: DiagramGpuWorldBounds
}

export type DiagramGpuNodeLayoutState = {
  collapsed?: boolean
  color: string
  height: number
  id: string
  kind: 'group' | 'object' | 'table'
  minHeight: number
  minWidth: number
  tableColumns?: number
  tableWidthScale?: number
  title: string
  visible: boolean
  width: number
  x: number
  y: number
}

export const diagramPalette = ['#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#ef4444', '#ec4899', '#f97316']
export const diagramSchemaBadgePalette = ['#0f766e', '#f59e0b', '#2563eb', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#65a30d']
export const diagramGroupTableWidth = 232
export const diagramGroupTableGap = 16
export const diagramGroupHorizontalPadding = 20
export const diagramGroupHeaderHeight = 60
export const diagramGroupVerticalPadding = 18
export const diagramTableHeaderHeight = 52
export const diagramTableRowHeight = 31
export const diagramObjectRowHeight = 18
export const diagramObjectHeaderHeight = 44
export const diagramObjectMinHeight = 104
export const diagramObjectCollapsedHeight = 58
export const diagramMinScale = 0.32
export const diagramMaxScale = 1.95
export const diagramZoomStep = 0.08
export const diagramSpatialGridCellSize = 320
export const diagramNodeViewportOverscan = 440
export const diagramLineViewportOverscan = 520
export const diagramBackgroundColor = '#09131a'
export const diagramPanelSurfaceColor = 'rgba(10, 17, 24, 0.94)'
export const diagramDotColor = 'rgba(148, 163, 184, 0.2)'
export const diagramSurfaceColor = '#12232d'
export const diagramTableSurfaceColor = '#11212c'
export const diagramRowSurfaceColor = '#0c1820'
export const diagramDividerColor = 'rgba(148, 163, 184, 0.14)'
export const diagramRailColor = 'rgba(148, 163, 184, 0.28)'
export const diagramTextColor = '#e2edf7'
export const diagramMutedTextColor = '#9cb0c2'
export const diagramLabelTextColor = '#7c95aa'
export const diagramGroupFillAlpha = 0.24
export const diagramGridDotSpacing = 18

const hashDiagramString = (value: string) => {
  let hash = 0

  for (const character of value) {
    hash = ((hash << 5) - hash) + character.charCodeAt(0)
    hash |= 0
  }

  return Math.abs(hash)
}

export const getDiagramSchemaBadgeColor = (schemaName: string, knownSchemas: string[] = []) => {
  const normalizedValue = schemaName.trim() || 'public'
  const paletteIndex = knownSchemas.includes(normalizedValue)
    ? knownSchemas.indexOf(normalizedValue)
    : hashDiagramString(normalizedValue)

  return diagramSchemaBadgePalette[paletteIndex % diagramSchemaBadgePalette.length] || '#0f766e'
}

export const estimateDiagramTableHeight = (rowCount: number) => {
  return diagramTableHeaderHeight + rowCount * diagramTableRowHeight
}

export const getStoredGroupId = (groupName: string) => `group:${groupName}`

export const normalizeDiagramNodeLayoutProperties = (
  entries: DiagramGpuNodeLayoutState[],
  previousProperties: Record<string, PgmlNodeProperties>
) => {
  const nextProperties = Object.entries(previousProperties).reduce<Record<string, PgmlNodeProperties>>((result, [key, value]) => {
    result[key] = { ...value }
    return result
  }, {})

  entries.forEach((entry) => {
    const previousEntry = nextProperties[entry.id] || {}

    nextProperties[entry.id] = {
      ...previousEntry,
      collapsed: typeof entry.collapsed === 'boolean' ? entry.collapsed : previousEntry.collapsed,
      color: entry.color,
      height: entry.height,
      tableColumns: typeof entry.tableColumns === 'number' ? entry.tableColumns : previousEntry.tableColumns,
      tableWidthScale: typeof entry.tableWidthScale === 'number' ? entry.tableWidthScale : previousEntry.tableWidthScale,
      visible: entry.visible,
      width: entry.width,
      x: entry.x,
      y: entry.y
    }
  })

  return nextProperties
}
