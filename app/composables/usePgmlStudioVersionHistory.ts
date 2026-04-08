import type { ComputedRef, Ref, ShallowRef } from 'vue'
import {
  buildPgmlDirectIncrementCompareRelationshipSummary,
  buildPgmlDivergedCompareRelationshipSummary,
  buildPgmlEmptyBaseCompareRelationshipSummary,
  buildPgmlEmptyBaseToVersionCompareRelationshipSummary,
  buildPgmlInvalidCompareRelationshipSummary,
  buildPgmlNoCommonAncestorCompareRelationshipSummary,
  buildPgmlSelfCompareRelationshipSummary,
  buildPgmlWorkspaceAsBaseCompareRelationshipSummary,
  buildPgmlWorkspaceCompareRelationshipSummary,
  buildPgmlWorkspaceBaseCompareRelationshipSummary
} from '~/utils/pgml-version-summary'
import {
  buildPgmlCheckpointName,
  canCreatePgmlCheckpoint,
  clonePgmlDocumentView,
  clonePgmlVersionSetDocument,
  createPgmlDocumentView,
  createInitialPgmlDocument,
  createPgmlVersionFromWorkspace,
  buildPgmlVersionLineageLabel,
  getPgmlDocumentBlockPreviewSource,
  getPgmlDocumentView,
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
  replacePgmlDocumentSchemaMetadata,
  replacePgmlWorkspaceFromSnapshot,
  serializePgmlDocumentScope,
  serializePgmlDocument,
  normalizePgmlDocumentEditorScope,
  getPgmlVersionDisplayLabel,
  getPgmlVersionRoleDisplayLabel,
  normalizePgmlSnapshotSource,
  type PgmlDocumentDiagramView,
  type PgmlVersionDocumentBlock,
  type PgmlDocumentEditorScope,
  type PgmlVersionRole,
  type PgmlVersionSetDocument
} from '~/utils/pgml-document'
import { clonePgmlCompareExclusions, stripPgmlPropertiesBlocks } from '~/utils/pgml'
import type { PgmlCompareExclusions, PgmlNodeProperties } from '~/utils/pgml'
import {
  clonePgmlDocumentSchemaMetadata,
  type PgmlDocumentSchemaMetadata
} from '~/utils/pgml-schema-metadata'

export type PgmlVersionPreviewTarget = 'workspace' | string

export const versionedDocumentEditorModeValues = ['head', 'document'] as const

export type PgmlVersionedDocumentEditorMode = typeof versionedDocumentEditorModeValues[number]

export type PgmlVersionedDocumentScopeItem = {
  label: string
  value: PgmlDocumentEditorScope
}

export type PgmlDiagramViewItem = {
  label: string
  value: string
}

export type PgmlDiagramViewSettings = {
  snapToGrid: boolean
  showExecutableObjects: boolean
  showRelationshipLines: boolean
  showTableFields: boolean
}

const normalizeSnapshotSource = (value: string, includeLayout: boolean) => {
  const normalizedSource = includeLayout ? value : stripPgmlPropertiesBlocks(value)

  return normalizePgmlSnapshotSource(normalizedSource)
}

const buildDefaultCompareBaseId = (document: PgmlVersionSetDocument) => {
  // Prefer the workspace base when it exists so compare opens on the most
  // common "locked predecessor -> current draft" workflow by default.
  if (document.workspace.basedOnVersionId) {
    return document.workspace.basedOnVersionId
  }

  return getLatestPgmlVersion(document)?.id || null
}

const buildDefaultCompareTargetId = (document: PgmlVersionSetDocument) => {
  // Empty workspaces are usually first-load or just-restored states, so the
  // most recent locked version is a better initial compare target in that case.
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
  const syncedDocument = replacePgmlWorkspaceFromSnapshot(document, {
    activeViewId: document.workspace.activeViewId,
    basedOnVersionId: document.workspace.basedOnVersionId,
    source: source,
    updatedAt: options?.updatedAt === undefined
      ? document.workspace.updatedAt
      : options.updatedAt,
    views: document.workspace.views
  })

  if (options?.includeLayout === false) {
    return {
      ...syncedDocument,
      versions: syncedDocument.versions.map((version) => {
        return {
          ...version,
          activeViewId: null,
          views: []
        }
      }),
      workspace: {
        ...syncedDocument.workspace,
        activeViewId: null,
        views: []
      }
    }
  }

  return syncedDocument
}

