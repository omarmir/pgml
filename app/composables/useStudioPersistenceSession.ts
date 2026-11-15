import { computed, nextTick, readonly, shallowRef, type Ref } from 'vue'

export type BrowserPersistenceTarget = { kind: 'draft', name: string } | {
  kind: 'saved'
  id: string
  name: string
  updatedAt: string
}

export type ComputerPersistenceTarget = { id: string, name: string, updatedAt: string }
export type GistPersistenceTarget = { gistId: string, filename: string, updatedAt: string }

type PersistenceOperation = { kind: 'idle' } | { kind: 'saving', requestId: number } | { kind: 'failed', message: string }
type PersistenceSelection<T> = { kind: 'empty' } | {
  kind: 'selected'
  target: T
  persistedSnapshot: string | null
  hasSavedInSession: boolean
}

type PersistenceState<T> = {
  generation: number
  observedSnapshot: string | null
  operation: PersistenceOperation
  selection: PersistenceSelection<T>
}

export type PersistenceWriteResult<T> = { ok: true, target: T } | { ok: false, message: string }
type PersistenceWriteRequest<T> = {
  target: T
  snapshot: string
  mode: 'manual' | 'autosave'
  isAutosaveEligible?: () => boolean
  write: (target: T, snapshot: string) => PersistenceWriteResult<T> | Promise<PersistenceWriteResult<T>>
  onError: (error: unknown) => string
}

export const useStudioPersistenceSession = <T>() => {
  const state: Ref<PersistenceState<T>> = shallowRef({
    generation: 0,
    observedSnapshot: null,
    operation: { kind: 'idle' },
    selection: { kind: 'empty' }
  })
  let loadSequence = 0
  const beginLoad = () => ++loadSequence
  const ownsLoad = (requestId: number) => requestId === loadSequence
  let requestSequence = 0
  let tail: Promise<boolean> | null = null
  let latestPending: { key: string, promise: Promise<boolean>, owners: PersistenceWriteRequest<T>[] } | null = null

  const clear = () => {
    loadSequence += 1
    state.value = {
      generation: state.value.generation + 1,
      observedSnapshot: null,
      operation: { kind: 'idle' },
      selection: { kind: 'empty' }
    }
  }
  const select = (target: T, persistedSnapshot: string | null) => {
    loadSequence += 1
    state.value = {
      ...state.value,
      generation: state.value.generation + 1,
      operation: { kind: 'idle' },
      selection: { kind: 'selected', target, persistedSnapshot, hasSavedInSession: false }
    }
  }
  const observe = (snapshot: string) => {
    if (state.value.observedSnapshot !== snapshot) {
      state.value = { ...state.value, observedSnapshot: snapshot }
    }
  }
  const fail = (message: string) => {
    state.value = { ...state.value, operation: { kind: 'failed', message } }
  }
  const clearError = () => {
    if (state.value.operation.kind === 'failed') {
      state.value = { ...state.value, operation: { kind: 'idle' } }
    }
  }
  const save = (request: PersistenceWriteRequest<T>): Promise<boolean> => {
    const generation = state.value.generation
    const key = JSON.stringify([generation, request.target, request.mode, request.snapshot])
    if (latestPending !== null && latestPending.key === key) {
      if (!latestPending.owners.includes(request)) latestPending.owners.push(request)
      return latestPending.promise
    }
    const owners = [request]
    const requestId = ++requestSequence
    state.value = { ...state.value, operation: { kind: 'saving', requestId } }
    const execute = async () => {
      if (generation !== state.value.generation) {
        return false
      }
      let result: PersistenceWriteResult<T>
      let executingRequest = request
      try {
        if (request.mode === 'autosave') {
          const eligibleOwner = owners.find(owner => !owner.isAutosaveEligible || owner.isAutosaveEligible())
          if (eligibleOwner === undefined) return false
          executingRequest = eligibleOwner
        }
        if (request.mode === 'autosave' && request.snapshot !== state.value.observedSnapshot) {
          return false
        }
        if (request.mode === 'autosave' && state.value.selection.kind === 'selected'
          && state.value.selection.persistedSnapshot === request.snapshot) {
          return true
        }
        result = await executingRequest.write(executingRequest.target, executingRequest.snapshot)
        await nextTick()
        if (generation !== state.value.generation) {
          return false
        }
        if (!result.ok) {
          if (state.value.operation.kind === 'saving' && state.value.operation.requestId === requestId) {
            fail(result.message)
          }
          return false
        }
        state.value = {
          ...state.value,
          selection: {
            kind: 'selected', target: result.target,
            persistedSnapshot: request.snapshot, hasSavedInSession: true
          }
        }
        return true
      } catch (error) {
        if (generation === state.value.generation && state.value.operation.kind === 'saving'
          && state.value.operation.requestId === requestId) {
          fail(executingRequest.onError(error))
        }
        return false
      } finally {
        if (generation === state.value.generation && state.value.operation.kind === 'saving'
          && state.value.operation.requestId === requestId) {
          state.value = { ...state.value, operation: { kind: 'idle' } }
        }
      }
    }
    const result = tail === null ? execute() : tail.then(execute, execute)
    const completion = result.finally(() => {
      if (latestPending !== null && latestPending.promise === completion) {
        latestPending = null
      }
      if (tail === completion) {
        tail = null
      }
    })
    tail = completion
    latestPending = { key, promise: completion, owners }
    return completion
  }

  const exposedState = readonly(state)
  return {
    state: exposedState,
    selection: computed(() => exposedState.value.selection),
    generation: computed(() => state.value.generation),
    observedSnapshot: computed(() => state.value.observedSnapshot),
    isSaving: computed(() => state.value.operation.kind === 'saving'),
    error: computed(() => state.value.operation.kind === 'failed' ? state.value.operation.message : null),
    persistedSnapshot: computed(() => state.value.selection.kind === 'selected' ? state.value.selection.persistedSnapshot : null),
    hasSavedInSession: computed(() => state.value.selection.kind === 'selected' && state.value.selection.hasSavedInSession),
    beginLoad, ownsLoad, clear, select, observe, fail, clearError, save
  }
}
