import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { defineComponent, onMounted } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StudioWorkspacePage from '../../app/components/studio/StudioWorkspacePage.vue'
import { useStudioShellStore } from '../../app/stores/studio-shell'
import { useStudioSessionStore } from '../../app/stores/studio-session'
import { resetStudioWorkspaceState } from '../../app/composables/useStudioWorkspaceState'
import type { PgmlSourceEditorHandle } from '../../app/composables/usePgmlSourceEditor'

const boundary = vi.hoisted(() => ({ navigate: vi.fn(async () => undefined) }))
mockNuxtImport('navigateTo', () => boundary.navigate)
vi.mock('../../app/utils/pgml-executable-parser', async load => ({
  ...await load<typeof import('../../app/utils/pgml-executable-parser')>(),
  initializePgmlExecutableParser: () => new Promise(() => {})
}))
enableAutoUnmount(afterEach)
afterEach(() => {
  resetStudioWorkspaceState()
  boundary.navigate.mockClear()
})
const deferred = () => {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}
const mountActions = async (options: { mode?: 'diagram' | 'analysis', render?: () => Promise<void> } = {}) => {
  const flush = deferred()
  const exportDiagram = vi.fn(options.render === undefined ? async () => {} : options.render)
  const flushChanges = vi.fn(() => flush.promise)

  const canvas = defineComponent({ props: { exportInProgress: Boolean }, emits: ['exportDiagram'], setup(_, { expose }) {
    expose({ exportDiagram, getNodeLayoutProperties: () => ({}) })
    return {}
  }, template: '<button data-panel-export :disabled="exportInProgress" @click="$emit(\'exportDiagram\', {format: \'png\', scaleFactor: 2})">PNG</button>' })
  const editorSurface = defineComponent({ props: {
    editorRefSetter: { type: Function, required: true }, modelValue: { type: String, required: true }, documentContextRevision: { type: Number, default: 0 }
  }, setup(props) {
    const editor: PgmlSourceEditorHandle = { flushPendingChanges: flushChanges, focusOffset: () => {}, focusSourceRange: () => {},
      getCommittedInput: () => props.modelValue, getDocumentContextRevision: () => props.documentContextRevision,
      getScrollTop: () => 0, getValue: () => props.modelValue, hasPendingChanges: () => true, setScrollTop: () => {} }
    onMounted(() => props.editorRefSetter(editor))
    return {}
  }, template: '<div />' })
  const layout = defineComponent({ template: '<div><slot name="editor"/><slot name="canvas"/><slot name="pgml"/><slot name="diagram"/></div>' })
  const wrapper = await mountSuspended(StudioWorkspacePage, { shallow: true, route: options.mode === 'analysis' ? '/analysis' : '/diagram', props: { workspaceMode: options.mode === undefined ? 'diagram' : options.mode }, global: { stubs: {
    StudioDesktopWorkspace: layout, StudioMobileWorkspace: layout, StudioEditorSurface: editorSurface, PgmlDiagramCanvas: canvas
  } } })
  await flushPromises()
  const shell = useStudioShellStore()
  const session = useStudioSessionStore()
  const select = (label: string, menuId = 'export') => {
    const item = shell.headerMenus.find(menu => menu.id === menuId)?.items.flat().find(entry => entry.label === label)
    if (item === undefined || item.onSelect === undefined) throw new Error(`Missing export ${label}`)
    item.onSelect(new Event('select'))
  }
  return { wrapper, shell, session, flush, flushChanges, exportDiagram, select }
}
describe('workspace image export ownership', () => {
  it('enters busy before editor flush and performs one captured export', async () => {
    const { shell, flush, flushChanges, exportDiagram, select } = await mountActions()
    select('SVG')
    select('PNG 2x')
    await nextTick()
    expect(flushChanges).toHaveBeenCalledTimes(1)
    expect(shell.isHeaderLoading).toBe(true)
    expect(shell.headerMenus.find(menu => menu.id === 'export')?.items.flat().every(item => item.disabled)).toBe(true)
    flush.resolve()
    await flushPromises()
    expect(exportDiagram).toHaveBeenCalledExactlyOnceWith('svg', undefined)
    expect(shell.isHeaderLoading).toBe(false)
  })
  it('recovers after flush failure so the next action can succeed', async () => {
    const { flush, flushChanges, shell, exportDiagram, select } = await mountActions()
    select('SVG')
    flush.reject(new Error('Editor flush failed'))
    await flushPromises()
    expect(shell.isHeaderLoading).toBe(false)
    expect(exportDiagram).not.toHaveBeenCalled()
    flushChanges.mockResolvedValue()
    select('PNG 2x')
    await flushPromises()
    expect(exportDiagram).toHaveBeenCalledExactlyOnceWith('png', 2)
  })
  it.each(['dispose', 'replace'])('suppresses a held export after %s', async (action) => {
    const { wrapper, session, flush, exportDiagram, select } = await mountActions()
    select('SVG')
    if (action === 'dispose') wrapper.unmount()
    else session.supersedeWorkspaceDocument()
    flush.resolve()
    await flushPromises()
    expect(exportDiagram).not.toHaveBeenCalled()
  })
})

