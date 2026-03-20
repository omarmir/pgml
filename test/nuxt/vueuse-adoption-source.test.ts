import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('VueUse adoption source', () => {
  it('uses VueUse primitives for shared theme and editor layout state', () => {
    const themeFile = readFileSync('/home/omar/Code/pgml/app/composables/useStudioTheme.ts', 'utf8')
    const layoutFile = readFileSync('/home/omar/Code/pgml/app/composables/useStudioEditorLayout.ts', 'utf8')
    const canvasFile = readFileSync('/home/omar/Code/pgml/app/components/pgml/PgmlDiagramCanvas.vue', 'utf8')
    const pointerSessionFile = readFileSync('/home/omar/Code/pgml/app/composables/useWindowPointerSession.ts', 'utf8')

    expect(themeFile).toContain('useStorage')
    expect(layoutFile).toContain('useWindowSize')
    expect(layoutFile).toContain('useResizeObserver')
    expect(layoutFile).toContain('useEventListener')
    expect(layoutFile).toContain('useToggle')
    expect(canvasFile).toContain('useResizeObserver')
    expect(canvasFile).toContain('useTimeoutFn')
    expect(canvasFile).toContain('useWindowPointerSession()')
    expect(canvasFile).not.toContain('new ResizeObserver(')
    expect(canvasFile).not.toContain('window.addEventListener(\'pointermove\'')
    expect(pointerSessionFile).toContain('useEventListener')
  })
})
