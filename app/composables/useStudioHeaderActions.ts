import type { DropdownMenuItem } from '@nuxt/ui'
import { createSharedComposable } from '@vueuse/core'

export type StudioHeaderMenu = {
  icon: string
  id: string
  items: DropdownMenuItem[][]
  label: string
}

type StudioHeaderActionState = {
  isLoading: boolean
  menus: StudioHeaderMenu[]
}

const defaultStudioHeaderActionState = (): StudioHeaderActionState => ({
  isLoading: false,
  menus: []
})

const useSharedStudioHeaderActions = createSharedComposable(() => {
  const state = shallowRef(defaultStudioHeaderActionState())

  const setStudioHeaderActions = (nextState: StudioHeaderActionState) => {
    state.value = nextState
  }

  const clearStudioHeaderActions = () => {
    state.value = defaultStudioHeaderActionState()
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
