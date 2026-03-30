import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram performance source', () => {
  it('limits GPU plane promotion to active viewport interactions', () => {
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')
    const pageFile = readSourceFile('app/pages/diagram.vue')

    expect(canvasFile).toContain('const connectionLines: Ref<DiagramGpuConnectionLine[]> = ref([])')
    expect(canvasFile).toContain('const activeConnectionDragPreview: Ref<ActiveConnectionDragPreview | null> = ref(null)')
    expect(canvasFile).toContain('const displayedConnectionLines = computed(() => {')
    expect(canvasFile).toContain('buildDiagramConnectionPreviewLayers(connectionLines.value, activeDrag)')
    expect(canvasFile).toContain('let routingWorker: Worker | null = null')
    expect(canvasFile).toContain('new Worker(new URL(\'../../workers/diagram-routing.worker.ts\', import.meta.url), {')
    expect(canvasFile).toContain('worker.postMessage({')
    expect(canvasFile).toContain('connectionLines.value = lines')
    expect(pageFile).toContain('new Worker(new URL(\'../workers/pgml-analysis.worker.ts\', import.meta.url), {')
    expect(pageFile).toContain('const shouldBuildVersionArtifacts = computed(() => {')
    expect(pageFile).toContain('const compareMigrationBundle = computed(() => {')
  })

  it('batches wheel zoom steps to one viewport update per animation frame', () => {
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(canvasFile).toContain('@wheel.stop')
    expect(canvasFile).toContain('@click="sceneRef?.zoomBy(-1)"')
    expect(canvasFile).toContain('@click="sceneRef?.zoomBy(1)"')
    expect(canvasFile).toContain('@click="sceneRef?.resetView()"')
  })

  it('coalesces drag follow-up work instead of queueing a fresh tick for every move', () => {
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(canvasFile).toContain('const measureElementSize = (element: HTMLElement | null): MeasuredSize => {')
    expect(canvasFile).toContain('useResizeObserver(viewportRef, syncViewportSize)')
    expect(canvasFile).toContain('useResizeObserver(detailPopoverRef, syncDetailPopoverSize)')
    expect(canvasFile).toContain('const applySceneNodePosition = (')
    expect(canvasFile).toContain('activeConnectionDragPreview.value = null')
    expect(canvasFile).toContain('routingWorker?.terminate()')
  })

  it('uses transform previews, live dragged-line rerouting, and viewport culling for static lines', () => {
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')
    const pageFile = readSourceFile('app/pages/diagram.vue')

    expect(canvasFile).toContain('const viewportSize: Ref<MeasuredSize> = ref({')
    expect(canvasFile).toContain('const detailPopoverSize: Ref<MeasuredSize> = ref({')
    expect(canvasFile).toContain('const browserItemCompactActionButtonClass = getStudioStateButtonClass({')
    expect(canvasFile).toContain('const isMobileSurfaceView = computed(() => {')
    expect(canvasFile).toContain('const shouldShowZoomToolbar = computed(() => !isMobileSurfaceView.value)')
    expect(canvasFile).toContain(':connections="displayedConnectionLines"')
    expect(canvasFile).toContain(':viewport-reset-key="viewportResetKey"')
    expect(pageFile).toContain(':commit-debounce-ms="editorCommitDebounceMs"')
    expect(pageFile).toContain(':diagnostics-delay-ms="editorDiagnosticsDelayMs"')
    expect(pageFile).toContain('@tool-panel-visibility-change="handleCanvasToolPanelVisibilityChange"')
  })
})
