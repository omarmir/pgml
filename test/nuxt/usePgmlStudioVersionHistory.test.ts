import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createInitialPgmlDocument,
  serializePgmlDocument
} from '../../app/utils/pgml-document'
import { usePgmlStudioVersionHistory } from '../../app/composables/usePgmlStudioVersionHistory'
import {
  replacePgmlColumnSchemaMetadataEntries,
  replacePgmlTableSchemaMetadataEntries
} from '../../app/utils/pgml-schema-metadata'
import { resetStudioWorkspaceState } from '../../app/composables/useStudioWorkspaceState'

const baseWorkspaceSource = `Table public.users {
  id uuid [pk]
}`

const importedWorkspaceSource = `Table public.users {
  id uuid [pk]
  status text
}`

const groupedWorkspaceSource = `TableGroup Core {
  public.users
}

Table public.users in Core {
  id uuid [pk]
}`

const mountVersionHistoryComposable = async (input?: {
  documentName?: string
  source?: string
}) => {
  const source = ref(input?.source || baseWorkspaceSource)
  const documentName = ref(input?.documentName || 'Billing')
  let api!: ReturnType<typeof usePgmlStudioVersionHistory>

  await mountSuspended(defineComponent({
    setup() {
      api = usePgmlStudioVersionHistory({
        documentName: computed(() => documentName.value),
        source
      })

      return () => null
    }
  }))

  return {
    api,
    documentName,
    source
  }
}

const createDesignCheckpoint = (
  api: ReturnType<typeof usePgmlStudioVersionHistory>,
  name = 'Initial design'
) => {
  const checkpoint = api.createCheckpoint({
    createdAt: '2026-03-29T12:00:00.000Z',
    includeLayout: true,
    name,
    role: 'design'
  })

  if (!checkpoint) {
    throw new Error('Expected the checkpoint to be created.')
  }

  return checkpoint
}

const createSerializedImplementationDocument = (workspaceSource = importedWorkspaceSource) => {
  return serializePgmlDocument(createInitialPgmlDocument({
    initialVersion: {
      createdAt: '2026-03-29T12:00:00.000Z',
      name: 'Initial implementation',
      parentVersionId: null,
      role: 'implementation',
      snapshot: {
        source: baseWorkspaceSource
      }
    },
    name: 'Billing',
    workspaceSource
  }))
}

