import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePgmlDocumentLoader } from '../../app/composables/usePgmlDocumentLoader'
import { usePgmlStudioVersionHistory } from '../../app/composables/usePgmlStudioVersionHistory'
import { usePgmlStudioSchemas } from '../../app/composables/usePgmlStudioSchemas'
import { usePgmlStudioComputerFiles } from '../../app/composables/usePgmlStudioComputerFiles'
import { resetStudioWorkspaceState } from '../../app/composables/useStudioWorkspaceState'
import { useStudioSessionStore } from '../../app/stores/studio-session'
import { preparePgmlDocumentForLoad } from '../../app/utils/pgml-document'
import type { PgmlDocumentLoadWorkerRequest, PgmlDocumentLoadWorkerResponse } from '../../app/utils/pgml-document-load'

class LoadWorker {
  static instances: LoadWorker[] = []
  onmessage: ((event: MessageEvent<PgmlDocumentLoadWorkerResponse>) => void) | null = null
  onerror: (() => void) | null = null
  request: PgmlDocumentLoadWorkerRequest | null = null
  terminate = vi.fn()
  constructor() { LoadWorker.instances.push(this) }
  postMessage = (request: PgmlDocumentLoadWorkerRequest) => { this.request = request }
  reply = (error = false) => {
    if (this.request === null) throw new Error('Missing request')
    const data: PgmlDocumentLoadWorkerResponse = error
      ? { kind: 'failed', revision: this.request.revision, message: 'Invalid PGML' }
      : { kind: 'loaded', revision: this.request.revision, document: preparePgmlDocumentForLoad(this.request) }
    this.onmessage?.(new MessageEvent('message', { data }))
  }
}

const mountLoader = async (applyDocument = vi.fn(), onError = vi.fn()) => {
  let api!: ReturnType<typeof usePgmlDocumentLoader>
  const wrapper = await mountSuspended(defineComponent({ setup() {
    api = usePgmlDocumentLoader({ documentName: () => 'Test', applyDocument, onError })
    return () => null
  } }))
  return { api, wrapper, applyDocument, onError }
}

