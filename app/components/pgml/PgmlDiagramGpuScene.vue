<script setup lang="ts">
import { useEventListener, useResizeObserver } from '@vueuse/core'
import type { Ref } from 'vue'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch
} from 'vue'
import {
  buildDiagramSpatialGridIndex,
  doesDiagramSpatialEntryIntersectBounds,
  queryDiagramSpatialGridIndex,
  type DiagramSpatialGridIndex
} from '~/utils/diagram-spatial-index'
import type { DiagramNodeDragPreview } from '~/utils/diagram-connection-preview'
import {
  applyDiagramRendererInitFailure,
  getDiagramRendererCapability,
  type DiagramRendererBackend,
  type DiagramRendererCapability
} from '~/utils/diagram-renderer'
import {
  getDiagramPinchViewportTransform,
  getDiagramTouchGesture,
  type DiagramTouchGesture,
  type DiagramTouchPoint
} from '~/utils/diagram-touch'
import { getDiagramViewportFitTransform } from '~/utils/diagram-viewport'
import {
  diagramBackgroundColor,
  diagramDividerColor,
  diagramDotColor,
  diagramGridDotSpacing,
  diagramGroupHeaderBandHeight,
  diagramLabelTextColor,
  diagramLineViewportOverscan,
  diagramMaxScale,
  diagramMinScale,
  diagramMutedTextColor,
  diagramNodeViewportOverscan,
  diagramObjectHeaderHeight,
  diagramPanelSurfaceColor,
  diagramRailColor,
  diagramRowSurfaceColor,
  diagramSpatialGridCellSize,
  diagramSurfaceColor,
  diagramTableSurfaceColor,
  diagramTableRowHeight,
  diagramTextColor,
  diagramZoomStep,
  getDiagramSchemaBadgeColor,
  type DiagramGpuConnectionLine,
  type DiagramGpuGroupNode,
  type DiagramGpuObjectNode,
  type DiagramGpuSelection,
  type DiagramGpuTableCard,
  type DiagramGpuWorldBounds
} from '~/utils/diagram-gpu-scene'
import { createAnimationFrameBatcher } from '~/utils/animation-frame'
import type { PgmlSourceRange } from '~/utils/pgml'

type PixiModule = typeof import('pixi.js')
type PixiApplication = import('pixi.js').Application
type PixiContainer = import('pixi.js').Container
type PixiGraphics = import('pixi.js').Graphics
type PixiSprite = import('pixi.js').Sprite
type PixiTexture = import('pixi.js').Texture
type PixiWebGLRenderer = import('pixi.js').WebGLRenderer
type PixiWebGPURenderer = import('pixi.js').WebGPURenderer
type SceneRendererPreference = 'webgl' | 'webgpu'

type TextureCacheEntry = {
  key: string
  sprite: PixiSprite
  texture: PixiTexture
}

type VisibleConnectionBuckets = {
  dynamicLines: DiagramGpuConnectionLine[]
  staticLines: DiagramGpuConnectionLine[]
}

type NodePointerSession = {
  pointerId: number
  nodeId: string
  nodeKind: 'group' | 'object' | 'table'
  originClientX: number
  originClientY: number
  originX: number
  originY: number
  pressedTarget: HitTarget
  selectOnPress: boolean
}
type Interaction = { kind: 'idle' }
  | { kind: 'pan', pointerId: number, originClientX: number, originClientY: number, originPanX: number, originPanY: number }
  | (NodePointerSession & { kind: 'node-pressed' })
  | (NodePointerSession & { kind: 'node-dragging', position: DiagramTouchPoint })
  | { kind: 'toggle-pressed', pointerId: number, objectId: string, pressedTarget: HitTarget }
  | { kind: 'pinching', input: 'pointer' | 'touch', origin: TouchPinchSession }
  | { kind: 'pinch-ending', input: 'pointer' | 'touch' }

type TouchPinchSession = {
  initialCenter: DiagramTouchPoint
  initialDistance: number
  initialPan: DiagramTouchPoint
  initialScale: number
}

type ViewTransform = {
  panX: number
  panY: number
  scale: number
}

type FocusBounds = {
  height: number
  width: number
  x: number
  y: number
}

type HitTarget = {
  attachmentId?: string
  columnName?: string
  groupId?: string
  kind: 'group-header' | 'object-body' | 'object-header' | 'object-toggle' | 'table-header' | 'table-row'
  objectId?: string
  sourceRange?: PgmlSourceRange
  tableId?: string
}

const {
  connections,
  documentContextRevision = 0,
  loadIntentRevision = 0,
  interactionEnabled = true,
  groups,
  objects,
  rendererBackend = 'auto',
  selection = null,
  showRelationshipLines = true,
  tables,
  viewportInsetRight = 0,
  viewportResetKey = 0,
  worldBounds
} = defineProps<{
  documentContextRevision?: number
  loadIntentRevision?: number
  interactionEnabled?: boolean
  connections: DiagramGpuConnectionLine[]
  groups: DiagramGpuGroupNode[]
  objects: DiagramGpuObjectNode[]
  rendererBackend?: DiagramRendererBackend
  selection?: DiagramGpuSelection | null
  showRelationshipLines?: boolean
  tables: DiagramGpuTableCard[]
  viewportInsetRight?: number
  viewportResetKey?: number
  worldBounds: DiagramGpuWorldBounds
}>()

const emit = defineEmits<{
  dragPreviewChange: [payload: { id: string, kind: 'group' | 'object' | 'table', x: number, y: number } | null]
  focusSource: [sourceRange: PgmlSourceRange]
  moveEnd: [payload: { id: string, kind: 'group' | 'object' | 'table', x: number, y: number }]
  rendererCapabilityChange: [capability: DiagramRendererCapability]
  scaleChange: [scale: number]
  select: [selection: DiagramGpuSelection | null]
  transformChange: [transform: ViewTransform]
  toggleObjectCollapsed: [id: string]
}>()

const hostRef: Ref<HTMLDivElement | null> = ref(null)
const overlayRef: Ref<HTMLDivElement | null> = ref(null)

type SceneResources = {
  pixi: PixiModule
  app: PixiApplication
  stageContainer: PixiContainer
  backgroundGraphics: PixiGraphics
  worldContainer: PixiContainer
  groupContainer: PixiContainer
  staticLineGraphics: PixiGraphics
  dynamicLineGraphics: PixiGraphics
  groupHeaderContainer: PixiContainer
  tableContainer: PixiContainer
  objectContainer: PixiContainer
}
type SceneLifetime = { kind: 'idle' } | { kind: 'disposed' }
  | { kind: 'initializing', generation: number, resumeTransform: ViewTransform | null }
  | { kind: 'ready', generation: number, resources: SceneResources }
  | { kind: 'failed', generation: number, resumeTransform: ViewTransform | null, error: unknown }
const lifetime: Ref<SceneLifetime> = shallowRef({ kind: 'idle' })
const sceneResources = computed(() => lifetime.value.kind === 'ready' ? lifetime.value.resources : null)
let rendererGeneration = 0
const fullRenderBatcher = createAnimationFrameBatcher()
const transformRenderBatcher = createAnimationFrameBatcher()
const dragPreviewRenderBatcher = createAnimationFrameBatcher()

const tableSpriteEntries = new Map<string, TextureCacheEntry>()
const groupSpriteEntries = new Map<string, TextureCacheEntry>()
// eslint-disable-next-line prefer-const
let groupHeaderSpriteEntries = new Map<string, TextureCacheEntry>()
const objectSpriteEntries = new Map<string, TextureCacheEntry>()

let tableSpatialIndex: DiagramSpatialGridIndex<string> | null = null
let groupSpatialIndex: DiagramSpatialGridIndex<string> | null = null
let objectSpatialIndex: DiagramSpatialGridIndex<string> | null = null
let connectionSpatialIndex: DiagramSpatialGridIndex<string> | null = null

const viewportWidth: Ref<number> = ref(0)
const viewportHeight: Ref<number> = ref(0)
let worldPanX = 0
let worldPanY = 0
let worldScale = 1
let interaction: Interaction = { kind: 'idle' }
const activeTouchPointers = new Map<number, DiagramTouchPoint>()
let lastClick: { key: string, timestamp: number } | null = null
let activeVisibleTableIds = new Set<string>()
let activeVisibleGroupIds = new Set<string>()
let activeVisibleObjectIds = new Set<string>()
let activeVisibleConnectionIds = new Set<string>()
let renderedDebugGroupCards: Array<{ height: number, id: string, width: number, x: number, y: number }> = []
let renderedDebugObjectCards: Array<{ height: number, id: string, width: number, x: number, y: number }> = []
let renderedDebugTableCards: Array<{ height: number, id: string, width: number, x: number, y: number }> = []
let activeDynamicConnectionPreviewNodeId: string | null = null
let connectionBucketCacheVersion = 0
let cachedConnectionBucketVersion = -1
let cachedConnectionBucketPreviewNodeId: string | null = null
let cachedVisibleConnectionBuckets: VisibleConnectionBuckets = {
  dynamicLines: [],
  staticLines: []
}
let renderedStaticConnections: Array<Pick<DiagramGpuConnectionLine, 'key' | 'points'>> = []
let renderedDynamicConnections: Array<Pick<DiagramGpuConnectionLine, 'key' | 'points'>> = []
let liveDragPreview: DiagramNodeDragPreview | null = null
let renderedDragPreview: DiagramNodeDragPreview | null = null
let deferredFullRenderTimeout: ReturnType<typeof setTimeout> | null = null
let lineAnimationFrame: number | null = null
let lineAnimationOffset = 0
let hasViewportInteraction = false
let themeObserver: MutationObserver | null = null
let activeRendererPreference: SceneRendererPreference = 'webgl'
let shouldDisableConnectionCulling = false
const diagramFallbackMaxTextureDimension = 4096
const diagramTextureDimensionPadding = 64
const diagramTextureAreaSafetyRatio = 0.82
const diagramMinimumTextureResolution = 0.125
const diagramTextureResolutionStep = 0.125
let maxSpriteTextureDimension = diagramFallbackMaxTextureDimension
const rendererCapability: Ref<DiagramRendererCapability> = ref({
  fallbackReason: null,
  isSecureContext: false,
  requested: rendererBackend,
  resolved: 'webgl',
  supportsWebGPU: false
})

const fontMonoFamily = '"IBM Plex Mono", "IBM Plex Mono Fallback: Courier New", "IBM Plex Mono Fallback: Roboto Mono", "IBM Plex Mono Fallback: Noto Sans Mono", monospace'
const fontMono = `600 9px ${fontMonoFamily}`
const fontMonoSmall = `600 8px ${fontMonoFamily}`
const fontMonoSmallRegular = `400 8px ${fontMonoFamily}`
const fontSansTitle = '600 14px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
const fontSansMuted = '400 8px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value))
}

const approximatelyEqual = (left: number, right: number, tolerance: number) => {
  return Math.abs(left - right) <= tolerance
}

type SceneColor = {
  a: number
  b: number
  g: number
  r: number
}

type SceneTheme = {
  background: string
  control: string
  divider: string
  dot: string
  groupSurface: string
  groupSurfaceSoft: string
  label: string
  muted: string
  nodeAccentMix: string
  nodeBorderNeutral: string
  rail: string
  rowSurface: string
  shellText: string
  surface: string
  tableSurface: string
}

let sceneTheme: SceneTheme = {
  background: diagramBackgroundColor,
  control: diagramPanelSurfaceColor,
  divider: diagramDividerColor,
  dot: diagramDotColor,
  groupSurface: 'rgba(255, 255, 255, 0.018)',
  groupSurfaceSoft: 'rgba(255, 255, 255, 0.03)',
  label: diagramLabelTextColor,
  muted: diagramMutedTextColor,
  nodeAccentMix: '#ffffff',
  nodeBorderNeutral: 'rgba(255, 255, 255, 0.2)',
  rail: diagramRailColor,
  rowSurface: diagramRowSurfaceColor,
  shellText: diagramTextColor,
  surface: diagramSurfaceColor,
  tableSurface: diagramTableSurfaceColor
}
const getSceneThemeSignature = (value: SceneTheme) => {
  return [
    value.background,
    value.control,
    value.divider,
    value.dot,
    value.groupSurface,
    value.groupSurfaceSoft,
    value.label,
    value.muted,
    value.nodeAccentMix,
    value.nodeBorderNeutral,
    value.rail,
    value.rowSurface,
    value.shellText,
    value.surface,
    value.tableSurface
  ].join('|')
}
let sceneThemeSignature = getSceneThemeSignature(sceneTheme)

