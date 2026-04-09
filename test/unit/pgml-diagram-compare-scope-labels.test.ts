import { describe, expect, it } from 'vitest'

import {
  buildPgmlDiagramCompareScopeChangeCountLabel,
  buildPgmlDiagramCompareScopeSummary,
  getPgmlDiagramCompareEntityKindLabel,
  getPgmlDiagramCompareGroupedScopeKindLabel,
  type PgmlDiagramCompareEntry
} from '../../app/utils/pgml-diagram-compare'

const buildCompareEntry = (
  overrides: Partial<PgmlDiagramCompareEntry>
): PgmlDiagramCompareEntry => {
  return {
    afterSnapshot: null,
    baseNodeIds: [],
    beforeSnapshot: null,
    changeKind: 'modified',
    changedFields: [],
    description: 'Changed entity.',
    entityKind: 'table',
    fields: [],
    id: 'entry',
    label: 'entry',
    rowKey: null,
    scopeId: 'scope',
    scopeKind: 'standalone',
    scopeLabel: 'scope',
    selectionCandidates: [],
    sourceRange: null,
    targetNodeIds: [],
    ...overrides
  }
}

describe('PGML diagram compare scope labels', () => {
  it('distinguishes grouped table scopes from actual table entries', () => {
    expect(getPgmlDiagramCompareGroupedScopeKindLabel('table')).toBe('Table scope')
    expect(getPgmlDiagramCompareEntityKindLabel('table')).toBe('Table')
    expect(buildPgmlDiagramCompareScopeChangeCountLabel(20)).toBe('20 scoped changes')
  })

  it('summarizes grouped table scope changes as contained child changes', () => {
    const entries: PgmlDiagramCompareEntry[] = [
      buildCompareEntry({
        entityKind: 'table'
      }),
      ...Array.from({ length: 13 }, (_, index) => {
        return buildCompareEntry({
          entityKind: 'column',
          id: `column:${index}`
        })
      }),
      ...Array.from({ length: 2 }, (_, index) => {
        return buildCompareEntry({
          entityKind: 'reference',
          id: `reference:${index}`
        })
      }),
      ...Array.from({ length: 2 }, (_, index) => {
        return buildCompareEntry({
          entityKind: 'index',
          id: `index:${index}`
        })
      }),
      ...Array.from({ length: 2 }, (_, index) => {
        return buildCompareEntry({
          entityKind: 'constraint',
          id: `constraint:${index}`
        })
      })
    ]

    expect(buildPgmlDiagramCompareScopeSummary(entries)).toBe(
      'Includes 1 table change, 13 column changes, 2 reference changes, 2 index changes, and 2 constraint changes.'
    )
  })
})
