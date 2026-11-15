import { computed, readonly, shallowRef, type Ref } from 'vue'

type AsyncOperationState = { kind: 'idle' } | { kind: 'pending', requestId: number } | { kind: 'failed', message: string }
type AsyncOperationResult<T> = { kind: 'applied', value: T } | { kind: 'stale' } | { kind: 'failed' }

export const useAsyncOperation = () => {
  const state: Ref<AsyncOperationState> = shallowRef({ kind: 'idle' })
  let sequence = 0
  const invalidate = () => {
    sequence += 1
    state.value = { kind: 'idle' }
  }
  const fail = (message: string) => {
    sequence += 1
    state.value = { kind: 'failed', message }
  }
  const run = async <T>(options: {
    task: () => Promise<T>
    apply: (value: T) => void
    onError: (error: unknown) => string
  }): Promise<AsyncOperationResult<T>> => {
    const requestId = ++sequence
    state.value = { kind: 'pending', requestId }
    try {
      const value = await options.task()
      if (requestId !== sequence) return { kind: 'stale' }
      options.apply(value)
      state.value = { kind: 'idle' }
      return { kind: 'applied', value }
    } catch (error) {
      if (requestId !== sequence) return { kind: 'stale' }
      state.value = { kind: 'failed', message: options.onError(error) }
      return { kind: 'failed' }
    }
  }
  return {
    state: readonly(state),
    pending: computed(() => state.value.kind === 'pending'),
    error: computed(() => state.value.kind === 'failed' ? state.value.message : null),
    invalidate, fail, run
  }
}
