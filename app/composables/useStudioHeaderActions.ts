import type { DropdownMenuItem } from '@nuxt/ui'
import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'

type StudioHeaderActionState = {
  isLoading: boolean
  items: DropdownMenuItem[][]
}

const useSharedStudioHeaderActions = createSharedComposable(() => {
  const state: Ref<StudioHeaderActionState> = ref({
    isLoading: false,
    items: []
  })

  const setStudioHeaderActions = (nextState: StudioHeaderActionState) => {
    state.value = nextState
  }

  const clearStudioHeaderActions = () => {
    state.value = {
      isLoading: false,
      items: []
    }
  }

  return {
    clearStudioHeaderActions,
    setStudioHeaderActions,
    state
  }
})

export const useStudioHeaderActions = () => {
  return useSharedStudioHeaderActions()
}