const normalizePreviewTargetId = (
  document: PgmlVersionSetDocument,
  previewTargetId: PgmlVersionPreviewTarget
) => {
  // Preview state should never strand the UI on a deleted or invalid version.
  return isValidVersionTargetId(document, previewTargetId) ? previewTargetId : 'workspace'
}

const normalizeCompareBaseSelection = (
  document: PgmlVersionSetDocument,
  baseId: string | null
) => {
  if (baseId === 'workspace') {
    return 'workspace'
  }

  if (baseId && !getPgmlVersionById(document, baseId)) {
    return buildDefaultCompareBaseId(document)
  }

  return baseId
}

const resolveVersionTargetSource = (input: {
  document: PgmlVersionSetDocument
  targetId: string
  workspaceSource: string
}) => {
  if (input.targetId === 'workspace') {
    return input.workspaceSource
  }

  return getPgmlDocumentPreviewSource(input.document, {
    versionId: input.targetId
  })
}

const normalizeCompareTargetSelection = (
  document: PgmlVersionSetDocument,
  targetId: string
) => {
  return isValidVersionTargetId(document, targetId)
    ? targetId
    : buildDefaultCompareTargetId(document)
}

const getVersionDisplayLabelById = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  // Scope selectors and relationship copy should show the same human-friendly
  // label regardless of whether they start from a concrete version or an id.
  if (!versionId) {
    return null
  }

  const version = getPgmlVersionById(document, versionId)

  return version ? getPgmlVersionDisplayLabel(version) : versionId
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
  const parentVersionLabel = getVersionDisplayLabelById(document, version.parentVersionId)

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
    parentVersionLabel,
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
  compareBaseId: string | null
  compareBaseVersion: PgmlVersionDocumentBlock | null
  compareTargetId: string
  compareTargetVersion: PgmlVersionDocumentBlock | null
  document: PgmlVersionSetDocument
  workspaceBaseVersion: PgmlVersionDocumentBlock | null
}) => {
  if (input.compareBaseId === null) {
    if (input.compareTargetId === 'workspace') {
      return buildPgmlEmptyBaseCompareRelationshipSummary()
    }

    if (!input.compareTargetVersion) {
      return buildPgmlInvalidCompareRelationshipSummary()
    }

    return buildPgmlEmptyBaseToVersionCompareRelationshipSummary(
      getPgmlVersionDisplayLabel(input.compareTargetVersion)
    )
  }

  if (input.compareBaseId === 'workspace') {
    if (input.compareTargetId === 'workspace') {
      return buildPgmlSelfCompareRelationshipSummary('the current workspace')
    }

    if (!input.compareTargetVersion) {
      return buildPgmlInvalidCompareRelationshipSummary()
    }

    return buildPgmlWorkspaceAsBaseCompareRelationshipSummary(
      getPgmlVersionDisplayLabel(input.compareTargetVersion)
    )
  }

  // Compare copy deliberately distinguishes the common workspace workflow
  // (current draft vs locked base) from version-to-version lineage comparisons.
  if (input.compareTargetId === 'workspace') {
    if (!input.compareBaseVersion) {
      return buildPgmlInvalidCompareRelationshipSummary()
    }

    if (input.compareBaseVersion.id === input.workspaceBaseVersion?.id) {
      return buildPgmlWorkspaceBaseCompareRelationshipSummary(
        getPgmlVersionDisplayLabel(input.compareBaseVersion)
      )
    }

    return buildPgmlWorkspaceCompareRelationshipSummary(
      getPgmlVersionDisplayLabel(input.compareBaseVersion)
    )
  }

  if (!input.compareBaseVersion || !input.compareTargetVersion) {
    return buildPgmlInvalidCompareRelationshipSummary()
  }

  if (input.compareBaseVersion.id === input.compareTargetVersion.id) {
    return buildPgmlSelfCompareRelationshipSummary(
      getPgmlVersionDisplayLabel(input.compareTargetVersion)
    )
  }

  if (input.compareTargetVersion.parentVersionId === input.compareBaseVersion.id) {
    return buildPgmlDirectIncrementCompareRelationshipSummary(
      getPgmlVersionDisplayLabel(input.compareTargetVersion),
      getPgmlVersionDisplayLabel(input.compareBaseVersion)
    )
  }

  const commonAncestor = getPgmlNearestCommonAncestor(
    input.document,
    input.compareBaseVersion.id,
    input.compareTargetVersion.id
  )

  if (commonAncestor) {
    return buildPgmlDivergedCompareRelationshipSummary(getPgmlVersionDisplayLabel(commonAncestor))
  }

  return buildPgmlNoCommonAncestorCompareRelationshipSummary()
}

