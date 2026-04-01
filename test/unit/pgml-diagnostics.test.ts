import { describe, expect, it } from 'vitest'

import { groupPgmlDiagnostics } from '../../app/utils/pgml-diagnostics'

describe('PGML diagnostics grouping', () => {
  it('groups identical messages and deduplicates their line entries', () => {
    const groups = groupPgmlDiagnostics([
      {
        code: 'pgml/table-entry',
        from: 10,
        line: 3,
        message: 'Table entries must be columns.',
        severity: 'error',
        to: 14
      },
      {
        code: 'pgml/table-entry',
        from: 30,
        line: 5,
        message: 'Table entries must be columns.',
        severity: 'error',
        to: 34
      },
      {
        code: 'pgml/column-duplicate',
        from: 50,
        line: 8,
        lines: [7, 8],
        message: 'Duplicate column `id`.',
        severity: 'error',
        to: 54
      }
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual(expect.objectContaining({
      key: 'error:pgml/table-entry:Table entries must be columns.',
      message: 'Table entries must be columns.'
    }))
    expect(groups[0]?.lineEntries.map(entry => entry.line)).toEqual([3, 5])
    expect(groups[1]?.lineEntries.map(entry => entry.line)).toEqual([7, 8])
  })
})
