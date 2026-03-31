import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('Spec page source', () => {
  it('moves the former landing-page documentation and hero preview to /spec', () => {
    const file = readSourceFile('app/pages/spec.vue')

    expect(file).toContain('label="Choose a studio source"')
    expect(file).toContain('to="/"')
    expect(file).toContain('data-testid="hero-quick-start"')
    expect(file).toContain('VersionSet "Commerce schema"')
    expect(file).toContain('Version v2')
    expect(file).toContain('TableGroup Commerce')
    expect(file).toContain('Table public.orders')
    expect(file).toContain('Function register_entity(entity_kind text) returns trigger [replace]')
    expect(file).toContain('View "Schema focus"')
    expect(file).toContain('active_view: view_schema')
    expect(file).toContain('id: \'reasons\'')
    expect(file).toContain('id: \'dbml\'')
    expect(file).toContain('id: \'documentation\'')
    expect(file).toContain('Views and layout properties')
  })
})
