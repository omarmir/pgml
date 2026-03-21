import { describe, expect, it } from 'vitest'

import { useStudioUi } from '../../app/composables/useStudioUi'

describe('useStudioUi', () => {
  it('builds consistent shared state button classes', () => {
    const ui = useStudioUi()

    expect(ui.getStudioChoiceButtonClass()).toContain('studio-choice-button')
    expect(ui.getStudioChoiceButtonClass({
      active: true,
      extraClass: 'justify-center'
    })).toContain('studio-choice-button--active')
    expect(ui.getStudioToggleChipClass({
      active: true
    })).toContain('studio-toggle-chip--active')
    expect(ui.getStudioStateButtonClass({
      emphasized: true
    })).toContain('border-[color:var(--studio-shell-label)]')
  })

  it('exposes the shared modal and field primitives used across the studio', () => {
    const ui = useStudioUi()

    expect(ui.studioModalUi.overlay).toContain('bg-black/60')
    expect(ui.studioModalSurfaceClass).toContain('w-[calc(100vw-2rem)]')
    expect(ui.studioFieldUi.base).toContain('bg-[color:var(--studio-input-bg)]')
    expect(ui.studioSelectUi.base).toContain('studio-select-trigger')
    expect(ui.buttonClasses.iconGhost).toContain('studio-button--icon')
  })
})
