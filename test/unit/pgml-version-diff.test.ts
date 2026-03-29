import { describe, expect, it } from 'vitest'

import { buildPgmlWithNodeProperties, parsePgml } from '../../app/utils/pgml'
import { diffPgmlSchemaModels } from '../../app/utils/pgml-diff'
import { buildPgmlMigrationDiffBundle } from '../../app/utils/pgml-migration-diff'

const baseSnapshotSource = `Table public.users {
  id uuid [pk]
}`

describe('PGML version diffing', () => {
  it('classifies schema and layout deltas between two snapshots', () => {
    const baseModel = parsePgml(baseSnapshotSource)
    const targetModel = parsePgml(buildPgmlWithNodeProperties(`Table public.users {
  id uuid [pk]
  email text [not null]
}`, {
      'public.users': {
        x: 240,
        y: 180
      }
    }))
    const diff = diffPgmlSchemaModels(baseModel, targetModel)

    expect(diff.columns).toHaveLength(1)
    expect(diff.columns[0]).toEqual(expect.objectContaining({
      id: 'public.users::email',
      kind: 'added'
    }))
    expect(diff.layout).toHaveLength(1)
    expect(diff.summary.added).toBe(1)
    expect(diff.summary.layoutChanged).toBe(1)
  })

  it('builds forward migration SQL from the selected base and target snapshots', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(baseSnapshotSource),
      parsePgml(`Table public.users {
  id uuid [pk]
  email text [not null]
}`),
      {
        baseName: 'Billing versions'
      }
    )

    expect(migrationBundle.sql.migration.fileName).toBe('billing-versions.migration.sql')
    expect(migrationBundle.sql.migration.content).toContain('BEGIN;')
    expect(migrationBundle.sql.migration.content).toContain(
      'ALTER TABLE "public"."users" ADD COLUMN "email" text NOT NULL;'
    )
    expect(migrationBundle.sql.migration.warnings).toEqual([])
  })
})
