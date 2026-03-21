import { storeToRefs } from 'pinia'
import {
  useStudioShellStore,
  type StudioHeaderActionState
} from '~/stores/studio-shell'

export const useStudioHeaderActions = () => {
  const studioShellStore = useStudioShellStore()
  const { headerMenus, isHeaderLoading } = storeToRefs(studioShellStore)
  const state = computed<StudioHeaderActionState>(() => {
    return {
      isLoading: isHeaderLoading.value,
      menus: headerMenus.value
    }
  })

  const setStudioHeaderActions = (nextState: StudioHeaderActionState) => {
    studioShellStore.setHeaderActions(nextState)
  }

  const clearStudioHeaderActions = () => {
    studioShellStore.clearHeaderActions()
  }

  return {
    clearStudioHeaderActions,
    setStudioHeaderActions,
    state
  }
}
