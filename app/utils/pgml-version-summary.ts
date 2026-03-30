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

type PgmlVersionDiffSectionSource = {
  getItems: (diff: PgmlSchemaDiff) => Array<{
    id: string
    kind: 'added' | 'modified' | 'removed'
    label: string
  }>
  label: string
}

const fullDocumentEditorDescription = 'Showing the full VersionSet document, including locked checkpoints and workspace metadata.'
const workspaceDocumentEditorDescription = 'Showing only the Workspace block from the VersionSet document so you can inspect draft metadata without the rest of history.'
const emptyCompareDeltaDescription = 'No visible delta in the selected comparison.'
const currentWorkspacePreviewLabel = 'Current workspace'
const selectedVersionPreviewLabel = 'Selected version'
const noWorkspaceBaseLabel = 'No locked base version yet.'
const pendingCheckpointWorkspaceStatus = 'Draft changes are waiting to be checkpointed.'
const syncedWorkspaceStatus = 'Draft matches the current locked base version.'
const documentViewReadOnlyLabel = 'Document view'
const versionPreviewReadOnlyLabel = 'Version preview'
const genericReadOnlyLabel = 'Read only'
const versionPreviewDescriptionSuffix = 'as a locked snapshot preview. Restore it to the workspace if you want to edit from it.'
const workspaceEditorDescription = 'Editing the current workspace snapshot. Checkpoint it when you want to lock a version into the history.'

const buildCountLabel = (count: number, singularLabel: string, pluralLabel?: string) => {
  return `${count} ${count === 1 ? singularLabel : pluralLabel || `${singularLabel}s`}`
}

const buildChangedSectionCount = (
  diffSections: PgmlVersionDiffSection[],
  layoutChanged: number
) => {
  return diffSections.length + (layoutChanged > 0 ? 1 : 0)
}

const versionDiffSectionSources: PgmlVersionDiffSectionSource[] = [
  {
    getItems: diff => diff.tables,
    label: 'Tables'
  },
  {
    getItems: diff => diff.columns,
    label: 'Columns'
  },
  {
    getItems: diff => diff.references,
    label: 'References'
  },
  {
    getItems: diff => diff.indexes,
    label: 'Indexes'
  },
  {
    getItems: diff => diff.constraints,
    label: 'Constraints'
  },
  {
    getItems: diff => diff.groups,
    label: 'Groups'
  },
  {
    // Functions, procedures, triggers, and sequences all land in the same UI
    // section because the compare surface treats them as migration-oriented
    // executable objects rather than separate layout entities.
    getItems: diff => [
      ...diff.functions,
      ...diff.procedures,
      ...diff.triggers,
      ...diff.sequences
    ],
    label: 'Routines'
  },
  {
    getItems: diff => diff.customTypes,
    label: 'Types'
  }
]

const buildDiffSectionEntries = (diff: PgmlSchemaDiff) => {
  return versionDiffSectionSources.map((entry) => {
    return {
      items: entry.getItems(diff),
      label: entry.label
    }
  })
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
    changedSectionCount: buildChangedSectionCount(input.diffSections, input.layoutChanged),
    targetLabel: input.compareTargetLabel || 'Current workspace'
  } satisfies PgmlVersionCompareSummary
}

export const buildPgmlPreviewTargetLabel = (input: {
  fallbackLabel?: string | null
  previewTargetId: string
  workspaceLabel?: string | null
}) => {
  // Preview targets can outlive renamed or removed versions, so the UI keeps a
  // friendly fallback instead of leaking raw ids back into the shell chrome.
  if (input.previewTargetId === 'workspace') {
    return input.workspaceLabel || currentWorkspacePreviewLabel
  }

  return input.fallbackLabel || selectedVersionPreviewLabel
}

export const buildPgmlWorkspaceBaseLabel = (input: {
  basedOnVersionId: string | null
  fallbackVersionId?: string | null
  versionLabel?: string | null
}) => {
  if (!input.basedOnVersionId) {
    return noWorkspaceBaseLabel
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
    ? pendingCheckpointWorkspaceStatus
    : syncedWorkspaceStatus
}

export const buildPgmlEditorReadOnlyLabel = (input: {
  isWorkspacePreview: boolean
  mode: 'document' | 'head'
}) => {
  if (input.mode === 'document') {
    return documentViewReadOnlyLabel
  }

  if (!input.isWorkspacePreview) {
    return versionPreviewReadOnlyLabel
  }

  return genericReadOnlyLabel
}

export const buildPgmlDocumentEditorModeDescription = (input?: {
  scope?: 'all' | 'version' | 'workspace'
  scopeLabel?: string | null
}) => {
  // Document mode has three different reading contexts. Centralizing this copy
  // keeps the editor framing consistent between workspace, version, and full
  // VersionSet scopes as the UI evolves.
  const scope = input?.scope || 'all'
  const scopeLabel = input?.scopeLabel || 'the selected Version block'

  if (scope === 'workspace') {
    return workspaceDocumentEditorDescription
  }

  if (scope === 'version') {
    return `Showing only ${scopeLabel} from the VersionSet document. Switch back to All VersionSet blocks to inspect the full history.`
  }

  return fullDocumentEditorDescription
}

export const buildPgmlVersionPreviewDescription = (previewLabel: string) => {
  return `Showing ${previewLabel} ${versionPreviewDescriptionSuffix}`
}

export const buildPgmlWorkspaceEditorDescription = () => {
  return workspaceEditorDescription
}

export const buildPgmlCompareDeltaDescription = (changedSectionCount: number) => {
  return changedSectionCount > 0
    ? `${buildCountLabel(changedSectionCount, 'changed area')} in the selected comparison.`
    : emptyCompareDeltaDescription
}

export const buildPgmlEmptyBaseCompareRelationshipSummary = () => {
  return 'Comparing the current workspace against an empty base.'
}

export const buildPgmlEmptyBaseToVersionCompareRelationshipSummary = (targetLabel: string) => {
  return `Comparing ${targetLabel} against an empty base.`
}

export const buildPgmlWorkspaceBaseCompareRelationshipSummary = (baseLabel: string) => {
  return `Comparing the current workspace against its locked base ${baseLabel}.`
}

export const buildPgmlWorkspaceCompareRelationshipSummary = (baseLabel: string) => {
  return `Comparing the current workspace against ${baseLabel}.`
}

export const buildPgmlWorkspaceAsBaseCompareRelationshipSummary = (targetLabel: string) => {
  return `Comparing ${targetLabel} against the current workspace.`
}

export const buildPgmlSelfCompareRelationshipSummary = (label: string) => {
  return `Comparing ${label} against itself.`
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
