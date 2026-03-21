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

export type StudioSchemaStatusState = {
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

  const setHeaderActions = (nextState: StudioHeaderActionState) => {
    headerMenus.value = nextState.menus
    isHeaderLoading.value = nextState.isLoading
  }

  const clearHeaderActions = () => {
    headerMenus.value = []
    isHeaderLoading.value = false
  }

  const setSchemaStatus = (nextState: StudioSchemaStatusState) => {
    schemaStatusDetail.value = nextState.detail
    schemaStatusName.value = nextState.name
    schemaStatusSaveState.value = nextState.saveState
    schemaStatusVisible.value = nextState.visible
  }

  const clearSchemaStatus = () => {
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
    schemaStatusDetail,
    schemaStatusName,
    schemaStatusSaveState,
    schemaStatusVisible,
    setHeaderActions,
    setSchemaStatus
  }
})
