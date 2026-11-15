import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { parsePgml } from '~/utils/pgml'
import { analyzePgmlDocument } from '~/utils/pgml-language'
import { hasBlockingPgmlDiagnostics, type PgmlAnalysisWorkerResponse } from '~/utils/pgml-analysis-worker'
import { initializePgmlExecutableParser } from '~/utils/pgml-executable-parser'

type AnalysisLifetime = { kind: 'local' } | { kind: 'worker', worker: Worker } | { kind: 'disposed' }

export const usePgmlWorkspaceAnalysis = (source: Ref<string>) => {
  const lifetime: Ref<AnalysisLifetime> = shallowRef({ kind: 'local' })
  const requestedRevision: Ref<number> = ref(0)
  const parserReadyRevision: Ref<number> = ref(0)
  const result: Ref<PgmlAnalysisWorkerResponse> = shallowRef({
    source: source.value, revision: 0, diagnostics: [], hasBlockingErrors: false, parsedModel: parsePgml(source.value)
  })
  const isDisposed = () => lifetime.value.kind === 'disposed'
  const applyLocally = (text: string, revision: number) => {
    if (isDisposed()) return
    const analysis = analyzePgmlDocument(text)
    result.value = { source: text, revision, diagnostics: analysis.diagnostics,
      hasBlockingErrors: hasBlockingPgmlDiagnostics(analysis.diagnostics), parsedModel: parsePgml(text) }
  }
  const ownsWorker = (worker: Worker) => lifetime.value.kind === 'worker' && lifetime.value.worker === worker
  const ensureWorker = () => {
    if (isDisposed() || !import.meta.client) return null
    if (lifetime.value.kind === 'worker') return lifetime.value.worker
    const worker = new Worker(new URL('../workers/pgml-analysis.worker.ts', import.meta.url), { type: 'module' })
    lifetime.value = { kind: 'worker', worker }
    worker.onmessage = (event: MessageEvent<PgmlAnalysisWorkerResponse>) => {
      if (ownsWorker(worker) && event.data.revision === requestedRevision.value && event.data.source === source.value) result.value = event.data
    }
    worker.onerror = () => {
      if (!ownsWorker(worker)) return
      worker.terminate()
      lifetime.value = { kind: 'local' }
      applyLocally(source.value, requestedRevision.value)
    }
    return worker
  }
  const queue = (text: string) => {
    if (isDisposed()) return
    const revision = requestedRevision.value + 1
    requestedRevision.value = revision
    try {
      const worker = ensureWorker()
      if (worker === null) applyLocally(text, revision)
      else worker.postMessage({ source: text, revision })
    } catch {
      if (lifetime.value.kind === 'worker') lifetime.value.worker.terminate()
      lifetime.value = { kind: 'local' }
      applyLocally(text, revision)
    }
  }
  watch(source, queue, { immediate: true })
  if (import.meta.client) {
    void initializePgmlExecutableParser().then(() => {
      if (isDisposed()) return
      parserReadyRevision.value += 1
      queue(source.value)
    }).catch(() => null)
  }
  const dispose = () => {
    if (lifetime.value.kind === 'worker') lifetime.value.worker.terminate()
    lifetime.value = { kind: 'disposed' }
  }
  onScopeDispose(dispose)
  return {
    isCurrent: computed(() => !isDisposed() && result.value.source === source.value && result.value.revision === requestedRevision.value),
    analyzedSource: computed(() => result.value.source),
    diagnostics: computed(() => result.value.diagnostics),
    hasBlockingErrors: computed(() => result.value.hasBlockingErrors),
    parsedModel: computed(() => result.value.parsedModel),
    revision: computed(() => result.value.revision),
    requestedRevision: computed(() => requestedRevision.value),
    parserReadyRevision: computed(() => parserReadyRevision.value),
    dispose
  }
}