const parseColor = (value: string, fallback = '#38bdf8') => {
  const trimmedValue = value.trim()

  if (/^#[\da-fA-F]{6}$/.test(trimmedValue)) {
    return {
      a: 1,
      b: Number.parseInt(trimmedValue.slice(5, 7), 16),
      g: Number.parseInt(trimmedValue.slice(3, 5), 16),
      r: Number.parseInt(trimmedValue.slice(1, 3), 16)
    } satisfies SceneColor
  }

  const rgbaMatch = trimmedValue.match(/^rgba?\(([^)]+)\)$/i)

  if (rgbaMatch) {
    const parts = (rgbaMatch[1] || '')
      .split(',')
      .map(part => Number.parseFloat(part.trim()))

    return {
      a: Number.isFinite(parts[3]) ? clamp(parts[3] || 0, 0, 1) : 1,
      b: clamp(parts[2] || 0, 0, 255),
      g: clamp(parts[1] || 0, 0, 255),
      r: clamp(parts[0] || 0, 0, 255)
    } satisfies SceneColor
  }

  if (import.meta.client) {
    const probe = document.createElement('div')
    probe.style.color = trimmedValue
    document.body.appendChild(probe)
    const resolvedValue = getComputedStyle(probe).color
    probe.remove()

    if (resolvedValue && resolvedValue !== trimmedValue) {
      return parseColor(resolvedValue, fallback)
    }
  }

  return parseColor(fallback, '#38bdf8')
}

const colorToString = (value: SceneColor) => {
  return `rgba(${Math.round(value.r)}, ${Math.round(value.g)}, ${Math.round(value.b)}, ${value.a})`
}

const colorToHex = (value: SceneColor) => {
  return [value.r, value.g, value.b]
    .map(channel => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')
}

const hexToNumber = (value: string, fallback: number) => {
  const normalizedValue = colorToHex(parseColor(value, `#${fallback.toString(16).padStart(6, '0')}`))

  if (!/^[\da-fA-F]{6}$/.test(normalizedValue)) {
    return fallback
  }

  return Number.parseInt(normalizedValue, 16)
}

const mixColors = (left: string, right: string, leftWeight: number) => {
  const safeLeftWeight = clamp(leftWeight, 0, 1)
  const rightWeight = 1 - safeLeftWeight
  const leftColor = parseColor(left)
  const rightColor = parseColor(right)

  return colorToString({
    a: leftColor.a * safeLeftWeight + rightColor.a * rightWeight,
    b: leftColor.b * safeLeftWeight + rightColor.b * rightWeight,
    g: leftColor.g * safeLeftWeight + rightColor.g * rightWeight,
    r: leftColor.r * safeLeftWeight + rightColor.r * rightWeight
  })
}

const compositeColors = (foreground: string, background: string) => {
  const foregroundColor = parseColor(foreground)
  const backgroundColor = parseColor(background)
  const alpha = foregroundColor.a + backgroundColor.a * (1 - foregroundColor.a)

  if (alpha <= 0) {
    return 'rgba(0, 0, 0, 0)'
  }

  return colorToString({
    a: alpha,
    b: (foregroundColor.b * foregroundColor.a + backgroundColor.b * backgroundColor.a * (1 - foregroundColor.a)) / alpha,
    g: (foregroundColor.g * foregroundColor.a + backgroundColor.g * backgroundColor.a * (1 - foregroundColor.a)) / alpha,
    r: (foregroundColor.r * foregroundColor.a + backgroundColor.r * backgroundColor.a * (1 - foregroundColor.a)) / alpha
  })
}

const withAlpha = (value: string, alpha: number) => {
  const nextColor = parseColor(value)

  return colorToString({
    ...nextColor,
    a: clamp(alpha, 0, 1)
  })
}

const getReadableTextColor = (background: string) => {
  const color = parseColor(background)
  const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000

  return brightness >= 156 ? '#0f172a' : '#f8fafc'
}

const readCssColorVariable = (name: string, fallback: string) => {
  if (!import.meta.client) {
    return fallback
  }

  const resolvedValue = getComputedStyle(document.documentElement).getPropertyValue(name).trim()

  return resolvedValue || fallback
}

const refreshSceneTheme = () => {
  const nextTheme = {
    background: readCssColorVariable('--studio-canvas-bg', diagramBackgroundColor),
    control: readCssColorVariable('--studio-control-bg', diagramPanelSurfaceColor),
    divider: readCssColorVariable('--studio-divider', diagramDividerColor),
    dot: readCssColorVariable('--studio-canvas-dot', diagramDotColor),
    groupSurface: readCssColorVariable('--studio-group-surface', 'rgba(255, 255, 255, 0.018)'),
    groupSurfaceSoft: readCssColorVariable('--studio-group-surface-soft', 'rgba(255, 255, 255, 0.03)'),
    label: readCssColorVariable('--studio-shell-label', diagramLabelTextColor),
    muted: readCssColorVariable('--studio-shell-muted', diagramMutedTextColor),
    nodeAccentMix: readCssColorVariable('--studio-node-accent-mix', '#ffffff'),
    nodeBorderNeutral: readCssColorVariable('--studio-node-border-neutral', 'rgba(255, 255, 255, 0.2)'),
    rail: readCssColorVariable('--studio-rail', diagramRailColor),
    rowSurface: readCssColorVariable('--studio-row-surface', diagramRowSurfaceColor),
    shellText: readCssColorVariable('--studio-shell-text', diagramTextColor),
    surface: readCssColorVariable('--studio-node-surface-bottom', diagramSurfaceColor),
    tableSurface: readCssColorVariable('--studio-table-surface', diagramTableSurfaceColor)
  } satisfies SceneTheme
  const nextThemeSignature = getSceneThemeSignature(nextTheme)
  const didChange = nextThemeSignature !== sceneThemeSignature

  sceneTheme = nextTheme
  sceneThemeSignature = nextThemeSignature

  return didChange
}

const quantizeTextureResolution = (value: number) => {
  const safeValue = Math.max(diagramMinimumTextureResolution, value)

  return Math.max(
    diagramMinimumTextureResolution,
    Math.floor(safeValue / diagramTextureResolutionStep) * diagramTextureResolutionStep
  )
}

const getRendererMaxTextureDimension = () => {
  const scene = sceneResources.value
  if (!scene) {
    return diagramFallbackMaxTextureDimension
  }

  const renderer = scene.app.renderer as PixiWebGLRenderer | PixiWebGPURenderer

  if ('gl' in renderer && renderer.gl) {
    const maxTextureSize = renderer.gl.getParameter(renderer.gl.MAX_TEXTURE_SIZE)

    if (typeof maxTextureSize === 'number' && Number.isFinite(maxTextureSize) && maxTextureSize > 0) {
      return maxTextureSize
    }
  }

  if ('gpu' in renderer) {
    const maxTextureSize = renderer.gpu?.device?.limits?.maxTextureDimension2D

    if (typeof maxTextureSize === 'number' && Number.isFinite(maxTextureSize) && maxTextureSize > 0) {
      return maxTextureSize
    }
  }

  return diagramFallbackMaxTextureDimension
}

const syncMaxSpriteTextureDimension = () => {
  maxSpriteTextureDimension = getRendererMaxTextureDimension()
}

const getTextureResolution = (width: number, height: number) => {
  if (!import.meta.client) {
    return 2
  }

  const deviceResolution = Math.max(window.devicePixelRatio || 1, 1)
  const scaleAdjustedResolution = deviceResolution * clamp(Math.max(worldScale, 1), 1, 1.8)
  const cappedDimension = Math.max(1024, maxSpriteTextureDimension - diagramTextureDimensionPadding)
  const resolutionCapFromDimension = cappedDimension / Math.max(width, height, 1)
  const safeTextureArea = cappedDimension * cappedDimension * diagramTextureAreaSafetyRatio
  const resolutionCapFromArea = Math.sqrt(safeTextureArea / Math.max(1, width * height))

  if (scaleAdjustedResolution <= 1.75) {
    return quantizeTextureResolution(Math.min(2, resolutionCapFromDimension, resolutionCapFromArea))
  }

  if (scaleAdjustedResolution <= 2.75) {
    return quantizeTextureResolution(Math.min(3, resolutionCapFromDimension, resolutionCapFromArea))
  }

  return quantizeTextureResolution(Math.min(4, resolutionCapFromDimension, resolutionCapFromArea))
}

const measureViewport = () => {
  if (!(hostRef.value instanceof HTMLDivElement)) {
    return
  }

  viewportWidth.value = Math.max(1, Math.round(hostRef.value.clientWidth))
  viewportHeight.value = Math.max(1, Math.round(hostRef.value.clientHeight))
}

const getWorldViewportBounds = (overscan: number) => {
  const safeScale = Math.max(worldScale, 0.001)

  return {
    maxX: (viewportWidth.value - worldPanX) / safeScale + overscan,
    maxY: (viewportHeight.value - worldPanY) / safeScale + overscan,
    minX: (-worldPanX) / safeScale - overscan,
    minY: (-worldPanY) / safeScale - overscan
  }
}

const worldPointFromClient = (clientX: number, clientY: number) => {
  const bounds = hostRef.value?.getBoundingClientRect()

  if (!bounds) {
    return {
      x: 0,
      y: 0
    }
  }

  return {
    x: (clientX - bounds.left - worldPanX) / Math.max(worldScale, 0.001),
    y: (clientY - bounds.top - worldPanY) / Math.max(worldScale, 0.001)
  }
}

const getDragWorldPosition = (session: NodePointerSession, clientX: number, clientY: number) => {
  return {
    x: Math.round(session.originX + ((clientX - session.originClientX) / Math.max(worldScale, 0.001))),
    y: Math.round(session.originY + ((clientY - session.originClientY) / Math.max(worldScale, 0.001)))
  }
}

const getDragTargetForHitTarget = (target: HitTarget | null) => {
  if (!target) {
    return null
  }

  if (target.kind === 'group-header' && target.groupId) {
    const group = groups.find(entry => entry.id === target.groupId)

    if (!group) {
      return null
    }

    return {
      groupId: group.id,
      id: group.id,
      kind: 'group' as const,
      originX: group.x,
      originY: group.y,
      selectOnPress: true
    }
  }

  if ((target.kind === 'table-header' || target.kind === 'table-row') && target.tableId) {
    const table = tables.find(entry => entry.id === target.tableId)

    if (!table) {
      return null
    }

    if (table.groupId) {
      const group = groups.find(entry => entry.id === table.groupId)

      if (!group) {
        return null
      }

      return {
        groupId: group.id,
        id: group.id,
        kind: 'group' as const,
        originX: group.x,
        originY: group.y,
        selectOnPress: false
      }
    }

    return {
      id: table.id,
      kind: 'table' as const,
      originX: table.x,
      originY: table.y,
      selectOnPress: target.kind === 'table-header'
    }
  }

  if ((target.kind === 'object-header' || target.kind === 'object-body') && target.objectId) {
    const objectNode = objects.find(entry => entry.id === target.objectId)

    if (!objectNode) {
      return null
    }

    return {
      id: objectNode.id,
      kind: 'object' as const,
      originX: objectNode.x,
      originY: objectNode.y,
      selectOnPress: true
    }
  }

  return null
}

const getTouchGesture = (touches: TouchList): DiagramTouchGesture | null => {
  const firstTouch = touches.item(0)
  const secondTouch = touches.item(1)

  if (!firstTouch || !secondTouch) {
    return null
  }

  return getDiagramTouchGesture(
    {
      x: firstTouch.clientX,
      y: firstTouch.clientY
    },
    {
      x: secondTouch.clientX,
      y: secondTouch.clientY
    }
  )
}

const startTouchPinchSession = (gesture: DiagramTouchGesture, input: 'pointer' | 'touch') => {
  if ((interaction.kind === 'pinching' || interaction.kind === 'pinch-ending') && interaction.input !== input) return
  emit('dragPreviewChange', null)
  setDragPreview(null)
  lastClick = null
  interaction = { kind: 'pinching', input, origin: {
    initialCenter: gesture.center, initialDistance: gesture.distance,
    initialPan: { x: worldPanX, y: worldPanY }, initialScale: worldScale
  } }
}

const resetTouchInteraction = () => {
  if (interaction.kind === 'pinching' || interaction.kind === 'pinch-ending') interaction = { kind: 'idle' }
  activeTouchPointers.clear()
}

const getPointerTouchGesture = () => {
  const [firstPoint, secondPoint] = Array.from(activeTouchPointers.values())
  return firstPoint && secondPoint ? getDiagramTouchGesture(firstPoint, secondPoint) : null
}

const applyPinchGestureTransform = (gesture: DiagramTouchGesture, input: 'pointer' | 'touch') => {
  if (interaction.kind !== 'pinching') startTouchPinchSession(gesture, input)
  if (interaction.kind !== 'pinching' || interaction.input !== input) return
  const origin = interaction.origin
  const transform = getDiagramPinchViewportTransform({
    currentCenter: gesture.center, currentDistance: gesture.distance,
    initialCenter: origin.initialCenter, initialDistance: origin.initialDistance,
    initialPan: origin.initialPan, initialScale: origin.initialScale,
    maxScale: diagramMaxScale, minScale: getMinViewportScale()
  })
  worldScale = transform.scale
  worldPanX = transform.pan.x
  worldPanY = transform.pan.y
  hasViewportInteraction = true
  scheduleTransformRender()
  scheduleDeferredFullRender(48)
}

const releasePointer = (pointerId: number) => {
  if (overlayRef.value?.hasPointerCapture(pointerId)) overlayRef.value.releasePointerCapture(pointerId)
}

const cancelInteraction = () => {
  const pointers = Array.from(activeTouchPointers.keys())
  if ('pointerId' in interaction) pointers.push(interaction.pointerId)
  interaction = { kind: 'idle' }
  activeTouchPointers.clear()
  lastClick = null
  pointers.forEach(releasePointer)
  emit('dragPreviewChange', null)
  setDragPreview(null)
}

const handlePointerCancel = (event: PointerEvent) => {
  if (activeTouchPointers.has(event.pointerId) || ('pointerId' in interaction && interaction.pointerId === event.pointerId)) cancelInteraction()
}

const updateWorldTransform = () => {
  const scene = sceneResources.value
  if (!scene) {
    return
  }

  scene.worldContainer.position.set(worldPanX, worldPanY)
  scene.worldContainer.scale.set(worldScale)
  emit('scaleChange', worldScale)
  emit('transformChange', {
    panX: worldPanX,
    panY: worldPanY,
    scale: worldScale
  })
}

const roundRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2))

  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

const topRoundRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height))

  context.beginPath()
  context.moveTo(x, y + height)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height)
  context.closePath()
}

const fitText = (
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number
) => {
  const safeMaxWidth = Math.max(8, maxWidth)

  if (context.measureText(value).width <= safeMaxWidth) {
    return value
  }

  let nextValue = value

  while (nextValue.length > 1 && context.measureText(`${nextValue}…`).width > safeMaxWidth) {
    nextValue = nextValue.slice(0, -1)
  }

  return `${nextValue}…`
}

const measureBadgeWidth = (
  context: CanvasRenderingContext2D,
  label: string,
  maxWidth: number
) => {
  context.font = fontMonoSmall
  const text = fitText(context, label.toUpperCase(), Math.max(24, maxWidth - 10))

  return Math.min(maxWidth, Math.max(26, context.measureText(text).width + 10))
}

const drawBadge = (
  context: CanvasRenderingContext2D,
  label: string,
  color: string,
  x: number,
  y: number,
  maxWidth: number
) => {
  context.font = fontMonoSmall
  const text = fitText(context, label.toUpperCase(), Math.max(24, maxWidth - 10))
  const width = measureBadgeWidth(context, label, maxWidth)

  context.fillStyle = withAlpha(color, 0.14)
  context.strokeStyle = mixColors(color, sceneTheme.rail, 0.58)
  context.lineWidth = 1
  roundRect(context, x, y, width, 12, 0)
  context.fill()
  context.stroke()
  context.fillStyle = mixColors(color, sceneTheme.shellText, 0.72)
  context.textBaseline = 'middle'
  context.save()
  context.beginPath()
  context.rect(x + 4, y + 1, Math.max(0, width - 8), 10)
  context.clip()
  context.fillText(text, x + 5, y + 6.5)
  context.restore()

  return width
}

const normalizeBadgeWidths = (
  widths: number[],
  columnMaxWidth: number,
  gap: number,
  minimumWidth = 34
) => {
  const nextWidths = [...widths]
  const getTotalWidth = () => nextWidths.reduce((total, width) => total + width, 0) + Math.max(0, nextWidths.length - 1) * gap

  while (getTotalWidth() > columnMaxWidth) {
    let largestIndex = -1
    let largestWidth = minimumWidth

    nextWidths.forEach((width, index) => {
      if (width > largestWidth) {
        largestWidth = width
        largestIndex = index
      }
    })

    if (largestIndex < 0) {
      break
    }

    nextWidths[largestIndex] = Math.max(minimumWidth, (nextWidths[largestIndex] || minimumWidth) - 4)
  }

  return nextWidths
}

const drawHeaderChip = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  font = fontMonoSmall,
  colors: {
    fill?: string
    stroke?: string
    text?: string
  } = {}
) => {
  context.fillStyle = colors.fill || 'rgba(255, 255, 255, 0.014)'
  context.strokeStyle = colors.stroke || 'rgba(255, 255, 255, 0.05)'
  context.lineWidth = 1
  context.strokeRect(x, y, width, 17)
  context.fillRect(x, y, width, 17)
  context.font = font
  context.fillStyle = colors.text || sceneTheme.muted
  context.textBaseline = 'top'
  context.fillText(label, x + 6, y + 4.5)
}

const destroyTextureEntries = (entries: Map<string, TextureCacheEntry>) => {
  entries.forEach((entry) => {
    entry.sprite.destroy()
    entry.texture.destroy(true)
  })
  entries.clear()
}

const destroyTextureEntry = (
  entries: Map<string, TextureCacheEntry>,
  key: string
) => {
  const entry = entries.get(key)

  if (!entry) {
    return
  }

  entry.sprite.parent?.removeChild(entry.sprite)
  entry.sprite.destroy()
  entry.texture.destroy(true)
  entries.delete(key)
}

const pruneTextureEntries = (
  entries: Map<string, TextureCacheEntry>,
  activeIds: Set<string>
) => {
  Array.from(entries.keys()).forEach((key) => {
    if (!activeIds.has(key)) {
      destroyTextureEntry(entries, key)
    }
  })
}

const destroyAllTextures = () => {
  destroyTextureEntries(tableSpriteEntries)
  destroyTextureEntries(groupSpriteEntries)
  destroyTextureEntries(groupHeaderSpriteEntries)
  destroyTextureEntries(objectSpriteEntries)
}

const getSelectionStateKey = (id: string) => {
  if (!selection) {
    return 'idle'
  }

  if (selection.kind === 'table' && selection.tableId === id) {
    return 'selected-table'
  }

  if (selection.kind === 'column' && selection.tableId === id) {
    return `selected-column:${selection.columnName}`
  }

  if (selection.kind === 'attachment' && selection.tableId === id) {
    return `selected-attachment:${selection.attachmentId}`
  }

  if ((selection.kind === 'group' || selection.kind === 'object') && selection.id === id) {
    return `selected-${selection.kind}`
  }

  return 'idle'
}

const hashDiagramRenderSignature = (value: string) => {
  let hash = 0

  for (const character of value) {
    hash = ((hash << 5) - hash) + character.charCodeAt(0)
    hash |= 0
  }

  return Math.abs(hash).toString(36)
}

const diagramSpriteRasterVersion = '2026-03-30-group-shell-v3'

const getGroupRenderSignature = (group: DiagramGpuGroupNode) => {
  return [
    group.color,
    group.columnCount,
    group.compareHighlightActive ? 'compare-active' : 'compare-idle',
    group.compareHighlightColor || '',
    group.masonry ? 'masonry' : 'grid',
    group.note || '',
    group.tableCount,
    group.tableIds.join(','),
    group.tableWidthScale,
    group.title
  ].join('|')
}

const getTableRenderSignature = (card: DiagramGpuTableCard) => {
  return [
    card.color,
    card.compareHighlightActive ? 'compare-active' : 'compare-idle',
    card.compareHighlightColor || '',
    card.groupId || '',
    card.headerHeight,
    card.schema,
    card.title,
    ...card.rows.map((row) => {
      return [
        row.key,
        row.kind,
        row.title,
        row.subtitle,
        row.columnName || '',
        row.attachmentId || '',
        row.kindLabel || '',
        row.highlightColor || '',
        row.accentColor || '',
        row.badges.map(badge => `${badge.label}:${badge.color}`).join(',')
      ].join(':')
    })
  ].join('|')
}

const getObjectRenderSignature = (node: DiagramGpuObjectNode) => {
  return [
    node.collapsed ? 'collapsed' : 'expanded',
    node.color,
    node.compareHighlightActive ? 'compare-active' : 'compare-idle',
    node.compareHighlightColor || '',
    node.details.join('|'),
    node.impactTargets.map(target => `${target.tableId}:${target.columnName || '*'}`).join(','),
    node.kindLabel,
    node.subtitle,
    node.tableIds.join(','),
    node.title
  ].join('|')
}

const createCanvas = (width: number, height: number, resolution: number) => {
  const safeResolution = Math.max(diagramMinimumTextureResolution, resolution)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width * safeResolution))
  canvas.height = Math.max(1, Math.ceil(height * safeResolution))
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to create canvas context for diagram sprite.')
  }

  context.scale(safeResolution, safeResolution)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  return {
    canvas,
    context
  }
}

const getNodeBorderColor = (color: string, kind: 'group' | 'object' | 'table') => {
  return kind === 'group'
    ? mixColors(color, sceneTheme.nodeBorderNeutral, 0.38)
    : mixColors(color, sceneTheme.nodeBorderNeutral, 0.62)
}

const getNodeAccentColor = (color: string) => {
  return mixColors(color, sceneTheme.nodeAccentMix, 0.7)
}

const drawPanelGlyph = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  strokeColor: string,
  collapsed: boolean
) => {
  context.strokeStyle = strokeColor
  context.lineWidth = 1.25
  context.beginPath()
  context.rect(x, y, size, size)
  context.stroke()
  context.beginPath()
  context.moveTo(x + 3, y + size / 2)
  context.lineTo(x + size - 3, y + size / 2)

  if (collapsed) {
    context.moveTo(x + size / 2, y + 3)
    context.lineTo(x + size / 2, y + size - 3)
  }

  context.stroke()
}

const buildTableCanvas = (card: DiagramGpuTableCard, resolution: number) => {
  const { canvas, context } = createCanvas(card.width, card.height, resolution)
  const selectionKey = getSelectionStateKey(card.id)
  const isGroupedTable = typeof card.groupId === 'string' && card.groupId.length > 0

  const accentColor = getNodeAccentColor(card.color)
  const borderColor = getNodeBorderColor(card.color, 'table')
  const backgroundColor = isGroupedTable
    ? sceneTheme.tableSurface
    : mixColors(card.color, sceneTheme.tableSurface, 0.08)
  const compareAccentColor = card.compareHighlightColor
    ? mixColors(card.compareHighlightColor, sceneTheme.surface, 0.14)
    : null
  const dividerColor = sceneTheme.divider
  const rowSelectedColor = withAlpha(card.color, 0.16)
  const shellTextColor = sceneTheme.shellText
  const headerFillColor = isGroupedTable
    ? sceneTheme.tableSurface
    : compositeColors(withAlpha(card.color, 0.2), sceneTheme.tableSurface)
  const headerTextColor = isGroupedTable ? shellTextColor : getReadableTextColor(headerFillColor)
  const headerMetaColor = isGroupedTable ? accentColor : withAlpha(headerTextColor, 0.82)
  const headerChipColors = isGroupedTable
    ? undefined
    : {
        fill: withAlpha(headerTextColor, 0.08),
        stroke: withAlpha(headerTextColor, 0.22),
        text: withAlpha(headerTextColor, 0.82)
      }
  const mutedTextColor = sceneTheme.muted
  const shellStrokeColor = isGroupedTable ? dividerColor : borderColor
  const shellClipInset = isGroupedTable ? 0 : 1
  const shellClipWidth = isGroupedTable ? card.width : card.width - 2
  const shellClipHeight = isGroupedTable ? card.height : card.height - 2

  context.fillStyle = backgroundColor
  if (isGroupedTable) {
    context.fillRect(0, 0, card.width, card.height)
  } else {
    roundRect(context, 0.5, 0.5, card.width - 1, card.height - 1, 2.5)
    context.fill()
  }

  if (compareAccentColor) {
    context.save()
    context.fillStyle = withAlpha(compareAccentColor, card.compareHighlightActive ? 0.16 : 0.08)

    if (isGroupedTable) {
      context.fillRect(0.5, 0.5, card.width - 1, card.height - 1)
    } else {
      roundRect(context, 1, 1, card.width - 2, card.height - 2, 2)
      context.fill()
    }

    context.restore()
  }

  context.save()
  if (isGroupedTable) {
    context.beginPath()
    context.rect(shellClipInset, shellClipInset, shellClipWidth, shellClipHeight)
    context.clip()
  } else {
    roundRect(context, 1, 1, card.width - 2, card.height - 2, 2)
    context.clip()
  }

  context.fillStyle = headerFillColor
  context.fillRect(1, 1, Math.max(0, card.width - 2), Math.max(0, card.headerHeight - 1))

  if (card.rows.length > 1) {
    context.fillStyle = dividerColor
    context.fillRect(1, card.headerHeight, Math.max(0, card.width - 2), Math.max(0, card.height - card.headerHeight - 1))
  }

  context.font = fontMonoSmallRegular
  context.fillStyle = headerMetaColor
  context.textBaseline = 'top'
  context.fillText('TABLE', 10, 8)

  context.font = fontSansTitle
  context.fillStyle = headerTextColor
  const rowCountLabel = `${card.rows.length} ROWS`
  context.font = fontMonoSmall
  const rowCountWidth = Math.max(52, context.measureText(rowCountLabel).width + 12)
  context.font = fontSansTitle
  context.fillText(fitText(context, card.title, card.width - 20), 10, 29)

  context.font = fontMonoSmall
  drawHeaderChip(context, card.width - rowCountWidth - 10, 8, rowCountWidth, rowCountLabel, fontMonoSmall, headerChipColors)

  drawBadge(
    context,
    card.schema,
    getDiagramSchemaBadgeColor(card.schema),
    10,
    card.headerHeight - 19,
    Math.min(78, card.width - 20)
  )

  let rowY = card.headerHeight

  card.rows.forEach((row, index) => {
    const rowSelected = selectionKey === `selected-column:${row.columnName || ''}`
      || selectionKey === `selected-attachment:${row.attachmentId || ''}`
    const rowBackground = row.kind === 'attachment' && row.accentColor
      ? mixColors(row.accentColor, sceneTheme.rowSurface, 0.08)
      : (row.highlightColor ? mixColors(row.highlightColor, sceneTheme.rowSurface, 0.12) : sceneTheme.rowSurface)
    const rowFillHeight = index < card.rows.length - 1 ? diagramTableRowHeight - 1 : diagramTableRowHeight

    context.fillStyle = rowSelected ? rowSelectedColor : rowBackground
    context.fillRect(1, rowY, Math.max(0, card.width - 2), rowFillHeight)

    if (row.kind === 'attachment' && row.accentColor) {
      context.fillStyle = withAlpha(row.accentColor, 0.58)
      context.fillRect(1, rowY, 3, rowFillHeight)
    } else if (row.highlightColor) {
      context.fillStyle = withAlpha(row.highlightColor, 0.62)
      context.fillRect(1, rowY, 3, rowFillHeight)
    }

    const badgeGap = 4
    const reversedBadges = [...row.badges].reverse()
    const rawBadgeWidths = reversedBadges.map((badge) => {
      return measureBadgeWidth(context, badge.label, reversedBadges.length > 1 ? 72 : 90)
    })
    const badgeWidths = normalizeBadgeWidths(rawBadgeWidths, reversedBadges.length > 1 ? 104 : 90, badgeGap)
    let badgeX = card.width - 10

    reversedBadges.forEach((badge, badgeIndex) => {
      const width = badgeWidths[badgeIndex] || measureBadgeWidth(context, badge.label, 72)
      badgeX -= width
      drawBadge(context, badge.label, badge.color, badgeX, rowY + 8, width)
      badgeX -= badgeGap
    })

    if (row.kind === 'attachment' && row.accentColor && row.kindLabel) {
      context.font = fontMonoSmall
      const kindWidth = Math.max(38, Math.min(76, context.measureText(row.kindLabel.toUpperCase()).width + 10))
      drawBadge(context, row.kindLabel, row.accentColor, 10, rowY + 8, kindWidth)

      context.font = fontMono
      context.fillStyle = shellTextColor
      context.textBaseline = 'top'
      context.fillText(fitText(context, row.title, Math.max(64, badgeX - kindWidth - 28)), 18 + kindWidth, rowY + 7)

      context.font = fontSansMuted
      context.fillStyle = mutedTextColor
      context.fillText(fitText(context, row.subtitle, Math.max(58, badgeX - kindWidth - 28)), 18 + kindWidth, rowY + 19)
    } else {
      context.font = fontMono
      context.fillStyle = shellTextColor
      context.textBaseline = 'top'
      context.fillText(fitText(context, row.title, Math.max(74, badgeX - 18)), 10, rowY + 7)

      context.font = fontSansMuted
      context.fillStyle = mutedTextColor
      context.fillText(fitText(context, row.subtitle, Math.max(70, badgeX - 18)), 10, rowY + 19)
    }

    rowY += diagramTableRowHeight
  })

  context.strokeStyle = dividerColor
  context.beginPath()
  context.moveTo(1, card.headerHeight + 0.5)
  context.lineTo(card.width - 1, card.headerHeight + 0.5)
  context.stroke()

  context.restore()

  if (compareAccentColor) {
    context.strokeStyle = withAlpha(compareAccentColor, card.compareHighlightActive ? 0.94 : 0.7)
    context.lineWidth = card.compareHighlightActive ? 2.25 : 1.5

    if (isGroupedTable) {
      context.strokeRect(0.5, 0.5, card.width - 1, card.height - 1)
    } else {
      roundRect(context, 0.5, 0.5, card.width - 1, card.height - 1, 2.5)
      context.stroke()
    }
  }

  context.strokeStyle = selectionKey.startsWith('selected') ? accentColor : shellStrokeColor
  context.lineWidth = selectionKey.startsWith('selected') ? 1.5 : 1

  if (isGroupedTable) {
    context.strokeRect(0.5, 0.5, card.width - 1, card.height - 1)
  } else {
    roundRect(context, 0.5, 0.5, card.width - 1, card.height - 1, 2.5)
    context.stroke()
  }

  return canvas
}

