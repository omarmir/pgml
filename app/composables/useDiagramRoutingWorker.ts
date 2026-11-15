import { onScopeDispose } from 'vue'
import type { DiagramGpuConnectionLine } from '~/utils/diagram-gpu-scene'
import type { DiagramRoutingRequest } from '~/utils/diagram-routing-contract'

type PendingRoute = { resolve: (lines: DiagramGpuConnectionLine[]) => void, reject: (error: unknown) => void }
type RoutingLifetime = { kind: 'idle' | 'disposed' }
  | { kind: 'running', worker: Worker, pending: Map<number, PendingRoute> }
type RoutingResponse = { requestId: number, lines: DiagramGpuConnectionLine[] }

export const useDiagramRoutingWorker = () => {
  let state: RoutingLifetime = { kind: 'idle' }
  const release = (next: { kind: 'idle' | 'disposed' }, reason: unknown) => {
    const current = state
    state = next
    if (current.kind !== 'running') return
    current.worker.onmessage = null
    current.worker.onerror = null
    current.worker.terminate()
    current.pending.forEach(request => request.reject(reason))
    current.pending.clear()
  }
  const cancel = () => {
    if (state.kind !== 'disposed') release({ kind: 'idle' }, new Error('Diagram routing cancelled.'))
  }
  const dispose = () => release({ kind: 'disposed' }, new Error('Diagram routing disposed.'))
  const ensureWorker = () => {
    if (state.kind === 'disposed') throw new Error('Diagram routing disposed.')
    if (state.kind === 'running') return state
    const current: Extract<RoutingLifetime, { kind: 'running' }> = {
      kind: 'running', pending: new Map(),
      worker: new Worker(new URL('../workers/diagram-routing.worker.ts', import.meta.url), { type: 'module' })
    }
    state = current
    current.worker.onmessage = (event: MessageEvent<RoutingResponse>) => {
      if (state !== current) return
      const pending = current.pending.get(event.data.requestId)
      if (!pending) return
      current.pending.delete(event.data.requestId)
      pending.resolve(event.data.lines)
    }
    current.worker.onerror = (error) => {
      if (state === current) release({ kind: 'idle' }, error)
    }
    return current
  }
  const route = async (request: DiagramRoutingRequest) => {
    const current = ensureWorker()
    return await new Promise<DiagramGpuConnectionLine[]>((resolve, reject) => {
      current.pending.set(request.requestId, { resolve, reject })
      try {
        current.worker.postMessage(request)
      } catch (error) {
        current.pending.delete(request.requestId)
        reject(error)
      }
    })
  }
  onScopeDispose(dispose)
  return { route, cancel, dispose, isDisposed: () => state.kind === 'disposed' }
}
