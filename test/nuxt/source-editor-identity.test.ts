import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, markRaw, nextTick } from 'vue'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import StudioWorkspacePage from '../../app/components/studio/StudioWorkspacePage.vue'
import PgmlSourceCodeEditor from '../../app/components/pgml/PgmlSourceCodeEditor.vue'
import { usePgmlStudioVersionHistory } from '../../app/composables/usePgmlStudioVersionHistory'
import { useStudioSessionStore } from '../../app/stores/studio-session'
import { useStudioShellStore } from '../../app/stores/studio-shell'
import { resetStudioWorkspaceState, useStudioWorkspaceSourceState, useStudioWorkspaceDocumentNameState, useStudioWorkspaceSessionInitializedState } from '../../app/composables/useStudioWorkspaceState'

mockNuxtImport('navigateTo', () => vi.fn(async () => undefined))
vi.mock('../../app/utils/pgml-executable-parser', async load => ({
  ...await load<typeof import('../../app/utils/pgml-executable-parser')>(),
  initializePgmlExecutableParser: () => new Promise(() => {})
}))
const NativeMutationObserver = window.MutationObserver
const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
const originalWebdriver = Object.getOwnPropertyDescriptor(navigator, 'webdriver')
beforeAll(() => {
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
  resetStudioWorkspaceState()
  if (originalWidth !== undefined) Object.defineProperty(window, 'innerWidth', originalWidth)
  if (originalWebdriver !== undefined) Object.defineProperty(navigator, 'webdriver', originalWebdriver)
  else Reflect.deleteProperty(navigator, 'webdriver')
})
const original = 'Table public.users {\n  id uuid [pk]\n}'
const replacement = 'Table public.orders {\n  id uuid [pk]\n}'
const mountOwnedEditor = async () => {
  Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true })
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  window.dispatchEvent(new Event('resize'))
  let history!: ReturnType<typeof usePgmlStudioVersionHistory>
  let source!: ReturnType<typeof useStudioWorkspaceSourceState>
  await mountSuspended(defineComponent({ setup() {
    source = useStudioWorkspaceSourceState('')
    const name = useStudioWorkspaceDocumentNameState('Original')
    history = usePgmlStudioVersionHistory({ documentName: computed(() => name.value), source })
    history.loadDocument(original)
    useStudioWorkspaceSessionInitializedState().value = true
    return () => null
  } }))
  const layout = defineComponent({ props: { isEditorPanelVisible: { type: Boolean, default: true } }, emits: ['toggle-editor-visibility'],
    template: '<div><button data-hide @click="$emit(\'toggle-editor-visibility\')">Hide</button><slot v-if="isEditorPanelVisible" name="editor"/><slot v-if="isEditorPanelVisible" name="pgml"/></div>' })
  const wrapper = await mountSuspended(StudioWorkspacePage, { props: { workspaceMode: 'diagram' }, shallow: true, route: '/diagram', global: { stubs: {
    StudioDesktopWorkspace: layout, StudioMobileWorkspace: layout, StudioEditorSurface: false, PgmlSourceCodeEditor: false
  } } })
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 150))
  const editor = wrapper.getComponent(PgmlSourceCodeEditor)
  const element = wrapper.get('[data-pgml-editor-surface]').element
  if (!(element instanceof HTMLElement)) throw new Error('Editor surface missing')
  const view = EditorView.findFromDOM(element)
  if (view === null) throw new Error('EditorView missing')
  const canonical = source.value
  expect(editor.vm.getCommittedInput()).toBe(canonical)
  const pending = canonical.replace('id uuid [pk]', 'id uuid [pk]\n  name text')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: pending } })
  await nextTick()
  expect(editor.vm.hasPendingChanges()).toBe(true)
  expect(source.value).toBe(canonical)
  const session = useStudioSessionStore()
  const accept = (text: string) => {
    const revision = session.workspaceDocumentRevision
    const intent = session.beginWorkspaceLoad('file')
    expect(session.commitWorkspaceLoad(intent, () => history.loadDocument(text))).toBe(true)
    expect(session.workspaceDocumentRevision).toBe(revision + 1)
  }
  return { wrapper, editor, view, source, canonical, pending, session, accept }
}
describe('accepted document identity in the real page editor', () => {
  it('preserves pending input when the same document hides', async () => {
    const page = await mountOwnedEditor()
    await page.wrapper.get('[data-hide]').trigger('click')
    expect(page.source.value).toBe(page.pending)
  })
  it('replaces a pending edit when a different-byte document is accepted', async () => {
    const page = await mountOwnedEditor()
    page.accept(replacement)
    await nextTick()
    expect(page.view.state.doc.toString()).toBe(page.source.value)
    await vi.advanceTimersByTimeAsync(1000)
    expect(page.source.value).toContain('public.orders')
    expect(page.source.value).not.toContain('name text')
  })
  it.each(['timer', 'hide'])('rejects an old pending edit after equal-byte replacement then %s', async (action) => {
    const page = await mountOwnedEditor()
    page.accept(page.canonical)
    await nextTick()
    expect(page.editor.vm.getDocumentContextRevision()).toBe(page.session.workspaceDocumentRevision)
    expect(page.editor.vm.hasPendingChanges()).toBe(false)
    if (action === 'hide') await page.wrapper.get('[data-hide]').trigger('click')
    else await vi.advanceTimersByTimeAsync(1000)
    expect(page.source.value).toBe(page.canonical)
  })
  it.each(['hide', 'compact'])('keeps accepted equal bytes when replacement and %s happen in one parent turn', async (action) => {
    const page = await mountOwnedEditor()
    page.accept(page.canonical)
    if (action === 'hide') await page.wrapper.get('[data-hide]').trigger('click')
    else {
      Object.defineProperty(window, 'innerWidth', { value: 700, configurable: true })
      window.dispatchEvent(new Event('resize'))
      await nextTick()
    }
    await vi.advanceTimersByTimeAsync(1000)
    expect(page.source.value).toBe(page.canonical)
  })
  it('retains pending input through an ordinary same-document external echo', async () => {
    const page = await mountOwnedEditor()
    const revision = page.session.workspaceDocumentRevision
    page.source.value = page.canonical
    await nextTick()
    expect(page.session.workspaceDocumentRevision).toBe(revision)
    await vi.advanceTimersByTimeAsync(1000)
    expect(page.source.value).toBe(page.pending)
  })
})

const chooseAnalysis = () => {
  const action = useStudioShellStore().headerMenus.find(menu => menu.id === 'workspace')?.items.flat().find(item => item.label === 'Analysis')
  if (action === undefined || action.onSelect === undefined) throw new Error('Public Analysis action missing')
  return action.onSelect
}
it('does not flush an old buffered edit into an equal-byte replacement through a same-turn public operation', async () => {
  const page = await mountOwnedEditor()
  const analysis = chooseAnalysis()
  const editorRevision = page.editor.vm.getDocumentContextRevision()
  page.accept(page.canonical)
  expect(page.editor.vm.getDocumentContextRevision()).toBe(editorRevision)
  expect(editorRevision).not.toBe(page.session.workspaceDocumentRevision)
  expect(page.editor.vm.hasPendingChanges()).toBe(true)
  analysis(new Event('select'))
  await nextTick()
  await vi.advanceTimersByTimeAsync(2000)
  expect(page.source.value).toBe(page.canonical)
})
it('flushes ordinary same-document buffered input through the same public operation', async () => {
  const page = await mountOwnedEditor()
  chooseAnalysis()(new Event('select'))
  await nextTick()
  await vi.advanceTimersByTimeAsync(2000)
  expect(page.source.value).toBe(page.pending)
})
