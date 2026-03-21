import type { StudioSchemaSaveState } from '~/stores/studio-shell'

import { useStudioHeaderActions } from './useStudioHeaderActions'
import { useStudioSchemaStatus } from './useStudioSchemaStatus'

export type StudioHeaderSchemaStatusData = {
  detail: string
  state: StudioSchemaSaveState
  visible: boolean
}

export const useStudioHeaderState = () => {
  const { state: studioHeaderActions } = useStudioHeaderActions()
  const { state: studioSchemaStatus } = useStudioSchemaStatus()

  const centerTitle = computed(() => {
    return studioSchemaStatus.value.name.length > 0
      ? studioSchemaStatus.value.name
      : 'Diagram Studio'
  })

  const centerDetail = computed(() => {
    return studioSchemaStatus.value.detail.length > 0
      ? studioSchemaStatus.value.detail
      : 'Local PGML workspace'
  })

  const schemaStatusData = computed<StudioHeaderSchemaStatusData>(() => {
    return {
      detail: studioSchemaStatus.value.detail,
      state: studioSchemaStatus.value.saveState,
      visible: studioSchemaStatus.value.visible
    }
  })

  const headerMenus = computed(() => {
    return studioHeaderActions.value.menus
  })

  const isActionLoading = computed(() => {
    return studioHeaderActions.value.isLoading
  })

  return {
    centerDetail,
    centerTitle,
    headerMenus,
    isActionLoading,
    schemaStatusData
  }
}