const buildDocumentScopeItem = (
  label: string,
  value: PgmlDocumentEditorScope
) => {
  return {
    label,
    value
  } satisfies PgmlVersionedDocumentScopeItem
}

const buildVersionScopeItemLabel = (version: PgmlVersionDocumentBlock) => {
  // Scope menus should expose the role context as well as the version label so
  // implementation/design checkpoints remain distinguishable in long histories.
  return `${getPgmlVersionRoleDisplayLabel(version.role)} · ${getPgmlVersionDisplayLabel(version)}`
}

const buildVersionedDocumentScopeItems = (
  document: PgmlVersionSetDocument
) => {
  // The raw document editor can focus the whole VersionSet, the mutable
  // Workspace block, or one immutable Version block. Keeping the labels in one
  // helper prevents those scope menus from drifting between layouts.
  return [
    buildDocumentScopeItem('All VersionSet blocks', 'all'),
    buildDocumentScopeItem('Workspace block', 'workspace-block'),
    ...document.versions.map((version) => {
      return buildDocumentScopeItem(
        buildVersionScopeItemLabel(version),
        `version:${version.id}`
      )
    })
  ]
}

const getBlockViewItems = (
  views: PgmlDocumentDiagramView[]
) => {
  return views.map((view) => {
    return {
      label: view.name,
      value: view.id
    } satisfies PgmlDiagramViewItem
  })
}

const buildNextDiagramViewName = (
  views: PgmlDocumentDiagramView[]
) => {
  let index = views.length + 1

  while (views.some(view => view.name === `View ${index}`)) {
    index += 1
  }

  return `View ${index}`
}

const normalizeDiagramViewName = (value: string | null | undefined) => {
  return value?.trim() || ''
}

const normalizeVersionName = (value: string | null | undefined) => {
  return value?.trim() || ''
}

const hasDiagramViewName = (
  views: PgmlDocumentDiagramView[],
  name: string,
  options?: {
    excludeViewId?: string | null
  }
) => {
  return views.some((view) => {
    if (options?.excludeViewId && view.id === options.excludeViewId) {
      return false
    }

    return view.name === name
  })
}

