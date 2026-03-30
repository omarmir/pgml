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
  studioPersistentSelectMenuProps,
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
    expect(studioModalUi.overlay).toContain('pointer-events-none')
    expect(studioModalUi.overlay).toContain('data-[state=open]:pointer-events-auto')
    expect(studioModalUi.content).toContain('z-[60]')
    expect(studioModalSurfaceClass).toContain('w-[calc(100vw-1rem)]')
    expect(studioModalSurfaceClass).toContain('max-h-[calc(100dvh-1rem)]')
    expect(studioFieldUi.base).toContain('bg-[color:var(--studio-input-bg)]')
    expect(studioInputMenuUi.base).toContain('studio-select-trigger')
    expect(studioInputMenuUi.base).toContain('w-full')
    expect(studioInputMenuUi.content).toContain('z-[70]')
    expect(studioInputMenuUi.value).toContain('whitespace-normal')
    expect(studioSelectUi.base).toContain('studio-select-trigger')
    expect(studioSelectUi.base).toContain('min-w-0')
    expect(studioSelectUi.content).toContain('z-[70]')
    expect(studioSelectUi.placeholder).toContain('break-words')
    expect(studioPersistentSelectMenuProps.resetSearchTermOnBlur).toBe(false)
    expect(studioPersistentSelectMenuProps.resetSearchTermOnSelect).toBe(false)
    expect(studioSwitchUi.base).toContain('data-[state=checked]:bg-[color:var(--studio-shell-label)]')
    expect(studioButtonClasses.iconGhost).toContain('studio-button--icon')
  })
})