const buildGroupCanvas = (group: DiagramGpuGroupNode, resolution: number) => {
  const { canvas, context } = createCanvas(group.width, group.height, resolution)
  const selectionKey = getSelectionStateKey(group.id)
  const accentColor = getNodeAccentColor(group.color)
  const borderColor = getNodeBorderColor(group.color, 'group')
  const compareAccentColor = group.compareHighlightColor
    ? mixColors(group.compareHighlightColor, sceneTheme.surface, 0.2)
    : null
  const shellFill = compositeColors(sceneTheme.groupSurface, sceneTheme.background)
  const bodyOverlayFill = compositeColors(withAlpha(group.color, 0.02), shellFill)
  const headerOverlayHeight = getGroupHeaderOverlayHeight(group)
  const headerTopFill = compositeColors(withAlpha(group.color, 0.28), bodyOverlayFill)
  const headerMidFill = compositeColors(withAlpha(group.color, 0.14), bodyOverlayFill)
  const headerLowFill = compositeColors(withAlpha(group.color, 0.05), bodyOverlayFill)
  const headerMidStop = Math.min(1, (diagramGroupHeaderBandHeight * 0.24) / headerOverlayHeight)
  const headerLowStop = Math.min(1, (diagramGroupHeaderBandHeight * 0.5) / headerOverlayHeight)
  const headerTailStop = Math.min(1, diagramGroupHeaderBandHeight / headerOverlayHeight)
  const headerFadeOutStop = Math.min(1, (diagramGroupHeaderBandHeight + 18) / headerOverlayHeight)
  const headerGradient = context.createLinearGradient(0, 0, 0, headerOverlayHeight)
  headerGradient.addColorStop(0, headerTopFill)
  headerGradient.addColorStop(headerMidStop, headerMidFill)
  headerGradient.addColorStop(headerLowStop, headerLowFill)
  headerGradient.addColorStop(headerTailStop, headerLowFill)
  headerGradient.addColorStop(headerFadeOutStop, bodyOverlayFill)
  headerGradient.addColorStop(1, bodyOverlayFill)

  context.fillStyle = shellFill
  roundRect(context, 0.5, 0.5, group.width - 1, group.height - 1, 2.5)
  context.fill()

  context.save()
  roundRect(context, 1, 1, group.width - 2, group.height - 2, 2)
  context.clip()
  context.fillStyle = bodyOverlayFill
  context.fillRect(1, 1, Math.max(0, group.width - 2), Math.max(0, group.height - 2))
  context.fillStyle = headerGradient
  context.fillRect(1, 1, Math.max(0, group.width - 2), Math.max(0, headerOverlayHeight - 1))

  if (compareAccentColor) {
    context.fillStyle = compositeColors(
      withAlpha(compareAccentColor, group.compareHighlightActive ? 0.12 : 0.06),
      bodyOverlayFill
    )
    context.fillRect(1, 1, Math.max(0, group.width - 2), Math.max(0, group.height - 2))
  }

  context.restore()

  if (compareAccentColor) {
    context.strokeStyle = withAlpha(compareAccentColor, group.compareHighlightActive ? 0.9 : 0.64)
    context.lineWidth = group.compareHighlightActive ? 2.25 : 1.5
    roundRect(context, 0.5, 0.5, group.width - 1, group.height - 1, 2.5)
    context.stroke()
  }

  context.strokeStyle = selectionKey === 'selected-group' ? accentColor : borderColor
  context.lineWidth = selectionKey === 'selected-group' ? 1.5 : 1
  roundRect(context, 0.5, 0.5, group.width - 1, group.height - 1, 2.5)
  context.stroke()

  return canvas
}

const getGroupHeaderOverlayHeight = (group: DiagramGpuGroupNode) => {
  return Math.min(group.height, diagramGroupHeaderBandHeight + 24)
}

const buildGroupHeaderOverlayCanvas = (group: DiagramGpuGroupNode, resolution: number) => {
  const headerOverlayHeight = getGroupHeaderOverlayHeight(group)
  const { canvas, context } = createCanvas(group.width, headerOverlayHeight, resolution)
  const accentColor = getNodeAccentColor(group.color)
  const shellFill = compositeColors(sceneTheme.groupSurface, sceneTheme.background)
  const bodyOverlayFill = compositeColors(withAlpha(group.color, 0.02), shellFill)
  const chipBaseFill = compositeColors(sceneTheme.control, bodyOverlayFill)
  const chipStrokeColor = compositeColors(sceneTheme.rail, chipBaseFill)

  context.save()
  topRoundRect(context, 0.5, 0.5, group.width - 1, headerOverlayHeight - 0.5, 2.5)
  context.clip()

  context.font = fontMonoSmallRegular
  context.fillStyle = accentColor
  context.textBaseline = 'top'
  context.fillText('TABLE GROUP', 12, 9)

  const pill = `${group.tableCount} TABLES`
  context.font = fontMonoSmallRegular
  const pillWidth = Math.max(58, context.measureText(pill).width + 12)
  const pillX = group.width - 12 - pillWidth
  const headerControlsWidth = pillWidth + 12
  const pillColors = {
    fill: chipBaseFill,
    stroke: chipStrokeColor,
    text: accentColor
  }
  context.font = fontSansTitle
  context.fillStyle = sceneTheme.shellText
  context.fillText(fitText(context, group.title, group.width - headerControlsWidth - 28), 12, 24)

  if (group.note) {
    context.font = fontSansMuted
    context.fillStyle = sceneTheme.muted
    context.fillText(fitText(context, group.note, group.width - headerControlsWidth - 28), 12, 42)
  }

  drawHeaderChip(context, pillX, 9, pillWidth, pill, fontMonoSmallRegular, pillColors)
  context.restore()

  return canvas
}

const buildObjectCanvas = (node: DiagramGpuObjectNode, resolution: number) => {
  const { canvas, context } = createCanvas(node.width, node.height, resolution)
  const selectionKey = getSelectionStateKey(node.id)
  const accentColor = getNodeAccentColor(node.color)
  const borderColor = getNodeBorderColor(node.color, 'object')
  const backgroundColor = mixColors(node.color, sceneTheme.surface, 0.08)
  const compareAccentColor = node.compareHighlightColor
    ? mixColors(node.compareHighlightColor, sceneTheme.surface, 0.16)
    : null

  if (compareAccentColor) {
    context.fillStyle = withAlpha(compareAccentColor, node.compareHighlightActive ? 0.16 : 0.08)
    roundRect(context, 0.5, 0.5, node.width - 1, node.height - 1, 2.5)
    context.fill()
  }

  context.fillStyle = backgroundColor
  context.strokeStyle = selectionKey === 'selected-object' ? accentColor : borderColor
  context.lineWidth = selectionKey === 'selected-object' ? 1.5 : 1
  roundRect(context, 0.5, 0.5, node.width - 1, node.height - 1, 2.5)
  context.fill()
  context.stroke()

  if (compareAccentColor) {
    context.strokeStyle = withAlpha(compareAccentColor, node.compareHighlightActive ? 0.94 : 0.7)
    context.lineWidth = node.compareHighlightActive ? 2.25 : 1.5
    roundRect(context, 1.5, 1.5, node.width - 3, node.height - 3, 2)
    context.stroke()
  }

  context.font = fontMonoSmall
  context.fillStyle = accentColor
  context.textBaseline = 'top'
  context.fillText(node.kindLabel.toUpperCase(), 10, 10)

  context.font = fontSansTitle
  context.fillStyle = sceneTheme.shellText
  context.fillText(fitText(context, node.title, node.width - 86), 10, 25)

  context.font = fontMonoSmall
  const impactLabel = `${Math.max(node.tableIds.length, node.impactTargets.length || node.tableIds.length)} IMPACT`
  const impactWidth = Math.max(56, context.measureText(impactLabel).width + 12)
  context.strokeStyle = sceneTheme.rail
  context.strokeRect(node.width - impactWidth - 26, 10, impactWidth, 16)
  context.fillStyle = sceneTheme.muted
  context.fillText(impactLabel, node.width - impactWidth - 20, 14)
  drawPanelGlyph(context, node.width - 18, 11, 12, accentColor, node.collapsed)

  context.strokeStyle = sceneTheme.divider
  context.beginPath()
  context.moveTo(0, diagramObjectHeaderHeight + 0.5)
  context.lineTo(node.width, diagramObjectHeaderHeight + 0.5)
  context.stroke()

  context.font = fontSansMuted
  context.fillStyle = sceneTheme.muted
  context.fillText(fitText(context, node.subtitle, node.width - 20), 10, 42)

  if (node.collapsed) {
    return canvas
  }

  context.font = fontSansMuted
  context.fillStyle = sceneTheme.muted
  const details = node.details.filter(entry => entry.trim().length > 0).slice(0, 4)
  details.forEach((detail, index) => {
    context.fillText(fitText(context, detail, node.width - 20), 10, 58 + index * 16)
  })

  return canvas
}

const createTextureFromCanvas = (canvas: HTMLCanvasElement) => {
  const scene = sceneResources.value
  if (!scene) {
    throw new Error('Pixi must be initialized before creating diagram textures.')
  }

  return scene.pixi.Texture.from({
    alphaMode: 'premultiply-alpha-on-upload',
    resource: canvas
  })
}

