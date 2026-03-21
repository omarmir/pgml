import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('studio mobile workspace source', () => {
  it('keeps the mobile studio shell and touch-aware canvas flow explicit in source', () => {
    const pageFile = readSourceFile('app/pages/diagram.vue')
    const mobileWorkspaceFile = readSourceFile('app/components/studio/StudioMobileWorkspace.vue')
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvas.vue')

    expect(pageFile).toContain('handleCanvasFocusSource')
    expect(pageFile).toContain('mobileWorkspaceView.value = \'pgml\'')
    expect(pageFile).toContain(':mobile-active-view="mobileCanvasView"')
    expect(pageFile).toContain(':mobile-panel-tab="mobilePanelTab"')
    expect(mobileWorkspaceFile).toContain('data-mobile-studio-menu="true"')
    expect(mobileWorkspaceFile).toContain('data-mobile-studio-current-view="true"')
    expect(mobileWorkspaceFile).toContain('children: [[')
    expect(canvasFile).toContain('@touchstart="handleTouchStart"')
    expect(canvasFile).toContain('@touchmove="handleTouchMove"')
    expect(canvasFile).toContain('panelTabChange')
    expect(canvasFile).toContain('mobileActiveView')
  })
})
