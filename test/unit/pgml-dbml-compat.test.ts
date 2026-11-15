import { describe, expect, it } from 'vitest'

import {
  collectDbmlCompatibleMultilineEntries,
  normalizePgmlCompatSource,
  parseDbmlCompatibleIndexDefinition,
  splitBracketParts
} from '../../app/utils/pgml-dbml-compat'

describe('DBML compatibility lexical state', () => {
  it('keeps quoted separators and nested values inside bracket options', () => {
    expect(splitBracketParts('name: "a,""b", note: \'it\'\'s,a\', default: `call(a,b)`, type: numeric(10,2), values: [1,2]'))
      .toEqual(['name: "a,""b"', 'note: \'it\'\'s,a\'', 'default: `call(a,b)`', 'type: numeric(10,2)', 'values: [1,2]'])
    expect(parseDbmlCompatibleIndexDefinition('(email) [name: "email,lookup", type: btree]'))
      .toEqual({ columns: ['email'], keys: [{ kind: 'column', name: 'email' }], name: 'email,lookup', type: 'btree', unique: false, where: null })
  })

  it('preserves quoted comment markers while removing actual comments across lines', () => {
    const source = `Table items {
  note: 'it''s /* text */' // gone
  value text /* comment
  continued */ [note: "literal // text"]
}`
    const normalized = normalizePgmlCompatSource(source)

    expect(normalized).toContain('\'it\'\'s /* text */\'')
    expect(normalized).toContain('"literal // text"')
    expect(normalized).not.toContain('gone')
    expect(normalized).not.toContain('continued')
    expect(normalized.split('\n').map(line => line.length)).toEqual(source.split('\n').map(line => line.length))
  })

  it('keeps opaque source body bytes and resumes PGML comment handling after its delimiter', () => {
    const source = `Function f() returns text {
  source: $fn$
  SELECT '/* literal */'; // SQL content
  }
  $fn$
  // PGML comment
}`
    const normalized = normalizePgmlCompatSource(source)

    expect(normalized).toContain('  SELECT \'/* literal */\'; // SQL content\n  }\n  $fn$')
    expect(normalized).not.toContain('PGML comment')
  })

  it('tracks only an active multiline entry and preserves bounds including unfinished input', () => {
    expect(collectDbmlCompatibleMultilineEntries([
      '',
      'id [unique]',
      '  `lower(',
      'email)` [name: lower_email]',
      '',
      '`unfinished',
      'expression'
    ])).toEqual([
      { startIndex: 1, endIndex: 1, text: 'id [unique]' },
      { startIndex: 2, endIndex: 3, text: '`lower(\nemail)` [name: lower_email]' },
      { startIndex: 5, endIndex: 6, text: '`unfinished\nexpression' }
    ])
  })
})
