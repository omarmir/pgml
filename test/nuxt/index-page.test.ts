import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('Landing page source', () => {
  it('keeps the hero preview and the current documentation sections on the page', () => {
    const file = readFileSync('/home/omar/Code/pgml/app/pages/index.vue', 'utf8')

    expect(file).toContain('data-testid="hero-quick-start"')
    expect(file).toContain('TableGroup Commerce')
    expect(file).toContain('Table public.orders')
    expect(file).toContain('Function register_entity(entity_kind text) returns trigger [replace]')
    expect(file).toContain('id: \'reasons\'')
    expect(file).toContain('id: \'dbml\'')
    expect(file).toContain('id: \'documentation\'')
    expect(file).toContain('Layout properties')
  })
})
