import { describe, expect, it } from 'vitest'

import { buildPgmlVersionMigrationBundle } from '../../app/utils/pgml-version-migration'

describe('PGML version migration helpers', () => {
  it('prepends the empty-base warning when no base version is selected', () => {
    const bundle = buildPgmlVersionMigrationBundle({
      baseSource: '',
      hasSelectedBase: false,
      targetSource: `Table public.users {
  id uuid [pk]
}`
    })

    expect(bundle.meta.warningCount).toBe(1)
    expect(bundle.sql.migration.warnings[0]).toBe(
      'No base version is selected. The migration is being generated from an empty schema.'
    )
  })
})