const getOrCreateSpriteEntry = (
  entries: Map<string, TextureCacheEntry>,
  key: string,
  kind: 'group' | 'group-header' | 'object' | 'table',
  renderSignature: string,
  width: number,
  height: number,
  buildCanvas: (resolution: number) => HTMLCanvasElement
) => {
  const scene = sceneResources.value
  if (!scene) {
    return null
  }

  const resolution = getTextureResolution(width, height)
  const nextKey = `${key}:${getSelectionStateKey(key)}:${Math.round(resolution * 100)}:${width}x${height}:${diagramSpriteRasterVersion}:${hashDiagramRenderSignature(renderSignature)}:${hashDiagramRenderSignature(sceneThemeSignature)}`
  const existingEntry = entries.get(key)

  if (existingEntry?.key === nextKey) {
    return existingEntry
  }

  const canvas = buildCanvas(resolution)
  const texture = createTextureFromCanvas(canvas)
  const sprite = existingEntry?.sprite || new scene.pixi.Sprite(texture)

  if (existingEntry) {
    existingEntry.texture.destroy(true)
  }

  sprite.texture = texture
  sprite.width = width
  sprite.height = height
  sprite.eventMode = 'none'
  sprite.roundPixels = true

  const nextEntry = {
    key: nextKey,
    sprite,
    texture
  } satisfies TextureCacheEntry

  entries.set(key, nextEntry)

  if (kind === 'table' && !scene.tableContainer.children.includes(sprite)) {
    scene.tableContainer.addChild(sprite)
  }

  if (kind === 'group' && !scene.groupContainer.children.includes(sprite)) {
    scene.groupContainer.addChild(sprite)
  }

  if (kind === 'group-header' && !scene.groupHeaderContainer.children.includes(sprite)) {
    scene.groupHeaderContainer.addChild(sprite)
  }

  if (kind === 'object' && !scene.objectContainer.children.includes(sprite)) {
    scene.objectContainer.addChild(sprite)
  }

  return nextEntry
}

const updateBackgroundGrid = () => {
  const scene = sceneResources.value
  if (!scene) {
    return
  }

  scene.backgroundGraphics.clear()
  scene.backgroundGraphics.rect(0, 0, viewportWidth.value, viewportHeight.value).fill({
    alpha: 1,
    color: hexToNumber(sceneTheme.background, 0x09131a)
  })

  for (let x = diagramGridDotSpacing / 2; x < viewportWidth.value; x += diagramGridDotSpacing) {
    for (let y = diagramGridDotSpacing / 2; y < viewportHeight.value; y += diagramGridDotSpacing) {
      scene.backgroundGraphics.circle(x, y, 1).fill({
        alpha: 0.12,
        color: hexToNumber(sceneTheme.dot, 0x94a3b8)
      })
    }
  }
}

const getVisibleIds = (
  index: DiagramSpatialGridIndex<string> | null,
  overscan: number
) => {
  if (!index) {
    return new Set<string>()
  }

  return new Set(queryDiagramSpatialGridIndex(index, getWorldViewportBounds(overscan)).map(entry => entry.id))
}

const isPointInside = (x: number, y: number, left: number, top: number, width: number, height: number) => {
  return x >= left && x <= left + width && y >= top && y <= top + height
}

const resolveHitTarget = (clientX: number, clientY: number) => {
  const worldPoint = worldPointFromClient(clientX, clientY)
  const sortedObjects = objects.filter(object => activeVisibleObjectIds.has(object.id)).slice().sort((left, right) => right.y - left.y)

  for (const object of sortedObjects) {
    if (!isPointInside(worldPoint.x, worldPoint.y, object.x, object.y, object.width, object.height)) {
      continue
    }

    if (worldPoint.y <= object.y + diagramObjectHeaderHeight) {
      if (
        worldPoint.x >= object.x + object.width - 22
        && worldPoint.x <= object.x + object.width - 6
        && worldPoint.y >= object.y + 9
        && worldPoint.y <= object.y + 25
      ) {
        return {
          kind: 'object-toggle',
          objectId: object.id,
          sourceRange: object.sourceRange
        } satisfies HitTarget
      }

      return {
        kind: 'object-header',
        objectId: object.id,
        sourceRange: object.sourceRange
      } satisfies HitTarget
    }

    return {
      kind: 'object-body',
      objectId: object.id,
      sourceRange: object.sourceRange
    } satisfies HitTarget
  }

  const sortedTables = tables.filter(table => activeVisibleTableIds.has(table.id)).slice().sort((left, right) => right.y - left.y)

  for (const table of sortedTables) {
    if (!isPointInside(worldPoint.x, worldPoint.y, table.x, table.y, table.width, table.height)) {
      continue
    }

    const localY = worldPoint.y - table.y

    if (localY <= table.headerHeight) {
      return {
        kind: 'table-header',
        sourceRange: table.sourceRange,
        tableId: table.id
      } satisfies HitTarget
    }

    const rowIndex = Math.floor((localY - table.headerHeight) / diagramTableRowHeight)
    const row = table.rows[rowIndex]

    if (!row) {
      return {
        kind: 'table-header',
        sourceRange: table.sourceRange,
        tableId: table.id
      } satisfies HitTarget
    }

    return {
      attachmentId: row.attachmentId,
      columnName: row.columnName,
      kind: 'table-row',
      sourceRange: row.sourceRange || table.sourceRange,
      tableId: table.id
    } satisfies HitTarget
  }

  const sortedGroups = groups.filter(group => activeVisibleGroupIds.has(group.id)).slice().sort((left, right) => right.y - left.y)

  for (const group of sortedGroups) {
    if (!isPointInside(worldPoint.x, worldPoint.y, group.x, group.y, group.width, group.height)) {
      continue
    }

    return {
      groupId: group.id,
      kind: 'group-header'
    } satisfies HitTarget
  }

  return null
}

const emitSelectionForHitTarget = (target: HitTarget | null) => {
  if (!target) {
    emit('select', null)
    return ''
  }

  if (target.kind === 'group-header' && target.groupId) {
    emit('select', {
      id: target.groupId,
      kind: 'group'
    })
    return `group:${target.groupId}`
  }

  if ((target.kind === 'object-body' || target.kind === 'object-header') && target.objectId) {
    emit('select', {
      id: target.objectId,
      kind: 'object'
    })
    return `object:${target.objectId}`
  }

  if (target.kind === 'object-toggle' && target.objectId) {
    emit('select', {
      id: target.objectId,
      kind: 'object'
    })
    return `object-toggle:${target.objectId}`
  }

  if (target.kind === 'table-header' && target.tableId) {
    emit('select', {
      kind: 'table',
      tableId: target.tableId
    })
    return `table:${target.tableId}`
  }

  if (target.kind === 'table-row' && target.tableId && target.columnName) {
    emit('select', {
      columnName: target.columnName,
      kind: 'column',
      tableId: target.tableId
    })
    return `column:${target.tableId}:${target.columnName}`
  }

  if (target.kind === 'table-row' && target.tableId && target.attachmentId) {
    emit('select', {
      attachmentId: target.attachmentId,
      kind: 'attachment',
      tableId: target.tableId
    })
    return `attachment:${target.tableId}:${target.attachmentId}`
  }

  emit('select', null)
  return ''
}

const shouldPublishRendererDebug = () => {
  if (!import.meta.client) {
    return false
  }

  const debugWindow = window as Window & {
    __PGML_ENABLE_SCENE_DEBUG__?: boolean
    __PGML_FORCE_GPU_SCENE__?: boolean
  }

  return debugWindow.__PGML_ENABLE_SCENE_DEBUG__ === true
    || debugWindow.__PGML_FORCE_GPU_SCENE__ === true
    || navigator.webdriver
}

const publishRendererDebug = () => {
  if (!shouldPublishRendererDebug()) {
    return
  }

  const typedWindow = window as Window & {
    __PGML_ENABLE_SCENE_DEBUG__?: boolean
    __PGML_FORCE_GPU_SCENE__?: boolean
    __pgmlSceneRendererDebug?: {
      background: string
      dragPreview: DiagramNodeDragPreview | null
      fallbackReason: DiagramRendererCapability['fallbackReason']
      groupHeaderSpriteCount: number
      groupSpriteCount: number
      isSecureContext: boolean
      objectSpriteCount: number
      rendererBackend: SceneRendererPreference
      requestedRendererBackend: DiagramRendererBackend
      panX: number
      panY: number
      renderedConnections: Array<Pick<DiagramGpuConnectionLine, 'key' | 'points'>>
      renderedGroupCards: Array<{ height: number, id: string, width: number, x: number, y: number }>
      renderedObjectCards: Array<{ height: number, id: string, width: number, x: number, y: number }>
      renderedTableCards: Array<{ height: number, id: string, visible: boolean, width: number, x: number, y: number }>
      resolvedRendererBackend: DiagramRendererCapability['resolved']
      scale: number
      tableSpriteCount: number
    }
  }

  typedWindow.__pgmlSceneRendererDebug = {
    background: sceneTheme.background,
    dragPreview: liveDragPreview,
    fallbackReason: rendererCapability.value.fallbackReason,
    groupHeaderSpriteCount: groupHeaderSpriteEntries.size,
    groupSpriteCount: groupSpriteEntries.size,
    isSecureContext: rendererCapability.value.isSecureContext,
    objectSpriteCount: objectSpriteEntries.size,
    rendererBackend: activeRendererPreference,
    requestedRendererBackend: rendererCapability.value.requested,
    panX: worldPanX,
    panY: worldPanY,
    renderedConnections: [...renderedStaticConnections, ...renderedDynamicConnections],
    renderedGroupCards: renderedDebugGroupCards.map((group) => {
      const sprite = groupSpriteEntries.get(group.id)?.sprite
      return sprite ? { ...group, x: sprite.x, y: sprite.y } : group
    }),
    renderedObjectCards: renderedDebugObjectCards.map((objectNode) => {
      const sprite = objectSpriteEntries.get(objectNode.id)?.sprite
      return sprite ? { ...objectNode, x: sprite.x, y: sprite.y } : objectNode
    }),
    renderedTableCards: renderedDebugTableCards.map((table) => {
      const sprite = tableSpriteEntries.get(table.id)?.sprite
      return sprite ? { ...table, visible: sprite.visible, x: sprite.x, y: sprite.y } : { ...table, visible: false }
    }),
    resolvedRendererBackend: rendererCapability.value.resolved,
    scale: worldScale,
    tableSpriteCount: tableSpriteEntries.size
  }
}

const setRendererCapability = (nextCapability: DiagramRendererCapability) => {
  rendererCapability.value = nextCapability
  emit('rendererCapabilityChange', nextCapability)
  publishRendererDebug()
}

const renderWorldTransformOnly = () => {
  const scene = sceneResources.value
  if (!scene) {
    return
  }

  updateWorldTransform()
  applyDragPreviewSpritePositions(liveDragPreview)
  publishRendererDebug()
  scene.app.render()
}

const scheduleTransformRender = () => {
  const current = lifetime.value
  if (current.kind !== 'ready') return
  transformRenderBatcher.schedule(() => {
    if (lifetime.value === current) renderWorldTransformOnly()
  })
}

const scheduleDeferredFullRender = (delay = 72) => {
  const current = lifetime.value
  if (current.kind !== 'ready') return
  if (deferredFullRenderTimeout !== null) {
    clearTimeout(deferredFullRenderTimeout)
  }

  deferredFullRenderTimeout = setTimeout(() => {
    if (lifetime.value !== current) return
    deferredFullRenderTimeout = null
    scheduleFullRender()
  }, delay)
}

const scheduleFullRender = () => {
  const current = lifetime.value
  if (current.kind !== 'ready') return
  fullRenderBatcher.schedule(() => {
    if (lifetime.value === current) renderScene()
  })
}

const drawPolyline = (graphics: PixiGraphics, points: DiagramGpuConnectionLine['points']) => {
  if (points.length < 2) {
    return
  }

  graphics.moveTo(points[0]?.x || 0, points[0]?.y || 0)
  points.slice(1).forEach((point) => {
    graphics.lineTo(point.x, point.y)
  })
}

const parseDashPattern = (value: string) => {
  const segments = value
    .split(/[,\s]+/)
    .map(part => Number.parseFloat(part))
    .filter(part => Number.isFinite(part) && part > 0.5)

  return segments.length > 0 ? segments : [14, 10]
}

const drawSolidPolyline = (
  graphics: PixiGraphics,
  points: DiagramGpuConnectionLine['points'],
  style: Parameters<PixiGraphics['stroke']>[0]
) => {
  drawPolyline(graphics, points)
  graphics.stroke(style)
}

