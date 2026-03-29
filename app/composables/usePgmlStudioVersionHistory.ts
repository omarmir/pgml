import type { ComputedRef, Ref } from 'vue'
import {
  buildPgmlDirectIncrementCompareRelationshipSummary,
  buildPgmlDivergedCompareRelationshipSummary,
  buildPgmlEmptyBaseCompareRelationshipSummary,
  buildPgmlInvalidCompareRelationshipSummary,
  buildPgmlNoCommonAncestorCompareRelationshipSummary,
  buildPgmlWorkspaceCompareRelationshipSummary,
  buildPgmlWorkspaceBaseCompareRelationshipSummary
} from '~/utils/pgml-version-summary'
import {
  buildPgmlCheckpointName,
  canCreatePgmlCheckpoint,
  clonePgmlVersionSetDocument,
  createInitialPgmlDocument,
  createPgmlVersionFromWorkspace,
  buildPgmlVersionLineageLabel,
  getPgmlChildVersions,
  getPgmlBranchRootLabel,
  getPgmlBranchRootId,
  getLatestPgmlVersion,
  getLatestPgmlVersionByRole,
  getPgmlBranchLeafVersionCount,
  getPgmlBranchMaxDepth,
  getPgmlBranchVersionCount,
  getPgmlDescendantVersionCount,
  getPgmlLeafVersions,
  getPgmlRootVersions,
  getLatestPgmlLeafVersion,
  getLatestPgmlLeafVersionByRole,
  hasPgmlVersions,
  hasPgmlVersionRole,
  getPgmlNearestCommonAncestor,
  getPgmlVersionById,
  getPgmlVersionAncestorCount,
  getPgmlVersionDepth,
  getPgmlVersionLineageIds,
  getPgmlSiblingVersionCount,
  getPgmlWorkspaceBaseVersion,
  isPgmlLeafVersion,
  getPgmlDocumentPreviewSource,
  isPgmlWorkspaceDirty,
  parsePgmlDocument,
  replacePgmlWorkspaceFromSnapshot,
  serializePgmlDocument,
  type PgmlVersionDocumentBlock,
  type PgmlVersionRole,
  type PgmlVersionSetDocument
} from '~/utils/pgml-document'
import { stripPgmlPropertiesBlocks } from '~/utils/pgml'

export type PgmlVersionPreviewTarget = 'workspace' | string

export const versionedDocumentEditorModeValues = ['head', 'document'] as const

export type PgmlVersionedDocumentEditorMode = typeof versionedDocumentEditorModeValues[number]

const normalizeSnapshotSource = (value: string, includeLayout: boolean) => {
  return includeLayout ? value.trim() : stripPgmlPropertiesBlocks(value).trim()
}

const buildDefaultCompareBaseId = (document: PgmlVersionSetDocument) => {
  if (document.workspace.basedOnVersionId) {
    return document.workspace.basedOnVersionId
  }

  return getLatestPgmlVersion(document)?.id || null
}

const buildDefaultCompareTargetId = (document: PgmlVersionSetDocument) => {
  if (document.workspace.snapshot.source.trim().length > 0) {
    return 'workspace'
  }

  return document.versions.at(-1)?.id || 'workspace'
}

const isValidVersionTargetId = (
  document: PgmlVersionSetDocument,
  targetId: string | null
) => {
  if (!targetId) {
    return false
  }

  return targetId === 'workspace' || getPgmlVersionById(document, targetId) !== null
}

const buildWorkspaceSyncedDocument = (
  document: PgmlVersionSetDocument,
  source: string,
  options?: {
    includeLayout?: boolean
    updatedAt?: string | null
  }
) => {
  // The source editor always owns the live workspace text, so any serialized or
  // checkpointed document must first be rebuilt from that head snapshot.
  return replacePgmlWorkspaceFromSnapshot(document, {
    basedOnVersionId: document.workspace.basedOnVersionId,
    source: normalizeSnapshotSource(source, options?.includeLayout ?? true),
    updatedAt: options?.updatedAt === undefined
      ? document.workspace.updatedAt
      : options.updatedAt
  })
}

const normalizePreviewTargetId = (
  document: PgmlVersionSetDocument,
  previewTargetId: PgmlVersionPreviewTarget
) => {
  return isValidVersionTargetId(document, previewTargetId) ? previewTargetId : 'workspace'
}

const normalizeCompareBaseSelection = (
  document: PgmlVersionSetDocument,
  baseId: string | null
) => {
  if (baseId && !getPgmlVersionById(document, baseId)) {
    return buildDefaultCompareBaseId(document)
  }

  return baseId
}

