import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('Landing page source', () => {
  it('keeps the hero quick start preview focused on the function and trigger snippet', () => {
    const file = readFileSync('/home/omar/Code/pgml/app/pages/index.vue', 'utf8')

    expect(file).toContain('data-testid="hero-quick-start"')
    expect(file).toContain('Function register_entity(entity_kind text) returns trigger [replace]')
    expect(file).toContain('Trigger trg_register_fundingopportunity on public.funding_opportunity_profile')
    expect(file).not.toContain('heroQuickStartCode = `TableGroup Programs {')
    expect(file).toContain('data-testid="quick-start-example"')
    expect(file).toContain('TableGroup Programs')
    expect(file).toContain('Sequence common_entity_id_seq')
  })
})
