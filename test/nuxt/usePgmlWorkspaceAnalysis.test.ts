import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePgmlWorkspaceAnalysis } from '../../app/composables/usePgmlWorkspaceAnalysis'
import { parsePgml } from '../../app/utils/pgml'
import type { PgmlAnalysisWorkerRequest, PgmlAnalysisWorkerResponse } from '../../app/utils/pgml-analysis-worker'

const parser = vi.hoisted(() => ({ initialize: vi.fn() }))
vi.mock('../../app/utils/pgml-executable-parser', async load => ({
  ...await load<typeof import('../../app/utils/pgml-executable-parser')>(),
  initializePgmlExecutableParser: parser.initialize
}))
class AnalysisWorker {
  static instances: AnalysisWorker[] = []
  onmessage: ((event: MessageEvent<PgmlAnalysisWorkerResponse>) => void) | null = null
  onerror: (() => void) | null = null
  requests: PgmlAnalysisWorkerRequest[] = []
  terminate = vi.fn()
  constructor() { AnalysisWorker.instances.push(this) }
  postMessage = (request: PgmlAnalysisWorkerRequest) => { this.requests.push(request) }
  reply = (request: PgmlAnalysisWorkerRequest) => {
    this.onmessage?.(new MessageEvent('message', { data: {
      ...request, diagnostics: [], hasBlockingErrors: false, parsedModel: parsePgml(request.source)
    } }))
  }
}
const mountAnalysis = async () => {
  const source = ref('Table initial {\n  id int\n}')
  let api!: ReturnType<typeof usePgmlWorkspaceAnalysis>
  const wrapper = await mountSuspended(defineComponent({ setup() {
    api = usePgmlWorkspaceAnalysis(source)
    return () => null
  } }))
  return { source, api, wrapper }
}
describe('workspace analysis lifetime', () => {
  beforeEach(() => {
    AnalysisWorker.instances = []
    parser.initialize.mockReset()
    parser.initialize.mockReturnValue(new Promise(() => {}))
    vi.stubGlobal('Worker', AnalysisWorker)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('does not recreate a worker when parser readiness completes after disposal', async () => {
    let ready!: () => void
    parser.initialize.mockReturnValue(new Promise<void>((resolve) => {
      ready = resolve
    }))
    const mounted = await mountAnalysis()
    mounted.wrapper.unmount()
    ready()
    await nextTick()
    expect(AnalysisWorker.instances).toHaveLength(1)
    expect(AnalysisWorker.instances[0]!.terminate).toHaveBeenCalledOnce()
    expect(mounted.api.parserReadyRevision.value).toBe(0)
  })

  it('keeps source/model authority unavailable until the matching analysis result arrives', async () => {
    const mounted = await mountAnalysis()
    const worker = AnalysisWorker.instances[0]!
    expect(mounted.api.isCurrent.value).toBe(false)
    worker.reply(worker.requests[0]!)
    expect(mounted.api.isCurrent.value).toBe(true)
    mounted.source.value = 'Table replacement {\n id int\n new_amount numeric\n}'
    await nextTick()
    expect(mounted.api.isCurrent.value).toBe(false)
    expect(mounted.api.parsedModel.value.tables[0]?.name).toBe('initial')
    worker.reply(worker.requests[1]!)
    expect(mounted.api.isCurrent.value).toBe(true)
    expect(mounted.api.analyzedSource.value).toBe(mounted.source.value)
    expect(mounted.api.parsedModel.value.tables[0]?.columns.some(column => column.name === 'new_amount')).toBe(true)
    mounted.wrapper.unmount()
    expect(mounted.api.isCurrent.value).toBe(false)
  })

  it('ignores stale results and old errors without terminating the replacement worker', async () => {
    const mounted = await mountAnalysis()
    const old = AnalysisWorker.instances[0]!
    const initial = old.requests[0]!
    mounted.source.value = 'Table newest {\n  id int\n}'
    await nextTick()
    old.reply(initial)
    expect(mounted.api.revision.value).toBe(0)
    old.onerror?.()
    expect(mounted.api.revision.value).toBe(mounted.api.requestedRevision.value)
    mounted.source.value = 'Table replacement {\n  id int\n}'
    await nextTick()
    const replacement = AnalysisWorker.instances[1]!
    old.onerror?.()
    expect(replacement.terminate).not.toHaveBeenCalled()
    replacement.reply(replacement.requests[0]!)
    expect(mounted.api.parsedModel.value.tables[0]?.name).toBe('replacement')
    mounted.wrapper.unmount()
    replacement.reply(replacement.requests[0]!)
    expect(replacement.terminate).toHaveBeenCalledOnce()
  })
})
