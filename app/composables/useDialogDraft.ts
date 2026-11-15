import { computed, onScopeDispose, reactive, shallowRef, watch, type ShallowRef, type UnwrapNestedRefs } from 'vue'

type DialogDraftState<T> = { kind: 'closed' } | { kind: 'disposed' }
  | { kind: 'open' | 'saving' | 'closing', draft: T }

export const useDialogDraft = <T extends object>(options: { context?: () => unknown } = {}) => {
  const state: ShallowRef<DialogDraftState<UnwrapNestedRefs<T>>> = shallowRef({ kind: 'closed' })
  const draft = computed(() => state.value.kind === 'closed' || state.value.kind === 'disposed' ? null : state.value.draft)
  const open = (value: T) => {
    if (state.value.kind === 'saving' || state.value.kind === 'disposed') return false
    state.value = { kind: 'open', draft: reactive(value) }
    return true
  }
  const close = () => {
    if (state.value.kind === 'open') state.value = { kind: 'closing', draft: state.value.draft }
  }
  const discard = () => {
    if (state.value.kind === 'open' || state.value.kind === 'saving') state.value = { kind: 'closing', draft: state.value.draft }
  }
  if (options.context) watch(options.context, discard, { flush: 'sync' })
  const updateOpen = (nextOpen: boolean) => {
    if (!nextOpen) close()
  }
  const afterLeave = () => {
    if (state.value.kind === 'closing') state.value = { kind: 'closed' }
  }
  const beginSave = () => {
    if (state.value.kind !== 'open') return null
    const current = state.value.draft
    state.value = { kind: 'saving', draft: current }
    return current
  }
  const completeSave = (current: UnwrapNestedRefs<T>, success: boolean) => {
    if (state.value.kind === 'saving' && state.value.draft === current) {
      state.value = { kind: success ? 'closing' : 'open', draft: current }
    }
  }
  const updateDraft = (patch: Partial<UnwrapNestedRefs<T>>) => {
    if (state.value.kind === 'open') Object.assign(state.value.draft, patch)
  }
  onScopeDispose(() => {
    state.value = { kind: 'disposed' }
  })
  return {
    draft, open, close, discard, updateOpen, afterLeave, beginSave, completeSave, updateDraft,
    isOpen: computed(() => state.value.kind === 'open' || state.value.kind === 'saving'),
    isSaving: computed(() => state.value.kind === 'saving')
  }
}
