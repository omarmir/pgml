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

  return {
    state
  }
}
