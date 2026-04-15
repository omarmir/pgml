import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import { usePgmlStudioVersionHistory } from '../../app/composables/usePgmlStudioVersionHistory'
import {
  resetStudioWorkspaceState,
  useStudioWorkspaceDocumentNameState,
  useStudioWorkspaceSourceState
} from '../../app/composables/useStudioWorkspaceState'

describe('studio workspace shared state', () => {
  afterEach(() => {
    resetStudioWorkspaceState()
  })

  it('keeps the active versioned document across component remounts', async () => {
    let firstApi!: ReturnType<typeof usePgmlStudioVersionHistory>
    const firstWrapper = await mountSuspended(defineComponent({
      setup() {
        const source = useStudioWorkspaceSourceState('')
        const documentName = useStudioWorkspaceDocumentNameState('Untitled schema')

        firstApi = usePgmlStudioVersionHistory({
          documentName: computed(() => documentName.value),
          source
        })

        return () => null
      }
    }))

    firstApi.loadDocument(`VersionSet "Billing" {
  Workspace {
    Snapshot {
      Table public.users {
        id uuid [pk]
        status text
      }
    }
  }
}`)
    firstApi.createCheckpoint({
      createdAt: '2026-04-15T14:00:00.000Z',
      includeLayout: true,
      name: 'Initial design',
      role: 'design'
    })

    expect(firstApi.versions.value).toHaveLength(1)
    firstWrapper.unmount()

    let secondApi!: ReturnType<typeof usePgmlStudioVersionHistory>
    await mountSuspended(defineComponent({
      setup() {
        const source = useStudioWorkspaceSourceState('')
        const documentName = useStudioWorkspaceDocumentNameState('Untitled schema')

        secondApi = usePgmlStudioVersionHistory({
          documentName: computed(() => documentName.value),
          source
        })

        return () => null
      }
    }))

    expect(secondApi.previewSource.value).toContain('status text')
    expect(secondApi.versions.value).toHaveLength(1)
    expect(secondApi.versions.value[0]?.name).toBe('Initial design')
  })
})
