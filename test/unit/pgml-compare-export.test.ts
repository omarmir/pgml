import { describe, expect, it } from 'vitest'

import {
  buildPgmlCompareHtmlExport,
  buildPgmlCompareMarkdownExport,
  type PgmlCompareExportInput
} from '../../app/utils/pgml-compare-export'
import type { PgmlDiagramCompareEntry } from '../../app/utils/pgml-diagram-compare'

const buildCompareEntry = (input: Partial<PgmlDiagramCompareEntry> & Pick<PgmlDiagramCompareEntry, 'changeKind' | 'entityKind' | 'id' | 'label'>) => {
  return {
    afterSnapshot: null,
    baseNodeIds: [],
    beforeSnapshot: null,
    changedFields: [],
    description: `${input.label} changed`,
    fields: [],
    noiseKinds: [],
    rowKey: null,
    scopeId: 'standalone:test',
    scopeKind: 'standalone',
    scopeLabel: input.label,
    selectionCandidates: [],
    sourceRange: null,
    targetNodeIds: [],
    ...input
  } satisfies PgmlDiagramCompareEntry
}

const buildCompareExportInput = (): PgmlCompareExportInput => {
  return {
    baseLabel: 'Baseline',
    comparisonLabel: 'Implemented scope',
    contextEntries: [
      buildCompareEntry({
        changeKind: 'modified',
        entityKind: 'column',
        id: 'column:public.users::email',
        label: 'public.users.email'
      })
    ],
    detailViewMode: 'structured',
    entityKindFilters: ['table', 'column'],
    entries: [
      buildCompareEntry({
        changeKind: 'added',
        entityKind: 'table',
        id: 'table:public.audit_log',
        label: 'public.audit_log'
      }),
      buildCompareEntry({
        afterSnapshot: '{\n  "type": "varchar"\n}',
        beforeSnapshot: '{\n  "type": "text"\n}',
        changeKind: 'modified',
        changedFields: ['type'],
        description: 'Changed column public.users.email.',
        entityKind: 'column',
        fields: [
          {
            after: 'varchar',
            before: 'text',
            id: 'type',
            label: 'type'
          }
        ],
        id: 'column:public.users::email',
        label: 'public.users.email'
      })
    ],
    excludedLabels: ['Function public.refresh_users'],
    excludedSummary: '1 excluded compare entity',
    exportedAtLabel: 'Apr 13, 2026, 1:30 p.m.',
    hiddenExcludedLabelCount: 0,
    noiseFilters: {
      hideDefaults: true,
      hideMetadata: true,
      hideOrderOnly: false
    },
    relationshipSummary: 'Current workspace increments directly from Baseline.',
    searchQuery: 'users',
    targetLabel: 'Current workspace',
    visibleChangeFilter: 'all'
  }
}

describe('PGML compare exports', () => {
  it('builds a flat grouped HTML export that reflects the visible compare state', () => {
    const html = buildPgmlCompareHtmlExport(buildCompareExportInput())

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('Implemented scope')
    expect(html).toContain('Baseline to Current workspace')
    expect(html).toContain('1 excluded compare entity')
    expect(html).toContain('Hide defaults, Hide metadata')
    expect(html).toContain('Search')
    expect(html).toContain('users')
    expect(html).toContain('Table')
    expect(html).toContain('Column')
    expect(html).toContain('public.audit_log')
    expect(html).toContain('public.users.email')
    expect(html).toContain('Structured diff')
    expect(html).toContain('Current compare state')
    expect(html).toContain('Entity kinds')
    expect(html).not.toContain('entry-card')
    expect(html).not.toContain('hero-pill')
    expect(html).not.toContain('Snapshot diff')
  })

  it('builds a grouped Markdown export that reflects the visible compare state', () => {
    const markdown = buildPgmlCompareMarkdownExport(buildCompareExportInput())

    expect(markdown).toContain('# PGML Compare')
    expect(markdown).toContain('Filtered PGML schema comparison export.')
    expect(markdown).toContain('## Context')
    expect(markdown).toContain('- comparison: Implemented scope')
    expect(markdown).toContain('- base: Baseline')
    expect(markdown).toContain('- target: Current workspace')
    expect(markdown).toContain('- exclusions: 1 excluded compare entity')
    expect(markdown).toContain('public.users.email')
    expect(markdown).not.toContain('public.users\\_email')
    expect(markdown).toContain('## Changes')
    expect(markdown).toContain('### Table (1)')
    expect(markdown).toContain('### Column (1)')
    expect(markdown).toContain('- Modified public.users.email')
    expect(markdown).toContain('  - fields: type')
    expect(markdown).toContain('  - type: text -> varchar')
    expect(markdown).not.toContain('#### Structured diff')
    expect(markdown).not.toContain('#### Snapshot diff')
  })

  it('renders an empty-state export when no visible compare entries remain', () => {
    const html = buildPgmlCompareHtmlExport({
      baseLabel: 'Baseline',
      comparisonLabel: 'Current comparison',
      detailViewMode: 'both',
      entityKindFilters: [],
      entries: [],
      exportedAtLabel: 'Apr 13, 2026, 1:30 p.m.',
      noiseFilters: {
        hideDefaults: true,
        hideMetadata: true,
        hideOrderOnly: true
      },
      targetLabel: 'Current workspace',
      visibleChangeFilter: 'added'
    })

    expect(html).toContain('No visible compare entries')
    expect(html).toContain('Added only')
  })

  it('renders an empty-state Markdown export when no visible compare entries remain', () => {
    const markdown = buildPgmlCompareMarkdownExport({
      baseLabel: 'Baseline',
      comparisonLabel: 'Current comparison',
      detailViewMode: 'both',
      entityKindFilters: [],
      entries: [],
      exportedAtLabel: 'Apr 13, 2026, 1:30 p.m.',
      noiseFilters: {
        hideDefaults: true,
        hideMetadata: true,
        hideOrderOnly: true
      },
      targetLabel: 'Current workspace',
      visibleChangeFilter: 'added'
    })

    expect(markdown).toContain('## Changes')
    expect(markdown).toContain('No visible compare entries.')
    expect(markdown).toContain('- change filter: Added only')
  })
})