const drawDashedPolyline = (
  graphics: PixiGraphics,
  points: DiagramGpuConnectionLine['points'],
  dashPattern: number[],
  dashOffset: number,
  style: Parameters<PixiGraphics['stroke']>[0]
) => {
  if (points.length < 2) {
    return
  }

  const pattern = dashPattern.length > 0 ? dashPattern : [14, 10]
  const patternLength = pattern.reduce((total, part) => total + part, 0)

  if (patternLength <= 0.01) {
    drawSolidPolyline(graphics, points, style)
    return
  }

  let patternIndex = 0
  let remainingInPattern = pattern[0] || 1
  let drawSegment = true
  let normalizedOffset = ((dashOffset % patternLength) + patternLength) % patternLength
  let hasVisibleSegment = false

  while (normalizedOffset > remainingInPattern) {
    normalizedOffset -= remainingInPattern
    patternIndex = (patternIndex + 1) % pattern.length
    remainingInPattern = pattern[patternIndex] || 1
    drawSegment = !drawSegment
  }

  remainingInPattern -= normalizedOffset

  for (let index = 0; index < points.length - 1; index += 1) {
    const fromPoint = points[index]
    const toPoint = points[index + 1]

    if (!fromPoint || !toPoint) {
      continue
    }

    const deltaX = toPoint.x - fromPoint.x
    const deltaY = toPoint.y - fromPoint.y
    const segmentLength = Math.hypot(deltaX, deltaY)

    if (segmentLength <= 0.01) {
      continue
    }

    const unitX = deltaX / segmentLength
    const unitY = deltaY / segmentLength
    let consumed = 0

    while (consumed < segmentLength - 0.01) {
      const step = Math.min(remainingInPattern, segmentLength - consumed)
      const startX = fromPoint.x + unitX * consumed
      const startY = fromPoint.y + unitY * consumed
      const endX = fromPoint.x + unitX * (consumed + step)
      const endY = fromPoint.y + unitY * (consumed + step)

      if (drawSegment) {
        graphics.moveTo(startX, startY)
        graphics.lineTo(endX, endY)
        hasVisibleSegment = true
      }

      consumed += step
      remainingInPattern -= step

      if (remainingInPattern <= 0.01) {
        patternIndex = (patternIndex + 1) % pattern.length
        remainingInPattern = pattern[patternIndex] || 1
        drawSegment = !drawSegment
      }
    }
  }

  if (hasVisibleSegment) {
    graphics.stroke(style)
  }
}

const getDynamicConnectionPreviewNodeId = () => {
  return hasActiveNodeDragPreview(liveDragPreview) && liveDragPreview ? liveDragPreview.nodeId : null
}

const getVisibleConnectionLinesForPreviewNodeId = (previewNodeId: string | null) => {
  return connections
    .filter((line) => {
      return activeVisibleConnectionIds.has(line.key)
        || (
          previewNodeId !== null
          && (line.fromOwnerNodeId === previewNodeId || line.toOwnerNodeId === previewNodeId)
        )
    })
    .sort((left, right) => left.zIndex - right.zIndex)
}

const buildVisibleConnectionBuckets = (previewNodeId: string | null): VisibleConnectionBuckets => {
  const staticLines: DiagramGpuConnectionLine[] = []
  const dynamicLines: DiagramGpuConnectionLine[] = []

  getVisibleConnectionLinesForPreviewNodeId(previewNodeId).forEach((line) => {
    const participatesInPreview = previewNodeId !== null
      && (line.fromOwnerNodeId === previewNodeId || line.toOwnerNodeId === previewNodeId)

    if (participatesInPreview || line.animated) {
      dynamicLines.push(line)
      return
    }

    staticLines.push(line)
  })

  return {
    dynamicLines,
    staticLines
  }
}

const getVisibleConnectionBuckets = () => {
  const previewNodeId = getDynamicConnectionPreviewNodeId()

  if (
    cachedConnectionBucketVersion === connectionBucketCacheVersion
    && cachedConnectionBucketPreviewNodeId === previewNodeId
  ) {
    return cachedVisibleConnectionBuckets
  }

  cachedVisibleConnectionBuckets = buildVisibleConnectionBuckets(previewNodeId)
  cachedConnectionBucketVersion = connectionBucketCacheVersion
  cachedConnectionBucketPreviewNodeId = previewNodeId

  return cachedVisibleConnectionBuckets
}

const drawConnectionLines = (
  graphics: PixiGraphics,
  lines: DiagramGpuConnectionLine[]
) => {
  const scene = sceneResources.value
  if (!scene) return
  graphics.clear()

  const debugConnections: Array<Pick<DiagramGpuConnectionLine, 'key' | 'points'>> = []
  const captureDebug = shouldPublishRendererDebug()
  if (graphics === scene.staticLineGraphics) {
    renderedStaticConnections = debugConnections
  } else {
    renderedDynamicConnections = debugConnections
  }

  if (!showRelationshipLines || lines.length === 0) {
    return
  }

  lines.forEach((line) => {
    const linePoints = line.points
    if (captureDebug) {
      debugConnections.push({ key: line.key, points: linePoints })
    }
    const color = hexToNumber(line.color, 0x79e3ea)
    const solidStyle = {
      alpha: line.animated ? 0.62 : 0.72,
      cap: line.animated ? 'square' : 'round',
      color,
      join: 'miter',
      width: line.dashed ? 1.02 : 1.08
    } as const

    if (!line.dashed) {
      drawSolidPolyline(graphics, linePoints, solidStyle)
      return
    }

    if (line.animated) {
      drawSolidPolyline(graphics, linePoints, {
        ...solidStyle,
        alpha: 0.18,
        width: 0.94
      })
    }

    const dashPattern = parseDashPattern(line.dashPattern)
    drawDashedPolyline(
      graphics,
      linePoints,
      dashPattern,
      line.animated ? lineAnimationOffset : 0,
      {
        alpha: line.animated ? 0.9 : 0.7,
        cap: 'square',
        color,
        join: 'miter',
        width: line.animated ? 1.34 : 1.02
      }
    )
  })
}

const renderConnectionLayer = (
  options: {
    includeStatic?: boolean
  } = {}
) => {
  const scene = sceneResources.value
  if (!scene) {
    return
  }

  const {
    includeStatic = true
  } = options
  const visibleLines = getVisibleConnectionBuckets()
  const previewNodeId = getDynamicConnectionPreviewNodeId()

  if (includeStatic || previewNodeId !== activeDynamicConnectionPreviewNodeId) {
    drawConnectionLines(scene.staticLineGraphics, visibleLines.staticLines)
  }

  drawConnectionLines(scene.dynamicLineGraphics, visibleLines.dynamicLines)
  activeDynamicConnectionPreviewNodeId = previewNodeId
}

const syncAnimatedLineLoop = () => {
  const current = lifetime.value
  if (current.kind !== 'ready') return
  const hasAnimatedVisibleLines = showRelationshipLines && getVisibleConnectionBuckets().dynamicLines.some((line) => {
    return line.animated && line.dashed
  })

  if (!hasAnimatedVisibleLines) {
    if (lineAnimationFrame !== null) {
      cancelAnimationFrame(lineAnimationFrame)
      lineAnimationFrame = null
    }

    lineAnimationOffset = 0
    return
  }

  if (lineAnimationFrame !== null) {
    return
  }

  const animate = (timestamp: number) => {
    if (lifetime.value !== current) return
    lineAnimationOffset = (timestamp * 0.042) % 24
    applyDragPreviewSpritePositions(liveDragPreview)
    renderConnectionLayer({
      includeStatic: false
    })
    publishRendererDebug()
    current.resources.app.render()
    lineAnimationFrame = requestAnimationFrame(animate)
  }

  lineAnimationFrame = requestAnimationFrame(animate)
}

const renderScene = () => {
  const scene = sceneResources.value
  if (!scene) return

  updateWorldTransform()

  const visibleGroupIds = getVisibleIds(groupSpatialIndex, diagramNodeViewportOverscan)
  const visibleTableIds = getVisibleIds(tableSpatialIndex, diagramNodeViewportOverscan)
  const visibleObjectIds = getVisibleIds(objectSpatialIndex, diagramNodeViewportOverscan)
  const visibleConnectionIds = shouldDisableConnectionCulling
    ? new Set(connections.map(line => line.key))
    : getVisibleIds(connectionSpatialIndex, diagramLineViewportOverscan)

  activeVisibleGroupIds = visibleGroupIds
  activeVisibleTableIds = visibleTableIds
  activeVisibleObjectIds = visibleObjectIds
  activeVisibleConnectionIds = visibleConnectionIds
  connectionBucketCacheVersion += 1
  const groupIds = new Set(groups.map(group => group.id))
  const tableIds = new Set(tables.map(table => table.id))
  const objectIds = new Set(objects.map(objectNode => objectNode.id))

  pruneTextureEntries(groupSpriteEntries, groupIds)
  pruneTextureEntries(groupHeaderSpriteEntries, groupIds)
  pruneTextureEntries(tableSpriteEntries, tableIds)
  pruneTextureEntries(objectSpriteEntries, objectIds)

  const groupBasePositionById = groups.reduce<Record<string, { x: number, y: number }>>((entries, group) => {
    entries[group.id] = {
      x: group.x,
      y: group.y
    }

    return entries
  }, {})
  const groupRenderPositionById = groups.reduce<Record<string, { x: number, y: number }>>((entries, group) => {
    entries[group.id] = {
      x: group.x,
      y: group.y
    }

    return entries
  }, {})
  renderedDebugGroupCards = []
  renderedDebugTableCards = []
  renderedDebugObjectCards = []

  groups.forEach((group) => {
    const renderSignature = getGroupRenderSignature(group)
    const entry = getOrCreateSpriteEntry(
      groupSpriteEntries,
      group.id,
      'group',
      renderSignature,
      group.width,
      group.height,
      resolution => buildGroupCanvas(group, resolution)
    )

    if (!entry) {
      return
    }

    const groupRenderPosition = groupRenderPositionById[group.id] || {
      x: group.x,
      y: group.y
    }

    entry.sprite.visible = visibleGroupIds.has(group.id)
    entry.sprite.position.set(groupRenderPosition.x, groupRenderPosition.y)
    entry.sprite.zIndex = selection?.kind === 'group' && selection.id === group.id ? 2 : 0

    const headerEntry = getOrCreateSpriteEntry(
      groupHeaderSpriteEntries,
      group.id,
      'group-header',
      renderSignature,
      group.width,
      getGroupHeaderOverlayHeight(group),
      resolution => buildGroupHeaderOverlayCanvas(group, resolution)
    )

    if (!headerEntry) {
      return
    }

    headerEntry.sprite.visible = visibleGroupIds.has(group.id)
    headerEntry.sprite.position.set(groupRenderPosition.x, groupRenderPosition.y)
    headerEntry.sprite.zIndex = selection?.kind === 'group' && selection.id === group.id ? 4 : 0
    renderedDebugGroupCards.push({
      height: group.height,
      id: group.id,
      width: group.width,
      x: groupRenderPosition.x,
      y: groupRenderPosition.y
    })
  })

  tables.forEach((table) => {
    const entry = getOrCreateSpriteEntry(
      tableSpriteEntries,
      table.id,
      'table',
      getTableRenderSignature(table),
      table.width,
      table.height,
      resolution => buildTableCanvas(table, resolution)
    )

    if (!entry) {
      return
    }

    entry.sprite.visible = visibleTableIds.has(table.id)
    let renderedTablePosition = {
      x: table.x,
      y: table.y
    }

    if (table.groupId && groupBasePositionById[table.groupId] && groupRenderPositionById[table.groupId]) {
      renderedTablePosition = {
        x: table.x + (groupRenderPositionById[table.groupId]?.x || 0) - (groupBasePositionById[table.groupId]?.x || 0),
        y: table.y + (groupRenderPositionById[table.groupId]?.y || 0) - (groupBasePositionById[table.groupId]?.y || 0)
      }
    }

    entry.sprite.position.set(renderedTablePosition.x, renderedTablePosition.y)
    entry.sprite.zIndex = selection?.kind === 'table' && selection.tableId === table.id
      ? 14
      : selection?.kind === 'column' && selection.tableId === table.id
        ? 14
        : selection?.kind === 'attachment' && selection.tableId === table.id
          ? 14
          : 10
    renderedDebugTableCards.push({
      height: table.height,
      id: table.id,
      width: table.width,
      x: renderedTablePosition.x,
      y: renderedTablePosition.y
    })
  })

  objects.forEach((objectNode) => {
    const entry = getOrCreateSpriteEntry(
      objectSpriteEntries,
      objectNode.id,
      'object',
      getObjectRenderSignature(objectNode),
      objectNode.width,
      objectNode.height,
      resolution => buildObjectCanvas(objectNode, resolution)
    )

    if (!entry) {
      return
    }

    entry.sprite.visible = visibleObjectIds.has(objectNode.id)
    const objectRenderPosition = {
      x: objectNode.x,
      y: objectNode.y
    }

    entry.sprite.position.set(objectRenderPosition.x, objectRenderPosition.y)
    entry.sprite.zIndex = selection?.kind === 'object' && selection.id === objectNode.id ? 16 : 12
    renderedDebugObjectCards.push({
      height: objectNode.height,
      id: objectNode.id,
      width: objectNode.width,
      x: objectRenderPosition.x,
      y: objectRenderPosition.y
    })
  })

  applyDragPreviewSpritePositions(liveDragPreview)
  renderConnectionLayer()
  syncAnimatedLineLoop()

  scene.groupContainer.sortChildren()
  scene.groupHeaderContainer.sortChildren()
  scene.tableContainer.sortChildren()
  scene.objectContainer.sortChildren()

  publishRendererDebug()
  scene.app.render()
}

const setPreviewSpritePosition = (entry: TextureCacheEntry | undefined, x: number, y: number, width: number, height: number) => {
  if (!entry) return
  entry.sprite.position.set(x, y)
  entry.sprite.visible = doesDiagramSpatialEntryIntersectBounds({ minX: x, minY: y, maxX: x + width, maxY: y + height }, getWorldViewportBounds(diagramNodeViewportOverscan))
}

