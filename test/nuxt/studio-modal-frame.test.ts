import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('StudioModalFrame source', () => {
  it('keeps the shared title, description, close control, and update handler in the modal frame source', () => {
    const file = readSourceFile('app/components/studio/StudioModalFrame.vue')

    expect(file).toContain('<UModal')
    expect(file).toContain(':data-studio-modal-surface="surfaceId"')
    expect(file).toContain(':ui="studioModalUi"')
    expect(file).toContain('studioButtonClasses.iconGhost')
    expect(file).toContain('min-w-0 grid gap-1')
    expect(file).toContain('self-start shrink-0')
    expect(file).toContain('aria-label="Close"')
    expect(file).toContain('@update:open="handleOpenChange"')
    expect(file).toContain('emit(\'update:open\', nextValue)')
    expect(file).toContain('emit(\'close\')')
  })
})