describe('workspace navigation ownership', () => {
  it('serializes persistence before one captured navigation and disables repeated workspace actions', async () => {
    const { select, shell, flushChanges, flush } = await mountActions()
    select('Analysis', 'workspace')
    select('Analysis', 'workspace')
    await nextTick()
    expect(flushChanges).toHaveBeenCalledTimes(1)
    expect(boundary.navigate).not.toHaveBeenCalled()
    expect(shell.headerMenus.find(menu => menu.id === 'workspace')?.items.flat().every(item => item.disabled)).toBe(true)
    flush.resolve()
    await flushPromises()
    expect(boundary.navigate).toHaveBeenCalledExactlyOnceWith({ path: '/analysis', query: undefined })
    // A successful departing host stays navigating until disposal, avoiding a late header republish.
    expect(shell.headerMenus.find(menu => menu.id === 'workspace')?.items.flat().every(item => item.disabled)).toBe(true)
  })
  it.each(['dispose', 'replace'])('does not navigate an obsolete pending document after %s', async (action) => {
    const { select, wrapper, session, flush } = await mountActions()
    select('Analysis', 'workspace')
    if (action === 'dispose') wrapper.unmount()
    else session.supersedeWorkspaceDocument()
    flush.resolve()
    await flushPromises()
    expect(boundary.navigate).not.toHaveBeenCalled()
  })
  it('returns to available navigation after a failed flush', async () => {
    const { select, shell, flushChanges, flush } = await mountActions()
    select('Analysis', 'workspace')
    flush.reject(new Error('Flush rejected'))
    await flushPromises()
    expect(boundary.navigate).not.toHaveBeenCalled()
    expect(shell.headerMenus.find(menu => menu.id === 'workspace')?.items.flat().find(item => item.label === 'Analysis')?.disabled).toBe(false)
    flushChanges.mockResolvedValue()
    select('Analysis', 'workspace')
    await flushPromises()
    expect(boundary.navigate).toHaveBeenCalledExactlyOnceWith({ path: '/analysis', query: undefined })
  })
})

it('a departing export completion cannot republish its header over a newer live workspace', async () => {
  const render = deferred()
  const old = await mountActions({ render: () => render.promise })
  old.select('SVG')
  old.flush.resolve()
  await flushPromises()
  expect(old.exportDiagram).toHaveBeenCalledTimes(1)
  old.select('Analysis', 'workspace')
  await flushPromises()
  const current = await mountActions({ mode: 'analysis' })
  const diagramAction = () => current.shell.headerMenus.find(menu => menu.id === 'workspace')?.items.flat().find(item => item.label === 'Diagram')
  expect(diagramAction()?.disabled).toBe(false)
  render.resolve()
  await flushPromises()
  expect(diagramAction()?.disabled).toBe(false)
})

it('panel requests and header actions share the same pre-flush export owner', async () => {
  const { wrapper, select, flush, flushChanges, exportDiagram } = await mountActions()
  await wrapper.get('[data-panel-export]').trigger('click')
  select('SVG')
  expect(flushChanges).toHaveBeenCalledTimes(1)
  expect(wrapper.get('[data-panel-export]').attributes('disabled')).toBeDefined()
  expect(exportDiagram).not.toHaveBeenCalled()
  flush.resolve()
  await flushPromises()
  expect(exportDiagram).toHaveBeenCalledExactlyOnceWith('png', 2)
})

it('a newer workspace header owns publication even when the old host did not initiate navigation', async () => {
  const render = deferred()
  const old = await mountActions({ render: () => render.promise })
  old.select('SVG')
  old.flush.resolve()
  await flushPromises()
  const current = await mountActions({ mode: 'analysis' })
  const diagramAction = () => current.shell.headerMenus.find(menu => menu.id === 'workspace')?.items.flat().find(item => item.label === 'Diagram')
  expect(diagramAction()?.disabled).toBe(false)
  render.resolve()
  await flushPromises()
  expect(diagramAction()?.disabled).toBe(false)
  old.wrapper.unmount()
  expect(diagramAction()?.disabled).toBe(false)
})
