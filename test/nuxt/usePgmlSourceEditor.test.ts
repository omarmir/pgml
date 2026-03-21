import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { usePgmlSourceEditor } from '../../app/composables/usePgmlSourceEditor'

describe('usePgmlSourceEditor', () => {
  it('forwards focus requests to the registered editor handle', async () => {
    const focusSourceRange = vi.fn()
    let api!: ReturnType<typeof usePgmlSourceEditor>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlSourceEditor()
        api.focusEditorSourceRange({
          endLine: 1,
          startLine: 1
        })
        api.editorRef.value = {
          focusOffset: () => undefined,
          focusSourceRange,
          getScrollTop: () => 0,
          getValue: () => '',
          setScrollTop: () => undefined
        }

        return () => null
      }
    }))

    api.focusEditorSourceRange({
      endLine: 4,
      startLine: 2
    })

    expect(focusSourceRange).toHaveBeenCalledWith({
      endLine: 4,
      startLine: 2
    })
  })
})
