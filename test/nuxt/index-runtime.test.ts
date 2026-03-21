import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('Index page source', () => {
  it('keeps the hero, outline, and documentation examples in the landing page source', () => {
    const file = readSourceFile('app/pages/index.vue')

    expect(file).toContain('Write Postgres as a readable schema document instead of raw SQL.')
    expect(file).toContain('data-testid="hero-quick-start"')
    expect(file).toContain('On This Page')
    expect(file).toContain('Why PGML')
    expect(file).toContain('DBML Compatibility')
    expect(file).toContain('Documentation')
    expect(file).toContain('Layout properties')
  })
})
