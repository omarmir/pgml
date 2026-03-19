import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'

export type StudioSchemaSaveState = 'saved' | 'pending' | 'saving' | 'error'

type StudioSchemaStatusState = {
  detail: string
  name: string
  saveState: StudioSchemaSaveState
}

const defaultStudioSchemaStatusState = (): StudioSchemaStatusState => ({
  detail: '',
  name: '',
  saveState: 'pending'
})

const useSharedStudioSchemaStatus = createSharedComposable(() => {
  const state: Ref<StudioSchemaStatusState> = ref(defaultStudioSchemaStatusState())

  const setStudioSchemaStatus = (nextState: StudioSchemaStatusState) => {
    state.value = nextState
  }

  const clearStudioSchemaStatus = () => {
    state.value = defaultStudioSchemaStatusState()
  }

  return {
    clearStudioSchemaStatus,
    setStudioSchemaStatus,
    state
  }
})

export const useStudioSchemaStatus = () => {
  return useSharedStudioSchemaStatus()
}