describe('document load ownership', () => {
  beforeEach(() => {
    resetStudioWorkspaceState()
    useStudioSessionStore().resetStudioUiState()
    LoadWorker.instances = []
    vi.stubGlobal('Worker', LoadWorker)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('cancels an older host as soon as a cross-source read begins and commits document/selection together', async () => {
    const store = useStudioSessionStore()
    const first = await mountLoader()
    const second = await mountLoader()
    const oldSelection = vi.fn()
    const old = first.api.load({ text: 'Table old { id int }', intent: store.beginWorkspaceLoad('file'), commitPersistence: oldSelection })
    const intent = store.beginWorkspaceLoad('gist')
    expect(await old).toBe(false)
    expect(LoadWorker.instances[0]!.terminate).toHaveBeenCalledOnce()
    LoadWorker.instances[0]!.reply()
    const commit = vi.fn(() => expect(store.isWorkspaceLoading).toBe(true))
    const latest = second.api.load({ text: 'Table latest { id int }', intent, commitPersistence: commit })
    first.wrapper.unmount()
    LoadWorker.instances[1]!.reply()
    expect(await latest).toBe(true)
    expect(oldSelection).not.toHaveBeenCalled()
    expect(first.applyDocument).not.toHaveBeenCalled()
    expect(second.applyDocument).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledOnce()
    expect(store.currentSourceKind).toBe('gist')
    expect(store.isWorkspaceLoading).toBe(false)
    second.wrapper.unmount()
  })

  it('settles failed and disposed workers without selecting a failed document or publishing late errors', async () => {
    const store = useStudioSessionStore()
    const mounted = await mountLoader()
    const commit = vi.fn()
    const failed = mounted.api.load({ text: 'bad', intent: store.beginWorkspaceLoad('file'), commitPersistence: commit })
    LoadWorker.instances[0]!.reply(true)
    expect(await failed).toBe(false)
    expect(mounted.onError).toHaveBeenCalledWith('Invalid PGML')
    const disposed = mounted.api.load({ text: 'later', intent: store.beginWorkspaceLoad('file'), commitPersistence: commit })
    mounted.wrapper.unmount()
    expect(await disposed).toBe(false)
    LoadWorker.instances[1]!.reply(true)
    expect(mounted.onError).toHaveBeenCalledTimes(1)
    expect(commit).not.toHaveBeenCalled()
    expect(store.isWorkspaceLoading).toBe(false)
  })

  it('keeps a newer browser selection when an old file already entered worker preparation in another live host', async () => {
    const store = useStudioSessionStore()
    const source = ref('previous')
    let files!: ReturnType<typeof usePgmlStudioComputerFiles>
    let browser!: ReturnType<typeof usePgmlStudioSchemas>
    const mountHost = async (kind: 'file' | 'browser') => mountSuspended(defineComponent({ setup() {
      const loader = usePgmlDocumentLoader({ documentName: () => 'Test', applyDocument: () => {
        source.value = kind
      }, onError: vi.fn() })
      if (kind === 'file') {
        files = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value, applyLoadedFileText: loader.load,
          fileOperations: { listRecentComputerFiles: async () => [], loadRecentComputerFile: async () => ({ entry: { id: 'old', name: 'old', updatedAt: 'old' }, text: 'Table old { id int }' }) } })
      } else {
        browser = usePgmlStudioSchemas({ source, buildSchemaText: () => source.value, canEmbedLayout: computed(() => true), initialSource: '', restoreLatestOnSetup: false, applyLoadedSchemaText: loader.load })
      }
      return () => null
    } }))
    const oldHost = await mountHost('file')
    const newHost = await mountHost('browser')
    const old = files.loadRecentComputerFileById('old')
    await nextTick()
    const latest = browser.clearSchema()
    expect(await old).toBe(false)
    oldHost.unmount()
    LoadWorker.instances[0]!.reply()
    expect(source.value).toBe('previous')
    LoadWorker.instances[1]!.reply()
    expect(await latest).toBe(true)
    expect(source.value).toBe('browser')
    expect(store.currentSourceKind).toBe('browser')
    expect(files.currentComputerFileId.value).toBe(null)
    newHost.unmount()
  })

  it('invalidates and settles preparation when shared workspace state resets', async () => {
    const store = useStudioSessionStore()
    const mounted = await mountLoader()
    const commit = vi.fn()
    const loading = mounted.api.load({ text: 'Table old { id int }', intent: store.beginWorkspaceLoad('file'), commitPersistence: commit })
    resetStudioWorkspaceState()
    expect(await loading).toBe(false)
    LoadWorker.instances[0]!.reply()
    expect(commit).not.toHaveBeenCalled()
    expect(mounted.applyDocument).not.toHaveBeenCalled()
    mounted.wrapper.unmount()
  })

  it.each(['import', 'restore'])('preserves a newer history %s when an older backend read completes', async (operation) => {
    const source = ref('Table original {\n id int\n}')
    let files!: ReturnType<typeof usePgmlStudioComputerFiles>
    let history!: ReturnType<typeof usePgmlStudioVersionHistory>
    let finish!: (value: { entry: { id: string, name: string, updatedAt: string }, text: string }) => void
    const pending = new Promise<{ entry: { id: string, name: string, updatedAt: string }, text: string }>((resolve) => {
      finish = resolve
    })
    const wrapper = await mountSuspended(defineComponent({ setup() {
      history = usePgmlStudioVersionHistory({ source, documentName: computed(() => 'Current') })
      const loader = usePgmlDocumentLoader({ documentName: () => 'Current', applyDocument: history.loadPreparedDocument, onError: vi.fn() })
      files = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value, applyLoadedFileText: loader.load,
        fileOperations: { listRecentComputerFiles: async () => [], loadRecentComputerFile: () => pending } })
      return () => null
    } }))
    const version = history.createCheckpoint({ name: 'Base', role: 'design', includeLayout: true })!
    const old = files.loadRecentComputerFileById('old')
    const accepted = operation === 'import'
      ? history.replaceWorkspaceFromImportedSnapshot({ basedOnVersionId: version.id, includeLayout: true, source: 'Table newer_import {\n id int\n}' })
      : history.replaceWorkspaceFromVersion(version.id)
    expect(accepted).toBe(true)
    finish({ entry: { id: 'old', name: 'Old', updatedAt: 'now' }, text: 'Table old_file {\n id int\n}' })
    expect(await old).toBe(false)
    expect(source.value).toContain(operation === 'import' ? 'newer_import' : 'original')
    expect(files.currentComputerFileId.value).toBe(null)
    expect(LoadWorker.instances).toHaveLength(0)
    wrapper.unmount()
  })

  it('awaits real adapter preparation and treats metadata refresh as nonfatal after accepted commit', async () => {
    const store = useStudioSessionStore()
    const source = ref('previous')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    const wrapper = await mountSuspended(defineComponent({ setup() {
      const history = usePgmlStudioVersionHistory({ source, documentName: computed(() => 'Test') })
      const loader = usePgmlDocumentLoader({ documentName: () => 'Test', applyDocument: history.loadPreparedDocument, onError: vi.fn() })
      api = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value, applyLoadedFileText: loader.load,
        fileOperations: {
          loadRecentComputerFile: async () => ({ entry: { id: 'file-A', name: 'A', updatedAt: 'now' }, text: 'Table A { id int }' }),
          listRecentComputerFiles: async () => { throw new Error('Inventory unavailable') }
        } })
      return () => null
    } }))
    const loading = api.loadRecentComputerFileById('file-A')
    await nextTick()
    expect(api.currentComputerFileId.value).toBe(null)
    expect(source.value).toBe('previous')
    LoadWorker.instances[0]!.reply()
    expect(await loading).toBe(true)
    expect(api.currentComputerFileId.value).toBe('file-A')
    expect(source.value).toContain('Table A')
    expect(store.currentSourceKind).toBe('file')
    wrapper.unmount()
  })
})