const normalizeCompareTargetSelection = (
  document: PgmlVersionSetDocument,
  targetId: string
) => {
  return isValidVersionTargetId(document, targetId)
    ? targetId
    : buildDefaultCompareTargetId(document)
}

const buildVersionHistoryItem = (
  document: PgmlVersionSetDocument,
  version: PgmlVersionDocumentBlock,
  options: {
    latestDesignVersionId: string | null
    latestImplementationVersionId: string | null
    latestOverallVersionId: string | null
  }
) => {
  return {
    ancestorCount: getPgmlVersionAncestorCount(document, version.id),
    branchLeafCount: getPgmlBranchLeafVersionCount(document, version.id),
    branchMaxDepth: getPgmlBranchMaxDepth(document, version.id),
    branchVersionCount: getPgmlBranchVersionCount(document, version.id),
    childCount: getPgmlChildVersions(document, version.id).length,
    branchRootId: getPgmlBranchRootId(document, version.id),
    branchRootLabel: getPgmlBranchRootLabel(document, version.id),
    descendantCount: getPgmlDescendantVersionCount(document, version.id),
    depth: getPgmlVersionDepth(document, version.id),
    ...version,
    parentVersionLabel: version.parentVersionId
      ? (getPgmlVersionById(document, version.parentVersionId)?.name || version.parentVersionId)
      : null,
    isLeaf: isPgmlLeafVersion(document, version.id),
    isLatestByRole: version.id === (
      version.role === 'design'
        ? options.latestDesignVersionId
        : options.latestImplementationVersionId
    ),
    isLatestOverall: version.id === options.latestOverallVersionId,
    isRoot: version.parentVersionId === null,
    siblingCount: getPgmlSiblingVersionCount(document, version.id),
    isWorkspaceBase: document.workspace.basedOnVersionId === version.id,
    lineageIds: getPgmlVersionLineageIds(document, version.id),
    lineageLabel: buildPgmlVersionLineageLabel(document, version.id)
  }
}

const buildCompareRelationshipSummary = (input: {
  compareBaseVersion: PgmlVersionDocumentBlock | null
  compareTargetId: string
  compareTargetVersion: PgmlVersionDocumentBlock | null
  document: PgmlVersionSetDocument
  workspaceBaseVersion: PgmlVersionDocumentBlock | null
}) => {
  // Compare copy deliberately distinguishes the common workspace workflow
  // (current draft vs locked base) from version-to-version lineage comparisons.
  if (input.compareTargetId === 'workspace') {
    if (!input.compareBaseVersion) {
      return buildPgmlEmptyBaseCompareRelationshipSummary()
    }

    if (input.compareBaseVersion.id === input.workspaceBaseVersion?.id) {
      return buildPgmlWorkspaceBaseCompareRelationshipSummary(
        input.compareBaseVersion.name || input.compareBaseVersion.id
      )
    }

    return buildPgmlWorkspaceCompareRelationshipSummary(
      input.compareBaseVersion.name || input.compareBaseVersion.id
    )
  }

  if (!input.compareBaseVersion || !input.compareTargetVersion) {
    return buildPgmlInvalidCompareRelationshipSummary()
  }

  if (input.compareTargetVersion.parentVersionId === input.compareBaseVersion.id) {
    return buildPgmlDirectIncrementCompareRelationshipSummary(
      input.compareTargetVersion.name || input.compareTargetVersion.id,
      input.compareBaseVersion.name || input.compareBaseVersion.id
    )
  }

  const commonAncestor = getPgmlNearestCommonAncestor(
    input.document,
    input.compareBaseVersion.id,
    input.compareTargetVersion.id
  )

  if (commonAncestor) {
    return buildPgmlDivergedCompareRelationshipSummary(commonAncestor.name || commonAncestor.id)
  }

  return buildPgmlNoCommonAncestorCompareRelationshipSummary()
}

