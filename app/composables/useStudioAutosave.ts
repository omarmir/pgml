import { onScopeDispose, type Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'

export const useStudioAutosave = (input: {
  snapshot: Readonly<Ref<string>>
  eligible: Readonly<Ref<boolean>>
  resumeOnSetup: boolean
  save: (snapshot: string) => Promise<unknown>
}) => {
  let active = true
  onScopeDispose(() => {
    active = false
  })
  watchDebounced([input.snapshot, input.eligible], async () => {
    if (active && input.eligible.value) await input.save(input.snapshot.value)
  }, { immediate: input.resumeOnSetup, debounce: 5000, maxWait: 5000 })
}
