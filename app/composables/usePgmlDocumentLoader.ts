import { computed, onScopeDispose, shallowRef, watch, type Ref } from 'vue'
import { useStudioSessionStore, type StudioLoadedTextApplication } from '~/stores/studio-session'
import { preparePgmlDocumentForLoad, type PgmlVersionSetDocument } from '~/utils/pgml-document'
import type { PgmlDocumentLoadWorkerRequest, PgmlDocumentLoadWorkerResponse } from '~/utils/pgml-document-load'

type PreparationResult = { kind: 'loaded', document: PgmlVersionSetDocument } | { kind: 'cancelled' } | { kind: 'failed', message: string }
type PreparationState = { kind: 'idle' } | { kind: 'disposed' }
  | { kind: 'preparing', revision: number, worker: Worker, cancel: () => void }

export const usePgmlDocumentLoader = (input: {
  documentName: () => string
  applyDocument: (document: PgmlVersionSetDocument) => void
  onError: (message: string) => void
}) => {
  const store = useStudioSessionStore()
  const state: Ref<PreparationState> = shallowRef({ kind: 'idle' })
  const isDisposed = () => state.value.kind === 'disposed'
  const cancel = () => {
    if (state.value.kind === 'preparing') state.value.cancel()
  }
  watch(() => store.workspaceLoadRevision, (revision) => {
    if (state.value.kind === 'preparing' && state.value.revision !== revision) cancel()
  }, { flush: 'sync' })
  const prepare = (request: PgmlDocumentLoadWorkerRequest): Promise<PreparationResult> => {
    cancel()
    return new Promise((resolve) => {
      const worker = new Worker(new URL('../workers/pgml-document-load.worker.ts', import.meta.url), { type: 'module' })
      const current = { kind: 'preparing', revision: request.revision, worker, cancel: () => finish({ kind: 'cancelled' }) } satisfies PreparationState
      const finish = (result: PreparationResult) => {
        if (state.value !== current) return
        worker.terminate()
        state.value = { kind: 'idle' }
        resolve(result)
      }
      state.value = current
      worker.onmessage = (event: MessageEvent<PgmlDocumentLoadWorkerResponse>) => {
        if (event.data.revision !== request.revision) return
        finish(event.data.kind === 'loaded' ? { kind: 'loaded', document: event.data.document } : { kind: 'failed', message: event.data.message })
      }
      worker.onerror = () => finish({ kind: 'failed', message: 'Unable to open that PGML document.' })
      worker.postMessage(request)
    })
  }
  const load = async (application: StudioLoadedTextApplication) => {
    if (isDisposed() || !store.ownsWorkspaceLoad(application.intent)) return false
    try {
      const request = { documentName: input.documentName(), rawText: application.text, revision: application.intent.revision }
      const result: PreparationResult = import.meta.client
        ? await prepare(request)
        : { kind: 'loaded', document: preparePgmlDocumentForLoad(request) }
      if (isDisposed() || !store.ownsWorkspaceLoad(application.intent) || result.kind === 'cancelled') return false
      if (result.kind === 'failed') throw new Error(result.message)
      return store.commitWorkspaceLoad(application.intent, () => {
        input.applyDocument(result.document)
        application.commitPersistence()
      })
    } catch (error) {
      if (store.ownsWorkspaceLoad(application.intent) && !isDisposed()) {
        input.onError(error instanceof Error ? error.message : 'Unable to open that PGML document.')
      }
      return false
    } finally {
      if (store.ownsWorkspaceLoad(application.intent) && store.isWorkspaceLoading) store.cancelWorkspaceLoad(application.intent)
    }
  }
  const dispose = () => {
    const preparation = state.value
    cancel()
    state.value = { kind: 'disposed' }
    if (preparation.kind === 'preparing') store.cancelWorkspaceLoad({ revision: preparation.revision, source: 'browser' })
  }
  onScopeDispose(dispose)
  return { load, dispose, isLoading: computed(() => state.value.kind === 'preparing') }
}
