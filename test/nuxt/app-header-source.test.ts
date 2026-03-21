import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('App header source', () => {
  it('delegates header state to a composable and keeps presentation in the shell component', () => {
    const appFile = readSourceFile('app/app.vue')
    const headerFile = readSourceFile('app/components/AppHeader.vue')
    const composableFile = readSourceFile('app/composables/useAppHeader.ts')

    expect(appFile).toContain('<AppHeader>')
    expect(headerFile).toContain('import { useAppHeader } from \'~/composables/useAppHeader\'')
    expect(headerFile).toContain('import { tv } from \'tailwind-variants\'')
    expect(headerFile).toContain('data-app-header-title="true"')
    expect(headerFile).toContain('title="Open header menu"')
    expect(headerFile).not.toContain('label="Actions"')
    expect(composableFile).not.toContain('shellModeClasses')
    expect(composableFile).not.toContain('baseHeaderLinkClass')
    expect(composableFile).not.toContain('desktopMenuUi')
  })
})
