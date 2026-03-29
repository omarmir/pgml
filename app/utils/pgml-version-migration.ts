import { parsePgml } from './pgml'
import { buildPgmlMigrationDiffBundle } from './pgml-migration-diff'

export const buildPgmlVersionMigrationBundle = (
  input: {
    baseSource: string
    hasSelectedBase: boolean
    targetSource: string
  },
  options: {
    baseName?: string
  } = {}
) => {
  const migrationBundle = buildPgmlMigrationDiffBundle(
    parsePgml(input.baseSource),
    parsePgml(input.targetSource),
    options
  )

  if (input.hasSelectedBase) {
    return migrationBundle
  }

  return {
    ...migrationBundle,
    meta: {
      ...migrationBundle.meta,
      warningCount: migrationBundle.meta.warningCount + 1
    },
    sql: {
      migration: {
        ...migrationBundle.sql.migration,
        warnings: [
          'No base version is selected. The migration is being generated from an empty schema.',
          ...migrationBundle.sql.migration.warnings
        ]
      }
    }
  }
}
