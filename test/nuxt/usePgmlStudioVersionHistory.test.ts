import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'

import { usePgmlStudioVersionHistory } from '../../app/composables/usePgmlStudioVersionHistory'

const baseWorkspaceSource = `Table public.users {
  id uuid [pk]
}`

const importedWorkspaceSource = `Table public.users {
  id uuid [pk]
  status text
}`

describe('usePgmlStudioVersionHistory', () => {
  it('creates checkpoints, previews locked versions, restores them, and replaces the workspace from imports', async () => {
    const source = ref(baseWorkspaceSource)
    const documentName = ref('Billing')
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
    expect(source.value).toBe(importedWorkspaceSource)

    expect(api.replaceWorkspaceFromVersion(initialVersion.id)).toBe(true)
    expect(api.previewTargetId.value).toBe('workspace')
    expect(source.value).toBe(baseWorkspaceSource)
    expect(api.compareTargetId.value).toBe('workspace')
  })
})
