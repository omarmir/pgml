import type { DropdownMenuItem } from '@nuxt/ui'
import { ref, shallowRef, type Ref } from 'vue'
import { defineStore } from 'pinia'

export type StudioHeaderMenu = {
  icon: string
  id: string
  items: DropdownMenuItem[][]
  label: string
}

export type StudioHeaderActionState = {
  isLoading: boolean
  menus: StudioHeaderMenu[]
}

export type StudioSchemaSaveState = 'saved' | 'pending' | 'saving' | 'error'

export type StudioSchemaStatusAction = {
  disabled: boolean
  icon: string
  label: string
  loading: boolean
  onSelect: () => void
}

export type StudioSchemaStatusState = {
  action: StudioSchemaStatusAction | null
  detail: string
  name: string
  saveState: StudioSchemaSaveState
  visible: boolean
}

export const useStudioShellStore = defineStore('studio-shell', () => {
  const headerMenus: Ref<StudioHeaderMenu[]> = shallowRef([])
  const isHeaderLoading: Ref<boolean> = ref(false)
  const schemaStatusDetail: Ref<string> = ref('')
  const schemaStatusName: Ref<string> = ref('')
  const schemaStatusSaveState: Ref<StudioSchemaSaveState> = ref('pending')
  const schemaStatusVisible: Ref<boolean> = ref(false)
  const schemaStatusAction: Ref<StudioSchemaStatusAction | null> = shallowRef(null)

  const setHeaderActions = (nextState: StudioHeaderActionState) => {
    headerMenus.value = nextState.menus
    isHeaderLoading.value = nextState.isLoading
  }

  const clearHeaderActions = () => {
    headerMenus.value = []
    isHeaderLoading.value = false
  }

  const setSchemaStatus = (nextState: StudioSchemaStatusState) => {
    schemaStatusAction.value = nextState.action
    schemaStatusDetail.value = nextState.detail
    schemaStatusName.value = nextState.name
    schemaStatusSaveState.value = nextState.saveState
    schemaStatusVisible.value = nextState.visible
  }

  const clearSchemaStatus = () => {
    schemaStatusAction.value = null
    schemaStatusDetail.value = ''
    schemaStatusName.value = ''
    schemaStatusSaveState.value = 'pending'
    schemaStatusVisible.value = false
  }

  return {
    clearHeaderActions,
    clearSchemaStatus,
    headerMenus,
    isHeaderLoading,
    schemaStatusAction,
    schemaStatusDetail,
    schemaStatusName,
    schemaStatusSaveState,
    schemaStatusVisible,
    setHeaderActions,
    setSchemaStatus
  }
})