export const usePgmlStudioVersionHistory = (
  input: {
    documentName: ComputedRef<string>
    source: Ref<string>
  }
) => {
  const initialWorkspaceSource = normalizeSnapshotSource(input.source.value, true)

  if (input.source.value !== initialWorkspaceSource) {
    input.source.value = initialWorkspaceSource
  }

  const documentState: ShallowRef<PgmlVersionSetDocument> = shallowRef(createInitialPgmlDocument({
    name: input.documentName.value,
    workspaceSource: initialWorkspaceSource
  }))
  const previewTargetId: Ref<PgmlVersionPreviewTarget> = ref('workspace')
  const editorMode: Ref<PgmlVersionedDocumentEditorMode> = ref('head')
  const documentEditorScope: Ref<PgmlDocumentEditorScope> = ref('all')
  const compareBaseId: Ref<string | null> = ref(null)
  const compareTargetId: Ref<string> = ref('workspace')
  const document: ComputedRef<PgmlVersionSetDocument> = computed(() => {
    return buildWorkspaceSyncedDocument(documentState.value, input.source.value)
  })
  const buildNamedWorkingDocument = (options?: {
    includeLayout?: boolean
    updatedAt?: string | null
  }) => {
    // The editor owns the mutable workspace text, so any serialized document
    // view needs to rebuild the current workspace snapshot before it is shown.
    const workingDocument = buildWorkspaceSyncedDocument(documentState.value, input.source.value, options)

    workingDocument.name = input.documentName.value

    return workingDocument
  }

  const setDocument = (nextDocument: PgmlVersionSetDocument) => {
    // Normalize every entry point through one setter so browser loads, file
    // loads, restores, and imports all reset the workspace/editor state with
    // the same canonical snapshot formatting and compare defaults.
    const normalizedDocument: PgmlVersionSetDocument = {
      ...nextDocument,
      name: input.documentName.value,
      schemaMetadata: clonePgmlDocumentSchemaMetadata(nextDocument.schemaMetadata),
      versions: nextDocument.versions.map((version) => {
        return {
          ...version,
          compareExclusions: clonePgmlCompareExclusions(version.compareExclusions),
          snapshot: {
            source: normalizeSnapshotSource(version.snapshot.source, true)
          },
          views: version.views.map(clonePgmlDocumentView)
        }
      }),
      workspace: {
        ...nextDocument.workspace,
        compareExclusions: clonePgmlCompareExclusions(nextDocument.workspace.compareExclusions),
        snapshot: {
          source: normalizeSnapshotSource(nextDocument.workspace.snapshot.source, true)
        },
        views: nextDocument.workspace.views.map(clonePgmlDocumentView)
      }
    }
    documentState.value = normalizedDocument
    input.source.value = getPgmlDocumentBlockPreviewSource(normalizedDocument.workspace)
    previewTargetId.value = 'workspace'
    documentEditorScope.value = normalizePgmlDocumentEditorScope(normalizedDocument, documentEditorScope.value)
    compareBaseId.value = buildDefaultCompareBaseId(normalizedDocument)
    compareTargetId.value = buildDefaultCompareTargetId(normalizedDocument)
  }

  const normalizeSelectionState = () => {
    // File loads, restores, and imports can invalidate UI selections; clamp
    // every derived id back onto the current document before the UI renders it.
    previewTargetId.value = normalizePreviewTargetId(documentState.value, previewTargetId.value)
    documentEditorScope.value = normalizePgmlDocumentEditorScope(documentState.value, documentEditorScope.value)
    compareBaseId.value = normalizeCompareBaseSelection(documentState.value, compareBaseId.value)
    compareTargetId.value = normalizeCompareTargetSelection(documentState.value, compareTargetId.value)
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

    // Empty text or a non-VersionSet source becomes a fresh versioned document
    // with that text in the workspace. This keeps the studio resilient while
    // still treating grammar-native VersionSet documents as the persisted form.
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

  const versions = computed(() => documentState.value.versions)
  const hasVersions = computed(() => hasPgmlVersions(documentState.value))
  const hasDesignVersions = computed(() => hasPgmlVersionRole(documentState.value, 'design'))
  const hasImplementationVersions = computed(() => hasPgmlVersionRole(documentState.value, 'implementation'))
  const latestLeafVersion = computed(() => getLatestPgmlLeafVersion(documentState.value))
  const latestLeafDesignVersion = computed(() => getLatestPgmlLeafVersionByRole(documentState.value, 'design'))
  const latestLeafImplementationVersion = computed(() => getLatestPgmlLeafVersionByRole(documentState.value, 'implementation'))
  const rootVersions = computed(() => getPgmlRootVersions(documentState.value))
  const leafVersions = computed(() => getPgmlLeafVersions(documentState.value))
  const workspaceBaseVersion = computed(() => getPgmlWorkspaceBaseVersion(documentState.value))
  const workspaceDirty = computed(() => isPgmlWorkspaceDirty(document.value))
  const canCheckpoint = computed(() => canCreatePgmlCheckpoint(document.value))
  const latestDesignVersion = computed(() => getLatestPgmlVersionByRole(documentState.value, 'design'))
  const latestImplementationVersion = computed(() => getLatestPgmlVersionByRole(documentState.value, 'implementation'))
  const latestOverallVersion = computed(() => getLatestPgmlVersion(documentState.value))
  const versionItems = computed(() => {
    return documentState.value.versions.map((version) => {
      return buildVersionHistoryItem(documentState.value, version, {
        latestDesignVersionId: latestDesignVersion.value?.id || null,
        latestImplementationVersionId: latestImplementationVersion.value?.id || null,
        latestOverallVersionId: latestOverallVersion.value?.id || null
      })
    })
  })
  const previewSource = computed(() => {
    return resolveVersionTargetSource({
      document: documentState.value,
      targetId: previewTargetId.value,
      workspaceSource: input.source.value
    })
  })
  const versionedDocumentSource = computed(() => {
    return serializePgmlDocument(buildNamedWorkingDocument())
  })
  const versionedDocumentScopeItems = computed<PgmlVersionedDocumentScopeItem[]>(() => {
    return buildVersionedDocumentScopeItems(documentState.value)
  })
  const versionedDocumentScopeSource = computed(() => {
    return serializePgmlDocumentScope(buildNamedWorkingDocument(), documentEditorScope.value)
  })
  const isWorkspacePreview = computed(() => previewTargetId.value === 'workspace')
  const currentPreviewBlock = computed(() => {
    if (previewTargetId.value === 'workspace') {
      return documentState.value.workspace
    }

    return getPgmlVersionById(documentState.value, previewTargetId.value)
  })
  const activeDiagramView = computed(() => {
    const previewBlock = currentPreviewBlock.value

    return previewBlock ? getPgmlDocumentView(previewBlock, previewBlock.activeViewId) : null
  })
  const activeDiagramViewId = computed(() => activeDiagramView.value?.id || null)
  const activeDiagramViewName = computed(() => activeDiagramView.value?.name || '')
  const nextDiagramViewName = computed(() => {
    const previewBlock = currentPreviewBlock.value

    return buildNextDiagramViewName(previewBlock?.views || [])
  })
  const diagramViewItems = computed<PgmlDiagramViewItem[]>(() => {
    const previewBlock = currentPreviewBlock.value

    return previewBlock ? getBlockViewItems(previewBlock.views) : []
  })
  const diagramViewSettings = computed<PgmlDiagramViewSettings>(() => {
    return {
      snapToGrid: activeDiagramView.value?.snapToGrid ?? true,
      showExecutableObjects: activeDiagramView.value?.showExecutableObjects ?? true,
      showRelationshipLines: activeDiagramView.value?.showRelationshipLines ?? true,
      showTableFields: activeDiagramView.value?.showTableFields ?? true
    }
  })
  const canDeleteDiagramView = computed(() => {
    return (currentPreviewBlock.value?.views.length || 0) > 1
  })
  const compareBaseVersion = computed(() => {
    if (compareBaseId.value === 'workspace') {
      return null
    }

    return getPgmlVersionById(documentState.value, compareBaseId.value)
  })
  const compareTargetVersion = computed<PgmlVersionDocumentBlock | null>(() => {
    if (compareTargetId.value === 'workspace') {
      return null
    }

    return getPgmlVersionById(documentState.value, compareTargetId.value)
  })
  const compareBaseSource = computed(() => {
    return compareBaseId.value === null
      ? ''
      : resolveVersionTargetSource({
          document: documentState.value,
          targetId: compareBaseId.value,
          workspaceSource: input.source.value
        })
  })
  const compareTargetSource = computed(() => {
    return resolveVersionTargetSource({
      document: documentState.value,
      targetId: compareTargetId.value,
      workspaceSource: input.source.value
    })
  })
  const compareRelationshipSummary = computed(() => {
    return buildCompareRelationshipSummary({
      compareBaseId: compareBaseId.value,
      compareBaseVersion: compareBaseVersion.value,
      compareTargetId: compareTargetId.value,
      compareTargetVersion: compareTargetVersion.value,
      document: documentState.value,
      workspaceBaseVersion: workspaceBaseVersion.value
    })
  })

  const updatePreviewBlockViews = (
    updater: (block: PgmlVersionSetDocument['workspace'] | PgmlVersionDocumentBlock) => void
  ) => {
    if (previewTargetId.value === 'workspace') {
      const nextDocument = clonePgmlVersionSetDocument(buildWorkspaceSyncedDocument(documentState.value, input.source.value))

      updater(nextDocument.workspace)

      documentState.value = nextDocument
      input.source.value = getPgmlDocumentBlockPreviewSource(nextDocument.workspace)
      normalizeSelectionState()
      return true
    }

    const nextDocument = clonePgmlVersionSetDocument(documentState.value)
    const targetVersion = nextDocument.versions.find(version => version.id === previewTargetId.value)

    if (!targetVersion) {
      return false
    }

    updater(targetVersion)
    documentState.value = nextDocument
    normalizeSelectionState()

    return true
  }

  const selectDiagramView = (viewId: string) => {
    return updatePreviewBlockViews((block) => {
      if (!block.views.some(view => view.id === viewId)) {
        return
      }

      block.activeViewId = viewId
    })
  }

  const createDiagramView = () => {
    return updatePreviewBlockViews((block) => {
      const currentView = getPgmlDocumentView(block, block.activeViewId)
      const nextView = createPgmlDocumentView({
        name: buildNextDiagramViewName(block.views),
        nodeProperties: currentView?.nodeProperties || {},
        snapToGrid: currentView?.snapToGrid ?? true,
        showExecutableObjects: currentView?.showExecutableObjects ?? true,
        showRelationshipLines: currentView?.showRelationshipLines ?? true,
        showTableFields: currentView?.showTableFields ?? true
      })

      block.views = [...block.views.map(clonePgmlDocumentView), nextView]
      block.activeViewId = nextView.id
    })
  }

  const createNamedDiagramView = (name: string) => {
    const normalizedName = normalizeDiagramViewName(name)

    if (normalizedName.length === 0) {
      return false
    }

    let didCreate = false

    const didUpdate = updatePreviewBlockViews((block) => {
      if (hasDiagramViewName(block.views, normalizedName)) {
        return
      }

      const currentView = getPgmlDocumentView(block, block.activeViewId)
      const nextView = createPgmlDocumentView({
        name: normalizedName,
        nodeProperties: currentView?.nodeProperties || {},
        snapToGrid: currentView?.snapToGrid ?? true,
        showExecutableObjects: currentView?.showExecutableObjects ?? true,
        showRelationshipLines: currentView?.showRelationshipLines ?? true,
        showTableFields: currentView?.showTableFields ?? true
      })

      block.views = [...block.views.map(clonePgmlDocumentView), nextView]
      block.activeViewId = nextView.id
      didCreate = true
    })

    return didUpdate && didCreate
  }

  const deleteActiveDiagramView = () => {
    return updatePreviewBlockViews((block) => {
      if (block.views.length <= 1) {
        return
      }

      const activeViewId = block.activeViewId || block.views[0]?.id || null
      const activeViewIndex = block.views.findIndex(view => view.id === activeViewId)
      const remainingViews = block.views.filter(view => view.id !== activeViewId)
      const fallbackView = remainingViews[Math.max(0, activeViewIndex - 1)] || remainingViews[0] || null

      block.views = remainingViews.map(clonePgmlDocumentView)
      block.activeViewId = fallbackView?.id || null
    })
  }

  const updateCurrentDiagramViewSettings = (
    settings: Partial<PgmlDiagramViewSettings>
  ) => {
    return updatePreviewBlockViews((block) => {
      const activeViewId = block.activeViewId || block.views[0]?.id || null

      block.views = block.views.map((view) => {
        if (view.id !== activeViewId) {
          return clonePgmlDocumentView(view)
        }

        return createPgmlDocumentView({
          ...view,
          snapToGrid: settings.snapToGrid ?? view.snapToGrid,
          showExecutableObjects: settings.showExecutableObjects ?? view.showExecutableObjects,
          showRelationshipLines: settings.showRelationshipLines ?? view.showRelationshipLines,
          showTableFields: settings.showTableFields ?? view.showTableFields
        })
      })
    })
  }

  const renameActiveDiagramView = (name: string) => {
    const normalizedName = normalizeDiagramViewName(name)
    const currentActiveViewId = activeDiagramViewId.value

    if (normalizedName.length === 0 || !currentActiveViewId) {
      return false
    }

    let didRename = false

    const didUpdate = updatePreviewBlockViews((block) => {
      if (hasDiagramViewName(block.views, normalizedName, {
        excludeViewId: currentActiveViewId
      })) {
        return
      }

      block.views = block.views.map((view) => {
        if (view.id !== currentActiveViewId) {
          return clonePgmlDocumentView(view)
        }

        didRename = true

        return createPgmlDocumentView({
          ...view,
          name: normalizedName
        })
      })
    })

    return didUpdate && didRename
  }

  const updateCurrentDiagramViewNodeProperties = (
    nodeProperties: Record<string, PgmlNodeProperties>
  ) => {
    return updatePreviewBlockViews((block) => {
      const activeViewId = block.activeViewId || block.views[0]?.id || null

      block.views = block.views.map((view) => {
        if (view.id !== activeViewId) {
          return clonePgmlDocumentView(view)
        }

        return createPgmlDocumentView({
          ...view,
          nodeProperties
        })
      })
    })
  }

  watch(() => input.documentName.value, (nextName) => {
    documentState.value = {
      ...documentState.value,
      name: nextName
    }
  })

  const serializeCurrentDocument = (includeLayout: boolean) => {
    const workingDocument = clonePgmlVersionSetDocument(
      buildNamedWorkingDocument({
        includeLayout
      })
    )
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
    const workingDocument = buildWorkspaceSyncedDocument(documentState.value, input.source.value, {
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
  const renameVersion = (
    versionId: string,
    name: string
  ) => {
    const normalizedName = normalizeVersionName(name)

    if (normalizedName.length === 0) {
      return false
    }

    const nextDocument = clonePgmlVersionSetDocument(
      buildWorkspaceSyncedDocument(documentState.value, input.source.value)
    )
    const targetVersion = nextDocument.versions.find(version => version.id === versionId)

    if (!targetVersion) {
      return false
    }

    targetVersion.name = normalizedName
    documentState.value = nextDocument
    normalizeSelectionState()

    return true
  }
  const setCompareExclusions = (
    targetId: PgmlVersionPreviewTarget,
    compareExclusions: PgmlCompareExclusions
  ) => {
    const nextDocument = clonePgmlVersionSetDocument(
      buildWorkspaceSyncedDocument(documentState.value, input.source.value)
    )

    if (targetId === 'workspace') {
      nextDocument.workspace.compareExclusions = clonePgmlCompareExclusions(compareExclusions)
      documentState.value = nextDocument
      normalizeSelectionState()

      return true
    }

    const targetVersion = nextDocument.versions.find(version => version.id === targetId)

    if (!targetVersion) {
      return false
    }

    targetVersion.compareExclusions = clonePgmlCompareExclusions(compareExclusions)
    documentState.value = nextDocument
    normalizeSelectionState()

    return true
  }
  // Restores and imports both replace the live workspace, so they should land
  // back on the editable draft with a compare pair anchored to that new base.
  const resetWorkspaceSelectionState = (baseId: string | null) => {
    previewTargetId.value = 'workspace'
    compareBaseId.value = baseId
    compareTargetId.value = 'workspace'
  }
  const replaceWorkspaceSnapshotAndResetSelection = (inputOptions: {
    activeViewId?: string | null
    basedOnVersionId: string | null
    compareExclusions?: PgmlCompareExclusions
    selectionBaseId: string | null
    source: string
    updatedAt: string
    views?: PgmlDocumentDiagramView[]
  }) => {
    // Restore/import flows both replace the live draft snapshot and then need
    // every preview/compare selector to point back at that new workspace state.
    const nextDocument = replacePgmlWorkspaceFromSnapshot(documentState.value, {
      activeViewId: inputOptions.activeViewId,
      basedOnVersionId: inputOptions.basedOnVersionId,
      compareExclusions: inputOptions.compareExclusions,
      source: inputOptions.source,
      updatedAt: inputOptions.updatedAt,
      views: inputOptions.views
    })
    documentState.value = nextDocument
    input.source.value = getPgmlDocumentBlockPreviewSource(nextDocument.workspace)
    resetWorkspaceSelectionState(inputOptions.selectionBaseId)
  }

  const replaceWorkspaceFromVersion = (versionId: string) => {
    const targetVersion = documentState.value.versions.find(version => version.id === versionId)

    if (!targetVersion) {
      return false
    }

    replaceWorkspaceSnapshotAndResetSelection({
      activeViewId: targetVersion.activeViewId,
      basedOnVersionId: targetVersion.id,
      compareExclusions: targetVersion.compareExclusions,
      selectionBaseId: targetVersion.parentVersionId,
      source: targetVersion.snapshot.source,
      updatedAt: new Date().toISOString(),
      views: targetVersion.views.map(clonePgmlDocumentView)
    })

    return true
  }

  const replaceWorkspaceFromImportedSnapshot = (inputOptions: {
    basedOnVersionId: string
    includeLayout: boolean
    source: string
  }) => {
    // Imported snapshots intentionally replace the draft and anchor it to the
    // chosen locked base version so compare and migrations start from the same
    // predecessor the user selected during the import flow.
    const baseVersion = getPgmlVersionById(documentState.value, inputOptions.basedOnVersionId)

    if (!baseVersion) {
      return false
    }

    replaceWorkspaceSnapshotAndResetSelection({
      activeViewId: null,
      basedOnVersionId: inputOptions.basedOnVersionId,
      compareExclusions: baseVersion.compareExclusions,
      selectionBaseId: inputOptions.basedOnVersionId,
      source: normalizeSnapshotSource(inputOptions.source, inputOptions.includeLayout),
      updatedAt: new Date().toISOString(),
      views: []
    })

    return true
  }

  const setPreviewTarget = (nextTargetId: PgmlVersionPreviewTarget) => {
    previewTargetId.value = normalizePreviewTargetId(documentState.value, nextTargetId)
  }

  const setCompareTargets = (inputOptions: {
    baseId: string | null
    targetId: string
  }) => {
    compareBaseId.value = inputOptions.baseId === null
      ? null
      : normalizeCompareBaseSelection(documentState.value, inputOptions.baseId)
    compareTargetId.value = normalizeCompareTargetSelection(documentState.value, inputOptions.targetId)
  }

  const setDocumentEditorScope = (nextScope: PgmlDocumentEditorScope) => {
    documentEditorScope.value = normalizePgmlDocumentEditorScope(documentState.value, nextScope)
  }

  const setSchemaMetadata = (schemaMetadata: PgmlDocumentSchemaMetadata) => {
    documentState.value = replacePgmlDocumentSchemaMetadata(documentState.value, schemaMetadata)
  }

  return {
    activeDiagramViewId,
    activeDiagramViewName,
    compareBaseId,
    compareBaseSource,
    compareBaseVersion,
    compareRelationshipSummary,
    compareTargetId,
    compareTargetSource,
    compareTargetVersion,
    canCheckpoint,
    canDeleteDiagramView,
    createCheckpoint,
    createDiagramView,
    createNamedDiagramView,
    document,
    diagramViewItems,
    diagramViewSettings,
    deleteActiveDiagramView,
    documentEditorScope,
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
    renameActiveDiagramView,
    renameVersion,
    resetDocument,
    rootVersions,
    selectDiagramView,
    serializeCurrentDocument,
    setSchemaMetadata,
    setCompareTargets,
    setCompareExclusions,
    setDocumentEditorScope,
    setPreviewTarget,
    latestDesignVersion,
    latestLeafDesignVersion,
    latestLeafImplementationVersion,
    latestLeafVersion,
    latestImplementationVersion,
    nextDiagramViewName,
    updateCurrentDiagramViewNodeProperties,
    updateCurrentDiagramViewSettings,
    versionItems,
    versionedDocumentSource,
    versionedDocumentScopeItems,
    versionedDocumentScopeSource,
    versions,
    workspaceBaseVersion,
    workspaceDirty
  }
}
