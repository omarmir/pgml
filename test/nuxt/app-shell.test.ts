import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('App shell source', () => {
  it('keeps the shared shell chrome and centered title presentation in the root app', () => {
    const file = readFileSync('/home/omar/Code/pgml/app/app.vue', 'utf8')

    expect(file).toContain('>PGML</span>')
    expect(file).toContain('aria-label="Primary"')
    expect(file).toContain('data-app-header-title="true"')
    expect(file).toContain('title="Open header menu"')
    expect(file).toContain('PGML extends DBML toward Postgres-native schema design and visual documentation.')
  })
})
