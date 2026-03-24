import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram performance source', () => {
  it('limits GPU plane promotion to active viewport interactions', () => {
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvas.vue')

    expect(canvasFile).toContain('const isViewportGpuAccelerated: Ref<boolean> = ref(false)')
    expect(canvasFile).toContain('translate3d(var(--pgml-plane-pan-x, 0px), var(--pgml-plane-pan-y, 0px), 0)')
    expect(canvasFile).toContain('translate(var(--pgml-plane-pan-x, 0px), var(--pgml-plane-pan-y, 0px))')
    expect(canvasFile).toContain('scale(var(--pgml-plane-scale, 1))')
    expect(canvasFile).not.toContain('translate3d(var(--pgml-plane-pan-x, ${pan.value.x}px)')
    expect(canvasFile).not.toContain('scale(var(--pgml-plane-scale, ${scale.value}))')
    expect(canvasFile).toContain('scheduleViewportGpuAccelerationReset()')
    expect(canvasFile).toContain('onEnd: endViewportGpuAcceleration')
  })

  it('batches wheel zoom steps to one viewport update per animation frame', () => {
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvas.vue')

    expect(canvasFile).toContain('const wheelZoomBatcher = createAnimationFrameBatcher()')
    expect(canvasFile).toContain('let pendingWheelZoomSteps = 0')
    expect(canvasFile).toContain('const scheduleWheelZoom = (stepDirection: 1 | -1')
    expect(canvasFile).toContain('wheelZoomBatcher.schedule(() => {')
    expect(canvasFile).toContain('scheduleWheelZoom(event.deltaY > 0 ? -1 : 1')
  })

  it('coalesces drag follow-up work instead of queueing a fresh tick for every move', () => {
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvas.vue')

    expect(canvasFile).toContain('let hasPendingNodeUpdateSync = false')
    expect(canvasFile).toContain('let pendingNodeUpdateNeedsRemeasure = false')
    expect(canvasFile).toContain('const scheduleNodeUpdateFollowUp = (remeasure: boolean) => {')
    expect(canvasFile).toContain('pendingNodeUpdateNeedsRemeasure = pendingNodeUpdateNeedsRemeasure || remeasure')
    expect(canvasFile).toContain('scheduleNodeUpdateFollowUp(remeasure)')
  })

  it('uses transform previews, live dragged-line rerouting, and viewport culling for static lines', () => {
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvas.vue')

    expect(canvasFile).toContain('const activeNodeDrag: Ref<DiagramConnectionPreviewDragState | null> = ref(null)')
    expect(canvasFile).toContain('const dragPreviewPaths: Ref<Record<string, string>> = ref({})')
    expect(canvasFile).toContain('buildDiagramConnectionPreviewLayers(')
    expect(canvasFile).toContain('const renderedLineViewportBounds = computed(() => {')
    expect(canvasFile).toContain('const renderedConnectionLines = computed(() => {')
    expect(canvasFile).toContain('return doesLineBoundsIntersectViewport(line.bounds, viewportBounds)')
    expect(canvasFile).toContain('const buildMinimalConnectionDragPreviewPath = (fromElement: HTMLElement, toElement: HTMLElement) => {')
    expect(canvasFile).toContain('syncDragConnectionPreviewPaths()')
    expect(canvasFile).toContain('if (activeNodeDrag.value) {')
    expect(canvasFile).toContain('const getNodeDragStyle = (nodeId: string): CSSProperties | undefined => {')
    expect(canvasFile).toContain('transform: `translate3d(${activeNodeDrag.value.deltaX}px, ${activeNodeDrag.value.deltaY}px, 0)`')
    expect(canvasFile).toContain('setActiveNodeDrag({')
    expect(canvasFile).toContain(':transform="`translate(${activeNodeDrag.deltaX} ${activeNodeDrag.deltaY})`"')
    expect(canvasFile).not.toContain('hover:-translate-y-0.5')
  })
})
