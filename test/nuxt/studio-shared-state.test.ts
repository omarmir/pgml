import { describe, expect, it } from 'vitest'

import { useStudioHeaderActions } from '../../app/composables/useStudioHeaderActions'
import { useStudioSchemaStatus } from '../../app/composables/useStudioSchemaStatus'

describe('studio shared state composables', () => {
  it('stores and clears header menus', () => {
    const { clearStudioHeaderActions, setStudioHeaderActions, state } = useStudioHeaderActions()

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
    const { clearStudioSchemaStatus, setStudioSchemaStatus, state } = useStudioSchemaStatus()

    setStudioSchemaStatus({
      detail: 'Saved to local storage',
      name: 'Example schema',
      saveState: 'saved',
      visible: true
    })

    expect(state.value).toEqual({
      detail: 'Saved to local storage',
      name: 'Example schema',
      saveState: 'saved',
      visible: true
    })

    clearStudioSchemaStatus()

    expect(state.value).toEqual({
      detail: '',
      name: '',
      saveState: 'pending',
      visible: false
    })
  })
})
