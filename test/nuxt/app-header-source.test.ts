import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('App header source', () => {
  it('keeps the studio actions button visually explicit in the header', () => {
    const file = readFileSync('/home/omar/Code/pgml/app/app.vue', 'utf8')

    expect(file).toContain('label="Actions"')
    expect(file).toContain('icon="i-lucide-panel-top-open"')
    expect(file).toContain('title="Studio actions"')
  })
})
