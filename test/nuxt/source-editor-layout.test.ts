import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount } from '@vue/test-utils'
import { defineComponent, markRaw, nextTick, ref, shallowRef, watch } from 'vue'
import type { ShallowRef } from 'vue'
import { EditorView } from '@codemirror/view'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as language from '../../app/utils/pgml-language'
import PgmlSourceCodeEditor from '../../app/components/pgml/PgmlSourceCodeEditor.vue'

const original = 'Table public.original {\n  id uuid\n}'
const typed = 'Table public.original {\n  id uuid\n  title text\n}'
const external = 'Table public.external {\n  external_id bigint\n}'
const NativeMutationObserver = window.MutationObserver
beforeAll(() => {
  // Happy DOM observers use JS private fields; keep the external DOM handle raw.
  window.MutationObserver = class extends NativeMutationObserver {
    constructor(callback: MutationCallback) {
      super(callback)
      markRaw(this)
    }
  }
})
afterAll(() => {
  window.MutationObserver = NativeMutationObserver
})
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const mountEditor = async () => {
  Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false })
  const model = ref(original)
  const shown = ref(true)
  const compact = ref(false)
  const updates: string[] = []
  const wrapper = await mountSuspended(defineComponent({
    components: { PgmlSourceCodeEditor },
    setup() {
      const editor: ShallowRef<InstanceType<typeof PgmlSourceCodeEditor> | null> = shallowRef(null)
      watch([shown, compact], ([visible, nextCompact], [, wasCompact]) => {
        const handle = editor.value
        if ((!visible || nextCompact !== wasCompact) && handle !== null && handle.getCommittedInput() === model.value && handle.hasPendingChanges()) {
          void handle.flushPendingChanges()
        }
      }, { flush: 'sync' })
      const update = (value: string) => {
        updates.push(value)
        model.value = value
      }
      const hide = () => {
        shown.value = false
      }
      const replaceAndHide = () => {
        model.value = external
        shown.value = false
      }
      const replace = () => {
        model.value = external
      }
      const compactOn = () => {
        compact.value = true
      }
      const replaceAndCompact = () => {
        model.value = external
        compact.value = true
      }
      return { model, shown, compact, update, hide, replaceAndHide, replace, compactOn, replaceAndCompact, editor }
    },
    template: `<div>
      <button data-hide type="button" @click="hide">Hide</button>
      <button data-replace-hide type="button" @click="replaceAndHide">Replace and hide</button>
      <button data-replace type="button" @click="replace">Replace</button>
      <button data-compact type="button" @click="compactOn">Compact</button>
      <button data-replace-compact type="button" @click="replaceAndCompact">Replace and compact</button>
      <PgmlSourceCodeEditor v-if="shown && !compact" ref="editor" :model-value="model" :commit-debounce-ms="1000" language-mode="sql" @update:model-value="update" />
      <PgmlSourceCodeEditor v-else-if="shown && compact" ref="editor" :model-value="model" :commit-debounce-ms="1000" language-mode="sql" @update:model-value="update" />
      <output>{{ model }}</output>
    </div>`
  }))
  const host = wrapper.get('[data-pgml-editor="true"]').element
  if (!('__pgmlEditorView' in host) || !(host.__pgmlEditorView instanceof EditorView)) throw new Error('EditorView missing')
  const view = host.__pgmlEditorView
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: typed } })
  await nextTick()
  expect(model.value).toBe(original)
  expect(updates).toEqual([])
  return { wrapper, model, updates }
}
describe('source-associated editor layout transitions', () => {
  it.each(['hide', 'compact'])('retains pending real editor input through %s', async (action) => {
    const { wrapper, model } = await mountEditor()
    await wrapper.get(`[data-${action}]`).trigger('click')
    expect(model.value).toBe(typed)
    if (action === 'hide') expect(wrapper.find('[data-pgml-editor="true"]').exists()).toBe(false)
    else expect(wrapper.get('[data-pgml-editor="true"]').text()).toContain('title text')
  })
  it.each(['replace-hide', 'replace-compact'])('keeps a newer external source during same-turn %s', async (action) => {
    const { wrapper, model, updates } = await mountEditor()
    await wrapper.get(`[data-${action}]`).trigger('click')
    expect(model.value).toBe(external)
    expect(updates).toEqual([])
  })
  it('keeps an external source delivered before hiding', async () => {
    const { wrapper, model, updates } = await mountEditor()
    await wrapper.get('[data-replace]').trigger('click')
    await wrapper.get('[data-hide]').trigger('click')
    expect(model.value).toBe(external)
    expect(updates).toEqual([])
  })
})

const readEditorView = (element: Element) => {
  if (!('__pgmlEditorView' in element) || !(element.__pgmlEditorView instanceof EditorView)) throw new Error('EditorView missing')
  return element.__pgmlEditorView
}
describe('source editor scheduler ownership', () => {
  it('coalesces delayed commits, flushes once, accepts external input and suppresses disposed timers', async () => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false })
    const update = vi.fn()
    const wrapper = await mountSuspended(PgmlSourceCodeEditor, { props: { 'modelValue': original, 'languageMode': 'sql', 'commitDebounceMs': 1000, 'onUpdate:modelValue': update } })
    const handle = wrapper.vm
    const view = readEditorView(wrapper.element)
    vi.useFakeTimers()
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: typed } })
    await vi.advanceTimersByTimeAsync(900)
    expect(update).not.toHaveBeenCalled()
    const latest = typed + '\n// latest'
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: latest } })
    await vi.advanceTimersByTimeAsync(900)
    expect(update).not.toHaveBeenCalled()
    await handle.flushPendingChanges()
    expect(update).toHaveBeenCalledExactlyOnceWith(latest)
    await wrapper.setProps({ modelValue: latest })
    await vi.advanceTimersByTimeAsync(1100)
    expect(update).toHaveBeenCalledTimes(1)
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: typed } })
    await wrapper.setProps({ modelValue: external })
    expect(handle.getValue()).toBe(external)
    await vi.advanceTimersByTimeAsync(1100)
    expect(update).toHaveBeenCalledTimes(1)
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: typed } })
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(1100)
    expect(update).toHaveBeenCalledTimes(1)
    expect(handle.hasPendingChanges()).toBe(false)
  })
  it('ignores superseded idle analysis, SQL-mode callbacks and analysis after disposal', async () => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: false })
    const callbacks: IdleRequestCallback[] = []
    const cancel = vi.fn()
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => callbacks.push(callback))
    vi.stubGlobal('cancelIdleCallback', cancel)
    const analyze = vi.spyOn(language, 'analyzePgmlDocument')
    const wrapper = await mountSuspended(PgmlSourceCodeEditor, { props: { modelValue: original, languageMode: 'pgml-snippet', commitDebounceMs: 1000 } })
    const first = callbacks[0]!
    vi.useFakeTimers()
    const view = readEditorView(wrapper.element)
    analyze.mockClear()
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: typed } })
    await vi.advanceTimersByTimeAsync(121)
    const current = callbacks.at(-1)!
    expect(current).not.toBe(first)
    const deadline = { didTimeout: false, timeRemaining: () => 50 }
    first(deadline)
    expect(analyze).not.toHaveBeenCalled()
    current(deadline)
    expect(analyze).toHaveBeenCalledExactlyOnceWith(typed)
    await wrapper.setProps({ languageMode: 'sql' })
    current(deadline)
    expect(analyze).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ languageMode: 'pgml-snippet' })
    const disposed = callbacks.at(-1)!
    wrapper.unmount()
    disposed(deadline)
    await vi.advanceTimersByTimeAsync(1100)
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalled()
  })
})
