import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('App header source', () => {
  it('delegates header state to a composable and keeps the shell template focused on presentation', () => {
    const file = readFileSync('/home/omar/Code/pgml/app/app.vue', 'utf8')

    expect(file).toContain('import { useAppHeader } from \'./composables/useAppHeader\'')
    expect(file).toContain('data-app-header-title="true"')
    expect(file).toContain('title="Open header menu"')
    expect(file).not.toContain('label="Actions"')
  })
})
