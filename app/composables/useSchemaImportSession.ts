import { computed, onScopeDispose, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'

type ImportRequest<Draft, Placement>
  = | { kind: 'reading', draft: Draft }
    | { kind: 'applying', draft: Draft, placement: Placement }
type ImportState<Draft, Placement>
  = | { kind: 'closed' | 'disposed' }
    | { kind: 'editing', draft: Draft, error: string | null }
    | ImportRequest<Draft, Placement>
    | { kind: 'placing', draft: Draft, placement: Placement, error: string | null }
    | { kind: 'closing-source', draft: Draft }
    | { kind: 'closing-placement', draft: Draft, placement: Placement }

export const useSchemaImportSession = <Draft extends { kind: string, text: string, file: File | null }, Placement = never>() => {
  const state: ShallowRef<ImportState<Draft, Placement>> = shallowRef({ kind: 'closed' })
  const draft = computed(() => 'draft' in state.value ? state.value.draft : null)
  const placement = computed(() => 'placement' in state.value ? state.value.placement : null)
  const error = computed(() => 'error' in state.value ? state.value.error : null)
  const isBusy = computed(() => state.value.kind === 'reading' || state.value.kind === 'applying')
  const isOpen = computed(() => state.value.kind === 'editing' || state.value.kind === 'reading')
  const isPlacing = computed(() => state.value.kind === 'placing' || state.value.kind === 'applying')
  const owns = (request: ImportRequest<Draft, Placement>) => state.value === request
  const open = (next: Draft) => {
    if (isBusy.value || state.value.kind === 'disposed') return false
    state.value = { kind: 'editing', draft: next, error: null }
    return true
  }
  const edit = (update: (current: Draft) => Draft) => {
    if (state.value.kind !== 'editing') return
    state.value = { kind: 'editing', draft: update(state.value.draft), error: null }
  }
  const setError = (message: string | null) => {
    if (state.value.kind === 'editing' || state.value.kind === 'placing') state.value = { ...state.value, error: message }
  }
  const close = () => {
    if (state.value.kind === 'editing') state.value = { kind: 'closing-source', draft: state.value.draft }
  }
  const afterLeave = (surface: 'placement' | Draft['kind']) => {
    if ((surface === 'placement' && state.value.kind === 'closing-placement')
      || (state.value.kind === 'closing-source' && state.value.draft.kind === surface)) state.value = { kind: 'closed' }
  }
  const begin = (copy: { conflict: string, missing: string }) => {
    if (state.value.kind !== 'editing') return null
    const captured = { ...state.value.draft }
    if (captured.file !== null && captured.text.trim().length > 0) {
      setError(copy.conflict)
      return null
    }
    if (captured.file === null && captured.text.trim().length === 0) {
      setError(copy.missing)
      return null
    }
    const request: ImportRequest<Draft, Placement> = { kind: 'reading', draft: captured }
    state.value = request
    return request
  }
  const fail = (request: ImportRequest<Draft, Placement>, message: string) => {
    if (!owns(request)) return
    state.value = request.kind === 'reading'
      ? { kind: 'editing', draft: request.draft, error: message }
      : { kind: 'placing', draft: request.draft, placement: request.placement, error: message }
  }
  const complete = (request: ImportRequest<Draft, Placement>) => {
    if (!owns(request)) return false
    state.value = request.kind === 'reading'
      ? { kind: 'closing-source', draft: request.draft }
      : { kind: 'closing-placement', draft: request.draft, placement: request.placement }
    return true
  }
  const place = (request: ImportRequest<Draft, Placement>, next: Placement) => {
    if (!owns(request)) return
    state.value = { kind: 'placing', draft: request.draft, placement: next, error: null }
  }
  const editPlacement = (update: (current: Placement) => Placement) => {
    if (state.value.kind === 'placing') state.value = { ...state.value, placement: update(state.value.placement), error: null }
  }
  const back = () => {
    if (state.value.kind === 'placing') state.value = { kind: 'editing', draft: state.value.draft, error: null }
  }
  const beginApply = () => {
    if (state.value.kind !== 'placing') return null
    const request: ImportRequest<Draft, Placement> = { kind: 'applying', draft: state.value.draft, placement: state.value.placement }
    state.value = request
    return request
  }
  const discard = () => {
    if (state.value.kind !== 'disposed') state.value = { kind: 'closed' }
  }
  onScopeDispose(() => {
    state.value = { kind: 'disposed' }
  })
  return { draft, placement, error, isBusy, isOpen, isPlacing, owns, open, edit, setError, close, afterLeave, begin, fail, complete, place, editPlacement, back, beginApply, discard }
}
