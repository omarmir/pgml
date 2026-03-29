import type { PgmlSchemaDiff } from './pgml-diff'

export type PgmlVersionDiffSection = {
  count: number
  items: Array<{
    id: string
    kind: 'added' | 'modified' | 'removed'
    label: string
  }>
  label: string
}

export type PgmlVersionCompareSummary = {
  baseLabel: string
  changedSectionCount: number
  targetLabel: string
}

export const buildPgmlVersionDiffSections = (diff: PgmlSchemaDiff) => {
  const sectionEntries = [
    {
      items: diff.tables,
      label: 'Tables'
    },
    {
      items: diff.columns,
      label: 'Columns'
    },
    {
      items: diff.references,
      label: 'References'
    },
    {
      items: diff.indexes,
      label: 'Indexes'
    },
    {
      items: diff.constraints,
      label: 'Constraints'
    },
    {
      items: diff.groups,
      label: 'Groups'
    },
    {
      items: [
        ...diff.functions,
        ...diff.procedures,
        ...diff.triggers,
        ...diff.sequences
      ],
      label: 'Routines'
    },
    {
      items: diff.customTypes,
      label: 'Types'
    }
  ]

  return sectionEntries.reduce<PgmlVersionDiffSection[]>((sections, entry) => {
    if (entry.items.length === 0) {
      return sections
    }

    sections.push({
      count: entry.items.length,
      items: entry.items.map((item) => {
        return {
          id: item.id,
          kind: item.kind,
          label: item.label
        }
      }),
      label: entry.label
    })

    return sections
  }, [])
}

export const buildPgmlVersionCompareSummary = (input: {
  compareBaseLabel?: string | null
  compareTargetLabel?: string | null
  diffSections: PgmlVersionDiffSection[]
  layoutChanged: number
}) => {
  return {
    baseLabel: input.compareBaseLabel || 'Empty schema',
    changedSectionCount: input.diffSections.length + (input.layoutChanged > 0 ? 1 : 0),
    targetLabel: input.compareTargetLabel || 'Current workspace'
  } satisfies PgmlVersionCompareSummary
}

export const buildPgmlPreviewTargetLabel = (input: {
  fallbackLabel?: string | null
  previewTargetId: string
  workspaceLabel?: string | null
}) => {
  if (input.previewTargetId === 'workspace') {
    return input.workspaceLabel || 'Current workspace'
  }

  return input.fallbackLabel || 'Selected version'
}

export const buildPgmlWorkspaceBaseLabel = (input: {
  basedOnVersionId: string | null
  fallbackVersionId?: string | null
  versionLabel?: string | null
}) => {
  if (!input.basedOnVersionId) {
    return 'No locked base version yet.'
  }

  if (input.versionLabel) {
    return `Incrementing from ${input.versionLabel}.`
  }

  return `Incrementing from ${input.fallbackVersionId || input.basedOnVersionId}.`
}