describe('usePgmlStudioVersionHistory', () => {
  beforeEach(() => {
    resetStudioWorkspaceState()
  })

  it('normalizes malformed workspace indentation when the history composable boots', async () => {
    const malformedWorkspaceSource = `TableGroup Core {
                                                                                                        public.tenants
                                                                                                        public.accounts
}`
    const { api, source } = await mountVersionHistoryComposable({
      source: malformedWorkspaceSource
    })

    expect(source.value).toBe(`TableGroup Core {
  public.tenants
  public.accounts
}`)
    expect(api.document.value.workspace.snapshot.source).toBe(source.value)
  })

  it('normalizes malformed embedded SQL indentation when the history composable boots', async () => {
    const malformedWorkspaceSource = `Function sync_users() returns trigger {
  source: $sql$
                                                                                                        CREATE FUNCTION public.sync_users() RETURNS trigger LANGUAGE plpgsql AS $$
                                                                                                        BEGIN
                                                                                                          RETURN NEW;
                                                                                                        END;
                                                                                                        $$;
  $sql$
}`
    const { api, source } = await mountVersionHistoryComposable({
      source: malformedWorkspaceSource
    })

    expect(source.value).toBe(`Function public.sync_users() returns trigger {
  source: $sql$
    CREATE FUNCTION public.sync_users() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RETURN NEW;
    END;
    $$;
  $sql$
}`)
    expect(api.document.value.workspace.snapshot.source).toBe(source.value)
  })

  it('creates checkpoints, previews locked versions, restores them, and replaces the workspace from imports', async () => {
    const { api, source } = await mountVersionHistoryComposable()

    expect(api.workspaceDirty.value).toBe(true)
    expect(api.canCheckpoint.value).toBe(true)

    const initialVersion = createDesignCheckpoint(api)

    expect(api.document.value.workspace.basedOnVersionId).toBe(initialVersion.id)
    expect(api.workspaceBaseVersion.value?.id).toBe(initialVersion.id)
    expect(api.hasDesignVersions.value).toBe(true)
    expect(api.hasImplementationVersions.value).toBe(false)
    expect(api.hasVersions.value).toBe(true)
    expect(api.latestLeafDesignVersion.value?.id).toBe(initialVersion.id)
    expect(api.latestLeafImplementationVersion.value).toBeNull()
    expect(api.latestLeafVersion.value?.id).toBe(initialVersion.id)
    expect(api.rootVersions.value).toHaveLength(1)
    expect(api.leafVersions.value).toHaveLength(1)
    expect(api.versionedDocumentSource.value).toContain('VersionSet "Billing"')
    expect(api.versionedDocumentSource.value).toContain(`Version ${initialVersion.id}`)

    expect(api.replaceWorkspaceFromImportedSnapshot({
      basedOnVersionId: initialVersion.id,
      includeLayout: true,
      source: importedWorkspaceSource
    })).toBe(true)

    expect(source.value).toContain('status text')
    expect(api.compareBaseId.value).toBe(initialVersion.id)
    expect(api.compareTargetId.value).toBe('workspace')

    api.setPreviewTarget(initialVersion.id)

    expect(api.previewTargetId.value).toBe(initialVersion.id)
    expect(api.previewSource.value).toBe(baseWorkspaceSource)
    expect(source.value).toContain('Table public.users')
    expect(source.value).toContain('status text')

    expect(api.replaceWorkspaceFromVersion(initialVersion.id)).toBe(true)
    expect(api.previewTargetId.value).toBe('workspace')
    expect(source.value).toBe(baseWorkspaceSource)
    expect(api.compareTargetId.value).toBe('workspace')
    expect(api.workspaceDirty.value).toBe(false)
    expect(api.canCheckpoint.value).toBe(false)
  })

  it('loads raw snapshot text into a new versioned document when no VersionSet root exists', async () => {
    const { api, source } = await mountVersionHistoryComposable({
      source: ''
    })

    api.loadDocument(`Table public.accounts {
  id uuid [pk]
}`)

    expect(source.value).toContain('Table public.accounts')
    expect(api.document.value.versions).toHaveLength(0)
    expect(api.compareBaseId.value).toBeNull()
    expect(api.compareTargetId.value).toBe('workspace')
    expect(api.previewSource.value).toContain('Table public.accounts')
  })

  it('loads serialized VersionSet documents and preserves workspace defaults', async () => {
    const { api, source } = await mountVersionHistoryComposable({
      source: ''
    })

    api.loadDocument(createSerializedImplementationDocument())

    expect(source.value).toContain('Table public.users')
    expect(source.value).toContain('status text')
    expect(api.document.value.versions).toHaveLength(1)
    expect(api.compareBaseId.value).toBe(api.document.value.workspace.basedOnVersionId)
    expect(api.compareTargetId.value).toBe('workspace')
  })

  it('renames locked versions and updates their serialized labels', async () => {
    const { api } = await mountVersionHistoryComposable({
      source: ''
    })

    api.loadDocument(createSerializedImplementationDocument())

    const initialVersion = api.versions.value[0]

    if (!initialVersion) {
      throw new Error('Expected the initial implementation version to load.')
    }

    expect(api.renameVersion(initialVersion.id, 'Agency foundation')).toBe(true)
    expect(api.versions.value[0]?.name).toBe('Agency foundation')
    expect(api.versionedDocumentScopeItems.value.some((item) => {
      return item.label.includes('Agency foundation')
    })).toBe(true)
    expect(api.versionedDocumentSource.value).toContain('name: "Agency foundation"')
    expect(api.renameVersion(initialVersion.id, '   ')).toBe(false)
  })

  it('deletes only unreferenced leaf versions and blocks versions still needed by history or saved comparisons', async () => {
    const { api, source } = await mountVersionHistoryComposable()
    const rootVersion = createDesignCheckpoint(api, 'Initial design')

    source.value = importedWorkspaceSource

    const trunkVersion = api.createCheckpoint({
      createdAt: '2026-03-29T12:05:00.000Z',
      includeLayout: true,
      name: 'Add status',
      role: 'design'
    })

    if (!trunkVersion) {
      throw new Error('Expected the trunk version to be created.')
    }

    expect(api.versionItems.value.find(version => version.id === rootVersion.id)).toEqual(expect.objectContaining({
      canDelete: false,
      deleteBlockedReason: 'a newer checkpoint branches from it'
    }))
    expect(api.versionItems.value.find(version => version.id === trunkVersion.id)).toEqual(expect.objectContaining({
      canDelete: false,
      deleteBlockedReason: 'the workspace increments from it'
    }))

    expect(api.replaceWorkspaceFromVersion(rootVersion.id)).toBe(true)

    source.value = `Table public.users {
  id uuid [pk]
}

Table public.teams {
  id uuid [pk]
}`

    const branchVersion = api.createCheckpoint({
      createdAt: '2026-03-29T12:10:00.000Z',
      includeLayout: true,
      name: 'Teams branch',
      role: 'design'
    })

    if (!branchVersion) {
      throw new Error('Expected the branch version to be created.')
    }

    expect(api.versionItems.value.find(version => version.id === trunkVersion.id)).toEqual(expect.objectContaining({
      canDelete: true,
      deleteBlockedReason: null
    }))

    api.setPreviewTarget(trunkVersion.id)
    api.setCompareTargets({
      baseId: trunkVersion.id,
      targetId: 'workspace'
    })

    expect(api.deleteVersion(trunkVersion.id)).toBe(true)
    expect(api.versions.value.map(version => version.id)).not.toContain(trunkVersion.id)
    expect(api.previewTargetId.value).toBe('workspace')
    expect(api.compareBaseId.value).toBe(branchVersion.id)
    expect(api.versionedDocumentSource.value).not.toContain('name: "Add status"')

    expect(api.replaceWorkspaceFromVersion(rootVersion.id)).toBe(true)

    source.value = `Table public.users {
  id uuid [pk]
}

Table public.audit_log {
  id uuid [pk]
  user_id uuid [not null]
}`

    const alternateBranchVersion = api.createCheckpoint({
      createdAt: '2026-03-29T12:15:00.000Z',
      includeLayout: true,
      name: 'Audit branch',
      role: 'design'
    })

    if (!alternateBranchVersion) {
      throw new Error('Expected the alternate branch version to be created.')
    }

    api.setCompareTargets({
      baseId: branchVersion.id,
      targetId: alternateBranchVersion.id
    })

    expect(api.createComparison('Branch comparison')).toEqual(expect.objectContaining({
      baseId: branchVersion.id,
      targetId: alternateBranchVersion.id
    }))
    expect(api.versionItems.value.find(version => version.id === branchVersion.id)).toEqual(expect.objectContaining({
      canDelete: false,
      deleteBlockedReason: '1 saved comparison references it'
    }))
    expect(api.deleteVersion(branchVersion.id)).toBe(false)
    expect(api.versions.value.map(version => version.id)).toContain(branchVersion.id)
  })

  it('persists multiple diagram views per workspace and version preview target', async () => {
    const { api, source } = await mountVersionHistoryComposable()
    const defaultViewId = api.activeDiagramViewId.value

    expect(api.diagramViewItems.value).toHaveLength(1)
    expect(api.diagramViewItems.value[0]?.label).toBe('Default')

    api.updateCurrentDiagramViewNodeProperties({
      'public.users': {
        x: 120,
        y: 240
      }
    })
    api.updateCurrentDiagramViewSettings({
      snapToGrid: false,
      showExecutableObjects: false,
      showRelationshipLines: false,
      showTableFields: false
    })

    expect(source.value).toContain('Properties "public.users"')
    expect(source.value).toContain('x: 120')
    expect(api.diagramViewSettings.value).toEqual({
      snapToGrid: false,
      showExecutableObjects: false,
      showRelationshipLines: false,
      showTableFields: false
    })

    expect(api.createNamedDiagramView('Schema focus')).toBe(true)

    const secondViewId = api.activeDiagramViewId.value

    expect(api.canDeleteDiagramView.value).toBe(true)
    expect(api.diagramViewItems.value.map(item => item.label)).toEqual(['Default', 'Schema focus'])
    expect(secondViewId).not.toBe(defaultViewId)

    api.updateCurrentDiagramViewNodeProperties({
      'public.users': {
        x: 420,
        y: 560
      }
    })
    api.updateCurrentDiagramViewSettings({
      snapToGrid: true,
      showExecutableObjects: true,
      showRelationshipLines: true,
      showTableFields: true
    })

    expect(source.value).toContain('x: 420')

    if (!defaultViewId || !secondViewId) {
      throw new Error('Expected both workspace diagram views to have ids.')
    }

    api.selectDiagramView(defaultViewId)

    expect(api.activeDiagramViewId.value).toBe(defaultViewId)
    expect(api.diagramViewSettings.value).toEqual({
      snapToGrid: false,
      showExecutableObjects: false,
      showRelationshipLines: false,
      showTableFields: false
    })
    expect(source.value).toContain('x: 120')
    expect(source.value).not.toContain('x: 420')

    api.selectDiagramView(secondViewId)

    const checkpoint = createDesignCheckpoint(api, 'Initial design')

    api.setPreviewTarget(checkpoint.id)

    expect(api.previewSource.value).toContain('x: 420')
    expect(api.diagramViewItems.value.map(item => item.label)).toEqual(['Default', 'Schema focus'])
    expect(api.diagramViewSettings.value).toEqual({
      snapToGrid: true,
      showExecutableObjects: true,
      showRelationshipLines: true,
      showTableFields: true
    })

    expect(api.renameActiveDiagramView('Implementation review')).toBe(true)
    expect(api.activeDiagramViewName.value).toBe('Implementation review')
    expect(api.diagramViewItems.value.map(item => item.label)).toEqual(['Default', 'Implementation review'])
    expect(api.renameActiveDiagramView('Default')).toBe(false)
    expect(api.createNamedDiagramView('Default')).toBe(false)

    api.selectDiagramView(defaultViewId)

    expect(api.previewSource.value).toContain('x: 120')
    expect(api.diagramViewSettings.value).toEqual({
      snapToGrid: false,
      showExecutableObjects: false,
      showRelationshipLines: false,
      showTableFields: false
    })

    api.setPreviewTarget('workspace')
    api.selectDiagramView(secondViewId)
    api.deleteActiveDiagramView()

    expect(api.diagramViewItems.value).toHaveLength(1)
    expect(api.activeDiagramViewId.value).toBe(defaultViewId)
    expect(source.value).toContain('x: 120')
  })

  it('keeps snap and group layout properties scoped to the active diagram view', async () => {
    const { api, source } = await mountVersionHistoryComposable({
      source: groupedWorkspaceSource
    })
    const defaultViewId = api.activeDiagramViewId.value

    api.updateCurrentDiagramViewNodeProperties({
      'group:Core': {
        masonry: true,
        tableWidthScale: 1.5,
        x: 216,
        y: 234
      }
    })
    api.updateCurrentDiagramViewSettings({
      snapToGrid: false
    })

    expect(source.value).toContain('Properties "group:Core"')
    expect(source.value).toContain('masonry: true')
    expect(source.value).toContain('table_width_scale: 1.5')
    expect(api.diagramViewSettings.value.snapToGrid).toBe(false)

    expect(api.createNamedDiagramView('Compact')).toBe(true)

    const compactViewId = api.activeDiagramViewId.value

    api.updateCurrentDiagramViewNodeProperties({
      'group:Core': {
        x: 432,
        y: 468
      }
    })
    api.updateCurrentDiagramViewSettings({
      snapToGrid: true
    })

    if (!defaultViewId || !compactViewId) {
      throw new Error('Expected both diagram views to have ids.')
    }

    api.selectDiagramView(defaultViewId)

    expect(source.value).toContain('masonry: true')
    expect(source.value).toContain('table_width_scale: 1.5')
    expect(source.value).toContain('x: 216')
    expect(api.diagramViewSettings.value.snapToGrid).toBe(false)
    expect(api.versionedDocumentSource.value).toContain('snap_to_grid: false')

    api.selectDiagramView(compactViewId)

    expect(source.value).not.toContain('masonry: true')
    expect(source.value).not.toContain('table_width_scale: 1.5')
    expect(source.value).toContain('x: 432')
    expect(api.diagramViewSettings.value.snapToGrid).toBe(true)
  })

  it('exposes document scope options and serializes the selected document slice', async () => {
    const { api } = await mountVersionHistoryComposable()
    const initialVersion = createDesignCheckpoint(api)

    expect(api.versionedDocumentScopeItems.value).toEqual(expect.arrayContaining([
      {
        label: 'All VersionSet blocks',
        value: 'all'
      },
      {
        label: 'Workspace block',
        value: 'workspace-block'
      },
      {
        label: 'Design · Initial design',
        value: `version:${initialVersion.id}`
      }
    ]))

    api.setDocumentEditorScope('workspace-block')
    expect(api.documentEditorScope.value).toBe('workspace-block')
    expect(api.versionedDocumentScopeSource.value).toContain('Workspace {')
    expect(api.versionedDocumentScopeSource.value).not.toContain('VersionSet "Billing" {')

    api.setDocumentEditorScope(`version:${initialVersion.id}`)
    expect(api.documentEditorScope.value).toBe(`version:${initialVersion.id}`)
    expect(api.versionedDocumentScopeSource.value).toContain(`Version ${initialVersion.id} {`)
    expect(api.versionedDocumentScopeSource.value).not.toContain('Workspace {')

    api.setDocumentEditorScope('version:missing-version')
    expect(api.documentEditorScope.value).toBe('all')
    expect(api.versionedDocumentScopeSource.value).toContain('VersionSet "Billing" {')
  })

  it('can serialize without layout properties and reset back to an empty workspace document', async () => {
    const { api, source } = await mountVersionHistoryComposable({
      source: `Table public.users {
  id uuid [pk]
}

Properties "public.users" {
  x: 100
  y: 200
}`
    })

    const serializedWithoutLayout = api.serializeCurrentDocument(false)

    expect(serializedWithoutLayout).not.toContain('Properties "public.users"')

    api.resetDocument()

    expect(source.value).toBe('')
    expect(api.document.value.versions).toHaveLength(0)
    expect(api.previewTargetId.value).toBe('workspace')
  })

  it('persists document-level schema metadata outside workspace snapshots', async () => {
    const { api, source } = await mountVersionHistoryComposable()

    api.setSchemaMetadata(
      replacePgmlColumnSchemaMetadataEntries(
        replacePgmlTableSchemaMetadataEntries(
          api.document.value.schemaMetadata,
          'public.users',
          [
            {
              key: 'owner',
              value: 'identity'
            }
          ]
        ),
        'public.users',
        'id',
        [
          {
            key: 'classification',
            value: 'identifier'
          }
        ]
      )
    )

    expect(api.document.value.schemaMetadata.tables).toHaveLength(1)
    expect(api.versionedDocumentSource.value).toContain('SchemaMetadata {')
    expect(api.versionedDocumentSource.value).toContain('Table "public.users" {')
    expect(api.versionedDocumentSource.value).toContain('Column "public.users.id" {')
    expect(source.value).toBe(baseWorkspaceSource)
  })

  it('keeps document-level schema metadata while checkpointing and restoring versions', async () => {
    const { api, source } = await mountVersionHistoryComposable()

    api.setSchemaMetadata(
      replacePgmlColumnSchemaMetadataEntries(
        replacePgmlTableSchemaMetadataEntries(
          api.document.value.schemaMetadata,
          'public.users',
          [
            {
              key: 'owner',
              value: 'identity'
            }
          ]
        ),
        'public.users',
        'id',
        [
          {
            key: 'classification',
            value: 'identifier'
          }
        ]
      )
    )

    const initialVersion = createDesignCheckpoint(api, 'Initial design')

    source.value = importedWorkspaceSource
    const updatedVersion = api.createCheckpoint({
      createdAt: '2026-03-30T12:00:00.000Z',
      includeLayout: true,
      name: 'Expanded design',
      role: 'design'
    })

    expect(updatedVersion).not.toBeNull()
    expect(api.document.value.schemaMetadata.tables).toEqual([
      {
        entries: [
          {
            key: 'owner',
            value: 'identity'
          }
        ],
        tableId: 'public.users'
      }
    ])
    expect(api.document.value.schemaMetadata.columns).toEqual([
      {
        columnName: 'id',
        entries: [
          {
            key: 'classification',
            value: 'identifier'
          }
        ],
        tableId: 'public.users'
      }
    ])

    expect(api.replaceWorkspaceFromVersion(initialVersion.id)).toBe(true)
    expect(source.value).toBe(baseWorkspaceSource)
    expect(api.document.value.schemaMetadata.tables).toEqual([
      {
        entries: [
          {
            key: 'owner',
            value: 'identity'
          }
        ],
        tableId: 'public.users'
      }
    ])
    expect(api.document.value.schemaMetadata.columns).toEqual([
      {
        columnName: 'id',
        entries: [
          {
            key: 'classification',
            value: 'identifier'
          }
        ],
        tableId: 'public.users'
      }
    ])
    expect(api.versionedDocumentSource.value).toContain('SchemaMetadata {')
    expect(api.versionedDocumentSource.value).toContain('owner: "identity"')
    expect(api.versionedDocumentSource.value).toContain('classification: "identifier"')
  })

  it('stores saved comparisons with their own exclusions and recalls them after checkpointing', async () => {
    const { api } = await mountVersionHistoryComposable({
      source: groupedWorkspaceSource
    })

    const initialVersion = createDesignCheckpoint(api, 'Initial design')

    expect(api.setCompareTargets({
      baseId: initialVersion.id,
      targetId: 'workspace'
    })).toBe(true)
    expect(api.setCurrentCompareExclusions({
      entityIds: ['function:public.refresh_users'],
      groupNames: ['Core'],
      tableIds: ['public.audit_log']
    })).toBe(true)
    expect(api.setCurrentCompareNoiseFilters({
      hideDefaults: false,
      hideExecutableNameOnly: false,
      hideStructuralNameOnly: false,
      hideMetadata: false,
      hideOrderOnly: true
    })).toBe(true)

    const savedComparison = api.createComparison('Implemented scope')

    expect(savedComparison).toEqual(expect.objectContaining({
      baseId: initialVersion.id,
      name: 'Implemented scope',
      targetId: 'workspace'
    }))
    expect(savedComparison?.exclusions).toEqual({
      entityIds: ['function:public.refresh_users'],
      groupNames: ['Core'],
      includedEntityIds: [],
      includedGroupNames: [],
      includedTableIds: [],
      tableIds: ['public.audit_log']
    })
    expect(savedComparison?.noiseFilters).toEqual({
      hideDefaults: false,
      hideExecutableNameOnly: false,
      hideStructuralNameOnly: false,
      hideMetadata: false,
      hideOrderOnly: true
    })
    expect(api.comparisons.value).toHaveLength(1)
    expect(api.selectedComparisonId.value).toBe(savedComparison?.id || null)
    expect(api.versionedDocumentSource.value).toContain('Comparison "Implemented scope" {')
    expect(api.versionedDocumentSource.value).toContain('hide_defaults: false')
    expect(api.versionedDocumentSource.value).toContain('hide_structural_name_only: false')
    expect(api.versionedDocumentSource.value).toContain('hide_metadata: false')

    const appOnlyVersion = createDesignCheckpoint(api, 'App-only')

    expect(api.selectedComparisonId.value).toBeNull()
    expect(api.compareBaseId.value).toBe(appOnlyVersion.id)
    expect(api.compareTargetId.value).toBe('workspace')
    expect(api.compareExclusions.value).toEqual({
      entityIds: [],
      groupNames: [],
      includedEntityIds: [],
      includedGroupNames: [],
      includedTableIds: [],
      tableIds: []
    })
    expect(api.compareNoiseFilters.value).toEqual({
      hideDefaults: true,
      hideExecutableNameOnly: true,
      hideStructuralNameOnly: true,
      hideMetadata: true,
      hideOrderOnly: true
    })
    expect(api.selectComparison(savedComparison?.id || null)).toBe(true)
    expect(api.compareBaseId.value).toBe(initialVersion.id)
    expect(api.compareTargetId.value).toBe('workspace')
    expect(api.compareExclusions.value).toEqual({
      entityIds: ['function:public.refresh_users'],
      groupNames: ['Core'],
      includedEntityIds: [],
      includedGroupNames: [],
      includedTableIds: [],
      tableIds: ['public.audit_log']
    })
    expect(api.compareNoiseFilters.value).toEqual({
      hideDefaults: false,
      hideExecutableNameOnly: false,
      hideStructuralNameOnly: false,
      hideMetadata: false,
      hideOrderOnly: true
    })

    expect(api.renameComparison(savedComparison?.id || '', 'Implemented today')).toBe(true)
    expect(api.comparisonItems.value).toContainEqual({
      label: 'Implemented today',
      value: savedComparison?.id || ''
    })
    expect(api.deleteComparison(savedComparison?.id || '')).toBe(true)
    expect(api.comparisons.value).toHaveLength(0)
  })

  it('retargets a selected saved comparison without clearing its saved exclusions', async () => {
    const { api } = await mountVersionHistoryComposable({
      source: groupedWorkspaceSource
    })
    const initialVersion = createDesignCheckpoint(api, 'Initial design')
    const nextVersion = api.createCheckpoint({
      createdAt: '2026-03-29T13:00:00.000Z',
      includeLayout: true,
      name: 'Implemented slice',
      role: 'implementation'
    })

    if (!nextVersion) {
      throw new Error('Expected the implementation checkpoint to be created.')
    }

    expect(api.setCompareTargets({
      baseId: initialVersion.id,
      targetId: 'workspace'
    })).toBe(true)
    expect(api.setCurrentCompareExclusions({
      entityIds: ['function:public.refresh_users'],
      groupNames: ['Core'],
      tableIds: ['public.audit_log']
    })).toBe(true)

    const savedComparison = api.createComparison('Managed exclusions')

    expect(api.selectComparison(savedComparison?.id || null)).toBe(true)
    expect(api.setCompareTargets({
      baseId: nextVersion.id,
      targetId: initialVersion.id
    })).toBe(true)

    expect(api.selectedComparison.value).toEqual(expect.objectContaining({
      baseId: nextVersion.id,
      targetId: initialVersion.id
    }))
    expect(api.selectedComparison.value?.exclusions).toEqual({
      entityIds: ['function:public.refresh_users'],
      groupNames: ['Core'],
      includedEntityIds: [],
      includedGroupNames: [],
      includedTableIds: [],
      tableIds: ['public.audit_log']
    })
    expect(api.compareExclusions.value).toEqual({
      entityIds: ['function:public.refresh_users'],
      groupNames: ['Core'],
      includedEntityIds: [],
      includedGroupNames: [],
      includedTableIds: [],
      tableIds: ['public.audit_log']
    })
  })

  it('persists compare notes and note flag filters on saved comparisons', async () => {
    const { api } = await mountVersionHistoryComposable()
    const initialVersion = createDesignCheckpoint(api, 'Initial design')

    expect(api.setCompareTargets({
      baseId: initialVersion.id,
      targetId: 'workspace'
    })).toBe(true)

    const savedComparison = api.createComparison('Tracked scope')

    expect(api.selectComparison(savedComparison?.id || null)).toBe(true)
    expect(api.setCurrentCompareNoteFilters({
      showBlocked: false,
      showFixed: false,
      showIgnore: true,
      showPending: true
    })).toBe(true)
    expect(api.saveSelectedComparisonNote({
      entryId: 'index:public.users::public.users_name_idx',
      flag: 'pending',
      note: 'Validate after deploy.'
    })).toBe(true)

    expect(api.selectedComparison.value?.noteFilters).toEqual({
      showBlocked: false,
      showFixed: false,
      showIgnore: true,
      showPending: true
    })
    expect(api.selectedComparison.value?.notes).toEqual([
      {
        entryId: 'index:public.users::public.users_name_idx',
        flag: 'pending',
        note: 'Validate after deploy.'
      }
    ])
    expect(api.versionedDocumentSource.value).toContain('show_fixed_notes: false')
    expect(api.versionedDocumentSource.value).toContain('CompareNote "index:public.users::public.users_name_idx" {')
  })

  it('prunes saved compare notes when the tracked diff ids are no longer present', async () => {
    const { api } = await mountVersionHistoryComposable()

    const savedComparison = api.createComparison('Tracked scope')

    expect(api.selectComparison(savedComparison?.id || null)).toBe(true)
    expect(api.saveSelectedComparisonNote({
      entryId: 'index:public.users::public.users_name_idx',
      flag: 'pending',
      note: 'Validate after deploy.'
    })).toBe(true)
    expect(api.saveSelectedComparisonNote({
      entryId: 'constraint:public.users::users_name_check',
      flag: 'ignore',
      note: 'Intentional difference.'
    })).toBe(true)

    expect(api.pruneSelectedComparisonNotes(['constraint:public.users::users_name_check'])).toBe(true)
    expect(api.selectedComparison.value?.notes).toEqual([
      {
        entryId: 'constraint:public.users::users_name_check',
        flag: 'ignore',
        note: 'Intentional difference.'
      }
    ])
    expect(api.versionedDocumentSource.value).not.toContain('CompareNote "index:public.users::public.users_name_idx" {')
  })

  it('returns false when restoring a missing version id and keeps compare targets editable', async () => {
    const { api } = await mountVersionHistoryComposable()

    expect(api.replaceWorkspaceFromVersion('missing-version')).toBe(false)

    api.setCompareTargets({
      baseId: null,
      targetId: 'workspace'
    })

    expect(api.compareBaseId.value).toBeNull()
    expect(api.compareTargetId.value).toBe('workspace')
  })

  it('allows the workspace to act as the compare base for version-to-workspace symmetry', async () => {
    const { api } = await mountVersionHistoryComposable()
    const initialVersion = createDesignCheckpoint(api)

    api.setCompareTargets({
      baseId: 'workspace',
      targetId: initialVersion.id
    })

    expect(api.compareBaseId.value).toBe('workspace')
    expect(api.compareBaseSource.value).toBe(baseWorkspaceSource)
    expect(api.compareTargetId.value).toBe(initialVersion.id)
    expect(api.compareRelationshipSummary.value).toContain('against the current workspace')
  })

  it('clamps invalid preview and compare ids back to valid version history targets', async () => {
    const { api } = await mountVersionHistoryComposable()
    const initialVersion = createDesignCheckpoint(api)

    api.setPreviewTarget('missing-version')
    api.setCompareTargets({
      baseId: initialVersion.id,
      targetId: 'missing-version'
    })

    expect(api.previewTargetId.value).toBe('workspace')
    expect(api.compareBaseId.value).toBe(initialVersion.id)
    expect(api.compareTargetId.value).toBe('workspace')
  })

  it('enriches version history items with branch depth and child counts', async () => {
    const { api, source } = await mountVersionHistoryComposable()
    const rootVersion = createDesignCheckpoint(api)

    source.value = importedWorkspaceSource

    const branchVersion = api.createCheckpoint({
      createdAt: '2026-03-29T12:05:00.000Z',
      includeLayout: true,
      name: 'Add status',
      role: 'design'
    })

    expect(branchVersion?.id).toBeTruthy()
    expect(api.versionItems.value[0]).toEqual(expect.objectContaining({
      branchLeafCount: 1,
      branchMaxDepth: 1,
      branchVersionCount: 2,
      childCount: 1,
      descendantCount: 1,
      depth: 0,
      isLeaf: false,
      isLatestByRole: false,
      isLatestOverall: false,
      isRoot: true
    }))
    expect(api.versionItems.value[1]).toEqual(expect.objectContaining({
      ancestorCount: 1,
      branchRootId: rootVersion.id,
      branchRootLabel: 'Initial design',
      childCount: 0,
      depth: 1,
      isLeaf: true,
      isLatestByRole: true,
      isLatestOverall: true,
      isRoot: false,
      lineageIds: expect.arrayContaining([rootVersion.id]),
      lineageLabel: 'Initial design -> Add status',
      parentVersionLabel: 'Initial design',
      siblingCount: 0
    }))
  })

  it('builds a fallback checkpoint name when the caller passes an empty one', async () => {
    const { api } = await mountVersionHistoryComposable()
    const checkpoint = api.createCheckpoint({
      createdAt: '2026-03-29T12:00:00.000Z',
      includeLayout: true,
      name: '   ',
      role: 'design'
    })

    expect(checkpoint?.name).toBe('Design checkpoint 1 · 2026-03-29')
  })

  it('describes whether a compare pair is direct or branched in version history', async () => {
    const { api, source } = await mountVersionHistoryComposable()
    const rootVersion = api.createCheckpoint({
      createdAt: '2026-03-29T12:00:00.000Z',
      includeLayout: true,
      name: 'Initial design',
      role: 'design'
    })

    if (!rootVersion) {
      throw new Error('Expected the checkpoint to be created.')
    }

    source.value = importedWorkspaceSource

    const childVersion = api.createCheckpoint({
      createdAt: '2026-03-29T12:05:00.000Z',
      includeLayout: true,
      name: 'Add status',
      role: 'design'
    })

    if (!childVersion) {
      throw new Error('Expected the checkpoint to be created.')
    }

    api.setCompareTargets({
      baseId: rootVersion.id,
      targetId: childVersion.id
    })

    expect(api.compareRelationshipSummary.value).toContain('increments directly from')
  })

  it('rejects imported snapshots when the selected base version is missing', async () => {
    const { api, source } = await mountVersionHistoryComposable()
    const originalSource = source.value

    expect(api.replaceWorkspaceFromImportedSnapshot({
      basedOnVersionId: 'missing-version',
      includeLayout: true,
      source: importedWorkspaceSource
    })).toBe(false)
    expect(source.value).toBe(originalSource)
  })
})
