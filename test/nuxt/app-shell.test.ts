import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('App shell source', () => {
  it('keeps the shared shell chrome and centered title presentation in the header component', () => {
    const appFile = readSourceFile('app/app.vue')
    const headerFile = readSourceFile('app/components/AppHeader.vue')

    expect(appFile).toContain('<AppHeader>')
    expect(headerFile).toContain('>PGML</span>')
    expect(headerFile).toContain('aria-label="Primary"')
    expect(headerFile).toContain('data-app-header-title="true"')
    expect(headerFile).toContain('title="Open header menu"')
    expect(headerFile).toContain('PGML extends DBML toward Postgres-native schema design and visual documentation.')
  })
})
