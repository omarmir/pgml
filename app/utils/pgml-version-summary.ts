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

const buildCountLabel = (count: number, singularLabel: string, pluralLabel?: string) => {
  return `${count} ${count === 1 ? singularLabel : pluralLabel || `${singularLabel}s`}`
}

const buildDiffSectionEntries = (diff: PgmlSchemaDiff) => {
  return [
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
}

const buildVersionDiffSection = (entry: {
  items: Array<{
    id: string
    kind: 'added' | 'modified' | 'removed'
    label: string
  }>
  label: string
}) => {
  return {
    count: entry.items.length,
    items: entry.items.map((item) => {
      return {
        id: item.id,
        kind: item.kind,
        label: item.label
      }
    }),
    label: entry.label
  } satisfies PgmlVersionDiffSection
}

export const buildPgmlVersionDiffSections = (diff: PgmlSchemaDiff) => {
  return buildDiffSectionEntries(diff).reduce<PgmlVersionDiffSection[]>((sections, entry) => {
    if (entry.items.length === 0) {
      return sections
    }

    sections.push(buildVersionDiffSection(entry))

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

export const buildPgmlWorkspaceStatus = (input: {
  canCheckpoint: boolean
}) => {
  return input.canCheckpoint
    ? 'Draft changes are waiting to be checkpointed.'
    : 'Draft matches the current locked base version.'
}

export const buildPgmlEditorReadOnlyLabel = (input: {
  isWorkspacePreview: boolean
  mode: 'document' | 'head'
}) => {
  if (input.mode === 'document') {
    return 'Document view'
  }

  if (!input.isWorkspacePreview) {
    return 'Version preview'
  }

  return 'Read only'
}

export const buildPgmlDocumentEditorModeDescription = (input?: {
  scope?: 'all' | 'version' | 'workspace'
  scopeLabel?: string | null
}) => {
  if (input?.scope === 'workspace') {
    return 'Showing only the Workspace block from the VersionSet document so you can inspect draft metadata without the rest of history.'
  }

  if (input?.scope === 'version') {
    return `Showing only ${input.scopeLabel || 'the selected Version block'} from the VersionSet document. Switch back to All VersionSet blocks to inspect the full history.`
  }

  return 'Showing the full VersionSet document, including locked checkpoints and workspace metadata.'
}

export const buildPgmlVersionPreviewDescription = (previewLabel: string) => {
  return `Showing ${previewLabel} as a locked snapshot preview. Restore it to the workspace if you want to edit from it.`
}

export const buildPgmlWorkspaceEditorDescription = () => {
  return 'Editing the current workspace snapshot. Checkpoint it when you want to lock a version into the history.'
}

export const buildPgmlCompareDeltaDescription = (changedSectionCount: number) => {
  return changedSectionCount > 0
    ? `${buildCountLabel(changedSectionCount, 'changed area')} in the selected comparison.`
    : 'No visible delta in the selected comparison.'
}

export const buildPgmlEmptyBaseCompareRelationshipSummary = () => {
  return 'Comparing the current workspace against an empty base.'
}

export const buildPgmlWorkspaceBaseCompareRelationshipSummary = (baseLabel: string) => {
  return `Comparing the current workspace against its locked base ${baseLabel}.`
}

export const buildPgmlWorkspaceCompareRelationshipSummary = (baseLabel: string) => {
  return `Comparing the current workspace against ${baseLabel}.`
}

export const buildPgmlInvalidCompareRelationshipSummary = () => {
  return 'Select a valid base and target to compare version history.'
}

export const buildPgmlDirectIncrementCompareRelationshipSummary = (
  targetLabel: string,
  baseLabel: string
) => {
  return `${targetLabel} increments directly from ${baseLabel}.`
}

export const buildPgmlDivergedCompareRelationshipSummary = (commonAncestorLabel: string) => {
  return `Selected versions diverge from ${commonAncestorLabel}.`
}

export const buildPgmlNoCommonAncestorCompareRelationshipSummary = () => {
  return 'Selected versions do not share a common recorded ancestor.'
}
