<script setup lang="ts">
import type {
  PgmlColumn,
  PgmlCustomType,
  PgmlNodeProperties,
  PgmlRoutine,
  PgmlSchemaModel,
  PgmlSequence,
  PgmlSourceRange
} from '~/utils/pgml'
import { getRasterExportPlan } from '~/utils/diagram-export'
import { normalizeSvgColor, normalizeSvgPaint, parseCssLinearGradient } from '~/utils/svg-paint'

const { model } = defineProps<{
  model: PgmlSchemaModel
}>()
const emit = defineEmits<{
  focusSource: [sourceRange: PgmlSourceRange]
}>()

type CanvasNodeKind = 'group' | 'object'
type ObjectKind = 'Index' | 'Constraint' | 'Function' | 'Procedure' | 'Trigger' | 'Sequence' | 'Custom Type'
type TableAttachmentKind = 'Index' | 'Constraint' | 'Function' | 'Procedure' | 'Trigger' | 'Sequence'
type ImpactTarget = {
  tableId: string
  columnName: string | null
}

type TableAttachmentFlag = {
  key: string
  label: string
  color: string
}

type TableAttachment = {
  id: string
  kind: TableAttachmentKind
  title: string
  subtitle: string
  details: string[]
  tableId: string
  color: string
  flags: TableAttachmentFlag[]
}

type TableRow = {
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

type CanvasNodeState = {
  id: string
  kind: CanvasNodeKind
  objectKind?: ObjectKind
  collapsed: boolean
  title: string
  subtitle: string
  details: string[]
  x: number
  y: number
  width: number
  height: number
  expandedHeight?: number
  color: string
  tableIds: string[]
  impactTargets?: ImpactTarget[]
  tableCount?: number
  columnCount?: number
  note?: string | null
  minWidth?: number
  minHeight?: number
  hasStoredLayout?: boolean
  sourceRange?: PgmlSourceRange
}

type ConnectionLine = {
  key: string
  path: string
  color: string
  dashed: boolean
}

type LayoutRect = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type LayoutPoint = {
  x: number
  y: number
}

type LayoutConnection = {
  fromId: string
  toId: string
  from: LayoutPoint
  to: LayoutPoint
}

type PlacementMetrics = {
  overlapCount: number
  overlapArea: number
  relationDistance: number
  midpointDistance: number
  crossingCount: number
  lineHitCount: number
  originDistance: number
}

type AnchorSide = 'left' | 'right' | 'top' | 'bottom'

type AnchorPoint = {
  x: number
  y: number
  side: AnchorSide
  slot: number
  count: number
}

type DiagramExportFormat = 'svg' | 'png'

const planeRef: Ref<HTMLDivElement | null> = ref(null)
const viewportRef: Ref<HTMLDivElement | null> = ref(null)
const scale: Ref<number> = ref(0.62)
const pan: Ref<{ x: number, y: number }> = ref({
  x: 30,
  y: 36
})
const selectedNodeId: Ref<string | null> = ref(null)
const nodeStates: Ref<Record<string, CanvasNodeState>> = ref({})
const connectionLines: Ref<ConnectionLine[]> = ref([])
let resizeObserver: ResizeObserver | null = null

const palette = ['#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#ef4444', '#ec4899', '#f97316']
const groupTableWidth = 232
const groupTableGap = 16
const groupHorizontalPadding = 20
const groupHeaderHeight = 56
const groupVerticalPadding = 18
const groupColumnRowHeight = 31
const objectColumnX = 1060
const objectColumnGapX = 320
const objectRowGapY = 180
const layoutPadding = 88
const exportPadding = 96
const collapsedObjectHeight = 56
const triggerCallFlagColor = '#38bdf8'
const attachmentPopoverContent = {
  side: 'right' as const,
  align: 'start' as const,
  sideOffset: 10,
  collisionPadding: 16
}
const attachmentPopoverUi = {
  content: 'w-[22rem] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-3 shadow-[var(--studio-floating-shadow)] backdrop-blur-sm'
}
const attachmentKindOrder: Record<TableAttachmentKind, number> = {
  Index: 0,
  Constraint: 1,
  Trigger: 2,
  Function: 3,
  Procedure: 4,
  Sequence: 5
}
const attachmentKindColors: Record<TableAttachmentKind, string> = {
  Index: '#38bdf8',
  Constraint: '#fb7185',
  Function: '#c084fc',
  Procedure: '#f97316',
  Trigger: '#22c55e',
  Sequence: '#eab308'
}

const canvasNodes = computed(() => Object.values(nodeStates.value))
const hasEmbeddedLayout = computed(() => Object.keys(model.nodeProperties).length > 0)
const selectedNode = computed(() => {
  if (!selectedNodeId.value) {
    return null
  }

  return nodeStates.value[selectedNodeId.value] || null
})
const isCollapsibleNode = (node: CanvasNodeState) => node.kind === 'object'
const tablesByGroup = computed(() => {
  const groups: Record<string, PgmlSchemaModel['tables']> = {}

  for (const table of model.tables) {
    const groupName = table.groupName || 'Ungrouped'

    if (!groups[groupName]) {
      groups[groupName] = []
    }

    groups[groupName]?.push(table)
  }

  return groups
})
const tableGroupById = computed(() => {
  const groups: Record<string, string> = {}

  for (const table of model.tables) {
    groups[table.fullName] = table.groupName || 'Ungrouped'
  }

  return groups
})
const knownTableIds = computed(() => new Set(model.tables.map(table => table.fullName)))

const estimateTableHeight = (rowCount: number) => {
  return 40 + rowCount * groupColumnRowHeight
}

const getGroupMinimumSize = (groupName: string, columnCount: number) => {
  const tables = tablesByGroup.value[groupName] || []
  const safeColumnCount = Math.max(1, Math.min(columnCount, Math.max(tables.length, 1)))
  const rowHeights: number[] = []

  tables.forEach((table, index) => {
    const rowIndex = Math.floor(index / safeColumnCount)
    const tableHeight = estimateTableHeight(getTableRows(table.fullName).length)
    rowHeights[rowIndex] = Math.max(rowHeights[rowIndex] || 0, tableHeight)
  })

  const contentHeight = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rowHeights.length - 1) * groupTableGap

  return {
    minWidth: groupHorizontalPadding * 2 + safeColumnCount * groupTableWidth + Math.max(0, safeColumnCount - 1) * groupTableGap,
    minHeight: groupHeaderHeight + groupVerticalPadding + contentHeight
  }
}

const getCanvasBounds = () => {
  if (!canvasNodes.value.length) {
    return null
  }

  const minX = Math.min(...canvasNodes.value.map(node => node.x))
  const minY = Math.min(...canvasNodes.value.map(node => node.y))
  const maxX = Math.max(...canvasNodes.value.map(node => node.x + node.width))
  const maxY = Math.max(...canvasNodes.value.map(node => node.y + node.height))

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

const waitForCanvasRender = async () => {
  await nextTick()
  updateConnections()
  await nextTick()

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })

  updateConnections()
}

const escapeXml = (value: string) => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;')
}

const getPlaneRelativeRect = (element: Element) => {
  if (!(planeRef.value instanceof HTMLDivElement)) {
    return null
  }

  const planeBounds = planeRef.value.getBoundingClientRect()
  const elementBounds = element.getBoundingClientRect()

  return {
    x: (elementBounds.left - planeBounds.left) / scale.value,
    y: (elementBounds.top - planeBounds.top) / scale.value,
    width: elementBounds.width / scale.value,
    height: elementBounds.height / scale.value
  }
}

const readStudioToken = (token: string, fallback: string) => {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim()

  return value.length > 0 ? value : fallback
}

const translatePathData = (path: string, offsetX: number, offsetY: number) => {
  return path.replace(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_match, command, xValue, yValue) => {
    const nextX = Number.parseFloat(xValue) + offsetX
    const nextY = Number.parseFloat(yValue) + offsetY

    return `${command} ${nextX} ${nextY}`
  })
}

const chunkLongWord = (value: string, maxCharacters: number) => {
  const chunks: string[] = []
  let index = 0

  while (index < value.length) {
    chunks.push(value.slice(index, index + maxCharacters))
    index += maxCharacters
  }

  return chunks
}

const wrapSvgText = (
  value: string,
  maxWidth: number,
  fontSize: number,
  mono = false,
  preserveWhitespace = false
) => {
  const normalizedValue = preserveWhitespace
    ? value.replaceAll('\t', '  ').replaceAll('\r', '')
    : value.trim()

  if (normalizedValue.length === 0) {
    return ['']
  }

  const averageCharacterWidth = fontSize * (mono ? 0.62 : 0.56)
  const maxCharacters = Math.max(8, Math.floor(maxWidth / averageCharacterWidth))

  if (preserveWhitespace) {
    return chunkLongWord(normalizedValue, maxCharacters)
  }

  const words = normalizedValue.split(/\s+/)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (currentLine.length > 0) {
        lines.push(currentLine)
        currentLine = ''
      }

      lines.push(...chunkLongWord(word, maxCharacters))
      continue
    }

    const nextLine = currentLine.length > 0 ? `${currentLine} ${word}` : word

    if (nextLine.length > maxCharacters) {
      lines.push(currentLine)
      currentLine = word
      continue
    }

    currentLine = nextLine
  }

  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  return lines.length > 0 ? lines : [normalizedValue]
}

