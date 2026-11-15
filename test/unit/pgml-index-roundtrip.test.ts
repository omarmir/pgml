import { describe, expect, it } from 'vitest'

import { convertPgDumpToPgml } from '../../app/utils/pg-dump-import'
import { convertDbmlToPgml } from '../../app/utils/dbml-import'
import { parsePgml, replacePgmlIndexDefinitionInBlock } from '../../app/utils/pgml'
import { diffPgmlSchemaModels } from '../../app/utils/pgml-diff'
import { buildPgmlDiagramCompareEntries } from '../../app/utils/pgml-diagram-compare'
import { buildPgmlExportBundle } from '../../app/utils/pgml-export'
import { analyzePgmlDocument } from '../../app/utils/pgml-language'
import { buildPgmlMigrationDiffBundle } from '../../app/utils/pgml-migration-diff'
import { createPgmlDetailMetadataDraftFromIndex } from '../../app/utils/pgml-detail-popover-metadata'
import { applyEditableTableDraftToSource, createEditableTableDraft } from '../../app/utils/pgml-table-editor'
import { initializePgmlExecutableParser } from '../../app/utils/pgml-executable-parser'

const tableColumns = `  email text
  "Email" text
  "lower(email)" text`
const buildSource = (declaration: string) => `Table public.users {\n${tableColumns}\n  ${declaration}\n}`
const mixedKeys = `email, coalesce(email, 'a,b'), lower("Email"), "lower(email)"`
const mixedSource = buildSource(`Indexes {\n    (${mixedKeys}) [name: users_keys_idx, type: btree]\n  }`)
const expressionSource = buildSource('Indexes {\n    (lower(email)) [name: users_keys_idx, type: btree]\n  }')
const columnSource = buildSource('Indexes {\n    ("lower(email)") [name: users_keys_idx, type: btree]\n  }')

const getUsersTable = (source: string) => {
  const table = parsePgml(source).tables.find(entry => entry.fullName === 'public.users')

  if (!table) {
    throw new Error('Expected users table')
  }

  return table
}

const getUsersIndex = (source: string) => {
  const index = getUsersTable(source).indexes[0]

  if (!index) {
    throw new Error('Expected users index')
  }

  return index
}

const readSqlArtifacts = (source: string): [string, string, string] => {
  const bundle = buildPgmlExportBundle(parsePgml(source), { kyselyTypeStyle: 'pragmatic' })

  return [bundle.sql.ddl.content, bundle.sql.migration.content, bundle.kysely.migration.content]
}