const applyNodePreviewPosition = (preview: DiagramNodeDragPreview, reset: boolean) => {
  if (preview.kind === 'group') {
    const group = groups.find(entry => entry.id === preview.id)
    if (group) {
      const x = reset ? group.x : preview.x
      const y = reset ? group.y : preview.y
      setPreviewSpritePosition(groupSpriteEntries.get(group.id), x, y, group.width, group.height)
      setPreviewSpritePosition(groupHeaderSpriteEntries.get(group.id), x, y, group.width, group.height)
    }
    tables.forEach((table) => {
      if (table.groupId === preview.id) {
        setPreviewSpritePosition(tableSpriteEntries.get(table.id), table.x + (reset ? 0 : preview.deltaX), table.y + (reset ? 0 : preview.deltaY), table.width, table.height)
      }
    })
    return
  }
  if (preview.kind === 'table') {
    const table = tables.find(entry => entry.id === preview.id)
    if (table) setPreviewSpritePosition(tableSpriteEntries.get(table.id), reset ? table.x : preview.x, reset ? table.y : preview.y, table.width, table.height)
    return
  }
  const node = objects.find(entry => entry.id === preview.id)
  if (node) setPreviewSpritePosition(objectSpriteEntries.get(node.id), reset ? node.x : preview.x, reset ? node.y : preview.y, node.width, node.height)
}

const applyDragPreviewSpritePositions = (preview: DiagramNodeDragPreview | null) => {
  if (renderedDragPreview && (!preview || preview.id !== renderedDragPreview.id || preview.kind !== renderedDragPreview.kind)) {
    applyNodePreviewPosition(renderedDragPreview, true)
  }
  renderedDragPreview = preview
  if (preview) applyNodePreviewPosition(preview, false)
}

const renderDragPreview = () => {
  const scene = sceneResources.value
  if (!scene) {
    return
  }

  updateWorldTransform()
  applyDragPreviewSpritePositions(liveDragPreview)
  renderConnectionLayer({
    includeStatic: false
  })
  syncAnimatedLineLoop()
  publishRendererDebug()
  scene.app.render()
}

const scheduleDragPreviewRender = () => {
  const current = lifetime.value
  if (current.kind !== 'ready') return
  dragPreviewRenderBatcher.schedule(() => {
    if (lifetime.value === current) renderDragPreview()
  })
}

const hasActiveNodeDragPreview = (preview: DiagramNodeDragPreview | null) => {
  return Boolean(preview && (preview.deltaX !== 0 || preview.deltaY !== 0))
}

const hasAnyActivePreview = () => {
  return hasActiveNodeDragPreview(liveDragPreview)
}

const handlePreviewStateChange = (previousPreviewActive: boolean) => {
  if (hasAnyActivePreview()) {
    scheduleDragPreviewRender()
    return
  }

  if (previousPreviewActive) {
    scheduleFullRender()
  }
}

const setDragPreview = (preview: DiagramNodeDragPreview | null) => {
  const previousPreviewActive = hasAnyActivePreview()

  liveDragPreview = preview
  handlePreviewStateChange(previousPreviewActive)
}

const getResetViewTransform = (
  nextViewportWidth = viewportWidth.value,
  nextViewportHeight = viewportHeight.value,
  nextViewportInsetRight = viewportInsetRight
) => {
  return getDiagramViewportFitTransform({
    bounds: {
      height: worldBounds.maxY - worldBounds.minY,
      width: worldBounds.maxX - worldBounds.minX,
      x: worldBounds.minX,
      y: worldBounds.minY
    },
    maxScale: diagramMaxScale,
    viewportHeight: nextViewportHeight,
    viewportInsetRight: nextViewportInsetRight,
    viewportWidth: nextViewportWidth
  })
}

const getMinViewportScale = () => Math.min(diagramMinScale, getResetViewTransform().scale)

const isAtResetViewTransform = (
  nextViewportWidth = viewportWidth.value,
  nextViewportHeight = viewportHeight.value,
  nextViewportInsetRight = viewportInsetRight
) => {
  const resetTransform = getResetViewTransform(nextViewportWidth, nextViewportHeight, nextViewportInsetRight)

  return approximatelyEqual(worldScale, resetTransform.scale, 0.001)
    && approximatelyEqual(worldPanX, resetTransform.panX, 1)
    && approximatelyEqual(worldPanY, resetTransform.panY, 1)
}

const resetView = () => {
  const current = lifetime.value
  if (current.kind === 'initializing' || current.kind === 'failed') {
    lifetime.value = { ...current, resumeTransform: null }
    return
  }
  if (current.kind !== 'ready') return
  const nextTransform = getResetViewTransform()

  worldScale = nextTransform.scale
  worldPanX = nextTransform.panX
  worldPanY = nextTransform.panY
  hasViewportInteraction = false
  scheduleFullRender()
}

const focusBounds = (bounds: FocusBounds, padding = 72) => {
  if (lifetime.value.kind !== 'ready') return
  if (bounds.width <= 0 || bounds.height <= 0 || viewportWidth.value <= 0 || viewportHeight.value <= 0) {
    return
  }

  const nextTransform = getDiagramViewportFitTransform({
    bounds,
    maxScale: diagramMaxScale,
    padding,
    viewportHeight: viewportHeight.value,
    viewportInsetRight,
    viewportWidth: viewportWidth.value
  })

  worldScale = nextTransform.scale
  worldPanX = nextTransform.panX
  worldPanY = nextTransform.panY
  hasViewportInteraction = true
  scheduleFullRender()
}

const zoomToScale = (nextScale: number, clientX: number, clientY: number) => {
  if (lifetime.value.kind !== 'ready') return
  const bounds = hostRef.value?.getBoundingClientRect()

  if (!bounds) {
    return
  }

  const clampedScale = clamp(nextScale, getMinViewportScale(), diagramMaxScale)
  const pointerX = clientX - bounds.left
  const pointerY = clientY - bounds.top
  const worldX = (pointerX - worldPanX) / Math.max(worldScale, 0.001)
  const worldY = (pointerY - worldPanY) / Math.max(worldScale, 0.001)

  worldScale = clampedScale
  worldPanX = pointerX - worldX * clampedScale
  worldPanY = pointerY - worldY * clampedScale
  hasViewportInteraction = true
  scheduleTransformRender()
  scheduleDeferredFullRender()
}

