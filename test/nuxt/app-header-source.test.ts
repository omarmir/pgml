import { describe, expect, it } from 'vitest'
import { readSourceFile, sourceFileExists } from './source-test-utils'

describe('App header source', () => {
  it('uses route-specific layouts and keeps shared shell pieces in focused components', () => {
    const appFile = readSourceFile('app/app.vue')
    const defaultLayoutFile = readSourceFile('app/layouts/default.vue')
    const studioLayoutFile = readSourceFile('app/layouts/studio.vue')
    const diagramPageFile = readSourceFile('app/pages/diagram.vue')
    const mobileMenuFile = readSourceFile('app/components/app/AppMobileNavigationMenu.vue')
    const primaryNavigationFile = readSourceFile('app/composables/usePrimaryNavigation.ts')
    const studioHeaderStateFile = readSourceFile('app/composables/useStudioHeaderState.ts')

    expect(appFile).toContain('<NuxtLayout>')
    expect(defaultLayoutFile).toContain('<AppBrandLink />')
    expect(defaultLayoutFile).toContain('<AppPrimaryNavigation :items="navigationItems" />')
    expect(studioLayoutFile).toContain('<AppHeaderTitleBlock')
    expect(diagramPageFile).toContain('layout: \'studio\'')
    expect(mobileMenuFile).toContain('title="Open header menu"')
    expect(studioLayoutFile).not.toContain('label="Actions"')
    expect(primaryNavigationFile).toContain('label: \'Home\'')
    expect(primaryNavigationFile).not.toContain('label: \'Studio\'')
    expect(primaryNavigationFile).not.toContain('i-lucide')
    expect(studioLayoutFile).toContain('saved: \'i-lucide-check\'')
    expect(studioLayoutFile).not.toContain('i-lucide-check-check')
    expect(studioHeaderStateFile).not.toContain('text-red-500')
    expect(studioHeaderStateFile).not.toContain('animate-spin')
    expect(sourceFileExists('app/components/AppHeader.vue')).toBe(false)
    expect(sourceFileExists('app/composables/useAppHeader.ts')).toBe(false)
  })
})