const buildSvgText = (
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  style: string,
  anchor: 'start' | 'middle' | 'end' = 'start'
) => {
  return [
    `<text x="${x}" y="${y}" text-anchor="${anchor}" xml:space="preserve" style="${style}">`,
    ...lines.map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight

      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`
    }),
    '</text>'
  ].join('')
}

const getSvgGradientOffset = (offset: string | null, index: number, count: number) => {
  if (offset) {
    return offset
  }

  if (count <= 1) {
    return '0%'
  }

  return `${Math.round((index / (count - 1)) * 100)}%`
}

const buildSvgPaintAttributes = (
  attribute: 'fill' | 'stroke' | 'stop-color',
  value: string,
  fallback = 'transparent'
) => {
  const paint = normalizeSvgPaint(value, fallback)
  const opacityAttribute = attribute === 'stop-color' ? 'stop-opacity' : `${attribute}-opacity`
  const attributes = [`${attribute}="${escapeXml(paint.color)}"`]

  if (paint.opacity !== null && paint.opacity < 1) {
    attributes.push(`${opacityAttribute}="${paint.opacity}"`)
  }

  return attributes.join(' ')
}

const buildSvgTextPaintStyle = (value: string, fallback: string) => {
  const paint = normalizeSvgPaint(value, fallback)
  const style = [`fill: ${paint.color};`]

  if (paint.opacity !== null && paint.opacity < 1) {
    style.push(`fill-opacity: ${paint.opacity};`)
  }

  return style.join(' ')
}

const buildExportSvgString = async (padding = exportPadding) => {
  await waitForCanvasRender()

  if (!(planeRef.value instanceof HTMLDivElement) || !(viewportRef.value instanceof HTMLDivElement)) {
    throw new Error('Canvas is not ready for export.')
  }

  const bounds = getCanvasBounds()

  if (!bounds) {
    throw new Error('Nothing is available to export.')
  }

  const exportWidth = Math.ceil(bounds.width + padding * 2)
  const exportHeight = Math.ceil(bounds.height + padding * 2)
  const offsetX = padding - bounds.minX
  const offsetY = padding - bounds.minY
  const monoFont = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace'
  const sansFont = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
  const backgroundColor = readStudioToken('--studio-canvas-bg', '#0b141a')
  const dotColor = readStudioToken('--studio-canvas-dot', 'rgba(148, 163, 184, 0.24)')
  const shellText = readStudioToken('--studio-shell-text', '#e2e8f0')
  const shellMuted = readStudioToken('--studio-shell-muted', '#94a3b8')
  const railColor = readStudioToken('--studio-rail', 'rgba(148, 163, 184, 0.25)')
  const dividerColor = readStudioToken('--studio-divider', 'rgba(148, 163, 184, 0.16)')
  const tableSurface = readStudioToken('--studio-table-surface', '#101c24')
  const rowSurface = readStudioToken('--studio-row-surface', '#0d1820')
  const defs: string[] = [
    '<pattern id="pgml-grid" width="18" height="18" patternUnits="userSpaceOnUse">',
    `<circle cx="9" cy="9" r="1" ${buildSvgPaintAttributes('fill', dotColor, '#94a3b8')} />`,
    '</pattern>'
  ]
  const parts: string[] = [
    `<rect x="0" y="0" width="${exportWidth}" height="${exportHeight}" ${buildSvgPaintAttributes('fill', backgroundColor, '#0b141a')} />`,
    `<rect x="0" y="0" width="${exportWidth}" height="${exportHeight}" fill="url(#pgml-grid)" />`
  ]

  connectionLines.value.forEach((line) => {
    parts.push(
      `<path d="${escapeXml(translatePathData(line.path, offsetX, offsetY))}" fill="none" ${buildSvgPaintAttributes('stroke', line.color, line.color)} stroke-width="2" stroke-dasharray="${line.dashed ? '10 7' : '0'}" stroke-linecap="square" stroke-linejoin="miter" opacity="0.9" />`
    )
  })

  canvasNodes.value.forEach((node) => {
    const nodeElement = planeRef.value?.querySelector(`[data-node-anchor="${node.id}"]`)
    const headerElement = planeRef.value?.querySelector(`[data-node-header="${node.id}"]`)
    const accentElement = planeRef.value?.querySelector(`[data-node-accent="${node.id}"]`)

    if (!(nodeElement instanceof HTMLElement) || !(headerElement instanceof HTMLElement)) {
      return
    }

    const nodeStyles = window.getComputedStyle(nodeElement)
    const nodeRect = getPlaneRelativeRect(nodeElement)
    const accentColor = accentElement instanceof HTMLElement
      ? normalizeSvgColor(window.getComputedStyle(accentElement).color, node.color)
      : normalizeSvgColor(node.color, node.color)
    const nodeBorderColor = normalizeSvgColor(nodeStyles.borderColor, railColor)
    const nodeFillColor = normalizeSvgColor(nodeStyles.backgroundColor, node.kind === 'group' ? tableSurface : rowSurface)
    const nodeGradientStops = node.kind === 'group'
      ? parseCssLinearGradient(nodeStyles.backgroundImage)
      : null
    const headerRect = getPlaneRelativeRect(headerElement)

    if (!headerRect || !nodeRect) {
      return
    }

    const x = nodeRect.x + offsetX
    const y = nodeRect.y + offsetY
    const nodeWidth = nodeRect.width
    const nodeHeight = nodeRect.height
    const outerRadius = node.kind === 'group' ? 2 : 0
    const headerBottom = headerRect.y + headerRect.height + offsetY
    const badgeText = node.kind === 'group'
      ? `${node.tableCount || node.tableIds.length} tables`
      : `${node.tableIds.length} impact`

    const gradientId = nodeGradientStops?.length
      ? `pgml-node-gradient-${node.id.replaceAll(/[^\w-]+/g, '-')}`
      : null

    if (gradientId && nodeGradientStops) {
      defs.push(
        `<linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">`,
        ...nodeGradientStops.map((stop, index) => {
          return `<stop offset="${getSvgGradientOffset(stop.offset, index, nodeGradientStops.length)}" ${buildSvgPaintAttributes('stop-color', stop.color, stop.color)} />`
        }),
        '</linearGradient>'
      )
    }

    parts.push(
      `<rect id="pgml-node-${node.id.replaceAll(/[^\w-]+/g, '-')}-base" x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="${outerRadius}" ry="${outerRadius}" ${buildSvgPaintAttributes('fill', nodeFillColor, node.kind === 'group' ? tableSurface : rowSurface)} ${buildSvgPaintAttributes('stroke', nodeBorderColor, railColor)} stroke-width="1" />`
    )

    if (gradientId) {
      parts.push(
        `<rect id="pgml-node-${node.id.replaceAll(/[^\w-]+/g, '-')}-gradient" x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="${outerRadius}" ry="${outerRadius}" fill="url(#${gradientId})" stroke="none" />`
      )
    }

    if (node.kind === 'group' || !node.collapsed) {
      parts.push(
        `<line x1="${x}" y1="${headerBottom}" x2="${x + nodeWidth}" y2="${headerBottom}" ${buildSvgPaintAttributes('stroke', dividerColor, dividerColor)} stroke-width="1" />`
      )
    }
    parts.push(
      buildSvgText(
        [node.kind === 'group' ? 'TABLE GROUP' : (node.objectKind || '').toUpperCase()],
        x + 10,
        y + 14,
        8,
        `font: 600 8px ${monoFont}; letter-spacing: 0.9px; ${buildSvgTextPaintStyle(accentColor, accentColor)}`
      )
    )
    parts.push(
      buildSvgText(
        [node.title],
        x + 10,
        y + 30,
        10,
        `font: 600 14px ${sansFont}; ${buildSvgTextPaintStyle(shellText, '#e2e8f0')}`
      )
    )

    if (node.subtitle.length > 0) {
      parts.push(
        buildSvgText(
          wrapSvgText(node.subtitle, nodeWidth - 90, 10),
          x + 10,
          y + 44,
          12,
          `font: 400 10px ${sansFont}; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`
        )
      )
    }

    parts.push(
      `<rect x="${x + nodeWidth - 72}" y="${y + 8}" width="62" height="18" fill="none" ${buildSvgPaintAttributes('stroke', railColor, railColor)} stroke-width="1" />`
    )
    parts.push(
      buildSvgText(
        [badgeText.toUpperCase()],
        x + nodeWidth - 41,
        y + 20,
        8,
        `font: 500 8px ${monoFont}; letter-spacing: 0.45px; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`,
        'middle'
      )
    )

    if (node.kind === 'group') {
      const tables = model.tables.filter(table => node.tableIds.includes(table.fullName))

      tables.forEach((table) => {
        const tableElement = planeRef.value?.querySelector(`[data-table-anchor="${table.fullName}"]`)

        if (!(tableElement instanceof HTMLElement)) {
          return
        }

        const tableRect = getPlaneRelativeRect(tableElement)
        const tableHeaderElement = tableElement.firstElementChild
        const tableHeaderRect = tableHeaderElement ? getPlaneRelativeRect(tableHeaderElement) : null
        const tableStyles = window.getComputedStyle(tableElement)
        const tableBorderColor = normalizeSvgColor(tableStyles.borderColor, railColor)

        if (!tableRect || !tableHeaderRect) {
          return
        }

        const tableX = tableRect.x + offsetX
        const tableY = tableRect.y + offsetY

        parts.push(
          `<rect x="${tableX}" y="${tableY}" width="${tableRect.width}" height="${tableRect.height}" rx="2" ry="2" ${buildSvgPaintAttributes('fill', window.getComputedStyle(tableElement).backgroundColor, tableSurface)} ${buildSvgPaintAttributes('stroke', tableBorderColor, railColor)} stroke-width="1" />`
        )
        parts.push(
          `<line x1="${tableX}" y1="${tableHeaderRect.y + tableHeaderRect.height + offsetY}" x2="${tableX + tableRect.width}" y2="${tableHeaderRect.y + tableHeaderRect.height + offsetY}" ${buildSvgPaintAttributes('stroke', dividerColor, dividerColor)} stroke-width="1" />`
        )
        parts.push(
          buildSvgText(
            [table.name],
            tableX + 8,
            tableY + 16,
            10,
            `font: 600 11px ${sansFont}; ${buildSvgTextPaintStyle(shellText, '#e2e8f0')}`
          )
        )
        parts.push(
          buildSvgText(
            [`${table.schema.toUpperCase()} SCHEMA`],
            tableX + 8,
            tableY + 29,
            8,
            `font: 500 8px ${monoFont}; letter-spacing: 0.6px; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`
          )
        )
        parts.push(
          `<rect x="${tableX + tableRect.width - 48}" y="${tableY + 8}" width="40" height="16" fill="none" ${buildSvgPaintAttributes('stroke', railColor, railColor)} stroke-width="1" />`
        )
        parts.push(
          buildSvgText(
            [`${table.columns.length} COLS`],
            tableX + tableRect.width - 28,
            tableY + 19,
            8,
            `font: 500 8px ${monoFont}; letter-spacing: 0.35px; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`,
            'middle'
          )
        )

        const rowElements = Array.from(tableElement.querySelectorAll('[data-table-row-anchor]'))
          .filter((rowElement): rowElement is HTMLElement => rowElement instanceof HTMLElement)

        rowElements.forEach((rowElement, rowIndex) => {
          const rowRect = getPlaneRelativeRect(rowElement)

          if (!rowRect) {
            return
          }

          const rowX = rowRect.x + offsetX
          const rowY = rowRect.y + offsetY
          const rowHeight = rowRect.height
          const rowStyles = window.getComputedStyle(rowElement)

          parts.push(
            `<rect x="${rowX}" y="${rowY}" width="${rowRect.width}" height="${rowHeight}" ${buildSvgPaintAttributes('fill', rowStyles.backgroundColor, rowSurface)} />`
          )

          const titleElement = rowElement.querySelector('[data-table-row-title]')
          const subtitleElement = rowElement.querySelector('[data-table-row-subtitle]')

          if (titleElement instanceof HTMLElement) {
            const titleRect = getPlaneRelativeRect(titleElement)

            if (titleRect) {
              parts.push(
                buildSvgText(
                  [titleElement.textContent || ''],
                  titleRect.x + offsetX,
                  titleRect.y + offsetY + titleRect.height - 2,
                  9,
                  `font: 600 9px ${monoFont}; ${buildSvgTextPaintStyle(shellText, '#e2e8f0')}`
                )
              )
            }
          }

          if (subtitleElement instanceof HTMLElement) {
            const subtitleRect = getPlaneRelativeRect(subtitleElement)

            if (subtitleRect) {
              parts.push(
                buildSvgText(
                  [subtitleElement.textContent || ''],
                  subtitleRect.x + offsetX,
                  subtitleRect.y + offsetY + subtitleRect.height - 2,
                  8,
                  `font: 400 8px ${sansFont}; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`
                )
              )
            }
          }

          rowElement.querySelectorAll('[data-table-row-badge]').forEach((badgeElement) => {
            if (!(badgeElement instanceof HTMLElement)) {
              return
            }

            const badgeRect = getPlaneRelativeRect(badgeElement)

            if (!badgeRect) {
              return
            }

            const badgeStyles = window.getComputedStyle(badgeElement)
            const badgeFill = normalizeSvgColor(badgeStyles.backgroundColor, 'transparent')

            parts.push(
              `<rect x="${badgeRect.x + offsetX}" y="${badgeRect.y + offsetY}" width="${badgeRect.width}" height="${badgeRect.height}" ${buildSvgPaintAttributes('fill', badgeFill, 'transparent')} ${buildSvgPaintAttributes('stroke', badgeStyles.borderColor, railColor)} stroke-width="1" />`
            )
            parts.push(
              buildSvgText(
                [badgeElement.textContent || ''],
                badgeRect.x + offsetX + badgeRect.width / 2,
                badgeRect.y + offsetY + badgeRect.height / 2 + 2.5,
                7.5,
                `font: 500 7.5px ${monoFont}; letter-spacing: 0.24px; ${buildSvgTextPaintStyle(badgeStyles.color, shellMuted)}`,
                'middle'
              )
            )
          })

          if (rowIndex < rowElements.length - 1) {
            parts.push(
              `<line x1="${rowX}" y1="${rowY + rowHeight}" x2="${rowX + rowRect.width}" y2="${rowY + rowHeight}" ${buildSvgPaintAttributes('stroke', dividerColor, dividerColor)} stroke-width="1" />`
            )
          }
        })
      })

      return
    }

    const bodyElement = planeRef.value?.querySelector(`[data-node-body="${node.id}"]`)

    if (!(bodyElement instanceof HTMLElement)) {
      return
    }

    bodyElement.querySelectorAll('p').forEach((paragraph) => {
      const paragraphRect = getPlaneRelativeRect(paragraph)

      if (!paragraphRect) {
        return
      }

      const paragraphText = paragraph.textContent || ''
      const preserveParagraphWhitespace = /^\s+/.test(paragraphText) || paragraphText.length === 0
      const paragraphLines = wrapSvgText(paragraphText, paragraphRect.width, 9, true, preserveParagraphWhitespace)

      parts.push(
        buildSvgText(
          paragraphLines,
          paragraphRect.x + offsetX,
          paragraphRect.y + offsetY + 8,
          10,
          `font: 400 9px ${monoFont}; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`
        )
      )
    })

    bodyElement.querySelectorAll('[data-impact-anchor]').forEach((chip) => {
      const chipRect = getPlaneRelativeRect(chip)

      if (!chipRect) {
        return
      }

      parts.push(
        `<rect x="${chipRect.x + offsetX}" y="${chipRect.y + offsetY}" width="${chipRect.width}" height="${chipRect.height}" fill="none" ${buildSvgPaintAttributes('stroke', railColor, railColor)} stroke-width="1" />`
      )
      parts.push(
        buildSvgText(
          [chip.textContent || ''],
          chipRect.x + offsetX + chipRect.width / 2,
          chipRect.y + offsetY + chipRect.height / 2 + 3,
          8,
          `font: 500 8px ${monoFont}; letter-spacing: 0.35px; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`,
          'middle'
        )
      )
    })

    const resizeHandleElement = nodeElement.querySelector('button[aria-label="Resize node"]')
    const resizeHandleRect = resizeHandleElement ? getPlaneRelativeRect(resizeHandleElement) : null

    if (resizeHandleRect) {
      const handleX = resizeHandleRect.x + offsetX
      const handleY = resizeHandleRect.y + offsetY
      const handleWidth = resizeHandleRect.width
      const handleHeight = resizeHandleRect.height

      parts.push(
        `<line x1="${handleX + handleWidth}" y1="${handleY}" x2="${handleX + handleWidth}" y2="${handleY + handleHeight}" ${buildSvgPaintAttributes('stroke', accentColor, accentColor)} stroke-width="2" />`
      )
      parts.push(
        `<line x1="${handleX}" y1="${handleY + handleHeight}" x2="${handleX + handleWidth}" y2="${handleY + handleHeight}" ${buildSvgPaintAttributes('stroke', accentColor, accentColor)} stroke-width="2" />`
      )
    }
  })

  return {
    width: exportWidth,
    height: exportHeight,
    svg: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}">`,
      '<defs>',
      ...defs,
      '</defs>',
      ...parts,
      '</svg>'
    ].join('')
  }
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
}

const exportSvg = async () => {
  const result = await buildExportSvgString()
  const blob = new Blob([result.svg], {
    type: 'image/svg+xml;charset=utf-8'
  })

  downloadBlob(blob, 'pgml-diagram.svg')
}

const exportPng = async (scaleFactor: number) => {
  await waitForCanvasRender()

  const bounds = getCanvasBounds()

  if (!bounds) {
    throw new Error('Nothing is available to export.')
  }

  const { padding, rasterWidth, rasterHeight } = getRasterExportPlan(bounds.width, bounds.height, scaleFactor, 24)
  const result = await buildExportSvgString(padding)

  const blob = new Blob([result.svg], {
    type: 'image/svg+xml;charset=utf-8'
  })
  const objectUrl = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()

      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Unable to render the diagram export.'))
      nextImage.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Unable to create a canvas for export.')
    }

    canvas.width = rasterWidth
    canvas.height = rasterHeight
    context.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, result.width, result.height)

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((output) => {
        if (output) {
          resolve(output)
          return
        }

        reject(new Error('Unable to create a PNG export.'))
      }, 'image/png')
    })

    downloadBlob(pngBlob, `pgml-diagram-${scaleFactor}x.png`)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const measureGroupMinimumSize = (groupId: string) => {
  if (!planeRef.value) {
    return null
  }

  const groupElement = planeRef.value.querySelector(`[data-node-anchor="${groupId}"]`)
  const headerElement = planeRef.value.querySelector(`[data-node-header="${groupId}"]`)
  const contentElement = planeRef.value.querySelector(`[data-group-content="${groupId}"]`)

  if (
    !(groupElement instanceof HTMLElement)
    || !(headerElement instanceof HTMLElement)
    || !(contentElement instanceof HTMLElement)
  ) {
    return null
  }

  const contentWrapper = contentElement.parentElement
  const groupState = nodeStates.value[groupId]
  const baselineSize = getGroupMinimumSize(
    groupId.replace(/^group:/, ''),
    groupState?.columnCount || 1
  )
  const wrapperStyles = contentWrapper ? window.getComputedStyle(contentWrapper) : null
  const paddingRight = wrapperStyles ? Number.parseFloat(wrapperStyles.paddingRight) : 0
  const paddingBottom = wrapperStyles ? Number.parseFloat(wrapperStyles.paddingBottom) : 0
  const headerBottom = headerElement.offsetTop + headerElement.offsetHeight
  const contentRight = contentElement.offsetLeft + contentElement.scrollWidth + paddingRight
  const contentBottom = contentElement.offsetTop + contentElement.scrollHeight + paddingBottom

  return {
    minWidth: Math.ceil(Math.max(contentRight, 240, baselineSize.minWidth)),
    minHeight: Math.ceil(Math.max(headerBottom + paddingBottom, contentBottom, baselineSize.minHeight))
  }
}

const measureObjectMinimumSize = (node: CanvasNodeState) => {
  if (!planeRef.value) {
    return null
  }

  const objectElement = planeRef.value.querySelector(`[data-node-anchor="${node.id}"]`)
  const headerElement = planeRef.value.querySelector(`[data-node-header="${node.id}"]`)

  if (
    !(objectElement instanceof HTMLElement)
    || !(headerElement instanceof HTMLElement)
  ) {
    return null
  }

  if (node.collapsed) {
    return {
      minWidth: Math.ceil(Math.max(node.minWidth || node.width, 220)),
      minHeight: Math.ceil(Math.max(headerElement.offsetHeight, collapsedObjectHeight))
    }
  }

  const bodyElement = planeRef.value.querySelector(`[data-node-body="${node.id}"]`)

  if (!(bodyElement instanceof HTMLElement)) {
    return null
  }

  const bodyStyles = window.getComputedStyle(bodyElement)
  const paddingBottom = Number.parseFloat(bodyStyles.paddingBottom) || 0
  const contentBottom = bodyElement.offsetTop + bodyElement.scrollHeight + paddingBottom

  return {
    minWidth: Math.ceil(Math.max(node.minWidth || node.width, 220)),
    minHeight: Math.ceil(Math.max(contentBottom, headerElement.offsetHeight + bodyElement.scrollHeight + 18, 96))
  }
}

const measureNodeMinimumSize = (node: CanvasNodeState) => {
  if (node.kind === 'group') {
    return measureGroupMinimumSize(node.id)
  }

  return measureObjectMinimumSize(node)
}

const syncMeasuredNodeSizes = () => {
  let hasChanges = false

  for (const node of canvasNodes.value) {
    const measuredSize = measureNodeMinimumSize(node)

    if (!measuredSize) {
      continue
    }

    const current = nodeStates.value[node.id]

    if (!current) {
      continue
    }

    const nextWidth = current.kind === 'group'
      ? measuredSize.minWidth
      : Math.max(current.width, measuredSize.minWidth)
    const nextHeight = current.kind === 'group'
      ? measuredSize.minHeight
      : Math.max(current.height, measuredSize.minHeight)
    const needsUpdate = (
      current.minWidth !== measuredSize.minWidth
      || current.minHeight !== measuredSize.minHeight
      || current.width !== nextWidth
      || current.height !== nextHeight
    )

    if (!needsUpdate) {
      continue
    }

    nodeStates.value[node.id] = {
      ...current,
      minWidth: measuredSize.minWidth,
      minHeight: measuredSize.minHeight,
      width: nextWidth,
      height: nextHeight,
      expandedHeight: current.kind === 'group'
        ? nextHeight
        : current.expandedHeight
    }
    hasChanges = true
  }

  return hasChanges
}

const observeCanvasLayout = () => {
  if (!resizeObserver) {
    return
  }

  const observer = resizeObserver

  observer.disconnect()

  if (viewportRef.value) {
    observer.observe(viewportRef.value)
  }

  if (planeRef.value) {
    observer.observe(planeRef.value)

    planeRef.value.querySelectorAll('[data-node-anchor]').forEach((element) => {
      if (element instanceof HTMLElement) {
        observer.observe(element)
      }
    })
  }
}