export const usePgmlStudioVersionHistory = (
  input: {
    documentName: ComputedRef<string>
    source: Ref<string>
  }
) => {
  const document: Ref<PgmlVersionSetDocument> = ref(createInitialPgmlDocument({
    name: input.documentName.value,
    workspaceSource: input.source.value
  }))
  const previewTargetId: Ref<PgmlVersionPreviewTarget> = ref('workspace')
  const editorMode: Ref<PgmlVersionedDocumentEditorMode> = ref('head')
  const compareBaseId: Ref<string | null> = ref(null)
  const compareTargetId: Ref<string> = ref('workspace')

  const syncWorkspaceSource = () => {
    document.value = buildWorkspaceSyncedDocument(document.value, input.source.value)
  }

  const setDocument = (nextDocument: PgmlVersionSetDocument) => {
    document.value = {
      ...nextDocument,
      name: input.documentName.value
    }
    input.source.value = nextDocument.workspace.snapshot.source
    previewTargetId.value = 'workspace'
    compareBaseId.value = buildDefaultCompareBaseId(nextDocument)
    compareTargetId.value = buildDefaultCompareTargetId(nextDocument)
  }

  const normalizeSelectionState = () => {
    // File loads, restores, and imports can invalidate UI selections; clamp
    // every derived id back onto the current document before the UI renders it.
    previewTargetId.value = normalizePreviewTargetId(document.value, previewTargetId.value)
    compareBaseId.value = normalizeCompareBaseSelection(document.value, compareBaseId.value)
    compareTargetId.value = normalizeCompareTargetSelection(document.value, compareTargetId.value)
  }

  const resetDocument = (workspaceSource = '') => {
    setDocument(createInitialPgmlDocument({
      name: input.documentName.value,
      workspaceSource
    }))
  }

  const loadDocument = (rawText: string) => {
    const normalizedSource = rawText.trim()
    let parsedDocument: PgmlVersionSetDocument

    if (normalizedSource.length === 0 || !normalizedSource.startsWith('VersionSet')) {
      parsedDocument = createInitialPgmlDocument({
        name: input.documentName.value,
        workspaceSource: rawText
      })
    } else {
      parsedDocument = parsePgmlDocument(rawText)
    }

    setDocument({
      ...parsedDocument,
      name: input.documentName.value
    })
  }

  const versions = computed(() => document.value.versions)
  const hasVersions = computed(() => hasPgmlVersions(document.value))
  const hasDesignVersions = computed(() => hasPgmlVersionRole(document.value, 'design'))
  const hasImplementationVersions = computed(() => hasPgmlVersionRole(document.value, 'implementation'))
  const latestLeafVersion = computed(() => getLatestPgmlLeafVersion(document.value))
  const latestLeafDesignVersion = computed(() => getLatestPgmlLeafVersionByRole(document.value, 'design'))
  const latestLeafImplementationVersion = computed(() => getLatestPgmlLeafVersionByRole(document.value, 'implementation'))
  const rootVersions = computed(() => getPgmlRootVersions(document.value))
  const leafVersions = computed(() => getPgmlLeafVersions(document.value))
  const workspaceBaseVersion = computed(() => getPgmlWorkspaceBaseVersion(document.value))
  const workspaceDirty = computed(() => isPgmlWorkspaceDirty(document.value))
  const canCheckpoint = computed(() => canCreatePgmlCheckpoint(document.value))
  const latestDesignVersion = computed(() => getLatestPgmlVersionByRole(document.value, 'design'))
  const latestImplementationVersion = computed(() => getLatestPgmlVersionByRole(document.value, 'implementation'))
  const latestOverallVersion = computed(() => getLatestPgmlVersion(document.value))
  const versionItems = computed(() => {
    return document.value.versions.map((version) => {
      return buildVersionHistoryItem(document.value, version, {
        latestDesignVersionId: latestDesignVersion.value?.id || null,
        latestImplementationVersionId: latestImplementationVersion.value?.id || null,
        latestOverallVersionId: latestOverallVersion.value?.id || null
      })
    })
  })
  const previewSource = computed(() => {
    if (previewTargetId.value === 'workspace') {
      return input.source.value
    }

    return getPgmlDocumentPreviewSource(document.value, {
      versionId: previewTargetId.value
    })
  })
  const versionedDocumentSource = computed(() => {
    const workingDocument = buildWorkspaceSyncedDocument(document.value, input.source.value)

    workingDocument.name = input.documentName.value

    return serializePgmlDocument(workingDocument)
  })
  const isWorkspacePreview = computed(() => previewTargetId.value === 'workspace')
  const compareBaseVersion = computed(() => {
    return getPgmlVersionById(document.value, compareBaseId.value)
  })
  const compareTargetVersion = computed<PgmlVersionDocumentBlock | null>(() => {
    if (compareTargetId.value === 'workspace') {
      return null
    }

    return getPgmlVersionById(document.value, compareTargetId.value)
  })
  const compareBaseSource = computed(() => {
    if (compareBaseId.value === 'workspace') {
      return input.source.value
    }

    return compareBaseVersion.value?.snapshot.source || ''
  })
  const compareTargetSource = computed(() => {
    return compareTargetVersion.value?.snapshot.source || input.source.value
  })
  const compareRelationshipSummary = computed(() => {
    return buildCompareRelationshipSummary({
      compareBaseVersion: compareBaseVersion.value,
      compareTargetId: compareTargetId.value,
      compareTargetVersion: compareTargetVersion.value,
      document: document.value,
      workspaceBaseVersion: workspaceBaseVersion.value
    })
  })

  watch(() => input.documentName.value, (nextName) => {
    document.value = {
      ...document.value,
      name: nextName
    }
  })

  watch(input.source, () => {
    syncWorkspaceSource()
    normalizeSelectionState()
  })

  const serializeCurrentDocument = (includeLayout: boolean) => {
    const workingDocument = clonePgmlVersionSetDocument(
      buildWorkspaceSyncedDocument(document.value, input.source.value, {
        includeLayout
      })
    )

    workingDocument.name = input.documentName.value
    workingDocument.versions = workingDocument.versions.map((version) => {
      return {
        ...version,
        snapshot: {
          source: normalizeSnapshotSource(version.snapshot.source, includeLayout)
        }
      }
    })

    return serializePgmlDocument(workingDocument)
  }

  const createCheckpoint = (inputOptions: {
    createdAt?: string
    includeLayout: boolean
    name: string
    role: PgmlVersionRole
  }) => {
    const createdAt = inputOptions.createdAt || new Date().toISOString()
    const workingDocument = buildWorkspaceSyncedDocument(document.value, input.source.value, {
      includeLayout: inputOptions.includeLayout,
      updatedAt: createdAt
    })
    const nextDocument = createPgmlVersionFromWorkspace(workingDocument, {
      createdAt,
      name: inputOptions.name.trim().length > 0
        ? inputOptions.name
        : buildPgmlCheckpointName(workingDocument, {
            createdAt,
            role: inputOptions.role
          }),
      role: inputOptions.role
    })

    setDocument(nextDocument)

    return nextDocument.versions.at(-1) || null
  }

  const replaceWorkspaceFromVersion = (versionId: string) => {
    const targetVersion = document.value.versions.find(version => version.id === versionId)

    if (!targetVersion) {
      return false
    }

    document.value = replacePgmlWorkspaceFromSnapshot(document.value, {
      basedOnVersionId: targetVersion.id,
      source: targetVersion.snapshot.source,
      updatedAt: new Date().toISOString()
    })
    input.source.value = targetVersion.snapshot.source
    previewTargetId.value = 'workspace'
    compareBaseId.value = targetVersion.parentVersionId
    compareTargetId.value = 'workspace'

    return true
  }

  const replaceWorkspaceFromImportedSnapshot = (inputOptions: {
    basedOnVersionId: string
    includeLayout: boolean
    source: string
  }) => {
    if (!getPgmlVersionById(document.value, inputOptions.basedOnVersionId)) {
      return false
    }

    document.value = replacePgmlWorkspaceFromSnapshot(document.value, {
      basedOnVersionId: inputOptions.basedOnVersionId,
      source: normalizeSnapshotSource(inputOptions.source, inputOptions.includeLayout),
      updatedAt: new Date().toISOString()
    })
    input.source.value = document.value.workspace.snapshot.source
    previewTargetId.value = 'workspace'
    compareBaseId.value = inputOptions.basedOnVersionId
    compareTargetId.value = 'workspace'

    return true
  }

  const setPreviewTarget = (nextTargetId: PgmlVersionPreviewTarget) => {
    previewTargetId.value = normalizePreviewTargetId(document.value, nextTargetId)
  }

  const setCompareTargets = (inputOptions: {
    baseId: string | null
    targetId: string
  }) => {
    compareBaseId.value = inputOptions.baseId === null
      ? null
      : normalizeCompareBaseSelection(document.value, inputOptions.baseId)
    compareTargetId.value = normalizeCompareTargetSelection(document.value, inputOptions.targetId)
  }

  return {
    compareBaseId,
    compareBaseSource,
    compareBaseVersion,
    compareRelationshipSummary,
    compareTargetId,
    compareTargetSource,
    compareTargetVersion,
    canCheckpoint,
    createCheckpoint,
    document,
    editorMode,
    hasDesignVersions,
    hasImplementationVersions,
    hasVersions,
    isWorkspacePreview,
    loadDocument,
    leafVersions,
    previewSource,
    previewTargetId,
    replaceWorkspaceFromImportedSnapshot,
    replaceWorkspaceFromVersion,
    resetDocument,
    rootVersions,
    serializeCurrentDocument,
    setCompareTargets,
    setPreviewTarget,
    latestDesignVersion,
    latestLeafDesignVersion,
    latestLeafImplementationVersion,
    latestLeafVersion,
    latestImplementationVersion,
    versionItems,
    versionedDocumentSource,
    versions,
    workspaceBaseVersion,
    workspaceDirty
  }
}
