import { describe, expect, it } from 'vitest'

import {
  studioFieldUi,
  studioInputMenuUi,
  studioModalUi,
  studioSelectUi,
  studioSwitchUi
} from '../../app/constants/ui'
import {
  getStudioChoiceButtonClass,
  getStudioStateButtonClass,
  getStudioToggleChipClass,
  studioButtonClasses,
  studioModalSurfaceClass
} from '../../app/utils/uiStyles'

describe('studio ui modules', () => {
  it('builds consistent shared state button classes', () => {
    expect(getStudioChoiceButtonClass()).toContain('studio-choice-button')
    expect(getStudioChoiceButtonClass({
      active: true,
      extraClass: 'justify-center'
    })).toContain('studio-choice-button--active')
    expect(getStudioToggleChipClass({
      active: true
    })).toContain('studio-toggle-chip--active')
    expect(getStudioStateButtonClass({
      emphasized: true
    })).toContain('border-[color:var(--studio-shell-label)]')
  })

  it('exposes the shared modal and field primitives used across the studio', () => {
    expect(studioModalUi.overlay).toContain('bg-black/60')
    expect(studioModalSurfaceClass).toContain('w-[calc(100vw-2rem)]')
    expect(studioFieldUi.base).toContain('bg-[color:var(--studio-input-bg)]')
    expect(studioInputMenuUi.base).toContain('studio-select-trigger')
    expect(studioSelectUi.base).toContain('studio-select-trigger')
    expect(studioSwitchUi.base).toContain('data-[state=checked]:bg-[color:var(--studio-shell-label)]')
    expect(studioButtonClasses.iconGhost).toContain('studio-button--icon')
  })
})
