import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('App shell source', () => {
  it('splits the page and studio shells into dedicated layouts while reusing shared header building blocks', () => {
    const appFile = readSourceFile('app/app.vue')
    const defaultLayoutFile = readSourceFile('app/layouts/default.vue')
    const studioLayoutFile = readSourceFile('app/layouts/studio.vue')
    const brandLinkFile = readSourceFile('app/components/app/AppBrandLink.vue')
    const titleBlockFile = readSourceFile('app/components/app/AppHeaderTitleBlock.vue')
    const mobileMenuFile = readSourceFile('app/components/app/AppMobileNavigationMenu.vue')

    expect(appFile).toContain('<NuxtLayout>')
    expect(brandLinkFile).toContain('>PGML</span>')
    expect(defaultLayoutFile).toContain('PGML extends DBML toward Postgres-native schema design and visual documentation.')
    expect(defaultLayoutFile).toContain('<AppPrimaryNavigation :items="navigationItems" />')
    expect(studioLayoutFile).toContain('<AppPrimaryNavigation :items="navigationItems" />')
    expect(studioLayoutFile).toContain(':data-studio-schema-status="schemaStatusData.state"')
    expect(titleBlockFile).toContain('data-app-header-title="true"')
    expect(titleBlockFile).toContain(':data-studio-schema-name="isStudioSchemaName ? \'true\' : undefined"')
    expect(mobileMenuFile).toContain('aria-label="Open header menu"')
  })
})