const zoomBy = (direction: 1 | -1) => {
  const bounds = hostRef.value?.getBoundingClientRect()

  if (!bounds) {
    return
  }

  zoomToScale(worldScale * (1 + direction * diagramZoomStep), bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
}

const handleWheel = (event: WheelEvent) => {
  if (lifetime.value.kind !== 'ready' || !interactionEnabled) return
  event.preventDefault()
  const zoomFactor = Math.exp((-event.deltaY / 100) * 0.12)
  zoomToScale(worldScale * zoomFactor, event.clientX, event.clientY)
}

const handlePointerDown = (event: PointerEvent) => {
  if (lifetime.value.kind !== 'ready' || !interactionEnabled || event.button !== 0) return
  if (event.pointerType === 'touch') {
    activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    overlayRef.value?.setPointerCapture(event.pointerId)
    if (activeTouchPointers.size >= 2) {
      const gesture = getPointerTouchGesture()
      if (gesture) {
        startTouchPinchSession(gesture, 'pointer')
        applyPinchGestureTransform(gesture, 'pointer')
      }
      return
    }
  }
  if (interaction.kind !== 'idle') return
  const target = resolveHitTarget(event.clientX, event.clientY)
  const dragTarget = target?.kind === 'object-toggle' ? null : getDragTargetForHitTarget(target)
  if (dragTarget && target) {
    interaction = {
      kind: 'node-pressed', pointerId: event.pointerId,
      nodeId: dragTarget.id, nodeKind: dragTarget.kind,
      originClientX: event.clientX, originClientY: event.clientY,
      originX: dragTarget.originX, originY: dragTarget.originY,
      pressedTarget: target, selectOnPress: dragTarget.selectOnPress
    }
    if (dragTarget.selectOnPress) {
      if (dragTarget.kind === 'table') emit('select', { kind: 'table', tableId: dragTarget.id })
      else emit('select', { kind: dragTarget.kind, id: dragTarget.id })
    }
  } else if (target?.kind === 'object-toggle' && target.objectId) {
    interaction = { kind: 'toggle-pressed', pointerId: event.pointerId, objectId: target.objectId, pressedTarget: target }
  } else {
    interaction = { kind: 'pan', pointerId: event.pointerId,
      originClientX: event.clientX, originClientY: event.clientY, originPanX: worldPanX, originPanY: worldPanY }
    emit('select', null)
  }
  overlayRef.value?.setPointerCapture(event.pointerId)
}

const handleTouchStart = (event: TouchEvent) => {
  if (lifetime.value.kind !== 'ready' || !interactionEnabled) return
  if (event.touches.length < 2) return
  const gesture = getTouchGesture(event.touches)
  if (!gesture) return
  event.preventDefault()
  startTouchPinchSession(gesture, 'touch')
}

const handlePointerMove = (event: PointerEvent) => {
  if (event.pointerType === 'touch' && activeTouchPointers.has(event.pointerId)) {
    activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (activeTouchPointers.size >= 2) {
      const gesture = getPointerTouchGesture()
      if (gesture) {
        event.preventDefault()
        applyPinchGestureTransform(gesture, 'pointer')
      }
      return
    }
  }
  const current = interaction
  if (!('pointerId' in current) || current.pointerId !== event.pointerId) return
  if (current.kind === 'pan') {
    worldPanX = current.originPanX + event.clientX - current.originClientX
    worldPanY = current.originPanY + event.clientY - current.originClientY
    hasViewportInteraction = true
    scheduleTransformRender()
    scheduleDeferredFullRender(48)
    return
  }
  if (current.kind === 'toggle-pressed') return
  const deltaX = event.clientX - current.originClientX
  const deltaY = event.clientY - current.originClientY
  if (current.kind === 'node-pressed' && Math.abs(deltaX) <= 4 && Math.abs(deltaY) <= 4) return
  const position = getDragWorldPosition(current, event.clientX, event.clientY)
  interaction = { ...current, kind: 'node-dragging', position }
  const preview: DiagramNodeDragPreview = { deltaX: position.x - current.originX, deltaY: position.y - current.originY,
    id: current.nodeId, kind: current.nodeKind, nodeId: current.nodeId,
    originX: current.originX, originY: current.originY, x: position.x, y: position.y }
  emit('dragPreviewChange', preview)
}

const handleTouchMove = (event: TouchEvent) => {
  if (lifetime.value.kind !== 'ready' || !interactionEnabled) return
  if (event.touches.length < 2) return
  const gesture = getTouchGesture(event.touches)
  if (!gesture) return
  event.preventDefault()
  applyPinchGestureTransform(gesture, 'touch')
}

const handlePointerUp = (event: PointerEvent) => {
  if (event.pointerType === 'touch') {
    activeTouchPointers.delete(event.pointerId)
    if (interaction.kind === 'pinching' || interaction.kind === 'pinch-ending') {
      const input = interaction.input
      if (activeTouchPointers.size >= 2) {
        const gesture = getPointerTouchGesture()
        if (gesture) startTouchPinchSession(gesture, 'pointer')
      } else interaction = activeTouchPointers.size === 0 ? { kind: 'idle' } : { kind: 'pinch-ending', input }
      releasePointer(event.pointerId)
      return
    }
  }
  const current = interaction
  if (!('pointerId' in current) || current.pointerId !== event.pointerId) return
  interaction = { kind: 'idle' }
  releasePointer(event.pointerId)
  if (current.kind === 'node-dragging') {
    lastClick = null
    emit('moveEnd', { id: current.nodeId, kind: current.nodeKind, x: current.position.x, y: current.position.y })
    return
  }
  if (current.kind === 'pan') return
  if (current.kind === 'toggle-pressed') emit('toggleObjectCollapsed', current.objectId)
  const key = emitSelectionForHitTarget(current.pressedTarget)
  const timestamp = Date.now()
  if (key.length > 0 && lastClick?.key === key && timestamp - lastClick.timestamp < 300 && current.pressedTarget.sourceRange) {
    emit('focusSource', current.pressedTarget.sourceRange)
  }
  lastClick = key.length > 0 ? { key, timestamp } : null
}

const handleTouchEnd = (event: TouchEvent) => {
  if (interaction.kind !== 'pinching' && interaction.kind !== 'pinch-ending') return
  if (interaction.input === 'pointer' && activeTouchPointers.size > 0) return
  if (event.touches.length >= 2) {
    const gesture = getTouchGesture(event.touches)
    if (gesture) startTouchPinchSession(gesture, 'touch')
  } else if (event.touches.length === 1) interaction = { kind: 'pinch-ending', input: 'touch' }
  else resetTouchInteraction()
}

const isTouchInteractionWithinViewport = (event: TouchEvent) => {
  const bounds = hostRef.value?.getBoundingClientRect()
  const referenceTouch = event.touches.item(0) || event.changedTouches.item(0)

  if (!bounds || !referenceTouch) {
    return false
  }

  return (
    referenceTouch.clientX >= bounds.left
    && referenceTouch.clientX <= bounds.right
    && referenceTouch.clientY >= bounds.top
    && referenceTouch.clientY <= bounds.bottom
  )
}

const handleWindowTouchStart = (event: TouchEvent) => {
  if (!isTouchInteractionWithinViewport(event)) {
    return
  }

  handleTouchStart(event)
}

const handleWindowTouchMove = (event: TouchEvent) => {
  if (interaction.kind !== 'pinching' && !isTouchInteractionWithinViewport(event)) {
    return
  }

  handleTouchMove(event)
}

const handleWindowTouchEnd = (event: TouchEvent) => {
  if (interaction.kind !== 'pinching' && !isTouchInteractionWithinViewport(event)) {
    return
  }

  handleTouchEnd(event)
}

const rebuildSpatialIndices = () => {
  tableSpatialIndex = buildDiagramSpatialGridIndex(tables.map((table) => {
    return {
      id: table.id,
      maxX: table.x + table.width,
      maxY: table.y + table.height,
      minX: table.x,
      minY: table.y
    }
  }), diagramSpatialGridCellSize)
  groupSpatialIndex = buildDiagramSpatialGridIndex(groups.map((group) => {
    return {
      id: group.id,
      maxX: group.x + group.width,
      maxY: group.y + group.height,
      minX: group.x,
      minY: group.y
    }
  }), diagramSpatialGridCellSize)
  objectSpatialIndex = buildDiagramSpatialGridIndex(objects.map((objectNode) => {
    return {
      id: objectNode.id,
      maxX: objectNode.x + objectNode.width,
      maxY: objectNode.y + objectNode.height,
      minX: objectNode.x,
      minY: objectNode.y
    }
  }), diagramSpatialGridCellSize)
  connectionSpatialIndex = buildDiagramSpatialGridIndex(connections.map((line) => {
    return {
      id: line.key,
      ...line.bounds
    }
  }), diagramSpatialGridCellSize)
}

const getRendererCapabilitySnapshot = () => {
  if (!import.meta.client) {
    return getDiagramRendererCapability({
      hasWebGPU: false,
      isSecureContext: false,
      requested: rendererBackend
    })
  }

  const navigatorWithGpu = navigator as Navigator & {
    gpu?: Record<string, unknown>
  }

  return getDiagramRendererCapability({
    hasWebGPU: Boolean(navigatorWithGpu.gpu),
    isSecureContext: window.isSecureContext,
    requested: rendererBackend
  })
}

const rendererDestroyOptions = { removeView: true, releaseGlobalResources: false } satisfies Parameters<PixiApplication['destroy']>[0]

const destroyApplication = (application: PixiApplication) => {
  try {
    application.destroy(rendererDestroyOptions, { children: true, texture: true })
  } catch {
    // Pixi's destroy plugins assume init completed; release partial resources separately.
    const cleanup = [
      () => application.stage?.destroy({ children: true }),
      () => application.renderer?.destroy(rendererDestroyOptions)
    ]
    cleanup.forEach((release) => {
      try {
        release()
      } catch {
        // A partially initialized renderer may already have released its context.
      }
    })
  }
}

const releaseScene = (next: SceneLifetime) => {
  const current = lifetime.value
  lifetime.value = next
  cancelInteraction()
  liveDragPreview = null
  renderedDragPreview = null
  fullRenderBatcher.cancel()
  transformRenderBatcher.cancel()
  dragPreviewRenderBatcher.cancel()
  connectionBucketCacheVersion = 0
  cachedConnectionBucketVersion = -1
  cachedConnectionBucketPreviewNodeId = null
  cachedVisibleConnectionBuckets = { dynamicLines: [], staticLines: [] }
  activeDynamicConnectionPreviewNodeId = null
  if (deferredFullRenderTimeout !== null) {
    clearTimeout(deferredFullRenderTimeout)
    deferredFullRenderTimeout = null
  }
  if (lineAnimationFrame !== null) {
    cancelAnimationFrame(lineAnimationFrame)
    lineAnimationFrame = null
  }
  lineAnimationOffset = 0
  if (current.kind === 'ready') {
    destroyAllTextures()
    destroyApplication(current.resources.app)
  }
  maxSpriteTextureDimension = diagramFallbackMaxTextureDimension
}

const ownsInitialization = (generation: number) => lifetime.value.kind === 'initializing' && lifetime.value.generation === generation

const initPixi = async (resumeTransform: ViewTransform | null = null) => {
  if (lifetime.value.kind === 'disposed' || !(hostRef.value instanceof HTMLDivElement)) return
  const host = hostRef.value
  const generation = ++rendererGeneration
  releaseScene({ kind: 'initializing', generation, resumeTransform })
  let candidate: PixiApplication | null = null
  try {
    const pixi = await import('pixi.js')
    if (!ownsInitialization(generation) || hostRef.value !== host) return
    const capability = getRendererCapabilitySnapshot()
    const initApplication = async (preference: SceneRendererPreference) => {
      const application = new pixi.Application()
      try {
        await application.init({ antialias: true, autoDensity: true, autoStart: false,
          backgroundAlpha: 0, preference, resolution: Math.max(window.devicePixelRatio || 1, 1) })
        return application
      } catch (error) {
        destroyApplication(application)
        throw error
      }
    }
    try {
      candidate = await initApplication(capability.resolved)
    } catch (error) {
      if (!ownsInitialization(generation) || hostRef.value !== host) return
      if (capability.resolved !== 'webgpu') throw error
      candidate = await initApplication('webgl')
    }
    if (!ownsInitialization(generation) || hostRef.value !== host) {
      destroyApplication(candidate)
      return
    }
    const resources: SceneResources = {
      app: candidate, pixi,
      stageContainer: new pixi.Container(), backgroundGraphics: new pixi.Graphics(),
      worldContainer: new pixi.Container(), groupContainer: new pixi.Container(),
      staticLineGraphics: new pixi.Graphics(), dynamicLineGraphics: new pixi.Graphics(),
      groupHeaderContainer: new pixi.Container(), tableContainer: new pixi.Container(), objectContainer: new pixi.Container()
    }
    resources.groupContainer.sortableChildren = true
    resources.groupHeaderContainer.sortableChildren = true
    resources.tableContainer.sortableChildren = true
    resources.objectContainer.sortableChildren = true
    resources.worldContainer.addChild(resources.groupContainer)
    resources.worldContainer.addChild(resources.staticLineGraphics)
    resources.worldContainer.addChild(resources.dynamicLineGraphics)
    resources.worldContainer.addChild(resources.groupHeaderContainer)
    resources.worldContainer.addChild(resources.tableContainer)
    resources.worldContainer.addChild(resources.objectContainer)
    resources.stageContainer.addChild(resources.backgroundGraphics)
    resources.stageContainer.addChild(resources.worldContainer)
    candidate.stage.addChild(resources.stageContainer)
    const current = lifetime.value
    if (current.kind !== 'initializing' || current.generation !== generation) {
      destroyApplication(candidate)
      return
    }
    const transform = current.resumeTransform
    lifetime.value = { kind: 'ready', generation, resources }
    activeRendererPreference = candidate.renderer.type === pixi.RendererType.WEBGPU ? 'webgpu' : 'webgl'
    setRendererCapability(capability.resolved === 'webgpu' && activeRendererPreference === 'webgl'
      ? applyDiagramRendererInitFailure(capability)
      : capability)
    candidate.canvas.className = 'pointer-events-none absolute inset-0 h-full w-full'
    host.prepend(candidate.canvas)
    syncMaxSpriteTextureDimension()
    measureViewport()
    candidate.renderer.resize(viewportWidth.value, viewportHeight.value)
    refreshSceneTheme()
    updateBackgroundGrid()
    rebuildSpatialIndices()
    if (transform !== null) {
      hasViewportInteraction = true
      worldPanX = transform.panX
      worldPanY = transform.panY
      worldScale = transform.scale
    } else resetView()
    renderScene()
  } catch (error) {
    const current = lifetime.value
    if (current.kind === 'ready' && current.generation === generation) {
      releaseScene({ kind: 'failed', generation, resumeTransform, error })
    } else {
      if (candidate !== null) destroyApplication(candidate)
      if (current.kind === 'initializing' && current.generation === generation) {
        lifetime.value = { kind: 'failed', generation, resumeTransform: current.resumeTransform, error }
      }
    }
  }
}

const destroyPixi = () => releaseScene({ kind: 'disposed' })

const restartPixi = async () => {
  const current = lifetime.value
  if (current.kind === 'disposed') return
  const transform: ViewTransform | null = current.kind === 'ready'
    ? { panX: worldPanX, panY: worldPanY, scale: worldScale }
    : current.kind === 'initializing' || current.kind === 'failed' ? current.resumeTransform : null
  await initPixi(transform)
}

const syncViewportLayout = () => {
  const previousViewportWidth = viewportWidth.value
  const previousViewportHeight = viewportHeight.value
  const shouldRefitView = !hasViewportInteraction
    || previousViewportWidth <= 1
    || previousViewportHeight <= 1
    || isAtResetViewTransform(previousViewportWidth, previousViewportHeight, viewportInsetRight)

  measureViewport()
  refreshSceneTheme()
  updateBackgroundGrid()
  sceneResources.value?.app.renderer.resize(viewportWidth.value, viewportHeight.value)

  if (shouldRefitView) {
    resetView()
    return
  }

  scheduleFullRender()
}

const syncSceneTheme = () => {
  if (!refreshSceneTheme()) {
    return
  }

  updateBackgroundGrid()
  scheduleFullRender()
}

const watchSceneTheme = () => {
  if (!import.meta.client) {
    return
  }

  themeObserver?.disconnect()
  themeObserver = new MutationObserver(() => {
    syncSceneTheme()
  })
  themeObserver.observe(document.documentElement, {
    attributeFilter: ['data-studio-theme', 'style'],
    attributes: true
  })
}

watch(
  () => viewportResetKey,
  () => {
    cancelInteraction()
    nextTick(() => {
      resetView()
    })
  }
)

watch(
  () => viewportInsetRight,
  () => {
    nextTick(() => {
      resetView()
    })
  }
)

watch(
  () => rendererBackend,
  async (nextRendererBackend, previousRendererBackend) => {
    if (nextRendererBackend === previousRendererBackend) {
      return
    }

    await restartPixi()
  }
)

watch(
  () => [
    groups,
    tables,
    objects,
    selection,
    showRelationshipLines,
    worldBounds.maxX,
    worldBounds.maxY,
    worldBounds.minX,
    worldBounds.minY
  ],
  () => {
    rebuildSpatialIndices()
    scheduleFullRender()
  },
  {
    deep: true
  }
)

watch(
  () => connections,
  () => {
    connectionBucketCacheVersion += 1

    if (hasActiveNodeDragPreview(liveDragPreview)) {
      // Consume the current routed points in this frame before the moved sprites are presented.
      renderDragPreview()
      return
    }

    rebuildSpatialIndices()
    scheduleFullRender()
  },
  { deep: true }
)

watch([() => documentContextRevision, () => loadIntentRevision, () => interactionEnabled], cancelInteraction)

useResizeObserver(hostRef, syncViewportLayout)
if (import.meta.client) useEventListener(window, 'blur', cancelInteraction)

onMounted(() => {
  if (import.meta.client) {
    shouldDisableConnectionCulling = /Android/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches
  }

  watchSceneTheme()
  window.addEventListener('resize', syncViewportLayout)
  window.addEventListener('touchstart', handleWindowTouchStart, { passive: false })
  window.addEventListener('touchmove', handleWindowTouchMove, { passive: false })
  window.addEventListener('touchend', handleWindowTouchEnd, { passive: false })
  window.addEventListener('touchcancel', handleWindowTouchEnd, { passive: false })
  void initPixi()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewportLayout)
  window.removeEventListener('touchstart', handleWindowTouchStart)
  window.removeEventListener('touchmove', handleWindowTouchMove)
  window.removeEventListener('touchend', handleWindowTouchEnd)
  window.removeEventListener('touchcancel', handleWindowTouchEnd)
  themeObserver?.disconnect()
  themeObserver = null
  destroyPixi()
})

defineExpose<{
  cancelInteraction: () => void
  handleWheel: (event: WheelEvent) => void
  focusBounds: (bounds: FocusBounds, padding?: number) => void
  getScale: () => number
  resetView: () => void
  setDragPreview: (preview: DiagramNodeDragPreview | null) => void
  zoomBy: (direction: 1 | -1) => void
}>({
  cancelInteraction,
  handleWheel,
  focusBounds,
  getScale: () => worldScale,
  resetView,
  setDragPreview,
  zoomBy
})
</script>

<template>
  <div
    ref="hostRef"
    class="absolute inset-0 overflow-hidden"
  >
    <div
      v-if="lifetime.kind === 'failed'"
      role="alert"
      class="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3 p-6 text-center text-sm"
    >
      <p>The diagram could not start.</p>
      <button
        type="button"
        class="border px-3 py-1.5"
        @click="restartPixi"
      >
        Retry diagram
      </button>
    </div>
    <div
      ref="overlayRef"
      data-diagram-gesture-surface="true"
      class="absolute inset-0 z-[2] touch-none"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerCancel"
      @lostpointercapture="handlePointerCancel"
      @wheel="handleWheel"
    />
  </div>
</template>
