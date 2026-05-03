import type { Ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  useStudioShellStore,
  type StudioSchemaStatusState
} from '~/stores/studio-shell'

export const useStudioSchemaStatus = () => {
  const studioShellStore = useStudioShellStore()
  const {
    schemaStatusAction,
    schemaStatusDetail,
    schemaStatusName,
    schemaStatusSaveState,
    schemaStatusVisible
  } = storeToRefs(studioShellStore)
  const state = computed<StudioSchemaStatusState>(() => {
    return {
      action: schemaStatusAction.value,
      detail: schemaStatusDetail.value,
      name: schemaStatusName.value,
      saveState: schemaStatusSaveState.value,
      visible: schemaStatusVisible.value
    }
  })

  const setStudioSchemaStatus = (nextState: StudioSchemaStatusState) => {
    studioShellStore.setSchemaStatus(nextState)
  }

  const clearStudioSchemaStatus = () => {
    studioShellStore.clearSchemaStatus()
  }

  return {
    clearStudioSchemaStatus,
    setStudioSchemaStatus,
    state: state as Ref<StudioSchemaStatusState>
  }
}
