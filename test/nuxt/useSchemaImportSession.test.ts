import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { useSchemaImportSession } from '../../app/composables/useSchemaImportSession'

type Draft = { kind: 'dbml' | 'pg_dump', text: string, file: File | null, fold: boolean }
const copy = { conflict: 'Choose one input.', missing: 'Choose an input.' }
const mountImport = async () => {
  let api!: ReturnType<typeof useSchemaImportSession<Draft, { table: string }>>
  const wrapper = await mountSuspended(defineComponent({
    setup() {
      api = useSchemaImportSession<Draft, { table: string }>()
      return {}
    },
    template: '<div />'
  }))
  return { api, wrapper }
}
describe('schema import lifecycle', () => {
  it('validates inputs and freezes options/file before a deferred read; busy close/edit/submit cannot change them', async () => {
    const { api, wrapper } = await mountImport()
    api.open({ kind: 'dbml', text: '', file: null, fold: true })
    expect(api.begin(copy)).toBe(null)
    expect(api.error.value).toBe(copy.missing)
    let release!: (text: string) => void
    const file = new File(['unused'], 'schema.dbml')
    file.text = () => new Promise((resolve) => {
      release = resolve
    })
    api.edit(draft => ({ ...draft, text: 'conflict', file }))
    expect(api.begin(copy)).toBe(null)
    expect(api.error.value).toBe(copy.conflict)
    api.edit(draft => ({ ...draft, text: '' }))
    const request = api.begin(copy)!
    const read = request.draft.file!.text()
    api.close()
    api.edit(draft => ({ ...draft, fold: false, file: null }))
    expect(api.open({ kind: 'pg_dump', text: 'new', file: null, fold: false })).toBe(false)
    expect(api.begin(copy)).toBe(null)
    release('Table CamelCase { id int }')
    expect(await read).toContain('CamelCase')
    expect(request.draft.fold).toBe(true)
    expect(request.draft.file).toBe(file)
    api.fail(request, 'Retry conversion')
    expect(api.isOpen.value).toBe(true)
    expect(api.error.value).toBe('Retry conversion')
    expect(api.draft.value?.fold).toBe(true)
    wrapper.unmount()
  })
  it('retains source options on placement back, owns apply, and protects reopen from old leave', async () => {
    const { api, wrapper } = await mountImport()
    api.open({ kind: 'pg_dump', text: 'dump', file: null, fold: true })
    const reading = api.begin(copy)!
    api.place(reading, { table: 'public.a' })
    expect(api.isOpen.value).toBe(false)
    api.afterLeave('pg_dump')
    expect(api.isPlacing.value).toBe(true)
    api.back()
    expect(api.draft.value?.text).toBe('dump')
    const retry = api.begin(copy)!
    api.place(retry, { table: 'public.a' })
    api.editPlacement(() => ({ table: 'public.b' }))
    const apply = api.beginApply()!
    expect(api.beginApply()).toBe(null)
    expect(apply.kind === 'applying' && apply.placement.table).toBe('public.b')
    api.fail(apply, 'Base expired')
    expect(api.isPlacing.value).toBe(true)
    const accepted = api.beginApply()!
    expect(api.complete(accepted)).toBe(true)
    expect(api.placement.value?.table).toBe('public.b')
    api.afterLeave('pg_dump')
    expect(api.placement.value?.table).toBe('public.b')
    api.open({ kind: 'dbml', text: 'new', file: null, fold: false })
    api.afterLeave('placement')
    expect(api.draft.value?.text).toBe('new')
    wrapper.unmount()
  })
  it('ignores all late read/error/placement completion after disposal', async () => {
    const { api, wrapper } = await mountImport()
    api.open({ kind: 'dbml', text: 'schema', file: null, fold: false })
    const request = api.begin(copy)!
    wrapper.unmount()
    expect(api.owns(request)).toBe(false)
    api.fail(request, 'late')
    api.place(request, { table: 'late' })
    expect(api.complete(request)).toBe(false)
    expect(api.draft.value).toBe(null)
    expect(api.error.value).toBe(null)
  })
})
