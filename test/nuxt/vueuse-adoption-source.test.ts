import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('VueUse adoption source', () => {
  it('uses VueUse primitives for shared theme and editor layout state', () => {
    const themeFile = readSourceFile('app/composables/useStudioTheme.ts')
    const layoutFile = readSourceFile('app/composables/useStudioEditorLayout.ts')
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvas.vue')
    const pointerSessionFile = readSourceFile('app/composables/useWindowPointerSession.ts')

    expect(themeFile).toContain('useStorage')
    expect(layoutFile).toContain('useWindowSize')
    expect(layoutFile).toContain('useResizeObserver')
    expect(layoutFile).toContain('useToggle')
    expect(layoutFile).toContain('useWindowPointerSession')
    expect(canvasFile).toContain('useResizeObserver')
    expect(canvasFile).toContain('useTimeoutFn')
    expect(canvasFile).toContain('useWindowPointerSession()')
    expect(canvasFile).not.toContain('new ResizeObserver(')
    expect(canvasFile).not.toContain('window.addEventListener(\'pointermove\'')
    expect(pointerSessionFile).toContain('useEventListener')
  })
})
