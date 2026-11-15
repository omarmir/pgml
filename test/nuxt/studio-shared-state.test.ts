import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useStudioShellStore } from '../../app/stores/studio-shell'
import { useStudioHeaderActions } from '../../app/composables/useStudioHeaderActions'
import { useStudioSchemaStatus } from '../../app/composables/useStudioSchemaStatus'

describe('studio shared state composables', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores and clears header menus', () => {
    const { state } = useStudioHeaderActions()
    const { clearHeaderActions: clearStudioHeaderActions, setHeaderActions: setStudioHeaderActions } = useStudioShellStore().acquireWorkspaceChrome()

    setStudioHeaderActions({
      isLoading: true,
      menus: [{
        icon: 'i-lucide-file-stack',
        id: 'schema',
        items: [[{
          label: 'Save'
        }]],
        label: 'Schema'
      }]
    })

    expect(state.value.isLoading).toBe(true)
    expect(state.value.menus[0]?.label).toBe('Schema')
    expect(state.value.menus[0]?.items[0]?.[0]?.label).toBe('Save')

    clearStudioHeaderActions()

    expect(state.value).toEqual({
      isLoading: false,
      menus: []
    })
  })

  it('stores and clears schema status', () => {
    const { state } = useStudioSchemaStatus()
    const { clearSchemaStatus: clearStudioSchemaStatus, setSchemaStatus: setStudioSchemaStatus } = useStudioShellStore().acquireWorkspaceChrome()

    setStudioSchemaStatus({
      action: null,
      detail: 'Saved to local storage',
      name: 'Example schema',
      saveState: 'saved',
      visible: true
    })

    expect(state.value).toEqual({
      action: null,
      detail: 'Saved to local storage',
      name: 'Example schema',
      saveState: 'saved',
      visible: true
    })

    clearStudioSchemaStatus()

    expect(state.value).toEqual({
      action: null,
      detail: '',
      name: '',
      saveState: 'pending',
      visible: false
    })
  })
})