describe('index key identity across studio workflows', () => {
  it('keeps imported expressions distinct from same-named quoted columns in every export', () => {
    const imported = convertPgDumpToPgml({
      sql: `CREATE TABLE public.users (email text, "lower(email)" text);
CREATE INDEX users_expr_idx ON public.users (lower(email));
CREATE INDEX users_column_idx ON public.users ("lower(email)");`
    })
    const indexes = getUsersTable(imported.pgml).indexes

    expect(indexes.find(index => index.name === 'users_expr_idx')).toMatchObject({
      columns: ['lower(email)'],
      keys: [{ kind: 'sql', sql: 'lower(email)' }]
    })
    expect(indexes.find(index => index.name === 'users_column_idx')).toMatchObject({
      columns: ['lower(email)'],
      keys: [{ kind: 'column', name: 'lower(email)' }]
    })
    for (const artifact of readSqlArtifacts(imported.pgml)) {
      expect(artifact).toContain('"users_expr_idx" ON "public"."users" USING btree (lower(email))')
      expect(artifact).toContain('"users_column_idx" ON "public"."users" USING btree ("lower(email)")')
    }
  })

  it.each(['coalesce(email, \'a,b\')', 'coalesce(email, \'a  b\')', 'lower("Email")'])(
    'preserves exact expression bytes from pg_dump through SQL and Kysely: %s',
    (sql) => {
      const imported = convertPgDumpToPgml({
        sql: `CREATE TABLE public.users (email text, "Email" text); CREATE INDEX users_keys_idx ON public.users (${sql});`
      })

      expect(getUsersIndex(imported.pgml).columns).toEqual([sql])
      for (const artifact of readSqlArtifacts(imported.pgml)) {
        expect(artifact).toContain(`USING btree (${sql});`)
      }
    }
  )

  it('parses mixed keys consistently in inline and grouped index syntax', () => {
    const inline = getUsersIndex(buildSource(`Index users_keys_idx (${mixedKeys}) [type: btree]`))
    const grouped = getUsersIndex(mixedSource)

    expect(inline).toMatchObject({
      columns: ['email', 'coalesce(email, \'a,b\')', 'lower("Email")', 'lower(email)'],
      keys: [
        { kind: 'column', name: 'email' },
        { kind: 'sql', sql: 'coalesce(email, \'a,b\')' },
        { kind: 'sql', sql: 'lower("Email")' },
        { kind: 'column', name: 'lower(email)' }
      ]
    })
    expect(grouped.columns).toEqual(inline.columns)
    expect(grouped.keys).toEqual(inline.keys)
  })

  it.each(['\'"Email",  A\'', '$value$"Email",  A$value$'])(
    'folds imported quoted key identifiers while preserving literal contents: %s',
    (literal) => {
      const imported = convertPgDumpToPgml({
        foldIdentifiersToLowercase: true,
        sql: `CREATE TABLE public.users ("Email" text); CREATE INDEX users_keys_idx ON public.users (coalesce(lower("Email"), ${literal}));`
      })

      expect(getUsersTable(imported.pgml).columns.map(column => column.name)).toEqual(['email'])
      expect(getUsersIndex(imported.pgml).columns).toEqual([`coalesce(lower("email"), ${literal})`])
      expect(readSqlArtifacts(imported.pgml)[0]).toContain(`coalesce(lower("email"), ${literal})`)
    }
  )

  it('folds imported column identifiers without renaming an existing collation', () => {
    const imported = convertPgDumpToPgml({
      foldIdentifiersToLowercase: true,
      sql: 'CREATE TABLE public.users ("Email" text); CREATE INDEX users_keys_idx ON public.users ("Email" COLLATE "C" text_pattern_ops DESC);'
    })

    expect(getUsersIndex(imported.pgml).columns).toEqual(['"email" COLLATE "C" text_pattern_ops DESC'])
  })

  it.each([
    { format: 'pgdump', column: 'C', grouped: false, qualifier: '' },
    { format: 'pgdump', column: 'Email', grouped: false, qualifier: '' },
    { format: 'dbml', column: 'C', grouped: true, qualifier: '' },
    { format: 'dbml', column: 'C', grouped: false, qualifier: '' },
    { format: 'dbml', column: 'Email', grouped: false, qualifier: '' },
    { format: 'pgdump', column: 'C', grouped: false, qualifier: 'pg_catalog.' }
  ])('preserves collation references while folding $format keys: $column, grouped=$grouped, qualifier=$qualifier', ({ format, column, grouped, qualifier }) => {
    const key = `"${column}" COLLATE ${qualifier}"C"`
    const declaration = grouped ? `Indexes {\n (${key}) [name: users_keys_idx]\n}` : `Index users_keys_idx (${key})`
    const imported = format === 'pgdump'
      ? convertPgDumpToPgml({
          foldIdentifiersToLowercase: true,
          sql: `CREATE TABLE public.users ("${column}" text); CREATE INDEX users_keys_idx ON public.users (${key});`
        })
      : convertDbmlToPgml({
          dbml: `Table public.users {\n "${column}" text\n ${declaration}\n}`,
          foldIdentifiersToLowercase: true
        })
    const expected = `"${column.toLowerCase()}" COLLATE ${qualifier}"C"`

    expect(getUsersIndex(imported.pgml).columns).toEqual([expected])
    expect(readSqlArtifacts(imported.pgml)[0]).toContain(`USING btree (${expected});`)
  })

  it('folds consecutive grouped entries without changing multiline predicate literals', () => {
    const imported = convertDbmlToPgml({
      foldIdentifiersToLowercase: true,
      dbml: `Table public.users {
 "C" text
 email text
 Indexes {
  ("C" COLLATE "C") [name: users_keys_idx, where: \`(email IS NOT NULL
   AND email <> 'A, B')\`]
  "C" [name: users_column_idx]
 }
}`
    })

    expect(imported.pgml).toContain('AND email <> \'A, B\')`]')
    expect(getUsersTable(imported.pgml).indexes.map(index => index.columns)).toEqual([
      ['"c" COLLATE "C"'],
      ['c']
    ])
  })

  it('accepts nested inline index expressions in diagnostics and rejects unbalanced declarations', () => {
    const valid = analyzePgmlDocument(buildSource(`Index users_keys_idx (${mixedKeys}) [type: btree]`))
    const invalid = analyzePgmlDocument(buildSource('Index users_keys_idx (lower(email) [type: btree]'))

    expect(valid.diagnostics.filter(diagnostic => diagnostic.code === 'pgml/table-entry')).toEqual([])
    expect(invalid.diagnostics.some(diagnostic => diagnostic.code === 'pgml/table-entry')).toBe(true)
  })

  it('generates expression index migrations and detects column-versus-expression changes', () => {
    const base = parsePgml(buildSource(''))
    const expression = parsePgml(expressionSource)
    const added = buildPgmlMigrationDiffBundle(base, expression)
    const changed = buildPgmlMigrationDiffBundle(expression, parsePgml(columnSource))

    expect(added.sql.migration.content).toContain('USING btree (lower(email));')
    expect(added.kysely.migration.content).toContain('USING btree (lower(email));')
    expect(diffPgmlSchemaModels(expression, parsePgml(columnSource)).indexes).toEqual([
      expect.objectContaining({ kind: 'modified', changes: ['columns'] })
    ])
    expect(changed.sql.migration.content).toContain('DROP INDEX IF EXISTS "users_keys_idx";')
    expect(changed.sql.migration.content).toContain('USING btree ("lower(email)");')
  })

  it('keeps legacy literal-column models equivalent to parsed ordinary indexes', () => {
    const parsed = parsePgml(buildSource('Index users_keys_idx (email) [type: btree]'))
    const legacy = parsePgml(buildSource('Index users_keys_idx (email) [type: btree]'))
    const index = legacy.tables[0]?.indexes[0]

    if (!index) {
      throw new Error('Expected index')
    }

    delete index.keys
    expect(diffPgmlSchemaModels(legacy, parsed).indexes).toEqual([])
    expect(buildPgmlMigrationDiffBundle(legacy, parsed).meta.hasChanges).toBe(false)
  })

  it('preserves expression bytes and quoted-column identity during unrelated table edits', () => {
    const model = parsePgml(mixedSource)
    const table = model.tables[0]

    if (!table) {
      throw new Error('Expected table')
    }

    const draft = createEditableTableDraft(table)
    draft.note = 'Updated without changing the index.'
    const nextSource = applyEditableTableDraftToSource(mixedSource, model, draft)

    expect(getUsersIndex(nextSource).keys).toEqual(getUsersIndex(mixedSource).keys)
    expect(readSqlArtifacts(nextSource)[0]).toContain(`("email", coalesce(email, 'a,b'), lower("Email"), "lower(email)")`)
  })

  it.each([expressionSource, columnSource])('retains key identity through metadata drafts and source replacement', (source) => {
    const index = getUsersIndex(source)
    const draft = createPgmlDetailMetadataDraftFromIndex(index)
    const replacement = replacePgmlIndexDefinitionInBlock('Index users_keys_idx (email) [type: btree]', {
      columns: draft.known.indexColumns.map(entry => entry.value),
      name: index.name,
      type: 'hash'
    })

    if (!replacement) {
      throw new Error('Expected replacement')
    }

    const nextIndex = getUsersIndex(buildSource(replacement))
    expect(nextIndex.keys).toEqual(index.keys)
    expect(nextIndex.type).toBe('hash')
  })

  it('shows different compare values when a key changes between expression and quoted column', () => {
    const before = parsePgml(expressionSource)
    const after = parsePgml(columnSource)
    const entry = buildPgmlDiagramCompareEntries(diffPgmlSchemaModels(before, after), before, after)
      .find(candidate => candidate.entityKind === 'index')
    const field = entry?.fields.find(candidate => candidate.id === 'columns')

    expect(field).toBeDefined()
    expect(field?.before).not.toBe(field?.after)
    expect(entry?.beforeSnapshot).not.toContain('"kind": "expression"')
  })

  it('produces DDL accepted by the installed PostgreSQL parser', async () => {
    const parser = await initializePgmlExecutableParser(17)
    const ddl = readSqlArtifacts(mixedSource)[0]

    expect(() => parser.parseSync(ddl)).not.toThrow()
  })

  it.each([
    { expression: 'email || \'_suffix\'', grouped: true },
    { expression: 'email || \'_suffix\'', grouped: false },
    { expression: 'amount + 1', grouped: true },
    { expression: 'amount + 1', grouped: false }
  ])('groups explicit backtick expressions in exports and migrations: $expression, grouped=$grouped', async ({ expression, grouped }) => {
    const declaration = grouped
      ? `Indexes {\n    (\`${expression}\`) [name: users_keys_idx, type: btree]\n  }`
      : `Index users_keys_idx (\`${expression}\`) [type: btree]`
    const source = `Table public.users {\n email text\n amount integer\n ${declaration}\n}`
    const expectedSql = `USING btree ((${expression}));`

    for (const artifact of readSqlArtifacts(source)) {
      expect(artifact).toContain(expectedSql)
    }

    const model = parsePgml(source)
    const migration = buildPgmlMigrationDiffBundle(parsePgml('Table public.users {\n email text\n amount integer\n}'), model)
    expect(migration.sql.migration.content).toContain(expectedSql)
    expect(migration.kysely.migration.content).toContain(expectedSql)
    const parser = await initializePgmlExecutableParser(17)
    expect(() => parser.parseSync(readSqlArtifacts(source)[0])).not.toThrow()
    const table = model.tables[0]

    if (!table) {
      throw new Error('Expected table')
    }

    const draft = createEditableTableDraft(table)
    draft.note = 'Keep explicit expression syntax.'
    const rewritten = applyEditableTableDraftToSource(source, model, draft)
    expect(rewritten).toContain(`\`${expression}\``)
    expect(readSqlArtifacts(rewritten)[0]).toContain(expectedSql)
  })

  it.each([
    { key: '(email || \'_suffix\')', expected: '(email || \'_suffix\')' },
    { key: 'email DESC NULLS LAST', expected: 'email DESC NULLS LAST' },
    { key: 'email COLLATE "C" text_pattern_ops DESC NULLS LAST', expected: 'email COLLATE "C" text_pattern_ops DESC NULLS LAST' },
    { key: 'lower(email) text_pattern_ops DESC', expected: 'lower(email) text_pattern_ops DESC' }
  ])('keeps already valid imported SQL key syntax: $key', async ({ key, expected }) => {
    const imported = convertPgDumpToPgml({
      sql: `CREATE TABLE public.users (email text); CREATE INDEX users_keys_idx ON public.users (${key});`
    })
    const ddl = readSqlArtifacts(imported.pgml)[0]

    expect(ddl).toContain(`USING btree (${expected});`)
    const parser = await initializePgmlExecutableParser(17)
    expect(() => parser.parseSync(ddl)).not.toThrow()
  })
})
