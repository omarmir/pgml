import { describe, expect, it } from 'vitest'

import { normalizeExecutableSqlText } from '../../app/utils/pgml-executable-sql'

describe('executable SQL lexical normalization', () => {
  it('preserves escaped quotes and comment markers inside quoted values', () => {
    const source = `SELECT "A""B", 'It''s /* literal */', '-- text' -- ignored
      FROM public.t /* outer /* nested */ comment */ WHERE id = 1`

    expect(normalizeExecutableSqlText(source))
      .toBe(`select "A""B", 'It''s /* literal */', '-- text' from public.t where id = 1`)
  })

  it('normalizes dollar tags while keeping quoted SQL content intact', () => {
    expect(normalizeExecutableSqlText(`CREATE FUNCTION f() RETURNS text AS $fn$
      SELECT 'A,--B'; /* ignored */
    $fn$ LANGUAGE SQL;`))
      .toBe(`create function f() returns text as $body$select 'A,--B';$body$ language sql;`)
  })

  it('retains the existing unfinished dollar-body normalization', () => {
    expect(normalizeExecutableSqlText('SELECT $tag$ A + 1'))
      .toBe('select $body$a + 1$body$')
  })

  it.each([null, undefined, '', '   '])('returns null for absent SQL %s', (source) => {
    expect(normalizeExecutableSqlText(source)).toBeNull()
  })
})