const cleanForSearch = (value: string) => value.toLowerCase().replaceAll(/[^\w.]+/g, ' ')
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const uniqueValues = (values: string[]) => Array.from(new Set(values))
const getRectCenter = (rect: LayoutRect): LayoutPoint => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2
})
const getNodeRect = (node: CanvasNodeState): LayoutRect => ({
  id: node.id,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height
})
const expandRect = (rect: LayoutRect, padding: number): LayoutRect => ({
  id: rect.id,
  x: rect.x - padding,
  y: rect.y - padding,
  width: rect.width + padding * 2,
  height: rect.height + padding * 2
})
const isPointInsideRect = (point: LayoutPoint, rect: LayoutRect) => {
  return (
    point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
  )
}
const getOrientation = (pointA: LayoutPoint, pointB: LayoutPoint, pointC: LayoutPoint) => {
  const crossProduct = (pointB.y - pointA.y) * (pointC.x - pointB.x) - (pointB.x - pointA.x) * (pointC.y - pointB.y)

  if (Math.abs(crossProduct) < 0.01) {
    return 0
  }

  return crossProduct > 0 ? 1 : 2
}
const isPointOnSegment = (pointA: LayoutPoint, pointB: LayoutPoint, pointC: LayoutPoint) => {
  return (
    pointB.x <= Math.max(pointA.x, pointC.x)
    && pointB.x >= Math.min(pointA.x, pointC.x)
    && pointB.y <= Math.max(pointA.y, pointC.y)
    && pointB.y >= Math.min(pointA.y, pointC.y)
  )
}
const segmentsIntersect = (
  pointA1: LayoutPoint,
  pointA2: LayoutPoint,
  pointB1: LayoutPoint,
  pointB2: LayoutPoint
) => {
  const orientation1 = getOrientation(pointA1, pointA2, pointB1)
  const orientation2 = getOrientation(pointA1, pointA2, pointB2)
  const orientation3 = getOrientation(pointB1, pointB2, pointA1)
  const orientation4 = getOrientation(pointB1, pointB2, pointA2)

  if (orientation1 !== orientation2 && orientation3 !== orientation4) {
    return true
  }

  if (orientation1 === 0 && isPointOnSegment(pointA1, pointB1, pointA2)) {
    return true
  }

  if (orientation2 === 0 && isPointOnSegment(pointA1, pointB2, pointA2)) {
    return true
  }

  if (orientation3 === 0 && isPointOnSegment(pointB1, pointA1, pointB2)) {
    return true
  }

  if (orientation4 === 0 && isPointOnSegment(pointB1, pointA2, pointB2)) {
    return true
  }

  return false
}
const doesSegmentHitRect = (
  fromPoint: LayoutPoint,
  toPoint: LayoutPoint,
  rect: LayoutRect,
  padding = 0
) => {
  const expandedRect = expandRect(rect, padding)
  const topLeft = { x: expandedRect.x, y: expandedRect.y }
  const topRight = { x: expandedRect.x + expandedRect.width, y: expandedRect.y }
  const bottomLeft = { x: expandedRect.x, y: expandedRect.y + expandedRect.height }
  const bottomRight = { x: expandedRect.x + expandedRect.width, y: expandedRect.y + expandedRect.height }

  if (isPointInsideRect(fromPoint, expandedRect) || isPointInsideRect(toPoint, expandedRect)) {
    return true
  }

  return (
    segmentsIntersect(fromPoint, toPoint, topLeft, topRight)
    || segmentsIntersect(fromPoint, toPoint, topRight, bottomRight)
    || segmentsIntersect(fromPoint, toPoint, bottomRight, bottomLeft)
    || segmentsIntersect(fromPoint, toPoint, bottomLeft, topLeft)
  )
}
const buildConnection = (
  fromRect: LayoutRect,
  toRect: LayoutRect
): LayoutConnection => ({
  fromId: fromRect.id,
  toId: toRect.id,
  from: getRectCenter(fromRect),
  to: getRectCenter(toRect)
})
const countConnectionCrossings = (
  nextConnections: LayoutConnection[],
  existingConnections: LayoutConnection[]
) => {
  let crossingCount = 0

  for (const nextConnection of nextConnections) {
    for (const existingConnection of existingConnections) {
      const sharesEndpoint = (
        nextConnection.fromId === existingConnection.fromId
        || nextConnection.fromId === existingConnection.toId
        || nextConnection.toId === existingConnection.fromId
        || nextConnection.toId === existingConnection.toId
      )

      if (sharesEndpoint) {
        continue
      }

      if (segmentsIntersect(nextConnection.from, nextConnection.to, existingConnection.from, existingConnection.to)) {
        crossingCount += 1
      }
    }
  }

  return crossingCount
}
const countConnectionRectHits = (
  nextConnections: LayoutConnection[],
  rects: LayoutRect[],
  ignoredIds: Set<string>
) => {
  let hitCount = 0

  for (const connection of nextConnections) {
    for (const rect of rects) {
      if (ignoredIds.has(rect.id)) {
        continue
      }

      if (doesSegmentHitRect(connection.from, connection.to, rect, 24)) {
        hitCount += 1
      }
    }
  }

  return hitCount
}
const getOverlapMetrics = (
  nextRect: LayoutRect,
  rects: LayoutRect[],
  getPadding: (rect: LayoutRect) => number
) => {
  let overlapCount = 0
  let overlapArea = 0

  rects.forEach((rect) => {
    const expandedRect = expandRect(rect, getPadding(rect))
    const overlapWidth = Math.min(nextRect.x + nextRect.width, expandedRect.x + expandedRect.width) - Math.max(nextRect.x, expandedRect.x)
    const overlapHeight = Math.min(nextRect.y + nextRect.height, expandedRect.y + expandedRect.height) - Math.max(nextRect.y, expandedRect.y)

    if (overlapWidth > 0 && overlapHeight > 0) {
      overlapCount += 1
      overlapArea += overlapWidth * overlapHeight
    }
  })

  return {
    overlapCount,
    overlapArea
  }
}
const getMidpointCenter = (rects: LayoutRect[]) => {
  if (!rects.length) {
    return null
  }

  const sum = rects.reduce((accumulator, rect) => {
    const rectCenter = getRectCenter(rect)

    return {
      x: accumulator.x + rectCenter.x,
      y: accumulator.y + rectCenter.y
    }
  }, { x: 0, y: 0 })

  return {
    x: sum.x / rects.length,
    y: sum.y / rects.length
  }
}
const comparePlacementMetrics = (left: PlacementMetrics, right: PlacementMetrics) => {
  if (left.overlapCount !== right.overlapCount) {
    return left.overlapCount - right.overlapCount
  }

  if (left.overlapArea !== right.overlapArea) {
    return left.overlapArea - right.overlapArea
  }

  if (Math.abs(left.relationDistance - right.relationDistance) > 0.01) {
    return left.relationDistance - right.relationDistance
  }

  if (Math.abs(left.midpointDistance - right.midpointDistance) > 0.01) {
    return left.midpointDistance - right.midpointDistance
  }

  if (left.crossingCount !== right.crossingCount) {
    return left.crossingCount - right.crossingCount
  }

  if (left.lineHitCount !== right.lineHitCount) {
    return left.lineHitCount - right.lineHitCount
  }

  return left.originDistance - right.originDistance
}
const buildRingCandidates = (
  center: LayoutPoint,
  width: number,
  height: number,
  distances: number[]
) => {
  return distances.flatMap((distance) => {
    return [
      { x: center.x + distance - width / 2, y: center.y - height / 2 },
      { x: center.x - distance - width / 2, y: center.y - height / 2 },
      { x: center.x - width / 2, y: center.y + distance - height / 2 },
      { x: center.x - width / 2, y: center.y - distance - height / 2 },
      { x: center.x + distance * 0.72 - width / 2, y: center.y + distance * 0.72 - height / 2 },
      { x: center.x - distance * 0.72 - width / 2, y: center.y + distance * 0.72 - height / 2 },
      { x: center.x + distance * 0.72 - width / 2, y: center.y - distance * 0.72 - height / 2 },
      { x: center.x - distance * 0.72 - width / 2, y: center.y - distance * 0.72 - height / 2 }
    ]
  })
}
const dedupeCandidates = (candidates: Array<{ x: number, y: number }>) => {
  const seen = new Set<string>()

  return candidates.filter((candidate) => {
    const key = `${Math.round(candidate.x / 12)}:${Math.round(candidate.y / 12)}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}
const isHorizontalSide = (side: AnchorSide) => side === 'left' || side === 'right'
const getGroupNameForTableId = (tableId: string) => tableGroupById.value[tableId] || 'Ungrouped'
const getRelatedGroupRectsForNode = (
  node: CanvasNodeState,
  states: Record<string, CanvasNodeState>
) => {
  return uniqueValues(node.tableIds.map(tableId => getGroupNameForTableId(tableId)))
    .map(groupName => states[`group:${groupName}`])
    .filter((groupNode): groupNode is CanvasNodeState => Boolean(groupNode))
    .map(groupNode => getNodeRect(groupNode))
}

const normalizeReference = (value: string) => {
  return value.includes('.') ? value : `public.${value}`
}

const inferRoutineTables = (routine: PgmlRoutine) => {
  const haystack = cleanForSearch(`${routine.signature} ${routine.details.join(' ')}`)
  const tableIds: string[] = []

  for (const table of model.tables) {
    const fullName = cleanForSearch(table.fullName)
    const bareName = cleanForSearch(table.name)
    const singularName = bareName.endsWith('s') ? bareName.slice(0, -1) : bareName

    if (
      haystack.includes(fullName)
      || haystack.includes(bareName)
      || (singularName.length > 2 && haystack.includes(singularName))
    ) {
      tableIds.push(table.fullName)
    }
  }

  return Array.from(new Set(tableIds))
}

const getUniqueImpactTargets = (targets: ImpactTarget[]) => {
  const seen = new Set<string>()

  return targets.filter((target) => {
    const key = `${target.tableId}:${target.columnName || '*'}`.toLowerCase()

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

const sanitizeReferenceValue = (value: string) => {
  return value
    .trim()
    .replaceAll('"', '')
    .replaceAll('\'', '')
    .replace(/[(),;]/g, '')
}

const resolveTableIdentifier = (value: string) => {
  const normalized = sanitizeReferenceValue(value).toLowerCase()

  if (!normalized) {
    return null
  }

  const directMatch = model.tables.find(table => table.fullName.toLowerCase() === normalized)

  if (directMatch) {
    return directMatch.fullName
  }

  const byName = model.tables.find(table => table.name.toLowerCase() === normalized)

  return byName?.fullName || null
}

const resolveImpactTargetsFromValue = (value: string, defaultTableId: string | null = null): ImpactTarget[] => {
  const normalized = sanitizeReferenceValue(value)

  if (!normalized) {
    return []
  }

  const parts = normalized.split('.')

  if (
    parts.length === 2
    && defaultTableId
    && (parts[0]?.toLowerCase() === 'new' || parts[0]?.toLowerCase() === 'old')
  ) {
    return [{
      tableId: defaultTableId,
      columnName: parts[1] || null
    }]
  }

  if (parts.length === 3) {
    const tableId = resolveTableIdentifier(`${parts[0]}.${parts[1]}`)

    if (tableId) {
      return [{
        tableId,
        columnName: parts[2] || null
      }]
    }
  }

  if (parts.length === 2) {
    const fullTableMatch = resolveTableIdentifier(`${parts[0]}.${parts[1]}`)

    if (fullTableMatch) {
      return [{
        tableId: fullTableMatch,
        columnName: null
      }]
    }

    const matchingTable = model.tables.find((table) => {
      return table.name.toLowerCase() === (parts[0] || '').toLowerCase()
    })

    if (matchingTable && matchingTable.columns.some(column => column.name.toLowerCase() === (parts[1] || '').toLowerCase())) {
      return [{
        tableId: matchingTable.fullName,
        columnName: parts[1] || null
      }]
    }
  }

  const directTable = resolveTableIdentifier(normalized)

  if (directTable) {
    return [{
      tableId: directTable,
      columnName: null
    }]
  }

  if (defaultTableId) {
    const defaultTable = model.tables.find(table => table.fullName === defaultTableId)

    if (defaultTable?.columns.some(column => column.name.toLowerCase() === normalized.toLowerCase())) {
      return [{
        tableId: defaultTableId,
        columnName: normalized
      }]
    }
  }

  return []
}

const getImpactTargetsFromValues = (values: string[], defaultTableId: string | null = null) => {
  return getUniqueImpactTargets(values.flatMap(value => resolveImpactTargetsFromValue(value, defaultTableId)))
}

const inferSourceTargets = (source: string, defaultTableId: string | null = null) => {
  const values: string[] = []

  Array.from(source.matchAll(/\b(?:insert\s+into|update|delete\s+from|from|join|on|owned\s+by)\s+([a-zA-Z_"][\w."]*)/gi)).forEach((match) => {
    const identifier = match[1] || ''

    if (identifier.length > 0) {
      values.push(identifier)
    }
  })

  Array.from(source.matchAll(/\b(?:NEW|OLD)\.([a-zA-Z_]\w*)/g)).forEach((match) => {
    const columnName = match[1] || ''

    if (columnName.length > 0) {
      values.push(`NEW.${columnName}`)
    }
  })

  return getImpactTargetsFromValues(values, defaultTableId)
}

const inferColumnsFromText = (tableId: string, text: string) => {
  const table = model.tables.find(entry => entry.fullName === tableId)

  if (!table) {
    return []
  }

  const haystack = cleanForSearch(text)
  const tokens = new Set(haystack.split(/\s+/).filter(token => token.length > 0))

  return table.columns
    .filter(column => tokens.has(column.name.toLowerCase()))
    .map(column => column.name)
}

const inferRoutineTargets = (routine: PgmlRoutine) => {
  const explicitTargets = routine.affects
    ? getImpactTargetsFromValues([
        ...routine.affects.writes,
        ...routine.affects.sets,
        ...routine.affects.dependsOn,
        ...routine.affects.reads,
        ...routine.affects.uses,
        ...routine.affects.ownedBy
      ])
    : []
  const sourceTargets = routine.source
    ? inferSourceTargets(routine.source)
    : []
  const tableIds = inferRoutineTables(routine)
  const haystack = `${routine.signature} ${routine.details.join(' ')} ${routine.source || ''}`
  const targets: ImpactTarget[] = tableIds.flatMap((tableId): ImpactTarget[] => {
    const matchedColumns = inferColumnsFromText(tableId, haystack)

    if (!matchedColumns.length) {
      return [{
        tableId,
        columnName: null
      }]
    }

    return matchedColumns.map(columnName => ({
      tableId,
      columnName
    }))
  })

  return getUniqueImpactTargets([...explicitTargets, ...sourceTargets, ...targets])
}

const inferTriggerTargets = (tableId: string, trigger: PgmlSchemaModel['triggers'][number]) => {
  const explicitTargets = trigger.affects
    ? getImpactTargetsFromValues([
        ...trigger.affects.writes,
        ...trigger.affects.sets,
        ...trigger.affects.dependsOn,
        ...trigger.affects.reads,
        ...trigger.affects.uses,
        ...trigger.affects.ownedBy
      ], tableId)
    : []
  const sourceTargets = trigger.source
    ? inferSourceTargets(trigger.source, tableId)
    : []
  const haystack = `${trigger.details.join(' ')} ${trigger.source || ''}`
  const matchedColumns = inferColumnsFromText(tableId, haystack)

  if (!matchedColumns.length) {
    return getUniqueImpactTargets([...explicitTargets, ...sourceTargets, { tableId, columnName: null }])
  }

  return getUniqueImpactTargets([
    ...explicitTargets,
    ...sourceTargets,
    ...matchedColumns.map(columnName => ({
      tableId,
      columnName
    }))
  ])
}

const inferSequenceTargets = (sequence: PgmlSequence) => {
  const explicitTargets = sequence.affects
    ? getImpactTargetsFromValues([
        ...sequence.affects.ownedBy,
        ...sequence.affects.writes,
        ...sequence.affects.dependsOn
      ])
    : []
  const sourceTargets = sequence.source
    ? inferSourceTargets(sequence.source)
    : []
  const modifierTargets = model.tables.flatMap((table) => {
    return table.columns
      .filter((column) => {
        return column.modifiers.some(modifier => modifier.includes(sequence.name))
      })
      .map(column => ({
        tableId: table.fullName,
        columnName: column.name
      }))
  })

  return getUniqueImpactTargets([...explicitTargets, ...sourceTargets, ...modifierTargets])
}
const inferIndexTargets = (index: PgmlSchemaModel['tables'][number]['indexes'][number]) => {
  const tableId = normalizeReference(index.tableName)
  const targets = index.columns.map(columnName => ({
    tableId,
    columnName
  }))

  if (!targets.length) {
    return [{
      tableId,
      columnName: null
    }]
  }

  return getUniqueImpactTargets(targets)
}
const inferConstraintTargets = (constraint: PgmlSchemaModel['tables'][number]['constraints'][number]) => {
  const tableId = normalizeReference(constraint.tableName)
  const matchedColumns = inferColumnsFromText(tableId, constraint.expression)

  if (!matchedColumns.length) {
    return [{
      tableId,
      columnName: null
    }]
  }

  return getUniqueImpactTargets(matchedColumns.map(columnName => ({
    tableId,
    columnName
  })))
}

const inferCustomTypeTargets = (customType: PgmlCustomType) => {
  const targets = model.tables.flatMap((table) => {
    return table.columns
      .filter(column => column.type.includes(customType.name))
      .map(column => ({
        tableId: table.fullName,
        columnName: column.name
      }))
  })

  return getUniqueImpactTargets(targets)
}

const normalizeMetadataKey = (value: string) => value.toLowerCase().replaceAll(/[^\w]+/g, '_')
const getMetadataValue = (metadata: Array<{ key: string, value: string }>, key: string) => {
  const normalizedKey = normalizeMetadataKey(key)

  return metadata.find(entry => normalizeMetadataKey(entry.key) === normalizedKey)?.value || null
}
const getUniqueTableIds = (targets: ImpactTarget[]) => uniqueValues(targets.map(target => target.tableId))
const getResolvedTableIds = (tableIds: string[]) => uniqueValues(tableIds.filter(tableId => knownTableIds.value.has(tableId)))
const parseMetadataList = (value: string | null) => {
  if (!value) {
    return []
  }

  return value
    .replace(/^\[(.*)\]$/, '$1')
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
}
const buildTriggerSubtitle = (trigger: PgmlSchemaModel['triggers'][number]) => {
  const timing = getMetadataValue(trigger.metadata, 'timing')
  const events = parseMetadataList(getMetadataValue(trigger.metadata, 'events'))
  const level = getMetadataValue(trigger.metadata, 'level')
  const parts: string[] = []

  if (timing) {
    parts.push(timing.toUpperCase())
  }

  if (events.length) {
    parts.push(events.map(eventName => eventName.toUpperCase()).join(' / '))
  }

  if (level) {
    parts.push(level.toUpperCase())
  }

  return parts.join(' · ') || `On ${trigger.tableName}`
}
const buildSequenceSubtitle = (sequence: PgmlSequence) => {
  const ownedBy = getMetadataValue(sequence.metadata, 'owned_by')

  if (ownedBy) {
    return `Owned by ${ownedBy}`
  }

  return 'Sequence'
}
const buildIndexSubtitle = (index: PgmlSchemaModel['tables'][number]['indexes'][number]) => {
  const parts = [index.type.toUpperCase()]

  if (index.columns.length) {
    parts.push(index.columns.join(', '))
  }

  return parts.join(' · ')
}
const getRoutinePrimaryTableIds = (routine: PgmlRoutine) => {
  const candidateGroups = routine.affects
    ? [routine.affects.ownedBy, routine.affects.sets, routine.affects.writes]
    : []

  for (const values of candidateGroups) {
    const tableIds = getUniqueTableIds(getImpactTargetsFromValues(values))

    if (tableIds.length) {
      return tableIds
    }
  }

  const inferredTableIds = getUniqueTableIds(inferRoutineTargets(routine))

  return inferredTableIds.length === 1 ? inferredTableIds : []
}
const getSequenceOwnedTableIds = (sequence: PgmlSequence) => {
  const metadataOwnedBy = getMetadataValue(sequence.metadata, 'owned_by')
  const explicitOwnedBy = sequence.affects?.ownedBy || []
  const values = metadataOwnedBy
    ? [metadataOwnedBy, ...explicitOwnedBy]
    : explicitOwnedBy

  return getUniqueTableIds(getImpactTargetsFromValues(values))
}
const triggerTableIdsByRoutineName = computed(() => {
  const mapping = new Map<string, string[]>()

  model.triggers.forEach((trigger) => {
    const routineName = getMetadataValue(trigger.metadata, 'function')

    if (!routineName) {
      return
    }

    const normalizedRoutineName = cleanForSearch(routineName.split('.').at(-1) || routineName)
    const nextTableIds = mapping.get(normalizedRoutineName) || []

    nextTableIds.push(normalizeReference(trigger.tableName))
    mapping.set(normalizedRoutineName, uniqueValues(nextTableIds))
  })

  return mapping
})
const tableAttachmentState = computed(() => {
  const attachmentsByTableId: Record<string, TableAttachment[]> = {}
  const attachedObjectIds = new Set<string>()
  const addAttachment = (attachment: TableAttachment) => {
    if (!attachmentsByTableId[attachment.tableId]) {
      attachmentsByTableId[attachment.tableId] = []
    }

    attachmentsByTableId[attachment.tableId]?.push(attachment)
    attachedObjectIds.add(attachment.id)
  }

  model.tables.forEach((table) => {
    table.indexes.forEach((index) => {
      getResolvedTableIds([normalizeReference(index.tableName)]).forEach((tableId) => {
        addAttachment({
          id: `index:${index.name}`,
          kind: 'Index',
          title: index.name,
          subtitle: buildIndexSubtitle(index),
          details: [
            `Type: ${index.type.toUpperCase()}`,
            `Columns: ${index.columns.join(', ')}`
          ],
          tableId,
          color: attachmentKindColors.Index,
          flags: []
        })
      })
    })

    table.constraints.forEach((constraint) => {
      getResolvedTableIds([normalizeReference(constraint.tableName)]).forEach((tableId) => {
        addAttachment({
          id: `constraint:${constraint.name}`,
          kind: 'Constraint',
          title: constraint.name,
          subtitle: constraint.expression,
          details: [constraint.expression],
          tableId,
          color: attachmentKindColors.Constraint,
          flags: []
        })
      })
    })
  })

  model.triggers.forEach((trigger) => {
    getResolvedTableIds([normalizeReference(trigger.tableName)]).forEach((tableId) => {
      addAttachment({
        id: `trigger:${trigger.name}`,
        kind: 'Trigger',
        title: trigger.name,
        subtitle: buildTriggerSubtitle(trigger),
        details: trigger.details,
        tableId,
        color: attachmentKindColors.Trigger,
        flags: []
      })
    })
  })

  model.functions.forEach((routine) => {
    const routineId = `function:${routine.name}`
    const triggerTableIds = triggerTableIdsByRoutineName.value.get(cleanForSearch(routine.name)) || []
    const tableIds = getResolvedTableIds(triggerTableIds.length ? triggerTableIds : getRoutinePrimaryTableIds(routine))

    tableIds.forEach((tableId) => {
      addAttachment({
        id: routineId,
        kind: 'Function',
        title: routine.name,
        subtitle: routine.signature,
        details: routine.details,
        tableId,
        color: attachmentKindColors.Function,
        flags: triggerTableIds.length
          ? [{ key: 'trigger-call', label: 'TRIGGER', color: triggerCallFlagColor }]
          : []
      })
    })
  })

  model.procedures.forEach((procedure) => {
    const procedureId = `procedure:${procedure.name}`
    const triggerTableIds = triggerTableIdsByRoutineName.value.get(cleanForSearch(procedure.name)) || []
    const tableIds = getResolvedTableIds(triggerTableIds.length ? triggerTableIds : getRoutinePrimaryTableIds(procedure))

    tableIds.forEach((tableId) => {
      addAttachment({
        id: procedureId,
        kind: 'Procedure',
        title: procedure.name,
        subtitle: procedure.signature,
        details: procedure.details,
        tableId,
        color: attachmentKindColors.Procedure,
        flags: triggerTableIds.length
          ? [{ key: 'trigger-call', label: 'TRIGGER', color: triggerCallFlagColor }]
          : []
      })
    })
  })

  model.sequences.forEach((sequence) => {
    const tableIds = getResolvedTableIds(getSequenceOwnedTableIds(sequence))

    tableIds.forEach((tableId) => {
      addAttachment({
        id: `sequence:${sequence.name}`,
        kind: 'Sequence',
        title: sequence.name,
        subtitle: buildSequenceSubtitle(sequence),
        details: sequence.details,
        tableId,
        color: attachmentKindColors.Sequence,
        flags: []
      })
    })
  })

  Object.values(attachmentsByTableId).forEach((attachments) => {
    attachments.sort((left, right) => {
      const orderDelta = attachmentKindOrder[left.kind] - attachmentKindOrder[right.kind]

      if (orderDelta !== 0) {
        return orderDelta
      }

      return left.title.localeCompare(right.title)
    })
  })

  return {
    attachmentsByTableId,
    attachedObjectIds
  }
})
const tableRowsByTableId = computed(() => {
  return model.tables.reduce<Record<string, TableRow[]>>((rowsByTableId, table) => {
    const rows: TableRow[] = [
      ...table.columns.map((column) => {
        return {
          kind: 'column' as const,
          key: `${table.fullName}.${column.name}`,
          tableId: table.fullName,
          column
        }
      }),
      ...(tableAttachmentState.value.attachmentsByTableId[table.fullName] || []).map((attachment) => {
        return {
          kind: 'attachment' as const,
          key: attachment.id,
          tableId: table.fullName,
          attachment
        }
      })
    ]

    rowsByTableId[table.fullName] = rows
    return rowsByTableId
  }, {})
})
const getTableRows = (tableId: string) => tableRowsByTableId.value[tableId] || []

const buildGroupRelationWeights = (groupNames: string[]) => {
  const weights: Record<string, Record<string, number>> = {}

  groupNames.forEach((groupName) => {
    weights[groupName] = {}
  })

  for (const reference of model.references) {
    const fromGroup = getGroupNameForTableId(reference.fromTable)
    const toGroup = getGroupNameForTableId(reference.toTable)

    if (fromGroup === toGroup) {
      continue
    }

    weights[fromGroup] = weights[fromGroup] || {}
    weights[toGroup] = weights[toGroup] || {}
    weights[fromGroup][toGroup] = (weights[fromGroup][toGroup] || 0) + 3
    weights[toGroup][fromGroup] = (weights[toGroup][fromGroup] || 0) + 3
  }

  return weights
}

const buildPlacedGroupConnections = (
  groupRects: LayoutRect[],
  weights: Record<string, Record<string, number>>
) => {
  const connections: LayoutConnection[] = []

  groupRects.forEach((fromRect, fromIndex) => {
    groupRects.slice(fromIndex + 1).forEach((toRect) => {
      const fromGroupName = fromRect.id.replace('group:', '')
      const toGroupName = toRect.id.replace('group:', '')
      const relationWeight = weights[fromGroupName]?.[toGroupName] || 0

      if (relationWeight <= 0) {
        return
      }

      connections.push(buildConnection(fromRect, toRect))
    })
  })

  return connections
}

const resolveObjectCollisions = (states: Record<string, CanvasNodeState>) => {
  const nextStates: Record<string, CanvasNodeState> = { ...states }
  const groupRects = Object.values(nextStates)
    .filter(node => node.kind === 'group')
    .map(node => getNodeRect(node))
  const groupWeights = buildGroupRelationWeights(groupRects.map(rect => rect.id.replace('group:', '')))

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let moved = false
    const objectNodes = Object.values(nextStates).filter(node => node.kind === 'object')

    for (const currentNode of objectNodes) {
      const currentRect = getNodeRect(currentNode)
      const otherObjectRects = objectNodes
        .filter(node => node.id !== currentNode.id)
        .map(node => getNodeRect(node))
      const occupiedRects = [...groupRects, ...otherObjectRects]
      const currentOverlapMetrics = getOverlapMetrics(
        currentRect,
        occupiedRects,
        rect => rect.id.startsWith('group:') ? 28 : 18
      )

      if (currentOverlapMetrics.overlapCount === 0) {
        continue
      }

      const relatedRects = getRelatedGroupRectsForNode(currentNode, nextStates)
      const midpointCenter = getMidpointCenter(relatedRects) || getRectCenter(currentRect)
      const existingConnections = [
        ...buildPlacedGroupConnections(groupRects, groupWeights),
        ...objectNodes
          .filter(node => node.id !== currentNode.id)
          .flatMap((node) => {
            return getRelatedGroupRectsForNode(node, nextStates).map(rect => buildConnection(getNodeRect(node), rect))
          })
      ]
      const currentCenter = getRectCenter(currentRect)
      const candidates = dedupeCandidates([
        ...buildRingCandidates(currentCenter, currentNode.width, currentNode.height, [0, 120, 220, 340, 480, 620]),
        ...relatedRects.flatMap((rect) => {
          return [96, 180, 280, 420].flatMap((distance) => {
            return [
              { x: rect.x + rect.width + distance, y: rect.y + (rect.height - currentNode.height) / 2 },
              { x: rect.x - currentNode.width - distance, y: rect.y + (rect.height - currentNode.height) / 2 },
              { x: rect.x + (rect.width - currentNode.width) / 2, y: rect.y + rect.height + distance },
              { x: rect.x + (rect.width - currentNode.width) / 2, y: rect.y - currentNode.height - distance }
            ]
          })
        })
      ])

      const bestCandidate = candidates
        .map((candidate) => {
          const nextRect: LayoutRect = {
            id: currentNode.id,
            x: Math.max(72, Math.round(candidate.x / 12) * 12),
            y: Math.max(72, Math.round(candidate.y / 12) * 12),
            width: currentNode.width,
            height: currentNode.height
          }
          const nextCenter = getRectCenter(nextRect)
          const nextConnections = relatedRects.map(rect => buildConnection(nextRect, rect))
          const overlapMetrics = getOverlapMetrics(
            nextRect,
            occupiedRects,
            rect => rect.id.startsWith('group:') ? 28 : 18
          )
          const relationDistance = occupiedRects.reduce((sum, rect) => {
            const rectCenter = getRectCenter(rect)
            const distance = Math.hypot(nextCenter.x - rectCenter.x, nextCenter.y - rectCenter.y)
            const isRelated = relatedRects.some(relatedRect => relatedRect.id === rect.id)

            return sum + (isRelated ? distance * 0.72 : Math.max(0, 220 - distance) * 0.9)
          }, 0)
          const metrics: PlacementMetrics = {
            overlapCount: overlapMetrics.overlapCount,
            overlapArea: overlapMetrics.overlapArea,
            relationDistance,
            midpointDistance: Math.hypot(nextCenter.x - midpointCenter.x, nextCenter.y - midpointCenter.y),
            crossingCount: countConnectionCrossings(nextConnections, existingConnections),
            lineHitCount: countConnectionRectHits(
              nextConnections,
              occupiedRects,
              new Set([currentNode.id, ...relatedRects.map(rect => rect.id)])
            ),
            originDistance: Math.hypot(nextCenter.x - currentCenter.x, nextCenter.y - currentCenter.y)
          }

          return {
            candidate: nextRect,
            metrics
          }
        })
        .sort((left, right) => comparePlacementMetrics(left.metrics, right.metrics))[0]

      if (!bestCandidate) {
        continue
      }

      const currentMetrics: PlacementMetrics = {
        overlapCount: currentOverlapMetrics.overlapCount,
        overlapArea: currentOverlapMetrics.overlapArea,
        relationDistance: 0,
        midpointDistance: 0,
        crossingCount: Number.POSITIVE_INFINITY,
        lineHitCount: Number.POSITIVE_INFINITY,
        originDistance: 0
      }

      if (comparePlacementMetrics(bestCandidate.metrics, currentMetrics) >= 0) {
        continue
      }

      nextStates[currentNode.id] = {
        ...currentNode,
        x: bestCandidate.candidate.x,
        y: bestCandidate.candidate.y
      }
      moved = true
    }

    if (!moved) {
      break
    }
  }

  return nextStates
}

const autoLayoutGroups = (groupNodes: CanvasNodeState[]) => {
  const positions: Record<string, { x: number, y: number }> = {}
  const placed: LayoutRect[] = []
  const placedConnections: LayoutConnection[] = []
  const weights = buildGroupRelationWeights(groupNodes.map(node => node.title))
  const orderedGroups = [...groupNodes].sort((left, right) => {
    const leftWeight = Object.values(weights[left.title] || {}).reduce((sum, value) => sum + value, 0)
    const rightWeight = Object.values(weights[right.title] || {}).reduce((sum, value) => sum + value, 0)

    if (rightWeight !== leftWeight) {
      return rightWeight - leftWeight
    }

    if ((right.tableCount || 0) !== (left.tableCount || 0)) {
      return (right.tableCount || 0) - (left.tableCount || 0)
    }

    return left.title.localeCompare(right.title)
  })

  orderedGroups.forEach((groupNode, index) => {
    const relatedRects = placed.filter((rect) => {
      const relatedName = rect.id.replace('group:', '')
      return (weights[groupNode.title]?.[relatedName] || 0) > 0
    })
    const anchors = relatedRects.length ? relatedRects : placed.slice(-3)
    const fallbackX = 120 + (index % 2) * (groupNode.width + 220)
    const fallbackY = 120 + Math.floor(index / 2) * 440
    const anchorCandidates = anchors.flatMap((anchor) => {
      return [160, 280, 420].flatMap((distance) => {
        return [
          {
            x: anchor.x + anchor.width + distance,
            y: anchor.y + (anchor.height - groupNode.height) / 2
          },
          {
            x: anchor.x - groupNode.width - distance,
            y: anchor.y + (anchor.height - groupNode.height) / 2
          },
          {
            x: anchor.x + (anchor.width - groupNode.width) / 2,
            y: anchor.y + anchor.height + distance * 0.76
          },
          {
            x: anchor.x + (anchor.width - groupNode.width) / 2,
            y: anchor.y - groupNode.height - distance * 0.76
          }
        ]
      })
    })
    const centroid = relatedRects.length
      ? relatedRects.reduce((sum, rect) => {
          const rectCenter = getRectCenter(rect)

          return {
            x: sum.x + rectCenter.x,
            y: sum.y + rectCenter.y
          }
        }, { x: 0, y: 0 })
      : { x: fallbackX + groupNode.width / 2, y: fallbackY + groupNode.height / 2 }
    const centroidPoint = relatedRects.length
      ? {
          x: centroid.x / relatedRects.length,
          y: centroid.y / relatedRects.length
        }
      : centroid
    const midpointCenter = getMidpointCenter(relatedRects) || centroidPoint
    const candidates = dedupeCandidates([
      ...anchorCandidates,
      ...buildRingCandidates(centroidPoint, groupNode.width, groupNode.height, [0, 200, 360, 520]),
      { x: fallbackX, y: fallbackY }
    ])

    const bestCandidate = candidates
      .map((candidate) => {
        const nextRect: LayoutRect = {
          id: groupNode.id,
          x: Math.max(72, Math.round(candidate.x / 12) * 12),
          y: Math.max(72, Math.round(candidate.y / 12) * 12),
          width: groupNode.width,
          height: groupNode.height
        }
        const nextCenter = getRectCenter(nextRect)
        const nextConnections = relatedRects.map(rect => buildConnection(nextRect, rect))
        const overlapMetrics = getOverlapMetrics(nextRect, placed, () => layoutPadding)
        const relationDistance = placed.reduce((sum, rect) => {
          const rectCenter = getRectCenter(rect)
          const distance = Math.hypot(nextCenter.x - rectCenter.x, nextCenter.y - rectCenter.y)
          const relationWeight = weights[groupNode.title]?.[rect.id.replace('group:', '')] || 0
          const relationScore = relationWeight > 0
            ? distance / relationWeight
            : Math.max(0, 340 - distance) * 1.2

          return sum + relationScore
        }, 0)
        const crossingCount = countConnectionCrossings(nextConnections, placedConnections)
        const lineHitCount = countConnectionRectHits(
          nextConnections,
          placed,
          new Set([groupNode.id, ...relatedRects.map(rect => rect.id)])
        )
        const metrics: PlacementMetrics = {
          overlapCount: overlapMetrics.overlapCount,
          overlapArea: overlapMetrics.overlapArea,
          relationDistance,
          midpointDistance: Math.hypot(nextCenter.x - midpointCenter.x, nextCenter.y - midpointCenter.y),
          crossingCount,
          lineHitCount,
          originDistance: Math.hypot(nextRect.x - fallbackX, nextRect.y - fallbackY)
        }

        return {
          candidate: nextRect,
          metrics
        }
      })
      .sort((left, right) => comparePlacementMetrics(left.metrics, right.metrics))[0]

    const resolvedCandidate = bestCandidate?.candidate || {
      id: groupNode.id,
      x: fallbackX,
      y: fallbackY,
      width: groupNode.width,
      height: groupNode.height
    }

    positions[groupNode.id] = {
      x: resolvedCandidate.x,
      y: resolvedCandidate.y
    }
    placed.push(resolvedCandidate)
    relatedRects.forEach((rect) => {
      placedConnections.push(buildConnection(resolvedCandidate, rect))
    })
  })

  return positions
}

const autoLayoutObjectNodes = (objectNodes: CanvasNodeState[], groupStates: Record<string, CanvasNodeState>) => {
  const positions: Record<string, { x: number, y: number }> = {}
  const placedObjects: LayoutRect[] = []
  const groupRects = Object.values(groupStates)
    .filter(node => node.kind === 'group')
    .map(node => getNodeRect(node))
  const placedConnections = buildPlacedGroupConnections(groupRects, buildGroupRelationWeights(groupRects.map(rect => rect.id.replace('group:', ''))))
  const orderedObjects = [...objectNodes].sort((left, right) => {
    if (right.tableIds.length !== left.tableIds.length) {
      return right.tableIds.length - left.tableIds.length
    }

    return left.title.localeCompare(right.title)
  })

  orderedObjects.forEach((objectNode, index) => {
    const relatedGroupNames = uniqueValues(objectNode.tableIds.map(tableId => getGroupNameForTableId(tableId)))
    const relatedRects = relatedGroupNames
      .map(groupName => groupStates[`group:${groupName}`])
      .filter((node): node is CanvasNodeState => Boolean(node))
      .map(node => getNodeRect(node))
    const centroid = relatedRects.length
      ? relatedRects.reduce((sum, rect) => {
          const center = getRectCenter(rect)

          return {
            x: sum.x + center.x,
            y: sum.y + center.y
          }
        }, { x: 0, y: 0 })
      : { x: objectColumnX, y: 160 + index * 140 }
    const centroidPoint = relatedRects.length
      ? {
          x: centroid.x / relatedRects.length,
          y: centroid.y / relatedRects.length
        }
      : centroid
    const midpointCenter = getMidpointCenter(relatedRects) || centroidPoint

    const candidates = relatedRects.length
      ? dedupeCandidates([
          ...relatedRects.flatMap((rect, rectIndex) => {
            return [84, 164, 264].flatMap((distance) => {
              return [
                {
                  x: rect.x + rect.width + distance,
                  y: rect.y + 22 + rectIndex * 18
                },
                {
                  x: rect.x - objectNode.width - distance,
                  y: rect.y + 22 + rectIndex * 18
                },
                {
                  x: rect.x + clamp((rect.width - objectNode.width) / 2, -objectNode.width / 2, rect.width),
                  y: rect.y + rect.height + distance
                },
                {
                  x: rect.x + clamp((rect.width - objectNode.width) / 2, -objectNode.width / 2, rect.width),
                  y: rect.y - objectNode.height - distance
                }
              ]
            })
          }),
          ...buildRingCandidates(centroidPoint, objectNode.width, objectNode.height, [96, 180, 280, 380]),
          {
            x: objectColumnX + (index % 2) * objectColumnGapX,
            y: 120 + Math.floor(index / 2) * objectRowGapY
          }
        ])
      : [
          {
            x: objectColumnX + (index % 2) * objectColumnGapX,
            y: 120 + Math.floor(index / 2) * objectRowGapY
          }
        ]

    const bestCandidate = candidates
      .map((candidate) => {
        const nextRect: LayoutRect = {
          id: objectNode.id,
          x: Math.max(72, Math.round(candidate.x / 12) * 12),
          y: Math.max(72, Math.round(candidate.y / 12) * 12),
          width: objectNode.width,
          height: objectNode.height
        }
        const nextCenter = getRectCenter(nextRect)
        const occupiedRects = [...groupRects, ...placedObjects]
        const nextConnections = relatedRects.map(rect => buildConnection(nextRect, rect))
        const overlapMetrics = getOverlapMetrics(
          nextRect,
          occupiedRects,
          rect => rect.id.startsWith('group:') ? 56 : 28
        )
        const relationDistance = occupiedRects.reduce((sum, rect) => {
          const rectCenter = getRectCenter(rect)
          const distance = Math.hypot(nextCenter.x - rectCenter.x, nextCenter.y - rectCenter.y)
          const relationScore = relatedRects.some(relatedRect => relatedRect.id === rect.id)
            ? distance * 0.72
            : Math.max(0, 220 - distance) * 0.9

          return sum + relationScore
        }, 0)
        const crossingCount = countConnectionCrossings(nextConnections, placedConnections)
        const lineHitCount = countConnectionRectHits(
          nextConnections,
          occupiedRects,
          new Set([objectNode.id, ...relatedRects.map(rect => rect.id)])
        )
        const metrics: PlacementMetrics = {
          overlapCount: overlapMetrics.overlapCount,
          overlapArea: overlapMetrics.overlapArea,
          relationDistance,
          midpointDistance: Math.hypot(nextCenter.x - midpointCenter.x, nextCenter.y - midpointCenter.y),
          crossingCount,
          lineHitCount,
          originDistance: Math.hypot(nextRect.x - centroidPoint.x, nextRect.y - centroidPoint.y)
        }

        return {
          candidate: nextRect,
          metrics
        }
      })
      .sort((left, right) => comparePlacementMetrics(left.metrics, right.metrics))[0]

    const resolvedCandidate = bestCandidate?.candidate || {
      id: objectNode.id,
      x: objectColumnX + (index % 2) * objectColumnGapX,
      y: 120 + Math.floor(index / 2) * objectRowGapY,
      width: objectNode.width,
      height: objectNode.height
    }

    positions[objectNode.id] = {
      x: resolvedCandidate.x,
      y: resolvedCandidate.y
    }
    placedObjects.push(resolvedCandidate)
    relatedRects.forEach((rect) => {
      placedConnections.push(buildConnection(resolvedCandidate, rect))
    })
  })

  return positions
}

const buildObjectNodes = (groupStates: Record<string, CanvasNodeState>) => {
  const nodes: CanvasNodeState[] = []
  const lanes: Record<string, number> = {}
  const attachedObjectIds = tableAttachmentState.value.attachedObjectIds

  const resolveGroupName = (tableIds: string[]) => {
    const firstTable = model.tables.find(table => tableIds.includes(table.fullName))
    return firstTable?.groupName || 'Ungrouped'
  }

  const nextPosition = (tableIds: string[], kind: ObjectKind) => {
    const groupName = resolveGroupName(tableIds)
    const groupNode = groupStates[`group:${groupName}`]
    const laneKey = `${groupName}:${kind === 'Function' || kind === 'Procedure' || kind === 'Trigger' || kind === 'Sequence' ? 'bottom' : 'side'}`
    const lane = lanes[laneKey] || 0

    lanes[laneKey] = lane + 1

    if (!groupNode) {
      return {
        x: objectColumnX + (lane % 2) * objectColumnGapX,
        y: 90 + Math.floor(lane / 2) * objectRowGapY
      }
    }

    if (kind === 'Function' || kind === 'Procedure' || kind === 'Trigger' || kind === 'Sequence') {
      return {
        x: groupNode.x + (lane % 2) * objectColumnGapX,
        y: groupNode.y + groupNode.height + 56 + Math.floor(lane / 2) * objectRowGapY
      }
    }

    return {
      x: groupNode.x + groupNode.width + 72 + (lane % 2) * objectColumnGapX,
      y: groupNode.y + lane * 136
    }
  }

  const addNode = (partial: Omit<CanvasNodeState, 'x' | 'y'>) => {
    const position = nextPosition(partial.tableIds, partial.objectKind || 'Index')

    nodes.push({
      ...partial,
      ...position
    })
  }

  for (const table of model.tables) {
    for (const index of table.indexes) {
      const indexId = `index:${index.name}`

      if (attachedObjectIds.has(indexId)) {
        continue
      }

      addNode({
        id: indexId,
        kind: 'object',
        objectKind: 'Index',
        collapsed: true,
        title: index.name,
        subtitle: `${index.type.toUpperCase()} on ${table.name}`,
        details: [
          `Type: ${index.type.toUpperCase()}`,
          `Columns: ${index.columns.join(', ')}`
        ],
        width: 248,
        height: 104,
        expandedHeight: 104,
        color: attachmentKindColors.Index,
        tableIds: [normalizeReference(index.tableName)],
        impactTargets: inferIndexTargets(index),
        sourceRange: index.sourceRange
      })
    }
  }

  for (const table of model.tables) {
    for (const constraint of table.constraints) {
      const constraintId = `constraint:${constraint.name}`

      if (attachedObjectIds.has(constraintId)) {
        continue
      }

      addNode({
        id: constraintId,
        kind: 'object',
        objectKind: 'Constraint',
        collapsed: true,
        title: constraint.name,
        subtitle: constraint.expression,
        details: [constraint.expression],
        width: 320,
        height: 114,
        expandedHeight: 114,
        color: attachmentKindColors.Constraint,
        tableIds: [normalizeReference(constraint.tableName)],
        impactTargets: inferConstraintTargets(constraint),
        sourceRange: constraint.sourceRange
      })
    }
  }

  for (const pgFunction of model.functions) {
    const functionId = `function:${pgFunction.name}`

    if (attachedObjectIds.has(functionId)) {
      continue
    }

    const impactTargets = inferRoutineTargets(pgFunction)

    addNode({
      id: functionId,
      kind: 'object',
      objectKind: 'Function',
      collapsed: true,
      title: pgFunction.name,
      subtitle: pgFunction.signature,
      details: pgFunction.details,
      width: 336,
      height: 176,
      expandedHeight: 176,
      color: attachmentKindColors.Function,
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets,
      sourceRange: pgFunction.sourceRange
    })
  }

  for (const procedure of model.procedures) {
    const procedureId = `procedure:${procedure.name}`

    if (attachedObjectIds.has(procedureId)) {
      continue
    }

    const impactTargets = inferRoutineTargets(procedure)

    addNode({
      id: procedureId,
      kind: 'object',
      objectKind: 'Procedure',
      collapsed: true,
      title: procedure.name,
      subtitle: procedure.signature,
      details: procedure.details,
      width: 320,
      height: 156,
      expandedHeight: 156,
      color: attachmentKindColors.Procedure,
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets,
      sourceRange: procedure.sourceRange
    })
  }

  for (const trigger of model.triggers) {
    const triggerId = `trigger:${trigger.name}`

    if (attachedObjectIds.has(triggerId)) {
      continue
    }

    const tableId = normalizeReference(trigger.tableName)

    addNode({
      id: triggerId,
      kind: 'object',
      objectKind: 'Trigger',
      collapsed: true,
      title: trigger.name,
      subtitle: `On ${trigger.tableName}`,
      details: trigger.details,
      width: 332,
      height: 168,
      expandedHeight: 168,
      color: attachmentKindColors.Trigger,
      tableIds: [tableId],
      impactTargets: inferTriggerTargets(tableId, trigger),
      sourceRange: trigger.sourceRange
    })
  }

  for (const sequence of model.sequences) {
    const sequenceId = `sequence:${sequence.name}`

    if (attachedObjectIds.has(sequenceId)) {
      continue
    }

    const impactTargets = inferSequenceTargets(sequence)

    addNode({
      id: sequenceId,
      kind: 'object',
      objectKind: 'Sequence',
      collapsed: true,
      title: sequence.name,
      subtitle: 'Sequence',
      details: sequence.details,
      width: 308,
      height: 156,
      expandedHeight: 156,
      color: attachmentKindColors.Sequence,
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets,
      sourceRange: sequence.sourceRange
    })
  }

  for (const customType of model.customTypes) {
    const impactTargets = inferCustomTypeTargets(customType)

    addNode({
      id: `custom-type:${customType.kind}:${customType.name}`,
      kind: 'object',
      objectKind: 'Custom Type',
      collapsed: true,
      title: customType.name,
      subtitle: customType.kind,
      details: customType.details,
      width: 258,
      height: 114,
      expandedHeight: 114,
      color: '#14b8a6',
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets,
      sourceRange: customType.sourceRange
    })
  }

  return nodes
}

const syncNodeStates = () => {
  const nextStates: Record<string, CanvasNodeState> = {}
  const tableGroups = new Map<string, typeof model.tables>()
  const orderedNames: string[] = []
  const groupNodes: CanvasNodeState[] = []

  for (const table of model.tables) {
    const groupName = table.groupName || 'Ungrouped'

    if (!tableGroups.has(groupName)) {
      tableGroups.set(groupName, [])
      orderedNames.push(groupName)
    }

    tableGroups.get(groupName)?.push(table)
  }

  orderedNames.forEach((groupName, index) => {
    const tables = tableGroups.get(groupName) || []
    const existing = nodeStates.value[`group:${groupName}`]
    const storedLayout = model.nodeProperties[`group:${groupName}`]
    const color = existing?.color || palette[index % palette.length] || '#8b5cf6'
    const columnCount = storedLayout?.tableColumns ?? existing?.columnCount ?? 1
    const note = model.groups.find(group => group.name === groupName)?.note || null
    const minimumSize = getGroupMinimumSize(groupName, columnCount)

    groupNodes.push({
      id: `group:${groupName}`,
      kind: 'group',
      collapsed: false,
      title: groupName,
      subtitle: note || '',
      details: tables.map(table => table.fullName),
      x: storedLayout?.x ?? existing?.x ?? 120 + index * 420,
      y: storedLayout?.y ?? existing?.y ?? 90 + (index % 2) * 120,
      width: minimumSize.minWidth,
      height: minimumSize.minHeight,
      expandedHeight: minimumSize.minHeight,
      color,
      tableIds: tables.map(table => table.fullName),
      tableCount: tables.length,
      columnCount,
      note,
      minWidth: minimumSize.minWidth,
      minHeight: minimumSize.minHeight,
      hasStoredLayout: Boolean(storedLayout)
    })
  })

  const groupPositions = autoLayoutGroups(groupNodes)

  for (const groupNode of groupNodes) {
    const existing = nodeStates.value[groupNode.id]
    const storedLayout = model.nodeProperties[groupNode.id]

    nextStates[groupNode.id] = {
      ...groupNode,
      x: storedLayout?.x ?? existing?.x ?? groupPositions[groupNode.id]?.x ?? groupNode.x,
      y: storedLayout?.y ?? existing?.y ?? groupPositions[groupNode.id]?.y ?? groupNode.y
    }
  }

  const objectNodes = buildObjectNodes(nextStates)
  const objectPositions = autoLayoutObjectNodes(objectNodes, nextStates)

  for (const objectNode of objectNodes) {
    const existing = nodeStates.value[objectNode.id]
    const storedLayout = model.nodeProperties[objectNode.id]
    const collapsed = existing?.collapsed ?? true
    const expandedHeight = Math.max(
      storedLayout?.height
      ?? existing?.expandedHeight
      ?? (existing?.collapsed ? objectNode.expandedHeight || objectNode.height : existing?.height)
      ?? objectNode.expandedHeight
      ?? objectNode.height,
      objectNode.expandedHeight || objectNode.height
    )

    nextStates[objectNode.id] = {
      ...objectNode,
      collapsed,
      x: storedLayout?.x ?? existing?.x ?? objectPositions[objectNode.id]?.x ?? objectNode.x,
      y: storedLayout?.y ?? existing?.y ?? objectPositions[objectNode.id]?.y ?? objectNode.y,
      width: storedLayout?.width ?? existing?.width ?? objectNode.width,
      height: collapsed ? existing?.height ?? collapsedObjectHeight : expandedHeight,
      expandedHeight,
      color: existing?.color || objectNode.color,
      minWidth: existing?.minWidth ?? objectNode.width,
      minHeight: collapsed ? existing?.minHeight ?? collapsedObjectHeight : existing?.minHeight ?? objectNode.height,
      hasStoredLayout: Boolean(storedLayout)
    }
  }

  nodeStates.value = nextStates

  if (selectedNodeId.value && !nodeStates.value[selectedNodeId.value]) {
    selectedNodeId.value = null
  }
}

const getElementIdentity = (element: HTMLElement) => {
  return (
    element.getAttribute('data-impact-anchor')
    || element.getAttribute('data-column-label-anchor')
    || element.getAttribute('data-column-anchor')
    || element.getAttribute('data-table-anchor')
    || element.getAttribute('data-node-anchor')
    || ''
  )
}

const getColumnAnchorKey = (tableId: string, columnName: string) => `${tableId}.${columnName}`.toLowerCase()
const getColumnLabelAnchorKey = (tableId: string, columnName: string) => `${tableId}.${columnName}`.toLowerCase()
const getImpactAnchorKey = (nodeId: string, tableId: string) => `${nodeId}:${tableId}`.toLowerCase()
const getFieldAnchorElement = (tableId: string, columnName: string) => {
  if (!planeRef.value) {
    return null
  }

  return (
    planeRef.value.querySelector(`[data-column-label-anchor="${getColumnLabelAnchorKey(tableId, columnName)}"]`)
    || planeRef.value.querySelector(`[data-column-anchor="${getColumnAnchorKey(tableId, columnName)}"]`)
    || planeRef.value.querySelector(`[data-table-anchor="${tableId}"]`)
  )
}
const getImpactAnchorElement = (nodeId: string, tableId: string) => {
  if (!planeRef.value) {
    return null
  }

  return (
    planeRef.value.querySelector(`[data-impact-anchor="${getImpactAnchorKey(nodeId, tableId)}"]`)
    || planeRef.value.querySelector(`[data-node-anchor="${nodeId}"]`)
  )
}
const canvasViewportStyle = {
  borderColor: 'var(--studio-shell-border)',
  backgroundColor: 'var(--studio-canvas-bg)',
  backgroundImage: 'radial-gradient(circle at center, var(--studio-canvas-dot) 1px, transparent 1px)',
  backgroundSize: '18px 18px'
}
const floatingPanelStyle = {
  borderColor: 'var(--studio-control-border)',
  backgroundColor: 'var(--studio-control-bg)',
  boxShadow: 'var(--studio-floating-shadow)'
}
const getNodeBorderColor = (node: CanvasNodeState) => {
  return node.kind === 'group'
    ? `color-mix(in srgb, ${node.color} 38%, var(--studio-node-border-neutral) 62%)`
    : `color-mix(in srgb, ${node.color} 62%, var(--studio-node-border-neutral) 38%)`
}
const getNodeBackground = (node: CanvasNodeState) => {
  return node.kind === 'group'
    ? `linear-gradient(180deg, color-mix(in srgb, ${node.color} 12%, transparent), var(--studio-group-surface-soft) 22%), var(--studio-group-surface)`
    : `color-mix(in srgb, ${node.color} 8%, var(--studio-node-surface-bottom) 92%)`
}
const getNodeAccentColor = (node: CanvasNodeState) => {
  return `color-mix(in srgb, ${node.color} 70%, var(--studio-node-accent-mix) 30%)`
}
const getAttachmentRowStyle = (attachment: TableAttachment) => {
  return {
    backgroundColor: `color-mix(in srgb, ${attachment.color} 8%, var(--studio-row-surface) 92%)`,
    boxShadow: `inset 3px 0 0 color-mix(in srgb, ${attachment.color} 58%, transparent)`
  }
}
const getAttachmentKindBadgeStyle = (attachment: TableAttachment) => {
  return {
    borderColor: `color-mix(in srgb, ${attachment.color} 58%, var(--studio-rail) 42%)`,
    backgroundColor: `color-mix(in srgb, ${attachment.color} 16%, transparent)`,
    color: `color-mix(in srgb, ${attachment.color} 72%, var(--studio-shell-text) 28%)`
  }
}
const getAttachmentFlagStyle = (flag: TableAttachmentFlag) => {
  return {
    borderColor: `color-mix(in srgb, ${flag.color} 56%, var(--studio-rail) 44%)`,
    backgroundColor: `color-mix(in srgb, ${flag.color} 14%, transparent)`,
    color: `color-mix(in srgb, ${flag.color} 72%, var(--studio-shell-text) 28%)`
  }
}

const getAnchorSlotCount = (element: HTMLElement, side: AnchorSide) => {
  if (element.hasAttribute('data-column-label-anchor')) {
    return isHorizontalSide(side) ? 2 : 3
  }

  const bounds = element.getBoundingClientRect()
  const dimension = isHorizontalSide(side) ? bounds.height : bounds.width
  const divisor = element.hasAttribute('data-table-anchor')
    ? (isHorizontalSide(side) ? 72 : 144)
    : (isHorizontalSide(side) ? 56 : 128)

  return Math.max(2, Math.min(10, Math.ceil(dimension / divisor)))
}

const getAnchorPoint = (
  element: HTMLElement,
  side: AnchorSide,
  slot: number,
  count: number,
  planeBounds: DOMRect
): AnchorPoint => {
  const bounds = element.getBoundingClientRect()
  const ratio = count === 1 ? 0.5 : (slot + 1) / (count + 1)
  const xLeft = (bounds.left - planeBounds.left) / scale.value
  const xRight = (bounds.right - planeBounds.left) / scale.value
  const yTop = (bounds.top - planeBounds.top) / scale.value
  const yBottom = (bounds.bottom - planeBounds.top) / scale.value
  const xCenter = (bounds.left - planeBounds.left + bounds.width * ratio) / scale.value
  const yCenter = (bounds.top - planeBounds.top + bounds.height * ratio) / scale.value

  if (side === 'left') {
    return {
      x: xLeft,
      y: yCenter,
      side,
      slot,
      count
    }
  }

  if (side === 'right') {
    return {
      x: xRight,
      y: yCenter,
      side,
      slot,
      count
    }
  }

  if (side === 'top') {
    return {
      x: xCenter,
      y: yTop,
      side,
      slot,
      count
    }
  }

  return {
    x: xCenter,
    y: yBottom,
    side,
    slot,
    count
  }
}

const reserveAnchorPoint = (
  element: HTMLElement,
  side: AnchorSide,
  desiredRatio: number,
  planeBounds: DOMRect,
  usage: Map<string, number[]>
) => {
  const count = getAnchorSlotCount(element, side)
  const key = `${getElementIdentity(element)}:${side}`
  const slots = usage.get(key) || Array.from({ length: count }, () => 0)

  if (slots.length < count) {
    slots.push(...Array.from({ length: count - slots.length }, () => 0))
  }

  let bestSlot = 0
  let bestScore = Number.POSITIVE_INFINITY

  for (let slot = 0; slot < count; slot += 1) {
    const ratio = count === 1 ? 0.5 : (slot + 1) / (count + 1)
    const slotUsage = slots[slot] || 0
    const score = Math.abs(ratio - desiredRatio) + slotUsage * 0.35

    if (score < bestScore) {
      bestScore = score
      bestSlot = slot
    }
  }

  slots[bestSlot] = (slots[bestSlot] || 0) + 1
  usage.set(key, slots)

  return getAnchorPoint(element, side, bestSlot, count, planeBounds)
}

const moveAnchorPoint = (point: AnchorPoint, distance: number) => {
  if (point.side === 'left') {
    return {
      x: point.x - distance,
      y: point.y
    }
  }

  if (point.side === 'right') {
    return {
      x: point.x + distance,
      y: point.y
    }
  }

  if (point.side === 'top') {
    return {
      x: point.x,
      y: point.y - distance
    }
  }

  return {
    x: point.x,
    y: point.y + distance
  }
}

const getSharedGroupElement = (fromElement: HTMLElement, toElement: HTMLElement) => {
  const fromGroup = fromElement.closest('[data-node-anchor^="group:"]')
  const toGroup = toElement.closest('[data-node-anchor^="group:"]')

  if (!(fromGroup instanceof HTMLElement) || !(toGroup instanceof HTMLElement) || fromGroup !== toGroup) {
    return null
  }

  return fromGroup
}

const reserveLaneOffset = (
  key: string,
  usage: Map<string, number[]>,
  baseOffset: number,
  gap: number
) => {
  const slots = usage.get(key) || [0]
  const laneIndex = slots[0] || 0

  slots[0] = laneIndex + 1
  usage.set(key, slots)

  return baseOffset + laneIndex * gap
}

const getExternalLaneSide = (fromBounds: DOMRect, toBounds: DOMRect, groupBounds: DOMRect): AnchorSide => {
  const sourceCenterX = fromBounds.left + fromBounds.width / 2
  const sourceCenterY = fromBounds.top + fromBounds.height / 2
  const targetCenterX = toBounds.left + toBounds.width / 2
  const targetCenterY = toBounds.top + toBounds.height / 2
  const sideScores: Array<{ side: AnchorSide, score: number }> = [
    {
      side: 'left',
      score: (sourceCenterX - groupBounds.left) + (targetCenterX - groupBounds.left)
    },
    {
      side: 'right',
      score: (groupBounds.right - sourceCenterX) + (groupBounds.right - targetCenterX)
    },
    {
      side: 'top',
      score: (sourceCenterY - groupBounds.top) + (targetCenterY - groupBounds.top)
    },
    {
      side: 'bottom',
      score: (groupBounds.bottom - sourceCenterY) + (groupBounds.bottom - targetCenterY)
    }
  ]

  return sideScores.sort((left, right) => left.score - right.score)[0]?.side || 'right'
}

const buildSharedGroupPath = (
  fromElement: HTMLElement,
  toElement: HTMLElement,
  groupElement: HTMLElement,
  planeBounds: DOMRect,
  usage: Map<string, number[]>
) => {
  const fromBounds = fromElement.getBoundingClientRect()
  const toBounds = toElement.getBoundingClientRect()
  const groupBounds = groupElement.getBoundingClientRect()
  const laneSide = getExternalLaneSide(fromBounds, toBounds, groupBounds)
  const sourceCenterX = fromBounds.left + fromBounds.width / 2
  const sourceCenterY = fromBounds.top + fromBounds.height / 2
  const targetCenterX = toBounds.left + toBounds.width / 2
  const targetCenterY = toBounds.top + toBounds.height / 2
  const fromRatio = isHorizontalSide(laneSide)
    ? clamp((targetCenterY - fromBounds.top) / Math.max(fromBounds.height, 1), 0.16, 0.84)
    : clamp((targetCenterX - fromBounds.left) / Math.max(fromBounds.width, 1), 0.16, 0.84)
  const toRatio = isHorizontalSide(laneSide)
    ? clamp((sourceCenterY - toBounds.top) / Math.max(toBounds.height, 1), 0.16, 0.84)
    : clamp((sourceCenterX - toBounds.left) / Math.max(toBounds.width, 1), 0.16, 0.84)
  const fromAnchor = reserveAnchorPoint(fromElement, laneSide, fromRatio, planeBounds, usage)
  const toAnchor = reserveAnchorPoint(toElement, laneSide, toRatio, planeBounds, usage)
  const laneOffset = reserveLaneOffset(
    `group-lane:${groupElement.getAttribute('data-node-anchor')}:${laneSide}`,
    usage,
    28,
    18
  )
  const fromExit = moveAnchorPoint(fromAnchor, laneOffset)
  const toExit = moveAnchorPoint(toAnchor, laneOffset)
  const groupLeft = (groupBounds.left - planeBounds.left) / scale.value
  const groupRight = (groupBounds.right - planeBounds.left) / scale.value
  const groupTop = (groupBounds.top - planeBounds.top) / scale.value
  const groupBottom = (groupBounds.bottom - planeBounds.top) / scale.value

  if (laneSide === 'left' || laneSide === 'right') {
    const laneX = laneSide === 'left'
      ? groupLeft - laneOffset
      : groupRight + laneOffset

    return [
      `M ${fromAnchor.x} ${fromAnchor.y}`,
      `L ${fromExit.x} ${fromExit.y}`,
      `L ${laneX} ${fromExit.y}`,
      `L ${laneX} ${toExit.y}`,
      `L ${toExit.x} ${toExit.y}`,
      `L ${toAnchor.x} ${toAnchor.y}`
    ].join(' ')
  }

  const laneY = laneSide === 'top'
    ? groupTop - laneOffset
    : groupBottom + laneOffset

  return [
    `M ${fromAnchor.x} ${fromAnchor.y}`,
    `L ${fromExit.x} ${fromExit.y}`,
    `L ${fromExit.x} ${laneY}`,
    `L ${toExit.x} ${laneY}`,
    `L ${toExit.x} ${toExit.y}`,
    `L ${toAnchor.x} ${toAnchor.y}`
  ].join(' ')
}

const decideAnchorSides = (fromElement: HTMLElement, toElement: HTMLElement): { from: AnchorSide, to: AnchorSide } => {
  const fromBounds = fromElement.getBoundingClientRect()
  const toBounds = toElement.getBoundingClientRect()
  const fromCenterX = fromBounds.left + fromBounds.width / 2
  const fromCenterY = fromBounds.top + fromBounds.height / 2
  const toCenterX = toBounds.left + toBounds.width / 2
  const toCenterY = toBounds.top + toBounds.height / 2
  const deltaX = toCenterX - fromCenterX
  const deltaY = toCenterY - fromCenterY

  if (Math.abs(deltaX) >= Math.abs(deltaY) * 0.75) {
    return deltaX >= 0
      ? { from: 'right', to: 'left' }
      : { from: 'left', to: 'right' }
  }

  return deltaY >= 0
    ? { from: 'bottom', to: 'top' }
    : { from: 'top', to: 'bottom' }
}

const buildPathFromAnchors = (fromAnchor: AnchorPoint, toAnchor: AnchorPoint) => {
  const routeOffset = 18 + (fromAnchor.slot % 4) * 6 + (toAnchor.slot % 4) * 4
  const fromExit = moveAnchorPoint(fromAnchor, routeOffset)
  const toExit = moveAnchorPoint(toAnchor, routeOffset)

  if (isHorizontalSide(fromAnchor.side) && isHorizontalSide(toAnchor.side)) {
    const midX = fromAnchor.side === toAnchor.side
      ? (fromAnchor.side === 'right'
          ? Math.max(fromExit.x, toExit.x) + 28
          : Math.min(fromExit.x, toExit.x) - 28)
      : (fromExit.x + toExit.x) / 2

    return [
      `M ${fromAnchor.x} ${fromAnchor.y}`,
      `L ${fromExit.x} ${fromExit.y}`,
      `L ${midX} ${fromExit.y}`,
      `L ${midX} ${toExit.y}`,
      `L ${toExit.x} ${toExit.y}`,
      `L ${toAnchor.x} ${toAnchor.y}`
    ].join(' ')
  }

  if (!isHorizontalSide(fromAnchor.side) && !isHorizontalSide(toAnchor.side)) {
    const midY = fromAnchor.side === toAnchor.side
      ? (fromAnchor.side === 'bottom'
          ? Math.max(fromExit.y, toExit.y) + 28
          : Math.min(fromExit.y, toExit.y) - 28)
      : (fromExit.y + toExit.y) / 2

    return [
      `M ${fromAnchor.x} ${fromAnchor.y}`,
      `L ${fromExit.x} ${fromExit.y}`,
      `L ${fromExit.x} ${midY}`,
      `L ${toExit.x} ${midY}`,
      `L ${toExit.x} ${toExit.y}`,
      `L ${toAnchor.x} ${toAnchor.y}`
    ].join(' ')
  }

  if (isHorizontalSide(fromAnchor.side) && !isHorizontalSide(toAnchor.side)) {
    return [
      `M ${fromAnchor.x} ${fromAnchor.y}`,
      `L ${fromExit.x} ${fromExit.y}`,
      `L ${toExit.x} ${fromExit.y}`,
      `L ${toExit.x} ${toExit.y}`,
      `L ${toAnchor.x} ${toAnchor.y}`
    ].join(' ')
  }

  return [
    `M ${fromAnchor.x} ${fromAnchor.y}`,
    `L ${fromExit.x} ${fromExit.y}`,
    `L ${fromExit.x} ${toExit.y}`,
    `L ${toExit.x} ${toExit.y}`,
    `L ${toAnchor.x} ${toAnchor.y}`
  ].join(' ')
}

const buildPathBetween = (
  fromElement: HTMLElement,
  toElement: HTMLElement,
  color: string,
  dashed: boolean,
  usage: Map<string, number[]>
) => {
  if (!planeRef.value) {
    return null
  }

  const planeBounds = planeRef.value.getBoundingClientRect()
  const fromBounds = fromElement.getBoundingClientRect()
  const toBounds = toElement.getBoundingClientRect()
  const sourceCenterX = fromBounds.left + fromBounds.width / 2
  const sourceCenterY = fromBounds.top + fromBounds.height / 2
  const targetCenterX = toBounds.left + toBounds.width / 2
  const targetCenterY = toBounds.top + toBounds.height / 2
  const sharedGroupElement = !dashed ? getSharedGroupElement(fromElement, toElement) : null

  if (sharedGroupElement) {
    return {
      path: buildSharedGroupPath(fromElement, toElement, sharedGroupElement, planeBounds, usage),
      color,
      dashed
    }
  }

  const sides = decideAnchorSides(fromElement, toElement)
  const fromRatio = isHorizontalSide(sides.from)
    ? clamp((targetCenterY - fromBounds.top) / Math.max(fromBounds.height, 1), 0.16, 0.84)
    : clamp((targetCenterX - fromBounds.left) / Math.max(fromBounds.width, 1), 0.16, 0.84)
  const toRatio = isHorizontalSide(sides.to)
    ? clamp((sourceCenterY - toBounds.top) / Math.max(toBounds.height, 1), 0.16, 0.84)
    : clamp((sourceCenterX - toBounds.left) / Math.max(toBounds.width, 1), 0.16, 0.84)
  const fromAnchor = reserveAnchorPoint(fromElement, sides.from, fromRatio, planeBounds, usage)
  const toAnchor = reserveAnchorPoint(toElement, sides.to, toRatio, planeBounds, usage)

  return {
    path: buildPathFromAnchors(fromAnchor, toAnchor),
    color,
    dashed
  }
}

const updateConnections = () => {
  if (!planeRef.value) {
    return
  }

  const descriptors: Array<{
    key: string
    color: string
    dashed: boolean
    fromElement: HTMLElement
    toElement: HTMLElement
  }> = []
  const usage = new Map<string, number[]>()

  for (const reference of model.references) {
    const fromElement = getFieldAnchorElement(reference.fromTable, reference.fromColumn)
    const toElement = getFieldAnchorElement(reference.toTable, reference.toColumn)

    if (!(fromElement instanceof HTMLElement) || !(toElement instanceof HTMLElement)) {
      continue
    }

    descriptors.push({
      key: `ref:${reference.fromTable}:${reference.fromColumn}:${reference.toTable}:${reference.toColumn}`,
      color: '#79e3ea',
      dashed: false,
      fromElement,
      toElement
    })
  }

  for (const node of canvasNodes.value.filter(canvasNode => canvasNode.kind === 'object')) {
    const impactTargets = node.impactTargets?.length
      ? node.impactTargets
      : node.tableIds.map(tableId => ({
          tableId,
          columnName: null
        }))

    for (const impactTarget of impactTargets) {
      const fromElement = getImpactAnchorElement(node.id, impactTarget.tableId)
      const toElement = impactTarget.columnName
        ? getFieldAnchorElement(impactTarget.tableId, impactTarget.columnName)
        : planeRef.value.querySelector(`[data-table-anchor="${impactTarget.tableId}"]`)

      if (!(fromElement instanceof HTMLElement) || !(toElement instanceof HTMLElement)) {
        continue
      }

      descriptors.push({
        key: `${node.id}->${impactTarget.tableId}:${impactTarget.columnName || '*'}`,
        color: node.color,
        dashed: true,
        fromElement,
        toElement
      })
    }
  }

  const lines = descriptors
    .map((descriptor) => {
      const result = buildPathBetween(
        descriptor.fromElement,
        descriptor.toElement,
        descriptor.color,
        descriptor.dashed,
        usage
      )

      if (!result) {
        return null
      }

      return {
        key: descriptor.key,
        path: result.path,
        color: result.color,
        dashed: result.dashed
      } satisfies ConnectionLine
    })
    .filter((line): line is ConnectionLine => Boolean(line))

  connectionLines.value = lines
}

const reflowAutoLayout = () => {
  if (hasEmbeddedLayout.value) {
    return
  }

  const nextStates: Record<string, CanvasNodeState> = { ...nodeStates.value }
  const groupNodes = Object.values(nextStates).filter(node => node.kind === 'group')
  const groupPositions = autoLayoutGroups(groupNodes)

  for (const groupNode of groupNodes) {
    const currentGroupNode = nextStates[groupNode.id]

    if (!currentGroupNode) {
      continue
    }

    nextStates[groupNode.id] = {
      ...currentGroupNode,
      x: groupPositions[groupNode.id]?.x ?? groupNode.x,
      y: groupPositions[groupNode.id]?.y ?? groupNode.y
    }
  }

  const objectNodes = Object.values(nextStates).filter(node => node.kind === 'object')
  const objectPositions = autoLayoutObjectNodes(objectNodes, nextStates)

  for (const objectNode of objectNodes) {
    const currentObjectNode = nextStates[objectNode.id]

    if (!currentObjectNode) {
      continue
    }

    nextStates[objectNode.id] = {
      ...currentObjectNode,
      x: objectPositions[objectNode.id]?.x ?? objectNode.x,
      y: objectPositions[objectNode.id]?.y ?? objectNode.y
    }
  }

  nodeStates.value = resolveObjectCollisions(nextStates)
}

const zoomBy = (direction: 1 | -1) => {
  const nextScale = scale.value + direction * 0.08
  scale.value = Math.min(1.3, Math.max(0.45, Number(nextScale.toFixed(2))))
}

const fitView = () => {
  if (!viewportRef.value) {
    return
  }

  const bounds = getCanvasBounds()

  if (!bounds) {
    return
  }

  const padding = {
    top: 48,
    right: 240,
    bottom: 72,
    left: 48
  }
  const availableWidth = Math.max(240, viewportRef.value.clientWidth - padding.left - padding.right)
  const availableHeight = Math.max(240, viewportRef.value.clientHeight - padding.top - padding.bottom)
  const nextScale = Math.min(1, Math.max(0.45, Number(Math.min(availableWidth / bounds.width, availableHeight / bounds.height).toFixed(2))))

  scale.value = nextScale
  pan.value = {
    x: Math.round(padding.left + (availableWidth - bounds.width * nextScale) / 2 - bounds.minX * nextScale),
    y: Math.round(padding.top + (availableHeight - bounds.height * nextScale) / 2 - bounds.minY * nextScale)
  }
}

const resetView = () => {
  fitView()
}

const getNodeLayoutProperties = () => {
  return Object.values(nodeStates.value).reduce<Record<string, PgmlNodeProperties>>((properties, node) => {
    const persistedHeight = node.kind === 'object' && node.collapsed
      ? node.expandedHeight || node.height
      : node.height
    const nextProperties: PgmlNodeProperties = {
      x: Math.round(node.x),
      y: Math.round(node.y),
      tableColumns: node.kind === 'group' ? Math.max(1, Math.round(node.columnCount || 1)) : null
    }

    if (node.kind === 'object') {
      nextProperties.width = Math.round(node.width)
      nextProperties.height = Math.round(persistedHeight)
    }

    properties[node.id] = nextProperties

    return properties
  }, {})
}

const updateNode = (
  id: string,
  partial: Partial<CanvasNodeState>,
  options: {
    remeasure?: boolean
  } = {}
) => {
  const current = nodeStates.value[id]

  if (!current) {
    return
  }

  const remeasure = options.remeasure !== false

  const nextNode = {
    ...current,
    ...partial
  }

  if (current.kind === 'object') {
    if (nextNode.collapsed) {
      const headerElement = planeRef.value?.querySelector(`[data-node-header="${id}"]`)
      const nextCollapsedHeight = Math.ceil(Math.max(
        headerElement instanceof HTMLElement ? headerElement.offsetHeight : 0,
        collapsedObjectHeight
      ))

      nextNode.minHeight = nextCollapsedHeight
      nextNode.height = nextCollapsedHeight
    } else {
      nextNode.expandedHeight = typeof partial.height === 'number'
        ? nextNode.height
        : nextNode.expandedHeight || nextNode.height
    }
  }

  if (current.kind === 'group') {
    const minimumSize = getGroupMinimumSize(
      current.id.replace('group:', ''),
      nextNode.columnCount || 1
    )
    const resetGroupSize = typeof partial.columnCount === 'number'
    const nextGroupWidth = resetGroupSize
      ? minimumSize.minWidth
      : Math.max(nextNode.width, minimumSize.minWidth)
    const nextGroupHeight = resetGroupSize
      ? minimumSize.minHeight
      : Math.max(nextNode.height, minimumSize.minHeight)

    nextNode.minWidth = minimumSize.minWidth
    nextNode.minHeight = minimumSize.minHeight
    nextNode.width = nextGroupWidth
    nextNode.height = nextGroupHeight
    nextNode.expandedHeight = nextGroupHeight
  }

  nodeStates.value[id] = nextNode

  nextTick(() => {
    if (remeasure) {
      syncMeasuredNodeSizes()
    }

    updateConnections()
  })
}

const toggleNodeCollapsed = (id: string) => {
  const node = nodeStates.value[id]

  if (!node || node.kind !== 'object') {
    return
  }

  if (node.collapsed) {
    updateNode(id, {
      collapsed: false,
      height: Math.max(node.expandedHeight || node.height, collapsedObjectHeight)
    })
    return
  }

  const headerElement = planeRef.value?.querySelector(`[data-node-header="${id}"]`)
  const nextCollapsedHeight = Math.ceil(Math.max(
    headerElement instanceof HTMLElement ? headerElement.offsetHeight : 0,
    collapsedObjectHeight
  ))

  updateNode(id, {
    collapsed: true,
    expandedHeight: node.height,
    height: nextCollapsedHeight
  })
}

const startPan = (event: PointerEvent) => {
  if (event.target instanceof HTMLElement && event.target.closest('[data-node-anchor]')) {
    return
  }

  const origin = {
    x: event.clientX,
    y: event.clientY,
    panX: pan.value.x,
    panY: pan.value.y
  }

  const onMove = (moveEvent: PointerEvent) => {
    pan.value = {
      x: origin.panX + moveEvent.clientX - origin.x,
      y: origin.panY + moveEvent.clientY - origin.y
    }
  }

  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const startDragNode = (event: PointerEvent, id: string) => {
  event.stopPropagation()
  selectedNodeId.value = id
  const node = nodeStates.value[id]

  if (!node) {
    return
  }

  const origin = {
    x: event.clientX,
    y: event.clientY,
    nodeX: node.x,
    nodeY: node.y
  }

  const onMove = (moveEvent: PointerEvent) => {
    updateNode(id, {
      x: origin.nodeX + (moveEvent.clientX - origin.x) / scale.value,
      y: origin.nodeY + (moveEvent.clientY - origin.y) / scale.value
    }, {
      remeasure: false
    })
  }

  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const startResizeNode = (event: PointerEvent, id: string) => {
  event.stopPropagation()
  selectedNodeId.value = id
  const node = nodeStates.value[id]

  if (!node || node.kind !== 'object') {
    return
  }

  const origin = {
    x: event.clientX,
    y: event.clientY,
    width: node.width,
    height: node.height,
    minWidth: node.minWidth || 200,
    minHeight: node.minHeight || 96
  }

  const onMove = (moveEvent: PointerEvent) => {
    updateNode(id, {
      width: Math.max(origin.minWidth, origin.width + (moveEvent.clientX - origin.x) / scale.value),
      height: Math.max(origin.minHeight, origin.height + (moveEvent.clientY - origin.y) / scale.value)
    })
  }

  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const handleNodeClick = (node: CanvasNodeState) => {
  selectedNodeId.value = node.id

  if (node.kind !== 'object' || !node.sourceRange) {
    return
  }

  emit('focusSource', node.sourceRange)
}

const handleTableClick = (tableId: string) => {
  const table = model.tables.find(candidate => candidate.fullName === tableId)

  if (!table?.sourceRange) {
    return
  }

  emit('focusSource', table.sourceRange)
}

const handleWheel = (event: WheelEvent) => {
  event.preventDefault()
  zoomBy(event.deltaY > 0 ? -1 : 1)
}

watch(
  () => model,
  async () => {
    syncNodeStates()
    await nextTick()
    observeCanvasLayout()
    if (syncMeasuredNodeSizes()) {
      await nextTick()
      observeCanvasLayout()
    }
    if (!hasEmbeddedLayout.value) {
      reflowAutoLayout()
    }
    await nextTick()
    observeCanvasLayout()
    if (syncMeasuredNodeSizes()) {
      await nextTick()
      observeCanvasLayout()
      if (!hasEmbeddedLayout.value) {
        reflowAutoLayout()
      }
      await nextTick()
      observeCanvasLayout()
    }
    fitView()
    await nextTick()
    observeCanvasLayout()
    updateConnections()
  },
  { deep: true, immediate: true }
)

watch([scale, pan], async () => {
  await nextTick()
  updateConnections()
})

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (syncMeasuredNodeSizes()) {
      if (!hasEmbeddedLayout.value) {
        reflowAutoLayout()
      }
    }
    updateConnections()
  })

  observeCanvasLayout()

  nextTick(() => {
    observeCanvasLayout()
    if (syncMeasuredNodeSizes()) {
      reflowAutoLayout()
      updateConnections()
    }
    updateConnections()
    requestAnimationFrame(() => {
      observeCanvasLayout()
      if (syncMeasuredNodeSizes()) {
        reflowAutoLayout()
        updateConnections()
      }
      updateConnections()
    })
    window.setTimeout(() => {
      observeCanvasLayout()
      if (syncMeasuredNodeSizes()) {
        reflowAutoLayout()
        updateConnections()
      }
      updateConnections()
    }, 120)
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

defineExpose<{
  exportDiagram: (format: DiagramExportFormat, scaleFactor?: number) => Promise<void>
  exportPng: (scaleFactor: number) => Promise<void>
  exportSvg: () => Promise<void>
  getNodeLayoutProperties: () => Record<string, PgmlNodeProperties>
}>({
  exportDiagram: async (format, scaleFactor = 1) => {
    if (format === 'svg') {
      await exportSvg()
      return
    }

    await exportPng(scaleFactor)
  },
  exportPng,
  exportSvg,
  getNodeLayoutProperties
})
</script>

<template>
  <div
    ref="viewportRef"
    class="relative h-full min-h-0 select-none overflow-hidden border"
    :style="canvasViewportStyle"
    @pointerdown="startPan"
    @wheel="handleWheel"
  >
    <div
      ref="planeRef"
      class="relative h-[1800px] w-[2600px] origin-top-left"
      :style="{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
      }"
    >
      <svg
        class="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 2600 1800"
        preserveAspectRatio="none"
      >
        <path
          v-for="line in connectionLines"
          :key="line.key"
          :d="line.path"
          fill="none"
          :stroke="line.color"
          stroke-width="2"
          :stroke-dasharray="line.dashed ? '10 7' : '0'"
          stroke-linecap="square"
          stroke-linejoin="miter"
          opacity="0.9"
        />
      </svg>

      <div
        v-for="node in canvasNodes"
        :key="node.id"
        :class="[
          'absolute overflow-hidden border select-none',
          node.kind === 'group' ? 'rounded-[2px]' : 'rounded-none',
          node.kind === 'object' ? 'transition-transform duration-150 hover:-translate-y-0.5 hover:ring-1 hover:ring-[color:var(--studio-ring)]' : '',
          selectedNodeId === node.id ? 'ring-1 ring-[color:var(--studio-ring)]' : ''
        ]"
        :style="{
          left: `${node.x}px`,
          top: `${node.y}px`,
          width: `${node.width}px`,
          height: `${node.height}px`,
          borderColor: getNodeBorderColor(node),
          background: getNodeBackground(node)
        }"
        :data-node-anchor="node.id"
        @pointerdown.stop="selectedNodeId = node.id"
        @click.stop="handleNodeClick(node)"
      >
        <div
          :data-node-header="node.id"
          :class="[
            'flex cursor-move items-start justify-between gap-2 px-2.5 py-2',
            node.kind === 'group' || !node.collapsed ? 'border-b border-[color:var(--studio-divider)]' : ''
          ]"
          @pointerdown="startDragNode($event, node.id)"
        >
          <div class="min-w-0">
            <span
              :data-node-accent="node.id"
              class="mb-1 inline-flex font-mono text-[0.62rem] uppercase tracking-[0.08em]"
              :style="{ color: getNodeAccentColor(node) }"
            >
              {{ node.kind === 'group' ? 'Table Group' : node.objectKind }}
            </span>
            <h3 class="truncate text-[0.88rem] font-semibold leading-5 tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
              {{ node.title }}
            </h3>
            <p
              v-if="node.subtitle"
              class="truncate text-[0.68rem] text-[color:var(--studio-shell-muted)]"
            >
              {{ node.subtitle }}
            </p>
          </div>

          <div class="flex shrink-0 items-start gap-1">
            <span class="inline-flex h-5 items-center border border-[color:var(--studio-rail)] px-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[color:var(--studio-shell-muted)]">
              {{ node.kind === 'group' ? `${node.tableCount || node.tableIds.length} tables` : `${node.tableIds.length} impact` }}
            </span>
            <UButton
              v-if="isCollapsibleNode(node)"
              :icon="node.collapsed ? 'i-lucide-plus' : 'i-lucide-minus'"
              color="neutral"
              variant="ghost"
              size="xs"
              class="h-5 w-5 rounded-none border border-[color:var(--studio-rail)] px-0 text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
              :aria-label="node.collapsed ? `Expand ${node.title}` : `Collapse ${node.title}`"
              :title="node.collapsed ? `Expand ${node.title}` : `Collapse ${node.title}`"
              @pointerdown.stop
              @click.stop="toggleNodeCollapsed(node.id)"
            />
          </div>
        </div>

        <div
          v-if="node.kind === 'group'"
          class="px-5 pb-2.5 pt-2"
        >
          <div
            :data-group-content="node.id"
            class="grid items-start justify-start overflow-visible"
            :style="{
              gridTemplateColumns: `repeat(${node.columnCount || 1}, ${groupTableWidth}px)`,
              gap: `${groupTableGap}px`
            }"
          >
            <article
              v-for="table in model.tables.filter((table) => node.tableIds.includes(table.fullName))"
              :key="table.fullName"
              class="min-w-0 self-start overflow-hidden rounded-[2px] border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-table-surface)] transition-transform duration-150 hover:-translate-y-0.5 hover:ring-1 hover:ring-[color:var(--studio-ring)]"
              :style="{ width: `${groupTableWidth}px` }"
              :data-table-anchor="table.fullName"
              @click.stop="handleTableClick(table.fullName)"
            >
              <div class="flex items-start justify-between gap-2 border-b border-[color:var(--studio-divider)] px-2 py-1.5">
                <div class="min-w-0">
                  <h4 class="truncate text-[0.78rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]">
                    {{ table.name }}
                  </h4>
                  <p class="text-[0.62rem] uppercase tracking-[0.06em] text-[color:var(--studio-shell-muted)]">
                    {{ table.schema }} schema
                  </p>
                </div>

                <span class="inline-flex h-5 items-center border border-[color:var(--studio-rail)] px-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[color:var(--studio-shell-muted)]">
                  {{ table.columns.length }} cols
                </span>
              </div>

              <div class="grid gap-px bg-[color:var(--studio-divider)]">
                <template
                  v-for="row in getTableRows(table.fullName)"
                  :key="row.key"
                >
                  <div
                    v-if="row.kind === 'column'"
                    :data-table-row-anchor="row.key"
                    data-table-row-kind="column"
                    :data-column-anchor="getColumnAnchorKey(table.fullName, row.column.name)"
                    class="flex min-w-0 items-start justify-between gap-2 bg-[color:var(--studio-row-surface)] px-2 py-1.5"
                  >
                    <div
                      :data-column-label-anchor="getColumnLabelAnchorKey(table.fullName, row.column.name)"
                      class="min-w-0"
                    >
                      <strong
                        data-table-row-title
                        class="block truncate font-mono text-[0.68rem] font-medium text-[color:var(--studio-shell-text)]"
                      >
                        {{ row.column.name }}
                      </strong>
                      <span
                        data-table-row-subtitle
                        class="mt-0.5 block truncate text-[0.64rem] text-[color:var(--studio-shell-muted)]"
                      >
                        {{ row.column.type }}
                      </span>
                    </div>
                    <div class="grid max-w-[8.5rem] shrink-0 justify-items-end gap-0.5 text-right">
                      <span
                        v-for="modifier in row.column.modifiers.slice(0, 2)"
                        :key="modifier"
                        data-table-row-badge
                        class="inline-flex min-h-[1rem] max-w-full items-center justify-end border border-[color:var(--studio-rail)] px-1 py-0.5 font-mono text-[0.52rem] uppercase leading-[1.15] tracking-[0.04em] whitespace-normal break-all text-[color:var(--studio-shell-muted)]"
                      >
                        {{ modifier }}
                      </span>
                    </div>
                  </div>

                  <UPopover
                    v-else
                    mode="click"
                    :content="attachmentPopoverContent"
                    :ui="attachmentPopoverUi"
                  >
                    <button
                      type="button"
                      :data-table-row-anchor="row.key"
                      data-table-row-kind="attachment"
                      :data-attachment-row="row.attachment.id"
                      class="flex min-w-0 w-full items-start justify-between gap-2 px-2 py-1.5 text-left transition-[filter,transform] duration-150 hover:brightness-105"
                      :style="getAttachmentRowStyle(row.attachment)"
                      :aria-label="`${row.attachment.kind} ${row.attachment.title}`"
                      @pointerdown.stop
                      @click.stop
                    >
                      <div class="flex min-w-0 items-start gap-2">
                        <span
                          data-table-row-badge
                          class="mt-0.5 inline-flex h-4 shrink-0 items-center border px-1 font-mono text-[0.48rem] uppercase tracking-[0.06em]"
                          :style="getAttachmentKindBadgeStyle(row.attachment)"
                        >
                          {{ row.attachment.kind }}
                        </span>
                        <div class="min-w-0">
                          <strong
                            data-table-row-title
                            class="block truncate font-mono text-[0.66rem] font-medium text-[color:var(--studio-shell-text)]"
                          >
                            {{ row.attachment.title }}
                          </strong>
                          <span
                            v-if="row.attachment.subtitle"
                            data-table-row-subtitle
                            class="mt-0.5 block truncate text-[0.62rem] text-[color:var(--studio-shell-muted)]"
                          >
                            {{ row.attachment.subtitle }}
                          </span>
                        </div>
                      </div>

                      <div class="flex max-w-[8.5rem] shrink-0 flex-wrap justify-end gap-0.5 text-right">
                        <span
                          v-for="flag in row.attachment.flags"
                          :key="flag.key"
                          data-table-row-badge
                          class="inline-flex min-h-[1rem] max-w-full items-center justify-end border px-1 py-0.5 font-mono text-[0.5rem] uppercase leading-[1.15] tracking-[0.04em] whitespace-normal break-all"
                          :style="getAttachmentFlagStyle(flag)"
                        >
                          {{ flag.label }}
                        </span>
                      </div>
                    </button>

                    <template #content>
                      <div
                        :data-attachment-popover="row.attachment.id"
                        class="grid gap-3"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <span
                              class="mb-1 inline-flex items-center border px-1.5 font-mono text-[0.56rem] uppercase tracking-[0.08em]"
                              :style="getAttachmentKindBadgeStyle(row.attachment)"
                            >
                              {{ row.attachment.kind }}
                            </span>
                            <h5 class="truncate text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
                              {{ row.attachment.title }}
                            </h5>
                            <p
                              v-if="row.attachment.subtitle"
                              class="mt-1 text-[0.68rem] leading-5 text-[color:var(--studio-shell-muted)]"
                            >
                              {{ row.attachment.subtitle }}
                            </p>
                          </div>

                          <div class="flex shrink-0 flex-wrap justify-end gap-1">
                            <span
                              v-for="flag in row.attachment.flags"
                              :key="flag.key"
                              class="inline-flex items-center border px-1.5 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.06em]"
                              :style="getAttachmentFlagStyle(flag)"
                            >
                              {{ flag.label }}
                            </span>
                          </div>
                        </div>

                        <div class="grid max-h-64 gap-1 overflow-auto border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] px-2 py-2">
                          <p
                            v-for="detail in row.attachment.details"
                            :key="detail"
                            class="break-words whitespace-pre-wrap font-mono text-[0.62rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]"
                          >
                            {{ detail }}
                          </p>
                        </div>
                      </div>
                    </template>
                  </UPopover>
                </template>
              </div>
            </article>
          </div>
        </div>

        <div
          v-else-if="!node.collapsed"
          :data-node-body="node.id"
          class="grid gap-1.5 px-2.5 pb-2.5 pt-2"
        >
          <p
            v-for="detail in node.details"
            :key="detail"
            class="break-words whitespace-pre-wrap font-mono text-[0.64rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]"
          >
            {{ detail }}
          </p>

          <div class="flex flex-wrap gap-1">
            <span
              v-for="tableId in node.tableIds"
              :key="tableId"
              :data-impact-anchor="getImpactAnchorKey(node.id, tableId)"
              class="inline-flex h-5 items-center border border-[color:var(--studio-rail)] px-1.5 font-mono text-[0.6rem] uppercase tracking-[0.05em] text-[color:var(--studio-shell-muted)]"
            >
              {{ tableId.split('.').at(-1) }}
            </span>
          </div>
        </div>

        <button
          v-if="node.kind !== 'group' && !node.collapsed"
          class="absolute bottom-1.5 right-1.5 h-4 w-4 cursor-nwse-resize border-none bg-transparent"
          :style="{
            borderRight: `2px solid ${getNodeAccentColor(node)}`,
            borderBottom: `2px solid ${getNodeAccentColor(node)}`
          }"
          aria-label="Resize node"
          @pointerdown="startResizeNode($event, node.id)"
          @click.stop
        />
      </div>
    </div>

    <div class="pointer-events-none absolute inset-x-0 bottom-3 z-[2] flex justify-center">
      <div
        class="pointer-events-auto flex items-center gap-1 border px-1 py-1"
        :style="floatingPanelStyle"
      >
        <UButton
          icon="i-lucide-zoom-out"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          @click="zoomBy(-1)"
        />
        <div class="min-w-[52px] text-center font-mono text-[0.7rem] text-[color:var(--studio-shell-text)]">
          {{ Math.round(scale * 100) }}%
        </div>
        <UButton
          icon="i-lucide-zoom-in"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          @click="zoomBy(1)"
        />
        <UButton
          label="Reset"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          @click="resetView"
        />
      </div>
    </div>

    <aside
      class="absolute right-3 top-3 z-[2] grid max-h-[calc(100%-24px)] w-[182px] gap-1.5 overflow-auto border p-2"
      :style="floatingPanelStyle"
    >
      <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Inspector
      </div>
      <h3 class="text-[0.82rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]">
        {{ selectedNode?.title || 'Select a shape' }}
      </h3>
      <p class="text-[0.64rem] leading-4 text-[color:var(--studio-shell-muted)]">
        {{ selectedNode ? 'Adjust the selected node.' : 'Select a node.' }}
      </p>

      <div
        v-if="selectedNode"
        class="grid gap-1.5"
      >
        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Label</span>
          <input
            :value="selectedNode.title"
            type="text"
            class="w-full select-text border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] px-2 py-1.5 text-[0.68rem] text-[color:var(--studio-shell-text)] outline-none"
            @input="updateNode(selectedNode.id, { title: ($event.target as HTMLInputElement).value })"
          >
        </label>

        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Color</span>
          <input
            :value="selectedNode.color"
            type="color"
            class="h-8 w-full border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] p-0.5"
            @input="updateNode(selectedNode.id, { color: ($event.target as HTMLInputElement).value })"
          >
        </label>

        <label
          v-if="selectedNode.kind !== 'group' && !selectedNode.collapsed"
          class="grid gap-1"
        >
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Width</span>
          <input
            :value="selectedNode.width"
            type="range"
            :min="selectedNode.minWidth || 200"
            max="640"
            class="w-full"
            @input="updateNode(selectedNode.id, { width: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>

        <label
          v-if="selectedNode.kind !== 'group' && !selectedNode.collapsed"
          class="grid gap-1"
        >
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Height</span>
          <input
            :value="selectedNode.height"
            type="range"
            :min="selectedNode.minHeight || 96"
            max="920"
            class="w-full"
            @input="updateNode(selectedNode.id, { height: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>

        <label
          v-if="selectedNode.kind === 'group'"
          class="grid gap-1"
        >
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table Columns · {{ selectedNode.columnCount || 1 }}</span>
          <input
            :value="selectedNode.columnCount || 1"
            data-group-column-count-slider="true"
            type="range"
            min="1"
            :max="Math.min(4, selectedNode.tableCount || 4)"
            class="w-full"
            @input="updateNode(selectedNode.id, { columnCount: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>
      </div>

      <div
        v-else
        class="text-[0.64rem] leading-4 text-[color:var(--studio-shell-muted)]"
      >
        Drag the canvas or select any schema object.
      </div>
    </aside>
  </div>
</template>
