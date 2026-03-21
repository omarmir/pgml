import { describe, expect, it } from 'vitest'

import { useStudioHeaderActions } from '../../app/composables/useStudioHeaderActions'
import { useStudioSchemaStatus } from '../../app/composables/useStudioSchemaStatus'

describe('studio shared state composables', () => {
  it('stores and clears header actions', () => {
    const { clearStudioHeaderActions, setStudioHeaderActions, state } = useStudioHeaderActions()

    setStudioHeaderActions({
      isLoading: true,
      items: [[{
        label: 'Save'
      }]]
    })

    expect(state.value.isLoading).toBe(true)
    expect(state.value.items[0]?.[0]?.label).toBe('Save')

    clearStudioHeaderActions()

    expect(state.value).toEqual({
      isLoading: false,
      items: []
    })
  })

  it('stores and clears schema status', () => {
    const { clearStudioSchemaStatus, setStudioSchemaStatus, state } = useStudioSchemaStatus()

    setStudioSchemaStatus({
      detail: 'Saved to local storage',
      name: 'Example schema',
      saveState: 'saved'
    })

    expect(state.value).toEqual({
      detail: 'Saved to local storage',
      name: 'Example schema',
      saveState: 'saved'
    })

    clearStudioSchemaStatus()

    expect(state.value).toEqual({
      detail: '',
      name: '',
      saveState: 'pending'
    })
  })
})
