import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('Shared button theming source', () => {
  it('defines shared non-canvas button utilities with explicit focus treatment', () => {
    const file = readFileSync('/home/omar/Code/pgml/app/assets/css/main.css', 'utf8')

    expect(file).toContain('.studio-button {')
    expect(file).toContain('.studio-button:hover,')
    expect(file).toContain('.studio-button:focus-visible')
    expect(file).toContain('.studio-button--ghost')
    expect(file).toContain('.studio-choice-button')
    expect(file).toContain('.studio-toggle-chip')
  })

  it('uses the shared button classes in the app shell and diagram page controls', () => {
    const appFile = readFileSync('/home/omar/Code/pgml/app/app.vue', 'utf8')
    const diagramFile = readFileSync('/home/omar/Code/pgml/app/pages/diagram.vue', 'utf8')
    const indexFile = readFileSync('/home/omar/Code/pgml/app/pages/index.vue', 'utf8')

    expect(appFile).toContain('studio-button studio-button--primary')
    expect(appFile).toContain('studio-button studio-button--ghost studio-button--icon')
    expect(indexFile).toContain('class="studio-button"')
    expect(indexFile).toContain('class="studio-button studio-button--ghost"')
    expect(diagramFile).toContain("const secondaryModalButtonClass = 'studio-button'")
    expect(diagramFile).toContain("const primaryModalButtonClass = 'studio-button studio-button--primary'")
    expect(diagramFile).toContain("const iconGhostButtonClass = 'studio-button studio-button--ghost studio-button--icon'")
    expect(diagramFile).toContain("const editorVisibilityButtonClass = 'studio-button absolute left-3 top-3 z-[4] px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.08em]'")
  })
})
