import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('VueUse adoption source', () => {
  it('uses VueUse primitives for shared theme and editor layout state', () => {
    const themeFile = readFileSync('/home/omar/Code/pgml/app/composables/useStudioTheme.ts', 'utf8')
    const layoutFile = readFileSync('/home/omar/Code/pgml/app/composables/useStudioEditorLayout.ts', 'utf8')

    expect(themeFile).toContain('useStorage')
    expect(layoutFile).toContain('useWindowSize')
    expect(layoutFile).toContain('useResizeObserver')
    expect(layoutFile).toContain('useEventListener')
    expect(layoutFile).toContain('useToggle')
  })
})
