import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { useDialogDraft } from '../../app/composables/useDialogDraft'

const mountDialog = async (context?: () => unknown) => {
  let api!: ReturnType<typeof useDialogDraft<{ name: string, nested: { value: string } }>>
  const wrapper = await mountSuspended(defineComponent({ setup() {
    api = useDialogDraft<{ name: string, nested: { value: string } }>({ context })
    return { draft: api.draft }
  }, template: '<p v-if="draft">{{ draft.name }} {{ draft.nested.value }}</p>' }))
  return { api, wrapper }
}
describe('draft dialog lifecycle', () => {
  it('retains editable content through close and protects a reopened draft from old leave completion', async () => {
    const { api, wrapper } = await mountDialog()
    expect(api.draft.value).toBe(null)
    api.open({ name: 'First', nested: { value: 'old' } })
    api.draft.value!.nested.value = 'edited'
    await nextTick()
    expect(wrapper.text()).toBe('First edited')
    api.updateOpen(false)
    expect(api.isOpen.value).toBe(false)
    expect(api.draft.value?.nested.value).toBe('edited')
    api.open({ name: 'Second', nested: { value: 'new' } })
    api.afterLeave()
    expect(api.draft.value?.name).toBe('Second')
    api.close()
    api.afterLeave()
    expect(api.draft.value).toBe(null)
    wrapper.unmount()
  })
  it('allows one save, prevents close/edit/reopen while saving and ignores completion after disposal', async () => {
    const { api, wrapper } = await mountDialog()
    api.open({ name: 'First', nested: { value: 'old' } })
    const draft = api.beginSave()!
    expect(api.beginSave()).toBe(null)
    api.close()
    api.updateDraft({ name: 'changed' })
    expect(api.open({ name: 'Replacement', nested: { value: 'new' } })).toBe(false)
    expect(api.draft.value?.name).toBe('First')
    api.completeSave(draft, false)
    expect(api.isOpen.value).toBe(true)
    api.beginSave()
    api.completeSave(draft, true)
    expect(api.isOpen.value).toBe(false)
    expect(api.draft.value).toBe(draft)
    wrapper.unmount()
    api.completeSave(draft, false)
    expect(api.draft.value).toBe(null)
    expect(api.open({ name: 'Late', nested: { value: 'late' } })).toBe(false)
  })

  it('invalidates drafts opened before replacement both before and during save', async () => {
    const context = ref(0)
    const source = ref('original source')
    const { api, wrapper } = await mountDialog(() => [context.value, source.value])
    api.open({ name: 'Old document', nested: { value: 'draft' } })
    context.value += 1
    expect(api.isOpen.value).toBe(false)
    expect(api.beginSave()).toBe(null)
    api.afterLeave()
    api.open({ name: 'Current document', nested: { value: 'draft' } })
    const saving = api.beginSave()!
    source.value = 'new canonical source'
    api.completeSave(saving, false)
    expect(api.isOpen.value).toBe(false)
    expect(api.beginSave()).toBe(null)
    api.afterLeave()
    expect(api.draft.value).toBe(null)
    wrapper.unmount()
  })
})
