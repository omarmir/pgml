import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'

import {
  createInitialPgmlDocument,
  serializePgmlDocument
} from '../../app/utils/pgml-document'
import { usePgmlStudioVersionHistory } from '../../app/composables/usePgmlStudioVersionHistory'

const baseWorkspaceSource = `Table public.users {
  id uuid [pk]
}`

const importedWorkspaceSource = `Table public.users {
  id uuid [pk]
  status text
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

describe('usePgmlStudioVersionHistory', () => {
  it('creates checkpoints, previews locked versions, restores them, and replaces the workspace from imports', async () => {
    const { api, source } = await mountVersionHistoryComposable()

    expect(api.workspaceDirty.value).toBe(true)
    expect(api.canCheckpoint.value).toBe(true)

    const initialVersion = api.createCheckpoint({
      createdAt: '2026-03-29T12:00:00.000Z',
      includeLayout: true,
      name: 'Initial design',
      role: 'design'
    })

    if (!initialVersion) {
      throw new Error('Expected the checkpoint to be created.')
    }

    expect(api.document.value.workspace.basedOnVersionId).toBe(initialVersion.id)
    expect(api.workspaceBaseVersion.value?.id).toBe(initialVersion.id)
    expect(api.versionedDocumentSource.value).toContain('VersionSet "Billing"')
    expect(api.versionedDocumentSource.value).toContain(`Version ${initialVersion.id}`)

    api.replaceWorkspaceFromImportedSnapshot({
      basedOnVersionId: initialVersion.id,
      includeLayout: true,
      source: importedWorkspaceSource
    })

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
    const document = createInitialPgmlDocument({
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
      workspaceSource: importedWorkspaceSource
    })

    api.loadDocument(serializePgmlDocument(document))

    expect(source.value).toContain('Table public.users')
    expect(source.value).toContain('status text')
    expect(api.document.value.versions).toHaveLength(1)
    expect(api.compareBaseId.value).toBe(api.document.value.workspace.basedOnVersionId)
    expect(api.compareTargetId.value).toBe('workspace')
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

  it('clamps invalid preview and compare ids back to valid version history targets', async () => {
    const { api } = await mountVersionHistoryComposable()
    const initialVersion = api.createCheckpoint({
      createdAt: '2026-03-29T12:00:00.000Z',
      includeLayout: true,
      name: 'Initial design',
      role: 'design'
    })

    if (!initialVersion) {
      throw new Error('Expected the checkpoint to be created.')
    }

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

    const branchVersion = api.createCheckpoint({
      createdAt: '2026-03-29T12:05:00.000Z',
      includeLayout: true,
      name: 'Add status',
      role: 'design'
    })

    expect(branchVersion?.id).toBeTruthy()
    expect(api.versionItems.value[0]).toEqual(expect.objectContaining({
      childCount: 1,
      depth: 0,
      isRoot: true
    }))
    expect(api.versionItems.value[1]).toEqual(expect.objectContaining({
      childCount: 0,
      depth: 1,
      isRoot: false
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
})
