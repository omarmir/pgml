import { describe, expect, it } from 'vitest'

import {
  foldPgmlIndexKeyIdentifiers,
  formatPgmlIndexKeyForSource,
  formatPgmlIndexKeyForSql,
  getPgmlIndexKeys,
  parsePgmlIndexKeys
} from '../../app/utils/pgml-index-keys'

const parseSingleKey = (source: string) => {
  const key = parsePgmlIndexKeys(source)[0]

  if (!key) {
    throw new Error('Expected index key')
  }

  return key
}

describe('index key syntax', () => {
  it('quotes escaped, reserved, spaced, and expression-like column identifiers correctly', () => {
    for (const name of ['a"b', 'select', 'two words', 'lower(email)', 'a,b']) {
      const sql = `"${name.replaceAll('"', '""')}"`
      const key = parseSingleKey(sql)

      expect(key).toEqual({ kind: 'column', name })
      expect(formatPgmlIndexKeyForSql(key)).toBe(sql)
      expect(parseSingleKey(formatPgmlIndexKeyForSource(key))).toEqual(key)
    }
  })

  it('keeps nested and dollar-quoted SQL contents intact', () => {
    const source = `email, coalesce(lower("Email"), 'a,''b'), (ARRAY[1, 2]), coalesce(email, $value$a,b$value$)`
    const keys = parsePgmlIndexKeys(source)

    expect(keys).toEqual([
      { kind: 'column', name: 'email' },
      { kind: 'sql', sql: `coalesce(lower("Email"), 'a,''b')` },
      { kind: 'sql', sql: '(ARRAY[1, 2])' },
      { kind: 'sql', sql: 'coalesce(email, $value$a,b$value$)' }
    ])
    expect(keys.map(formatPgmlIndexKeyForSource).join(', ')).toBe(source)
  })

  it('reads DBML expression wrappers as SQL and ignores empty key entries', () => {
    expect(parsePgmlIndexKeys(' , "", `lower(email)`, , email')).toEqual([
      { kind: 'expression', sql: 'lower(email)' },
      { kind: 'column', name: 'email' }
    ])
  })

  it('interprets legacy columns literally and trusts parsed descriptor identity', () => {
    expect(getPgmlIndexKeys({ columns: ['lower(email)'] })).toEqual([
      { kind: 'column', name: 'lower(email)' }
    ])
    const keys = parsePgmlIndexKeys('lower(email)')

    expect(getPgmlIndexKeys({ columns: ['lower(email)'], keys })).toBe(keys)
  })

  it('folds only selected quoted identifiers while retaining SQL literal tokens', () => {
    const sql = String.raw`coalesce("Email", E'can\'t "Email"', 'it''s "Email"', $tag$"Email"$tag$, "C")`
    const key = { kind: 'sql', sql } satisfies Parameters<typeof foldPgmlIndexKeyIdentifiers>[0]

    expect(foldPgmlIndexKeyIdentifiers(key, new Set(['Email']))).toEqual({
      kind: 'sql',
      sql: String.raw`coalesce("email", E'can\'t "Email"', 'it''s "Email"', $tag$"Email"$tag$, "C")`
    })
    expect(foldPgmlIndexKeyIdentifiers(key)).toEqual({
      kind: 'sql',
      sql: String.raw`coalesce("email", E'can\'t "Email"', 'it''s "Email"', $tag$"Email"$tag$, "c")`
    })
  })

  it('preserves qualified COLLATE targets and resumes folding ordinary references afterward', () => {
    const sql = 'coalesce("C", \'COLLATE "C"\') COLLATE /* note */ "pg_catalog"."C" || "C"'

    expect(foldPgmlIndexKeyIdentifiers({ kind: 'expression', sql })).toEqual({
      kind: 'expression',
      sql: 'coalesce("c", \'COLLATE "C"\') COLLATE /* note */ "pg_catalog"."C" || "c"'
    })
  })
})
