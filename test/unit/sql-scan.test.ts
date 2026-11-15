import { describe, expect, it } from 'vitest'

import { readBalancedSection, splitTopLevelSqlList } from '../../app/utils/sql-scan'

describe('shared SQL quote-aware readers', () => {
  it('splits only commas outside quotes and nested delimiters without changing literal bytes', () => {
    const entries = [
      'tenant_id',
      'coalesce(email, \'a,b\')',
      '"name,with""quotes"',
      '$body$dollar,body$body$',
      '\'it\'\'s,a value\'',
      'ARRAY[1, 2]',
      '{first, second}'
    ]

    expect(splitTopLevelSqlList(` , ${entries.join(', ')}, `)).toEqual(entries)
  })

  it('retains unfinished quoted input as one trailing entry', () => {
    expect(splitTopLevelSqlList('id, \'not,finished')).toEqual(['id', '\'not,finished'])
  })

  it('reads nested sections while ignoring quoted closing delimiters', () => {
    const content = `lower(email), 'it''s)', "a)""b", $tag$)$tag$, (nested)`
    const source = `prefix(${content}) suffix`

    expect(readBalancedSection(source, 6)).toEqual({ content, endIndex: 7 + content.length })
  })

  it('keeps custom delimiter support and returns null when a section stays open', () => {
    expect(readBalancedSection('{one, {two}} tail', 0, { open: '{', close: '}' }))
      .toEqual({ content: 'one, {two}', endIndex: 11 })
    expect(readBalancedSection('(\'unfinished)', 0)).toBeNull()
    expect(readBalancedSection('(open', 0)).toBeNull()
  })
})
