import { describe, expect, it } from 'vitest'
import {
  buildPgmlCompareDiffLines,
  getPgmlCompareDiffPrefixLabel
} from '../../app/utils/pgml-compare-diff'

describe('pgml compare diff', () => {
  it('builds unified diff lines for changed text blocks', () => {
    expect(buildPgmlCompareDiffLines(`[
  "not null"
]`, `[
  "not null",
  "ref: > public.agency_profile.id",
  "delete: restrict"
]`)).toEqual([
      {
        content: '[',
        key: 'compare-diff-line:0',
        kind: 'context',
        prefix: ' '
      },
      {
        content: '  "not null",',
        key: 'compare-diff-line:1',
        kind: 'context',
        prefix: ' '
      },
      {
        content: '  "ref: > public.agency_profile.id",',
        key: 'compare-diff-line:2',
        kind: 'added',
        prefix: '+'
      },
      {
        content: '  "delete: restrict"',
        key: 'compare-diff-line:3',
        kind: 'added',
        prefix: '+'
      },
      {
        content: ']',
        key: 'compare-diff-line:4',
        kind: 'context',
        prefix: ' '
      }
    ])
  })

  it('marks removed lines when values disappear from the target block', () => {
    expect(buildPgmlCompareDiffLines(`{
  "ownedBy": [
    "public.common_approval"
  ],
  "reads": []
}`, `{
  "ownedBy": [],
  "reads": []
}`)).toEqual([
      {
        content: '{',
        key: 'compare-diff-line:0',
        kind: 'context',
        prefix: ' '
      },
      {
        content: '  "ownedBy": [',
        key: 'compare-diff-line:1',
        kind: 'removed',
        prefix: '-'
      },
      {
        content: '    "public.common_approval"',
        key: 'compare-diff-line:2',
        kind: 'removed',
        prefix: '-'
      },
      {
        content: '  ],',
        key: 'compare-diff-line:3',
        kind: 'removed',
        prefix: '-'
      },
      {
        content: '  "ownedBy": [],',
        key: 'compare-diff-line:4',
        kind: 'added',
        prefix: '+'
      },
      {
        content: '  "reads": []',
        key: 'compare-diff-line:5',
        kind: 'context',
        prefix: ' '
      },
      {
        content: '}',
        key: 'compare-diff-line:6',
        kind: 'context',
        prefix: ' '
      }
    ])
  })

  it('renders explicit side labels for compare diff prefixes', () => {
    expect(getPgmlCompareDiffPrefixLabel('removed', 'EGCS5', 'GCS')).toBe('Only in EGCS5')
    expect(getPgmlCompareDiffPrefixLabel('added', 'EGCS5', 'GCS')).toBe('Only in GCS')
    expect(getPgmlCompareDiffPrefixLabel('context', 'EGCS5', 'GCS')).toBe('')
  })
})
