import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePgmlStudioSchemas } from '../../app/composables/usePgmlStudioSchemas'
import { resetStudioWorkspaceState } from '../../app/composables/useStudioWorkspaceState'

const mountBrowser = async (source: Ref<string>) => {
  let api!: ReturnType<typeof usePgmlStudioSchemas>
  const wrapper = await mountSuspended(defineComponent({ setup() {
    api = usePgmlStudioSchemas({ source, initialSource: '', buildSchemaText: () => source.value,
      canEmbedLayout: computed(() => true), restoreLatestOnSetup: false })
    return () => null
  } }))
  return { api, wrapper }
}

describe('browser persistence across workspace remounts', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetStudioWorkspaceState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retains saved identity, dirty edits, and an in-flight save across remounts', async () => {
    const source = ref('Table public.original { id uuid [pk] }')
    const first = await mountBrowser(source)
    expect(await first.api.saveSchemaToBrowser()).toBe(true)
    const savedId = first.api.currentSchemaId.value
    expect(savedId).not.toBeNull()
    source.value = 'Table public.edited { id uuid [pk] }'
    expect(first.api.hasPendingLocalChanges.value).toBe(true)
    first.wrapper.unmount()

    const second = await mountBrowser(source)
    expect(second.api.currentSchemaId.value).toBe(savedId)
    expect(second.api.hasPendingLocalChanges.value).toBe(true)
    expect(second.api.hasSavedSchemaInSession.value).toBe(true)
    const saving = second.api.saveSchemaToBrowser()
    second.wrapper.unmount()
    const third = await mountBrowser(source)
    expect(await saving).toBe(true)
    expect(third.api.currentSchemaId.value).toBe(savedId)
    expect(third.api.hasPendingLocalChanges.value).toBe(false)
    const stored: { id: string, text: string }[] = JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') ?? '[]')
    expect(stored).toHaveLength(1)
    expect(stored[0]?.id).toBe(savedId)
    expect(stored[0]?.text).toContain('public.edited')
  })
  it('discards an unmounted autosave and resumes dirty text in the next workspace', async () => {
    vi.useFakeTimers()
    const source = ref('Table public.original { id uuid [pk] }')
    const first = await mountBrowser(source)
    await first.api.saveSchemaToBrowser()
    const id = first.api.currentSchemaId.value
    source.value = 'Table public.resume_after_remount { id uuid [pk] }'
    await nextTick()
    first.wrapper.unmount()
    await vi.advanceTimersByTimeAsync(5000)
    expect(window.localStorage.getItem('pgml-studio-schemas-v1')).not.toContain('resume_after_remount')
    const second = await mountBrowser(source)
    expect(second.api.currentSchemaId.value).toBe(id)
    expect(second.api.hasPendingLocalChanges.value).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(window.localStorage.getItem('pgml-studio-schemas-v1')).toContain('resume_after_remount')
    expect(second.api.currentSchemaId.value).toBe(id)
    expect(second.api.hasPendingLocalChanges.value).toBe(false)
  })
})
